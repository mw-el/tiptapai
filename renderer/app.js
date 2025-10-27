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
import { parseFile, stringifyFile } from './frontmatter.js';
import { LanguageToolMark } from './languagetool-mark.js';
import { CheckedParagraphMark } from './checked-paragraph-mark.js';
import { checkText, convertMatchToMark } from './languagetool.js';

console.log('Renderer Process geladen - Sprint 1.2');

// State
let currentFilePath = null;
let currentEditor = null;
let currentFileMetadata = {};
let autoSaveTimer = null;
let languageToolTimer = null; // Timer für LanguageTool Debounce
let languageToolScrollTimer = null; // Timer für Scroll-basiertes LanguageTool
let languageToolEnabled = true; // LanguageTool aktiviert (standardmäßig an)
let currentWorkingDir = null; // Aktuelles Arbeitsverzeichnis (wird beim Start gesetzt)
let lastScrollPosition = 0; // Letzte Scroll-Position für Smart-Check
let currentZoomLevel = 100; // Zoom level in percent (100 = default)
let isApplyingLanguageToolMarks = false; // Flag: LanguageTool Marks werden gerade gesetzt

// ⚠️  OFFSET-TRACKING für mehrere aufeinanderfolgende Korrektionen (Option B)
// PERFORMANCE-ENTSCHEIDUNG: Statt nach jeder Korrektur neu zu prüfen (teuer bei langen Texten),
// tracken wir die Offset-Änderungen. Das ist eleganter und skaliert besser.
//
// WARUM Option B und nicht A (recheck nach jeder Korrektur)?
// - Bei 1000 Wörtern und 5 Korrektionen: 5x LanguageTool-API = langsam + Flackern
// - Mit Offset-Tracking: Sofort korrekt, ohne API-Aufrufe
// - Mit sehr langen Texten (5000+ Wörter): Spart erhebliche Zeit und UI-Jank
let appliedCorrections = []; // [{from, to, originalLength, newLength, delta}, ...]

// Zentrale Error-Map: errorId -> {match, from, to, errorText, ruleId}
// Diese Map ist die Single Source of Truth für alle aktiven Fehler
const activeErrors = new Map();

// Stabile Error-ID generieren basierend auf Position + Inhalt
function generateErrorId(ruleId, errorText, absoluteFrom) {
  // Simple aber stabile ID: ruleId + errorText + position
  // So können wir Fehler eindeutig identifizieren
  return `${ruleId}:${errorText}:${absoluteFrom}`;
}

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

// Simple Hash-Funktion (FNV-1a)
function simpleHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Generiere Paragraph-ID (Hash der ersten 100 Zeichen)
function generateParagraphId(paragraphText) {
  // Normalisiere: trim, lowercase, entferne Whitespace-Variationen
  const normalized = paragraphText.trim().toLowerCase().replace(/\s+/g, ' ');
  // Nimm erste 100 Zeichen (genug um Paragraphen eindeutig zu identifizieren)
  const prefix = normalized.substring(0, 100);
  return simpleHash(prefix);
}

// Speichere geprüften Paragraph in Frontmatter
function saveCheckedParagraph(paragraphText) {
  const paragraphId = generateParagraphId(paragraphText);
  const checkedAt = new Date().toISOString();

  // Initialisiere Array falls nicht vorhanden
  if (!currentFileMetadata.checkedRanges) {
    currentFileMetadata.checkedRanges = [];
  }

  // Prüfe ob bereits vorhanden (update checkedAt)
  const existing = currentFileMetadata.checkedRanges.find(r => r.paragraphId === paragraphId);
  if (existing) {
    existing.checkedAt = checkedAt;
  } else {
    currentFileMetadata.checkedRanges.push({ paragraphId, checkedAt });
  }

  console.log(`✓ Saved checked paragraph: ${paragraphId} (total: ${currentFileMetadata.checkedRanges.length})`);

  // Trigger auto-save
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveFile(true);
  }, 2000);
}

// Prüfe ob Paragraph bereits geprüft wurde (via Hash)
function isParagraphChecked(paragraphText) {
  if (!currentFileMetadata.checkedRanges || currentFileMetadata.checkedRanges.length === 0) {
    return false;
  }

  const paragraphId = generateParagraphId(paragraphText);
  return currentFileMetadata.checkedRanges.some(r => r.paragraphId === paragraphId);
}

// Entferne Paragraph aus checkedRanges (wenn editiert)
function removeParagraphFromChecked(paragraphText) {
  if (!currentFileMetadata.checkedRanges) {
    return;
  }

  const paragraphId = generateParagraphId(paragraphText);
  const initialLength = currentFileMetadata.checkedRanges.length;
  currentFileMetadata.checkedRanges = currentFileMetadata.checkedRanges.filter(
    r => r.paragraphId !== paragraphId
  );

  if (currentFileMetadata.checkedRanges.length < initialLength) {
    console.log(`✗ Removed checked paragraph: ${paragraphId} (remaining: ${currentFileMetadata.checkedRanges.length})`);

    // Trigger auto-save
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveFile(true);
    }, 2000);
  }
}

// Restore grüne Marks beim Laden der Datei
// Iteriere durch Doc, matche paragraph IDs, setze checked Marks
function restoreCheckedParagraphs() {
  if (!currentEditor || !currentFileMetadata.checkedRanges || currentFileMetadata.checkedRanges.length === 0) {
    console.log('No checked ranges to restore');
    return;
  }

  console.log(`📂 Restoring ${currentFileMetadata.checkedRanges.length} checked paragraphs...`);

  const { state } = currentEditor;
  const { doc } = state;

  let restoredCount = 0;

  // Iteriere durch das gesamte Dokument
  doc.descendants((node, pos) => {
    // Nur Paragraphen und Headings prüfen
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const paragraphText = node.textContent;

      // Prüfe ob dieser Paragraph in checkedRanges ist (via Hash)
      if (isParagraphChecked(paragraphText)) {
        // Setze grüne Mark
        const from = pos;
        const to = pos + node.nodeSize;

        currentEditor
          .chain()
          .setTextSelection({ from, to })
          .setCheckedParagraph({ checkedAt: new Date().toISOString() })
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true)
          .run();

        restoredCount++;
        console.log(`✓ Restored checked mark for paragraph at ${from}-${to}`);
      }
    }
  });

  console.log(`✓ Restored ${restoredCount} checked paragraphs`);
}

// ============================================================================
// CHECK MULTIPLE PARAGRAPHS: Prüfe Paragraphen bis zu einem Wortlimit
// ============================================================================
//
// Diese Funktion prüft mehrere Paragraphen sequenziell, bis das Wortlimit
// erreicht ist. Sie wird verwendet für:
// - Auto-Check der ersten 2000 Wörter beim Öffnen
// - "Nächste 2000 Wörter prüfen" Button
//
// Parameter:
// - maxWords: Maximale Anzahl Wörter die geprüft werden sollen
// - startFromBeginning: Wenn true, starte vom Anfang des Dokuments
//                       Wenn false, finde den ersten ungeprüften Paragraph
// ============================================================================
async function checkMultipleParagraphs(maxWords = 2000, startFromBeginning = false) {
  if (!currentEditor || !currentFilePath) {
    console.warn('No file loaded or editor not ready');
    return;
  }

  const { state } = currentEditor;
  const { doc } = state;
  const language = currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

  let totalWordsChecked = 0;
  let paragraphsChecked = 0;
  let firstUncheckedFound = startFromBeginning;

  console.log(`🔍 Starting multi-paragraph check (max ${maxWords} words, from ${startFromBeginning ? 'beginning' : 'first unchecked'})...`);
  showStatus(`Prüfe bis zu ${maxWords} Wörter...`, 'checking');

  // Sammle Paragraphen die geprüft werden sollen
  const paragraphsToCheck = [];

  doc.descendants((node, pos) => {
    // Stop wenn Wortlimit erreicht
    if (totalWordsChecked >= maxWords) {
      return false; // Stop iteration
    }

    // Nur Paragraphen und Headings
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const paragraphText = node.textContent.trim();

      // Skip empty paragraphs
      if (!paragraphText) {
        return;
      }

      // Skip frontmatter
      const isFrontmatter = (
        paragraphText.startsWith('---') ||
        (pos < 200 && (
          paragraphText.includes('lastEdit:') ||
          paragraphText.includes('lastPosition:') ||
          paragraphText.includes('checkedRanges:') ||
          /^\s*[a-zA-Z_]+:\s*/.test(paragraphText)
        ))
      );

      if (isFrontmatter) {
        return;
      }

      // Wenn nicht vom Anfang: Finde ersten ungeprüften Paragraph
      if (!startFromBeginning && !firstUncheckedFound) {
        if (!isParagraphChecked(paragraphText)) {
          firstUncheckedFound = true;
        } else {
          return; // Skip bereits geprüfte Paragraphen am Anfang
        }
      }

      // Zähle Wörter im Paragraph
      const wordCount = paragraphText.split(/\s+/).filter(w => w.length > 0).length;

      // Prüfe ob wir noch Platz haben
      if (totalWordsChecked + wordCount <= maxWords) {
        paragraphsToCheck.push({
          node,
          pos,
          text: paragraphText,
          wordCount
        });
        totalWordsChecked += wordCount;
      } else {
        // Wortlimit würde überschritten - stop
        return false;
      }
    }
  });

  if (paragraphsToCheck.length === 0) {
    showStatus('Alle Paragraphen bereits geprüft', 'no-errors');
    console.log('No unchecked paragraphs found');
    return;
  }

  console.log(`Found ${paragraphsToCheck.length} paragraphs to check (${totalWordsChecked} words)`);

  // Prüfe jeden Paragraph sequenziell
  for (const { node, pos, text, wordCount } of paragraphsToCheck) {
    const from = pos;
    const to = pos + node.nodeSize;

    console.log(`Checking paragraph at ${from}-${to} (${wordCount} words)...`);
    showStatus(`Prüfe Absatz ${paragraphsChecked + 1}/${paragraphsToCheck.length}...`, 'checking');

    // LanguageTool API Call
    const matches = await checkText(text, language);

    // Filtere Fehler
    const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');
    const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');

    const filteredMatches = matches.filter(match => {
      const errorText = text.substring(match.offset, match.offset + match.length);
      if (personalDict.includes(errorText)) return false;
      const errorKey = `${match.rule.id}:${errorText}`;
      if (ignoredErrors.includes(errorKey)) return false;
      return true;
    });

    // Setze Error-Marks
    if (filteredMatches.length > 0) {
      // Entferne alte Error-Marks
      currentEditor
        .chain()
        .setTextSelection({ from, to })
        .unsetLanguageToolError()
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();

      // Setze neue Error-Marks
      filteredMatches.forEach(match => {
        const mark = convertMatchToMark(match, text);
        const errorFrom = from + 1 + mark.from;
        const errorTo = from + 1 + mark.to;
        const errorText = text.substring(mark.from, mark.to);

        if (errorFrom >= from && errorTo <= to && errorFrom < errorTo) {
          const errorId = generateErrorId(mark.ruleId, errorText, errorFrom);

          activeErrors.set(errorId, {
            match: match,
            from: errorFrom,
            to: errorTo,
            errorText: errorText,
            ruleId: mark.ruleId,
            message: mark.message,
            suggestions: mark.suggestions,
            category: mark.category,
          });

          currentEditor
            .chain()
            .setTextSelection({ from: errorFrom, to: errorTo })
            .setLanguageToolError({
              errorId: errorId,
              message: mark.message,
              suggestions: JSON.stringify(mark.suggestions),
              category: mark.category,
              ruleId: mark.ruleId,
            })
            .setMeta('addToHistory', false)
            .setMeta('preventUpdate', true)
            .run();
        }
      });
    }

    // Markiere als geprüft (grün)
    currentEditor
      .chain()
      .setTextSelection({ from, to })
      .setCheckedParagraph({ checkedAt: new Date().toISOString() })
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .run();

    // Speichere in Frontmatter
    saveCheckedParagraph(text);

    paragraphsChecked++;
  }

  showStatus(`✓ ${paragraphsChecked} Absätze geprüft (${totalWordsChecked} Wörter)`, 'no-errors');
  console.log(`✓ Checked ${paragraphsChecked} paragraphs (${totalWordsChecked} words)`);
}

// Berechne angepasste Offsets basierend auf bisherigen Korrektionen
// WICHTIG: Diese Funktion ist das Herzstück von Option B (Offset-Tracking statt Recheck)
//
// Szenario: Text "Fluch Stralung Gedanke"
// 1. Benutzer korrigiert "Stralung" → "Strahlung" (offset 6-14, +1 Zeichen)
// 2. Benutzer korrigiert "Gedanke" → "Gedanken" (offset 15-22)
//    ABER: offset 15-22 ist falsch wegen der +1 Verschiebung aus Schritt 1!
//    Korrekte neue Position: 16-23
//
// Diese Funktion berechnet: originalOffset 15 → adjustedOffset 16
function calculateAdjustedOffset(originalFrom, originalTo) {
  let adjustment = 0;

  // Gehe durch alle bisherigen Korrektionen
  for (const correction of appliedCorrections) {
    // Nur Korrektionen VOR diesem Fehler beeinflussen die Position
    if (originalFrom >= correction.to) {
      // Dieser Fehler liegt NACH der Korrektion → verschieben um delta
      adjustment += correction.delta;
    }
    // Wenn originalFrom < correction.from: Fehler liegt VOR Korrektion → nicht beeinflussen
    // Wenn originalFrom liegt INNERHALB correction: Das sollte nicht vorkommen (wäre ein Bug)
  }

  return {
    adjustedFrom: originalFrom + adjustment,
    adjustedTo: originalTo + adjustment,
    adjustment: adjustment
  };
}

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
      isApplyingMarks: isApplyingLanguageToolMarks
    });

    // WICHTIG: Ignoriere Updates während LanguageTool-Marks gesetzt werden!
    if (isApplyingLanguageToolMarks) {
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

    try {
      const { from, to } = editor.state.selection;
      const $from = editor.state.doc.resolve(from);

      // Finde den aktuellen Paragraph (depth kann variieren je nach Struktur)
      let paragraphDepth = $from.depth;
      while (paragraphDepth > 0) {
        const node = $from.node(paragraphDepth);
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          break;
        }
        paragraphDepth--;
      }

      if (paragraphDepth > 0) {
        const paragraphStart = $from.before(paragraphDepth);
        const paragraphEnd = $from.after(paragraphDepth);

        // Extrahiere Text des Paragraphs
        const paragraphText = editor.state.doc.textBetween(paragraphStart, paragraphEnd, ' ');

        // Entferne checkedParagraph Mark nur von diesem Paragraph
        editor.chain()
          .setTextSelection({ from: paragraphStart, to: paragraphEnd })
          .unsetCheckedParagraph()
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true)
          .run();

        // Entferne aus Frontmatter (persistent)
        removeParagraphFromChecked(paragraphText);

        // Cursor zurücksetzen
        editor.commands.setTextSelection({ from, to });

        console.log(`🔄 Removed checked mark from paragraph at ${paragraphStart}-${paragraphEnd}`);
      }
    } catch (e) {
      console.warn('Could not remove checked paragraph mark:', e);
    }

    // Remove "saved" state from save button when user edits
    const saveBtn = document.querySelector('#save-btn');
    if (saveBtn && saveBtn.classList.contains('saved')) {
      saveBtn.classList.remove('saved');
    }

    // Auto-Save mit 2s Debounce (Sprint 1.3)
    clearTimeout(autoSaveTimer);

    showStatus('Änderungen...');

    autoSaveTimer = setTimeout(() => {
      if (currentFilePath) {
        showStatus('Speichert...', 'saving');
        saveFile(true); // true = auto-save
      }
    }, 2000);

    // ⚠️  AUTOMATISCHE LANGUAGETOOL-PRÜFUNG DEAKTIVIERT!
    //
    // WARUM:
    // - Automatische Checks während des Tippens führen zu Cursor-Verspringen
    // - Race Condition: User tippt weiter während API-Call läuft
    // - Auch mit preventUpdate springt der Cursor manchmal
    //
    // LÖSUNG:
    // - NUR noch manuelle Checks via Refresh-Button
    // - User entscheidet selbst wann geprüft wird
    // - Keine störenden Background-Checks mehr
    //
    // Alt (ENTFERNT):
    // clearTimeout(languageToolTimer);
    // if (languageToolEnabled) {
    //   languageToolTimer = setTimeout(() => {
    //     if (currentFilePath) {
    //       runLanguageToolCheck();
    //     }
    //   }, 5000);
    // }
  },
});

currentEditor = editor;
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
  const hasMethod = typeof currentEditor[method] === 'function';
  console.log(`${hasMethod ? '✓' : '✗'} editor.${method}()`);
});

// Test 2: Check storage properties
console.log('\n2. STORAGE PROPERTIES:');
console.log('-'.repeat(70));
if (currentEditor.storage) {
  console.log('✓ editor.storage existiert');
  console.log('  Keys:', Object.keys(currentEditor.storage));
  Object.keys(currentEditor.storage).forEach(key => {
    const storage = currentEditor.storage[key];
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
if (currentEditor.extensionManager) {
  console.log('✓ editor.extensionManager existiert');
  const extensions = currentEditor.extensionManager.extensions || [];
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
if (typeof currentEditor.getMarkdown === 'function') {
  try {
    markdownSource = currentEditor.getMarkdown();
    console.log('✓ Method A: editor.getMarkdown() works!');
    console.log(`  → Length: ${markdownSource.length} chars`);
  } catch (e) {
    console.log(`✗ Method A failed: ${e.message}`);
  }
}

// Try Method B: storage.markdown.get()
if (!markdownSource && currentEditor.storage && currentEditor.storage.markdown) {
  if (typeof currentEditor.storage.markdown.get === 'function') {
    try {
      markdownSource = currentEditor.storage.markdown.get();
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
  const html = currentEditor.getHTML();
  const text = currentEditor.getText();
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
    getHTML: typeof currentEditor.getHTML === 'function',
    getText: typeof currentEditor.getText === 'function',
    getJSON: typeof currentEditor.getJSON === 'function',
    getMarkdown: typeof currentEditor.getMarkdown === 'function',
    getDoc: typeof currentEditor.getDoc === 'function',
    getState: typeof currentEditor.getState === 'function',
  },
  storageAvailable: !!currentEditor.storage,
  storageKeys: currentEditor.storage ? Object.keys(currentEditor.storage) : [],
  hasExtensionManager: !!currentEditor.extensionManager,
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
  const doc = currentEditor.state.doc;
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
// Laden: currentEditor.commands.setContent(markdown)

// Hierarchischer File Tree laden (VSCode-style)
async function loadFileTree(dirPath = null) {
  // Falls currentWorkingDir noch null ist, hole Home-Verzeichnis
  if (!currentWorkingDir && !dirPath) {
    console.log('Getting home directory...');
    const homeDirResult = await window.api.getHomeDir();
    currentWorkingDir = homeDirResult.success ? homeDirResult.homeDir : '/home/matthias';
    console.log('Home directory:', currentWorkingDir);
  }

  const workingDir = dirPath || currentWorkingDir;
  console.log('Loading directory tree from:', workingDir);

  const result = await window.api.getDirectoryTree(workingDir);
  console.log('Directory tree result:', result);

  if (!result.success) {
    console.error('Error loading directory tree:', result.error);
    const fileTreeEl = document.querySelector('#file-tree');
    fileTreeEl.innerHTML = '<div class="file-tree-empty">Fehler beim Laden: ' + result.error + '</div>';
    return;
  }

  // Aktuelles Verzeichnis speichern
  currentWorkingDir = workingDir;

  const fileTreeEl = document.querySelector('#file-tree');
  fileTreeEl.innerHTML = '';

  if (!result.tree || !result.tree.children || result.tree.children.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'file-tree-empty';
    emptyMsg.textContent = 'Keine Markdown/Text-Dateien gefunden';
    fileTreeEl.appendChild(emptyMsg);
    console.log('No markdown/text files found in:', workingDir);
    return;
  }

  // Tree root rendern
  renderTreeNode(result.tree, fileTreeEl, 0);

  console.log(`Loaded directory tree for: ${workingDir}, found ${result.tree.children.length} items`);
}

// Rekursiv Tree-Nodes rendern
function renderTreeNode(node, parentElement, depth = 0) {
  if (!node) return;

  // Für root node: direkt children rendern
  if (depth === 0 && node.children) {
    node.children.forEach(child => renderTreeNode(child, parentElement, depth + 1));
    return;
  }

  const itemWrapper = document.createElement('div');
  itemWrapper.className = 'tree-item-wrapper';
  itemWrapper.style.paddingLeft = `${depth * 12}px`;

  const item = document.createElement('div');
  item.className = node.type === 'directory' ? 'tree-folder' : 'tree-file';
  item.dataset.path = node.path;
  item.dataset.type = node.type;

  if (node.type === 'directory') {
    // Ordner: Expand/Collapse Icon
    const expandIcon = document.createElement('span');
    expandIcon.className = 'material-icons tree-expand-icon';
    expandIcon.textContent = 'chevron_right'; // collapsed by default
    item.appendChild(expandIcon);

    const folderIcon = document.createElement('span');
    folderIcon.className = 'material-icons tree-icon';
    folderIcon.textContent = 'folder';
    item.appendChild(folderIcon);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    item.appendChild(name);

    // Click handler: Expand/Collapse (left click) oder Navigate to folder (double click)
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolder(item, node, itemWrapper, depth);
    });

    // Double-click: Navigate to this folder
    item.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      console.log('Double-clicked folder, navigating to:', node.path);
      currentWorkingDir = node.path;
      await loadFileTree(node.path);
      await window.api.addRecentFolder(node.path);
    });
  } else {
    // Datei
    const fileIcon = document.createElement('span');
    fileIcon.className = 'material-icons tree-icon';
    fileIcon.textContent = 'description';
    item.appendChild(fileIcon);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    item.appendChild(name);

    // Click handler: Datei öffnen
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      loadFile(node.path, node.name);

      // Active state setzen
      document.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
      item.classList.add('active');
    });
  }

  itemWrapper.appendChild(item);
  parentElement.appendChild(itemWrapper);
}

// Ordner expand/collapse
async function toggleFolder(folderElement, node, itemWrapper, depth) {
  const expandIcon = folderElement.querySelector('.tree-expand-icon');
  const isExpanded = expandIcon.textContent === 'expand_more';

  if (isExpanded) {
    // Collapse: Children entfernen
    expandIcon.textContent = 'chevron_right';
    const childrenContainer = itemWrapper.querySelector('.tree-children');
    if (childrenContainer) {
      childrenContainer.remove();
    }
  } else {
    // Expand: Children laden und anzeigen
    expandIcon.textContent = 'expand_more';

    // Lazy-Loading: Falls children noch nicht geladen
    if (node.children === null) {
      const result = await window.api.expandDirectory(node.path);
      if (result.success) {
        node.children = result.children;
      } else {
        console.error('Error expanding directory:', result.error);
        return;
      }
    }

    // Children-Container erstellen
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';

    // Children rendern
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        renderTreeNode(child, childrenContainer, depth + 1);
      });
    }

    itemWrapper.appendChild(childrenContainer);
  }
}

// Ordner-Wechsel-Dialog
async function changeFolder() {
  console.log('changeFolder called - opening directory dialog...');
  const result = await window.api.selectDirectory();
  console.log('Dialog result:', result);

  if (!result.success || result.canceled) {
    console.log('Directory selection canceled or failed');
    return;
  }

  console.log('Selected directory:', result.dirPath);
  currentWorkingDir = result.dirPath;
  await loadFileTree(result.dirPath);
  await window.api.addRecentFolder(result.dirPath);
  console.log('Folder changed successfully to:', result.dirPath);
}

// Eine Ebene nach oben navigieren
async function navigateUp() {
  if (!currentWorkingDir) {
    console.warn('No current working directory');
    return;
  }

  // Wenn wir bereits im Root sind, nichts tun
  if (currentWorkingDir === '/') {
    console.log('Already at root directory');
    return;
  }

  // Parent-Verzeichnis berechnen
  const parentDir = currentWorkingDir.split('/').slice(0, -1).join('/') || '/';
  console.log('Navigating up from', currentWorkingDir, 'to', parentDir);

  currentWorkingDir = parentDir;
  await loadFileTree(parentDir);
  await window.api.addRecentFolder(parentDir);
}

// Hilfsfunktion: Alle Parent-Ordner einer Datei expandieren
async function expandParentFolders(filePath) {
  const pathParts = filePath.split('/');
  // Baue alle Parent-Pfade auf (ohne die Datei selbst)
  for (let i = 1; i < pathParts.length - 1; i++) {
    const parentPath = pathParts.slice(0, i + 1).join('/');
    const folderElement = document.querySelector(`[data-path="${parentPath}"][data-type="directory"]`);

    if (folderElement && !folderElement.classList.contains('expanded')) {
      // Simuliere Click zum Expandieren
      folderElement.click();
      // Kurze Verzögerung für Animation
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

// File laden
async function loadFile(filePath, fileName) {
  console.log('Loading file:', filePath);

  const result = await window.api.loadFile(filePath);

  if (!result.success) {
    console.error('Error loading file:', result.error);
    showStatus(`Fehler: ${result.error}`, 'error');
    return;
  }

  // Frontmatter parsen (Sprint 1.2)
  const { metadata, content } = parseFile(result.content);
  console.log('Frontmatter metadata:', metadata);

  // Metadaten speichern für späteren Save
  currentFileMetadata = metadata;
  currentFilePath = filePath;

  // Add to recent items
  await window.api.addRecentFile(filePath);

  // Alte LanguageTool-Fehler löschen (neue Datei)
  activeErrors.clear();
  appliedCorrections = [];  // Auch Offset-Tracking zurücksetzen
  removeAllLanguageToolMarks();

  // Nur Content (ohne Frontmatter) in Editor laden
  // TipTap's Markdown Extension mit contentType: 'markdown'
  currentEditor.commands.setContent(content, { contentType: 'markdown' });

  // Zur letzten Position springen (Sprint 1.5.2)
  if (metadata.lastPosition && metadata.lastPosition > 0) {
    // Warte kurz, bis Content geladen ist
    setTimeout(() => {
      try {
        currentEditor.commands.setTextSelection(metadata.lastPosition);
        console.log('Jumped to last position:', metadata.lastPosition);
      } catch (error) {
        console.warn('Could not restore position:', error);
      }
    }, 100);
  }

  // Zoomfaktor wiederherstellen
  if (metadata.zoomLevel && metadata.zoomLevel > 0) {
    currentZoomLevel = metadata.zoomLevel;
    applyZoom();
    console.log('Restored zoom level:', currentZoomLevel);
  }

  // Scroll-Position wiederherstellen
  if (metadata.scrollPosition && metadata.scrollPosition > 0) {
    setTimeout(() => {
      const editorElement = document.querySelector('#editor');
      if (editorElement) {
        editorElement.scrollTop = metadata.scrollPosition;
        console.log('Restored scroll position:', metadata.scrollPosition);
      }
    }, 150); // Etwas länger warten als bei Cursor-Position
  }

  // Window-Titel updaten (nur Dateiname, kein App-Name)
  await window.api.setWindowTitle(fileName);

  // Filename im Control Panel anzeigen
  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = fileName;
  }

  // Sprache wiederherstellen (Sprint 1.4)
  const language = metadata.language || 'de-CH'; // Default: Deutsch-CH
  document.querySelector('#language-selector').value = language;

  // HTML lang-Attribut auf contenteditable Element setzen (spellcheck bleibt aus)
  currentEditor.view.dom.setAttribute('lang', language);
  currentEditor.view.dom.setAttribute('spellcheck', 'false');

  // Expandiere Parent-Ordner, damit die Datei sichtbar wird
  await expandParentFolders(filePath);

  // Active State in File Tree setzen und zum Element scrollen
  document.querySelectorAll('.tree-file').forEach(item => {
    item.classList.remove('active');
  });
  const activeFile = document.querySelector(`[data-path="${filePath}"]`);
  if (activeFile) {
    activeFile.classList.add('active');
    // Zum Element scrollen (in der Mitte des Viewports)
    activeFile.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Restore checked paragraphs (grüne Markierungen)
  // Warte kurz, damit Content vollständig geladen ist
  setTimeout(() => {
    restoreCheckedParagraphs();
  }, 200);

  // Auto-Check der ersten 2000 Wörter (falls noch nicht geprüft)
  // Warte etwas länger, damit restore abgeschlossen ist
  setTimeout(async () => {
    // Prüfe ob bereits Paragraphen geprüft wurden
    const hasCheckedParagraphs = currentFileMetadata.checkedRanges &&
                                  currentFileMetadata.checkedRanges.length > 0;

    if (!hasCheckedParagraphs) {
      console.log('🚀 Auto-checking first 2000 words...');
      await checkMultipleParagraphs(2000, true); // true = vom Anfang starten
    } else {
      console.log('✓ File already has checked paragraphs, skipping auto-check');
    }
  }, 500);

  console.log('File loaded successfully, language:', language);
}

// Status-Anzeige updaten (Sprint 1.3)
function showStatus(message, cssClass = '') {
  const statusEl = document.querySelector('#save-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'save-status ' + cssClass;
  }
  // Fallback: Console logging wenn kein Status-Element vorhanden
  console.log('Status:', message);
}

// Sprache setzen (Sprint 1.4)
function setDocumentLanguage(langCode) {
  if (!currentFilePath) {
    console.warn('No file loaded');
    return;
  }

  console.log('Setting language to:', langCode);

  // HTML lang-Attribut auf contenteditable Element setzen (spellcheck bleibt aus)
  const editorDom = currentEditor.view.dom;
  editorDom.setAttribute('lang', langCode);
  editorDom.setAttribute('spellcheck', 'false');

  // Frontmatter updaten
  currentFileMetadata.language = langCode;

  // Auto-Save triggern
  showStatus('Sprache geändert...', 'saving');
  setTimeout(() => {
    saveFile(true);
  }, 500);
}

// File speichern
async function saveFile(isAutoSave = false) {
  if (!currentFilePath) {
    console.warn('No file loaded');
    alert('Keine Datei geladen!');
    return;
  }

  // Markdown direkt aus TipTap holen (native Funktion)
  const markdown = currentEditor.getMarkdown();

  // Scroll-Position vom Editor-Container speichern
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement ? editorElement.scrollTop : 0;

  // Metadaten updaten (Sprint 1.2)
  const updatedMetadata = {
    ...currentFileMetadata,
    lastEdit: new Date().toISOString(),
    lastPosition: currentEditor.state.selection.from, // Cursor-Position
    zoomLevel: currentZoomLevel, // Zoom-Faktor (100 = default)
    scrollPosition: scrollTop, // Scroll-Position
  };

  // Frontmatter + Content kombinieren
  const fileContent = stringifyFile(updatedMetadata, markdown);

  console.log('Saving file with metadata:', updatedMetadata);

  const result = await window.api.saveFile(currentFilePath, fileContent);

  if (!result.success) {
    console.error('Error saving file:', result.error);
    alert('Fehler beim Speichern: ' + result.error);
    return;
  }

  // Metadaten im State aktualisieren
  currentFileMetadata = updatedMetadata;

  console.log('File saved successfully with frontmatter');

  // Visuelles Feedback (Sprint 1.3)
  if (isAutoSave) {
    showStatus('Gespeichert', 'saved');
    setTimeout(() => {
      showStatus('');
    }, 2000);
  } else {
    // Manueller Save - Button mit Flash-Animation und grünem Zustand bis zur nächsten Änderung
    const saveBtn = document.querySelector('#save-btn');

    // Starte mit Animation
    saveBtn.classList.add('saving');
    showStatus('Gespeichert', 'saved');

    // Nach Animation: Behalte grüne Farbe bis zur nächsten Änderung
    setTimeout(() => {
      saveBtn.classList.remove('saving');
      saveBtn.classList.add('saved'); // Bleibe grün
      showStatus('');
    }, 800); // 0.8s Animation + kurze Pause
  }
}

// DEPRECATED: Diese Funktion ist fehlerhaft und wird nicht mehr verwendet!
// Speichern verwendet jetzt: currentEditor.getMarkdown()
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
// WICHTIG: Diese Funktion wird noch aufgerufen, daher NICHT auskommentieren!
function updateLanguageToolStatus(message, cssClass = '') {
  const statusEl = document.querySelector('#languagetool-status');
  const refreshBtn = document.querySelector('#languagetool-refresh');

  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'languagetool-status ' + cssClass;

    // Cursor-Style: pointer bei Fehlern, damit klar ist dass man klicken kann
    if (cssClass === 'has-errors') {
      statusEl.style.cursor = 'pointer';
      statusEl.title = 'Klick um zum ersten Fehler zu springen';
    } else {
      statusEl.style.cursor = 'default';
      statusEl.title = '';
    }
  }

  // Animiere den Refresh-Button während der Analyse
  // "checking" CSS-Klasse wird hinzugefügt wenn Analyse läuft
  if (refreshBtn) {
    if (cssClass === 'checking') {
      refreshBtn.classList.add('analyzing');
      refreshBtn.disabled = true;
    } else {
      refreshBtn.classList.remove('analyzing');
      refreshBtn.disabled = false;
    }
  }
}

// LanguageTool Check ausführen (Sprint 2.1) - Viewport-basiert für große Dokumente
async function runLanguageToolCheck() {
  if (!currentFilePath) return;

  // Status: Prüfung läuft
  updateLanguageToolStatus('Prüfe Text...', 'checking');

  // Get plain text from editor (same as what user sees)
  const text = currentEditor.getText();

  // Also get markdown to detect formatting (for position corrections)
  const markdown = currentEditor.getMarkdown();

  if (!text.trim()) {
    console.log('No text content to check');
    updateLanguageToolStatus('', '');
    return;
  }

  // Sprache aus Metadaten oder Dropdown holen
  const language = currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

  console.log(`Checking ${text.length} chars with LanguageTool, language:`, language);
  console.log('Text (first 200 chars):', text.substring(0, 200));

  // API-Call - checkText() handhabt automatisch Chunking für große Texte
  const matches = await checkText(text, language);

  if (matches.length === 0) {
    console.log('No errors found');
    updateLanguageToolStatus('Keine Fehler', 'no-errors');
    return;
  }

  console.log(`Found ${matches.length} errors`);

  // Filtere Fehler basierend auf persönlichem Wörterbuch
  const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');

  // Filtere auch ignorierte Fehler (basierend auf ruleId + errorText)
  const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');

  const filteredMatches = matches.filter(match => {
    const errorText = text.substring(match.offset, match.offset + match.length);

    // Prüfe persönliches Wörterbuch
    if (personalDict.includes(errorText)) {
      return false;
    }

    // Prüfe ignorierte Fehler (ruleId + Text Kombination)
    const errorKey = `${match.rule.id}:${errorText}`;
    if (ignoredErrors.includes(errorKey)) {
      return false;
    }

    return true;
  });

  if (filteredMatches.length === 0) {
    console.log('All errors are in personal dictionary');
    updateLanguageToolStatus('Keine Fehler', 'no-errors');
    return;
  }

  updateLanguageToolStatus(`${filteredMatches.length} Fehler`, 'has-errors');

  // FLAG SETZEN: Wir beginnen mit dem Setzen der Marks
  isApplyingLanguageToolMarks = true;
  console.log('🚫 isApplyingLanguageToolMarks = true (blocking onUpdate)');

  // Entferne ALLE alten Marks (da wir jetzt den ganzen Text checken)
  activeErrors.clear();
  // ⚠️  WICHTIG: appliedCorrections NICHT hier zurücksetzen!
  // Warum? Die appliedCorrections werden für die Offset-Berechnung nachfolgender Fehler benötigt.
  // Wenn wir sie hier löschen, verlieren wir die Offset-Adjustments für Fehler, die der Benutzer
  // später korrigiert (nach dem automatischen Recheck).
  //
  // Beispiel Bug ohne diese Warnung:
  // 1. Benutzer korrigiert Fehler 1 → appliedCorrections = [{...}]
  // 2. Auto-Recheck nach 1 Sekunde → appliedCorrections = [] (LÖSCHT UNSERE DATEN!)
  // 3. Benutzer korrigiert Fehler 2 → offset ist falsch (keine Anpassung möglich)
  //
  // appliedCorrections wird nur gelöscht bei:
  // - Neue Datei laden (loadFile)
  // - Benutzer startet neuen Check manuell (TODO: könnte das noch entfernt werden)

  // Clear "pending" verification state from any previous corrections
  // This way, if corrections are still being verified, they'll get the proper color
  const pendingElements = document.querySelectorAll('.lt-error.pending');
  pendingElements.forEach(el => el.classList.remove('pending'));

  removeAllLanguageToolMarks();

  const docSize = currentEditor.state.doc.content.size;

  // ========================================================================
  // POSITION CORRECTION FOR MARKDOWN FORMATTING
  //
  // LanguageTool checks plain text, but errors inside formatted blocks
  // need position adjustments when mapping to TipTap doc positions.
  //
  // Add new format corrections here as needed:
  // ========================================================================
  function getPositionCorrection(text, markdown, textPos) {
    // Find which line in plain text this position is on
    const textBeforePos = text.substring(0, textPos);
    const textLineNum = textBeforePos.split('\n').length - 1;

    // Find the corresponding line in markdown
    const markdownLines = markdown.split('\n');

    // Safety check
    if (textLineNum >= markdownLines.length) {
      return 0;
    }

    const markdownLine = markdownLines[textLineNum];

    let correction = 0;

    // Bullet list: line starts with "- " in markdown (with possible indentation)
    const bulletMatch = markdownLine.match(/^(\s*)-\s/);
    if (bulletMatch) {
      // Count indentation spaces (each level = 2 spaces)
      const indentSpaces = bulletMatch[1].length;
      // Correction = indent spaces + "- " (2 chars)
      correction = -(indentSpaces + 2);
      console.log(`[Correction] Bullet list at line ${textLineNum}, indent=${indentSpaces}, correction=${correction}, line="${markdownLine}"`);
    }
    // Blockquote: line starts with "> " in markdown
    else if (markdownLine.match(/^\s*>\s/)) {
      correction = -1; // "> " = 1 char (space is counted differently)
      console.log(`[Correction] Blockquote at line ${textLineNum}, correction=${correction}, line="${markdownLine}"`);
    }

    return correction;
  }
  // ========================================================================

  // Fehler-Marks setzen
  filteredMatches.forEach((match, index) => {
    const mark = convertMatchToMark(match, text);

    // LanguageTool offsets are for plain text
    const textFrom = mark.from;
    const textTo = mark.to;

    // ============================================================================
    // CRITICAL FIX: LanguageTool Offset Correction for Formatted Text
    // ============================================================================
    //
    // THE PROBLEM:
    // - LanguageTool checks plain text from getText() (no markdown syntax)
    // - LanguageTool returns 0-based offsets for this plain text
    // - BUT: TipTap uses ProseMirror's 1-based tree positions (with node boundaries)
    // - AND: Markdown formatting syntax like `- `, `> ` exists in the tree but not in getText()
    // - Result: Error positions are off by 2-4 chars in lists, 1 char in blockquotes
    //
    // WHY THIS APPROACH:
    // - We CANNOT use getMarkdown() because it adds syntax that LanguageTool would see
    // - We CANNOT detect format from markdown text because TipTap's getMarkdown() output
    //   doesn't include bullet syntax at the start of lines (it's in the tree structure)
    // - We MUST use ProseMirror's document tree to detect what type of block each error is in
    //
    // THE SOLUTION:
    // 1. Send plain text to LanguageTool (getText())
    // 2. Get error offsets for plain text (correct for the text we sent)
    // 3. Use ProseMirror tree structure to detect if error is in a bullet/blockquote
    // 4. Apply correction based on formatting type:
    //    - Normal text: 0 (no correction)
    //    - First-level bullet: -2 (for `- ` markdown syntax)
    //    - Second-level bullet: -4 (for `  - ` = 2 spaces + `- `)
    //    - Blockquote: -1 (for `> ` but space handling differs)
    // 5. Add +1 for ProseMirror's implicit doc-start node
    //
    // This is the ONLY approach that works because:
    // - We need plain text for LanguageTool (no false positives on markdown syntax)
    // - We need tree structure to detect formatting (markdown output doesn't help)
    // - The correction values were empirically determined through testing
    // ============================================================================

    let correction = 0;

    // Convert text position to approximate doc position to find the node
    const approxDocPos = textFrom + 1; // rough estimate

    try {
      const $pos = currentEditor.state.doc.resolve(Math.min(approxDocPos, currentEditor.state.doc.content.size));

      // Walk up the tree to find if this position is inside a list or blockquote
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d);

        if (node.type.name === 'listItem') {
          // Count how many bulletList nodes are in the ancestor chain = nesting level
          let listDepth = 0;
          for (let i = d; i > 0; i--) {
            if ($pos.node(i).type.name === 'bulletList') {
              listDepth++;
            }
          }

          // Apply correction based on nesting depth
          if (listDepth === 1) {
            correction = -2; // First level: `- ` (2 chars)
          } else if (listDepth >= 2) {
            correction = -4; // Second level: `  - ` (4 chars), etc.
          }
          break;
        }
        else if (node.type.name === 'blockquote') {
          correction = -1; // Blockquote: `> ` (but space behavior differs)
          break;
        }
      }
    } catch (e) {
      console.error('Error detecting node type:', e);
    }

    // Apply correction to get editor positions
    const from = textFrom + correction + 1; // +1 for doc node
    const to = textTo + correction + 1;

    const errorText = text.substring(textFrom, textTo);
    console.log(`Error ${index + 1}: text ${textFrom}-${textTo}, correction ${correction}, editor ${from}-${to}, text="${errorText}"`);

    // Überprüfe ob die Position gültig ist
    if (from >= 0 && to <= docSize && from < to) {
      // Stabile Error-ID generieren
      const errorId = generateErrorId(mark.ruleId, errorText, textFrom);

      // Speichere Fehler in Map
      activeErrors.set(errorId, {
        match: match,
        from: from,
        to: to,
        errorText: errorText,
        ruleId: mark.ruleId,
        message: mark.message,
        suggestions: mark.suggestions,
        category: mark.category,
      });

      // Mark im Editor setzen
      currentEditor
        .chain()
        .setTextSelection({ from: from, to: to })
        .setLanguageToolError({
          errorId: errorId,
          message: mark.message,
          suggestions: JSON.stringify(mark.suggestions),
          category: mark.category,
          ruleId: mark.ruleId,
        })
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();
    } else {
      console.warn(`Invalid position: markdown ${markdownFrom}-${markdownTo}, corrected ${from}-${to} (docSize: ${docSize})`);
    }
  });

  // ⚠️  CURSOR-RESTORE ENTFERNT!
  //
  // WARUM: Das automatische Wiederherstellen der Cursor-Position nach dem Setzen
  // der LanguageTool-Marks führt zu Cursor-Verspringen während des Tippens!
  //
  // PROBLEM:
  // 1. User tippt bei Position X
  // 2. Nach 5s triggert LanguageTool-Check (Debounce)
  // 3. runLanguageToolCheck() speichert Cursor-Position bei Zeile 1041-1044
  // 4. LanguageTool API-Call dauert 500-2000ms
  // 5. WÄHRENDDESSEN tippt der User weiter → Cursor ist jetzt bei Position Y
  // 6. API Response kommt an → Code hier stellt Cursor auf alte Position X wieder her!
  // 7. User erlebt: Cursor springt zurück (von Y zu X)
  //
  // LÖSUNG:
  // - NICHT den Cursor wiederherstellen nach LanguageTool-Checks
  // - Der User sollte ungestört weitertippen können
  // - preventUpdate Flag in setLanguageToolError() reicht aus
  //
  // Das scrollIntoView war auch problematisch:
  // - Automatisches Scrollen während des Tippens ist irritierend
  // - User verliert Kontext wenn Viewport plötzlich springt
  //
  // TRADE-OFF:
  // - Vorteil: Kein Cursor-Verspringen mehr während des Tippens
  // - Nachteil: Wenn User woanders im Dokument ist, sieht er neue Marks nicht sofort
  // - Entscheidung: User-Experience beim Tippen ist wichtiger!

  console.log('Applied error marks to entire document');

  // Update Error Navigator mit neuen Fehlern (ENTFERNT - Radical Simplification)
  // Siehe: REMOVED_FEATURES.md

  // FLAG ZURÜCKSETZEN: Marks sind fertig gesetzt
  isApplyingLanguageToolMarks = false;
  console.log('✅ isApplyingLanguageToolMarks = false (onUpdate allowed again)');

  // DEBUG: Inspect rendered HTML for category attributes
  setTimeout(() => {
    const ltErrors = document.querySelectorAll('.lt-error');
    console.log('=== DEBUG: Rendered .lt-error elements ===');
    console.log(`Total elements: ${ltErrors.length}`);
    if (ltErrors.length > 0) {
      const first = ltErrors[0];
      console.log('First element attributes:', {
        errorId: first.getAttribute('data-error-id'),
        category: first.getAttribute('data-category'),
        ruleId: first.getAttribute('data-rule-id'),
        message: first.getAttribute('data-message'),
        className: first.className,
        outerHTML: first.outerHTML.substring(0, 200)
      });
    }
  }, 100);
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
  const { from: cursorPos } = currentEditor.state.selection;

  // Einfache Heuristik: ~60 Zeichen pro Zeile, ~50 Zeilen pro Screen
  const charsPerScreen = 60 * 50; // ca. 3000 Zeichen
  const startOffset = Math.max(0, Math.floor(scrollTop / viewportHeight) * charsPerScreen);
  const endOffset = Math.min(
    currentEditor.state.doc.content.size,
    startOffset + (charsPerScreen * (1 + bufferScreens))
  );

  const fullText = currentEditor.getText();
  const text = fullText.substring(startOffset, endOffset);

  return { text, startOffset, endOffset };
}

// Alle LanguageTool-Marks im ganzen Dokument entfernen (nur für Toggle-Button!)
function removeAllLanguageToolMarks() {
  // Entferne ALLE LanguageTool-Marks im ganzen Dokument
  // Wird nur beim Ausschalten von LanguageTool verwendet
  currentEditor
    .chain()
    .setTextSelection({ from: 0, to: currentEditor.state.doc.content.size })
    .unsetLanguageToolError()
    .run();
}

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
  // ⚠️  WICHTIG: activeErrors speichert RAW-Offsets (OHNE +1)
  // Die Error Navigator Anzeige braucht auch RAW-Offsets um korrekten Kontext zu zeigen
  // Keine -1 nötig, die Offsets sind bereits korrekt!
  const errors = Array.from(activeErrors.entries()).map(([errorId, data]) => ({
    errorId,
    from: data.from,  // RAW-Offset - keine Anpassung nötig
    to: data.to,      // RAW-Offset - keine Anpassung nötig
    message: data.message,
    suggestions: data.suggestions,
    errorText: data.errorText,
  })).sort((a, b) => a.from - b.from);

  // Get editor content to extract context around each error
  const { state } = currentEditor;
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
  console.log('Jumping to error:', errorId);

  // Find the error element in the editor (could be in .tiptap-editor)
  const errorElement = document.querySelector(`.lt-error[data-error-id="${errorId}"]`);

  if (!errorElement) {
    console.warn('Error element not found:', errorId);
    return;
  }

  console.log('Found error element, scrolling to it');

  // Get the editor container for smooth scrolling
  const editorContainer = document.querySelector('#editor');

  // Calculate position relative to editor
  const rect = errorElement.getBoundingClientRect();
  const editorRect = editorContainer.getBoundingClientRect();
  const targetScroll = editorContainer.scrollTop + (rect.top - editorRect.top) - (editorContainer.clientHeight / 2);

  // Scroll smoothly to center the error
  editorContainer.scrollTo({
    top: Math.max(0, targetScroll),
    behavior: 'smooth'
  });

  // Visual feedback - highlight the error
  setTimeout(() => {
    errorElement.style.transition = 'background-color 0.3s';
    const originalBg = window.getComputedStyle(errorElement).backgroundColor;
    errorElement.style.backgroundColor = '#ffeb3b';

    setTimeout(() => {
      errorElement.style.backgroundColor = originalBg;
    }, 600);
  }, 100);

  // Mark as active in error list
  document.querySelectorAll('.error-item').forEach(item => {
    item.classList.remove('active');
  });
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
  if (!currentFilePath || !currentEditor) {
    showStatus('Keine Datei geladen', 'error');
    return;
  }

  console.log('🔄 Checking next 2000 words...');
  await checkMultipleParagraphs(2000, false); // false = vom ersten ungeprüften Paragraph
});

// Button visuell aktivieren und Tooltip aktualisieren
const refreshBtn = document.querySelector('#languagetool-refresh');
if (refreshBtn) {
  refreshBtn.style.opacity = '1';
  refreshBtn.style.cursor = 'pointer';
  refreshBtn.setAttribute('title', 'Nächste 2000 Wörter prüfen');
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
    const { state } = currentEditor;
    const { $from, $to } = state.selection;

    // Getze die Selection nur auf den aktuellen Paragraph
    // Das verhindert, dass mehrere Zeilen mit formatiert werden
    const $paraStart = state.doc.resolve($from.before());
    const $paraEnd = state.doc.resolve($to.after());

    if (level === 0) {
      // Normaler Text
      currentEditor.chain()
        .focus()
        .setTextSelection({ from: $paraStart.pos, to: $paraEnd.pos })
        .setParagraph()
        .run();
    } else {
      // Überschrift Ebene 1-6
      currentEditor.chain()
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
  currentEditor.chain().focus().toggleCode().run();
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
  languageToolEnabled = !languageToolEnabled;

  const btn = document.querySelector('#languagetool-toggle');

  if (languageToolEnabled) {
    btn.classList.add('active');
    btn.setAttribute('title', 'LanguageTool ein (klicken zum Ausschalten)');
    console.log('LanguageTool aktiviert');

    // ⚠️  AUTOMATISCHER CHECK BEI AKTIVIERUNG ENTFERNT!
    //
    // Beim Einschalten von LanguageTool wird NICHT mehr automatisch geprüft.
    // User muss manuell über Kontextmenü Absätze prüfen.
    //
    // Alt (ENTFERNT):
    // if (currentFilePath) {
    //   runLanguageToolCheck();
    // }
  } else {
    btn.classList.remove('active');
    btn.setAttribute('title', 'LanguageTool aus (klicken zum Einschalten)');
    console.log('LanguageTool deaktiviert');
    // Alle Marks entfernen
    removeAllLanguageToolMarks();
    // Error-Map leeren
    activeErrors.clear();
    // Timer stoppen
    clearTimeout(languageToolTimer);
    // Status zurücksetzen
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

// LanguageTool Error Click Handler (mousedown um Links/Rechtsklick zu unterscheiden)
document.querySelector('#editor').addEventListener('mousedown', handleLanguageToolClick);

// LanguageTool Hover Tooltip
document.querySelector('#editor').addEventListener('mouseover', handleLanguageToolHover);
document.querySelector('#editor').addEventListener('mouseout', handleLanguageToolMouseOut);

// Scroll-basierte LanguageTool-Checks (DEAKTIVIERT - Performance-Problem!)
// document.querySelector('#editor').addEventListener('scroll', handleEditorScroll);

// Error Navigator - Update viewport errors on scroll (ENTFERNT - Radical Simplification)
// Siehe: REMOVED_FEATURES.md

// Synonym-Finder: Rechtsklick auf Editor
document.querySelector('#editor').addEventListener('contextmenu', handleSynonymContextMenu);

// LanguageTool: Tooltip schließen bei Rechtsklick auf Fehler-Wort
// Das ermöglicht dem Benutzer, das Wort direkt zu editieren wenn die
// Behebungsvorschläge keine passende Option bieten
document.querySelector('#editor').addEventListener('contextmenu', (event) => {
  // Wenn Rechtsklick auf einem .lt-error Element ist, Tooltip schließen
  const errorElement = event.target.closest('.lt-error');
  if (errorElement && !event.target.closest('.lt-error .lt-tooltip')) {
    // Tooltip schließen damit Benutzer das Wort direkt editieren kann
    removeTooltip();
    // Nicht preventDefault - lasse den normalen Kontextmenu-Handler weitermachen
  }
});

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

// Hilfsfunktion: Formatiert Wert für Anzeige
function formatMetadataValue(value) {
  // ISO-Timestamp erkennen und formatieren
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    const day = date.getDate();
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}. ${month} ${year}, ${hours}:${minutes}`;
  }

  // Andere Werte: JSON-formatiert
  return JSON.stringify(value, null, 2);
}

// Metadata anzeigen
function showMetadata() {
  if (!currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  const metadataEl = document.getElementById('metadata-content');

  if (Object.keys(currentFileMetadata).length === 0) {
    metadataEl.innerHTML = '<p style="color: #7f8c8d;">Keine Frontmatter-Metadaten vorhanden</p>';
  } else {
    let html = '';
    for (const [key, value] of Object.entries(currentFileMetadata)) {
      const formattedValue = formatMetadataValue(value);
      html += `<div class="meta-item">
        <span class="meta-key">${key}:</span>
        <span class="meta-value">${formattedValue}</span>
      </div>`;
    }
    metadataEl.innerHTML = html;
  }

  document.getElementById('metadata-modal').classList.add('active');
}

// Raw Markdown für aktuellen Absatz anzeigen (editierbar)
let currentNodePos = null; // Speichert Position des aktuellen Nodes
let currentNodeSize = null; // Speichert Größe des Nodes

function showRawMarkdown() {
  if (!currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  // Hole komplettes Markdown vom Editor (TipTap native)
  const markdown = currentEditor.getMarkdown();

  // Berechne ungefähre Cursor-Position im Markdown
  const { state } = currentEditor;
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
  currentEditor.commands.setContent(newMarkdown, { contentType: 'markdown' });

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

  // Verhindere Standard-Textauswahl bei Linksklick auf Fehler
  event.preventDefault();

  // Zeige Tooltip und fixiere ihn
  removeTooltip();
  handleLanguageToolHover(event);

  // Setze dragging auf true damit Tooltip fixiert bleibt
  tooltipDragState.dragging = true;
  tooltipDragState.fixed = true; // Neu: Markiere als fixiert
}

// Korrekturvorschlag anwenden
function applySuggestion(errorElement, suggestion) {
  // Save current scroll position
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement.scrollTop;

  // Hole Error-ID aus DOM
  const errorId = errorElement.getAttribute('data-error-id');

  if (!errorId || !activeErrors.has(errorId)) {
    console.warn('Error not found in activeErrors map:', errorId);
    return;
  }

  // Hole Fehler-Daten aus Map
  const errorData = activeErrors.get(errorId);
  const { from, to, errorText } = errorData;
  // from/to sind hier ROHE Offsets von LanguageTool (z.B. 0-5 für "Hallo")

  // ⚠️  KRITISCH: Berechne angepasste Offsets basierend auf bisherigen Korrektionen
  // OPTION B - OFFSET-TRACKING: Performance-optimiert für lange Texte
  //
  // Problem ohne Adjustment:
  //   Text: "Fluch Stralung Gedanke"
  //   Fehler 1: "Stralung" (offset 6-14) → Benutzer korrigiert zu "Strahlung"
  //   Fehler 2: "Gedanke" (offset 15-22) ← FALSCH! Sollte 16-23 sein wegen +1 Zeichen
  //
  // Lösung mit calculateAdjustedOffset():
  //   Fehler 2: offset 15-22 + adjustment +1 = 16-23 ✓
  const { adjustedFrom, adjustedTo, adjustment } = calculateAdjustedOffset(from, to);

  console.log(`Applying correction: original=${from}-${to}, adjusted=${adjustedFrom}-${adjustedTo}, delta=${adjustment}`);

  // WICHTIG: Entferne Fehler aus Map SOFORT
  activeErrors.delete(errorId);

  // Mark the error span with "pending" class to show verification is in progress
  // This gives immediate visual feedback that the correction was registered
  if (errorElement) {
    errorElement.classList.add('pending');
  }

  // Ersetze den Text und entferne die Fehlermarkierung
  // ⚠️  WICHTIG: activeErrors speichert Offsets BEREITS mit +1 für TipTap!
  // calculateAdjustedOffset() passt diese für bisherige Korrektionen an
  // Das Ergebnis können wir direkt verwenden ohne weitere Konvertierung
  //
  // REIHENFOLGE:
  // 1. Cursor auf fehlerhafte Stelle setzen (setTextSelection)
  // 2. Text ersetzen (insertContent) - ersetzt die Selection
  // 3. Mark entfernen (unsetLanguageToolError)
  // 4. Tracking aktualisieren: speichere diese Korrektur für zukünftige Adjustments

  console.log(`Applying correction at position ${adjustedFrom}-${adjustedTo}`);

  currentEditor
    .chain()
    .focus()
    .setTextSelection({ from: adjustedFrom, to: adjustedTo })  // ← Positions bereits mit +1!
    .insertContent(suggestion) // Ersetze den markierten Text mit Vorschlag
    .unsetLanguageToolError() // Dann: Entferne die Fehlermarkierung
    .run();

  // Speichere diese Korrektur für zukünftige Offset-Berechnungen
  // Das ist der Kern von Option B: Track die Längenänderungen, damit wir nachfolgende Fehler
  // korrekt positionieren können, OHNE LanguageTool neu aufzurufen (Performance!)
  // WICHTIG: Speichere die ROHEN Offsets (ohne +1), damit calculateAdjustedOffset korrekt funktioniert!
  const originalLength = to - from;
  const newLength = suggestion.length;
  const delta = newLength - originalLength;

  appliedCorrections.push({
    from: from,  // ← Raw offset (ohne +1)
    to: to,      // ← Raw offset (ohne +1)
    originalLength: originalLength,
    newLength: newLength,
    delta: delta
  });

  console.log(`Tracked correction: ${originalLength}→${newLength} chars (delta=${delta}, total corrections=${appliedCorrections.length})`);

  // Restore scroll position after a brief delay (to allow DOM to update)
  setTimeout(() => {
    editorElement.scrollTop = scrollTop;
  }, 10);

  // ⚠️  AUTOMATISCHER RECHECK ENTFERNT!
  //
  // Nach dem Anwenden einer Korrektur wird NICHT mehr automatisch neu geprüft.
  // User muss manuell über Kontextmenü den Absatz neu prüfen.
  //
  // Alt (ENTFERNT):
  // setTimeout(() => {
  //   if (languageToolEnabled) {
  //     runLanguageToolCheck();
  //   }
  // }, 1000);

  console.log('Applied suggestion:', suggestion, 'for error:', errorId);
}

// Wort ins persönliche Wörterbuch aufnehmen
function addToPersonalDictionary(word) {
  // Lade aktuelles Wörterbuch aus LocalStorage
  let personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');

  // Füge Wort hinzu (wenn noch nicht vorhanden)
  if (!personalDict.includes(word)) {
    personalDict.push(word);
    localStorage.setItem('personalDictionary', JSON.stringify(personalDict));
    console.log('Added to personal dictionary:', word);
    showStatus(`"${word}" ins Wörterbuch aufgenommen`, 'saved');
  } else {
    console.log('Word already in dictionary:', word);
    showStatus(`"${word}" bereits im Wörterbuch`, 'saved');
  }

  // ⚠️  AUTOMATISCHER RECHECK ENTFERNT!
  //
  // Nach dem Hinzufügen zum Wörterbuch wird NICHT mehr automatisch neu geprüft.
  // User muss manuell über Kontextmenü den Absatz neu prüfen.
  //
  // Alt (ENTFERNT):
  // setTimeout(() => runLanguageToolCheck(), 500);
}

// Synonym-Finder Tooltip
let synonymTooltipElement = null;

// Hover Tooltip anzeigen - LARGE VERSION with Drag-to-Select
let tooltipElement = null;
let tooltipDragState = { dragging: false, hoveredSuggestion: null, fixed: false };

function handleLanguageToolHover(event) {
  const target = event.target;
  const errorElement = target.closest('.lt-error');

  if (!errorElement) {
    // Kein Fehler → nur entfernen wenn nicht fixiert
    if (!tooltipDragState.fixed && !tooltipDragState.dragging) {
      removeTooltip();
    }
    return;
  }

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
    html += '<button class="btn-small btn-add-dict" data-word="' + errorElement.textContent + '">Ins Wörterbuch</button>';

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
  });

  tooltipElement.addEventListener('mouseleave', () => {
    tooltipDragState.dragging = false;
    // Entferne Tooltip nur wenn nicht fixiert
    if (!tooltipDragState.fixed) {
      removeTooltip();
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
    const word = errorElement.textContent;
    addToPersonalDictionary(word);
    removeTooltip();
  });

  // "Ignorieren" Button Handler
  tooltipElement.querySelector('.btn-ignore-tooltip')?.addEventListener('click', (e) => {
    e.stopPropagation();

    // Hole Error-ID aus DOM
    const errorId = errorElement.getAttribute('data-error-id');

    if (errorId && activeErrors.has(errorId)) {
      const errorData = activeErrors.get(errorId);

      // Fehler zur Ignore-Liste hinzufügen (ruleId + errorText)
      const errorKey = `${errorData.ruleId}:${errorData.errorText}`;

      const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');
      if (!ignoredErrors.includes(errorKey)) {
        ignoredErrors.push(errorKey);
        localStorage.setItem('ignoredLanguageToolErrors', JSON.stringify(ignoredErrors));
        console.log('Added to ignore list:', errorKey);
        showStatus(`Fehler ignoriert`, 'saved');
      }

      // Mark the error span with "pending" class to show verification is in progress
      if (errorElement) {
        errorElement.classList.add('pending');
      }

      // Entferne Mark korrekt aus TipTap Editor
      // WICHTIG: +1 weil TipTap/ProseMirror ein Document-Start-Node hat!
      currentEditor
        .chain()
        .setTextSelection({ from: errorData.from + 1, to: errorData.to + 1 })
        .unsetLanguageToolError()
        .run();

      // WICHTIG: Entferne Fehler aus Map
      activeErrors.delete(errorId);
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
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
    tooltipDragState.fixed = false; // Reset fixed state
    tooltipDragState.dragging = false; // Reset dragging state
    tooltipDragState.hoveredSuggestion = null; // Reset hover
  }
};

// Synonym-Finder: OpenThesaurus API aufrufen
async function fetchSynonyms(word) {
  try {
    const response = await fetch(`https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(word)}&format=application/json`);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data.synsets || data.synsets.length === 0) return [];

    // Sammle alle Synonyme aus allen Synsets
    const synonyms = [];
    data.synsets.forEach(synset => {
      synset.terms.forEach(term => {
        if (term.term.toLowerCase() !== word.toLowerCase()) {
          synonyms.push(term.term);
        }
      });
    });

    return synonyms.slice(0, 10); // Max 10 Synonyme
  } catch (error) {
    console.error('Error fetching synonyms:', error);
    return [];
  }
}

// Synonym-Tooltip anzeigen
async function showSynonymTooltip(word, x, y) {
  // Entferne alten Tooltip
  removeSynonymTooltip();

  // Zeige "Lädt..." Tooltip
  synonymTooltipElement = document.createElement('div');
  synonymTooltipElement.className = 'synonym-tooltip';
  synonymTooltipElement.innerHTML = '<div class="synonym-loading">Suche Synonyme...</div>';
  synonymTooltipElement.style.left = `${x}px`;
  synonymTooltipElement.style.top = `${y + 20}px`;
  document.body.appendChild(synonymTooltipElement);

  // Hole Synonyme
  const synonyms = await fetchSynonyms(word);

  if (synonyms.length === 0) {
    synonymTooltipElement.innerHTML = `
      <div class="synonym-header">
        Keine Synonyme gefunden für "${word}"
        <button class="synonym-close-btn" title="Schließen">×</button>
      </div>
    `;
    // Add close button listener
    synonymTooltipElement.querySelector('.synonym-close-btn').addEventListener('click', removeSynonymTooltip);
    return;
  }

  // Zeige Synonyme
  let html = `
    <div class="synonym-header">
      Synonyme für "${word}":
      <button class="synonym-close-btn" title="Schließen">×</button>
    </div>
    <div class="synonym-list">
  `;

  synonyms.forEach(synonym => {
    html += `<span class="synonym-item" data-word="${synonym}">${synonym}</span>`;
  });

  html += '</div>';
  synonymTooltipElement.innerHTML = html;

  // Event Listener für Close-Button
  synonymTooltipElement.querySelector('.synonym-close-btn').addEventListener('click', removeSynonymTooltip);

  // Event Listener für Synonym-Klick
  synonymTooltipElement.querySelectorAll('.synonym-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const selectedSynonym = e.target.dataset.word;
      replaceSynonym(word, selectedSynonym);
      removeSynonymTooltip();
    });
  });
}

// Synonym im Editor ersetzen
function replaceSynonym(oldWord, newWord) {
  const { state, view } = currentEditor;
  const { from, to } = state.selection;

  // Finde das Wort an der aktuellen Position
  const $pos = state.doc.resolve(from);
  const textNode = $pos.parent.childAfter($pos.parentOffset);

  if (!textNode || !textNode.node) return;

  const text = textNode.node.text || '';
  const wordStart = from - $pos.parentOffset + textNode.offset;
  const wordEnd = wordStart + text.length;

  // Ersetze das Wort
  currentEditor.chain()
    .focus()
    .setTextSelection({ from: wordStart, to: wordEnd })
    .insertContent(newWord)
    .run();
}

// Synonym-Tooltip entfernen
function removeSynonymTooltip() {
  if (synonymTooltipElement) {
    synonymTooltipElement.remove();
    synonymTooltipElement = null;
  }
}

// Rechtsklick-Event für Synonym-Finder
function handleSynonymContextMenu(event) {
  // Verhindere Standard-Kontextmenü
  event.preventDefault();

  // Ignoriere wenn LanguageTool-Fehler markiert ist (die haben ihr eigenes Menü)
  if (event.target.closest('.lt-error')) {
    return;
  }

  // Nur bei Rechtsklick über Text (nicht über Toolbar, etc.)
  if (!event.target.closest('.tiptap-editor')) {
    return;
  }

  const { state, view } = currentEditor;

  // Hole die Position bei Mausklick (mit Offset)
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });

  if (!pos) {
    // Kein pos gefunden - zeige trotzdem Context Menu
    showContextMenu(event.clientX, event.clientY);
    return;
  }

  const $pos = state.doc.resolve(pos.pos);
  const node = $pos.parent;

  // Wenn nicht in Text-Node - zeige Context Menu statt nichts zu tun
  if (!node.isText || !node.text) {
    showContextMenu(event.clientX, event.clientY);
    return;
  }

  const fullText = node.text;
  const offsetInNode = pos.pos - $pos.start();

  // Finde Wort-Grenzen: Buchstaben, Zahlen, Umlaute, ß
  const wordChar = /[a-zA-ZäöüÄÖÜß0-9]/;

  // Finde Start des Wortes (rückwärts von Cursor-Position)
  let start = offsetInNode;
  while (start > 0 && wordChar.test(fullText[start - 1])) {
    start--;
  }

  // Finde Ende des Wortes (vorwärts von Cursor-Position)
  let end = offsetInNode;
  while (end < fullText.length && wordChar.test(fullText[end])) {
    end++;
  }

  // Stelle sicher, dass Cursor tatsächlich im Wort ist
  if (offsetInNode < start || offsetInNode > end) {
    // Wenn nicht im Wort, zeige Copy/Paste Context Menu
    showContextMenu(event.clientX, event.clientY);
    return;
  }

  const word = fullText.substring(start, end).trim();

  // Wenn Wort mindestens 3 Zeichen hat, zeige Synonyme
  if (word.length >= 3) {
    console.log(`Synonym search for word: "${word}" at position ${pos.pos}`);
    showSynonymTooltip(word, event.clientX, event.clientY);
  } else {
    // Zu kurzes Wort - zeige nur Copy/Paste Menu
    showContextMenu(event.clientX, event.clientY);
  }
}

// Context Menu für Copy/Paste (rechtsklick auf normalem Text)
let contextMenuElement = null;

function showContextMenu(x, y) {
  // Entferne altes Context Menu wenn vorhanden
  if (contextMenuElement) {
    contextMenuElement.remove();
  }

  // Erstelle neues Context Menu mit LanguageTool-Check als ERSTE Option
  contextMenuElement = document.createElement('div');
  contextMenuElement.className = 'context-menu';
  contextMenuElement.innerHTML = `
    <button class="context-menu-item" onclick="checkCurrentParagraph()" style="font-weight: bold; background-color: rgba(39, 174, 96, 0.1);">✓ Diesen Absatz prüfen</button>
    <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    <button class="context-menu-item" onclick="copySelection()">Kopieren</button>
    <button class="context-menu-item" onclick="pasteContent()">Einfügen</button>
  `;
  contextMenuElement.style.position = 'fixed';
  contextMenuElement.style.left = x + 'px';
  contextMenuElement.style.top = y + 'px';
  contextMenuElement.style.zIndex = '1000';

  document.body.appendChild(contextMenuElement);

  // Schließe Menu wenn irgendwo anders geklickt wird
  document.addEventListener('click', closeContextMenu);
}

function closeContextMenu() {
  if (contextMenuElement) {
    contextMenuElement.remove();
    contextMenuElement = null;
  }
  document.removeEventListener('click', closeContextMenu);
}

function copySelection() {
  const { state } = currentEditor;
  const { $from, $to } = state.selection;

  if ($from.pos !== $to.pos) {
    // Text ist selektiert - kopiere Selection
    const selectedText = state.doc.textBetween($from.pos, $to.pos, '\n');
    navigator.clipboard.writeText(selectedText).then(() => {
      console.log('Text copied to clipboard');
    });
  } else {
    // Kein Text selektiert - versuche Wort zu kopieren
    const { parent, parentOffset } = $from;
    if (parent.isText) {
      const text = parent.text;
      // Finde Wort-Grenzen
      const wordChar = /[a-zA-ZäöüÄÖÜß0-9]/;
      let start = parentOffset;
      while (start > 0 && wordChar.test(text[start - 1])) {
        start--;
      }
      let end = parentOffset;
      while (end < text.length && wordChar.test(text[end])) {
        end++;
      }
      if (start !== end) {
        const word = text.substring(start, end);
        navigator.clipboard.writeText(word);
        console.log('Word copied:', word);
      }
    }
  }
  closeContextMenu();
}

async function pasteContent() {
  try {
    const text = await navigator.clipboard.readText();
    currentEditor.chain().focus().insertContent(text).run();
    console.log('Content pasted');
  } catch (err) {
    console.error('Paste failed:', err);
  }
  closeContextMenu();
}

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

  if (!currentFilePath || !currentEditor) {
    console.warn('No file loaded or editor not ready');
    return;
  }

  const { state } = currentEditor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);

  // Finde den aktuellen Paragraph
  let paragraphDepth = $from.depth;
  let currentNode = null;
  while (paragraphDepth > 0) {
    const node = $from.node(paragraphDepth);
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      currentNode = node;
      break;
    }
    // Überspringe CodeBlocks (Frontmatter wird oft als CodeBlock gerendert)
    if (node.type.name === 'codeBlock') {
      console.log('Skipping code block (likely frontmatter)');
      showStatus('Code-Block übersprungen', 'info');
      return;
    }
    paragraphDepth--;
  }

  if (paragraphDepth === 0) {
    console.warn('Not inside a paragraph');
    showStatus('Kein Absatz gefunden', 'error');
    return;
  }

  const paragraphStart = $from.before(paragraphDepth);
  const paragraphEnd = $from.after(paragraphDepth);

  // Extrahiere Text des Paragraphs
  const paragraphText = state.doc.textBetween(paragraphStart, paragraphEnd, ' ');

  if (!paragraphText.trim()) {
    console.log('Paragraph is empty');
    showStatus('Absatz ist leer', 'info');
    return;
  }

  // ============================================================================
  // FRONTMATTER DETECTION: Überspringe YAML Frontmatter
  // ============================================================================
  //
  // Frontmatter steht am Anfang der Datei zwischen --- Markern:
  //   ---
  //   lastEdit: 2025-10-27
  //   ---
  //
  // Problem: LanguageTool findet "Fehler" in YAML-Keys wie "lastEdit", "zoomLevel"
  // Lösung: Erkenne Frontmatter-Blöcke und überspringe sie
  //
  // ERKENNUNG:
  // - Paragraph beginnt mit "---" oder enthält YAML-typische Keys
  // - Oder: Paragraph ist in den ersten ~200 Zeichen des Dokuments und enthält ":"
  // ============================================================================

  const isFrontmatter = (
    // Explizit: Startet mit "---" (YAML delimiter)
    paragraphText.trim().startsWith('---') ||
    // Implizit: Früh im Dokument + YAML-typische Keys
    (paragraphStart < 200 && (
      paragraphText.includes('lastEdit:') ||
      paragraphText.includes('lastPosition:') ||
      paragraphText.includes('zoomLevel:') ||
      paragraphText.includes('scrollPosition:') ||
      paragraphText.includes('language:') ||
      // Generic: Key-Value Pattern mit Einrückung
      /^\s*[a-zA-Z_]+:\s*/.test(paragraphText)
    ))
  );

  if (isFrontmatter) {
    console.log('Skipping frontmatter paragraph');
    showStatus('Frontmatter übersprungen', 'info');
    return;
  }

  console.log(`Checking paragraph (${paragraphStart}-${paragraphEnd}): "${paragraphText.substring(0, 50)}..."`);
  showStatus('Prüfe Absatz...', 'checking');

  // Sprache aus Metadaten oder Dropdown holen
  const language = currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

  // LanguageTool API Call
  const matches = await checkText(paragraphText, language);

  if (matches.length === 0) {
    console.log('No errors in paragraph');
    showStatus('Keine Fehler', 'no-errors');

    // Markiere Paragraph als geprüft (grün)
    currentEditor
      .chain()
      .setTextSelection({ from: paragraphStart, to: paragraphEnd })
      .setCheckedParagraph({ checkedAt: new Date().toISOString() })
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .run();

    // Speichere in Frontmatter (persistent)
    saveCheckedParagraph(paragraphText);

    // Cursor zurücksetzen
    currentEditor.commands.setTextSelection({ from, to: from });
    return;
  }

  // Filtere Fehler basierend auf persönlichem Wörterbuch und ignorierten Fehlern
  const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');
  const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');

  const filteredMatches = matches.filter(match => {
    const errorText = paragraphText.substring(match.offset, match.offset + match.length);

    if (personalDict.includes(errorText)) {
      return false;
    }

    const errorKey = `${match.rule.id}:${errorText}`;
    if (ignoredErrors.includes(errorKey)) {
      return false;
    }

    return true;
  });

  if (filteredMatches.length === 0) {
    console.log('All errors in paragraph are in dictionary');
    showStatus('Keine Fehler', 'no-errors');

    // Markiere als geprüft
    currentEditor
      .chain()
      .setTextSelection({ from: paragraphStart, to: paragraphEnd })
      .setCheckedParagraph({ checkedAt: new Date().toISOString() })
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .run();

    // Speichere in Frontmatter (persistent)
    saveCheckedParagraph(paragraphText);

    currentEditor.commands.setTextSelection({ from, to: from });
    return;
  }

  console.log(`Found ${filteredMatches.length} errors in paragraph`);
  showStatus(`${filteredMatches.length} Fehler im Absatz`, 'has-errors');

  // FLAG SETZEN: Wir setzen Marks
  isApplyingLanguageToolMarks = true;

  // Entferne alte Error-Marks NUR aus diesem Paragraph
  currentEditor
    .chain()
    .setTextSelection({ from: paragraphStart, to: paragraphEnd })
    .unsetLanguageToolError()
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true)
    .run();

  // Setze neue Error-Marks
  filteredMatches.forEach((match, index) => {
    const mark = convertMatchToMark(match, paragraphText);

    // Offsets sind relativ zum Paragraph-Text (0-basiert)
    // Konvertiere zu TipTap Doc-Positionen:
    // - paragraphStart ist die Doc-Position VOR dem Paragraph
    // - +1 um IN den Paragraph zu kommen
    // - +mark.from für die Position im Text
    const errorFrom = paragraphStart + 1 + mark.from;
    const errorTo = paragraphStart + 1 + mark.to;
    const errorText = paragraphText.substring(mark.from, mark.to);

    // Überprüfe ob Position gültig ist
    if (errorFrom >= paragraphStart && errorTo <= paragraphEnd && errorFrom < errorTo) {
      const errorId = generateErrorId(mark.ruleId, errorText, errorFrom);

      // Speichere in activeErrors Map
      activeErrors.set(errorId, {
        match: match,
        from: errorFrom,
        to: errorTo,
        errorText: errorText,
        ruleId: mark.ruleId,
        message: mark.message,
        suggestions: mark.suggestions,
        category: mark.category,
      });

      // Setze Mark im Editor
      currentEditor
        .chain()
        .setTextSelection({ from: errorFrom, to: errorTo })
        .setLanguageToolError({
          errorId: errorId,
          message: mark.message,
          suggestions: JSON.stringify(mark.suggestions),
          category: mark.category,
          ruleId: mark.ruleId,
        })
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();

      console.log(`Error ${index + 1}: ${errorFrom}-${errorTo}, text="${errorText}"`);
    }
  });

  // Markiere Paragraph als geprüft (grün) - mit TipTap Mark
  console.log(`🟢 Setting green background for paragraph ${paragraphStart}-${paragraphEnd}`);

  currentEditor
    .chain()
    .setTextSelection({ from: paragraphStart, to: paragraphEnd })
    .setCheckedParagraph({ checkedAt: new Date().toISOString() })
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true)
    .run();

  // Speichere in Frontmatter (persistent)
  saveCheckedParagraph(paragraphText);

  // WICHTIG: Cursor SOFORT zurücksetzen (nicht Selection erweitern)
  // Setze Cursor-Position (collapse selection to a point)
  setTimeout(() => {
    currentEditor.commands.setTextSelection(from);
    currentEditor.commands.focus();
  }, 10);

  // FLAG ZURÜCKSETZEN
  isApplyingLanguageToolMarks = false;

  console.log('✅ Paragraph check complete');
}

// ⚠️  SCROLL-BASIERTER AUTOMATIC CHECK ENTFERNT!
//
// Der intelligente Background-Check beim Scrollen wurde entfernt.
// User muss manuell über Kontextmenü Absätze prüfen.
//
// Alt (ENTFERNT):
// function handleEditorScroll() {
//   if (!languageToolEnabled || !currentFilePath) return;
//   const editorElement = document.querySelector('#editor');
//   const currentScrollPosition = editorElement.scrollTop;
//   lastScrollPosition = currentScrollPosition;
//   clearTimeout(languageToolScrollTimer);
//   languageToolScrollTimer = setTimeout(() => {
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
        currentWorkingDir = lastFolder.path;
        folderLoaded = true;
      } else {
        console.warn('Last folder not available or empty (maybe network drive offline):', lastFolder.path);
      }
    }

    if (!folderLoaded) {
      console.log('Using home directory as fallback:', homeDir);
      currentWorkingDir = homeDir;
    }

    await loadFileTree();

    // Lade letzte Datei, falls vorhanden (mit Error Handling für nicht verfügbare Pfade)
    const lastFile = history.find(item => item.type === 'file');
    if (lastFile) {
      const fileName = lastFile.path.split('/').pop();
      // Nur laden, wenn Datei verfügbar ist (keine Exception werfen)
      await loadFile(lastFile.path, fileName);
    }
  } else {
    // Fallback: Home-Verzeichnis laden
    currentWorkingDir = homeDir;
    await loadFileTree();
  }
}

// Initial laden
loadInitialState();

// Preload API check
if (window.api) {
  console.log('Preload API verfügbar');
} else {
  console.error('Preload API nicht verfügbar!');
}

// ============================================
// RECENT ITEMS FEATURE
// ============================================

const recentItemsBtn = document.getElementById('recent-items-btn');
const recentItemsDropdown = document.getElementById('recent-items-dropdown');

// Toggle dropdown
recentItemsBtn.addEventListener('click', async (e) => {
  e.stopPropagation();

  if (recentItemsDropdown.classList.contains('hidden')) {
    await loadRecentItems();
    recentItemsDropdown.classList.remove('hidden');
  } else {
    recentItemsDropdown.classList.add('hidden');
  }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!recentItemsDropdown.contains(e.target) && e.target !== recentItemsBtn) {
    recentItemsDropdown.classList.add('hidden');
  }
});

// Load and display recent items
async function loadRecentItems() {
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

  // Build dropdown HTML
  const html = items.map(item => {
    const icon = item.type === 'file' ? 'description' : 'folder';
    return `
      <div class="dropdown-item" data-type="${item.type}" data-path="${item.path}" title="${item.path}">
        <span class="material-icons">${icon}</span>
        <span class="item-name">${item.name}</span>
      </div>
    `;
  }).join('');

  recentItemsDropdown.innerHTML = html;

  // Add click handlers
  const dropdownItems = recentItemsDropdown.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      const type = item.dataset.type;
      const path = item.dataset.path;

      // Close dropdown
      recentItemsDropdown.classList.add('hidden');

      if (type === 'file') {
        const fileName = path.split('/').pop();
        await loadFile(path, fileName);
      } else if (type === 'folder') {
        currentWorkingDir = path;
        await loadFileTree();
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

// Neue Datei erstellen
async function createNewFile() {
  if (!currentWorkingDir) {
    alert('Kein Arbeitsverzeichnis ausgewählt');
    return;
  }

  const fileName = prompt('Name der neuen Datei (inkl. .md Endung):');
  if (!fileName) return;

  // Sicherstellen dass .md Endung vorhanden ist
  const finalFileName = fileName.endsWith('.md') ? fileName : fileName + '.md';

  // Initiales Frontmatter
  const initialContent = `---
lastEdit: ${new Date().toISOString()}
language: de-CH
---

# ${finalFileName.replace('.md', '')}

`;

  const result = await window.api.createFile(currentWorkingDir, finalFileName, initialContent);

  if (!result.success) {
    alert('Fehler beim Erstellen der Datei: ' + result.error);
    return;
  }

  console.log('File created:', result.filePath);
  showStatus('Datei erstellt', 'saved');

  // File Tree neu laden
  await loadFileTree();

  // Neue Datei öffnen
  await loadFile(result.filePath, finalFileName);
}

// Datei unter neuem Namen speichern
async function saveFileAs() {
  if (!currentFilePath) {
    alert('Keine Datei geladen');
    return;
  }

  const currentFileName = currentFilePath.split('/').pop();
  const newFileName = prompt('Neuer Dateiname:', currentFileName);
  if (!newFileName || newFileName === currentFileName) return;

  // Sicherstellen dass .md Endung vorhanden ist
  const finalFileName = newFileName.endsWith('.md') ? newFileName : newFileName + '.md';

  // Neuer Pfad im gleichen Verzeichnis
  const dirPath = currentFilePath.split('/').slice(0, -1).join('/');
  const newFilePath = `${dirPath}/${finalFileName}`;

  // Current content holen (native TipTap)
  const markdown = currentEditor.getMarkdown();
  const updatedMetadata = {
    ...currentFileMetadata,
    lastEdit: new Date().toISOString(),
  };
  const fileContent = stringifyFile(updatedMetadata, markdown);

  // Neue Datei erstellen
  const result = await window.api.createFile(dirPath, finalFileName, fileContent);

  if (!result.success) {
    alert('Fehler beim Speichern: ' + result.error);
    return;
  }

  console.log('File saved as:', result.filePath);
  showStatus('Gespeichert unter neuem Namen', 'saved');

  // File Tree neu laden
  await loadFileTree();

  // Neue Datei öffnen
  currentFilePath = result.filePath;
  await loadFile(result.filePath, finalFileName);
}

// Datei umbenennen
async function renameFile() {
  if (!currentFilePath) {
    alert('Keine Datei geladen');
    return;
  }

  const currentFileName = currentFilePath.split('/').pop();
  const newFileName = prompt('Neuer Dateiname:', currentFileName);
  if (!newFileName || newFileName === currentFileName) return;

  // Sicherstellen dass .md Endung vorhanden ist
  const finalFileName = newFileName.endsWith('.md') ? newFileName : newFileName + '.md';

  // Neuer Pfad
  const dirPath = currentFilePath.split('/').slice(0, -1).join('/');
  const newFilePath = `${dirPath}/${finalFileName}`;

  const result = await window.api.renameFile(currentFilePath, newFilePath);

  if (!result.success) {
    alert('Fehler beim Umbenennen: ' + result.error);
    return;
  }

  console.log('File renamed:', newFilePath);
  showStatus('Datei umbenannt', 'saved');

  // Update current file path
  currentFilePath = newFilePath;

  // Update window title
  await window.api.setWindowTitle(finalFileName);

  // Update filename display
  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = finalFileName;
  }

  // File Tree neu laden
  await loadFileTree();

  // Active state in File Tree setzen
  document.querySelectorAll('.tree-file').forEach(item => {
    item.classList.remove('active');
  });
  const activeFile = document.querySelector(`[data-path="${newFilePath}"]`);
  if (activeFile) {
    activeFile.classList.add('active');
  }
}

// Datei löschen
async function deleteFile() {
  if (!currentFilePath) {
    alert('Keine Datei geladen');
    return;
  }

  const currentFileName = currentFilePath.split('/').pop();
  const confirmed = confirm(`Datei "${currentFileName}" wirklich löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`);
  if (!confirmed) return;

  const result = await window.api.deleteFile(currentFilePath);

  if (!result.success) {
    alert('Fehler beim Löschen: ' + result.error);
    return;
  }

  console.log('File deleted:', currentFilePath);
  showStatus('Datei gelöscht', 'saved');

  // Reset state
  currentFilePath = null;
  currentFileMetadata = {};
  currentEditor.commands.setContent('<p>Datei wurde gelöscht.</p>');

  // Update window title
  await window.api.setWindowTitle('TipTap AI');

  // Update filename display
  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = 'Keine Datei';
  }

  // File Tree neu laden
  await loadFileTree();
}

// ============================================
// ZOOM FUNCTIONALITY
// ============================================

function zoomIn() {
  currentZoomLevel = Math.min(currentZoomLevel + 10, 200); // Max 200%
  applyZoom();
}

function zoomOut() {
  currentZoomLevel = Math.max(currentZoomLevel - 10, 50); // Min 50%
  applyZoom();
}

function resetZoom() {
  currentZoomLevel = 100;
  applyZoom();
}

function applyZoom() {
  const editorElement = document.querySelector('#editor .tiptap-editor');
  const editorContainer = document.querySelector('#editor');

  if (editorElement && editorContainer) {
    // Verwende font-size auf dem Editor für dynamisches Text-Reflow
    // Das ermöglicht dass Text bei Zoom-Änderungen neu umbricht
    // Alle relativen Einheiten (rem, em, %) skalieren automatisch proportional
    editorElement.style.fontSize = `${currentZoomLevel}%`;

    // Optional: Füge auch eine leichte width-Anpassung hinzu für besseres Reflow
    // Das verhindert horizontales Scrollen bei höheren Zoom-Levels
    // Width bleibt 100% des Containers, aber der Container passt sich an
  }
  console.log('Zoom level:', currentZoomLevel + '%');
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

// ============================================
// FIND & REPLACE FUNCTIONALITY
// ============================================

let currentSearchIndex = 0;
let searchMatches = [];

// ============================================
// TYPOGRAPHIC REPLACEMENT HELPER FUNCTIONS
// ============================================

/**
 * Extract code blocks from text to protect them from replacements
 * Returns: { text: cleaned text, codeBlocks: array of {start, end, content} }
 */
function extractCodeBlocks(text) {
  const codeBlocks = [];
  let cleanedText = text;
  let offset = 0;

  // Match code blocks: ``` ... ```
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push({
      start: match.index - offset,
      end: match.index + match[0].length - offset,
      content: match[0]
    });
  }

  return { text: cleanedText, codeBlocks };
}

/**
 * Extract all quote pairs from text (handling any quote type)
 * Returns array of {openPos, closePos, text} for each quote pair
 * Treats quotes as alternating: 1st quote = opening, 2nd = closing, 3rd = opening, etc.
 */
function extractQuotePairs(text) {
  const quoteChars = /["\u201C\u201D„«»\u2018\u2019‹›]/g;
  const pairs = [];
  let match;
  const positions = [];

  // Find all quote positions
  while ((match = quoteChars.exec(text)) !== null) {
    positions.push(match.index);
  }

  // Group into pairs (opening + closing)
  for (let i = 0; i < positions.length - 1; i += 2) {
    const openPos = positions[i];
    const closePos = positions[i + 1];

    // Extract text between quotes (excluding the quote characters themselves)
    const quotedText = text.substring(openPos + 1, closePos);

    pairs.push({
      openPos,
      closePos,
      text: quotedText
    });
  }

  return pairs;
}

/**
 * Replace quotation marks intelligently using pair-based approach
 * - Extracts opening and closing quote pairs
 * - Replaces both quotes with correct target language formatting
 * - Handles any input quote format
 * - Validates no leftover markers remain
 */
function replaceQuotationMarks(text) {
  const language = currentFileMetadata.language || document.querySelector('#language-selector')?.value || 'de-CH';

  // Protect code blocks
  const { text: cleanedText, codeBlocks } = extractCodeBlocks(text);

  // Extract quote pairs from text
  const pairs = extractQuotePairs(cleanedText);

  if (pairs.length === 0) {
    // No quotes found, return unchanged
    return cleanedText;
  }

  // Determine opening and closing quotes for target language
  let openQuote, closeQuote;

  if (language === 'de-CH' || language.startsWith('de-CH')) {
    // Swiss German: « » (without extra spaces)
    openQuote = '«';
    closeQuote = '»';
  } else if (language === 'de-DE' || language.startsWith('de-DE')) {
    // German: „ "
    openQuote = '„';
    closeQuote = '"';
  } else if (language === 'en-US' || language === 'en-GB' || language.startsWith('en-')) {
    // English: "" (curly quotes)
    openQuote = '"';
    closeQuote = '"';
  } else {
    // Default to German
    openQuote = '„';
    closeQuote = '"';
  }

  // Replace pairs from end to start (to preserve earlier positions)
  let result = cleanedText;

  for (let i = pairs.length - 1; i >= 0; i--) {
    const pair = pairs[i];
    const oldText = cleanedText.substring(pair.openPos, pair.closePos + 1);
    const newText = openQuote + pair.text + closeQuote;

    result = result.substring(0, pair.openPos) + newText + result.substring(pair.closePos + 1);
  }

  // Validation: Check for leftover markers
  if (result.includes('◊') || result.includes('◆')) {
    console.warn('Warning: Leftover quote markers found in output!');
    console.warn('Text segment:', result.substring(0, 200));
  }

  return result;
}

/**
 * Replace double dashes (--) with em-dash (—)
 */
function replaceDoubleDash(text) {
  // Protect code blocks
  const { text: cleanedText, codeBlocks } = extractCodeBlocks(text);

  // Replace -- with —
  let result = cleanedText.replace(/--/g, '—');

  return result;
}

/**
 * Replace dashes with spaces (space-dash-space or dash-space at line start) with em-dash
 * Patterns: " - " → " — " and line start "- " → "— "
 */
function replaceDashSpaces(text) {
  // Protect code blocks
  const { text: cleanedText, codeBlocks } = extractCodeBlocks(text);

  let result = cleanedText;

  // Replace " - " with " — "
  result = result.replace(/ - /g, ' — ');

  // Replace "- " at line start with "— "
  result = result.replace(/^\- /gm, '— ');

  return result;
}

function showFindReplace() {
  document.getElementById('find-replace-modal').classList.add('active');
  document.getElementById('find-input').focus();
}

function findNext() {
  const findInput = document.getElementById('find-input');
  const searchText = findInput.value;

  if (!searchText) {
    updateFindReplaceStatus('Bitte Suchtext eingeben');
    return;
  }

  const editorText = currentEditor.getText();
  const matches = [];
  let index = 0;

  // Find all matches
  while ((index = editorText.indexOf(searchText, index)) !== -1) {
    matches.push(index);
    index += searchText.length;
  }

  if (matches.length === 0) {
    updateFindReplaceStatus('Keine Treffer gefunden');
    return;
  }

  searchMatches = matches;
  currentSearchIndex = (currentSearchIndex + 1) % matches.length;

  const matchPos = matches[currentSearchIndex];

  // Select the found text
  currentEditor.commands.setTextSelection({
    from: matchPos + 1,
    to: matchPos + searchText.length + 1
  });

  // Scroll to selection
  currentEditor.commands.focus();

  updateFindReplaceStatus(`Treffer ${currentSearchIndex + 1} von ${matches.length}`);
}

function replaceCurrent() {
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const searchText = findInput.value;
  let replaceText = replaceInput.value;

  if (!searchText) {
    updateFindReplaceStatus('Bitte Suchtext eingeben');
    return;
  }

  // Check ß→ss option
  const replaceEszett = document.getElementById('replace-eszett').checked;
  if (replaceEszett) {
    replaceText = replaceText.replace(/ß/g, 'ss');
  }

  const selection = currentEditor.state.selection;
  const selectedText = currentEditor.state.doc.textBetween(selection.from, selection.to);

  if (selectedText === searchText) {
    currentEditor.commands.insertContent(replaceText);
    updateFindReplaceStatus('Ersetzt');
    // Find next
    setTimeout(() => findNext(), 100);
  } else {
    updateFindReplaceStatus('Bitte zuerst suchen');
  }
}

function replaceAll() {
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const searchText = findInput.value;
  let replaceText = replaceInput.value;

  if (!searchText) {
    updateFindReplaceStatus('Bitte Suchtext eingeben');
    return;
  }

  // Check ß→ss option
  const replaceEszett = document.getElementById('replace-eszett').checked;
  if (replaceEszett) {
    replaceText = replaceText.replace(/ß/g, 'ss');
  }

  // WICHTIG: Markdown holen (native TipTap), dann ersetzen!
  const markdown = currentEditor.getMarkdown();
  let count = 0;
  let newMarkdown = markdown;

  // Replace all occurrences im Markdown
  const regex = new RegExp(escapeRegex(searchText), 'g');
  newMarkdown = newMarkdown.replace(regex, () => {
    count++;
    return replaceText;
  });

  // Apply typographic replacements if checkboxes are enabled
  const replaceQuotationMarksCheckbox = document.getElementById('replace-quotation-marks').checked;
  const replaceDoubleDashCheckbox = document.getElementById('replace-double-dash').checked;
  const replaceDashSpacesCheckbox = document.getElementById('replace-dash-spaces').checked;

  if (replaceQuotationMarksCheckbox) {
    newMarkdown = replaceQuotationMarks(newMarkdown);
  }

  if (replaceDoubleDashCheckbox) {
    newMarkdown = replaceDoubleDash(newMarkdown);
  }

  if (replaceDashSpacesCheckbox) {
    newMarkdown = replaceDashSpaces(newMarkdown);
  }

  if (count > 0 || replaceQuotationMarksCheckbox || replaceDoubleDashCheckbox || replaceDashSpacesCheckbox) {
    // Markdown zurück zu HTML konvertieren und in Editor setzen
    const newHTML = markdownToHTML(newMarkdown);
    currentEditor.commands.setContent(newHTML);
    const replacementTypes = [];
    if (count > 0) replacementTypes.push(`${count} Text-Ersetzungen`);
    if (replaceQuotationMarksCheckbox) replacementTypes.push('Anführungszeichen');
    if (replaceDoubleDashCheckbox) replacementTypes.push('Doppel-Bindestriche');
    if (replaceDashSpacesCheckbox) replacementTypes.push('Bindestrich-Abstände');
    updateFindReplaceStatus(`${replacementTypes.join(', ')} ersetzt`);
  } else {
    updateFindReplaceStatus('Keine Treffer gefunden');
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateFindReplaceStatus(message) {
  const statusEl = document.getElementById('find-replace-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

// Find & Replace button handlers
const findNextBtn = document.getElementById('find-next-btn');
const replaceBtn = document.getElementById('replace-btn');
const replaceAllBtn = document.getElementById('replace-all-btn');

console.log('Find & Replace buttons:', { findNextBtn, replaceBtn, replaceAllBtn });

if (findNextBtn) {
  findNextBtn.addEventListener('click', findNext);
  console.log('findNext event listener registered');
} else {
  console.error('find-next-btn not found!');
}

if (replaceBtn) {
  replaceBtn.addEventListener('click', replaceCurrent);
  console.log('replaceCurrent event listener registered');
} else {
  console.error('replace-btn not found!');
}

if (replaceAllBtn) {
  replaceAllBtn.addEventListener('click', replaceAll);
  console.log('replaceAll event listener registered');
} else {
  console.error('replace-all-btn not found!');
}

// Eszett-Checkbox: Felder automatisch ausfüllen
const replaceEszettCheckbox = document.getElementById('replace-eszett');
if (replaceEszettCheckbox) {
  replaceEszettCheckbox.addEventListener('change', (e) => {
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');

    if (e.target.checked) {
      // Checkbox aktiviert: ß ins Suchfeld, ss ins Ersetzen-Feld
      findInput.value = 'ß';
      replaceInput.value = 'ss';
      console.log('Eszett-Modus aktiviert: ß → ss');
    } else {
      // Checkbox deaktiviert: Felder leeren
      findInput.value = '';
      replaceInput.value = '';
      console.log('Eszett-Modus deaktiviert');
    }
  });
  console.log('replace-eszett event listener registered');
} else {
  console.error('replace-eszett checkbox not found!');
}

// Quotation marks checkbox - just for info display (actual replacement happens in replaceAll)
const replaceQuotationMarksCheckbox = document.getElementById('replace-quotation-marks');
if (replaceQuotationMarksCheckbox) {
  replaceQuotationMarksCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      console.log('Quotation marks replacement enabled (will apply on Replace All)');
    } else {
      console.log('Quotation marks replacement disabled');
    }
  });
  console.log('replace-quotation-marks event listener registered');
} else {
  console.error('replace-quotation-marks checkbox not found!');
}

// Double dash checkbox - just for info display
const replaceDoubleDashCheckbox = document.getElementById('replace-double-dash');
if (replaceDoubleDashCheckbox) {
  replaceDoubleDashCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      console.log('Double dash replacement enabled (-- → —)');
    } else {
      console.log('Double dash replacement disabled');
    }
  });
  console.log('replace-double-dash event listener registered');
} else {
  console.error('replace-double-dash checkbox not found!');
}

// Dash spaces checkbox - just for info display
const replaceDashSpacesCheckbox = document.getElementById('replace-dash-spaces');
if (replaceDashSpacesCheckbox) {
  replaceDashSpacesCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      console.log('Dash spaces replacement enabled ( - → —)');
    } else {
      console.log('Dash spaces replacement disabled');
    }
  });
  console.log('replace-dash-spaces event listener registered');
} else {
  console.error('replace-dash-spaces checkbox not found!');
}

// ============================================================================
// GLOBAL EXPORTS: Funktionen für onclick-Handler verfügbar machen
// ============================================================================
//
// Da app.js ein ES Module ist, sind Funktionen nicht automatisch im globalen
// window-Scope verfügbar. Für onclick="functionName()" müssen wir sie explizit
// exportieren.
//
// WICHTIG: Diese Funktionen werden vom Context Menu (innerHTML mit onclick)
// aufgerufen und müssen daher global verfügbar sein.
// ============================================================================

window.copySelection = copySelection;
window.pasteContent = pasteContent;
window.checkCurrentParagraph = checkCurrentParagraph;
