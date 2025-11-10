// Handles cleanup when the user edits a paragraph so that the cursor
// position remains stable and checked marks / hashes stay in sync.

import State from '../editor/editor-state.js';
import { generateParagraphId } from '../utils/hash.js';
import {
  removeParagraphFromChecked,
  removeCleanParagraph
} from '../languagetool/paragraph-storage.js';
import { recordUserSelection, restoreUserSelection, withSystemSelectionChange } from './selection-manager.js';

/**
 * Removes the checked mark for the paragraph currently being edited and
 * restores the user's selection so the cursor doesn't jump.
 *
 * @param {Editor} editor - TipTap editor instance
 * @param {Function} saveFile - Callback for persisting metadata updates
 */
export function cleanupParagraphAfterUserEdit(editor, saveFile) {
  if (!editor) {
    return;
  }

  const { state } = editor;
  const { selection } = state;
  const previousSelection = {
    from: selection.from,
    to: selection.to
  };

  try {
    const $from = state.doc.resolve(selection.from);

    // Find enclosing paragraph/heading node
    let paragraphDepth = $from.depth;
    while (paragraphDepth > 0) {
      const node = $from.node(paragraphDepth);
      if (node.type.name === 'paragraph' || node.type.name === 'heading') {
        break;
      }
      paragraphDepth--;
    }

    if (paragraphDepth === 0) {
      return;
    }

    const paragraphStart = $from.before(paragraphDepth);
    const paragraphEnd = $from.after(paragraphDepth);
    const paragraphText = state.doc.textBetween(paragraphStart, paragraphEnd, ' ');

    // Remove checked mark without creating history entries
    withSystemSelectionChange(() => {
      editor
        .chain()
        .setTextSelection({ from: paragraphStart, to: paragraphEnd })
        .unsetCheckedParagraph()
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();
    });

    // Keep metadata in sync
    removeParagraphFromChecked(paragraphText, saveFile);
    removeCleanParagraph(paragraphText, saveFile);

    // Mark paragraph for re-check when cursor leaves it
    if (!State.paragraphsNeedingCheck) {
      State.paragraphsNeedingCheck = new Set();
    }
    State.paragraphsNeedingCheck.add(paragraphStart);

    // Restore the user's original selection (cursor stays put)
    const maxPos = editor.state.doc.content.size;
    const restoredFrom = Math.min(previousSelection.from, maxPos);
    const restoredTo = Math.min(previousSelection.to, maxPos);

    restoreUserSelection(editor, { from: restoredFrom, to: restoredTo });
    recordUserSelection(editor);
  } catch (error) {
    console.warn('Could not remove checked paragraph mark:', error);
  }
}
