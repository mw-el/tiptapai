// TipTap AI - Renderer Process
// Sprint 1.1: File Operations

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { DOMSerializer } from 'prosemirror-model';
import { LanguageToolMark } from './languagetool-mark.js';
import { LanguageToolIgnoredMark } from './languagetool/ignored-mark.js';
import { CheckedParagraphMark } from './checked-paragraph-mark.js';
import { generateParagraphId } from './utils/hash.js';
import { normalizeWord } from './utils/word-normalizer.js';
import State from './editor/editor-state.js';
import { showStatus, updateLanguageToolStatus } from './ui/status.js';
import { refreshErrorNavigation } from './ui/error-list-widget.js';
import { updateTOC } from './ui/table-of-contents.js';
import {
  restoreCheckedParagraphs,
  removeAllCheckedParagraphMarks,
  removeSkippedParagraph,
  isParagraphSkipped,
  restoreSkippedParagraphs,
  getAllParagraphs,
  getDocumentTextForCheck
} from './languagetool/paragraph-storage.js';
import { removeAllErrorMarks } from './languagetool/error-marking.js';
import {
  applyCorrectionToEditor,
  removeErrorMarksForWord as removeErrorMarksForWordCentral
} from './languagetool/correction-applier.js';
import { applyZoom } from './ui/zoom.js';
import { showProgress, updateProgress, hideProgress, showCompletion } from './ui/progress-indicator.js';
import { showMetadata } from './ui/metadata-viewer.js';
import { initFindReplace, showFindReplace } from './ui/find-replace.js';
import { showInputModal } from './ui/input-modal.js';
import { initRecentItems } from './ui/recent-items.js';
import { initZoomControls } from './ui/zoom-controls.js';
import { showExportDialog } from './ui/export-dialog.js';
import { showHtmlEditorModal } from './ui/html-editor-modal.js';
import { stringifyFile, parseFile } from './frontmatter.js';
import { stripFrontmatterFromMarkdown } from './file-management/utils.js';
import {
  ProtectedInline,
  ProtectedBlock,
  ShortcodeInlineTokenizer,
  ShortcodeBlockTokenizer,
  HtmlEntityTokenizer
} from './editor/protected-markup.js';
import { PageBreak } from './editor/page-break.js';
import { ColumnBreak } from './editor/column-break.js';
import { HtmlImageBlock } from './editor/html-image-block.js';
import { HtmlMediaBlock } from './editor/html-media-block.js';
import { HtmlPreviewBlock } from './editor/html-preview-block.js';
import { registerCLIFileOpen, loadInitialState as bootstrapInitialState } from './bootstrap/initial-load.js';
import { initContextMenu, closeContextMenu } from './ui/context-menu.js';
import {
  getParagraphInfoAtPosition,
  getParagraphInfoForSelection,
  getParagraphInfosFromSelection,
  isFrontmatterParagraph
} from './editor/paragraph-info.js';
import { cleanupParagraphAfterUserEdit } from './editor/paragraph-change-handler.js';
import { recordUserSelection, restoreUserSelection, withSystemSelectionChange } from './editor/selection-manager.js';
import {
  runSmartInitialCheck,
  cancelBackgroundCheck,
  checkParagraphDirect,
  isCheckRunning
} from './document/viewport-checker.js';
import { loadFile as loadDocument, saveFile } from './document/session-manager.js';
import { createFileOperations } from './file-management/file-operations.js';
import { initServerStatusCheck, isServerReady, requireServer } from './languagetool/server-status.js';
import { initClaudeHelpModal, showClaudeHelp } from './claude/help-modal.js';
import { initSkillsModal } from './claude/skills-modal.js';
import {
  initTerminal,
  showTerminal,
  hideTerminal,
  disposeTerminal,
  scheduleEditContextRefresh
} from './claude/terminal-panel.js';

console.log('Renderer Process geladen - Sprint 1.2 + Integriertes Terminal');

// LanguageTool Server-Status-Check starten
initServerStatusCheck();

// Claude Help Modal initialisieren
initClaudeHelpModal();

// Skill Repository Modal initialisieren
initSkillsModal();

// Integriertes Terminal initialisieren und sofort anzeigen
initTerminal();
showTerminal();

function scheduleAutoSave(delay = 2000) {
  clearTimeout(State.autoSaveTimer);
  State.autoSaveTimer = setTimeout(() => {
    if (State.currentFilePath) {
      showStatus('Speichert...', 'saving');
      saveFile(true);
    }
  }, delay);
}

async function runViewportCheck({ maxWords = Infinity, startFromBeginning = false, autoSave = false } = {}) {
  if (!State.currentEditor || !State.currentFilePath) {
    console.warn('No file loaded or editor not ready');
    return;
  }

  if (!isServerReady()) {
    console.warn('⏳ LanguageTool-Server nicht bereit, Check wird übersprungen');
    State.initialCheckCompleted = true;
    return;
  }

  showProgress();

  try {
    let totalChecked = 0;

    await runSmartInitialCheck(
      State.currentEditor,
      (current, total) => {
        totalChecked = current;
        updateProgress(current, total);
      },
      () => {
        showCompletion(totalChecked);
        State.initialCheckCompleted = true;
        refreshErrorNavigation({ preserveSelection: false });

        if (autoSave) {
          setTimeout(() => {
            saveFile(true);
          }, 1000);
        }
      },
      {
        startFromBeginning,
        maxWords
      }
    );
    State.initialCheckCompleted = true;
    refreshErrorNavigation({ preserveSelection: false });
  } catch (error) {
    console.error('❌ Error during background check:', error);
    hideProgress();
    showStatus('Fehler bei der Prüfung', 'error');
  }
}

async function recheckParagraphForErrorData(errorData) {
  if (!errorData || !State.languageToolEnabled) {
    return;
  }

  const paragraphInfo = getParagraphInfoAtPosition(errorData.from);
  if (!paragraphInfo || isParagraphSkipped(paragraphInfo.text)) {
    return;
  }

  try {
    await checkParagraphDirect(paragraphInfo);
  } catch (error) {
    console.error('❌ Error while rechecking paragraph after resolving error:', error);
  }
}

async function triggerParagraphCheckForSelection(previousSelection) {
  if (!State.languageToolEnabled || !State.initialCheckCompleted) {
    return;
  }

  const paragraphInfo = getParagraphInfoForSelection(previousSelection);
  if (!paragraphInfo) {
    return;
  }

  if (isParagraphSkipped(paragraphInfo.text)) {
    return;
  }

  if (!State.paragraphsNeedingCheck || !State.paragraphsNeedingCheck.has(paragraphInfo.from)) {
    return;
  }

  State.paragraphsNeedingCheck.delete(paragraphInfo.from);

  try {
    await checkParagraphDirect(paragraphInfo);
  } catch (error) {
    console.error('❌ Error during paragraph re-check:', error);
  }
}

async function checkParagraphsProgressively(maxWords = 2000, startFromBeginning = false) {
  return runViewportCheck({
    maxWords,
    startFromBeginning,
    autoSave: startFromBeginning && maxWords === Infinity
  });
}

// TipTap Editor initialisieren
const editor = new Editor({
  element: document.querySelector('#editor'),
  editable: true,
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    Image.configure({ inline: true, allowBase64: true }),
    Markdown.configure({
      html: true,
      tightLists: true,
      transformPastedText: true,
      transformCopiedText: true,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    // Specific HTML renderers – must be listed BEFORE ProtectedInline/ProtectedBlock
    // so their parseMarkdown() gets priority for matching block html tokens.
    HtmlImageBlock,
    HtmlMediaBlock,
    HtmlPreviewBlock,
    ProtectedInline,
    ProtectedBlock,
    ShortcodeInlineTokenizer,
    ShortcodeBlockTokenizer,
    HtmlEntityTokenizer,
    PageBreak,
    ColumnBreak,
    LanguageToolMark,
    LanguageToolIgnoredMark,
    CheckedParagraphMark,
  ],
  content: `
    <h2>Willkommen zu TipTap AI!</h2>
    <p>Klicke auf den Ordner-Button oben links, um eine Markdown-Datei zu öffnen.</p>
  `,
  editorProps: {
    attributes: {
      class: 'tiptap-editor',
      spellcheck: 'false',
      lang: 'de-CH',
    },
    handleClick(view, pos, event) {
      if (event.button !== 0) {
        return false;
      }

      if (State.lastHtmlPlaceholderClick && Date.now() - State.lastHtmlPlaceholderClick < 500) {
        console.log('[HTML Placeholder] Click throttled (too fast)');
        return false;
      }

      const { doc } = view.state;
      const $pos = doc.resolve(pos);
      const node = $pos.parent;

      const textContent = node.textContent;
      const offsetInNode = $pos.parentOffset;

      const placeholderRegex = /XHTMLX\d+X/g;
      let match;

      while ((match = placeholderRegex.exec(textContent)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        if (offsetInNode >= matchStart && offsetInNode <= matchEnd) {
          const placeholder = match[0];
          console.log('[HTML Placeholder] Clicked on:', placeholder);

          State.lastHtmlPlaceholderClick = Date.now();

          setTimeout(() => {
            try {
              showHtmlEditorModal(placeholder, pos);
            } catch (error) {
              console.error('[HTML Placeholder] Error opening modal:', error);
            }
          }, 0);

          return false;
        }
      }

      return false;
    },
  },
  onUpdate: ({ editor, transaction }) => {
    if (State.isApplyingLanguageToolMarks) {
      return;
    }

    if (!transaction.docChanged) {
      return;
    }

    cleanupParagraphAfterUserEdit(editor, saveFile);
    recordUserSelection(editor);

    clearTimeout(State.autoSaveTimer);

    showStatus('Ungespeichert (Auto-Save in 5 Min)', 'unsaved');
    State.hasUnsavedChanges = true;

    State.autoSaveTimer = setTimeout(() => {
      if (State.currentFilePath) {
        showStatus('Speichert...', 'saving');
        saveFile(true);
      }
    }, 300000);

    scheduleEditContextRefresh();
    updateTOC(editor);
  },

  onSelectionUpdate: ({ editor }) => {
    if (State.selectionChangeDepth > 0) {
      return;
    }

    const previousSelection = State.lastUserSelection;
    recordUserSelection(editor);

    if (previousSelection) {
      triggerParagraphCheckForSelection(previousSelection);
    }

    updateTOC(editor);
  },
});

State.currentEditor = editor;
recordUserSelection(editor, { registerInteraction: false });
console.log('TipTap Editor initialisiert');

// Global focus recovery
{
  const editorContainer = document.querySelector('#editor');
  if (editorContainer) {
    editorContainer.addEventListener('mousedown', (event) => {
      if (event.target.closest('.tiptap-editor')) {
        requestAnimationFrame(() => {
          State.currentEditor.commands.focus();
        });
      }
    }, true);
  }
}

// File laden
async function loadFile(filePath, fileName) {
  const result = await loadDocument(filePath, fileName);

  if (!result || !result.success) {
    return;
  }

  setTimeout(() => {
    runViewportCheck({
      startFromBeginning: false,
      maxWords: Infinity,
      autoSave: true
    });
  }, 100);

  // TOC aktualisieren
  const tocPanel = document.getElementById('toc-panel');
  if (tocPanel && !tocPanel.classList.contains('hidden')) {
    updateTOC(State.currentEditor);
  }

  console.log('File loaded successfully, language:', result.language);
}

const {
  openFile,
  createNewFile,
  newUntitledFile,
  saveFileAs,
  renameFile,
  deleteFile,
} = createFileOperations({
  showInputModal,
  showStatus,
  loadFile,
});

// Sprache setzen
function setDocumentLanguage(langCode) {
  if (!State.currentFilePath) {
    console.warn('No file loaded');
    return;
  }

  const editorDom = State.currentEditor.view.dom;
  editorDom.setAttribute('lang', langCode);
  editorDom.setAttribute('spellcheck', 'false');

  State.currentFileMetadata.language = langCode;

  showStatus('Sprache geändert...', 'saving');
  setTimeout(() => {
    saveFile(true);
  }, 500);
}

async function runLanguageToolCheck(isAutoCheck = false) {
  if (!State.currentEditor) {
    console.warn('No editor available');
    return;
  }

  return await runViewportCheck({
    maxWords: Infinity,
    startFromBeginning: true,
    autoSave: !isAutoCheck,
  });
}

// LanguageTool Toggle Button
document.querySelector('#languagetool-toggle').addEventListener('click', toggleLanguageTool);

// New File Button
document.querySelector('#new-file-btn')?.addEventListener('click', newUntitledFile);

// Open File Dropdown
(function () {
  const openBtn = document.querySelector('#open-file-btn');
  const fileDropdown = document.querySelector('#file-dropdown');
  if (!openBtn || !fileDropdown) return;

  openBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isHidden = fileDropdown.classList.contains('hidden');
    if (isHidden) {
      await loadFileDropdownItems();
      fileDropdown.classList.remove('hidden');
    } else {
      fileDropdown.classList.add('hidden');
    }
  });

  fileDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('[data-action]');
    if (item?.dataset.action === 'open-file') {
      fileDropdown.classList.add('hidden');
      openFile();
    }
  });

  document.addEventListener('click', (e) => {
    if (!fileDropdown.contains(e.target) && e.target !== openBtn) {
      fileDropdown.classList.add('hidden');
    }
  });
})();

async function loadFileDropdownItems() {
  const listEl = document.querySelector('#recent-items-list');
  if (!listEl) return;

  const result = await window.api.getRecentItems();
  if (!result.success || !result.items?.length) {
    listEl.innerHTML = '<div class="toolbar-dropdown-empty">Keine kürzlichen Dateien</div>';
    return;
  }

  listEl.innerHTML = result.items.map(item => {
    const icon = item.type === 'file' ? 'description' : 'folder';
    return `<button class="toolbar-dropdown-item recent-file-item" data-type="${item.type}" data-path="${item.path}" title="${item.path}">
      <span class="material-icons">${icon}</span>${item.name}
    </button>`;
  }).join('');

  listEl.querySelectorAll('.recent-file-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelector('#file-dropdown').classList.add('hidden');
      if (btn.dataset.type === 'file') {
        await loadFile(btn.dataset.path, btn.dataset.path.split('/').pop());
      }
    });
  });
}

// Language Dropdown
(function () {
  const langBtn = document.querySelector('#language-btn');
  const langDropdown = document.querySelector('#language-dropdown');
  const langLabel = document.querySelector('#language-label');
  if (!langBtn || !langDropdown) return;

  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('hidden');
  });

  langDropdown.querySelectorAll('.lang-item').forEach(item => {
    item.addEventListener('click', () => {
      const lang = item.dataset.lang;
      setDocumentLanguage(lang);
      if (langLabel) langLabel.textContent = lang.toUpperCase();
      if (langBtn) langBtn.dataset.currentLang = lang;
      langDropdown.classList.add('hidden');
    });
  });

  // Set initial value
  if (langBtn) langBtn.dataset.currentLang = 'de-CH';

  document.addEventListener('click', (e) => {
    if (!langDropdown.contains(e.target) && e.target !== langBtn) {
      langDropdown.classList.add('hidden');
    }
  });
})();

// Save As Button
document.querySelector('#save-as-btn').addEventListener('click', saveFileAs);

// Export Button
document.querySelector('#export-btn').addEventListener('click', showExportDialog);

// TOC Toggle Button (Sidebar-Kopfzeile)
// TOC-Toggle-Button (Sidebar-Header): zeigt/versteckt das gesamte TOC-Panel
document.querySelector('#toc-toggle-btn')?.addEventListener('click', () => {
  const tocPanel = document.getElementById('toc-panel');
  if (!tocPanel) return;

  const isHidden = tocPanel.classList.toggle('hidden');
  if (!isHidden && State.currentEditor) {
    updateTOC(State.currentEditor);
  }
});

// TOC-Header (innerhalb des Panels): klappt den Inhalt ein/aus
document.querySelector('#toc-header')?.addEventListener('click', () => {
  const tocPanel = document.getElementById('toc-panel');
  if (!tocPanel) return;
  tocPanel.classList.toggle('collapsed');
});

// ============================================
// Editor Toolbar Buttons
// ============================================

document.querySelector('#heading-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = document.querySelector('#heading-dropdown');
  dropdown.classList.toggle('hidden');
});

document.querySelectorAll('#heading-dropdown button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const level = parseInt(e.target.getAttribute('data-level'));
    const { state } = State.currentEditor;
    const { $from, $to } = state.selection;

    const $paraStart = state.doc.resolve($from.before());
    const $paraEnd = state.doc.resolve($to.after());

    if (level === 0) {
      State.currentEditor.chain()
        .focus()
        .setTextSelection({ from: $paraStart.pos, to: $paraEnd.pos })
        .setParagraph()
        .run();
    } else {
      State.currentEditor.chain()
        .focus()
        .setTextSelection({ from: $paraStart.pos, to: $paraEnd.pos })
        .toggleHeading({ level })
        .run();
    }

    setTimeout(() => {
      applyZoom();
    }, 10);

    document.querySelector('#heading-dropdown').classList.add('hidden');
  });
});

document.querySelector('#code-btn').addEventListener('click', () => {
  showRawMarkdown();
});

document.querySelector('#shortcuts-btn').addEventListener('click', () => {
  document.getElementById('shortcuts-modal').classList.add('active');
});

document.addEventListener('click', (e) => {
  const dropdown = document.querySelector('#heading-dropdown');
  const headingBtn = document.querySelector('#heading-btn');

  if (!dropdown.contains(e.target) && !headingBtn.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

function toggleLanguageTool() {
  State.languageToolEnabled = !State.languageToolEnabled;

  const btn = document.querySelector('#languagetool-toggle');

  if (State.languageToolEnabled) {
    btn.classList.add('active');
    btn.setAttribute('title', 'LanguageTool ein (klicken zum Ausschalten)');
    console.log('LanguageTool aktiviert');
  } else {
    btn.classList.remove('active');
    btn.setAttribute('title', 'LanguageTool aus (klicken zum Einschalten)');
    console.log('LanguageTool deaktiviert');
    cancelBackgroundCheck();
    removeAllErrorMarks(State.currentEditor);
    removeAllCheckedParagraphMarks();
    State.activeErrors.clear();
    State.paragraphsNeedingCheck = new Set();
    refreshErrorNavigation({ preserveSelection: false });
    hideProgress();
    updateLanguageToolStatus('', '');
  }
}

const editorElement = document.querySelector('#editor');

if (editorElement) {
  editorElement.addEventListener('mousedown', handleLanguageToolClick);
  editorElement.addEventListener('mouseover', handleLanguageToolHover);
  editorElement.addEventListener('mouseout', handleLanguageToolMouseOut);

  initContextMenu({
    editorElement,
    onCheckParagraph: () => checkCurrentParagraph(),
    runLanguageToolCheck,
    removeTooltip: () => {
      if (typeof window.removeTooltip === 'function') {
        window.removeTooltip();
      }
    }
  });
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile(false);
  }
});

// Toggle Sidebar
let sidebarVisible = true;
document.querySelector('#toggle-sidebar-btn').addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  const appLayout = document.querySelector('.app-layout');

  sidebarVisible = !sidebarVisible;

  if (sidebarVisible) {
    sidebar.classList.remove('hidden');
    appLayout.classList.remove('sidebar-hidden');
  } else {
    sidebar.classList.add('hidden');
    appLayout.classList.add('sidebar-hidden');
  }
});

window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.remove('active');
};

function escapeHtmlForModal(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractChangedRightLineNumbersFromUnifiedDiff(diffText = '') {
  const changed = new Set();
  const lines = String(diffText || '').split(/\r?\n/);
  let rightLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      rightLine = Number(hunkMatch[1]) || 0;
      continue;
    }

    if (!rightLine) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      changed.add(rightLine);
      rightLine += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      rightLine += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }
  }

  return changed;
}

function renderMarkdownLinesHtml(text = '', { highlightLineNumbers = null } = {}) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.map((line, index) => {
    const lineNo = index + 1;
    const isHighlighted = Boolean(highlightLineNumbers?.has(lineNo));
    const safeLine = escapeHtmlForModal(line).replace(/ /g, '&nbsp;');
    return `
      <div class="external-diff-line${isHighlighted ? ' external-changed' : ''}">
        <span class="external-diff-line-no">${lineNo}</span>
        <span class="external-diff-line-text">${safeLine || '&nbsp;'}</span>
      </div>
    `;
  }).join('');
}

function showSideBySideDiffModal({
  title,
  subtitle,
  localText,
  externalText,
  diffText,
  externalChangedLines,
}) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal active';

    const safeTitle = escapeHtmlForModal(title || 'Unterschiede');
    const safeSubtitle = escapeHtmlForModal(subtitle || '');
    const leftHtml = renderMarkdownLinesHtml(localText);
    const rightHtml = renderMarkdownLinesHtml(externalText, {
      highlightLineNumbers: externalChangedLines,
    });

    modal.innerHTML = `
      <div class="modal-content external-diff-modal-content">
        <div class="modal-header">
          <h2>${safeTitle}</h2>
          <button class="modal-close" id="diff-modal-close" title="Schliessen">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="modal-body external-diff-modal-body">
          <p class="external-diff-subtitle">${safeSubtitle}</p>
          <div class="external-diff-panels">
            <section class="external-diff-panel">
              <div class="external-diff-panel-header">Editor-Version (ungespeichert)</div>
              <div id="external-diff-left" class="external-diff-code">${leftHtml}</div>
            </section>
            <section class="external-diff-panel">
              <div class="external-diff-panel-header">
                Externe Version (Datei auf Festplatte)
                <span class="external-diff-legend">Gelb = Abweichung</span>
              </div>
              <div id="external-diff-right" class="external-diff-code">${rightHtml}</div>
            </section>
          </div>
        </div>
        <div class="modal-actions">
          <button id="diff-modal-copy" class="btn-secondary">Diff kopieren</button>
          <button id="diff-modal-ok" class="btn-primary">Schliessen</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const leftPane = modal.querySelector('#external-diff-left');
    const rightPane = modal.querySelector('#external-diff-right');
    let isSyncingScroll = false;

    if (leftPane && rightPane) {
      leftPane.addEventListener('scroll', () => {
        if (isSyncingScroll) return;
        isSyncingScroll = true;
        rightPane.scrollTop = leftPane.scrollTop;
        isSyncingScroll = false;
      });

      rightPane.addEventListener('scroll', () => {
        if (isSyncingScroll) return;
        isSyncingScroll = true;
        leftPane.scrollTop = rightPane.scrollTop;
        isSyncingScroll = false;
      });
    }

    const close = () => {
      modal.remove();
      resolve();
    };

    modal.querySelector('#diff-modal-close')?.addEventListener('click', close);
    modal.querySelector('#diff-modal-ok')?.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        close();
      }
    });

    modal.querySelector('#diff-modal-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(diffText || '');
        showStatus('Diff in Zwischenablage kopiert', 'saved');
      } catch (error) {
        console.warn('Could not copy diff to clipboard:', error);
        showStatus('Kopieren fehlgeschlagen', 'error');
      }
    });
  });
}

async function showExternalChangeDiff(filePath, fileName) {
  if (!State.currentEditor) {
    showStatus('Diff nicht möglich: Editor nicht bereit', 'error');
    return;
  }

  const externalResult = await window.api.loadFile(filePath);
  if (!externalResult?.success) {
    showStatus(`Diff nicht möglich: ${externalResult?.error || 'Datei konnte nicht geladen werden'}`, 'error');
    return;
  }

  const markdownBody = stripFrontmatterFromMarkdown(State.currentEditor.getMarkdown());
  const localSerialized = stringifyFile(State.currentFileMetadata || {}, markdownBody);

  const diffResult = await window.api.generateUnifiedDiff(
    localSerialized,
    externalResult.content,
    {
      leftLabel: 'Editor-Version (ungespeichert)',
      rightLabel: 'Externe Version (Datei auf Festplatte)',
    }
  );

  if (!diffResult?.success) {
    showStatus(`Diff fehlgeschlagen: ${diffResult?.error || 'Unbekannter Fehler'}`, 'error');
    return;
  }

  const externalChangedLines = extractChangedRightLineNumbersFromUnifiedDiff(diffResult.diff || '');

  await showSideBySideDiffModal({
    title: `Unterschiede: ${fileName}`,
    subtitle: 'Beide Seiten zeigen rohes Markdown. In der externen Version sind Abweichungen gelb hinterlegt.',
    localText: localSerialized,
    externalText: externalResult.content,
    diffText: diffResult.diff || 'Keine Unterschiede gefunden.',
    externalChangedLines,
  });
}

// ============================================================================
// Claude Terminal - Event Listeners
// ============================================================================

document.querySelector('#terminal-help-btn')?.addEventListener('click', showClaudeHelp);

window.addEventListener('beforeunload', () => {
  disposeTerminal({ keepPty: true });
});

// Raw Markdown Font-Größe verwalten
function getRawMarkdownFontSize() {
  const saved = localStorage.getItem('rawMarkdownFontSize');
  return saved ? parseInt(saved, 10) : 14;
}

function setRawMarkdownFontSize(size) {
  const clampedSize = Math.max(8, Math.min(32, size));
  localStorage.setItem('rawMarkdownFontSize', clampedSize.toString());
  const textarea = document.getElementById('raw-content');
  if (textarea) {
    textarea.style.fontSize = `${clampedSize}px`;
  }
  return clampedSize;
}

function adjustRawMarkdownFontSize(delta) {
  const currentSize = getRawMarkdownFontSize();
  return setRawMarkdownFontSize(currentSize + delta);
}

let rawFrontmatter = null;
let rawContent = null;
let frontmatterVisible = false;

function extractFrontmatter(markdown) {
  const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]*/;
  const match = markdown.match(frontmatterRegex);

  if (match) {
    console.log('✓ Frontmatter gefunden:', match[1].substring(0, 100));
    return {
      frontmatter: match[0],
      content: markdown.slice(match[0].length)
    };
  }

  console.log('✗ Kein Frontmatter gefunden. Dokument beginnt mit:', markdown.substring(0, 50));
  return {
    frontmatter: null,
    content: markdown
  };
}

window.toggleRawFrontmatter = function() {
  const textarea = document.getElementById('raw-content');
  const buttonText = document.getElementById('toggle-frontmatter-text');
  const button = document.getElementById('toggle-frontmatter-btn');

  if (!rawFrontmatter) {
    console.log('Toggle geklickt, aber kein Frontmatter vorhanden');
    return;
  }

  if (frontmatterVisible) {
    const currentValue = textarea.value;
    const extracted = extractFrontmatter(currentValue);
    rawFrontmatter = extracted.frontmatter || rawFrontmatter;
    textarea.value = extracted.content;
    frontmatterVisible = false;
    buttonText.textContent = 'Frontmatter';
    button.style.opacity = '0.7';
  } else {
    textarea.value = rawFrontmatter + textarea.value;
    frontmatterVisible = true;
    buttonText.textContent = 'Frontmatter ✓';
    button.style.opacity = '1';

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(0, 0);
      textarea.scrollTop = 0;
    }, 50);
  }
};

function showRawMarkdown() {
  if (!State.currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  const contentOnly = State.currentEditor.getMarkdown();
  const markdown = stringifyFile(State.currentFileMetadata, contentOnly);

  const { frontmatter, content } = extractFrontmatter(markdown);
  rawFrontmatter = frontmatter;
  rawContent = content;
  frontmatterVisible = true;

  const buttonText = document.getElementById('toggle-frontmatter-text');
  const toggleBtn = document.getElementById('toggle-frontmatter-btn');
  if (rawFrontmatter) {
    buttonText.textContent = 'Frontmatter';
    toggleBtn.disabled = false;
    toggleBtn.style.opacity = '0.7';
  } else {
    buttonText.textContent = 'Frontmatter';
    toggleBtn.disabled = true;
    toggleBtn.style.opacity = '0.3';
  }

  const { state } = State.currentEditor;
  const { selection } = state;
  const cursorPos = selection.from;
  const totalTextLength = state.doc.textContent.length;
  const cursorRatio = totalTextLength > 0 ? cursorPos / totalTextLength : 0;
  const contentCursorPos = Math.floor(content.length * cursorRatio);

  const textarea = document.getElementById('raw-content');
  textarea.value = content;

  const fontSize = getRawMarkdownFontSize();
  textarea.style.fontSize = `${fontSize}px`;

  document.getElementById('raw-modal').classList.add('active');

  setTimeout(() => {
    textarea.focus();
    const safePos = Math.max(0, Math.min(contentCursorPos, content.length));
    textarea.setSelectionRange(safePos, safePos);

    const lineHeight = 20;
    const lines = content.substring(0, safePos).split('\n').length;
    textarea.scrollTop = Math.max(0, (lines - 10) * lineHeight);
  }, 100);
}

document.addEventListener('keydown', (event) => {
  const textarea = document.getElementById('raw-content');
  const modal = document.getElementById('raw-modal');

  if (!modal?.classList.contains('active')) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      adjustRawMarkdownFontSize(1);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      adjustRawMarkdownFontSize(-1);
    } else if (event.key === '0') {
      event.preventDefault();
      setRawMarkdownFontSize(14);
    }
  }
});

window.saveRawMarkdown = function() {
  const textarea = document.getElementById('raw-content');
  let finalMarkdown = textarea.value;

  if (rawFrontmatter && !frontmatterVisible) {
    finalMarkdown = rawFrontmatter + finalMarkdown;
  }

  const { metadata, content } = parseFile(finalMarkdown);

  State.currentFileMetadata = metadata;
  State.currentEditor.commands.setContent(content, { contentType: 'markdown' });

  console.log('✓ Raw Markdown gespeichert. Metadata:', Object.keys(metadata).length, 'keys');

  document.getElementById('raw-modal').classList.remove('active');

  rawFrontmatter = null;
  rawContent = null;
  frontmatterVisible = false;
};

window.closeRawModal = function() {
  document.getElementById('raw-modal').classList.remove('active');
  rawFrontmatter = null;
  rawContent = null;
  frontmatterVisible = false;
};

function handleLanguageToolClick(event) {
  if (event.button !== 0) return;

  const target = event.target;
  const errorElement = target.closest('.lt-error');
  if (!errorElement) return;

  requestAnimationFrame(() => {
    if (!document.body.contains(errorElement)) {
      return;
    }

    const fakeHoverEvent = { target: errorElement };
    handleLanguageToolHover(fakeHoverEvent);
  });
}

function applySuggestion(errorElement, suggestion) {
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement.scrollTop;

  const errorId = errorElement.getAttribute('data-error-id');
  const errorData = errorId ? State.activeErrors.get(errorId) : null;

  if (!errorId) {
    console.warn('No error ID found on element');
    return;
  }

  if (errorElement) {
    errorElement.classList.add('pending');
  }

  const success = applyCorrectionToEditor(State.currentEditor, errorId, suggestion);

  if (!success) {
    console.warn('Failed to apply correction');
    if (errorElement) {
      errorElement.classList.remove('pending');
    }
    return;
  }

  setTimeout(() => {
    editorElement.scrollTop = scrollTop;
  }, 10);

  console.log('✓ Applied suggestion via central function');

  if (errorData) {
    recheckParagraphForErrorData(errorData);
  }
}

function addToDocumentDictionary(word, { triggerAutoSave = true, skipErrorRemoval = false, showStatusMessage = true } = {}) {
  if (!word) return;

  const sanitizedWord = word.trim();
  const normalized = normalizeWord(sanitizedWord);
  if (!normalized) {
    return;
  }

  if (!State.currentFileMetadata.TT_Dict_Additions) {
    State.currentFileMetadata.TT_Dict_Additions = [];
  }

  const alreadyExists = State.currentFileMetadata.TT_Dict_Additions
    .some(existing => normalizeWord(existing) === normalized);

  if (!alreadyExists) {
    State.currentFileMetadata.TT_Dict_Additions.push(sanitizedWord);
    State.hasUnsavedChanges = true;
    if (triggerAutoSave) {
      scheduleAutoSave(2000);
    }
  }

  if (!skipErrorRemoval) {
    removeErrorMarksForWordCentral(State.currentEditor, word);
  }

  if (showStatusMessage) {
    showStatus(`"${word}" im DOC Wörterbuch`, 'saved');
  }
}

function addToPersonalDictionary(word) {
  if (!word) return;

  const sanitizedWord = word.trim();
  const normalized = normalizeWord(sanitizedWord);
  if (!normalized) {
    return;
  }

  let personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');

  const exists = personalDict.some(existing => normalizeWord(existing) === normalized);

  if (!exists) {
    personalDict.push(sanitizedWord);
    localStorage.setItem('personalDictionary', JSON.stringify(personalDict));
    console.log('✓ Added to global dictionary:', word);
  }

  addToDocumentDictionary(sanitizedWord, {
    triggerAutoSave: false,
    skipErrorRemoval: true,
    showStatusMessage: false,
  });

  removeErrorMarksForWordCentral(State.currentEditor, word);

  State.hasUnsavedChanges = true;
  scheduleAutoSave(2000);

  showStatus(`"${word}" ins Wörterbuch aufgenommen`, 'saved');
}

let tooltipElement = null;
let tooltipDragState = { dragging: false, hoveredSuggestion: null, fixed: false };
let tooltipHideTimer = null;

function scheduleTooltipHide(delay = 200) {
  clearTimeout(tooltipHideTimer);
  tooltipHideTimer = setTimeout(() => {
    if (!tooltipDragState.fixed && !tooltipDragState.dragging) {
      removeTooltip();
    }
  }, delay);
}

function handleLanguageToolHover(event) {
  const target = event.target;
  const errorElement = target.closest('.lt-error');

  if (!errorElement) {
    scheduleTooltipHide();
    return;
  }

  clearTimeout(tooltipHideTimer);

  const errorId = errorElement.getAttribute('data-error-id');
  if (tooltipElement && tooltipElement.dataset.errorId === errorId) {
    return;
  }

  if (!tooltipDragState.fixed) {
    removeTooltip();
  } else {
    return;
  }

  const message = errorElement.getAttribute('data-message');
  const suggestionsJson = errorElement.getAttribute('data-suggestions');
  const suggestions = JSON.parse(suggestionsJson || '[]');
  const category = errorElement.getAttribute('data-category');

  if (!message) return;

  tooltipElement = document.createElement('div');
  tooltipElement.className = 'lt-tooltip-large';
  tooltipElement.dataset.errorId = errorElement.getAttribute('data-error-id');

  let html = `
    <div class="lt-tooltip-header">
      <button class="lt-tooltip-close" onclick="event.stopPropagation(); removeTooltip();">×</button>
    </div>
  `;

  if (suggestions.length > 0) {
    html += '<div class="lt-tooltip-suggestions-list">';
    suggestions.forEach((suggestion, index) => {
      html += `<span class="lt-tooltip-suggestion-item" data-suggestion="${suggestion}" data-index="${index}">${suggestion}</span>`;
    });
    html += '</div>';
  }

  html += `<div class="lt-tooltip-message">${message}</div>`;

  html += '<div class="lt-tooltip-actions">';

  if (category === 'TYPOS' || category === 'MISSPELLING' || !category) {
    html += '<button class="btn-small btn-add-dict" data-word="' + errorElement.textContent + '">Wörterbuch</button>';
    html += '<button class="btn-small btn-add-doc-dict" data-word="' + errorElement.textContent + '">DOC Wörterbuch</button>';

    if (suggestions.length > 0) {
      const errorWord = errorElement.textContent.trim();
      const firstSuggestion = suggestions[0] || '';
      html += `<button class="btn-small btn-replace-all" data-word="${errorWord}" data-replacement="${firstSuggestion}">Alle ersetzen</button>`;
    }
  }

  html += '<button class="btn-small btn-ignore-tooltip">Ignorieren</button>';
  html += '</div>';

  tooltipElement.innerHTML = html;

  document.body.appendChild(tooltipElement);

  const rect = errorElement.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.left;
  let top = rect.bottom + 5;

  if (left + tooltipRect.width > viewportWidth) {
    left = viewportWidth - tooltipRect.width - 10;
  }

  if (left < 10) {
    left = 10;
  }

  if (top + tooltipRect.height > viewportHeight) {
    top = rect.top - tooltipRect.height - 5;
  }

  if (top < 10) {
    top = 10;
  }

  tooltipElement.style.position = 'fixed';
  tooltipElement.style.left = left + 'px';
  tooltipElement.style.top = top + 'px';

  tooltipElement.addEventListener('mouseenter', () => {
    tooltipDragState.dragging = true;
    clearTimeout(tooltipHideTimer);
  });

  tooltipElement.addEventListener('mouseleave', () => {
    tooltipDragState.dragging = false;
    tooltipDragState.hoveredSuggestion = null;
    if (!tooltipDragState.fixed) {
      scheduleTooltipHide();
    }
  });

  const suggestionItems = tooltipElement.querySelectorAll('.lt-tooltip-suggestion-item');
  suggestionItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      tooltipDragState.hoveredSuggestion = item.getAttribute('data-suggestion');
      suggestionItems.forEach(s => s.classList.remove('hovered'));
      item.classList.add('hovered');
    });

    item.addEventListener('mouseleave', () => {
      tooltipDragState.hoveredSuggestion = null;
      item.classList.remove('hovered');
    });

    item.addEventListener('mouseup', () => {
      if (tooltipDragState.hoveredSuggestion) {
        applySuggestion(errorElement, tooltipDragState.hoveredSuggestion);
        removeTooltip();
      }
    });
  });

  tooltipElement.querySelector('.btn-add-dict')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const errorId = errorElement.getAttribute('data-error-id');
    const errorData = errorId ? State.activeErrors.get(errorId) : null;
    const word = errorElement.textContent;
    addToPersonalDictionary(word);
    removeTooltip();
    if (errorData) {
      recheckParagraphForErrorData(errorData);
    }
  });

  tooltipElement.querySelector('.btn-add-doc-dict')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const errorId = errorElement.getAttribute('data-error-id');
    const errorData = errorId ? State.activeErrors.get(errorId) : null;
    const word = errorElement.textContent;
    addToDocumentDictionary(word);
    removeTooltip();
    if (errorData) {
      recheckParagraphForErrorData(errorData);
    }
  });

  tooltipElement.querySelector('.btn-ignore-tooltip')?.addEventListener('click', async (e) => {
    e.stopPropagation();

    const errorId = errorElement.getAttribute('data-error-id');

    if (errorId && State.activeErrors.has(errorId)) {
      const errorData = State.activeErrors.get(errorId);

      const errorKey = `${errorData.ruleId}:${errorData.errorText}`;
      const normalizedKey = `${errorData.ruleId}:${normalizeWord(errorData.errorText)}`;

      const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');
      const updatedIgnored = new Set(ignoredErrors);
      if (!updatedIgnored.has(errorKey)) {
        updatedIgnored.add(errorKey);
      }
      if (!updatedIgnored.has(normalizedKey)) {
        updatedIgnored.add(normalizedKey);
      }
      localStorage.setItem('ignoredLanguageToolErrors', JSON.stringify(Array.from(updatedIgnored)));
      console.log('Added to ignore list:', errorKey);
      showStatus(`Fehler ignoriert`, 'saved');

      if (errorElement) {
        errorElement.classList.add('pending');
      }

      const previousSelection = State.currentEditor.state.selection;
      const editorView = State.currentEditor.view;
      let domFrom = errorData.from;
      let domTo = errorData.to;

      try {
        const resolvedFrom = editorView.posAtDOM(errorElement, 0);
        domFrom = resolvedFrom;
        domTo = domFrom + (errorElement.textContent?.length || (errorData.to - errorData.from));
      } catch (domError) {
        console.warn('Could not resolve DOM positions for ignored mark, falling back to stored offsets:', domError);
      }

      withSystemSelectionChange(() => {
        State.currentEditor
          .chain()
          .setTextSelection({ from: domFrom, to: domTo })
          .unsetLanguageToolError()
          .setLanguageToolIgnored({
            ruleId: errorData.ruleId || '',
            message: errorData.message || '',
            ignoredAt: new Date().toISOString(),
          })
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true)
          .run();
      });

      restoreUserSelection(State.currentEditor, previousSelection);

      State.activeErrors.delete(errorId);
      refreshErrorNavigation();

      await recheckParagraphForErrorData(errorData);
    }

    removeTooltip();
  });

  tooltipElement.querySelector('.btn-replace-all')?.addEventListener('click', (e) => {
    e.stopPropagation();

    const searchWord = e.target.getAttribute('data-word');
    const replaceWord = e.target.getAttribute('data-replacement');

    openFindReplaceWithValues(searchWord, replaceWord);
    removeTooltip();
  });
}

function openFindReplaceWithValues(searchText, replaceText) {
  const modal = document.getElementById('find-replace-modal');
  modal.classList.add('active');

  const searchInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');

  if (searchInput) {
    searchInput.value = searchText || '';
  }
  if (replaceInput) {
    replaceInput.value = replaceText || '';
  }

  if (replaceInput) {
    setTimeout(() => replaceInput.focus(), 100);
  }
}

function handleLanguageToolMouseOut() {}

window.removeTooltip = function() {
  clearTimeout(tooltipHideTimer);
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
    tooltipDragState.fixed = false;
    tooltipDragState.dragging = false;
    tooltipDragState.hoveredSuggestion = null;
  }
};

document.addEventListener('mousedown', (event) => {
  if (!tooltipElement) {
    return;
  }

  const clickedInsideTooltip = event.target.closest('.lt-tooltip-large');
  const clickedError = event.target.closest('.lt-error');

  if (!clickedInsideTooltip && !clickedError) {
    tooltipDragState.fixed = false;
    tooltipDragState.dragging = false;
    tooltipDragState.hoveredSuggestion = null;
    removeTooltip();
  }
});

function jumpToErrorAndShowTooltip(from, to, errorId = null) {
  if (!State.currentEditor) return;

  State.currentEditor.chain()
    .focus()
    .setTextSelection({ from, to })
    .run();
  recordUserSelection(State.currentEditor, { registerInteraction: false });

  setTimeout(() => {
    const editorElement = document.querySelector('.tiptap-editor');
    if (!editorElement) return;

    const errorElements = editorElement.querySelectorAll('.lt-error');
    let targetErrorElement = null;

    if (errorId) {
      targetErrorElement = editorElement.querySelector(`.lt-error[data-error-id=\"${errorId}\"]`);
    }

    if (!targetErrorElement) {
      for (const errorEl of errorElements) {
        const candidateId = errorEl.getAttribute('data-error-id');
        if (candidateId && State.activeErrors.has(candidateId)) {
          const errorData = State.activeErrors.get(candidateId);
          if (Math.abs(errorData.from - from) < 2 && Math.abs(errorData.to - to) < 2) {
            targetErrorElement = errorEl;
            break;
          }
        }
      }
    }

    if (targetErrorElement) {
      targetErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.removeTooltip();
      const fakeEvent = { target: targetErrorElement };
      handleLanguageToolHover(fakeEvent);
    } else {
      console.warn('Could not find error element at position', from, to);
      const editorContainer = document.querySelector('#editor');
      if (editorContainer) {
        const selectionRect = State.currentEditor.view.coordsAtPos(from);
        const containerRect = editorContainer.getBoundingClientRect();
        const targetScroll = editorContainer.scrollTop + (selectionRect.top - containerRect.top) - (editorContainer.clientHeight / 2);
        editorContainer.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }
    }

    State.currentEditor.commands.setTextSelection(from);
    recordUserSelection(State.currentEditor, { registerInteraction: false });
  }, 10);
}

window.jumpToErrorCallback = (from, to, errorId) => jumpToErrorAndShowTooltip(from, to, errorId);
refreshErrorNavigation({ preserveSelection: false });

async function checkCurrentParagraph() {
  closeContextMenu();

  if (!State.currentFilePath || !State.currentEditor) {
    console.warn('No file loaded or editor not ready');
    return;
  }

  if (!requireServer('Absatz prüfen')) {
    return;
  }

  const selectionTargets = getParagraphInfosFromSelection();
  const fallbackCandidate = selectionTargets.length > 0
    ? null
    : (State.contextMenuParagraphInfo || getParagraphInfoForSelection(State.lastUserSelection));

  let targets = selectionTargets.length > 0 ? selectionTargets : (fallbackCandidate ? [fallbackCandidate] : []);

  if (targets.length === 0) {
    showStatus('Kein Absatz gefunden', 'error');
    return;
  }

  targets = targets.filter(target => !isFrontmatterParagraph(target.text, target.from));

  if (targets.length === 0) {
    showStatus('Frontmatter übersprungen', 'info');
    return;
  }

  const selectionToRestore = State.lastUserSelection || State.currentEditor.state.selection;
  showStatus(targets.length === 1 ? 'Prüfe Absatz...' : `Prüfe ${targets.length} Absätze...`, 'checking');

  const failedTargets = [];

  for (const info of targets) {
    removeSkippedParagraph(info.text);
    try {
      await checkParagraphDirect(info);
    } catch (error) {
      console.error('❌ Error checking paragraph:', error);
      failedTargets.push(info);
    }
  }

  restoreUserSelection(State.currentEditor, selectionToRestore);
  State.contextMenuParagraphInfo = null;

  if (failedTargets.length === targets.length) {
    showStatus('Fehler bei der Prüfung', 'error');
  } else if (failedTargets.length > 0) {
    showStatus('Einige Absätze konnten nicht geprüft werden', 'error');
  } else {
    showStatus(targets.length === 1 ? 'Absatz geprüft' : 'Absätze geprüft', 'saved');
  }
}

const cliOpenFlow = registerCLIFileOpen(loadFile);

window.fileWatcher.onFileChanged(async (filePath) => {
  console.log('📝 File changed externally:', filePath);

  if (State.currentFilePath === filePath) {
    const fileName = filePath.split('/').pop();

    if (State.hasUnsavedChanges) {
      let reload = false;
      let keepEditorVersion = false;

      while (!reload && !keepEditorVersion) {
        const choiceResult = await window.api.showChoiceDialog({
          type: 'warning',
          title: 'Externe Dateiänderung',
          message: `Die Datei "${fileName}" wurde ausserhalb von TipTap AI geändert.`,
          detail:
            '(z.B. in einem anderen Editor oder durch Cloud-Sync)\n\n' +
            'Du hast hier im Editor noch ungespeicherte Änderungen.',
          buttons: ['Externe Version laden', 'Editor-Version erhalten', 'Unterschiede anzeigen'],
          defaultId: 1,
          cancelId: 1,
        });

        if (!choiceResult?.success) {
          reload = confirm(
            `Die Datei "${fileName}" wurde ausserhalb von TipTap AI geändert.\n\n` +
            'Es gibt ungespeicherte Änderungen im Editor.\n\n' +
            'OK = Externe Version laden\n' +
            'Abbrechen = Editor-Version erhalten'
          );
          keepEditorVersion = !reload;
          break;
        }

        if (choiceResult.response === 0) {
          reload = true;
        } else if (choiceResult.response === 1) {
          keepEditorVersion = true;
        } else if (choiceResult.response === 2) {
          await showExternalChangeDiff(filePath, fileName);
        } else {
          keepEditorVersion = true;
        }
      }

      if (!reload) {
        showStatus('Externe Änderung ignoriert', 'info');
        return;
      }
    }

    showStatus('Externe Änderung erkannt, lade neu...', 'info');
    await loadDocument(filePath, fileName);
    showStatus('Datei neu geladen', 'saved');
    setTimeout(() => showStatus(''), 2000);

    if (State.languageToolEnabled) {
      setTimeout(() => {
        console.log('Auto-recheck: Checking after external file change');
        runViewportCheck({
          startFromBeginning: false,
          maxWords: Infinity,
          autoSave: false
        });
      }, 500);
    }
  }
});

async function initializeStartupDocument() {
  try {
    console.log('⏳ Checking startup open request...');
    const startupHandled = await cliOpenFlow.consumeStartupOpenRequest();
    if (startupHandled) {
      console.log('✅ Startup open request handled, skipping loadInitialState()');
      return;
    }

    console.log('⏳ Waiting briefly for possible CLI open event...');
    const eventHandled = await cliOpenFlow.waitForCLIEvent(350);
    if (eventHandled || cliOpenFlow.wasHandled()) {
      console.log('✅ CLI event handled, skipping loadInitialState()');
      return;
    }

    console.log('ℹ️  No startup/CLI open request found, loading initial state (last opened file)');
    await bootstrapInitialState({ loadFile });
  } catch (error) {
    console.error('Error during startup document initialization:', error);
    await bootstrapInitialState({ loadFile });
  }
}

initializeStartupDocument();

// ============================================
// ZOOM FUNCTIONALITY (formerly followed RECENT ITEMS)
// ============================================

// ============================================
// ZOOM FUNCTIONALITY
// ============================================
initZoomControls({ showFindReplace });

async function openFindReplaceSettings() {
  if (!window.api || typeof window.api.openInSystem !== 'function') {
    showStatus('System-Öffnen nicht verfügbar', 'error');
    return;
  }

  const result = await window.api.openInSystem('renderer/ui/find-replace-settings.js');
  if (!result?.success) {
    showStatus(`Konnte Datei nicht öffnen: ${result?.error || 'Unbekannter Fehler'}`, 'error');
  } else {
    showStatus('Konfigurationsdatei geöffnet', 'saved');
  }
}

function initializeAccordion() {
  const headers = document.querySelectorAll('#shortcuts-modal .accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      if (!item) return;
      item.classList.toggle('open');
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAccordion);
} else {
  initializeAccordion();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFindReplace);
} else {
  initFindReplace();
}

// TOC Akkordeon Toggle (für toc-panel intern)
const tocHeader = document.getElementById('toc-header');
const tocContent = document.getElementById('toc-content');

if (tocHeader && tocContent) {
  tocHeader.addEventListener('click', () => {
    const panel = tocHeader.closest('#toc-panel');
    if (panel) {
      panel.classList.toggle('collapsed');
    }
  });
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOffsetByQuery(text, query) {
  const rawText = String(text || '');
  const q = String(query || '').trim();
  if (!rawText || !q) return -1;

  const directIdx = rawText.toLowerCase().indexOf(q.toLowerCase());
  if (directIdx >= 0) return directIdx;

  const parts = q.split(/\s+/).filter(Boolean).slice(0, 24);
  if (!parts.length) return -1;
  const pattern = parts.map(escapeRegExp).join('\\s+');

  try {
    const re = new RegExp(pattern, 'i');
    const m = re.exec(rawText);
    if (m && Number.isFinite(m.index)) return m.index;
  } catch (_) {}

  return -1;
}

function lineNumberToOffset(text, oneBasedLine) {
  const lines = String(text || '').split('\n');
  const target = Math.max(1, Number(oneBasedLine || 1));
  if (!lines.length) return 0;
  if (target <= 1) return 0;

  const safeTarget = Math.min(target, lines.length);
  let offset = 0;
  for (let i = 0; i < safeTarget - 1; i += 1) {
    offset += lines[i].length + 1;
  }
  return offset;
}

function scrollEditorToPos(pos) {
  if (!State.currentEditor || !Number.isFinite(pos)) return;
  try {
    const coords = State.currentEditor.view.coordsAtPos(pos);
    const editorContainer = document.querySelector('#editor');
    if (!coords || !editorContainer) return;
    const containerRect = editorContainer.getBoundingClientRect();
    const targetScroll = editorContainer.scrollTop + (coords.top - containerRect.top) - (editorContainer.clientHeight / 2);
    editorContainer.scrollTop = Math.max(0, targetScroll);
  } catch (err) {
    console.warn('Could not scroll editor to position:', pos, err);
  }
}

function jumpToMarkdownLocation(request = {}) {
  if (!State.currentEditor) return;
  const req = request || {};
  const query = String(req.query || '').trim();
  const line = Number(req.line || 0);

  const { text, offsetMapper } = getDocumentTextForCheck(State.currentEditor);
  if (!text || typeof offsetMapper !== 'function') {
    return;
  }

  let textOffset = -1;
  if (query) {
    textOffset = findOffsetByQuery(text, query);
  }
  if (textOffset < 0 && Number.isFinite(line) && line > 0) {
    textOffset = lineNumberToOffset(text, line);
  }
  if (textOffset < 0) {
    showStatus('Datei geöffnet, aber keine Sprungstelle gefunden', 'info');
    return;
  }

  const docSize = State.currentEditor.state.doc.content.size;
  let pos = Number(offsetMapper(textOffset));
  if (!Number.isFinite(pos)) pos = 1;
  pos = Math.max(1, Math.min(docSize, pos));

  State.currentEditor.chain().focus().setTextSelection({ from: pos, to: pos }).run();
  scrollEditorToPos(pos);

  if (query) {
    showStatus('Zu Fundstelle gesprungen', 'saved');
  } else {
    showStatus('Zu Zeilenposition gesprungen', 'saved');
  }
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.openFindReplaceSettings = openFindReplaceSettings;
window.jumpToMarkdownLocation = jumpToMarkdownLocation;

window.editorState = State;
window.saveCurrentFile = () => saveFile(false);
