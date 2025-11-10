// Zentrale Error-Marking Funktionen für LanguageTool
// Separation of Concerns: Alle Error-Mark-Operationen an einer Stelle

import State from '../editor/editor-state.js';
import { generateErrorId } from '../utils/error-id.js';
import { restoreUserSelection, withSystemSelectionChange } from '../editor/selection-manager.js';
import { refreshErrorNavigation } from '../ui/error-list-widget.js';

/**
 * Entfernt alle LanguageTool Error-Marks aus dem Dokument
 * @param {Editor} editor - TipTap Editor Instanz
 */
export function removeAllErrorMarks(editor) {
  if (!editor) {
    console.warn('No editor available');
    return;
  }

  const { doc } = editor.state;

  // Entferne alle LanguageTool-Marks vom gesamten Dokument
  const selectionToRestore = State.lastUserSelection || editor.state.selection;

  withSystemSelectionChange(() => {
    editor.chain()
      .setTextSelection({ from: 0, to: doc.content.size })
      .unsetLanguageToolError()
      .unsetLanguageToolIgnored()
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .run();
  });

  restoreUserSelection(editor, selectionToRestore);
  refreshErrorNavigation({ preserveSelection: false });

  console.log('✓ Removed all LanguageTool error marks');
}

/**
 * Setzt Error-Marks für alle gefundenen LanguageTool-Fehler
 * WICHTIG: Diese Funktion enthält die Tree-Detection-Logik für korrekte Offsets
 *
 * @param {Editor} editor - TipTap Editor Instanz
 * @param {Array} matches - LanguageTool matches (bereits gefiltert)
 * @param {string} text - Plain text vom Editor (getText())
 * @returns {number} Anzahl der gesetzten Marks
 */
export function setErrorMarks(editor, matches, text, options = {}) {
  if (!editor) {
    console.warn('No editor available');
    return 0;
  }

  const { baseDocPos = 0 } = options;
  const docSize = editor.state.doc.content.size;
  const selectionToRestore = State.lastUserSelection || editor.state.selection;
  let marksSet = 0;

  // Iteriere durch alle Fehler und setze Marks
  matches.forEach((match, index) => {
    // LanguageTool offsets sind für plain text
    const textFrom = match.offset;
    const textTo = match.offset + match.length;

    // ============================================================================
    // CRITICAL FIX: LanguageTool Offset Correction for Formatted Text
    // ============================================================================
    // Die Position-Correction-Logik muss HIER sein, nicht verstreut!
    // Wir verwenden ProseMirror Tree Detection um Formatting zu erkennen
    // ============================================================================

    // Map plain-text offsets directly into the paragraph's document range.
    // The chunk passed to LanguageTool is the paragraph text without Markdown bullets,
    // so we only need to account for the node's opening position (+1).
    const from = baseDocPos + textFrom + 1;
    const to = baseDocPos + textTo + 1;

    const errorText = text.substring(textFrom, textTo);
    console.log(`Error ${index + 1}: text ${textFrom}-${textTo}, editor ${from}-${to}, text="${errorText}"`);

    // Validate position
    if (from >= 0 && to <= docSize && from < to) {
      // Generate stable error ID
      const errorId = generateErrorId(match.rule.id, errorText, textFrom);

      // Store error in global map
      State.activeErrors.set(errorId, {
        match: match,
        from: from,
        to: to,
        errorText: errorText,
        ruleId: match.rule.id,
        message: match.message,
        suggestions: match.replacements.slice(0, 5).map(r => r.value),
        category: match.rule.category.id,
      });

      // Set mark in editor
      withSystemSelectionChange(() => {
        editor.chain()
          .setTextSelection({ from: from, to: to })
          .setLanguageToolError({
            errorId: errorId,
            message: match.message,
            suggestions: JSON.stringify(match.replacements.slice(0, 5).map(r => r.value)),
            category: match.rule.category.id,
            ruleId: match.rule.id,
          })
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true)
          .run();
      });

      marksSet++;
    } else {
      console.warn(`Invalid position: text ${textFrom}-${textTo}, corrected ${from}-${to} (docSize: ${docSize})`);
    }
  });

  restoreUserSelection(editor, selectionToRestore);

  refreshErrorNavigation();
  console.log(`✓ Set ${marksSet} error marks`);
  return marksSet;
}
