import { Node } from '@tiptap/core';

// Matches a block-level HTML token that is solely a self-closing or open <img> tag.
// Captures src, alt and title attributes in any order.
const IMG_RE = /^\s*<img\b([^>]*)\/?>/i;

function attr(attrString, name) {
  const m = attrString.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!m) return '';
  return m[1] ?? m[2] ?? m[3] ?? '';
}

/**
 * Returns true when a raw HTML block token is solely an <img> tag.
 */
export const isImgBlock = (raw = '') => IMG_RE.test(raw.trim());

/**
 * TipTap Node that converts a raw `<img src="...">` block HTML token into a
 * proper image node so that it is rendered as an actual <img> element by
 * the editor instead of being shown as a raw-HTML code block.
 */
export const HtmlImageBlock = Node.create({
  name: 'htmlImageBlock',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      src:   { default: null },
      alt:   { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-html-image-block="true"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, title } = HTMLAttributes;
    return [
      'div',
      { 'data-html-image-block': 'true' },
      ['img', { src, alt: alt || undefined, title: title || undefined }],
    ];
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'html' || token.block !== true) {
      return [];
    }
    const raw = token.raw ?? token.text ?? '';
    const m = raw.trim().match(IMG_RE);
    if (!m) return [];

    const attrStr = m[1];
    return helpers.createNode(this.name, {
      src:   attr(attrStr, 'src'),
      alt:   attr(attrStr, 'alt') || null,
      title: attr(attrStr, 'title') || null,
    });
  },

  renderMarkdown(node) {
    const { src, alt, title } = node.attrs;
    if (!src) return '';
    const altPart   = alt   ? ` alt="${alt}"`   : '';
    const titlePart = title ? ` title="${title}"` : '';
    return `<img src="${src}"${altPart}${titlePart}>\n`;
  },
});
