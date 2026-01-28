// Paragraph checking state management - persistent via frontmatter
// Functions for saving, retrieving, and managing checked paragraph state
//
// NEW ARCHITECTURE (2025-11-09):
// - TT_CleanParagraphs: Array of hashes for error-free paragraphs
// - OLD: TT_checkedRanges (kept for backward compatibility)

import { generateParagraphId } from '../utils/hash.js';
import State from '../editor/editor-state.js';
import { restoreUserSelection, withSystemSelectionChange } from '../editor/selection-manager.js';

function ensureMetadata() {
  if (!State.currentFileMetadata) {
    State.currentFileMetadata = {};
  }
}

function ensureCheckedRangesArray() {
  ensureMetadata();
  if (Array.isArray(State.currentFileMetadata.TT_checkedRanges)) {
    return State.currentFileMetadata.TT_checkedRanges;
  }
  if (Array.isArray(State.currentFileMetadata.checkedRanges)) {
    State.currentFileMetadata.TT_checkedRanges = [...State.currentFileMetadata.checkedRanges];
    return State.currentFileMetadata.TT_checkedRanges;
  }
  State.currentFileMetadata.TT_checkedRanges = [];
  return State.currentFileMetadata.TT_checkedRanges;
}

function ensureCleanHashesArray() {
  ensureMetadata();
  if (Array.isArray(State.currentFileMetadata.TT_CleanParagraphs)) {
    return State.currentFileMetadata.TT_CleanParagraphs;
  }
  State.currentFileMetadata.TT_CleanParagraphs = [];
  return State.currentFileMetadata.TT_CleanParagraphs;
}

function ensureSkippedParagraphsArray() {
  ensureMetadata();
  if (Array.isArray(State.currentFileMetadata.TT_SkippedParagraphs)) {
    return State.currentFileMetadata.TT_SkippedParagraphs;
  }
  State.currentFileMetadata.TT_SkippedParagraphs = [];
  return State.currentFileMetadata.TT_SkippedParagraphs;
}

/**
 * Save a checked paragraph to frontmatter metadata
 * @param {string} paragraphText - Text content of the paragraph
 * @param {Function} saveFileCallback - Callback to trigger file save
 */
export function saveCheckedParagraph(paragraphText, saveFileCallback) {
  const paragraphId = generateParagraphId(paragraphText);
  const checkedAt = new Date().toISOString();

  const checkedRanges = ensureCheckedRangesArray();

  // Prüfe ob bereits vorhanden (update checkedAt)
  const existing = checkedRanges.find(r => r.paragraphId === paragraphId);
  if (existing) {
    existing.checkedAt = checkedAt;
  } else {
    checkedRanges.push({ paragraphId, checkedAt });
  }

  console.log(`✓ Saved checked paragraph: ${paragraphId} (total: ${checkedRanges.length})`);

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
  const checkedRanges = ensureCheckedRangesArray();
  const cleanHashes = ensureCleanHashesArray();

  if (checkedRanges.length === 0 && cleanHashes.length === 0) {
    return false;
  }

  const paragraphId = generateParagraphId(paragraphText);
  if (checkedRanges.some(range => range && range.paragraphId === paragraphId)) {
    return true;
  }
  return cleanHashes.includes(paragraphId);
}

/**
 * Remove a paragraph from checked ranges (when edited)
 * @param {string} paragraphText - Text content of the paragraph
 * @param {Function} saveFileCallback - Callback to trigger file save
 */
export function removeParagraphFromChecked(paragraphText, saveFileCallback) {
  const checkedRanges = ensureCheckedRangesArray();
  const paragraphId = generateParagraphId(paragraphText);
  const initialLength = checkedRanges.length;
  State.currentFileMetadata.TT_checkedRanges = checkedRanges.filter(
    (r) => r && r.paragraphId !== paragraphId
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
  const legacyRanges = ensureCheckedRangesArray();
  const cleanHashesArray = ensureCleanHashesArray();
  const cleanHashes = new Set([
    ...cleanHashesArray,
    ...legacyRanges
      .map(range => range?.paragraphId)
      .filter(Boolean)
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

    const paragraphText = getParagraphTextForCheck(node);
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
  return ensureCleanHashesArray();
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
export function getAllParagraphs(editor, options = {}) {
  if (!editor) {
    console.warn('No editor available');
    return [];
  }

  const { includeProtected = false } = options;

  const paragraphs = [];
  const { doc } = editor.state;

  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const text = getNodeText(node, includeProtected);

      // Skip empty paragraphs
      if (!text || !text.trim()) {
        return;
      }

      // Skip explicit frontmatter markers (content without metadata already stripped)
      if (text.trim().startsWith('---')) {
        return;
      }

      const hash = generateParagraphId(text);
      const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
      const offsetMapper = createOffsetMapper(node, pos, includeProtected);

      paragraphs.push({
        text,
        hash,
        from: pos,
        to: pos + node.nodeSize,
        wordCount,
        offsetMapper,
        node,
      });
    }
  });

  return paragraphs;
}

export function getParagraphTextForCheck(node) {
  if (!node) {
    return '';
  }
  return getNodeText(node, false);
}

export function getParagraphText(node, options = {}) {
  if (!node) {
    return '';
  }

  const { includeProtected = false } = options;
  return getNodeText(node, includeProtected);
}

export function getParagraphOffsetMapper(node, baseDocPos, includeProtected = false) {
  if (!node) {
    return null;
  }
  return createOffsetMapper(node, baseDocPos, includeProtected);
}

export function getDocumentTextForCheck(editor) {
  if (!editor) {
    return { text: '', offsetMapper: null };
  }

  const { doc } = editor.state;
  const blockSeparator = '\n\n';
  let text = '';
  const segments = [];

  doc.nodesBetween(0, doc.content.size, (node, pos, parent, index) => {
    if (node.isBlock && pos > 0) {
      const start = text.length;
      text += blockSeparator;
      const end = text.length;
      segments.push({
        textStart: start,
        textEnd: end,
        docStart: pos,
        docEnd: pos,
      });
    }

    if (node.type?.name === 'protectedInline' || node.type?.name === 'protectedBlock') {
      const start = text.length;
      text += ' ';
      const end = text.length;
      segments.push({
        textStart: start,
        textEnd: end,
        docStart: pos + 1,
        docEnd: pos + 1,
      });
      return false;
    }

    if (node.isText) {
      const start = text.length;
      text += node.text;
      const end = text.length;
      segments.push({
        textStart: start,
        textEnd: end,
        docStart: pos,
        docEnd: pos + node.text.length,
      });
    }

    if (node.type?.name === 'hardBreak') {
      const start = text.length;
      text += '\n';
      const end = text.length;
      segments.push({
        textStart: start,
        textEnd: end,
        docStart: pos,
        docEnd: pos + 1,
      });
    }
  });

  const offsetMapper = (offset) => {
    if (segments.length === 0) {
      return 1;
    }

    for (const segment of segments) {
      if (offset <= segment.textEnd) {
        if (segment.docStart === segment.docEnd) {
          return segment.docStart;
        }
        const delta = Math.max(0, offset - segment.textStart);
        return segment.docStart + delta;
      }
    }

    const last = segments[segments.length - 1];
    return last.docEnd || 1;
  };

  return { text, offsetMapper };
}

function isProtectedNode(node) {
  return node?.type?.name === 'protectedInline' || node?.type?.name === 'protectedBlock';
}

function getProtectedRawText(node) {
  return (node?.textContent || '').trim();
}

function isLineBreakProtected(node) {
  const raw = getProtectedRawText(node);
  return /^<br\s*\/?>$/i.test(raw);
}

function isSoftHyphenProtected(node) {
  const raw = getProtectedRawText(node);
  return /^(?:&shy;|&#173;|&#xAD;|\u00ad)$/i.test(raw);
}

function getNodeText(node, includeProtected) {
  if (!node) {
    return '';
  }

  let text = '';
  let lastCharWhitespace = false;

  const children = [];
  node.forEach((child, offset) => {
    children.push({ child, offset });
  });

  if (children.length === 0) {
    return '';
  }

  for (let i = 0; i < children.length; i++) {
    const { child } = children[i];
    const nextChild = i + 1 < children.length ? children[i + 1].child : null;

    if (child.isText) {
      let chunk = child.text || '';
      if (!includeProtected && nextChild && isLineBreakProtected(nextChild)) {
        chunk = chunk.replace(/[ \t]+$/, '');
      }
      if (chunk) {
        text += chunk;
        lastCharWhitespace = /\s$/.test(chunk);
      }
      continue;
    }

    if (child.type?.name === 'hardBreak') {
      text += '\n';
      lastCharWhitespace = true;
      continue;
    }

    if (isProtectedNode(child)) {
      if (includeProtected) {
        const raw = child.textContent || '';
        if (raw) {
          text += raw;
          lastCharWhitespace = /\s$/.test(raw);
        }
        continue;
      }

      if (isLineBreakProtected(child)) {
        text += '\n';
        lastCharWhitespace = true;
        continue;
      }

      if (isSoftHyphenProtected(child)) {
        continue;
      }

      if (!lastCharWhitespace) {
        text += ' ';
        lastCharWhitespace = true;
      }
      continue;
    }

    if (child.childCount) {
      const nested = getNodeText(child, includeProtected);
      if (nested) {
        text += nested;
        lastCharWhitespace = /\s$/.test(nested);
      }
    }
  }

  return text;
}

function createOffsetMapper(node, baseDocPos, includeProtected) {
  if (!node) {
    return () => baseDocPos + 1;
  }

  const children = [];
  node.forEach((child, offset) => {
    children.push({ child, offset });
  });

  return (textOffset) => {
    let currentOffset = 0;
    let lastCharWhitespace = false;

    for (let i = 0; i < children.length; i++) {
      const { child, offset } = children[i];
      const nextChild = i + 1 < children.length ? children[i + 1].child : null;

      if (child.isText) {
        let chunk = child.text || '';
        if (!includeProtected && nextChild && isLineBreakProtected(nextChild)) {
          chunk = chunk.replace(/[ \t]+$/, '');
        }
        const length = chunk.length;
        if (length > 0) {
          if (textOffset <= currentOffset + length) {
            const offsetInText = Math.max(0, textOffset - currentOffset);
            return baseDocPos + 1 + offset + offsetInText;
          }
          currentOffset += length;
          lastCharWhitespace = /\s$/.test(chunk);
        }
        continue;
      }

      if (child.type?.name === 'hardBreak') {
        if (textOffset <= currentOffset + 1) {
          return baseDocPos + 1 + offset;
        }
        currentOffset += 1;
        lastCharWhitespace = true;
        continue;
      }

      if (isProtectedNode(child)) {
        if (includeProtected) {
          const raw = child.textContent || '';
          const length = raw.length;
          if (length > 0) {
            if (textOffset <= currentOffset + length) {
              const offsetInText = Math.max(0, textOffset - currentOffset);
              return baseDocPos + 1 + offset + offsetInText;
            }
            currentOffset += length;
            lastCharWhitespace = /\s$/.test(raw);
          }
          continue;
        }

        const isLineBreak = isLineBreakProtected(child);
        const isSoftHyphen = isSoftHyphenProtected(child);
        const placeholderLength = isSoftHyphen ? 0 : (isLineBreak ? 1 : (lastCharWhitespace ? 0 : 1));

        if (placeholderLength > 0) {
          if (textOffset <= currentOffset + placeholderLength) {
            return baseDocPos + 1 + offset;
          }
          currentOffset += placeholderLength;
        }

        lastCharWhitespace = isLineBreak || lastCharWhitespace || placeholderLength > 0;
        continue;
      }
    }

    return baseDocPos + 1 + node.content.size;
  };
}

function getSkippedParagraphHashes() {
  return ensureSkippedParagraphsArray();
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
    const hash = generateParagraphId(getParagraphTextForCheck(node));
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
