import { Node, Extension, mergeAttributes } from '@tiptap/core';

const PROTECTED_INLINE_ATTR = 'data-protected-inline';
const PROTECTED_BLOCK_ATTR = 'data-protected-block';

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

  parseHTML() {
    return [
      {
        tag: `span[${PROTECTED_INLINE_ATTR}="true"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
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
