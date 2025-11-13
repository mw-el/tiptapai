// HTML Escape/Unescape Utility
// Protects HTML and Hugo shortcodes from being stripped by TipTap's Markdown parser

/**
 * Patterns to protect:
 * - HTML comments: <!--...-->
 * - HTML tags (all): <tag...>, </tag>, <tag />
 * - Hugo shortcodes: {{< ... >}}, {{< ... />}}
 * - Complete HTML blocks (tables, divs, etc.)
 */

// Use alphanumeric-only format that TipTap won't process as special syntax
// No special chars that could trigger markdown, HTML, or link detection
const PLACEHOLDER_PREFIX = 'XHTMLX';
const PLACEHOLDER_SUFFIX = 'X';

/**
 * Creates a regex to match HTML content that needs protection
 */
function createHtmlPattern() {
  return new RegExp(
    [
      // HTML comments (including multi-line)
      '<!--[\\s\\S]*?-->',

      // Hugo shortcodes (both forms)
      '\\{\\{<[^>]+>\\}\\}',
      '\\{\\{<[^>]+/\\}\\}',

      // Self-closing tags: <br>, <hr>, <img ... />, etc.
      '<[a-zA-Z][a-zA-Z0-9]*\\s*(?:[^>]*?)/?>',

      // Closing tags: </tag>
      '</[a-zA-Z][a-zA-Z0-9]*>',

      // Opening tags with attributes: <div class="...">, <table>, etc.
      '<[a-zA-Z][a-zA-Z0-9]*(?:\\s+[^>]*)?>',
    ].join('|'),
    'g'
  );
}

/**
 * Escapes HTML content by replacing it with placeholders
 * @param {string} content - Markdown content containing HTML
 * @returns {{escapedContent: string, htmlMap: Map<string, string>}} - Escaped content and mapping
 */
export function escapeHtml(content) {
  const htmlMap = new Map();
  let placeholderIndex = 0;

  const pattern = createHtmlPattern();

  const escapedContent = content.replace(pattern, (match) => {
    const placeholder = `${PLACEHOLDER_PREFIX}${placeholderIndex}${PLACEHOLDER_SUFFIX}`;
    htmlMap.set(placeholder, match);
    placeholderIndex++;

    console.log(`[HTML Escape] Protecting: ${match.substring(0, 50)} → ${placeholder}`);

    return placeholder;
  });

  console.log(`[HTML Escape] Protected ${htmlMap.size} HTML elements`);

  return { escapedContent, htmlMap };
}

/**
 * Unescapes HTML content by replacing placeholders with original HTML
 * @param {string} content - Content with placeholders
 * @param {Map<string, string>} htmlMap - Mapping of placeholders to original HTML
 * @returns {string} - Content with HTML restored
 */
export function unescapeHtml(content, htmlMap) {
  if (!htmlMap || htmlMap.size === 0) {
    console.log('[HTML Unescape] No HTML to restore');
    return content;
  }

  let restoredContent = content;
  let restoredCount = 0;

  htmlMap.forEach((originalHtml, placeholder) => {
    if (restoredContent.includes(placeholder)) {
      restoredContent = restoredContent.replace(new RegExp(escapeRegex(placeholder), 'g'), originalHtml);
      restoredCount++;
      console.log(`[HTML Unescape] Restored: ${placeholder} → ${originalHtml.substring(0, 50)}`);
    } else {
      console.warn(`[HTML Unescape] Placeholder not found: ${placeholder}`);
    }
  });

  console.log(`[HTML Unescape] Restored ${restoredCount}/${htmlMap.size} HTML elements`);

  return restoredContent;
}

/**
 * Helper to escape special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if content contains any placeholders
 * @param {string} content
 * @returns {boolean}
 */
export function hasPlaceholders(content) {
  return content.includes(PLACEHOLDER_PREFIX);
}

/**
 * Get all placeholders from content
 * @param {string} content
 * @returns {string[]}
 */
export function extractPlaceholders(content) {
  const pattern = new RegExp(`${PLACEHOLDER_PREFIX}\\d+${PLACEHOLDER_SUFFIX}`, 'g');
  return content.match(pattern) || [];
}
