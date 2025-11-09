// Markdown Position Mapper - Simple Native Approach
// Maps LanguageTool offsets (in Markdown) to ProseMirror document positions
//
// PARADIGM: LanguageTool is smart enough to handle Markdown syntax!
// We just need to subtract markdown syntax characters (# - >) from offsets.
//
// Example:
// Markdown: "# Heading\n\nParagraph with fehler."
// LanguageTool returns offset for "fehler" in the markdown string
// We map: markdown_offset - syntax_length + 1 (for ProseMirror doc-start) = doc_position

/**
 * Build position mapping function for markdown → ProseMirror positions
 *
 * Strategy:
 * 1. Parse markdown line by line
 * 2. Detect markdown syntax at start of lines (# - > etc)
 * 3. Build mapping table: markdown offsets → doc positions
 * 4. Return converter function that does the lookup
 *
 * @param {string} markdown - The markdown text from editor.getMarkdown()
 * @returns {Function} Converter function: (markdownOffset) => docPosition
 */
export function buildPositionMapping(markdown) {
  const lines = markdown.split('\n');
  const mapping = [];

  let markdownPos = 0;
  let docPos = 1; // ProseMirror doc starts at position 1

  for (const line of lines) {
    // Detect markdown syntax at start of line
    let syntaxLength = 0;

    // Heading: # ## ### etc (with space after)
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      syntaxLength = headingMatch[0].length; // e.g., "## " = 3 chars
    }
    // Bullet list: - or * (with optional indentation and space)
    else if (line.match(/^(\s*)[*-]\s/)) {
      const bulletMatch = line.match(/^(\s*)[*-]\s/);
      syntaxLength = bulletMatch[0].length; // e.g., "  - " = 4 chars
    }
    // Blockquote: > (with space)
    else if (line.match(/^>\s/)) {
      syntaxLength = 2; // "> "
    }
    // Numbered list: 1. 2. etc
    else if (line.match(/^(\s*)\d+\.\s/)) {
      const numberedMatch = line.match(/^(\s*)\d+\.\s/);
      syntaxLength = numberedMatch[0].length; // e.g., "1. " = 3 chars
    }

    const lineLength = line.length;
    const textLength = lineLength - syntaxLength;

    // Store mapping for this line
    mapping.push({
      markdownStart: markdownPos,
      markdownEnd: markdownPos + lineLength,
      syntaxLength: syntaxLength,
      docStart: docPos,
      docEnd: docPos + textLength,
      line: line.substring(0, 30) + (line.length > 30 ? '...' : '') // For debugging
    });

    markdownPos += lineLength + 1; // +1 for \n
    docPos += textLength + 2; // +2 for ProseMirror block boundaries (open + close)
  }

  console.log('📍 Position Mapping built:', {
    lines: mapping.length,
    totalMarkdownChars: markdownPos,
    totalDocPositions: docPos
  });

  // DEBUG: Log first 5 mappings
  if (mapping.length > 0) {
    console.log('📋 First 5 line mappings:');
    mapping.slice(0, 5).forEach((map, i) => {
      console.log(`  ${i + 1}. Markdown [${map.markdownStart}-${map.markdownEnd}] → Doc [${map.docStart}-${map.docEnd}] (syntax: ${map.syntaxLength} chars) "${map.line}"`);
    });
  }

  // Return converter function (closure over mapping)
  return function convertMarkdownOffset(markdownOffset) {
    // Find which line this offset is in
    for (const map of mapping) {
      if (markdownOffset >= map.markdownStart && markdownOffset < map.markdownEnd) {
        const relativeOffset = markdownOffset - map.markdownStart;

        if (relativeOffset < map.syntaxLength) {
          // Offset is within markdown syntax itself (e.g., the "# " part)
          // Map to start of text content
          return map.docStart;
        } else {
          // Offset is in actual text content
          const textOffset = relativeOffset - map.syntaxLength;
          return map.docStart + textOffset;
        }
      }
    }

    // Fallback for offsets at line breaks (\n)
    // Just add 1 for ProseMirror doc-start node
    console.warn('⚠️ Offset not in any line mapping, using fallback:', markdownOffset);
    return markdownOffset + 1;
  };
}

/**
 * Convert markdown range to ProseMirror document range
 *
 * Simple wrapper around the converter function from buildPositionMapping()
 *
 * @param {number} markdownFrom - Start offset in markdown string
 * @param {number} markdownTo - End offset in markdown string
 * @param {Function} converter - Converter function from buildPositionMapping()
 * @returns {Object} {from, to} - ProseMirror document positions
 */
export function markdownRangeToDocRange(markdownFrom, markdownTo, converter) {
  const from = converter(markdownFrom);
  const to = converter(markdownTo);

  console.log(`📍 Markdown range [${markdownFrom}-${markdownTo}] → Doc range [${from}-${to}]`);

  return { from, to };
}
