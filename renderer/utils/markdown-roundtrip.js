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
    const parsed = markdownManager.parse(originalMarkdown);
    const serialized = markdownManager.serialize(parsed);

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

      // Only log if we're actually going to show a warning
      console.warn('⚠️  Round-trip difference detected at line', diff.index + 1);
      console.log('Original:', JSON.stringify(diff.original));
      console.log('Serialized:', JSON.stringify(diff.transformed));
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
