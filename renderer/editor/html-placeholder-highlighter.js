// TipTap Extension to visually highlight HTML placeholders
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const HtmlPlaceholderHighlighter = Extension.create({
  name: 'htmlPlaceholderHighlighter',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('htmlPlaceholderHighlighter'),

        state: {
          init(_, { doc }) {
            return findPlaceholders(doc);
          },
          apply(transaction, oldState) {
            return transaction.docChanged
              ? findPlaceholders(transaction.doc)
              : oldState;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

/**
 * Find all HTML placeholders in the document and create decorations
 */
function findPlaceholders(doc) {
  const decorations = [];
  const regex = /XHTMLX\d+X/g;

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }

    const text = node.text;
    let match;

    regex.lastIndex = 0; // Reset regex state

    while ((match = regex.exec(text)) !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;

      decorations.push(
        Decoration.inline(from, to, {
          class: 'html-placeholder',
          title: 'Click to edit HTML content',
        })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}
