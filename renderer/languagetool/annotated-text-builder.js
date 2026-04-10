// Centralized text extraction and offset mapping for LanguageTool
// Single-pass segment builder — text content and doc-position mapping
// come from the same segments array, so they can never drift apart.
//
// Public API:
//   buildAnnotatedText(editor, options?)      → { text, segments, blocks, offsetMapper }
//   buildAnnotatedParagraph(node, pos, opts?) → { text, segments, offsetMapper }

// ---------------------------------------------------------------------------
// Node classification helpers (mirrors paragraph-storage.js helpers but kept
// here so this module is self-contained)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Segment helpers
// ---------------------------------------------------------------------------

function appendSegment(state, value, docStart, docEnd) {
  if (!value) return;
  const textStart = state.text.length;
  state.text += value;
  state.segments.push({
    textStart,
    textEnd: state.text.length,
    docStart,
    docEnd,
  });
}

// ---------------------------------------------------------------------------
// Core recursive walker — mirrors getNodeText logic but also builds segments
// ---------------------------------------------------------------------------

function buildNodeText(node, baseDocPos, includeProtected, state) {
  if (!node) return;

  const children = [];
  node.forEach((child, offset) => children.push({ child, offset }));

  let lastCharWhitespace = false;

  for (let i = 0; i < children.length; i++) {
    const { child, offset } = children[i];
    const nextChild = i + 1 < children.length ? children[i + 1].child : null;

    if (child.isText) {
      let chunk = child.text || '';
      // Strip trailing whitespace before an inline <br> protected node
      if (!includeProtected && nextChild && isLineBreakProtected(nextChild)) {
        chunk = chunk.replace(/[ \t]+$/, '');
      }
      if (chunk) {
        appendSegment(
          state, chunk,
          baseDocPos + 1 + offset,
          baseDocPos + 1 + offset + chunk.length
        );
        lastCharWhitespace = /\s$/.test(chunk);
      }
      continue;
    }

    if (child.type?.name === 'hardBreak') {
      appendSegment(state, '\n', baseDocPos + 1 + offset, baseDocPos + 1 + offset + 1);
      lastCharWhitespace = true;
      continue;
    }

    if (isProtectedNode(child)) {
      if (includeProtected) {
        const raw = child.textContent || '';
        if (raw) {
          appendSegment(
            state, raw,
            baseDocPos + 1 + offset,
            baseDocPos + 1 + offset + raw.length
          );
          lastCharWhitespace = /\s$/.test(raw);
        }
        continue;
      }

      // Not including protected content — use placeholder
      if (isLineBreakProtected(child)) {
        appendSegment(state, '\n', baseDocPos + 1 + offset, baseDocPos + 1 + offset + 1);
        lastCharWhitespace = true;
        continue;
      }
      if (isSoftHyphenProtected(child)) {
        // Invisible — no placeholder, no segment
        continue;
      }
      // Generic protected node → single space placeholder (only if not already whitespace)
      if (!lastCharWhitespace) {
        appendSegment(state, ' ', baseDocPos + 1 + offset, baseDocPos + 1 + offset);
        lastCharWhitespace = true;
      }
      continue;
    }

    // Nested inline node (e.g. marks wrapping text)
    if (child.childCount) {
      buildNodeText(child, baseDocPos + offset, includeProtected, state);
      const latest = state.text.slice(-1);
      lastCharWhitespace = !!latest && /\s/.test(latest);
    }
  }
}

// ---------------------------------------------------------------------------
// Offset mapper factory
// ---------------------------------------------------------------------------

function createOffsetMapper(segments) {
  return (offset) => {
    if (segments.length === 0) return 1;

    for (const segment of segments) {
      if (offset < segment.textEnd) {
        if (segment.docStart === segment.docEnd) return segment.docStart;
        const delta = Math.max(0, offset - segment.textStart);
        return Math.min(segment.docStart + delta, segment.docEnd);
      }
    }

    const last = segments[segments.length - 1];
    return last.docEnd ?? last.docStart ?? 1;
  };
}

// ---------------------------------------------------------------------------
// Public: single block
// ---------------------------------------------------------------------------

function buildBlockText(node, baseDocPos, includeProtected) {
  const state = { text: '', segments: [] };
  buildNodeText(node, baseDocPos, includeProtected, state);
  return {
    text: state.text,
    segments: state.segments,
    offsetMapper: createOffsetMapper(state.segments),
  };
}

/**
 * Extract plain text and offset mapper for a single ProseMirror block node.
 *
 * @param {ProseMirrorNode} node
 * @param {number} pos - Document position of the node's opening token
 * @param {Object} [options]
 * @param {boolean} [options.includeProtected=false]
 * @returns {{ text: string, segments: Array, offsetMapper: Function }}
 */
export function buildAnnotatedParagraph(node, pos, options = {}) {
  const { includeProtected = false } = options;
  return buildBlockText(node, pos, includeProtected);
}

// ---------------------------------------------------------------------------
// Public: full document
// ---------------------------------------------------------------------------

/**
 * Walk the entire ProseMirror document and build a plain-text representation
 * plus a stable offset mapper from LanguageTool text offsets → doc positions.
 *
 * Unlike the previous getDocumentTextForCheck / createOffsetMapper pair, both
 * outputs are derived from the same `segments` array built in a single pass,
 * so they can never drift apart when new node types are added.
 *
 * @param {Editor} editor - TipTap editor instance
 * @param {Object} [options]
 * @param {boolean} [options.includeProtected=false] - Include protected node content
 * @param {string}  [options.blockSeparator='\n\n']  - Separator between blocks
 * @returns {{
 *   text: string,
 *   segments: Array,
 *   blocks: Array<{pos, textStart, textEnd, text}>,
 *   offsetMapper: Function
 * }}
 */
export function buildAnnotatedText(editor, options = {}) {
  if (!editor) {
    return { text: '', offsetMapper: () => 1, segments: [], blocks: [] };
  }

  const { includeProtected = false, blockSeparator = '\n\n' } = options;
  const { doc } = editor.state;

  const state = { text: '', segments: [] };
  const blocks = [];
  let firstBlock = true;

  doc.descendants((node, pos) => {
    // Only process block-level nodes (paragraphs, headings, etc.)
    if (!node.isBlock) return;

    const block = buildBlockText(node, pos, includeProtected);
    if (!block.text.trim()) return false; // skip empty blocks

    // Separator between blocks
    if (!firstBlock) {
      appendSegment(state, blockSeparator, pos, pos);
    }
    firstBlock = false;

    // Merge block segments into document-level segments (adjusting text offsets)
    const textBase = state.text.length;
    for (const seg of block.segments) {
      state.segments.push({
        textStart: seg.textStart + textBase,
        textEnd: seg.textEnd + textBase,
        docStart: seg.docStart,
        docEnd: seg.docEnd,
      });
    }

    blocks.push({
      pos,
      textStart: textBase,
      textEnd: textBase + block.text.length,
      text: block.text,
    });

    state.text += block.text;

    // Don't descend — we already walked children via buildBlockText
    return false;
  });

  return {
    text: state.text,
    segments: state.segments,
    blocks,
    offsetMapper: createOffsetMapper(state.segments),
  };
}
