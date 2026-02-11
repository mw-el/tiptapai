import State from '../editor/editor-state.js';
import { parseFile, stringifyFile } from '../frontmatter.js';
import { recordUserSelection, withSystemSelectionChange } from '../editor/selection-manager.js';
import { restoreCheckedParagraphs, restoreSkippedParagraphs } from '../languagetool/paragraph-storage.js';
import { removeAllErrorMarks } from '../languagetool/error-marking.js';
import { showStatus } from '../ui/status.js';
import { applyZoom } from '../ui/zoom.js';
import { stripFrontmatterFromMarkdown } from '../file-management/utils.js';
import { detectRoundtripLoss } from '../utils/markdown-roundtrip.js';

async function updateLastKnownDiskStats(filePath) {
  if (!filePath || !window.api?.statFile) {
    return;
  }

  try {
    const statResult = await window.api.statFile(filePath);
    if (statResult?.success && statResult.stats) {
      State.lastKnownFileMtimeMs = statResult.stats.mtimeMs;
      State.lastKnownFileSize = statResult.stats.size;
    } else {
      console.warn('Could not read file stats:', statResult?.error || 'Unbekannter Fehler');
    }
  } catch (error) {
    console.warn('Could not read file stats:', error);
  }
}

async function detectExternalChange(filePath) {
  if (!filePath || !window.api?.statFile) {
    return { changed: false };
  }

  if (State.lastKnownFileMtimeMs == null || State.lastKnownFileSize == null) {
    return { changed: false };
  }

  const statResult = await window.api.statFile(filePath);
  if (!statResult?.success || !statResult.stats) {
    return { changed: true, reason: 'stat-error', error: statResult?.error };
  }

  const { mtimeMs, size } = statResult.stats;

  // Quick check: if mtime and size unchanged, definitely no external change
  if (mtimeMs === State.lastKnownFileMtimeMs && size === State.lastKnownFileSize) {
    return { changed: false, mtimeMs, size };
  }

  // mtime or size changed - verify with content comparison to avoid false positives
  // (e.g., filesystem lag after our own save operation)
  try {
    const diskResult = await window.api.loadFile(filePath);
    if (!diskResult?.success || !diskResult.content) {
      return { changed: true, reason: 'content-read-error' };
    }

    const currentContent = stringifyFile(
      State.currentFileMetadata,
      stripFrontmatterFromMarkdown(State.currentEditor.getMarkdown())
    );

    // Compare actual content - only warn if truly different
    const changed = diskResult.content.trim() !== currentContent.trim();

    return { changed, mtimeMs, size, reason: changed ? 'content-differs' : 'mtime-only' };
  } catch (error) {
    console.error('Error comparing file content:', error);
    return { changed: true, reason: 'comparison-error', error: error.message };
  }
}

function hasMeaningfulContent(doc) {
  if (!doc) {
    return false;
  }

  let hasContent = false;

  doc.descendants((node) => {
    if (node.isText && node.text?.trim()) {
      hasContent = true;
      return false;
    }

    if (node.type?.name === 'protectedInline' || node.type?.name === 'protectedBlock') {
      hasContent = true;
      return false;
    }

    if (node.type?.name === 'image' || node.type?.name === 'hardBreak' || node.type?.name === 'horizontalRule') {
      hasContent = true;
      return false;
    }

    return true;
  });

  return hasContent;
}

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

  const markdownManager = State.currentEditor?.storage?.markdown?.manager;
  const roundtripInfo = detectRoundtripLoss(content, markdownManager);
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
  State.activeErrors.clear();
  State.appliedCorrections = [];
  removeAllErrorMarks(State.currentEditor);

  // Load raw content into TipTap
  State.currentHtmlMap = new Map();
  State.currentEditor.commands.setContent(content, { contentType: 'markdown' });

  const originalHasContent = /\S/.test(content || '');
  const loadedHasContent = hasMeaningfulContent(State.currentEditor.state.doc);

  if (originalHasContent && !loadedHasContent) {
    console.error('Loaded document is empty despite non-empty source. Aborting to prevent data loss.');
    showStatus('Fehler: Inhalt konnte nicht geladen werden (Schutz vor Datenverlust).', 'error');
    return { success: false, reason: 'empty-content-load' };
  }

  await updateLastKnownDiskStats(filePath);

  State.currentFileMetadata = metadata;
  State.currentFilePath = filePath;
  State.paragraphsNeedingCheck = new Set();
  State.initialCheckCompleted = false;

  await window.api.addRecentFile(filePath);

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

  const externalCheck = await detectExternalChange(State.currentFilePath);
  if (externalCheck.changed) {
    if (isAutoSave) {
      showStatus('Externe Änderung erkannt – Auto-Save pausiert', 'error');
      return { success: false, reason: 'external-change' };
    }

    const fileName = State.currentFilePath.split('/').pop();
    const reload = confirm(
      `Die Datei "${fileName}" wurde extern geändert.\n\n` +
      'OK = Externe Version laden (lokale Änderungen verwerfen)\n' +
      'Abbrechen = Speichern abbrechen'
    );

    if (reload) {
      await loadFile(State.currentFilePath, fileName);
    } else {
      showStatus('Speichern abgebrochen', 'info');
    }

    return { success: false, reason: 'external-change' };
  }

  // Get markdown from TipTap
  const markdown = stripFrontmatterFromMarkdown(State.currentEditor.getMarkdown());

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

  // Pause file watcher during our own save to prevent false "external change" detection
  await window.fileWatcher.unwatch();

  const result = await window.api.saveFile(State.currentFilePath, fileContent);

  if (!result.success) {
    alert('Fehler beim Speichern: ' + result.error);
    // Restart watcher even on failure
    await window.fileWatcher.watch(State.currentFilePath);
    return { success: false, error: result.error };
  }

  // Small delay to ensure filesystem has fully committed the write
  await new Promise(resolve => setTimeout(resolve, 50));

  await updateLastKnownDiskStats(State.currentFilePath);
  State.currentFileMetadata = updatedMetadata;
  State.hasUnsavedChanges = false;

  // Restart file watcher after our save is complete
  await window.fileWatcher.watch(State.currentFilePath);

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
