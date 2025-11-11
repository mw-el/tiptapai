// TipTap AI - Renderer Process
// Sprint 1.1: File Operations

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
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
  getAllParagraphs
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
import { createFileTreeManager } from './file-management/file-tree.js';

console.log('Renderer Process geladen - Sprint 1.2');

function scheduleAutoSave(delay = 2000) {
  clearTimeout(State.autoSaveTimer);
  State.autoSaveTimer = setTimeout(() => {
    if (State.currentFilePath) {
      showStatus('Speichert...', 'saving');
      saveFile(true);
    }
  }, delay);
}

// State management moved to editor/editor-state.js
// Import and use State.State.currentFilePath, State.State.currentEditor, etc.

// ⚠️  OFFSET-TRACKING für mehrere aufeinanderfolgende Korrektionen (Option B)
// PERFORMANCE-ENTSCHEIDUNG: Statt nach jeder Korrektur neu zu prüfen (teuer bei langen Texten),
// tracken wir die Offset-Änderungen. Das ist eleganter und skaliert besser.
//
// WARUM Option B und nicht A (recheck nach jeder Korrektur)?
// - Bei 1000 Wörtern und 5 Korrektionen: 5x LanguageTool-API = langsam + Flackern
// - Mit Offset-Tracking: Sofort korrekt, ohne API-Aufrufe
// - Mit sehr langen Texten (5000+ Wörter): Spart erhebliche Zeit und UI-Jank
// State.appliedCorrections managed via State module

// Zentrale Error-Map: errorId -> {match, from, to, errorText, ruleId}
// Diese Map ist die Single Source of Truth für alle aktiven Fehler
// State.activeErrors managed via State module
// Error ID generation moved to utils/error-id.js

// ============================================================================
// PERSISTENT PARAGRAPH CHECKING - Content-based IDs
// ============================================================================
//
// Problem: Positionen ändern sich beim Einfügen/Löschen von Text
// Lösung: Inhalts-basierte IDs (Hash der ersten N Zeichen)
//
// Workflow:
// 1. Beim Prüfen: Generate paragraphId (Hash von erstem Text)
// 2. In Frontmatter speichern: checkedRanges: [{paragraphId, checkedAt}, ...]
// 3. Beim Laden: Iteriere durch Doc, matche Hashes, setze grüne Marks
//
// Vorteile:
// - Funktioniert auch wenn Text eingefügt wird (Positionen ändern sich)
// - Wenn Paragraph editiert wird, ändert sich Hash → muss neu geprüft werden
// ============================================================================
// Hash functions moved to utils/hash.js

// Paragraph storage functions moved to languagetool/paragraph-storage.js

// ============================================================================
// REMOVED: Old blocking checkMultipleParagraphs() function
// ============================================================================
// The old synchronous checkMultipleParagraphs() was blocking UI on large documents.
// It has been replaced with checkParagraphsProgressively() (see below).
// Backup available in: renderer/app_backup_before-progressive-checking.js
// ============================================================================
// PROGRESSIVE NON-BLOCKING PARAGRAPH CHECKING
// ============================================================================
//
// Problem: checkMultipleParagraphs() blockiert UI bei langen Dokumenten
// Lösung: Progressive Prüfung mit requestIdleCallback() und Pausen
//
// Features:
// 1. Viewport-First: Prüfe sichtbare Absätze zuerst
// 2. Non-Blocking: Pausen zwischen Chunks, UI bleibt responsive
// 3. Progress Indicator: Zeige Fortschritt an
// 4. Cancellable: Kann abgebrochen werden (z.B. bei File-Wechsel)
//
// ============================================================================

async function runViewportCheck({ maxWords = Infinity, startFromBeginning = false, autoSave = false } = {}) {
  if (!State.currentEditor || !State.currentFilePath) {
    console.warn('No file loaded or editor not ready');
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
        restoreCheckedParagraphs();
        restoreSkippedParagraphs();
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

// ============================================================================
// NOTE: calculateAdjustedOffset wurde nach languagetool/correction-applier.js verschoben
// ============================================================================

// TipTap Editor initialisieren
const editor = new Editor({
  element: document.querySelector('#editor'),
  editable: true,
  extensions: [
    StarterKit,
    Markdown.configure({
      html: true,                // Allow HTML in markdown
      tightLists: true,          // Tighter list spacing
      transformPastedText: true, // Transform pasted markdown
      transformCopiedText: true, // Transform copied text to markdown
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    LanguageToolMark,       // Sprint 2.1: LanguageTool Integration
    LanguageToolIgnoredMark, // Grey markers for ignored findings
    CheckedParagraphMark,   // Sprint 2.1: Visual feedback for checked paragraphs
  ],
  content: `
    <h2>Willkommen zu TipTap AI!</h2>
    <p>Wähle eine Markdown-Datei aus der Sidebar, um sie zu bearbeiten.</p>
  `,
  editorProps: {
    attributes: {
      class: 'tiptap-editor',
      spellcheck: 'false', // Browser-Spellcheck deaktiviert - wir nutzen LanguageTool
      lang: 'de-CH', // Default language
    },
  },
  onUpdate: ({ editor, transaction }) => {
    // DEBUG: Log JEDEN onUpdate call
    console.log('🔥 onUpdate triggered:', {
      docChanged: transaction.docChanged,
      preventUpdate: transaction.getMeta('preventUpdate'),
      addToHistory: transaction.getMeta('addToHistory'),
      steps: transaction.steps.length,
      isApplyingMarks: State.isApplyingLanguageToolMarks
    });

    // WICHTIG: Ignoriere Updates während LanguageTool-Marks gesetzt werden!
    if (State.isApplyingLanguageToolMarks) {
      console.log('⏭️  onUpdate: Skipping - applying LanguageTool marks');
      return;
    }

    // NUR bei echten User-Eingaben triggern, NICHT bei programmatischen Änderungen!
    // transaction.docChanged prüft ob der Inhalt geändert wurde
    if (!transaction.docChanged) {
      console.log('⏭️  onUpdate: Skipping - no doc changes');
      return; // Keine Änderung am Dokument
    }

    console.log('✅ onUpdate: Processing - real user input detected');

    // ============================================================================
    // PARAGRAPH-CHANGE DETECTION: Entferne grüne Markierung bei Änderungen
    // ============================================================================
    //
    // Wenn User Text in einem Paragraph ändert, ist die alte LanguageTool-Prüfung
    // nicht mehr gültig. Wir entfernen die grüne "checked" Markierung nur vom
    // betroffenen Paragraph, nicht vom ganzen Dokument.
    //
    // Warum nur der aktuelle Paragraph?
    // - Effizienz: Andere Paragraphen sind noch gültig
    // - UX: User sieht sofort welcher Paragraph neu geprüft werden muss
    // ============================================================================

    cleanupParagraphAfterUserEdit(editor, saveFile);
    recordUserSelection(editor);

    // Remove "saved" state from save button when user edits
    const saveBtn = document.querySelector('#save-btn');
    if (saveBtn && saveBtn.classList.contains('saved')) {
      saveBtn.classList.remove('saved');
    }

    // Auto-Save mit 5 Minuten Debounce
    clearTimeout(State.autoSaveTimer);

    showStatus('Ungespeichert (Auto-Save in 5 Min)', 'unsaved');
    State.hasUnsavedChanges = true;

    State.autoSaveTimer = setTimeout(() => {
      if (State.currentFilePath) {
        showStatus('Speichert...', 'saving');
        saveFile(true); // true = auto-save
      }
    }, 300000); // 5 minutes = 300000ms

    // Automatischer Voll-Check entfällt – stattdessen wird der Absatz
    // beim Verlassen neu geprüft (siehe onSelectionUpdate)

    // ✅ TABLE OF CONTENTS UPDATE
    // Update TOC when content changes (debounced in updateTOC)
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

    // Update active heading highlight in TOC
    updateTOC(editor);
  },
});

State.currentEditor = editor;
recordUserSelection(editor, { registerInteraction: false });
console.log('TipTap Editor initialisiert');

// ╔════════════════════════════════════════════════════════════╗
// ║   PHASE 1: EDITOR API DISCOVERY (Temporary Debug)        ║
// ║   Tests: What markdown source APIs are available?         ║
// ╚════════════════════════════════════════════════════════════╝
console.log('\n' + '='.repeat(70));
console.log('PHASE 1: EDITOR API DISCOVERY');
console.log('='.repeat(70));

// Test 1: Check available methods
console.log('\n1. VERFÜGBARE METHODEN:');
console.log('-'.repeat(70));
const methods = ['getHTML', 'getText', 'getJSON', 'getMarkdown', 'getDoc', 'getState'];
methods.forEach(method => {
  const hasMethod = typeof State.currentEditor[method] === 'function';
  console.log(`${hasMethod ? '✓' : '✗'} editor.${method}()`);
});

// Test 2: Check storage properties
console.log('\n2. STORAGE PROPERTIES:');
console.log('-'.repeat(70));
if (State.currentEditor.storage) {
  console.log('✓ editor.storage existiert');
  console.log('  Keys:', Object.keys(State.currentEditor.storage));
  Object.keys(State.currentEditor.storage).forEach(key => {
    const storage = State.currentEditor.storage[key];
    console.log(`\n  storage.${key}:`, typeof storage);
    if (storage && typeof storage === 'object') {
      console.log(`    Sub-keys:`, Object.keys(storage));
      // Check for markdown-specific methods/properties
      if (key === 'markdown') {
        if (typeof storage.get === 'function') {
          console.log(`    ✓ Has .get() method`);
          try {
            const mdTest = storage.get();
            console.log(`      → Result type: ${typeof mdTest}`);
            if (typeof mdTest === 'string') {
              console.log(`      → Length: ${mdTest.length} chars`);
            }
          } catch (e) {
            console.log(`      → ERROR: ${e.message}`);
          }
        }
        if (typeof storage.getMarkdown === 'function') {
          console.log(`    ✓ Has .getMarkdown() method`);
        }
      }
    }
  });
} else {
  console.log('✗ editor.storage nicht vorhanden');
}

// Test 3: Check extension manager
console.log('\n3. EXTENSION MANAGER:');
console.log('-'.repeat(70));
if (State.currentEditor.extensionManager) {
  console.log('✓ editor.extensionManager existiert');
  const extensions = State.currentEditor.extensionManager.extensions || [];
  console.log('  Installed extensions:');
  extensions.forEach(ext => {
    console.log(`    - ${ext.name}`);
  });
} else {
  console.log('✗ editor.extensionManager nicht vorhanden');
}

// Test 4: Try to get markdown content
console.log('\n4. TEST: Get Markdown Content');
console.log('-'.repeat(70));
let markdownSource = null;

// Try Method A: editor.getMarkdown()
if (typeof State.currentEditor.getMarkdown === 'function') {
  try {
    markdownSource = State.currentEditor.getMarkdown();
    console.log('✓ Method A: editor.getMarkdown() works!');
    console.log(`  → Length: ${markdownSource.length} chars`);
  } catch (e) {
    console.log(`✗ Method A failed: ${e.message}`);
  }
}

// Try Method B: storage.markdown.get()
if (!markdownSource && State.currentEditor.storage && State.currentEditor.storage.markdown) {
  if (typeof State.currentEditor.storage.markdown.get === 'function') {
    try {
      markdownSource = State.currentEditor.storage.markdown.get();
      console.log('✓ Method B: editor.storage.markdown.get() works!');
      console.log(`  → Length: ${markdownSource.length} chars`);
    } catch (e) {
      console.log(`✗ Method B failed: ${e.message}`);
    }
  }
}

// Try Method C: Convert getHTML to markdown (fallback)
if (!markdownSource) {
  console.log('⚠️  Methods A & B failed - will use HTML→Markdown fallback');
  console.log('  → This requires htmlToMarkdown() function validation');
}

// Test 5: Compare outputs
console.log('\n5. COMPARISON: getText() vs getHTML()');
console.log('-'.repeat(70));
try {
  const html = State.currentEditor.getHTML();
  const text = State.currentEditor.getText();
  console.log(`HTML length: ${html.length} chars`);
  console.log(`TEXT length: ${text.length} chars`);
  console.log(`\nHTML (first 150 chars):\n${html.substring(0, 150)}`);
  console.log(`\nTEXT (first 150 chars):\n${text.substring(0, 150)}`);
  console.log('\n⚠️  PROBLEMS WITH getText():');
  console.log('  - Structure information missing (# - > etc.)');
  console.log('  - LanguageTool offsets become invalid');
  console.log('  - This is why we need Markdown source!');
} catch (e) {
  console.log('ERROR:', e.message);
}

console.log('\n' + '='.repeat(70));
console.log('PHASE 1 COMPLETE - API Discovery finished');
console.log('='.repeat(70) + '\n');

// Also write to a file for analysis (via IPC)
const debugOutput = {
  timestamp: new Date().toISOString(),
  editorMethods: {
    getHTML: typeof State.currentEditor.getHTML === 'function',
    getText: typeof State.currentEditor.getText === 'function',
    getJSON: typeof State.currentEditor.getJSON === 'function',
    getMarkdown: typeof State.currentEditor.getMarkdown === 'function',
    getDoc: typeof State.currentEditor.getDoc === 'function',
    getState: typeof State.currentEditor.getState === 'function',
  },
  storageAvailable: !!State.currentEditor.storage,
  storageKeys: State.currentEditor.storage ? Object.keys(State.currentEditor.storage) : [],
  hasExtensionManager: !!State.currentEditor.extensionManager,
  markdownApiMethod: markdownSource ? 'SUCCESS' : 'FAILED - will use HTML fallback',
};

// Try to send to main process
try {
  window.electronAPI?.logDebug?.(debugOutput);
} catch (e) {
  console.log('Could not send debug info to main process:', e.message);
}

// DEBUG: Umfassende Analyse aller Block-Strukturen und Offset-Verschiebungen
function analyzeDocumentOffsets() {
  const doc = State.currentEditor.state.doc;
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     COMPREHENSIVE OFFSET ANALYSIS - ALL BLOCK TYPES      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let rawTextPos = 0; // Wie LanguageTool zählt (flacher Text)
  const offsetShifts = []; // Wo tauchen Verschiebungen auf?
  const blockAnalysis = {}; // Für jeden Block-Typ: Verschiebung tracken

  // Struktur für jede Block-Art
  const blockTypes = {
    paragraph: { count: 0, shifts: [] },
    bulletList: { count: 0, shifts: [] },
    orderedList: { count: 0, shifts: [] },
    listItem: { count: 0, shifts: [] },
    blockquote: { count: 0, shifts: [] },
    codeBlock: { count: 0, shifts: [] },
    heading: { count: 0, shifts: [] },
    table: { count: 0, shifts: [] },
  };

  console.log('TREE STRUCTURE & OFFSET MAPPING:\n');

  let depth = 0;
  doc.descendants((node, nodePos) => {
    const indent = '│ '.repeat(depth);

    if (node.isText) {
      const preview = node.text.substring(0, 50).replace(/\n/g, '↵');
      const shift = nodePos - (rawTextPos + 1);
      const shiftMarker = shift !== 0 ? `⚠️  SHIFT=${shift > 0 ? '+' : ''}${shift}` : '';

      console.log(`${indent}├─ TEXT: "${preview}${node.text.length > 50 ? '...' : ''}" (len=${node.text.length})`);
      console.log(`${indent}   rawPos=${rawTextPos}..${rawTextPos + node.text.length} | nodePos=${nodePos} | diff=${nodePos - rawTextPos} ${shiftMarker}`);

      if (shift !== 0) {
        offsetShifts.push({
          type: 'text',
          rawPos: rawTextPos,
          nodePos: nodePos,
          shift: shift,
          text: preview
        });
      }

      rawTextPos += node.text.length;

    } else if (node.isBlock) {
      const blockType = node.type.name;
      const marker = blockType in blockTypes ? '🔷' : '❓';

      // Track Block-Typ
      if (blockType in blockTypes) {
        blockTypes[blockType].count++;
      }

      // Special handling für verschiedene Block-Typen
      if (blockType === 'bulletList' || blockType === 'orderedList') {
        console.log(`\n${indent}${marker} ${blockType.toUpperCase()} (nodePos=${nodePos})`);
        console.log(`${indent}   ⚠️  LIST NODE - Check children for offset issues!`);
        depth++;
      } else if (blockType === 'listItem') {
        console.log(`${indent}${marker} listItem (nodePos=${nodePos})`);
        depth++;
      } else if (blockType === 'blockquote') {
        console.log(`\n${indent}${marker} BLOCKQUOTE (nodePos=${nodePos})`);
        depth++;
      } else if (blockType === 'codeBlock') {
        console.log(`\n${indent}${marker} CODE_BLOCK (nodePos=${nodePos})`);
        depth++;
      } else if (blockType === 'heading') {
        console.log(`\n${indent}${marker} HEADING (nodePos=${nodePos})`);
        depth++;
      } else if (blockType === 'table' || blockType === 'tableRow' || blockType === 'tableCell' || blockType === 'tableHeader') {
        console.log(`${indent}${marker} ${blockType.toUpperCase()} (nodePos=${nodePos})`);
      } else if (blockType === 'paragraph') {
        console.log(`${indent}${marker} paragraph (nodePos=${nodePos})`);
        depth++;
      }
    }

    // Depth management
    if (node.type.name === 'doc' || !node.isBlock) {
      // Keep depth
    } else if (node.content && node.content.size === 0) {
      // Empty block, keep depth
    }
  });

  // Reset depth for proper block handling
  depth = 0;
  doc.descendants((node) => {
    if (node.isBlock && node.type.name in blockTypes && node.content && node.content.size > 0) {
      depth++;
    }
  });

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              OFFSET SHIFT ANALYSIS                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (offsetShifts.length === 0) {
    console.log('✅ NO OFFSET SHIFTS DETECTED - Simple +1 should work!\n');
  } else {
    console.log(`⚠️  DETECTED ${offsetShifts.length} OFFSET SHIFTS:\n`);
    offsetShifts.forEach((shift, idx) => {
      console.log(`${idx + 1}. At rawPos=${shift.rawPos} (text: "${shift.text}")`);
      console.log(`   Expected nodePos: ${shift.rawPos + 1}`);
      console.log(`   Actual nodePos:   ${shift.nodePos}`);
      console.log(`   Shift:            ${shift.shift > 0 ? '+' : ''}${shift.shift}\n`);
    });
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║            BLOCK TYPE FREQUENCY & PATTERNS                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  for (const [blockType, stats] of Object.entries(blockTypes)) {
    if (stats.count > 0) {
      console.log(`${blockType.padEnd(15)} : ${stats.count} occurrence(s)`);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    DIAGNOSIS                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (offsetShifts.length === 0) {
    console.log('✅ CONCLUSION: Simple +1 offset adjustment should work!');
    console.log('   All text nodes follow expected position pattern.');
  } else {
    const shiftTypes = {};
    offsetShifts.forEach(shift => {
      if (!shiftTypes[shift.shift]) shiftTypes[shift.shift] = 0;
      shiftTypes[shift.shift]++;
    });

    console.log('❌ CONCLUSION: Position mapping needs correction!');
    console.log('\nShift patterns detected:');
    for (const [shift, count] of Object.entries(shiftTypes)) {
      console.log(`  Shift ${shift > 0 ? '+' : ''}${shift}: ${count} occurrences`);
    }

    console.log('\n📋 Likely causes:');
    if (blockTypes.bulletList.count > 0 || blockTypes.orderedList.count > 0) {
      console.log('  • Bullet/Ordered lists affect position calculations');
    }
    if (blockTypes.blockquote.count > 0) {
      console.log('  • Blockquotes add positional overhead');
    }
    if (blockTypes.codeBlock.count > 0) {
      console.log('  • Code blocks (formatted differently) cause shifts');
    }
    if (blockTypes.table.count > 0) {
      console.log('  • Tables have complex nested structure');
    }

    console.log('\n💡 Fix strategy:');
    console.log('  Instead of: position = rawOffset + 1');
    console.log('  Use: position = resolveRawOffsetToTreePos(rawOffset)');
    console.log('  This function must account for block structure overhead.');
  }

  console.log('\n');
}

// DEPRECATED: markdownToHTML() wurde entfernt
// Jetzt wird TipTap native Markdown-Unterstützung verwendet:
// Laden: State.currentEditor.commands.setContent(markdown)

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

  await ensureFileTreeShowsCurrentFile();

  const tocContainer = document.getElementById('toc-container');
  if (tocContainer) {
    tocContainer.classList.remove('hidden');
    updateTOC(State.currentEditor);
  }

  console.log('File loaded successfully, language:', result.language);
}

const {
  loadFileTree,
  changeFolder,
  navigateUp,
  ensureFileTreeShowsCurrentFile,
} = createFileTreeManager({ loadFile });

const {
  createNewFile,
  saveFileAs,
  renameFile,
  deleteFile,
} = createFileOperations({
  showInputModal,
  showStatus,
  loadFile,
  loadFileTree,
  ensureFileTreeShowsCurrentFile,
});

// showStatus moved to ui/status.js

// Sprache setzen (Sprint 1.4)
function setDocumentLanguage(langCode) {
  if (!State.currentFilePath) {
    console.warn('No file loaded');
    return;
  }

  console.log('Setting language to:', langCode);

  // HTML lang-Attribut auf contenteditable Element setzen (spellcheck bleibt aus)
  const editorDom = State.currentEditor.view.dom;
  editorDom.setAttribute('lang', langCode);
  editorDom.setAttribute('spellcheck', 'false');

  // Frontmatter updaten
  State.currentFileMetadata.language = langCode;

  // Auto-Save triggern
  showStatus('Sprache geändert...', 'saving');
  setTimeout(() => {
    saveFile(true);
  }, 500);
}

// File speichern
// DEPRECATED: Diese Funktion ist fehlerhaft und wird nicht mehr verwendet!
// Speichern verwendet jetzt: State.currentEditor.getMarkdown()
// Nur noch für Raw-Modal Absatz-Anzeige verwendet (Zeile ~1877)
function htmlToMarkdown(html) {
  let markdown = html;

  // Headings
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/g, '# $1\n');
  markdown = markdown.replace(/<h2>(.*?)<\/h2>/g, '## $1\n');
  markdown = markdown.replace(/<h3>(.*?)<\/h3>/g, '### $1\n');

  // Bold
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/g, '**$1**');

  // Italic
  markdown = markdown.replace(/<em>(.*?)<\/em>/g, '*$1*');

  // Paragraphs
  markdown = markdown.replace(/<p>(.*?)<\/p>/g, '$1\n\n');

  // Line breaks
  markdown = markdown.replace(/<br\s*\/?>/g, '\n');

  // Clean up multiple newlines
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  return markdown.trim();
}

// LanguageTool Status-Anzeige aktualisieren
// updateLanguageToolStatus moved to ui/status.js

// LanguageTool Check ausführen (Sprint 2.1) - Viewport-basiert für große Dokumente
// ============================================================================
// LANGUAGETOOL CHECK - Wrapper für zentrale Funktion
// ============================================================================
// Die komplette Prüfung nutzt jetzt dieselbe Viewport-/Paragraph-Logik
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


// ============================================================================
// JUMP TO FIRST ERROR - Navigation Helper
// ============================================================================
// Jumps to the first LanguageTool error in the document
function jumpToFirstError() {
  if (!State.currentEditor || State.activeErrors.size === 0) {
    console.warn('No errors to jump to');
    return;
  }

  // Get first error from activeErrors Map
  const firstError = Array.from(State.activeErrors.values())[0];

  if (firstError) {
    const { from, to } = firstError;

    // Set selection to error position
    State.currentEditor.chain()
      .focus()
      .setTextSelection({ from, to })
      .run();

    // Scroll error into view
    const editorElement = document.querySelector('.tiptap-editor');
    if (editorElement) {
      // Find the error mark in DOM
      const errorMark = editorElement.querySelector('.lt-error');
      if (errorMark) {
        errorMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    console.log(`Jumped to first error at position ${from}-${to}`);
  }
}

// Viewport-Text extrahieren (sichtbarer Bereich + 3-4 Screens voraus)
function getViewportText() {
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement.scrollTop;
  const viewportHeight = editorElement.clientHeight;

  // Berechne sichtbaren Bereich + 4 Screens voraus
  const bufferScreens = 4;
  const checkHeight = viewportHeight * (1 + bufferScreens);

  // Position im Editor als Character-Offset berechnen
  const { from: cursorPos } = State.currentEditor.state.selection;

  // Einfache Heuristik: ~60 Zeichen pro Zeile, ~50 Zeilen pro Screen
  const charsPerScreen = 60 * 50; // ca. 3000 Zeichen
  const startOffset = Math.max(0, Math.floor(scrollTop / viewportHeight) * charsPerScreen);
  const endOffset = Math.min(
    State.currentEditor.state.doc.content.size,
    startOffset + (charsPerScreen * (1 + bufferScreens))
  );

  const fullText = State.currentEditor.getText();
  const text = fullText.substring(startOffset, endOffset);

  return { text, startOffset, endOffset };
}

// removeAllLanguageToolMarks ist jetzt in languagetool/error-marking.js
// Wird über Import verwendet

// REMOVED: removeViewportMarks, updateErrorNavigator, escapeHtml, updateViewportErrors, jumpToError, jumpToFirstError
// Siehe: REMOVED_FEATURES.md für Details
// Diese Funktionen waren Teil des Error Navigator Systems und wurden bei der
// radikalen Vereinfachung entfernt um Offset-Bugs zu beheben.

/*
// Nur Marks im Viewport-Bereich entfernen (für performantes Checking)
function removeViewportMarks(startOffset, endOffset) {
  // WICHTIG: Wir entfernen hier nur Marks im aktuellen Viewport-Bereich
  // um Performance bei großen Dokumenten zu erhalten

  // TipTap bietet keine API um nur Marks in einem Bereich zu entfernen
  // Daher müssen wir die DOM-Elemente direkt manipulieren
  const editorElement = document.querySelector('#editor .tiptap-editor');
  if (!editorElement) return;

  // Finde alle .lt-error Elemente und entferne sie
  const errorElements = editorElement.querySelectorAll('.lt-error');
  errorElements.forEach(element => {
    // Entferne die Mark-Klasse und Attribute
    element.classList.remove('lt-error');
    element.removeAttribute('data-error-id');
    element.removeAttribute('data-message');
    element.removeAttribute('data-suggestions');
    element.removeAttribute('data-category');
    element.removeAttribute('data-rule-id');

    // Ersetze das span durch seinen Textinhalt
    const parent = element.parentNode;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  });
}

// Update Error Navigator - Zeige Fehler-Liste mit Context
function updateErrorNavigator() {
  const errorList = document.querySelector('#error-list');
  if (!errorList) return;

  // Clear list
  errorList.innerHTML = '';

  // Get all errors sorted by position
  // ⚠️  WICHTIG: State.activeErrors speichert RAW-Offsets (OHNE +1)
  // Die Error Navigator Anzeige braucht auch RAW-Offsets um korrekten Kontext zu zeigen
  // Keine -1 nötig, die Offsets sind bereits korrekt!
  const errors = Array.from(State.activeErrors.entries()).map(([errorId, data]) => ({
    errorId,
    from: data.from,  // RAW-Offset - keine Anpassung nötig
    to: data.to,      // RAW-Offset - keine Anpassung nötig
    message: data.message,
    suggestions: data.suggestions,
    errorText: data.errorText,
  })).sort((a, b) => a.from - b.from);

  // Get editor content to extract context around each error
  const { state } = State.currentEditor;
  const docText = state.doc.textContent;

  errors.forEach((error, index) => {
    // Extract context: 15 chars left, error text, 15 chars right
    const contextStart = Math.max(0, error.from - 15);
    const contextEnd = Math.min(docText.length, error.to + 15);

    const before = docText.substring(contextStart, error.from);
    const errorWord = docText.substring(error.from, error.to);
    const after = docText.substring(error.to, contextEnd);

    // Create error item
    const item = document.createElement('div');
    item.className = 'error-item';
    item.dataset.errorIndex = index;
    item.dataset.errorId = error.errorId;
    item.title = error.message;

    // Build context HTML
    const contextHTML = `
      <div class="error-context">
        <span class="error-context-left">${escapeHtml(before)}</span>
        <span class="error-context-error">${escapeHtml(errorWord)}</span>
        <span class="error-context-right">${escapeHtml(after)}</span>
      </div>
    `;

    item.innerHTML = contextHTML;

    // Click handler - Jump to error
    item.addEventListener('click', () => {
      jumpToError(error.errorId);
    });

    errorList.appendChild(item);
  });

  // Update viewport errors (die sichtbar sind)
  updateViewportErrors();
}

// Escape HTML for safe display
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Highlight errors that are currently in viewport
function updateViewportErrors() {
  const editorElement = document.querySelector('#editor');
  if (!editorElement) return;

  const viewport = {
    top: editorElement.scrollTop,
    bottom: editorElement.scrollTop + editorElement.clientHeight
  };

  // Get visible error elements
  const visibleErrorIds = new Set();
  document.querySelectorAll('#editor .lt-error').forEach(el => {
    const rect = el.getBoundingClientRect();
    const editorRect = editorElement.getBoundingClientRect();
    const elTop = rect.top - editorRect.top + editorElement.scrollTop;
    const elBottom = elTop + rect.height;

    if (elBottom > viewport.top && elTop < viewport.bottom) {
      const errorId = el.getAttribute('data-error-id');
      if (errorId) visibleErrorIds.add(errorId);
    }
  });

  // Update error list items styling
  document.querySelectorAll('.error-item').forEach(item => {
    const errorId = item.dataset.errorId;
    if (visibleErrorIds.has(errorId)) {
      item.classList.add('in-viewport');
    } else {
      item.classList.remove('in-viewport');
    }
  });

  // Auto-scroll error list to show viewport errors in center
  const viewportItems = document.querySelectorAll('.error-item.in-viewport');
  if (viewportItems.length > 0) {
    const firstViewportItem = viewportItems[0];
    const container = document.querySelector('#error-list-container');
    const listHeight = container.clientHeight;
    const itemTop = firstViewportItem.offsetTop;

    // Scroll so viewport errors are centered
    const scrollTarget = itemTop - (listHeight / 2) + (firstViewportItem.clientHeight / 2);
    container.scrollTop = Math.max(0, scrollTarget);
  }
}

// Jump to specific error by ID
function jumpToError(errorId) {
  if (!errorId || !State.activeErrors.has(errorId)) {
    refreshErrorNavigation({ preserveSelection: false });
    return;
  }

  const errorData = State.activeErrors.get(errorId);
      jumpToErrorAndShowTooltip(errorData.from, errorData.to, errorId);

  document.querySelectorAll('.error-item').forEach(item => item.classList.remove('active'));
  const activeItem = document.querySelector(`.error-item[data-error-id="${errorId}"]`);
  if (activeItem) {
    activeItem.classList.add('active');
  }
}

// Zum ersten LanguageTool-Fehler im Dokument springen
function jumpToFirstError() {
  // Finde das erste .lt-error Element im Editor
  const firstError = document.querySelector('#editor .tiptap-editor .lt-error');

  if (!firstError) {
    console.log('No errors found in document');
    showStatus('Keine Fehler gefunden', 'info');
    return;
  }

  // Scrolle zum Fehler
  firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Highlight-Effekt: Kurz pulsieren lassen
  firstError.style.transition = 'background-color 0.3s';
  const originalBg = window.getComputedStyle(firstError).backgroundColor;
  firstError.style.backgroundColor = '#ffeb3b'; // Gelb

  setTimeout(() => {
    firstError.style.backgroundColor = originalBg;
  }, 800);

  console.log('Jumped to first error');
}
*/
// END OF REMOVED FUNCTIONS

// LanguageTool Toggle Button
document.querySelector('#languagetool-toggle').addEventListener('click', toggleLanguageTool);

// ⚠️  REFRESH-BUTTON DEAKTIVIERT!
//
// Der Refresh-Button würde das GANZE Dokument prüfen (inkl. Frontmatter).
// Das ist nicht mehr gewünscht - User soll Absätze einzeln über Kontextmenü prüfen.
//
// HINWEIS: Button wird auf "disabled" gesetzt und zeigt Tooltip.
//
// LanguageTool Refresh Button: Prüfe nächste 2000 Wörter
document.querySelector('#languagetool-refresh').addEventListener('click', async () => {
  if (!State.currentFilePath || !State.currentEditor) {
    showStatus('Keine Datei geladen', 'error');
    return;
  }

  if (!State.languageToolEnabled) {
    showStatus('LanguageTool ist deaktiviert', 'info');
    return;
  }

  if (!State.initialCheckCompleted && isCheckRunning()) {
    showStatus('Prüfung läuft bereits', 'info');
    return;
  }

  const confirmFull = confirm('Gesamtes Dokument neu prüfen? Dies kann bei langen Dateien etwas dauern.');
  if (!confirmFull) {
    return;
  }

  removeAllCheckedParagraphMarks({ clearMetadata: true });
  restoreSkippedParagraphs();
  State.paragraphsNeedingCheck = new Set();
  State.initialCheckCompleted = false;

  console.log('🔄 Checking all paragraphs (manually triggered)...');
  await runViewportCheck({ maxWords: Infinity, startFromBeginning: true, autoSave: true });
});

// Button visuell aktivieren und Tooltip aktualisieren
const refreshBtn = document.querySelector('#languagetool-refresh');
if (refreshBtn) {
  refreshBtn.style.opacity = '1';
  refreshBtn.style.cursor = 'pointer';
  refreshBtn.setAttribute('title', 'Gesamtes Dokument prüfen');
}

// LanguageTool Status Click - Springe zum ersten Fehler (ENTFERNT - Radical Simplification)
// Siehe: REMOVED_FEATURES.md
// document.querySelector('#languagetool-status').addEventListener('click', (e) => {
//   if (e.target.classList.contains('has-errors')) {
//     jumpToFirstError();
//   }
// });

// Ordner wechseln Button
document.querySelector('#change-folder-btn').addEventListener('click', changeFolder);

// Folder Up Button (eine Ebene nach oben)
document.querySelector('#folder-up-btn').addEventListener('click', navigateUp);

// New File Button
document.querySelector('#new-file-btn').addEventListener('click', createNewFile);

// Save As Button
document.querySelector('#save-as-btn').addEventListener('click', saveFileAs);

// Rename Button
document.querySelector('#rename-btn').addEventListener('click', renameFile);

// Delete Button
document.querySelector('#delete-btn').addEventListener('click', deleteFile);

// Find & Replace Button
document.querySelector('#find-replace-btn').addEventListener('click', showFindReplace);

// ============================================
// Editor Toolbar Buttons
// ============================================

// Heading Button - zeigt Dropdown
document.querySelector('#heading-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = document.querySelector('#heading-dropdown');
  dropdown.classList.toggle('hidden');
});

// Heading Dropdown - Überschriften setzen
document.querySelectorAll('#heading-dropdown button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const level = parseInt(e.target.getAttribute('data-level'));
    const { state } = State.currentEditor;
    const { $from, $to } = state.selection;

    // Getze die Selection nur auf den aktuellen Paragraph
    // Das verhindert, dass mehrere Zeilen mit formatiert werden
    const $paraStart = state.doc.resolve($from.before());
    const $paraEnd = state.doc.resolve($to.after());

    if (level === 0) {
      // Normaler Text
      State.currentEditor.chain()
        .focus()
        .setTextSelection({ from: $paraStart.pos, to: $paraEnd.pos })
        .setParagraph()
        .run();
    } else {
      // Überschrift Ebene 1-6
      State.currentEditor.chain()
        .focus()
        .setTextSelection({ from: $paraStart.pos, to: $paraEnd.pos })
        .toggleHeading({ level })
        .run();
    }

    // Zoom nach Änderung neu anwenden (verhindert Reset durch DOM-Neuaufbau)
    setTimeout(() => {
      applyZoom();
    }, 10);

    // Dropdown schließen
    document.querySelector('#heading-dropdown').classList.add('hidden');
  });
});

// Code Button
document.querySelector('#code-btn').addEventListener('click', () => {
  State.currentEditor.chain().focus().toggleCode().run();
});

// Shortcuts Button
document.querySelector('#shortcuts-btn').addEventListener('click', () => {
  document.getElementById('shortcuts-modal').classList.add('active');
});

// Dropdown schließen wenn außerhalb geklickt wird
document.addEventListener('click', (e) => {
  const dropdown = document.querySelector('#heading-dropdown');
  const headingBtn = document.querySelector('#heading-btn');

  if (!dropdown.contains(e.target) && !headingBtn.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// LanguageTool ein/ausschalten
function toggleLanguageTool() {
  State.languageToolEnabled = !State.languageToolEnabled;

  const btn = document.querySelector('#languagetool-toggle');

  if (State.languageToolEnabled) {
    btn.classList.add('active');
    btn.setAttribute('title', 'LanguageTool ein (klicken zum Ausschalten)');
    console.log('LanguageTool aktiviert');

    // ⚠️  AUTOMATISCHER CHECK BEI AKTIVIERUNG ENTFERNT!
    //
    // Beim Einschalten von LanguageTool wird NICHT mehr automatisch geprüft.
    // User muss manuell über Kontextmenü Absätze prüfen.
    //
    // Alt (ENTFERNT):
    // if (State.currentFilePath) {
    //   runLanguageToolCheck();
    // }
  } else {
    btn.classList.remove('active');
    btn.setAttribute('title', 'LanguageTool aus (klicken zum Einschalten)');
    console.log('LanguageTool deaktiviert');
    // Alle Marks entfernen
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

// Language Selector
document.querySelector('#language-selector').addEventListener('change', (e) => {
  setDocumentLanguage(e.target.value);
});

// Metadata Button
document.querySelector('#metadata-btn').addEventListener('click', showMetadata);

// Raw Markdown Button
document.querySelector('#raw-btn').addEventListener('click', showRawMarkdown);

const editorElement = document.querySelector('#editor');

if (editorElement) {
  // LanguageTool Error Click Handler (mousedown um Links/Rechtsklick zu unterscheiden)
  editorElement.addEventListener('mousedown', handleLanguageToolClick);

  // LanguageTool Hover Tooltip
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

// Scroll-basierte LanguageTool-Checks (DEAKTIVIERT - Performance-Problem!)
// if (editorElement) {
//   editorElement.addEventListener('scroll', handleEditorScroll);
// }

// Error Navigator - Update viewport errors on scroll (ENTFERNT - Radical Simplification)
// Siehe: REMOVED_FEATURES.md

// Save Button
document.querySelector('#save-btn').addEventListener('click', () => saveFile(false));

// Toggle Sidebar (File Tree)
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

// Modal schließen (global function)
window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.remove('active');
};


// Raw Markdown für aktuellen Absatz anzeigen (editierbar)
let currentNodePos = null; // Speichert Position des aktuellen Nodes
let currentNodeSize = null; // Speichert Größe des Nodes

function showRawMarkdown() {
  if (!State.currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  // Hole komplettes Markdown vom Editor (TipTap native)
  const markdown = State.currentEditor.getMarkdown();

  // Berechne ungefähre Cursor-Position im Markdown
  const { state } = State.currentEditor;
  const { selection } = state;
  const cursorPos = selection.from;
  const totalTextLength = state.doc.textContent.length;
  const cursorRatio = totalTextLength > 0 ? cursorPos / totalTextLength : 0;
  const markdownCursorPos = Math.floor(markdown.length * cursorRatio);

  // Zeige im Textarea
  const textarea = document.getElementById('raw-content');
  textarea.value = markdown;

  // Öffne Modal
  document.getElementById('raw-modal').classList.add('active');

  // Setze Cursor an korrekte Position und scrolle dorthin
  setTimeout(() => {
    textarea.focus();
    const safePos = Math.max(0, Math.min(markdownCursorPos, markdown.length));
    textarea.setSelectionRange(safePos, safePos);

    // Scrolle zur Cursor-Position
    const lineHeight = 20; // ungefähre Zeilenhöhe
    const lines = markdown.substring(0, safePos).split('\n').length;
    textarea.scrollTop = Math.max(0, (lines - 10) * lineHeight);
  }, 100);
}

// Raw Modal schließen und Änderungen übernehmen
window.closeRawModal = function() {
  const textarea = document.getElementById('raw-content');
  const newMarkdown = textarea.value;

  // Lade geändertes Markdown zurück in Editor (TipTap native)
  State.currentEditor.commands.setContent(newMarkdown, { contentType: 'markdown' });

  // Modal schließen
  document.getElementById('raw-modal').classList.remove('active');
};

// LanguageTool Error Click Handler - nur bei Linksklick Tooltip fixieren
function handleLanguageToolClick(event) {
  // Nur Linksklick (button === 0)
  // Rechtsklick (button === 2) lässt normales Editieren zu
  if (event.button !== 0) return;

  const target = event.target;
  const errorElement = target.closest('.lt-error');
  if (!errorElement) return;

  // Cursor darf sich normal bewegen, Tooltip wird nachträglich angezeigt
  requestAnimationFrame(() => {
    if (!document.body.contains(errorElement)) {
      return;
    }

    const fakeHoverEvent = { target: errorElement };
    handleLanguageToolHover(fakeHoverEvent);
  });
}

// Korrekturvorschlag anwenden
// WRAPPER für zentrale Korrektur-Funktion
function applySuggestion(errorElement, suggestion) {
  // Save current scroll position
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement.scrollTop;

  // Hole Error-ID aus DOM
  const errorId = errorElement.getAttribute('data-error-id');
  const errorData = errorId ? State.activeErrors.get(errorId) : null;

  if (!errorId) {
    console.warn('No error ID found on element');
    return;
  }

  // Visual feedback: Mark element as pending
  if (errorElement) {
    errorElement.classList.add('pending');
  }

  // ============================================================================
  // ZENTRALE KORREKTUR-FUNKTION
  // ============================================================================
  // Alle Korrektur-Logik ist jetzt in languagetool/correction-applier.js
  // Das stellt sicher, dass ALLE Korrekturen (egal woher) gleich behandelt werden
  const success = applyCorrectionToEditor(State.currentEditor, errorId, suggestion);

  if (!success) {
    console.warn('Failed to apply correction');
    if (errorElement) {
      errorElement.classList.remove('pending');
    }
    return;
  }

  // Restore scroll position after a brief delay (to allow DOM to update)
  setTimeout(() => {
    editorElement.scrollTop = scrollTop;
  }, 10);

  console.log('✓ Applied suggestion via central function');

  if (errorData) {
    recheckParagraphForErrorData(errorData);
  }
}

// Wort ins persönliche Wörterbuch aufnehmen
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

// Hover Tooltip anzeigen - LARGE VERSION with Drag-to-Select
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

  // Tooltip bereits für dieses Element?
  const errorId = errorElement.getAttribute('data-error-id');
  if (tooltipElement && tooltipElement.dataset.errorId === errorId) {
    return; // Tooltip ist bereits sichtbar für diesen Fehler
  }

  // Alten Tooltip entfernen (außer er ist fixiert)
  if (!tooltipDragState.fixed) {
    removeTooltip();
  } else {
    return; // Tooltip ist fixiert, nicht ersetzen
  }

  // Fehler-Info holen
  const message = errorElement.getAttribute('data-message');
  const suggestionsJson = errorElement.getAttribute('data-suggestions');
  const suggestions = JSON.parse(suggestionsJson || '[]');
  const category = errorElement.getAttribute('data-category');

  if (!message) return;

  // Großer halbtransparenter Tooltip erstellen
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'lt-tooltip-large';
  tooltipElement.dataset.errorId = errorElement.getAttribute('data-error-id');

  let html = `
    <div class="lt-tooltip-header">
      <button class="lt-tooltip-close" onclick="event.stopPropagation(); removeTooltip();">×</button>
    </div>
  `;

  // Vorschläge ZUERST (vor der Erläuterung) - nebeneinander statt untereinander
  if (suggestions.length > 0) {
    html += '<div class="lt-tooltip-suggestions-list">';
    suggestions.forEach((suggestion, index) => {
      html += `<span class="lt-tooltip-suggestion-item" data-suggestion="${suggestion}" data-index="${index}">${suggestion}</span>`;
    });
    html += '</div>';
  }

  // Erläuterung DANACH
  html += `<div class="lt-tooltip-message">${message}</div>`;

  // Aktions-Buttons basierend auf Kategorie
  html += '<div class="lt-tooltip-actions">';

  // "Ins Wörterbuch" nur bei TYPOS/Rechtschreibfehlern
  if (category === 'TYPOS' || category === 'MISSPELLING' || !category) {
    html += '<button class="btn-small btn-add-dict" data-word="' + errorElement.textContent + '">Wörterbuch</button>';
    html += '<button class="btn-small btn-add-doc-dict" data-word="' + errorElement.textContent + '">DOC Wörterbuch</button>';

    // "Alle ersetzen" Button für TYPOS
    if (suggestions.length > 0) {
      const errorWord = errorElement.textContent.trim();
      const firstSuggestion = suggestions[0] || '';
      html += `<button class="btn-small btn-replace-all" data-word="${errorWord}" data-replacement="${firstSuggestion}">Alle ersetzen</button>`;
    }
  }

  // "Ignorieren" bei allen Kategorien
  html += '<button class="btn-small btn-ignore-tooltip">Ignorieren</button>';
  html += '</div>';

  tooltipElement.innerHTML = html;

  // Tooltip zum DOM hinzufügen (BEVOR wir Position berechnen, damit Größe bekannt ist)
  document.body.appendChild(tooltipElement);

  // Position berechnen und sicherstellen dass Tooltip im Viewport bleibt
  const rect = errorElement.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.left;
  let top = rect.bottom + 5;

  // Horizontale Position anpassen wenn zu weit rechts
  if (left + tooltipRect.width > viewportWidth) {
    left = viewportWidth - tooltipRect.width - 10; // 10px Abstand zum Rand
  }

  // Wenn zu weit links, mindestens 10px vom linken Rand
  if (left < 10) {
    left = 10;
  }

  // Vertikale Position anpassen wenn zu weit unten
  if (top + tooltipRect.height > viewportHeight) {
    // Zeige Tooltip ÜBER dem Fehler statt darunter
    top = rect.top - tooltipRect.height - 5;
  }

  // Wenn immer noch zu weit oben, mindestens 10px vom oberen Rand
  if (top < 10) {
    top = 10;
  }

  tooltipElement.style.position = 'fixed';
  tooltipElement.style.left = left + 'px';
  tooltipElement.style.top = top + 'px';

  // Verhindere dass Tooltip verschwindet wenn Maus drüber ist
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

  // Drag-to-Select Event Handlers für Vorschläge
  const suggestionItems = tooltipElement.querySelectorAll('.lt-tooltip-suggestion-item');
  suggestionItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      tooltipDragState.hoveredSuggestion = item.getAttribute('data-suggestion');
      // Visuelle Hervorhebung
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

  // "Ins Wörterbuch" Button Handler
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

  // "Ignorieren" Button Handler
  tooltipElement.querySelector('.btn-ignore-tooltip')?.addEventListener('click', async (e) => {
    e.stopPropagation();

    // Hole Error-ID aus DOM
    const errorId = errorElement.getAttribute('data-error-id');

    if (errorId && State.activeErrors.has(errorId)) {
      const errorData = State.activeErrors.get(errorId);

      // Fehler zur Ignore-Liste hinzufügen (ruleId + errorText)
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

      // Mark the error span with "pending" class to show verification is in progress
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

      // WICHTIG: Entferne Fehler aus Map
      State.activeErrors.delete(errorId);
      refreshErrorNavigation();

      await recheckParagraphForErrorData(errorData);
    }

    removeTooltip();
  });

  // "Alle ersetzen" Button Handler
  tooltipElement.querySelector('.btn-replace-all')?.addEventListener('click', (e) => {
    e.stopPropagation();

    const searchWord = e.target.getAttribute('data-word');
    const replaceWord = e.target.getAttribute('data-replacement');

    console.log('Alle ersetzen clicked:', { searchWord, replaceWord });

    // Öffne Find & Replace Modal und fülle Felder aus
    openFindReplaceWithValues(searchWord, replaceWord);

    removeTooltip();
  });
}

// Hilfsfunktion: Find & Replace Modal öffnen mit vorausgefüllten Werten
function openFindReplaceWithValues(searchText, replaceText) {
  console.log('openFindReplaceWithValues called:', { searchText, replaceText });

  // Zeige Modal
  const modal = document.getElementById('find-replace-modal');
  console.log('Modal element:', modal);
  modal.classList.add('active');

  // Fülle Felder aus
  const searchInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');

  console.log('Input elements:', { searchInput, replaceInput });

  if (searchInput) {
    searchInput.value = searchText || '';
    console.log('Set searchInput.value to:', searchInput.value);
  }
  if (replaceInput) {
    replaceInput.value = replaceText || '';
    console.log('Set replaceInput.value to:', replaceInput.value);
  }

  // Fokussiere Replace-Input
  if (replaceInput) {
    setTimeout(() => replaceInput.focus(), 100);
  }
}

function handleLanguageToolMouseOut() {
  // Nichts tun - Tooltip bleibt beim Hover/Fixiert
  // Er wird nur entfernt wenn:
  // 1. Über anderem Fehler gehovered wird
  // 2. Close-Button geklickt wird
  // 3. Vorschlag angewendet wird
  // 4. mouseleave vom Tooltip selbst (siehe Event Handler in handleLanguageToolHover)
}

// Global verfügbar für onclick im HTML
window.removeTooltip = function() {
  clearTimeout(tooltipHideTimer);
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
    tooltipDragState.fixed = false; // Reset fixed state
    tooltipDragState.dragging = false; // Reset dragging state
    tooltipDragState.hoveredSuggestion = null; // Reset hover
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

// ============================================
// CENTRAL: Jump to Error and Show Tooltip
// ============================================
//
// This is the ONLY function that should be used to:
// 1. Navigate to an error position
// 2. Show the error tooltip
//
// Used by:
// - Error navigation widget (buttons in sidebar)
// - Normal error click handler (handleLanguageToolClick)
//
function jumpToErrorAndShowTooltip(from, to, errorId = null) {
  if (!State.currentEditor) return;

  // 1. Jump to position
  State.currentEditor.chain()
    .focus()
    .setTextSelection({ from, to })
    .run();
  recordUserSelection(State.currentEditor, { registerInteraction: false });

  // 2. Find the error element at this position
  // Wait a tick for DOM to update after setTextSelection
  setTimeout(() => {
    const editorElement = document.querySelector('.tiptap-editor');
    if (!editorElement) return;

    // Find all error marks and check which one is at our position
    const errorElements = editorElement.querySelectorAll('.lt-error');
    let targetErrorElement = null;

    // Get the error at the selection
    const { state } = State.currentEditor;
    const { from: selFrom, to: selTo } = state.selection;

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

    // If we found the error element, show tooltip
    if (targetErrorElement) {
      // Scroll into view
      targetErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Show tooltip (same as normal click)
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

// Setup jump-to-error callback for error-list-widget
window.jumpToErrorCallback = (from, to, errorId) => jumpToErrorAndShowTooltip(from, to, errorId);
refreshErrorNavigation({ preserveSelection: false });

// ============================================================================
// CHECK CURRENT PARAGRAPH: Prüft nur den Absatz, in dem der Cursor steht
// ============================================================================
//
// Diese Funktion wird über das Kontextmenü (Rechtsklick) aufgerufen.
// Sie prüft EXAKT NUR den aktuellen Paragraph mit LanguageTool und markiert
// ihn danach grün, um anzuzeigen dass er geprüft wurde.
//
// FLOW:
// 1. Finde den aktuellen Paragraph (ProseMirror Tree)
// 2. Extrahiere Plain-Text des Paragraphs
// 3. Rufe LanguageTool API auf
// 4. Setze Error-Marks für gefundene Fehler
// 5. Markiere Paragraph grün (checkedParagraph)
//
// WICHTIG:
// - Nur der aktuelle Paragraph wird geprüft (nicht das ganze Dokument)
// - Bestehende Marks in anderen Paragraphen bleiben unverändert
// - Grüne Markierung zeigt: "Dieser Absatz ist geprüft"
// ============================================================================

async function checkCurrentParagraph() {
  closeContextMenu();

  if (!State.currentFilePath || !State.currentEditor) {
    console.warn('No file loaded or editor not ready');
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

// ⚠️  SCROLL-BASIERTER AUTOMATIC CHECK ENTFERNT!
//
// Der intelligente Background-Check beim Scrollen wurde entfernt.
// User muss manuell über Kontextmenü Absätze prüfen.
//
// Alt (ENTFERNT):
// function handleEditorScroll() {
//   if (!State.languageToolEnabled || !State.currentFilePath) return;
//   const editorElement = document.querySelector('#editor');
//   const currentScrollPosition = editorElement.scrollTop;
//   State.lastScrollPosition = currentScrollPosition;
//   clearTimeout(State.languageToolScrollTimer);
//   State.languageToolScrollTimer = setTimeout(() => {
//     console.log('Scroll idle detected - triggering background LanguageTool check');
//     runLanguageToolCheck();
//   }, 2000);
// }

// Initial state laden: Letzter Zustand wiederherstellen
async function loadInitialState() {
  // Get home directory as fallback
  const homeDirResult = await window.api.getHomeDir();
  const homeDir = homeDirResult.success ? homeDirResult.homeDir : '/home/matthias';

  const result = await window.api.getRecentItems();

  if (result.success) {
    const history = result.items || [];

    // Lade letzten Ordner, falls vorhanden, sonst Home-Verzeichnis
    const lastFolder = history.find(item => item.type === 'folder');
    let folderLoaded = false;

    if (lastFolder) {
      // Prüfe, ob der Ordner verfügbar ist (z.B. kein GVFS-Mount, der offline ist)
      const folderCheckResult = await window.api.getDirectoryTree(lastFolder.path);
      // Nur verwenden, wenn success UND es gibt tatsächlich Dateien/Ordner
      if (folderCheckResult.success &&
          folderCheckResult.tree &&
          folderCheckResult.tree.children &&
          folderCheckResult.tree.children.length > 0) {
        State.currentWorkingDir = lastFolder.path;
        folderLoaded = true;
      } else {
        console.warn('Last folder not available or empty (maybe network drive offline):', lastFolder.path);
      }
    }

    if (!folderLoaded) {
      console.log('Using home directory as fallback:', homeDir);
      State.currentWorkingDir = homeDir;
    }

    await loadFileTree(State.currentWorkingDir);

    // Lade letzte Datei, falls vorhanden (mit Error Handling für nicht verfügbare Pfade)
    const lastFile = history.find(item => item.type === 'file');
    if (lastFile) {
      const fileName = lastFile.path.split('/').pop();
      // Nur laden, wenn Datei verfügbar ist (keine Exception werfen)
      await loadFile(lastFile.path, fileName);
    }
  } else {
    // Fallback: Home-Verzeichnis laden
    State.currentWorkingDir = homeDir;
    await loadFileTree(State.currentWorkingDir);
  }
}

// Preload API check
if (window.api) {
  console.log('Preload API verfügbar');
} else {
  console.error('Preload API nicht verfügbar!');
}

// ============================================
// COMMAND-LINE FILE OPENING
// ============================================
// Handle files opened from file manager (double-click on .md files)
let cliFileHandled = false;

if (window.api && window.api.onOpenFileFromCLI) {
  window.api.onOpenFileFromCLI(async (filePath) => {
    console.log('📂 RECEIVED CLI FILE EVENT:', filePath);
    cliFileHandled = true;

    // Extract folder and filename
    const fileName = filePath.split('/').pop();

    // Load the file - tree will automatically sync thanks to ensureFileTreeShowsCurrentFile()
    await loadFile(filePath, fileName);

    console.log('✅ File opened from command line successfully');
  });
  console.log('✅ Command-line file opening registered');
} else {
  console.warn('⚠️  Command-line file opening not available (API missing)');
}

// Initial laden - with delay to allow CLI event to arrive first
console.log('⏳ Waiting for potential CLI file event...');
setTimeout(() => {
  if (!cliFileHandled) {
    console.log('ℹ️  No CLI file received, loading initial state (last opened file)');
    loadInitialState();
  } else {
    console.log('✅ CLI file was handled, skipping loadInitialState()');
  }
}, 200); // Wait 200ms for CLI event

// ============================================
// RECENT ITEMS FEATURE
// ============================================

const recentItemsBtn = document.getElementById('recent-items-btn');
const recentItemsDropdown = document.getElementById('recent-items-dropdown');

if (recentItemsBtn && recentItemsDropdown) {
  recentItemsBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    if (recentItemsDropdown.classList.contains('hidden')) {
      await loadRecentItems();
      recentItemsDropdown.classList.remove('hidden');
    } else {
      recentItemsDropdown.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!recentItemsDropdown.contains(e.target) && e.target !== recentItemsBtn) {
      recentItemsDropdown.classList.add('hidden');
    }
  });
}

async function loadRecentItems() {
  if (!recentItemsDropdown) {
    return;
  }

  const result = await window.api.getRecentItems();

  if (!result.success) {
    console.error('Error loading recent items:', result.error);
    recentItemsDropdown.innerHTML = '<div class="recent-dropdown-empty">Fehler beim Laden</div>';
    return;
  }

  const items = result.items || [];

  if (items.length === 0) {
    recentItemsDropdown.innerHTML = '<div class="recent-dropdown-empty">Noch keine kürzlich verwendeten Elemente</div>';
    return;
  }

  const html = items.map((item) => {
    const icon = item.type === 'file' ? 'description' : 'folder';
    return `
      <div class="dropdown-item" data-type="${item.type}" data-path="${item.path}" title="${item.path}">
        <span class="material-icons">${icon}</span>
        <span class="item-name">${item.name}</span>
      </div>
    `;
  }).join('');

  recentItemsDropdown.innerHTML = html;

  recentItemsDropdown.querySelectorAll('.dropdown-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const type = item.dataset.type;
      const path = item.dataset.path;

      recentItemsDropdown.classList.add('hidden');

      if (type === 'file') {
        const fileName = path.split('/').pop();
        await loadFile(path, fileName);
      } else if (type === 'folder') {
        State.currentWorkingDir = path;
        await loadFileTree(State.currentWorkingDir);
        await window.api.addRecentFolder(path);
      }
    });
  });
}

// Button-Handler ist bereits oben definiert (Zeile 592)
// Keine doppelte Registrierung nötig

// ============================================
// FILE MANAGEMENT FEATURES
// ============================================

// ============================================
// ZOOM FUNCTIONALITY
// ============================================

function zoomIn() {
  State.currentZoomLevel = Math.min(State.currentZoomLevel + 10, 200); // Max 200%
  applyZoom();
}

function zoomOut() {
  State.currentZoomLevel = Math.max(State.currentZoomLevel - 10, 50); // Min 50%
  applyZoom();
}

function resetZoom() {
  State.currentZoomLevel = 100;
  applyZoom();
}

// Keyboard shortcuts for zoom
document.addEventListener('keydown', (e) => {
  // Nur Zoom-Shortcuts abfangen, wenn Ctrl/Cmd gedrückt ist
  if (!e.ctrlKey && !e.metaKey) {
    return; // Normale Tasten durchlassen
  }

  // WICHTIG: Unterscheide zwischen:
  // - Ctrl+0: Zoom-Reset (kein Alt)
  // - Ctrl+Alt+0: Paragraph-Format (mit Alt) - TipTap handled das, aber wir müssen Zoom danach wiederherstellen

  // Ctrl/Cmd + Plus/Equal (zoom in)
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    zoomIn();
  }
  // Ctrl/Cmd + Minus (zoom out)
  else if (e.key === '-') {
    e.preventDefault();
    zoomOut();
  }
  // Ctrl/Cmd + 0 (reset zoom) - NUR wenn kein Alt!
  else if (e.key === '0' && !e.altKey) {
    e.preventDefault();
    resetZoom();
  }
  // Ctrl/Cmd + Alt + 0 (Paragraph format via TipTap) - Zoom danach wiederherstellen
  else if (e.key === '0' && e.altKey) {
    // TipTap wird den Paragraph-Shortcut handhaben
    // Wir müssen danach die Zoom wiederherstellen
    setTimeout(() => {
      applyZoom();
    }, 10);
  }
  // Ctrl/Cmd + F (Find & Replace)
  else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    showFindReplace();
  }
});

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

// ============================================================================
// TABLE OF CONTENTS: Akkordeon Toggle
// ============================================================================
const tocHeader = document.getElementById('toc-header');
const tocContainer = document.getElementById('toc-container');

if (tocHeader && tocContainer) {
  tocHeader.addEventListener('click', () => {
    tocContainer.classList.toggle('collapsed');
    console.log('TOC toggled:', tocContainer.classList.contains('collapsed') ? 'collapsed' : 'expanded');
  });
}

// ============================================================================
// GLOBAL EXPORTS: Funktionen für onclick-Handler verfügbar machen
// ============================================================================
//
// Da app.js ein ES Module ist, sind Funktionen nicht automatisch im globalen
// window-Scope verfügbar. Für onclick="functionName()" müssen wir sie explizit
// exportieren.
//
// ============================================================================

window.openFindReplaceSettings = openFindReplaceSettings;
