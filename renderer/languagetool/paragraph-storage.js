// Paragraph checking state management - persistent via frontmatter
// Functions for saving, retrieving, and managing checked paragraph state

import { generateParagraphId } from '../utils/hash.js';
import State from '../editor/editor-state.js';

/**
 * Save a checked paragraph to frontmatter metadata
 * @param {string} paragraphText - Text content of the paragraph
 * @param {Function} saveFileCallback - Callback to trigger file save
 */
export function saveCheckedParagraph(paragraphText, saveFileCallback) {
  const paragraphId = generateParagraphId(paragraphText);
  const checkedAt = new Date().toISOString();

  // Initialisiere Array falls nicht vorhanden (mit TT_ prefix)
  if (!State.currentFileMetadata.TT_checkedRanges) {
    State.currentFileMetadata.TT_checkedRanges = [];
  }

  // Prüfe ob bereits vorhanden (update checkedAt)
  const existing = State.currentFileMetadata.TT_checkedRanges.find(r => r.paragraphId === paragraphId);
  if (existing) {
    existing.checkedAt = checkedAt;
  } else {
    State.currentFileMetadata.TT_checkedRanges.push({ paragraphId, checkedAt });
  }

  console.log(`✓ Saved checked paragraph: ${paragraphId} (total: ${State.currentFileMetadata.TT_checkedRanges.length})`);

  // Trigger auto-save (after 5 minutes)
  clearTimeout(State.autoSaveTimer);
  State.autoSaveTimer = setTimeout(() => {
    if (saveFileCallback) saveFileCallback(true);
  }, 300000); // 5 minutes = 300000ms
}

/**
 * Check if a paragraph has already been checked
 * @param {string} paragraphText - Text content of the paragraph
 * @returns {boolean} True if paragraph was previously checked
 */
export function isParagraphChecked(paragraphText) {
  // Backward compatibility: Versuche TT_ prefix zuerst, dann ohne prefix
  const checkedRanges = State.currentFileMetadata.TT_checkedRanges || State.currentFileMetadata.checkedRanges || [];
  if (checkedRanges.length === 0) {
    return false;
  }

  const paragraphId = generateParagraphId(paragraphText);
  return checkedRanges.some(r => r.paragraphId === paragraphId);
}

/**
 * Remove a paragraph from checked ranges (when edited)
 * @param {string} paragraphText - Text content of the paragraph
 * @param {Function} saveFileCallback - Callback to trigger file save
 */
export function removeParagraphFromChecked(paragraphText, saveFileCallback) {
  // Verwende TT_checkedRanges
  if (!State.currentFileMetadata.TT_checkedRanges) {
    State.currentFileMetadata.TT_checkedRanges = [];
    return;
  }

  const paragraphId = generateParagraphId(paragraphText);
  const initialLength = State.currentFileMetadata.TT_checkedRanges.length;
  State.currentFileMetadata.TT_checkedRanges = State.currentFileMetadata.TT_checkedRanges.filter(
    r => r.paragraphId !== paragraphId
  );

  if (State.currentFileMetadata.TT_checkedRanges.length < initialLength) {
    console.log(`✗ Removed checked paragraph: ${paragraphId} (remaining: ${State.currentFileMetadata.TT_checkedRanges.length})`);

    // Trigger auto-save (after 5 minutes)
    clearTimeout(State.autoSaveTimer);
    State.autoSaveTimer = setTimeout(() => {
      if (saveFileCallback) saveFileCallback(true);
    }, 300000); // 5 minutes = 300000ms
  }
}

/**
 * Restore green checked marks when loading a file
 * Iterates through document and matches paragraph IDs
 */
export function restoreCheckedParagraphs() {
  // Backward compatibility: Versuche TT_ prefix zuerst, dann ohne prefix
  const checkedRanges = State.currentFileMetadata.TT_checkedRanges || State.currentFileMetadata.checkedRanges || [];

  if (!State.currentEditor || checkedRanges.length === 0) {
    console.log('No checked ranges to restore');
    return;
  }

  console.log(`📂 Restoring ${checkedRanges.length} checked paragraphs...`);

  const { state } = State.currentEditor;
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

        State.currentEditor
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

/**
 * Remove all green checked paragraph marks from editor and metadata
 */
export function removeAllCheckedParagraphMarks() {
  if (!State.currentEditor) {
    console.warn('No editor available');
    return;
  }

  console.log('🗑️ Removing all green checked paragraph marks...');

  // Remove all checked marks from the entire document
  const { doc } = State.currentEditor.state;
  State.currentEditor
    .chain()
    .setTextSelection({ from: 0, to: doc.content.size })
    .unsetCheckedParagraph()
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true)
    .run();

  // Clear checkedRanges in metadata
  State.currentFileMetadata.TT_checkedRanges = [];

  console.log('✓ All checked marks removed');
}
