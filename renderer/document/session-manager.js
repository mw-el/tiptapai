import State from '../editor/editor-state.js';
import { parseFile, stringifyFile } from '../frontmatter.js';
import { recordUserSelection, withSystemSelectionChange } from '../editor/selection-manager.js';
import { restoreCheckedParagraphs, restoreSkippedParagraphs } from '../languagetool/paragraph-storage.js';
import { removeAllErrorMarks } from '../languagetool/error-marking.js';
import { showStatus } from '../ui/status.js';
import { applyZoom } from '../ui/zoom.js';
import { stripFrontmatterFromMarkdown } from '../file-management/utils.js';
import { detectRoundtripLoss } from '../utils/markdown-roundtrip.js';
import { escapeHtml, unescapeHtml } from '../utils/html-escape.js';

export async function loadFile(filePath, fileName) {
  console.log('Loading file:', filePath);

  if (
    State.hasUnsavedChanges &&
    State.currentFilePath &&
    State.currentFilePath !== filePath
  ) {
    const confirmSave = confirm(
      'Es gibt ungespeicherte Änderungen.\n\nOK = Speichern und Datei wechseln\nAbbrechen = Wechsel abbrechen'
    );

    if (!confirmSave) {
      showStatus('Dateiwechsel abgebrochen', 'info');
      console.log('File switch aborted due to unsaved changes');
      return { success: false, reason: 'unsaved-abort' };
    }

    await saveFile(false);
  }

  const result = await window.api.loadFile(filePath);

  if (!result.success) {
    console.error('Error loading file:', result.error);
    showStatus(`Fehler: ${result.error}`, 'error');
    return { success: false, reason: 'load-error', error: result.error };
  }

  const { metadata, content } = parseFile(result.content);

  // Escape HTML before passing to TipTap to prevent it from being stripped
  console.log('[Load] Escaping HTML in content before TipTap parsing...');
  const { escapedContent, htmlMap } = escapeHtml(content);
  State.currentHtmlMap = htmlMap;

  const markdownManager = State.currentEditor?.storage?.markdown?.manager;
  const roundtripInfo = detectRoundtripLoss(escapedContent, markdownManager);
  if (roundtripInfo.changed) {
    // Build detailed diff message
    let diffDetails = '';
    if (roundtripInfo.diff) {
      const lineNum = roundtripInfo.diff.index + 1;
      const orig = roundtripInfo.diff.original || '(leer)';
      const trans = roundtripInfo.diff.transformed || '(leer)';
      diffDetails = `\n\nZeile ${lineNum}:\nOriginal:  "${orig}"\nRoundtrip: "${trans}"`;
    }

    const proceed = confirm(
      '⚠️  Warnung: HTML/Markup könnte beim Speichern verändert werden.\n' +
      'TipTap könnte einzelne Tags entfernen oder verändern.' +
      diffDetails +
      '\n\nTrotzdem öffnen?'
    );

    if (!proceed) {
      // Offer fallback: Open in system text editor
      const openExternal = confirm(
        'Datei stattdessen im System-Text-Editor öffnen?\n\n' +
        '(Ubuntu Text-Editor wird geöffnet)'
      );

      if (openExternal) {
        try {
          const openResult = await window.api.openInSystem(filePath);
          if (openResult?.success) {
            showStatus('Im System-Editor geöffnet', 'info');
          } else {
            showStatus('Fehler beim Öffnen: ' + (openResult?.error || 'Unbekannt'), 'error');
          }
        } catch (error) {
          console.error('Error opening in system editor:', error);
          showStatus('Fehler beim Öffnen im System-Editor', 'error');
        }
      } else {
        showStatus('Dateiöffnung abgebrochen', 'info');
      }

      return { success: false, reason: 'roundtrip-cancelled' };
    }
  }
  State.currentFileMetadata = metadata;
  State.currentFilePath = filePath;
  State.paragraphsNeedingCheck = new Set();
  State.initialCheckCompleted = false;

  await window.api.addRecentFile(filePath);

  State.activeErrors.clear();
  State.appliedCorrections = [];
  removeAllErrorMarks(State.currentEditor);

  // Load escaped content into TipTap
  State.currentEditor.commands.setContent(escapedContent, { contentType: 'markdown' });
  State.hasUnsavedChanges = false;
  recordUserSelection(State.currentEditor, { registerInteraction: false });

  setTimeout(() => {
    try {
      restoreCheckedParagraphs();
      restoreSkippedParagraphs();
    } catch (error) {
      console.warn('Could not restore checked paragraphs:', error);
    }
  }, 50);

  const lastPosition = metadata.TT_lastPosition || metadata.lastPosition;
  if (lastPosition && lastPosition > 0) {
    setTimeout(() => {
      try {
        withSystemSelectionChange(() => {
          State.currentEditor.commands.setTextSelection(lastPosition);
        });
        recordUserSelection(State.currentEditor, { registerInteraction: false });
      } catch (error) {
        console.warn('Could not restore position:', error);
      }
    }, 10);
  }

  const zoomLevel = metadata.TT_zoomLevel || metadata.zoomLevel;
  if (zoomLevel && zoomLevel > 0) {
    State.currentZoomLevel = zoomLevel;
    applyZoom();
  }

  const scrollPosition = metadata.TT_scrollPosition || metadata.scrollPosition;
  if (scrollPosition && scrollPosition > 0) {
    setTimeout(() => {
      const editorElement = document.querySelector('#editor');
      if (editorElement) {
        editorElement.scrollTop = scrollPosition;
      }
    }, 20);
  }

  await window.api.setWindowTitle(fileName);

  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = fileName;
  }

  const language = metadata.language || 'de-CH';
  document.querySelector('#language-selector').value = language;
  State.currentEditor.view.dom.setAttribute('lang', language);
  State.currentEditor.view.dom.setAttribute('spellcheck', 'false');

  // Start file watcher for external changes
  await window.fileWatcher.watch(filePath);

  return { success: true, language };
}

export async function saveFile(isAutoSave = false) {
  if (!State.currentFilePath) {
    alert('Keine Datei geladen!');
    return { success: false };
  }

  // Get markdown from TipTap (contains placeholders)
  const markdownWithPlaceholders = stripFrontmatterFromMarkdown(State.currentEditor.getMarkdown());

  // Unescape HTML: replace placeholders with original HTML
  console.log('[Save] Unescaping HTML placeholders...');
  const markdown = unescapeHtml(markdownWithPlaceholders, State.currentHtmlMap);

  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement ? editorElement.scrollTop : 0;

  const totalCharacters = markdown.length;
  const totalWords = markdown.trim().split(/\s+/).filter(w => w.length > 0).length;

  const updatedMetadata = {
    ...State.currentFileMetadata,
    TT_lastEdit: new Date().toISOString(),
    TT_lastPosition: State.currentEditor.state.selection.from,
    TT_zoomLevel: State.currentZoomLevel,
    TT_scrollPosition: scrollTop,
    TT_totalWords: totalWords,
    TT_totalCharacters: totalCharacters,
    TT_checkedRanges: State.currentFileMetadata.TT_checkedRanges || State.currentFileMetadata.checkedRanges || [],
  };

  const fileContent = stringifyFile(updatedMetadata, markdown);
  const result = await window.api.saveFile(State.currentFilePath, fileContent);

  if (!result.success) {
    alert('Fehler beim Speichern: ' + result.error);
    return { success: false, error: result.error };
  }

  State.currentFileMetadata = updatedMetadata;
  State.hasUnsavedChanges = false;

  if (isAutoSave) {
    showStatus('Gespeichert', 'saved');
    setTimeout(() => showStatus(''), 2000);
  } else {
    const saveBtn = document.querySelector('#save-btn');
    if (saveBtn) {
      saveBtn.classList.add('saving');
    }
    showStatus('Gespeichert', 'saved');
    setTimeout(() => {
      if (saveBtn) {
        saveBtn.classList.remove('saving');
        saveBtn.classList.add('saved');
      }
      showStatus('');
    }, 800);
  }

  return { success: true };
}
