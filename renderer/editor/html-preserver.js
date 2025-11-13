import { Node } from '@tiptap/core';

const COMMENT_START = '<!--';

const isComment = (raw = '') => raw.trimStart().startsWith(COMMENT_START);

function createHtmlNode({ name, block, datasetAttr, className, predicate }) {
  const tagName = block ? 'pre' : 'span';
  return Node.create({
    name,
    group: block ? 'block' : 'inline',
    inline: !block,
    content: 'text*',
    code: true,
    defining: true,

    parseHTML() {
      return [
        {
          tag: `${tagName}[${datasetAttr}="true"]`
        }
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        tagName,
        {
          ...HTMLAttributes,
          [datasetAttr]: 'true',
          class: `${HTMLAttributes.class || ''} ${className}`.trim()
        },
        0
      ];
    },

    parseMarkdown: (token, helpers) => {
      if (token.type !== 'html') {
        return [];
      }

      const isBlockToken = token.block === true;
      if (block !== isBlockToken) {
        return [];
      }

      const raw = token.raw ?? token.text ?? '';

      if (predicate && !predicate(raw)) {
        return [];
      }

      const normalized = block ? raw.replace(/\n$/, '') : raw;
      const textNode = helpers.createTextNode(normalized);
      return helpers.createNode(name, undefined, [textNode]);
    },

    renderMarkdown: (node, h) => {
      if (!node.content) {
        return '';
      }

      const html = h.renderChildren(node.content);
      if (block) {
        return html.endsWith('\n') ? html : `${html}\n`;
      }
      return html;
    }
  });
}

export const RawHtmlBlock = createHtmlNode({
  name: 'rawHTMLBlock',
  block: true,
  datasetAttr: 'data-raw-html',
  className: 'raw-html-block',
  predicate: () => true
});

export const HtmlCommentBlock = createHtmlNode({
  name: 'htmlComment',
  block: true,
  datasetAttr: 'data-html-comment',
  className: 'html-comment-block',
  predicate: (raw) => isComment(raw)
});

export const InlineHtmlFragment = createHtmlNode({
  name: 'inlineHTML',
  block: false,
  datasetAttr: 'data-inline-html',
  className: 'inline-html',
  predicate: (raw) => !isComment(raw)
});

export const InlineHtmlComment = createHtmlNode({
  name: 'inlineHTMLComment',
  block: false,
  datasetAttr: 'data-inline-html-comment',
  className: 'inline-html-comment',
  predicate: (raw) => isComment(raw)
});
