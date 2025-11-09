// Zentrale Error-Marking Funktionen für LanguageTool
// Separation of Concerns: Alle Error-Mark-Operationen an einer Stelle

import State from '../editor/editor-state.js';
import { generateErrorId } from '../utils/error-id.js';

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
  editor.chain()
    .setTextSelection({ from: 0, to: doc.content.size })
    .unsetLanguageToolError()
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true)
    .run();

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
export function setErrorMarks(editor, matches, text) {
  if (!editor) {
    console.warn('No editor available');
    return 0;
  }

  const docSize = editor.state.doc.content.size;
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

    let correction = 0;

    // Convert text position to approximate doc position
    const approxDocPos = textFrom + 1; // rough estimate

    try {
      const $pos = editor.state.doc.resolve(Math.min(approxDocPos, docSize));

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

      marksSet++;
    } else {
      console.warn(`Invalid position: text ${textFrom}-${textTo}, corrected ${from}-${to} (docSize: ${docSize})`);
    }
  });

  console.log(`✓ Set ${marksSet} error marks`);
  return marksSet;
}
