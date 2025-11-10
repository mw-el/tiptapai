// Zentrale Korrektur-Anwendung für LanguageTool
// Separation of Concerns: ALLE Korrekturen laufen durch diese Funktion

import State from '../editor/editor-state.js';
import { refreshErrorNavigation } from '../ui/error-list-widget.js';
import { normalizeWord } from '../utils/word-normalizer.js';

/**
 * Berechnet angepasste Offsets basierend auf bisherigen Korrektionen
 *
 * WICHTIG: Diese Funktion ist das Herzstück des Offset-Trackings
 *
 * Szenario: Text "Fluch Stralung Gedanke"
 * 1. Benutzer korrigiert "Stralung" → "Strahlung" (offset 6-14, +1 Zeichen)
 * 2. Benutzer korrigiert "Gedanke" → "Gedanken" (offset 15-22)
 *    ABER: offset 15-22 ist falsch wegen der +1 Verschiebung aus Schritt 1!
 *    Korrekte neue Position: 16-23
 *
 * Diese Funktion berechnet: originalOffset 15 → adjustedOffset 16
 *
 * @param {number} originalFrom - Original start position
 * @param {number} originalTo - Original end position
 * @returns {Object} { adjustedFrom, adjustedTo, adjustment }
 */
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

/**
 * ZENTRALE KORREKTUR-FUNKTION
 *
 * Wendet eine LanguageTool-Korrektur im Editor an
 *
 * Diese Funktion wird aufgerufen von:
 * - applySuggestion() - User klickt auf Vorschlag im Tooltip
 * - Zukünftig: Batch-Korrektur, Auto-Korrektur, etc.
 *
 * @param {Editor} editor - TipTap Editor Instanz
 * @param {string} errorId - ID des Fehlers (aus State.activeErrors)
 * @param {string} suggestion - Korrektur-Text
 * @returns {boolean} Success/Failure
 */
export function applyCorrectionToEditor(editor, errorId, suggestion) {
  if (!editor || !errorId || !State.activeErrors.has(errorId)) {
    console.warn('Cannot apply correction: invalid parameters or error not found');
    return false;
  }

  // Hole Fehler-Daten aus Map
  const errorData = State.activeErrors.get(errorId);
  const { from, to, errorText } = errorData;

  console.log(`📝 Applying correction: "${errorText}" → "${suggestion}"`);

  // ============================================================================
  // OFFSET ADJUSTMENT
  // ============================================================================
  // Berechne angepasste Offsets basierend auf bisherigen Korrektionen
  // Das ist wichtig, wenn mehrere Korrekturen im gleichen Abschnitt sind
  const { adjustedFrom, adjustedTo, adjustment } = calculateAdjustedOffset(from, to);

  console.log(`   Original position: ${from}-${to}`);
  console.log(`   Adjusted position: ${adjustedFrom}-${adjustedTo} (delta: ${adjustment})`);

  let effectiveFrom = adjustedFrom;
  let effectiveTo = adjustedTo;

  if (typeof document !== 'undefined') {
    const editorElement = document.querySelector('.tiptap-editor');
    const errorElement = editorElement?.querySelector(`.lt-error[data-error-id="${errorId}"]`);
    if (errorElement) {
      try {
        const domStart = editor.view.posAtDOM(errorElement, 0);
        const domLength = errorElement.textContent?.length || (adjustedTo - adjustedFrom);
        effectiveFrom = domStart;
        effectiveTo = domStart + domLength;
        console.log(`   Using DOM positions for correction: ${effectiveFrom}-${effectiveTo}`);
      } catch (domError) {
        console.warn('⚠️  Could not derive DOM positions for correction, falling back to adjusted offsets:', domError);
      }
    }
  }

  const docSize = editor.state.doc.content.size;
  effectiveFrom = Math.max(0, Math.min(effectiveFrom, docSize));
  effectiveTo = Math.max(effectiveFrom, Math.min(effectiveTo, docSize));

  // ============================================================================
  // BLOCKIERE onUpdate HANDLER
  // ============================================================================
  // KRITISCH: Verhindert dass onUpdate während der Korrektur triggert
  // Ohne diesen Flag würde onUpdate den Cursor zurücksetzen!
  State.isApplyingLanguageToolMarks = true;
  console.log('🚫 State.isApplyingLanguageToolMarks = true (blocking onUpdate)');

  try {
    // ============================================================================
    // ENTFERNE FEHLER AUS MAP (SOFORT)
    // ============================================================================
    // Wichtig: BEVOR wir die Korrektur anwenden, damit keine Race Conditions entstehen
    State.activeErrors.delete(errorId);
    console.log(`   Removed error ${errorId} from State.activeErrors`);
    refreshErrorNavigation({ preserveSelection: false });

    // ============================================================================
    // SPEICHERE CURSOR-POSITION (für später)
    // ============================================================================
    // Wir wollen den Cursor NACH dem korrigierten Text setzen, damit User weitertippen kann
    const cursorAfterCorrection = effectiveFrom + suggestion.length;

    // ============================================================================
    // WENDE KORREKTUR AN
    // ============================================================================
    // Reihenfolge ist wichtig:
    // 1. Cursor auf fehlerhafte Stelle setzen (setTextSelection)
    // 2. Text ersetzen (insertContent) - ersetzt die Selection
    // 3. Mark entfernen (unsetLanguageToolError) - entfernt Fehlermarkierung
    // 4. Cursor NACH Korrektur setzen - damit User weitertippen kann

    editor.chain()
      .focus()
      .setTextSelection({ from: effectiveFrom, to: effectiveTo })
      .insertContent(suggestion)
      .unsetLanguageToolError()
      .setTextSelection(cursorAfterCorrection) // Cursor NACH Korrektur
      .run();

    console.log(`   Applied correction at ${effectiveFrom}-${effectiveTo}`);
    console.log(`   Cursor set to position ${cursorAfterCorrection}`);

    // ============================================================================
    // TRACKE KORREKTUR FÜR ZUKÜNFTIGE OFFSET-BERECHNUNGEN
    // ============================================================================
    // Das ist der Kern des Offset-Trackings: Speichere die Längenänderung
    const originalLength = to - from;
    const newLength = suggestion.length;
    const delta = newLength - originalLength;

    State.appliedCorrections.push({
      from: from,      // Raw offset (ohne adjustment)
      to: to,          // Raw offset (ohne adjustment)
      originalLength: originalLength,
      newLength: newLength,
      delta: delta
    });

    console.log(`   Tracked correction: ${originalLength}→${newLength} chars (delta=${delta})`);
    console.log(`   Total corrections tracked: ${State.appliedCorrections.length}`);

    return true;
  } catch (error) {
    console.error('❌ CRITICAL: Exception during correction application:', error);
    return false;
  } finally {
    // ============================================================================
    // ERLAUBE onUpdate HANDLER WIEDER (IMMER!)
    // ============================================================================
    State.isApplyingLanguageToolMarks = false;
    console.log('✅ State.isApplyingLanguageToolMarks = false (onUpdate allowed again)');
  }
}

/**
 * Entfernt alle Fehlermarkierungen für ein bestimmtes Wort
 * (z.B. wenn User Wort ins Wörterbuch aufnimmt)
 *
 * @param {Editor} editor - TipTap Editor Instanz
 * @param {string} word - Wort, dessen Fehlermarkierungen entfernt werden sollen
 */
export function removeErrorMarksForWord(editor, word) {
  if (!editor || !word) return;

  console.log(`🗑️  Removing error marks for word: "${word}"`);

  const normalizedTarget = normalizeWord(word);
  if (!normalizedTarget) {
    return;
  }

  // Blockiere onUpdate während wir Marks entfernen
  State.isApplyingLanguageToolMarks = true;

  // Speichere aktuelle Selection
  const { from: selFrom, to: selTo } = editor.state.selection;

  try {
    let removedCount = 0;

    // Finde alle Fehler für dieses Wort
    const errorsToRemove = [];
    State.activeErrors.forEach((errorData, errorId) => {
      if (normalizeWord(errorData.errorText) === normalizedTarget) {
        errorsToRemove.push({ errorId, ...errorData });
      }
    });

    // Entferne Marks und aus Map
    errorsToRemove.forEach(({ errorId, from, to }) => {
      // Entferne Mark im Editor
      editor.chain()
        .setTextSelection({ from, to })
        .unsetLanguageToolError()
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();

      // Entferne aus Map
      State.activeErrors.delete(errorId);
      removedCount++;
    });

    // Stelle ursprüngliche Selection wieder her
    editor.commands.setTextSelection({ from: selFrom, to: selTo });

    console.log(`✓ Removed ${removedCount} error marks for "${word}"`);
  } catch (error) {
    console.error('❌ Exception during error mark removal:', error);
  } finally {
    State.isApplyingLanguageToolMarks = false;
  }

  refreshErrorNavigation({ preserveSelection: false });
}
