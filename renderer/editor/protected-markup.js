import { Node, Extension, mergeAttributes } from '@tiptap/core';
import State from './editor-state.js';

const PROTECTED_INLINE_ATTR = 'data-protected-inline';
const PROTECTED_BLOCK_ATTR = 'data-protected-block';

// Void HTML elements that have no closing tag and no text content.
// These need special handling because generateJSON() drops them when
// no dedicated extension (like Image) is registered.
const VOID_ELEMENTS = 'img, br, hr, input, source, embed, wbr, col, area, track';
const VOID_ELEMENT_NAMES = new Set(
  VOID_ELEMENTS.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean)
);

function getDirectoryPath(filePath = '') {
  if (!filePath) {
    return '';
  }

  const normalized = String(filePath).replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex >= 0 ? normalized.slice(0, slashIndex + 1) : '';
}

function isAbsoluteAssetUrl(value = '') {
  return /^(?:[a-z]+:|\/\/|#|\/)/i.test(String(value).trim());
}

function parseHtmlAttributes(attrsText = '') {
  const attrs = {};
  const attrPattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = attrPattern.exec(attrsText)) !== null) {
    const [, key, doubleQuoted, singleQuoted, unquoted] = match;
    if (!key || key === '/') {
      continue;
    }

    attrs[key] = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
  }

  return attrs;
}

function getRenderableVoidElement(rawHtml = '') {
  const trimmed = String(rawHtml || '').trim();
  const match = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)\/?>$/);
  if (!match) {
    return null;
  }

  const tagName = match[1].toLowerCase();
  if (!VOID_ELEMENT_NAMES.has(tagName)) {
    return null;
  }

  const attrs = parseHtmlAttributes(match[2] || '');
  if (tagName === 'img' && attrs.src && !isAbsoluteAssetUrl(attrs.src)) {
    const baseDir = getDirectoryPath(State.currentFilePath);
    if (baseDir) {
      attrs.src = new URL(attrs.src, `file://${baseDir}`).href;
    }
  }

  return { tagName, attrs };
}

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
    const renderableVoid = getRenderableVoidElement(node.attrs.rawHtml);
    if (renderableVoid) {
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          [PROTECTED_INLINE_ATTR]: 'true',
          'data-raw-html': node.attrs.rawHtml,
          class: `${HTMLAttributes.class || ''} protected-inline protected-inline-rendered`.trim(),
        }),
        [renderableVoid.tagName, renderableVoid.attrs],
      ];
    }

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

    const renderableVoid = getRenderableVoidElement(raw);
    if (renderableVoid) {
      return helpers.createNode('protectedInline', { rawHtml: raw });
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
});

export const ProtectedBlock = Node.create({
  name: 'protectedBlock',
  markdownTokenName: 'html',
  group: 'block',
  content: 'inline*',
  isolating: true,
  defining: true,
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
        tag: `div[${PROTECTED_BLOCK_ATTR}="true"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const renderableVoid = getRenderableVoidElement(HTMLAttributes['data-raw-html']);
    if (renderableVoid) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          [PROTECTED_BLOCK_ATTR]: 'true',
          class: `${HTMLAttributes.class || ''} protected-block protected-block-rendered`.trim(),
        }),
        [renderableVoid.tagName, renderableVoid.attrs],
      ];
    }

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
    const renderableVoid = getRenderableVoidElement(trimmed);

    if (isLineBreakOnly) {
      const textNode = helpers.createTextNode(trimmed);
      const inlineNode = helpers.createNode('protectedInline', undefined, [textNode]);
      return helpers.createNode('paragraph', undefined, [inlineNode]);
    }

    if (renderableVoid) {
      return helpers.createNode('protectedBlock', { rawHtml: trimmed });
    }

    const textNode = helpers.createTextNode(normalized);
    return helpers.createNode('protectedBlock', undefined, [textNode]);
  },

  renderMarkdown(node, helpers) {
    if (node.attrs.rawHtml) {
      return `${node.attrs.rawHtml}\n`;
    }

    const content = helpers.renderChildren(node);
    if (!content) {
      return '';
    }
    return content.endsWith('\n') ? content : `${content}\n`;
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
