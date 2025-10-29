// LanguageTool Annotation API - New Implementation
// Sprint 2.x - Migration to Annotation System
//
// This module replaces the old plain-text approach with LanguageTool's
// native Annotation API, which properly handles document structure and
// eliminates offset mapping issues.
//
// See: TIPTAPAI_ANNOTATION_SYSTEM_2025-10-29-1730.md

const LANGUAGETOOL_API = 'http://localhost:8081/v2/check';
const MAX_CHUNK_SIZE = 50000; // ~25 pages per chunk

// ============================================================================
// PROSEMIRROR → ANNOTATION CONVERTER
// ============================================================================
//
// Strategy: "Simplified Annotation"
//
// Instead of full HTML markup (<p>, <blockquote>, etc.), we use a simpler
// approach that marks block boundaries as whitespace. This gives LanguageTool
// enough context for proper grammar checking while keeping offset mapping simple.
//
// Example:
// Input (ProseMirror Doc):
//   - Paragraph: "First sentence."
//   - Paragraph: "Second sentence with error."
//
// Output (Annotation):
//   [
//     {text: "First sentence."},
//     {markup: "\n\n", interpretAs: "\n\n"},
//     {text: "Second sentence with error."}
//   ]
//
// Benefits:
// - LanguageTool knows about paragraph boundaries (better error detection)
// - Offsets are almost 1:1 with ProseMirror positions
// - Much simpler than full HTML annotation
// ============================================================================

/**
 * Convert ProseMirror document to LanguageTool annotation format
 *
 * CRITICAL: This function builds a position map that translates between:
 * - Annotation offsets (linear text positions in the annotation)
 * - ProseMirror document positions (tree positions accounting for node boundaries)
 *
 * The key insight: We must track TEXT CONTENT positions separately from NODE positions!
 *
 * @param {Node} doc - ProseMirror document node
 * @returns {Object} {annotation, positionMap} - Annotation and position mapping
 */
export function proseMirrorToAnnotation(doc) {
  const annotation = [];
  const positionMap = []; // {annotationStart, annotationEnd, docPosStart, docPosEnd, text}
  let annotationOffset = 0;
  let isFirstBlock = true;

  // CRITICAL INSIGHT from docs/OFFSET_BUG_ANALYSIS.md:
  // We must traverse the document and find the ACTUAL positions of text nodes,
  // accounting for all node boundaries (opening + closing) in the tree structure.
  //
  // Key: Each block node has:
  // - pos = start of node (before opening boundary)
  // - pos + 1 = start of content (after opening boundary)
  // - pos + node.nodeSize - 1 = end of content (before closing boundary)
  // - pos + node.nodeSize = end of node (after closing boundary)

  // Traverse document and collect text with block boundaries
  doc.descendants((node, pos) => {
    // Handle block nodes (paragraph, heading, list items, blockquote, etc.)
    if (node.isBlock) {
      // Add separator before this block (except first)
      if (!isFirstBlock) {
        annotation.push({ markup: '\n\n', interpretAs: '\n\n' });
        annotationOffset += 2; // \n\n = 2 chars in annotation
      }
      isFirstBlock = false;

      // Extract text content from this block
      const text = node.textContent;
      if (text && text.length > 0) {
        annotation.push({ text });

        // CRITICAL FIX: Find the ACTUAL text node position inside this block
        // We need to traverse inside the block to find where text actually starts

        let docPosStart = null;
        let docPosEnd = null;

        // For blocks with direct text content, find the first text node
        if (node.isTextblock) {
          // Textblock (paragraph, heading) - text starts at pos + 1
          docPosStart = pos + 1;
          docPosEnd = pos + 1 + text.length;
        } else {
          // Complex block (list item, blockquote) - need to find nested text
          // Traverse children to find first text node
          let found = false;
          node.descendants((childNode, childPos) => {
            if (!found && childNode.isText && childNode.text.length > 0) {
              // Found first text node
              // Position is: block start + 1 (opening) + child offset
              docPosStart = pos + 1 + childPos;
              docPosEnd = docPosStart + text.length;
              found = true;
              return false; // Stop searching
            }
          });

          // Fallback if no text node found (shouldn't happen if text.length > 0)
          if (!found) {
            docPosStart = pos + 1;
            docPosEnd = pos + 1 + text.length;
            console.warn('⚠️ No text node found in block, using fallback');
          }
        }

        positionMap.push({
          annotationStart: annotationOffset,
          annotationEnd: annotationOffset + text.length,
          docPosStart: docPosStart,
          docPosEnd: docPosEnd,
          text: text.substring(0, 20) + (text.length > 20 ? '...' : ''),
          nodeType: node.type.name,
          nodePos: pos,
          nodeSize: node.nodeSize
        });

        annotationOffset += text.length;
      }

      // Don't traverse children (we already got textContent)
      return false;
    }

    return true;
  });

  console.log('📝 ProseMirror → Annotation:', {
    blocks: annotation.filter(a => a.markup).length,
    textSegments: annotation.filter(a => a.text).length,
    totalChars: annotation.filter(a => a.text).reduce((sum, a) => sum + a.text.length, 0),
    positionMapEntries: positionMap.length
  });

  // DEBUG: Log first 5 position mappings
  if (positionMap.length > 0) {
    console.log('📍 Position Map (first 5):');
    positionMap.slice(0, 5).forEach((map, i) => {
      console.log(`  ${i + 1}. [${map.nodeType}] "${map.text}" → annotation [${map.annotationStart}-${map.annotationEnd}], doc [${map.docPosStart}-${map.docPosEnd}], node@${map.nodePos} size=${map.nodeSize}`);
    });
  }

  return { annotation, positionMap };
}

// ============================================================================
// ANNOTATION OFFSET TRACKING
// ============================================================================
//
// To map LanguageTool offsets (in annotation) back to ProseMirror positions,
// we need to track where each text segment starts in both systems.
//
// Annotation Offset: Position in the combined annotation string (text + markup)
// ProseMirror Offset: Position in the document (starts at 1)
//
// Example:
// Annotation: [
//   {text: "First."},      // annotation offset 0-6, doc offset 1-7
//   {markup: "\n\n"},      // annotation offset 6-8, doc offset 7-7 (no chars)
//   {text: "Second."}      // annotation offset 8-15, doc offset 8-15
// ]
//
// LanguageTool returns: offset=8 (start of "Second")
// We need to map: annotation offset 8 → doc position 8
// ============================================================================

/**
 * Build offset mapping table for annotation
 *
 * Maps annotation offsets to ProseMirror document positions
 *
 * @param {Array} annotation - Annotation array
 * @returns {Object} Mapping data
 */
function buildOffsetMapping(annotation) {
  const mapping = {
    segments: [], // {annotationStart, annotationEnd, docStart, docEnd}
    totalAnnotationLength: 0,
    totalDocLength: 0
  };

  let annotationOffset = 0;
  let docOffset = 1; // ProseMirror starts at position 1

  for (const item of annotation) {
    if (item.text) {
      const length = item.text.length;

      mapping.segments.push({
        annotationStart: annotationOffset,
        annotationEnd: annotationOffset + length,
        docStart: docOffset,
        docEnd: docOffset + length,
        text: item.text.substring(0, 20) + (item.text.length > 20 ? '...' : '') // For debugging
      });

      annotationOffset += length;
      docOffset += length;
    } else if (item.markup) {
      // Markup is NOT in the document, but IS in the annotation
      // So we advance annotation offset, but NOT doc offset

      const markupLength = item.markup.length;
      annotationOffset += markupLength;

      // For paragraph breaks (\n\n), ProseMirror has node boundaries
      // but they don't count as "2 characters" - they're structural
      // However, we DO need to account for the gap between nodes
      // In ProseMirror, each node boundary adds 1 position (open) + 1 position (close)
      if (item.markup === '\n\n') {
        docOffset += 2; // Account for node boundary (1 for closing previous, 1 for opening next)
      }
    }
  }

  mapping.totalAnnotationLength = annotationOffset;
  mapping.totalDocLength = docOffset;

  return mapping;
}

/**
 * Convert annotation offset to ProseMirror document position
 *
 * @param {number} annotationOffset - Offset in annotation string
 * @param {Array} positionMap - Position map from proseMirrorToAnnotation
 * @returns {number|null} ProseMirror position, or null if not found
 */
export function annotationOffsetToDocPos(annotationOffset, positionMap) {
  // Find the segment that contains this offset
  for (const segment of positionMap) {
    if (annotationOffset >= segment.annotationStart && annotationOffset < segment.annotationEnd) {
      // Offset is within this text segment
      const relativeOffset = annotationOffset - segment.annotationStart;
      const docPos = segment.docPosStart + relativeOffset;

      console.log(`📍 Offset mapping: annotation ${annotationOffset} → doc ${docPos}`, {
        nodeType: segment.nodeType,
        text: segment.text,
        relativeOffset
      });

      return docPos;
    }
  }

  console.warn(`⚠️ Could not map annotation offset ${annotationOffset} to doc position`);
  return null;
}

// ============================================================================
// LANGUAGETOOL API CALL WITH ANNOTATION
// ============================================================================

/**
 * Check text with LanguageTool using Annotation API
 *
 * @param {Array} annotation - Annotation array
 * @param {Array} positionMap - Position map from proseMirrorToAnnotation
 * @param {string} language - Language code (e.g., 'de-CH')
 * @returns {Object} {matches, positionMap} - LanguageTool matches and position map
 */
export async function checkTextWithAnnotation(annotation, positionMap, language = 'de-CH') {
  try {
    console.log('🌐 Sending annotation to LanguageTool:', {
      segments: annotation.length,
      positionMapEntries: positionMap.length,
      language
    });

    const response = await fetch(LANGUAGETOOL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        data: JSON.stringify({ annotation }), // ← NEW: Send annotation instead of text
        language: language,
        enabledOnly: 'false',
      }),
    });

    if (!response.ok) {
      throw new Error(`LanguageTool API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ LanguageTool response:', data.matches.length, 'matches');

    // DEBUG: Log first 3 matches with annotation offsets
    if (data.matches.length > 0) {
      console.log('=== LanguageTool Matches (Annotation Offsets) ===');
      data.matches.slice(0, 3).forEach((match, i) => {
        const docPos = annotationOffsetToDocPos(match.offset, positionMap);
        console.log(`Match ${i + 1}:`, {
          annotationOffset: match.offset,
          docPos: docPos,
          length: match.length,
          rule: match.rule.id,
          message: match.message.substring(0, 50) + '...'
        });
      });
    }

    return {
      matches: data.matches,
      positionMap: positionMap
    };
  } catch (error) {
    console.error('❌ LanguageTool API error:', error);
    return {
      matches: [],
      positionMap: null
    };
  }
}

// ============================================================================
// CHUNKING FOR LARGE DOCUMENTS
// ============================================================================

/**
 * Split annotation into chunks for large documents
 *
 * @param {Array} annotation - Full annotation
 * @param {number} maxChars - Max characters per chunk
 * @returns {Array} Array of {annotation, offset} chunks
 */
function splitAnnotationIntoChunks(annotation, maxChars = MAX_CHUNK_SIZE) {
  const chunks = [];
  let currentChunk = [];
  let currentChunkSize = 0;
  let currentOffset = 0;

  for (const item of annotation) {
    const itemSize = item.text ? item.text.length : item.markup.length;

    // If adding this item exceeds limit AND we have content, start new chunk
    if (currentChunkSize + itemSize > maxChars && currentChunk.length > 0) {
      chunks.push({
        annotation: currentChunk,
        offset: currentOffset
      });

      currentOffset += currentChunkSize;
      currentChunk = [item];
      currentChunkSize = itemSize;
    } else {
      currentChunk.push(item);
      currentChunkSize += itemSize;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      annotation: currentChunk,
      offset: currentOffset
    });
  }

  console.log(`📦 Split annotation into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Check large document with automatic chunking
 *
 * @param {Node} doc - ProseMirror document
 * @param {string} language - Language code
 * @returns {Object} {matches, positionMap} - All matches with position map
 */
export async function checkDocumentWithAnnotation(doc, language = 'de-CH') {
  // Convert to annotation
  const { annotation, positionMap } = proseMirrorToAnnotation(doc);

  // Small document: Check directly
  const totalChars = annotation
    .filter(a => a.text)
    .reduce((sum, a) => sum + a.text.length, 0);

  if (totalChars <= MAX_CHUNK_SIZE) {
    console.log(`Checking ${totalChars} chars with LanguageTool (single chunk)`);
    return await checkTextWithAnnotation(annotation, positionMap, language);
  }

  // Large document: Split into chunks
  console.log(`📚 Checking ${totalChars} chars with LanguageTool (chunked)`);
  const chunks = splitAnnotationIntoChunks(annotation, MAX_CHUNK_SIZE);

  const allMatches = [];
  let globalMapping = {
    segments: [],
    totalAnnotationLength: 0,
    totalDocLength: 0
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  📄 Checking chunk ${i + 1}/${chunks.length}`);

    const result = await checkTextWithAnnotation(chunk.annotation, language);
    console.log(`  ✅ Chunk ${i + 1}: ${result.matches.length} matches`);

    // Adjust offsets to absolute positions
    const adjustedMatches = result.matches.map(match => ({
      ...match,
      offset: match.offset + chunk.offset
    }));

    allMatches.push(...adjustedMatches);

    // Merge mappings
    const adjustedSegments = result.mapping.segments.map(seg => ({
      ...seg,
      annotationStart: seg.annotationStart + chunk.offset,
      annotationEnd: seg.annotationEnd + chunk.offset
    }));

    globalMapping.segments.push(...adjustedSegments);
  }

  // Update global mapping totals
  if (globalMapping.segments.length > 0) {
    const lastSegment = globalMapping.segments[globalMapping.segments.length - 1];
    globalMapping.totalAnnotationLength = lastSegment.annotationEnd;
    globalMapping.totalDocLength = lastSegment.docEnd;
  }

  console.log(`✅ Total matches across all chunks: ${allMatches.length}`);

  return {
    matches: allMatches,
    mapping: globalMapping
  };
}

// ============================================================================
// CONVERT MATCH TO MARK (with corrected offsets)
// ============================================================================

/**
 * Convert LanguageTool match to TipTap mark data
 *
 * @param {Object} match - LanguageTool match
 * @param {Array} positionMap - Position map from proseMirrorToAnnotation
 * @returns {Object} Mark data for TipTap
 */
export function convertMatchToMark(match, positionMap) {
  // Convert annotation offsets to ProseMirror positions
  const from = annotationOffsetToDocPos(match.offset, positionMap);
  const to = annotationOffsetToDocPos(match.offset + match.length, positionMap);

  if (from === null || to === null) {
    console.error('❌ Could not convert match offsets:', match);
    return null;
  }

  return {
    from: from,
    to: to,
    message: match.message,
    suggestions: match.replacements.slice(0, 5).map(r => r.value),
    category: match.rule.category.id,
    ruleId: match.rule.id,
  };
}
