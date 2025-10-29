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
import {
  checkDocumentWithAnnotation,
  convertMatchToMark as convertMatchToMarkAnnotation
} from './languagetool-annotation.js';
import { simpleHash, generateParagraphId } from './utils/hash.js';
import { generateErrorId } from './utils/error-id.js';
import State from './editor/editor-state.js';
import { showStatus, updateLanguageToolStatus } from './ui/status.js';
import {
  saveCheckedParagraph,
  isParagraphChecked,
  removeParagraphFromChecked,
  restoreCheckedParagraphs,
  removeAllCheckedParagraphMarks
} from './languagetool/paragraph-storage.js';

console.log('Renderer Process geladen - Sprint 1.2');

// ============================================================================
// FEATURE FLAG: Annotation System
// ============================================================================
// Set to true to use the new LanguageTool Annotation API (better offset handling)
// Set to false to use the old plain-text API (current/stable)
const USE_ANNOTATION_SYSTEM = true;
console.log('🚩 Feature Flag: USE_ANNOTATION_SYSTEM =', USE_ANNOTATION_SYSTEM);

// Update GUI indicator
function updateSystemIndicator() {
  const indicator = document.querySelector('#lt-system-indicator');
  const label = indicator?.querySelector('.system-label');

  if (indicator && label) {
    if (USE_ANNOTATION_SYSTEM) {
      indicator.className = 'system-indicator annotation-system';
      label.textContent = 'Annotation';
      indicator.title = 'LanguageTool Annotation System (NEU) - Besseres Offset-Handling';
    } else {
      indicator.className = 'system-indicator plaintext-system';
      label.textContent = 'Plain Text';
      indicator.title = 'LanguageTool Plain Text System (ALT) - Fallback-Modus';
    }
  }
}

// Call on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateSystemIndicator);
} else {
  updateSystemIndicator();
}
// ============================================================================

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
// progressiveCheckAbortController managed via State module

async function checkParagraphsProgressively(maxWords = 2000, startFromBeginning = false) {
  if (!State.currentEditor || !State.currentFilePath) {
    console.warn('No file loaded or editor not ready');
    return;
  }

  // CRITICAL: Block onUpdate handler during mark application
  State.isApplyingLanguageToolMarks = true;
  console.log('🚫 State.isApplyingLanguageToolMarks = true (blocking onUpdate during batch check)');

  try {
    // Cancel any ongoing progressive check
    if (State.progressiveCheckAbortController) {
      State.progressiveCheckAbortController.abort();
      console.log('Cancelled previous progressive check');
    }

    // Create new abort controller
    const abortController = new AbortController();
    State.progressiveCheckAbortController = abortController;

  const { state } = State.currentEditor;
  const { doc } = state;
  const language = State.currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

  // ============================================================================
  // NEW: Annotation System Path (simpler, better offset handling)
  // ============================================================================
  if (USE_ANNOTATION_SYSTEM) {
    console.log('🎯 Using NEW Annotation System');

    try {
      showStatus('Prüfe Dokument mit Annotation-API...', 'checking');

      // Check entire document with annotation API
      const result = await checkDocumentWithAnnotation(doc, language);

      if (abortController.signal.aborted) {
        console.log('Progressive check aborted');
        showStatus('Prüfung abgebrochen', 'error');
        return;
      }

      console.log(`✅ Annotation check complete: ${result.matches.length} matches found`);

      // Filter errors
      const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');
      const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');

      const filteredMatches = result.matches.filter(match => {
        // We need to extract error text from the doc
        const mark = convertMatchToMarkAnnotation(match, result.positionMap);
        if (!mark) return false;

        const errorText = doc.textBetween(mark.from, mark.to);

        if (personalDict.includes(errorText)) return false;
        const errorKey = `${match.rule.id}:${errorText}`;
        if (ignoredErrors.includes(errorKey)) return false;
        return true;
      });

      console.log(`📝 After filtering: ${filteredMatches.length} errors to display`);

      // Clear all old error marks first
      State.activeErrors.clear();
      State.currentEditor
        .chain()
        .command(({ tr }) => {
          // Remove all languagetool-error marks
          tr.doc.descendants((node, pos) => {
            if (node.marks) {
              node.marks.forEach(mark => {
                if (mark.type.name === 'languagetool-error') {
                  const from = pos;
                  const to = pos + node.nodeSize;
                  tr.removeMark(from, to, mark.type);
                }
              });
            }
          });
          return true;
        })
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();

      // Apply new error marks
      if (filteredMatches.length > 0) {
        let errorChain = State.currentEditor.chain();

        filteredMatches.forEach(match => {
          const mark = convertMatchToMarkAnnotation(match, result.positionMap);
          if (!mark) return;

          const errorText = doc.textBetween(mark.from, mark.to);
          const errorId = generateErrorId(mark.ruleId, errorText, mark.from);

          State.activeErrors.set(errorId, {
            match: match,
            from: mark.from,
            to: mark.to,
            errorText: errorText,
            ruleId: mark.ruleId,
            message: mark.message,
            suggestions: mark.suggestions,
            category: mark.category,
          });

          errorChain = errorChain
            .setTextSelection({ from: mark.from, to: mark.to })
            .setLanguageToolError({
              errorId: errorId,
              message: mark.message,
              suggestions: JSON.stringify(mark.suggestions),
              category: mark.category,
              ruleId: mark.ruleId,
            });
        });

        errorChain
          .setMeta('addToHistory', false)
          .run(); // This triggers render

        showStatus(`✓ ${filteredMatches.length} Fehler gefunden`, 'errors');
      } else {
        showStatus('✓ Keine Fehler gefunden', 'no-errors');
      }

      // Clear abort controller
      if (State.progressiveCheckAbortController === abortController) {
        State.progressiveCheckAbortController = null;
      }

      console.log('✅ Annotation check completed successfully');
      return; // Exit early - don't run old code path

    } catch (error) {
      console.error('❌ Error in annotation check:', error);
      showStatus('Fehler bei der Prüfung', 'error');
      return;
    }
  }
  // ============================================================================
  // OLD: Plain Text System Path (kept as fallback)
  // ============================================================================
  console.log('📜 Using OLD Plain-Text System (fallback)');

  // ===== STEP 1: Collect all paragraphs =====
  const allParagraphs = [];
  let totalWords = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const paragraphText = node.textContent.trim();

      if (!paragraphText) return;

      // Skip frontmatter
      const isFrontmatter = (
        paragraphText.startsWith('---') ||
        (pos < 200 && (
          paragraphText.includes('TT_lastEdit:') ||
          paragraphText.includes('TT_lastPosition:') ||
          paragraphText.includes('TT_checkedRanges:') ||
          paragraphText.includes('TT_zoomLevel:') ||
          paragraphText.includes('TT_scrollPosition:') ||
          paragraphText.includes('TT_totalWords:') ||
          paragraphText.includes('TT_totalCharacters:') ||
          paragraphText.includes('lastEdit:') ||
          paragraphText.includes('lastPosition:') ||
          paragraphText.includes('checkedRanges:') ||
          /^\s*[a-zA-Z_]+:\s*/.test(paragraphText)
        ))
      );

      if (isFrontmatter) return;

      const wordCount = paragraphText.split(/\s+/).filter(w => w.length > 0).length;

      allParagraphs.push({
        node,
        pos,
        text: paragraphText,
        wordCount,
        isChecked: isParagraphChecked(paragraphText),
      });

      totalWords += wordCount;
    }
  });

  // ===== STEP 2: Determine which paragraphs to check =====
  let paragraphsToCheck = [];

  if (startFromBeginning) {
    // Check from beginning up to maxWords
    let wordsAccumulated = 0;
    for (const para of allParagraphs) {
      if (wordsAccumulated + para.wordCount <= maxWords) {
        paragraphsToCheck.push(para);
        wordsAccumulated += para.wordCount;
      } else {
        break;
      }
    }
  } else {
    // Find first unchecked paragraph, then check up to maxWords
    const firstUncheckedIndex = allParagraphs.findIndex(p => !p.isChecked);
    if (firstUncheckedIndex === -1) {
      showStatus('Alle Absätze bereits geprüft', 'no-errors');
      console.log('No unchecked paragraphs found');
      return;
    }

    let wordsAccumulated = 0;
    for (let i = firstUncheckedIndex; i < allParagraphs.length; i++) {
      if (wordsAccumulated + allParagraphs[i].wordCount <= maxWords) {
        paragraphsToCheck.push(allParagraphs[i]);
        wordsAccumulated += allParagraphs[i].wordCount;
      } else {
        break;
      }
    }
  }

  if (paragraphsToCheck.length === 0) {
    showStatus('Alle Absätze bereits geprüft', 'no-errors');
    console.log('No paragraphs to check');
    return;
  }

  // ===== STEP 3: Viewport-First Prioritization =====
  // Get viewport bounds (approximate)
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement ? editorElement.scrollTop : 0;
  const viewportHeight = editorElement ? editorElement.clientHeight : 800;

  // Simple heuristic: Average paragraph height ~50px
  const estimatedViewportStartPos = Math.max(0, (scrollTop / 50) * 100); // rough estimate
  const estimatedViewportEndPos = estimatedViewportStartPos + (viewportHeight / 50) * 100;

  // Separate paragraphs into viewport and non-viewport
  const viewportParagraphs = [];
  const nonViewportParagraphs = [];

  for (const para of paragraphsToCheck) {
    // Rough estimate if paragraph is in viewport
    if (para.pos >= estimatedViewportStartPos && para.pos <= estimatedViewportEndPos) {
      viewportParagraphs.push(para);
    } else {
      nonViewportParagraphs.push(para);
    }
  }

  // Check viewport paragraphs first, then rest
  const sortedParagraphs = [...viewportParagraphs, ...nonViewportParagraphs];

  console.log(`🔍 Progressive check: ${sortedParagraphs.length} paragraphs (${viewportParagraphs.length} in viewport)`);

  // ===== STEP 4: Group paragraphs into batches of ~1000 words =====
  // Each batch will be sent as ONE API call for maximum performance
  const batches = [];
  let currentBatch = [];
  let currentBatchWords = 0;
  const BATCH_SIZE = 1000; // words per batch

  for (const paragraph of sortedParagraphs) {
    // If adding this paragraph would exceed batch size AND we have content, start new batch
    if (currentBatchWords + paragraph.wordCount > BATCH_SIZE && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [paragraph];
      currentBatchWords = paragraph.wordCount;
    } else {
      currentBatch.push(paragraph);
      currentBatchWords += paragraph.wordCount;
    }
  }

  // Add remaining batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`📦 Created ${batches.length} batches:`, batches.map((b, i) => {
    const words = b.reduce((sum, p) => sum + p.wordCount, 0);
    return `Batch ${i + 1}: ${b.length} paragraphs, ${words} words`;
  }));

  // ===== STEP 5: Check each batch =====
  let totalParagraphsChecked = 0;
  let totalWordsChecked = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    // Check if aborted
    if (abortController.signal.aborted) {
      console.log('Progressive check aborted');
      showStatus('Prüfung abgebrochen', 'error');
      return;
    }

    const batchWords = batch.reduce((sum, p) => sum + p.wordCount, 0);
    console.log(`\n📦 Checking batch ${batchIndex + 1}/${batches.length} (${batch.length} paragraphs, ${batchWords} words)`);
    showStatus(`Prüfe Batch ${batchIndex + 1}/${batches.length} (${batch.length} Absätze, ${batchWords} Wörter)...`, 'checking');

    // Combine all paragraph texts with double-newline separator
    const combinedText = batch.map(p => p.text).join('\n\n');

    // ONE API call for the entire batch
    console.log(`  🌐 API Call: ${combinedText.length} chars`);
    const allMatches = await checkText(combinedText, language);
    console.log(`  ✅ API Response: ${allMatches.length} matches`);

    // Filter errors (global filtering)
    const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');
    const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');

    // ===== STEP 6: Map matches back to individual paragraphs =====
    let textOffset = 0; // Offset in the combined text

    for (let i = 0; i < batch.length; i++) {
      const { node, pos, text, wordCount } = batch[i];
      const from = pos;
      const to = pos + node.nodeSize;

      // Find matches that belong to this paragraph
      // Match is within paragraph if: textOffset <= match.offset < textOffset + text.length
      const paragraphMatches = allMatches.filter(match =>
        match.offset >= textOffset &&
        match.offset < textOffset + text.length
      );

      // Adjust match offsets to be relative to this paragraph (not combined text)
      const adjustedMatches = paragraphMatches.map(match => ({
        ...match,
        offset: match.offset - textOffset,
        length: match.length
      }));

      // Filter matches for this paragraph
      const filteredMatches = adjustedMatches.filter(match => {
        const errorText = text.substring(match.offset, match.offset + match.length);
        if (personalDict.includes(errorText)) return false;
        const errorKey = `${match.rule.id}:${errorText}`;
        if (ignoredErrors.includes(errorKey)) return false;
        return true;
      });

      console.log(`    Paragraph ${i + 1}/${batch.length}: ${filteredMatches.length} errors (offset ${textOffset}-${textOffset + text.length})`);

      // Set error marks for this paragraph
      if (filteredMatches.length > 0) {
        // Remove old error marks
        State.currentEditor
          .chain()
          .setTextSelection({ from, to })
          .unsetLanguageToolError()
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true)
          .run();

        // Set new error marks - BUILD ONE CHAIN for all errors
        let errorChain = State.currentEditor.chain();

        filteredMatches.forEach(match => {
          const mark = convertMatchToMark(match, text);
          const errorFrom = from + 1 + mark.from;
          const errorTo = from + 1 + mark.to;
          const errorText = text.substring(mark.from, mark.to);

          if (errorFrom >= from && errorTo <= to && errorFrom < errorTo) {
            const errorId = generateErrorId(mark.ruleId, errorText, errorFrom);

            State.activeErrors.set(errorId, {
              match: match,
              from: errorFrom,
              to: errorTo,
              errorText: errorText,
              ruleId: mark.ruleId,
              message: mark.message,
              suggestions: mark.suggestions,
              category: mark.category,
            });

            // Add to chain instead of separate .run()
            errorChain = errorChain
              .setTextSelection({ from: errorFrom, to: errorTo })
              .setLanguageToolError({
                errorId: errorId,
                message: mark.message,
                suggestions: JSON.stringify(mark.suggestions),
                category: mark.category,
                ruleId: mark.ruleId,
              });
          }
        });

        // Run the chain with preventUpdate (we'll force update at the end)
        errorChain
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true)
          .run();
      }

      // Mark paragraph as checked (green) - this will trigger the render
      State.currentEditor
        .chain()
        .setTextSelection({ from, to })
        .setCheckedParagraph({ checkedAt: new Date().toISOString() })
        .setMeta('addToHistory', false)
        .run(); // NO preventUpdate - this will render everything!

      // Save to frontmatter (batch this later if performance issue)
      saveCheckedParagraph(text, saveFile);

      totalParagraphsChecked++;
      totalWordsChecked += wordCount;

      // Move offset forward by paragraph length + separator (\n\n = 2 chars)
      textOffset += text.length + 2;
    }

    console.log(`  ✅ Batch ${batchIndex + 1} complete: ${batch.length} paragraphs checked`);

    // ===== NON-BLOCKING: Yield to UI thread after each batch =====
    // Use requestIdleCallback to allow user to continue typing
    await new Promise(resolve => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(resolve);
      } else {
        setTimeout(resolve, 50); // Fallback for older browsers
      }
    });
  }

    // Clear abort controller
    if (State.progressiveCheckAbortController === abortController) {
      State.progressiveCheckAbortController = null;
    }

    showStatus(`✓ ${totalParagraphsChecked} Absätze geprüft (${totalWordsChecked} Wörter) in ${batches.length} Batches`, 'no-errors');
    console.log(`✓ Progressive check completed: ${totalParagraphsChecked} paragraphs (${totalWordsChecked} words) in ${batches.length} batches`);

  } finally {
    // CRITICAL: Re-enable onUpdate handler
    State.isApplyingLanguageToolMarks = false;
    console.log('✅ State.isApplyingLanguageToolMarks = false (onUpdate allowed again)');
  }
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
  for (const correction of State.appliedCorrections) {
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
        removeParagraphFromChecked(paragraphText, saveFile);

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

    // Auto-Save mit 5 Minuten Debounce
    clearTimeout(State.autoSaveTimer);

    showStatus('Änderungen...');

    State.autoSaveTimer = setTimeout(() => {
      if (State.currentFilePath) {
        showStatus('Speichert...', 'saving');
        saveFile(true); // true = auto-save
      }
    }, 300000); // 5 minutes = 300000ms

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
    // clearTimeout(State.languageToolTimer);
    // if (State.languageToolEnabled) {
    //   State.languageToolTimer = setTimeout(() => {
    //     if (State.currentFilePath) {
    //       runLanguageToolCheck();
    //     }
    //   }, 5000);
    // }
  },
});

State.currentEditor = editor;
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

// Hierarchischer File Tree laden (VSCode-style)
async function loadFileTree(dirPath = null) {
  // Falls State.currentWorkingDir noch null ist, hole Home-Verzeichnis
  if (!State.currentWorkingDir && !dirPath) {
    console.log('Loading home directory as fallback...');
    const homeDirResult = await window.api.getHomeDir();
    State.currentWorkingDir = homeDirResult.success ? homeDirResult.homeDir : '/home/matthias';
  }

  const workingDir = dirPath || State.currentWorkingDir;
  console.log('Loading file tree:', workingDir);

  const result = await window.api.getDirectoryTree(workingDir);

  if (!result.success) {
    console.error('Error loading directory tree:', result.error);
    const fileTreeEl = document.querySelector('#file-tree');
    fileTreeEl.innerHTML = '<div class="file-tree-empty">Fehler beim Laden: ' + result.error + '</div>';
    return;
  }

  // Aktuelles Verzeichnis speichern
  State.currentWorkingDir = workingDir;

  // Update folder display header
  updateCurrentFolderDisplay(workingDir);

  const fileTreeEl = document.querySelector('#file-tree');
  fileTreeEl.innerHTML = '';

  // Add ".." parent directory navigation (unless at root)
  if (workingDir !== '/' && workingDir !== '') {
    const parentNav = document.createElement('div');
    parentNav.className = 'tree-parent-nav';
    parentNav.innerHTML = `
      <span class="material-icons tree-icon">arrow_upward</span>
      <span class="tree-name">..</span>
    `;
    parentNav.title = 'Eine Ebene nach oben';
    parentNav.addEventListener('click', () => navigateUp());
    fileTreeEl.appendChild(parentNav);
  }

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

  // Mark currently active file (if any)
  if (State.currentFilePath) {
    markFileAsActive(State.currentFilePath);
  }

  console.log(`Loaded directory tree for: ${workingDir}, found ${result.tree.children.length} items`);
}

// Update current folder display header
function updateCurrentFolderDisplay(dirPath) {
  const displayElement = document.getElementById('current-folder-name');
  if (!displayElement) return;

  if (!dirPath) {
    displayElement.textContent = 'Kein Ordner ausgewählt';
    return;
  }

  // Get just the folder name (last part of path)
  const folderName = dirPath.split('/').filter(Boolean).pop() || dirPath;
  displayElement.textContent = folderName;
  displayElement.title = dirPath; // Full path on hover
}

// Mark file as active in file tree
function markFileAsActive(filePath) {
  if (!filePath) return;

  // Remove active class from all files
  document.querySelectorAll('.tree-file').forEach(item => {
    item.classList.remove('active');
  });

  // Add active class to current file
  const activeFile = document.querySelector(`.tree-file[data-path="${filePath}"]`);
  if (activeFile) {
    activeFile.classList.add('active');
    // Zum Element scrollen (in der Mitte des Viewports)
    activeFile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    console.log('Marked file as active:', filePath);
  } else {
    console.log('File not found in tree (may not be visible yet):', filePath);
  }
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
  item.title = node.path; // Zeige vollständigen Pfad beim Hover

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
      State.currentWorkingDir = node.path;
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
    item.addEventListener('click', async (e) => {
      e.stopPropagation();

      // Mark as active immediately for instant feedback
      markFileAsActive(node.path);

      // Load file asynchronously
      await loadFile(node.path, node.name);
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
  State.currentWorkingDir = result.dirPath;
  await loadFileTree(result.dirPath);
  await window.api.addRecentFolder(result.dirPath);
  console.log('Folder changed successfully to:', result.dirPath);
}

// Eine Ebene nach oben navigieren
async function navigateUp() {
  if (!State.currentWorkingDir) {
    console.warn('No current working directory');
    return;
  }

  // Wenn wir bereits im Root sind, nichts tun
  if (State.currentWorkingDir === '/') {
    console.log('Already at root directory');
    return;
  }

  // Parent-Verzeichnis berechnen
  const parentDir = State.currentWorkingDir.split('/').slice(0, -1).join('/') || '/';
  console.log('Navigating up from', State.currentWorkingDir, 'to', parentDir);

  State.currentWorkingDir = parentDir;
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

// Ensure file tree displays the directory containing the current file
// This is called AFTER a file is loaded to sync the tree with the file
async function ensureFileTreeShowsCurrentFile() {
  if (!State.currentFilePath) {
    console.warn('⚠️  No current file to sync tree with');
    return;
  }

  // Extract directory from current file path (SOURCE OF TRUTH)
  const fileDir = State.currentFilePath.split('/').slice(0, -1).join('/');

  console.log('🔄 Syncing file tree to current file directory:', fileDir);
  console.log('   Current file:', State.currentFilePath);
  console.log('   Current working dir (before):', State.currentWorkingDir);

  // Only reload tree if we're showing the wrong directory
  if (State.currentWorkingDir !== fileDir) {
    console.log('📂 Tree showing wrong directory! Reloading to:', fileDir);
    State.currentWorkingDir = fileDir;
    await loadFileTree(fileDir);
  } else {
    console.log('✅ Tree already showing correct directory');
  }

  // Expand parent folders to make file visible
  await expandParentFolders(State.currentFilePath);

  // Mark file as active in tree
  markFileAsActive(State.currentFilePath);
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
  State.currentFileMetadata = metadata;
  State.currentFilePath = filePath;

  // Add to recent items
  await window.api.addRecentFile(filePath);

  // Alte LanguageTool-Fehler löschen (neue Datei)
  State.activeErrors.clear();
  State.appliedCorrections = [];  // Auch Offset-Tracking zurücksetzen
  removeAllLanguageToolMarks();

  // Nur Content (ohne Frontmatter) in Editor laden
  // TipTap's Markdown Extension mit contentType: 'markdown'
  State.currentEditor.commands.setContent(content, { contentType: 'markdown' });

  // Zur letzten Position springen (Sprint 1.5.2)
  // Backward compatibility: Versuche TT_ prefix zuerst, dann ohne prefix
  const lastPosition = metadata.TT_lastPosition || metadata.lastPosition;
  if (lastPosition && lastPosition > 0) {
    // Minimale Verzögerung für schnelleres Laden
    setTimeout(() => {
      try {
        State.currentEditor.commands.setTextSelection(lastPosition);
        console.log('Jumped to last position:', lastPosition);
      } catch (error) {
        console.warn('Could not restore position:', error);
      }
    }, 10);
  }

  // Zoomfaktor wiederherstellen
  const zoomLevel = metadata.TT_zoomLevel || metadata.zoomLevel;
  if (zoomLevel && zoomLevel > 0) {
    State.currentZoomLevel = zoomLevel;
    applyZoom();
    console.log('Restored zoom level:', State.currentZoomLevel);
  }

  // Scroll-Position wiederherstellen
  const scrollPosition = metadata.TT_scrollPosition || metadata.scrollPosition;
  if (scrollPosition && scrollPosition > 0) {
    setTimeout(() => {
      const editorElement = document.querySelector('#editor');
      if (editorElement) {
        editorElement.scrollTop = scrollPosition;
        console.log('Restored scroll position:', scrollPosition);
      }
    }, 20); // Reduziert von 150ms auf 20ms
  }

  // Window-Titel updaten (nur Dateiname, kein App-Name)
  await window.api.setWindowTitle(fileName);

  // Filename im Control Panel anzeigen
  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = fileName;
  }

  // Load document-specific dictionary additions into global dictionary
  if (metadata.TT_Dict_Additions && Array.isArray(metadata.TT_Dict_Additions)) {
    const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');
    let added = 0;

    metadata.TT_Dict_Additions.forEach(word => {
      if (!personalDict.includes(word)) {
        personalDict.push(word);
        added++;
      }
    });

    if (added > 0) {
      localStorage.setItem('personalDictionary', JSON.stringify(personalDict));
      console.log(`✓ Loaded ${added} words from document dictionary (total: ${metadata.TT_Dict_Additions.length})`);
    }
  }

  // Sprache wiederherstellen (Sprint 1.4)
  const language = metadata.language || 'de-CH'; // Default: Deutsch-CH
  document.querySelector('#language-selector').value = language;

  // HTML lang-Attribut auf contenteditable Element setzen (spellcheck bleibt aus)
  State.currentEditor.view.dom.setAttribute('lang', language);
  State.currentEditor.view.dom.setAttribute('spellcheck', 'false');

  // Restore checked paragraphs (grüne Markierungen)
  // Reduzierte Verzögerung für schnelleres Laden
  setTimeout(() => {
    restoreCheckedParagraphs();
  }, 50);

  // Auto-Check DEAKTIVIERT für schnelleres Datei-Wechseln
  // User kann manuell prüfen mit Rechtsklick → "Diesen Absatz prüfen"
  // oder mit dem Refresh-Button für das gesamte Dokument
  console.log('✓ File loaded. Use manual check or refresh button for LanguageTool.');

  // CRITICAL: Sync file tree to show current file's directory
  // This is the new architecture: file path is SOURCE OF TRUTH, tree follows it
  await ensureFileTreeShowsCurrentFile();

  console.log('File loaded successfully, language:', language);
}

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
async function saveFile(isAutoSave = false) {
  if (!State.currentFilePath) {
    console.warn('No file loaded');
    alert('Keine Datei geladen!');
    return;
  }

  // Markdown direkt aus TipTap holen (native Funktion)
  let markdown = State.currentEditor.getMarkdown();

  // WICHTIG: Entferne Frontmatter aus Markdown falls vorhanden
  // TipTap rendert Frontmatter als Code-Block, den wir NICHT speichern wollen
  // Regex: Entferne alles zwischen ```yaml am Anfang und ``` oder zwischen --- und ---
  markdown = markdown.replace(/^```(?:yaml)?\n---\n[\s\S]*?\n---\n```\n*/m, '');
  markdown = markdown.replace(/^---\n[\s\S]*?\n---\n*/m, '');

  // Trim eventuell übrige Leerzeilen am Anfang
  markdown = markdown.trimStart();

  // Scroll-Position vom Editor-Container speichern
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement ? editorElement.scrollTop : 0;

  // Berechne Wort- und Zeichenanzahl
  const totalCharacters = markdown.length;
  const totalWords = markdown.trim().split(/\s+/).filter(w => w.length > 0).length;

  // Metadaten updaten (Sprint 1.2)
  // WICHTIG: TipTap-spezifische Felder mit TT_ prefix, um Konflikte mit anderen Tools zu vermeiden
  const updatedMetadata = {
    ...State.currentFileMetadata, // Bewahre alle existierenden Felder (z.B. von CMS)
    TT_lastEdit: new Date().toISOString(),
    TT_lastPosition: State.currentEditor.state.selection.from, // Cursor-Position
    TT_zoomLevel: State.currentZoomLevel, // Zoom-Faktor (100 = default)
    TT_scrollPosition: scrollTop, // Scroll-Position
    TT_totalWords: totalWords, // Gesamtanzahl Wörter
    TT_totalCharacters: totalCharacters, // Gesamtanzahl Zeichen
    TT_checkedRanges: State.currentFileMetadata.TT_checkedRanges || State.currentFileMetadata.checkedRanges || [], // Backward compatibility
  };

  // Frontmatter + Content kombinieren
  const fileContent = stringifyFile(updatedMetadata, markdown);

  console.log('Saving file with metadata:', updatedMetadata);

  const result = await window.api.saveFile(State.currentFilePath, fileContent);

  if (!result.success) {
    console.error('Error saving file:', result.error);
    alert('Fehler beim Speichern: ' + result.error);
    return;
  }

  // Metadaten im State aktualisieren
  State.currentFileMetadata = updatedMetadata;

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
async function runLanguageToolCheck() {
  if (!State.currentFilePath) return;

  // Status: Prüfung läuft
  updateLanguageToolStatus('Prüfe Text...', 'checking');

  // Get plain text from editor (same as what user sees)
  const text = State.currentEditor.getText();

  // Also get markdown to detect formatting (for position corrections)
  const markdown = State.currentEditor.getMarkdown();

  if (!text.trim()) {
    console.log('No text content to check');
    updateLanguageToolStatus('', '');
    return;
  }

  // Sprache aus Metadaten oder Dropdown holen
  const language = State.currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

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
  State.isApplyingLanguageToolMarks = true;
  console.log('🚫 State.isApplyingLanguageToolMarks = true (blocking onUpdate)');

  // Entferne ALLE alten Marks (da wir jetzt den ganzen Text checken)
  State.activeErrors.clear();
  // ⚠️  WICHTIG: State.appliedCorrections NICHT hier zurücksetzen!
  // Warum? Die State.appliedCorrections werden für die Offset-Berechnung nachfolgender Fehler benötigt.
  // Wenn wir sie hier löschen, verlieren wir die Offset-Adjustments für Fehler, die der Benutzer
  // später korrigiert (nach dem automatischen Recheck).
  //
  // Beispiel Bug ohne diese Warnung:
  // 1. Benutzer korrigiert Fehler 1 → State.appliedCorrections = [{...}]
  // 2. Auto-Recheck nach 1 Sekunde → State.appliedCorrections = [] (LÖSCHT UNSERE DATEN!)
  // 3. Benutzer korrigiert Fehler 2 → offset ist falsch (keine Anpassung möglich)
  //
  // State.appliedCorrections wird nur gelöscht bei:
  // - Neue Datei laden (loadFile)
  // - Benutzer startet neuen Check manuell (TODO: könnte das noch entfernt werden)

  // Clear "pending" verification state from any previous corrections
  // This way, if corrections are still being verified, they'll get the proper color
  const pendingElements = document.querySelectorAll('.lt-error.pending');
  pendingElements.forEach(el => el.classList.remove('pending'));

  removeAllLanguageToolMarks();

  const docSize = State.currentEditor.state.doc.content.size;

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
      const $pos = State.currentEditor.state.doc.resolve(Math.min(approxDocPos, State.currentEditor.state.doc.content.size));

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
      State.activeErrors.set(errorId, {
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
      State.currentEditor
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
  State.isApplyingLanguageToolMarks = false;
  console.log('✅ State.isApplyingLanguageToolMarks = false (onUpdate allowed again)');

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

// Alle LanguageTool-Marks im ganzen Dokument entfernen (nur für Toggle-Button!)
function removeAllLanguageToolMarks() {
  // Entferne ALLE LanguageTool-Marks im ganzen Dokument
  // Wird nur beim Ausschalten von LanguageTool verwendet
  State.currentEditor
    .chain()
    .setTextSelection({ from: 0, to: State.currentEditor.state.doc.content.size })
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
  if (!State.currentFilePath || !State.currentEditor) {
    showStatus('Keine Datei geladen', 'error');
    return;
  }

  // Remove all existing green checked marks before starting new check
  removeAllCheckedParagraphMarks();

  console.log('🔄 Checking all paragraphs (progressive, no limit)...');
  await checkParagraphsProgressively(Infinity, true); // true = vom Anfang, Infinity = kein Limit
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
    removeAllLanguageToolMarks();
    // Error-Map leeren
    State.activeErrors.clear();
    // Timer stoppen
    clearTimeout(State.languageToolTimer);
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
// Combined contextmenu handler for thesaurus AND languagetool tooltip
document.querySelector('#editor').addEventListener('contextmenu', (event) => {
  // First check: If right-click on .lt-error element, close tooltip
  const errorElement = event.target.closest('.lt-error');
  if (errorElement && !event.target.closest('.lt-error .lt-tooltip')) {
    removeTooltip();
    // Don't return - continue to show context menu
  }

  // Now handle thesaurus/context menu
  handleSynonymContextMenu(event);
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

// Hilfsfunktion: Ersetzt prompt() mit Modal Dialog
// Gibt Promise zurück das mit dem eingegebenen Text oder null (bei Abbrechen) resolved
function showInputModal(title, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('input-modal');
    const titleEl = document.getElementById('input-modal-title');
    const inputField = document.getElementById('input-modal-field');
    const okBtn = document.getElementById('input-modal-ok');
    const cancelBtn = document.getElementById('input-modal-cancel');

    // Setup modal
    titleEl.textContent = title;
    inputField.value = defaultValue;
    modal.classList.add('active');

    // Focus input field
    setTimeout(() => inputField.focus(), 100);

    // Enter-Taste = OK
    const handleEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        okBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    };
    inputField.addEventListener('keydown', handleEnter);

    // OK button handler
    const handleOk = () => {
      const value = inputField.value.trim();
      cleanup();
      resolve(value || null);
    };

    // Cancel button handler
    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    // Cleanup function
    const cleanup = () => {
      modal.classList.remove('active');
      inputField.removeEventListener('keydown', handleEnter);
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    // Attach event listeners
    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

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
  if (!State.currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  const metadataEl = document.getElementById('metadata-content');

  if (Object.keys(State.currentFileMetadata).length === 0) {
    metadataEl.innerHTML = '<p style="color: #7f8c8d;">Keine Frontmatter-Metadaten vorhanden</p>';
  } else {
    let html = '';
    for (const [key, value] of Object.entries(State.currentFileMetadata)) {
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

  if (!errorId || !State.activeErrors.has(errorId)) {
    console.warn('Error not found in State.activeErrors map:', errorId);
    return;
  }

  // Hole Fehler-Daten aus Map
  const errorData = State.activeErrors.get(errorId);
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
  State.activeErrors.delete(errorId);

  // Mark the error span with "pending" class to show verification is in progress
  // This gives immediate visual feedback that the correction was registered
  if (errorElement) {
    errorElement.classList.add('pending');
  }

  // Ersetze den Text und entferne die Fehlermarkierung
  // ⚠️  WICHTIG: State.activeErrors speichert Offsets BEREITS mit +1 für TipTap!
  // calculateAdjustedOffset() passt diese für bisherige Korrektionen an
  // Das Ergebnis können wir direkt verwenden ohne weitere Konvertierung
  //
  // REIHENFOLGE:
  // 1. Cursor auf fehlerhafte Stelle setzen (setTextSelection)
  // 2. Text ersetzen (insertContent) - ersetzt die Selection
  // 3. Mark entfernen (unsetLanguageToolError)
  // 4. Tracking aktualisieren: speichere diese Korrektur für zukünftige Adjustments

  console.log(`Applying correction at position ${adjustedFrom}-${adjustedTo}`);

  State.currentEditor
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

  State.appliedCorrections.push({
    from: from,  // ← Raw offset (ohne +1)
    to: to,      // ← Raw offset (ohne +1)
    originalLength: originalLength,
    newLength: newLength,
    delta: delta
  });

  console.log(`Tracked correction: ${originalLength}→${newLength} chars (delta=${delta}, total corrections=${State.appliedCorrections.length})`);

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
  //   if (State.languageToolEnabled) {
  //     runLanguageToolCheck();
  //   }
  // }, 1000);

  console.log('Applied suggestion:', suggestion, 'for error:', errorId);
}

// Wort ins persönliche Wörterbuch aufnehmen
function addToPersonalDictionary(word) {
  // 1. Add to global app dictionary (localStorage)
  let personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');

  if (!personalDict.includes(word)) {
    personalDict.push(word);
    localStorage.setItem('personalDictionary', JSON.stringify(personalDict));
    console.log('✓ Added to global dictionary:', word);
  }

  // 2. Add to current document's frontmatter (TT_Dict_Additions)
  if (!State.currentFileMetadata.TT_Dict_Additions) {
    State.currentFileMetadata.TT_Dict_Additions = [];
  }

  if (!State.currentFileMetadata.TT_Dict_Additions.includes(word)) {
    State.currentFileMetadata.TT_Dict_Additions.push(word);
    console.log('✓ Added to document dictionary:', word);

    // Trigger save after 2 seconds
    clearTimeout(State.autoSaveTimer);
    State.autoSaveTimer = setTimeout(() => {
      saveFile(true);
    }, 2000);
  }

  // 3. Remove error marks for this word in the entire document
  removeErrorMarksForWord(word);

  showStatus(`"${word}" ins Wörterbuch aufgenommen`, 'saved');
}

// Remove all error marks for a specific word in the document
function removeErrorMarksForWord(word) {
  if (!State.currentEditor) {
    console.warn('No editor available');
    return;
  }

  console.log(`🗑️ Removing error marks for word: "${word}"`);

  const { state } = State.currentEditor;
  const { doc } = state;
  let removedCount = 0;

  // Iterate through all error marks and find ones matching this word
  doc.descendants((node, pos) => {
    if (node.marks) {
      node.marks.forEach(mark => {
        if (mark.type.name === 'languagetool') {
          // Get the text of this marked range
          const from = pos;
          const to = pos + node.nodeSize;
          const markedText = node.textContent;

          // If the marked text matches the dictionary word, remove it
          if (markedText === word) {
            State.currentEditor
              .chain()
              .setTextSelection({ from, to })
              .unsetLanguageToolError()
              .setMeta('addToHistory', false)
              .setMeta('preventUpdate', true)
              .run();

            removedCount++;
            console.log(`  ✓ Removed mark at ${from}-${to}`);
          }
        }
      });
    }
  });

  console.log(`✓ Removed ${removedCount} error marks for "${word}"`);
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

    if (errorId && State.activeErrors.has(errorId)) {
      const errorData = State.activeErrors.get(errorId);

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
      State.currentEditor
        .chain()
        .setTextSelection({ from: errorData.from + 1, to: errorData.to + 1 })
        .unsetLanguageToolError()
        .run();

      // WICHTIG: Entferne Fehler aus Map
      State.activeErrors.delete(errorId);
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

// Synonym-Finder: Multi-language support
// German: OpenThesaurus.de API
// English: Datamuse API
async function fetchSynonyms(word) {
  try {
    // Detect document language
    const language = document.querySelector('#language-selector').value;
    const isGerman = language.startsWith('de-'); // de-DE, de-CH, de-AT

    console.log('📖 Fetching synonyms for word:', word, '(language:', language, ')');

    if (isGerman) {
      // Use OpenThesaurus for German
      const url = `https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(word)}&format=application/json`;
      console.log('   Using OpenThesaurus API:', url);

      const response = await fetch(url);
      console.log('   Response status:', response.status, response.statusText);

      if (!response.ok) {
        console.warn('   API request failed with status:', response.status);
        return [];
      }

      const data = await response.json();
      console.log('   API response data:', data);

      if (!data.synsets || data.synsets.length === 0) {
        console.log('   No synsets found in response');
        return [];
      }

      // Sammle alle Synonyme aus allen Synsets
      const synonyms = [];
      data.synsets.forEach(synset => {
        synset.terms.forEach(term => {
          if (term.term.toLowerCase() !== word.toLowerCase()) {
            synonyms.push(term.term);
          }
        });
      });

      console.log('   Found synonyms:', synonyms);
      return synonyms.slice(0, 15); // Max 15 synonyms
    } else {
      // Use Datamuse API for English (and other languages)
      const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=15`;
      console.log('   Using Datamuse API:', url);

      const response = await fetch(url);
      console.log('   Response status:', response.status, response.statusText);

      if (!response.ok) {
        console.warn('   API request failed with status:', response.status);
        return [];
      }

      const data = await response.json();
      console.log('   API response data:', data);

      if (!data || data.length === 0) {
        console.log('   No synonyms found in response');
        return [];
      }

      // Datamuse returns array of {word, score}
      const synonyms = data.map(item => item.word).filter(syn => syn.toLowerCase() !== word.toLowerCase());

      console.log('   Found synonyms:', synonyms);
      return synonyms.slice(0, 15); // Max 15 synonyms
    }
  } catch (error) {
    console.error('❌ Error fetching synonyms:', error);
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
  const { state, view } = State.currentEditor;
  const { from, to } = state.selection;

  // Finde das Wort an der aktuellen Position
  const $pos = state.doc.resolve(from);
  const textNode = $pos.parent.childAfter($pos.parentOffset);

  if (!textNode || !textNode.node) return;

  const text = textNode.node.text || '';
  const wordStart = from - $pos.parentOffset + textNode.offset;
  const wordEnd = wordStart + text.length;

  // Ersetze das Wort
  State.currentEditor.chain()
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

  const { state, view } = State.currentEditor;

  // Hole die Position bei Mausklick (mit Offset)
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });

  if (!pos) {
    // Kein pos gefunden - zeige trotzdem Context Menu
    showContextMenu(event.clientX, event.clientY);
    return;
  }

  const $pos = state.doc.resolve(pos.pos);
  const node = $pos.parent;

  // Check if node has text content
  const fullText = node.textContent;
  if (!fullText || fullText.trim().length === 0) {
    showContextMenu(event.clientX, event.clientY);
    return;
  }

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

  // Zeige Context Menu mit optionalem Thesaurus-Eintrag
  if (word.length >= 3) {
    console.log(`Context menu with thesaurus for word: "${word}"`);
    showContextMenu(event.clientX, event.clientY, word);
  } else {
    // Zu kurzes Wort - zeige nur Copy/Paste Menu
    showContextMenu(event.clientX, event.clientY);
  }
}

// Context Menu für Copy/Paste (rechtsklick auf normalem Text)
let contextMenuElement = null;

async function showContextMenu(x, y, word = null) {
  // Entferne altes Context Menu wenn vorhanden
  if (contextMenuElement) {
    contextMenuElement.remove();
  }

  // Erstelle neues Context Menu
  contextMenuElement = document.createElement('div');
  contextMenuElement.className = 'context-menu';

  let menuHTML = '';

  // Thesaurus Option (nur wenn Wort vorhanden)
  if (word) {
    menuHTML += `
      <div class="context-menu-item context-menu-thesaurus" data-word="${word}">
        📖 Thesaurus: "${word}"
        <span class="context-menu-arrow">▶</span>
        <div class="context-menu-submenu">
          <div class="synonym-loading">Lade Synonyme...</div>
        </div>
      </div>
      <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    `;
  }

  menuHTML += `
    <button class="context-menu-item" onclick="checkCurrentParagraph()" style="font-weight: bold; background-color: rgba(39, 174, 96, 0.1);">✓ Diesen Absatz prüfen</button>
    <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    <button class="context-menu-item" onclick="copySelection()">Kopieren</button>
    <button class="context-menu-item" onclick="pasteContent()">Einfügen</button>
  `;

  contextMenuElement.innerHTML = menuHTML;
  contextMenuElement.style.position = 'fixed';
  contextMenuElement.style.left = x + 'px';
  contextMenuElement.style.top = y + 'px';
  contextMenuElement.style.zIndex = '1000';

  document.body.appendChild(contextMenuElement);

  // Setup thesaurus hover behavior
  if (word) {
    const thesaurusItem = contextMenuElement.querySelector('.context-menu-thesaurus');
    const submenu = thesaurusItem.querySelector('.context-menu-submenu');
    let synonymsLoaded = false;

    thesaurusItem.addEventListener('mouseenter', async () => {
      if (!synonymsLoaded) {
        synonymsLoaded = true;
        const synonyms = await fetchSynonyms(word);

        if (synonyms.length === 0) {
          submenu.innerHTML = '<div class="synonym-item-disabled">Keine Synonyme gefunden</div>';
        } else {
          let synonymHTML = '';
          synonyms.forEach(syn => {
            synonymHTML += `<div class="synonym-item" data-synonym="${syn}">${syn}</div>`;
          });
          submenu.innerHTML = synonymHTML;

          // Add click handlers for synonyms
          submenu.querySelectorAll('.synonym-item').forEach(item => {
            item.addEventListener('click', (e) => {
              e.stopPropagation();
              const synonym = e.target.dataset.synonym;
              replaceSynonymInContext(word, synonym);
              closeContextMenu();
            });
          });
        }
      }
    });
  }

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

// Synonym ersetzen aus Context Menu
function replaceSynonymInContext(oldWord, newWord) {
  const { state } = State.currentEditor;
  const { from } = state.selection;

  // Suche das Wort im aktuellen Paragraph
  const $pos = state.doc.resolve(from);
  const textContent = $pos.parent.textContent;

  // Finde alle Vorkommen des Wortes (case-insensitive)
  const regex = new RegExp(`\\b${oldWord}\\b`, 'gi');
  const matches = [...textContent.matchAll(regex)];

  if (matches.length === 0) return;

  // Finde das nächste Vorkommen zur Cursor-Position
  let closestMatch = matches[0];
  let minDistance = Math.abs(matches[0].index - ($pos.pos - $pos.start()));

  for (let i = 1; i < matches.length; i++) {
    const distance = Math.abs(matches[i].index - ($pos.pos - $pos.start()));
    if (distance < minDistance) {
      minDistance = distance;
      closestMatch = matches[i];
    }
  }

  // Berechne absolute Position im Dokument
  const wordStart = $pos.start() + closestMatch.index;
  const wordEnd = wordStart + oldWord.length;

  // Ersetze das Wort
  State.currentEditor.chain()
    .focus()
    .setTextSelection({ from: wordStart, to: wordEnd })
    .insertContent(newWord)
    .run();
}

function copySelection() {
  const { state } = State.currentEditor;
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
    State.currentEditor.chain().focus().insertContent(text).run();
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

  if (!State.currentFilePath || !State.currentEditor) {
    console.warn('No file loaded or editor not ready');
    return;
  }

  const { state } = State.currentEditor;
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
      paragraphText.includes('TT_lastEdit:') ||
      paragraphText.includes('TT_lastPosition:') ||
      paragraphText.includes('TT_zoomLevel:') ||
      paragraphText.includes('TT_scrollPosition:') ||
      paragraphText.includes('TT_checkedRanges:') ||
      paragraphText.includes('TT_totalWords:') ||
      paragraphText.includes('TT_totalCharacters:') ||
      // Backward compatibility: Check old field names too
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
  const language = State.currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

  // LanguageTool API Call
  const matches = await checkText(paragraphText, language);

  if (matches.length === 0) {
    console.log('No errors in paragraph');
    showStatus('Keine Fehler', 'no-errors');

    // Markiere Paragraph als geprüft (grün)
    State.currentEditor
      .chain()
      .setTextSelection({ from: paragraphStart, to: paragraphEnd })
      .setCheckedParagraph({ checkedAt: new Date().toISOString() })
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .run();

    // Speichere in Frontmatter (persistent)
    saveCheckedParagraph(paragraphText, saveFile);

    // Cursor zurücksetzen
    State.currentEditor.commands.setTextSelection({ from, to: from });
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
    State.currentEditor
      .chain()
      .setTextSelection({ from: paragraphStart, to: paragraphEnd })
      .setCheckedParagraph({ checkedAt: new Date().toISOString() })
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .run();

    // Speichere in Frontmatter (persistent)
    saveCheckedParagraph(paragraphText, saveFile);

    State.currentEditor.commands.setTextSelection({ from, to: from });
    return;
  }

  console.log(`Found ${filteredMatches.length} errors in paragraph`);
  showStatus(`${filteredMatches.length} Fehler im Absatz`, 'has-errors');

  // FLAG SETZEN: Wir setzen Marks
  State.isApplyingLanguageToolMarks = true;

  // Entferne alte Error-Marks NUR aus diesem Paragraph
  State.currentEditor
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

      // Speichere in State.activeErrors Map
      State.activeErrors.set(errorId, {
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
      State.currentEditor
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

  State.currentEditor
    .chain()
    .setTextSelection({ from: paragraphStart, to: paragraphEnd })
    .setCheckedParagraph({ checkedAt: new Date().toISOString() })
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true)
    .run();

  // Speichere in Frontmatter (persistent)
  saveCheckedParagraph(paragraphText, saveFile);

  // WICHTIG: Cursor SOFORT zurücksetzen (nicht Selection erweitern)
  // Setze Cursor-Position (collapse selection to a point)
  setTimeout(() => {
    State.currentEditor.commands.setTextSelection(from);
    State.currentEditor.commands.focus();
  }, 10);

  // FLAG ZURÜCKSETZEN
  State.isApplyingLanguageToolMarks = false;

  console.log('✅ Paragraph check complete');
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

// Neue Datei erstellen
async function createNewFile() {
  if (!State.currentWorkingDir) {
    alert('Kein Arbeitsverzeichnis ausgewählt');
    return;
  }

  const fileName = await showInputModal('Name der neuen Datei (inkl. .md Endung):');
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

  const result = await window.api.createFile(State.currentWorkingDir, finalFileName, initialContent);

  if (!result.success) {
    alert('Fehler beim Erstellen der Datei: ' + result.error);
    return;
  }

  console.log('File created:', result.filePath);
  showStatus('Datei erstellt', 'saved');

  // NEW ARCHITECTURE: Just load the file, tree will follow automatically
  await loadFile(result.filePath, finalFileName);
}

// Datei unter neuem Namen speichern
async function saveFileAs() {
  console.log('💾 saveFileAs() aufgerufen');
  if (!State.currentFilePath) {
    alert('Keine Datei geladen');
    return;
  }

  // Get current directory and filename for dialog defaults
  const currentFileName = State.currentFilePath.split('/').pop();
  const dirPath = State.currentFilePath.split('/').slice(0, -1).join('/');

  // Show native save dialog with full file manager
  const dialogResult = await window.api.showSaveDialog(dirPath, currentFileName);

  if (!dialogResult.success || dialogResult.canceled) {
    console.log('Save-As dialog canceled');
    return;
  }

  const newFilePath = dialogResult.filePath;

  // Sicherstellen dass .md Endung vorhanden ist
  const finalFilePath = newFilePath.endsWith('.md') ? newFilePath : newFilePath + '.md';

  // Current content holen (native TipTap)
  let markdown = State.currentEditor.getMarkdown();

  // WICHTIG: Entferne Frontmatter aus Markdown falls vorhanden
  // TipTap rendert Frontmatter als Code-Block, den wir NICHT speichern wollen
  markdown = markdown.replace(/^```(?:yaml)?\n---\n[\s\S]*?\n---\n```\n*/m, '');
  markdown = markdown.replace(/^---\n[\s\S]*?\n---\n*/m, '');
  markdown = markdown.trimStart();

  const updatedMetadata = {
    ...State.currentFileMetadata,
    TT_lastEdit: new Date().toISOString(),
  };
  const fileContent = stringifyFile(updatedMetadata, markdown);

  // Extract directory and filename from final path
  const finalDirPath = finalFilePath.split('/').slice(0, -1).join('/');
  const finalFileName = finalFilePath.split('/').pop();

  // Neue Datei erstellen
  const result = await window.api.createFile(finalDirPath, finalFileName, fileContent);

  if (!result.success) {
    alert('Fehler beim Speichern: ' + result.error);
    return;
  }

  console.log('File saved as:', result.filePath);
  showStatus('Gespeichert unter neuem Namen', 'saved');

  // NEW ARCHITECTURE: Just load the file, tree will follow automatically
  // ensureFileTreeShowsCurrentFile() is called at the end of loadFile()
  await loadFile(result.filePath, finalFileName);
}

// Datei umbenennen
async function renameFile() {
  console.log('✏️ renameFile() aufgerufen');
  if (!State.currentFilePath) {
    alert('Keine Datei geladen');
    return;
  }

  const currentFileName = State.currentFilePath.split('/').pop();
  const newFileName = await showInputModal('Neuer Dateiname:', currentFileName);
  if (!newFileName || newFileName === currentFileName) return;

  // Sicherstellen dass .md Endung vorhanden ist
  const finalFileName = newFileName.endsWith('.md') ? newFileName : newFileName + '.md';

  // Neuer Pfad
  const dirPath = State.currentFilePath.split('/').slice(0, -1).join('/');
  const newFilePath = `${dirPath}/${finalFileName}`;

  const result = await window.api.renameFile(State.currentFilePath, newFilePath);

  if (!result.success) {
    alert('Fehler beim Umbenennen: ' + result.error);
    return;
  }

  console.log('File renamed:', newFilePath);
  showStatus('Datei umbenannt', 'saved');

  // Update current file path
  State.currentFilePath = newFilePath;

  // Update window title
  await window.api.setWindowTitle(finalFileName);

  // Update filename display
  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = finalFileName;
  }

  // NEW ARCHITECTURE: Sync tree to show renamed file
  await ensureFileTreeShowsCurrentFile();
}

// Datei löschen
async function deleteFile() {
  if (!State.currentFilePath) {
    alert('Keine Datei geladen');
    return;
  }

  const currentFileName = State.currentFilePath.split('/').pop();
  const confirmed = confirm(`Datei "${currentFileName}" wirklich löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`);
  if (!confirmed) return;

  const result = await window.api.deleteFile(State.currentFilePath);

  if (!result.success) {
    alert('Fehler beim Löschen: ' + result.error);
    return;
  }

  console.log('File deleted:', State.currentFilePath);
  showStatus('Datei gelöscht', 'saved');

  // Reset state
  State.currentFilePath = null;
  State.currentFileMetadata = {};
  State.currentEditor.commands.setContent('<p>Datei wurde gelöscht.</p>');

  // Update window title
  await window.api.setWindowTitle('TipTap AI');

  // Update filename display
  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = 'Keine Datei';
  }

  // File Tree neu laden (aktuelles Verzeichnis beibehalten)
  await loadFileTree(State.currentWorkingDir);
}

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

function applyZoom() {
  const editorElement = document.querySelector('#editor .tiptap-editor');
  const editorContainer = document.querySelector('#editor');

  if (editorElement && editorContainer) {
    // Verwende font-size auf dem Editor für dynamisches Text-Reflow
    // Das ermöglicht dass Text bei Zoom-Änderungen neu umbricht
    // Alle relativen Einheiten (rem, em, %) skalieren automatisch proportional
    editorElement.style.fontSize = `${State.currentZoomLevel}%`;

    // Optional: Füge auch eine leichte width-Anpassung hinzu für besseres Reflow
    // Das verhindert horizontales Scrollen bei höheren Zoom-Levels
    // Width bleibt 100% des Containers, aber der Container passt sich an
  }
  console.log('Zoom level:', State.currentZoomLevel + '%');
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
  const language = State.currentFileMetadata.language || document.querySelector('#language-selector')?.value || 'de-CH';

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

  const editorText = State.currentEditor.getText();
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
  State.currentEditor.commands.setTextSelection({
    from: matchPos + 1,
    to: matchPos + searchText.length + 1
  });

  // Scroll to selection
  State.currentEditor.commands.focus();

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

  const selection = State.currentEditor.state.selection;
  const selectedText = State.currentEditor.state.doc.textBetween(selection.from, selection.to);

  if (selectedText === searchText) {
    State.currentEditor.commands.insertContent(replaceText);
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
  const markdown = State.currentEditor.getMarkdown();
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
    State.currentEditor.commands.setContent(newHTML);
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
