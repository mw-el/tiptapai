import { Mark } from '@tiptap/core';

export const LanguageToolIgnoredMark = Mark.create({
  name: 'languagetoolIgnored',

  inclusive: true,

  addAttributes() {
    return {
      ruleId: {
        default: '',
        parseHTML: element => element.getAttribute('data-rule-id') || '',
        renderHTML: attributes => ({
          'data-rule-id': attributes.ruleId || '',
        }),
      },
      ignoredAt: {
        default: null,
        parseHTML: element => element.getAttribute('data-ignored-at'),
        renderHTML: attributes => ({
          'data-ignored-at': attributes.ignoredAt || '',
        }),
      },
      message: {
        default: '',
        parseHTML: element => element.getAttribute('data-message') || '',
        renderHTML: attributes => ({
          'data-message': attributes.message || '',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.lt-ignored',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { class: 'lt-ignored', ...HTMLAttributes }, 0];
  },

  addCommands() {
    return {
      setLanguageToolIgnored:
        (attributes = {}) =>
        ({ commands }) =>
          commands.setMark(this.name, attributes),
      unsetLanguageToolIgnored:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
