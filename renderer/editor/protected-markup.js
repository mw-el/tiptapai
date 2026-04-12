import { Node, Extension, mergeAttributes } from '@tiptap/core';

const PROTECTED_INLINE_ATTR = 'data-protected-inline';
const PROTECTED_BLOCK_ATTR = 'data-protected-block';

/**
 * Parse a raw HTML string to check if it is a standalone <img> tag.
 * Returns { src, alt, title } if yes, null otherwise.
 * Matches both double- and single-quoted attribute values; handles self-closing />.
 */
function parseImgTag(raw) {
  const trimmed = (raw || '').trim();
  const m = /^<img\b([^>]*?)\/?>$/i.exec(trimmed);
  if (!m) return null;
  const attrs = m[1];
  const src   = (/\bsrc=["']([^"']*)["']/i.exec(attrs)   || [])[1] ?? '';
  const alt   = (/\balt=["']([^"']*)["']/i.exec(attrs)   || [])[1] ?? '';
  const title = (/\btitle=["']([^"']*)["']/i.exec(attrs) || [])[1] ?? '';
  return { src, alt, title };
}

/** Bestimmt das Anzeige-Label für den Pill-Header eines ProtectedBlock. */
function getHtmlLabel(raw) {
  const t = raw.trim();
  if (/^\{\{[<%]?/.test(t) || /^\{%/.test(t)) return 'Shortcode';
  const m = /^<(\w+)/.exec(t);
  if (m) return m[1].toUpperCase();
  if (t.startsWith('<!--')) return 'Kommentar';
  return 'HTML';
}

/** Erste Zeile des Inhalts, auf 60 Zeichen gekürzt. */
function getHtmlPreview(raw) {
  const first = raw.trim().split('\n')[0];
  return first.length > 60 ? first.slice(0, 60) + '…' : first;
}

/**
 * Build a NodeView factory for an inline or block protected-markup node.
 * - If the node's text content is a standalone <img> tag → renders a real <img> element.
 *   The relative src is intentionally kept as-is; the existing resolveEditorImages()
 *   MutationObserver in session-manager.js will patch it to localfile:// asynchronously.
 * - Otherwise → falls back to letting ProseMirror render the raw-HTML text into
 *   a contentDOM element (same visual result as the current renderHTML approach).
 *
 * The renderMarkdown method is NOT changed, so saving still writes the original raw HTML.
 */
function makeProtectedNodeView({ block }) {
  const outerTag       = block ? 'div'  : 'span';
  const protectedAttr  = block ? PROTECTED_BLOCK_ATTR : PROTECTED_INLINE_ATTR;
  const baseClass      = block ? 'protected-block' : 'protected-inline';

  return function nodeViewFactory({ node }) {
    const imgAttrs = parseImgTag(node.textContent);

    if (imgAttrs !== null) {
      // --- IMG case: render a real image element (leaf, no contentDOM) ---
      const dom = document.createElement(outerTag);
      dom.setAttribute(protectedAttr, 'true');
      dom.className = `${baseClass} ${baseClass}-img`;

      const img = document.createElement('img');
      img.src = imgAttrs.src;
      img.alt = imgAttrs.alt;
      if (imgAttrs.title) img.title = imgAttrs.title;
      dom.appendChild(img);

      return {
        dom,
        update(newNode) {
          const newImg = parseImgTag(newNode.textContent);
          if (newImg === null) return false; // changed to non-img → recreate
          const imgEl = dom.querySelector('img');
          if (imgEl) {
            // src will be re-resolved by resolveEditorImages() via MutationObserver
            imgEl.src   = newImg.src;
            imgEl.alt   = newImg.alt;
            if (newImg.title) imgEl.title = newImg.title;
          }
          return true;
        },
      };
    }

    // --- Non-img case ---
    if (block) {
      // Block: Pill-Header (immer sichtbar) + klappbarer Inhaltsbereich
      const dom = document.createElement('div');
      dom.setAttribute(protectedAttr, 'true');
      dom.className = `${baseClass} ${baseClass}-pill`;

      const header = document.createElement('div');
      header.className = 'protected-block-header';

      const icon = document.createElement('span');
      icon.className = 'protected-block-icon';
      icon.textContent = '▶';

      const labelEl = document.createElement('span');
      labelEl.className = 'protected-block-label';
      labelEl.textContent = getHtmlLabel(node.textContent);

      const preview = document.createElement('span');
      preview.className = 'protected-block-preview';
      preview.textContent = getHtmlPreview(node.textContent);

      header.append(icon, labelEl, preview);
      dom.appendChild(header);

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'protected-block-content';
      const pre = document.createElement('pre');
      contentWrapper.appendChild(pre);
      dom.appendChild(contentWrapper);

      let expanded = false;
      header.addEventListener('click', () => {
        expanded = !expanded;
        icon.textContent = expanded ? '▼' : '▶';
        dom.classList.toggle('protected-block-expanded', expanded);
      });

      return {
        dom,
        contentDOM: pre,
        stopEvent(event) {
          return event.type === 'click' && header.contains(event.target);
        },
        update(newNode) {
          labelEl.textContent = getHtmlLabel(newNode.textContent);
          preview.textContent = getHtmlPreview(newNode.textContent);
          return true;
        },
      };
    }

    // Inline non-img: ProseMirror rendert Text direkt in den Span (Pill-CSS greift)
    const dom = document.createElement(outerTag);
    dom.setAttribute(protectedAttr, 'true');
    dom.className = baseClass;
    return { dom, contentDOM: dom };
  };
}

// Void HTML elements that have no closing tag and no text content.
// These need special handling because generateJSON() drops them when
// no dedicated extension (like Image) is registered.
const VOID_ELEMENTS = 'img, br, hr, input, source, embed, wbr, col, area, track';

function isShortcodeStart(src = '') {
  return src.startsWith('{{') || src.startsWith('{%');
}

function getShortcodeCloseToken(src = '') {
  if (src.startsWith('{{<')) return '>}}';
  if (src.startsWith('{{%')) return '%}}';
  if (src.startsWith('{{')) return '}}';
  if (src.startsWith('{%')) return '%}';
  return null;
}

function getShortcodeOpenLength(src = '') {
  if (src.startsWith('{{<') || src.startsWith('{{%')) return 3;
  if (src.startsWith('{{') || src.startsWith('{%')) return 2;
  return 0;
}

export const ProtectedInline = Node.create({
  name: 'protectedInline',
  markdownTokenName: 'html',
  group: 'inline',
  inline: true,
  content: 'text*',
  isolating: true,
  selectable: true,
  marks: '',

  addAttributes() {
    return {
      rawHtml: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-raw-html'),
        renderHTML: (attrs) => {
          if (!attrs.rawHtml) return {};
          return { 'data-raw-html': attrs.rawHtml };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[${PROTECTED_INLINE_ATTR}="true"]`,
      },
      // Catch void HTML elements that generateJSON() would otherwise drop
      {
        tag: VOID_ELEMENTS,
        getAttrs: (el) => ({ rawHtml: el.outerHTML }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        [PROTECTED_INLINE_ATTR]: 'true',
        class: `${HTMLAttributes.class || ''} protected-inline`.trim(),
      }),
      0,
    ];
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'html' && token.type !== 'shortcode_inline') {
      return [];
    }

    if (token.block) {
      return [];
    }

    const raw = token.raw ?? token.text ?? '';
    if (!raw) {
      return [];
    }

    const textNode = helpers.createTextNode(raw);
    return helpers.createNode('protectedInline', undefined, [textNode]);
  },

  renderMarkdown(node, helpers) {
    if (node.attrs.rawHtml) {
      return node.attrs.rawHtml;
    }
    return helpers.renderChildren(node);
  },

  addNodeView() {
    return makeProtectedNodeView({ block: false });
  },
});

export const ProtectedBlock = Node.create({
  name: 'protectedBlock',
  markdownTokenName: 'html',
  group: 'block',
  content: 'inline*',
  isolating: true,
  defining: true,
  marks: '',

  parseHTML() {
    return [
      {
        tag: `div[${PROTECTED_BLOCK_ATTR}="true"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [PROTECTED_BLOCK_ATTR]: 'true',
        class: `${HTMLAttributes.class || ''} protected-block`.trim(),
      }),
      0,
    ];
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'html' && token.type !== 'shortcode_block') {
      return [];
    }

    if (token.type === 'html' && !token.block) {
      return [];
    }

    const raw = token.raw ?? token.text ?? '';
    if (!raw) {
      return [];
    }

    const normalized = raw.replace(/\s+$/, '');
    const trimmed = normalized.trim();
    const isLineBreakOnly = /^<br\s*\/?>$/i.test(trimmed);

    if (isLineBreakOnly) {
      const textNode = helpers.createTextNode(trimmed);
      const inlineNode = helpers.createNode('protectedInline', undefined, [textNode]);
      return helpers.createNode('paragraph', undefined, [inlineNode]);
    }

    const textNode = helpers.createTextNode(normalized);
    return helpers.createNode('protectedBlock', undefined, [textNode]);
  },

  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node);
    if (!content) {
      return '';
    }
    return content.endsWith('\n') ? content : `${content}\n`;
  },

  addNodeView() {
    return makeProtectedNodeView({ block: true });
  },
});

export const ShortcodeInlineTokenizer = Extension.create({
  name: 'shortcodeInlineTokenizer',
  markdownTokenName: 'shortcode_inline',

  markdownTokenizer: {
    name: 'shortcode_inline',
    level: 'inline',
    start(src) {
      const idx = src.search(/(\{\{|\{\%)/);
      return idx;
    },
    tokenize(src) {
      if (!isShortcodeStart(src)) {
        return undefined;
      }

      const closeToken = getShortcodeCloseToken(src);
      if (!closeToken) {
        return undefined;
      }

      const openLen = getShortcodeOpenLength(src);
      const endIndex = src.indexOf(closeToken, openLen);
      if (endIndex === -1) {
        return undefined;
      }

      const raw = src.slice(0, endIndex + closeToken.length);

      return {
        type: 'shortcode_inline',
        raw,
        text: raw,
        tokens: [],
      };
    },
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'shortcode_inline') {
      return [];
    }

    const raw = token.raw ?? token.text ?? '';
    if (!raw) {
      return [];
    }

    const textNode = helpers.createTextNode(raw);
    return helpers.createNode('protectedInline', undefined, [textNode]);
  },
});

export const HtmlEntityTokenizer = Extension.create({
  name: 'htmlEntityTokenizer',
  markdownTokenName: 'html_entity',

  markdownTokenizer: {
    name: 'html_entity',
    level: 'inline',
    start(src) {
      const idx = src.search(/&(nbsp|#160|#xA0|shy|#173|#xAD);/i);
      return idx;
    },
    tokenize(src) {
      const match = src.match(/^&(nbsp|#160|#xA0|shy|#173|#xAD);/i);
      if (!match) {
        return undefined;
      }

      const raw = match[0];
      return {
        type: 'html_entity',
        raw,
        text: raw,
        tokens: [],
      };
    },
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'html_entity') {
      return [];
    }

    const raw = token.raw ?? token.text ?? '';
    if (!raw) {
      return [];
    }

    const textNode = helpers.createTextNode(raw);
    return helpers.createNode('protectedInline', undefined, [textNode]);
  },
});

export const ShortcodeBlockTokenizer = Extension.create({
  name: 'shortcodeBlockTokenizer',
  markdownTokenName: 'shortcode_block',

  markdownTokenizer: {
    name: 'shortcode_block',
    level: 'block',
    start(src) {
      const idx = src.search(/(\{\{|\{\%)/);
      return idx;
    },
    tokenize(src) {
      const lineMatch = /^(.*?)(\n|$)/.exec(src);
      if (!lineMatch) {
        return undefined;
      }

      const line = lineMatch[1];
      const lineBreak = lineMatch[2];
      const trimmed = line.trim();

      if (!isShortcodeStart(trimmed)) {
        return undefined;
      }

      const closeToken = getShortcodeCloseToken(trimmed);
      if (!closeToken) {
        return undefined;
      }

      const openLen = getShortcodeOpenLength(trimmed);
      const endIndex = trimmed.indexOf(closeToken, openLen);
      if (endIndex === -1) {
        return undefined;
      }

      if (endIndex + closeToken.length !== trimmed.length) {
        return undefined;
      }

      const raw = line + (lineBreak || '');
      const text = line;

      return {
        type: 'shortcode_block',
        raw,
        text,
        tokens: [],
      };
    },
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'shortcode_block') {
      return [];
    }

    const raw = token.text ?? token.raw ?? '';
    if (!raw) {
      return [];
    }

    const textNode = helpers.createTextNode(raw);
    return helpers.createNode('protectedBlock', undefined, [textNode]);
  },
});
