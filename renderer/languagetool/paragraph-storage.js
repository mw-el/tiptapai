// Paragraph checking state management - persistent via frontmatter
// Functions for saving, retrieving, and managing checked paragraph state
//
// NEW ARCHITECTURE (2025-11-09):
// - TT_CleanParagraphs: Array of hashes for error-free paragraphs
// - OLD: TT_checkedRanges (kept for backward compatibility)

import { generateParagraphId } from '../utils/hash.js';
import State from '../editor/editor-state.js';
import { restoreUserSelection, withSystemSelectionChange } from '../editor/selection-manager.js';

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
    const cleanHashes = State.currentFileMetadata.TT_CleanParagraphs || [];
    if (cleanHashes.length === 0) {
      return false;
    }
    const paragraphId = generateParagraphId(paragraphText);
    return cleanHashes.includes(paragraphId);
  }

  const paragraphId = generateParagraphId(paragraphText);
  if (checkedRanges.some(r => r.paragraphId === paragraphId)) {
    return true;
  }
  const cleanHashes = State.currentFileMetadata.TT_CleanParagraphs || [];
  return cleanHashes.includes(paragraphId);
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
  const legacyRanges = State.currentFileMetadata.TT_checkedRanges || State.currentFileMetadata.checkedRanges || [];
  const cleanHashes = new Set([
    ...(State.currentFileMetadata.TT_CleanParagraphs || []),
    ...legacyRanges.map(range => range.paragraphId)
  ]);

  if (!State.currentEditor || cleanHashes.size === 0) {
    console.log('No checked ranges to restore');
    return;
  }

  console.log(`📂 Restoring ${cleanHashes.size} checked paragraphs...`);

  const { state } = State.currentEditor;
  const { doc } = state;

  let restoredCount = 0;
  const selectionToRestore = State.lastUserSelection || State.currentEditor.state.selection;

  // Iteriere durch das gesamte Dokument
  doc.descendants((node, pos) => {
    // Nur Paragraphen und Headings prüfen
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
      return;
    }

    const paragraphText = node.textContent;
    const paragraphHash = generateParagraphId(paragraphText);

    if (!cleanHashes.has(paragraphHash)) {
      return;
    }

    const from = pos;
    const to = pos + node.nodeSize;

    withSystemSelectionChange(() => {
      State.currentEditor
        .chain()
        .setTextSelection({ from, to })
        .setCheckedParagraph({ checkedAt: new Date().toISOString(), status: 'clean' })
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();
    });

    restoredCount++;
    console.log(`✓ Restored checked mark for paragraph at ${from}-${to}`);
  });

  restoreUserSelection(State.currentEditor, selectionToRestore);

  console.log(`✓ Restored ${restoredCount} checked paragraphs`);
}

/**
 * Remove all green checked paragraph marks from editor and metadata
 */
export function removeAllCheckedParagraphMarks(options = {}) {
  if (!State.currentEditor) {
    console.warn('No editor available');
    return;
  }

  console.log('🗑️ Removing all green checked paragraph marks...');

  // Remove all checked marks from the entire document
  const { doc } = State.currentEditor.state;
  const selectionToRestore = State.lastUserSelection || State.currentEditor.state.selection;

  withSystemSelectionChange(() => {
    State.currentEditor
      .chain()
      .setTextSelection({ from: 0, to: doc.content.size })
      .unsetCheckedParagraph()
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .run();
  });

  restoreUserSelection(State.currentEditor, selectionToRestore);

  // Clear checkedRanges in metadata
  if (options.clearMetadata) {
    State.currentFileMetadata.TT_checkedRanges = [];
    State.currentFileMetadata.TT_CleanParagraphs = [];
  }

  console.log('✓ All checked marks removed');
}

export function clearCleanParagraphHashes() {
  State.currentFileMetadata.TT_CleanParagraphs = [];
}

// ============================================================================
// NEW ARCHITECTURE: Clean Paragraphs (Error-Free Only)
// ============================================================================
// Simple approach: Only store hashes of paragraphs without errors
// Paragraphs with errors need to be re-checked each time

/**
 * Get array of clean paragraph hashes from frontmatter
 * @returns {string[]} Array of paragraph hashes (error-free paragraphs)
 */
export function getCleanParagraphHashes() {
  if (!State.currentFileMetadata.TT_CleanParagraphs) {
    State.currentFileMetadata.TT_CleanParagraphs = [];
  }
  return State.currentFileMetadata.TT_CleanParagraphs;
}

/**
 * Check if a paragraph is clean (error-free)
 * @param {string} paragraphText - Text content of the paragraph
 * @returns {boolean} True if paragraph is in clean list
 */
export function isCleanParagraph(paragraphText) {
  const hash = generateParagraphId(paragraphText);
  const cleanHashes = getCleanParagraphHashes();
  return cleanHashes.includes(hash);
}

/**
 * Add a paragraph to the clean list (error-free)
 * @param {string} paragraphText - Text content of the paragraph
 * @param {Function} saveFileCallback - Optional callback to trigger file save
 */
export function addCleanParagraph(paragraphText, saveFileCallback = null) {
  const hash = generateParagraphId(paragraphText);
  const cleanHashes = getCleanParagraphHashes();

  // Avoid duplicates
  if (!cleanHashes.includes(hash)) {
    cleanHashes.push(hash);
    console.log(`✓ Added clean paragraph: ${hash} (total: ${cleanHashes.length})`);

    // Trigger auto-save
    if (saveFileCallback) {
      clearTimeout(State.autoSaveTimer);
      State.autoSaveTimer = setTimeout(() => {
        saveFileCallback(true);
      }, 300000); // 5 minutes
    }
  }
}

/**
 * Remove a paragraph from the clean list (when edited or errors found)
 * @param {string} paragraphText - Text content of the paragraph
 * @param {Function} saveFileCallback - Optional callback to trigger file save
 */
export function removeCleanParagraph(paragraphText, saveFileCallback = null) {
  const hash = generateParagraphId(paragraphText);
  const cleanHashes = getCleanParagraphHashes();
  const initialLength = cleanHashes.length;

  State.currentFileMetadata.TT_CleanParagraphs = cleanHashes.filter(h => h !== hash);

  if (State.currentFileMetadata.TT_CleanParagraphs.length < initialLength) {
    console.log(`✗ Removed clean paragraph: ${hash} (remaining: ${State.currentFileMetadata.TT_CleanParagraphs.length})`);

    // Trigger auto-save
    if (saveFileCallback) {
      clearTimeout(State.autoSaveTimer);
      State.autoSaveTimer = setTimeout(() => {
        saveFileCallback(true);
      }, 300000); // 5 minutes
    }
  }
}

/**
 * Get all paragraph texts and hashes from document
 * @param {Editor} editor - TipTap Editor instance
 * @returns {Array<{text: string, hash: string, from: number, to: number}>} Array of paragraph info
 */
export function getAllParagraphs(editor) {
  if (!editor) {
    console.warn('No editor available');
    return [];
  }

  const paragraphs = [];
  const { doc } = editor.state;

  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const text = doc.textBetween(pos, pos + node.nodeSize, ' ');

      // Skip empty paragraphs
      if (!text || !text.trim()) {
        return;
      }

      // Skip frontmatter
      const isFrontmatter = (
        text.startsWith('---') ||
        (pos < 200 && (
          text.includes('TT_lastEdit:') ||
          text.includes('TT_CleanParagraphs:') ||
          text.includes('TT_checkedRanges:') ||
          /^\s*[a-zA-Z_]+:\s*/.test(text)
        ))
      );

      if (isFrontmatter) {
        return;
      }

      const hash = generateParagraphId(text);
      const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
      paragraphs.push({
        text,
        hash,
        from: pos,
        to: pos + node.nodeSize,
        wordCount
      });
    }
  });

  return paragraphs;
}

function getSkippedParagraphHashes() {
  if (!State.currentFileMetadata.TT_SkippedParagraphs) {
    State.currentFileMetadata.TT_SkippedParagraphs = [];
  }
  return State.currentFileMetadata.TT_SkippedParagraphs;
}

export function addSkippedParagraph(paragraphText) {
  const hash = generateParagraphId(paragraphText);
  const skipped = getSkippedParagraphHashes();

  if (!skipped.includes(hash)) {
    skipped.push(hash);
    removeCleanParagraph(paragraphText);
    console.log(`✓ Marked paragraph as skipped: ${hash}`);
  }
}

export function removeSkippedParagraph(paragraphText) {
  const hash = generateParagraphId(paragraphText);
  const skipped = getSkippedParagraphHashes();
  State.currentFileMetadata.TT_SkippedParagraphs = skipped.filter(h => h !== hash);
  console.log(`✗ Removed skipped paragraph: ${hash}`);
}

export function isParagraphSkipped(paragraphText) {
  const hash = generateParagraphId(paragraphText);
  const skipped = State.currentFileMetadata.TT_SkippedParagraphs || [];
  return skipped.includes(hash);
}

export function restoreSkippedParagraphs() {
  const skipped = State.currentFileMetadata.TT_SkippedParagraphs || [];
  if (!State.currentEditor || skipped.length === 0) {
    return;
  }

  const skipSet = new Set(skipped);
  const selectionToRestore = State.lastUserSelection || State.currentEditor.state.selection;

  State.currentEditor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
      return;
    }
    const hash = generateParagraphId(node.textContent);
    if (!skipSet.has(hash)) {
      return;
    }
    const from = pos;
    const to = pos + node.nodeSize;

    withSystemSelectionChange(() => {
      State.currentEditor
        .chain()
        .setTextSelection({ from, to })
        .setCheckedParagraph({ checkedAt: new Date().toISOString(), status: 'skip' })
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();
    });
  });

  restoreUserSelection(State.currentEditor, selectionToRestore);
}
