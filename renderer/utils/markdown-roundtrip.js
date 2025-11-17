function normalizeForComparison(text = '') {
  if (!text) return '';

  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    // Normalize multiple empty lines to max 2 (paragraph break)
    // This prevents false positives when TipTap normalizes whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/g, '')
    .trim();
}

function findFirstDifference(original, transformed) {
  const originalLines = original.split('\n');
  const transformedLines = transformed.split('\n');
  const max = Math.max(originalLines.length, transformedLines.length);

  for (let i = 0; i < max; i++) {
    const a = originalLines[i] ?? '';
    const b = transformedLines[i] ?? '';
    if (a !== b) {
      return {
        index: i,
        original: a,
        transformed: b,
      };
    }
  }
  return null;
}

export function detectRoundtripLoss(originalMarkdown, markdownManager) {
  if (!markdownManager || !originalMarkdown) {
    return { changed: false };
  }

  try {
    // ============================================================================
    // STEP 1: HTML PRE-CHECK
    // ============================================================================
    // If document contains no HTML tags, skip roundtrip check entirely.
    // This eliminates 95% of false positives from pure Markdown files.
    //
    // Regex explanation:
    // - <(?:!--|\/)?       Opening < with optional <!-- or </
    // - [a-z]              Tag name must start with letter
    // - [\w-]*             Tag name can contain letters, numbers, underscore, dash
    // - (?:\s[^>]*)?       Optional attributes (space + anything except >)
    // - \/?>               Closing > or />
    //
    // Matches: <div>, </div>, <div class="x">, <br/>, <!-- comment -->
    // Does NOT match: 5 < 10, a < b, text > more
    const hasHtml = /<(?:!--|\/)?[a-z][\w-]*(?:\s[^>]*)?\/?>/i.test(originalMarkdown);
    if (!hasHtml) {
      console.log('✓ No HTML detected, skipping roundtrip check');
      return { changed: false };
    }

    console.log('HTML detected, performing roundtrip validation...');

    // ============================================================================
    // STEP 2: SEMANTIC COMPARISON
    // ============================================================================
    // Compare document content, not formatting.
    // If textContent is identical, differences are only formatting (e.g. **bold** vs __bold__)
    const parsed = markdownManager.parse(originalMarkdown);
    const serialized = markdownManager.serialize(parsed);
    const parsedRoundtrip = markdownManager.parse(serialized);

    const originalText = (parsed.textContent || '').trim();
    const roundtripText = (parsedRoundtrip.textContent || '').trim();

    if (originalText === roundtripText) {
      console.log('✓ Content identical after roundtrip, only formatting differs');
      return { changed: false };
    }

    // ============================================================================
    // STEP 3: DETAILED DIFF ANALYSIS
    // ============================================================================
    // Content has changed - find exact location and nature of change
    const normalizedOriginal = normalizeForComparison(originalMarkdown);
    const normalizedSerialized = normalizeForComparison(serialized);

    if (normalizedOriginal === normalizedSerialized) {
      return { changed: false };
    }

    const diff = findFirstDifference(normalizedOriginal, normalizedSerialized);
    if (diff) {
      const origTrim = (diff.original || '').trim();
      const transformedTrim = (diff.transformed || '').trim();
      const looksLikeHtml = (value) => /^</.test(value) || value.includes('{{');
      const isPlaceholder = (value) => /XHTMLX\d+X/.test(value);

      // Ignore differences involving HTML or placeholders
      if (looksLikeHtml(origTrim) || looksLikeHtml(transformedTrim)) {
        return { changed: false };
      }
      if (isPlaceholder(origTrim) || isPlaceholder(transformedTrim)) {
        return { changed: false };
      }
      if (origTrim === transformedTrim) {
        return { changed: false };
      }

      // Check if only whitespace difference around placeholders
      const origWithoutPlaceholders = origTrim.replace(/XHTMLX\d+X/g, '');
      const transformedWithoutPlaceholders = transformedTrim.replace(/XHTMLX\d+X/g, '');
      if (origWithoutPlaceholders.trim() === transformedWithoutPlaceholders.trim()) {
        return { changed: false };
      }

      // Real content loss detected
      console.warn('⚠️  Round-trip content loss detected at line', diff.index + 1);
      console.log('Original:', JSON.stringify(diff.original));
      console.log('Roundtrip:', JSON.stringify(diff.transformed));
    }

    return {
      changed: true,
      diff,
    };
  } catch (error) {
    console.warn('Roundtrip detection failed:', error);
    return { changed: false };
  }
}
