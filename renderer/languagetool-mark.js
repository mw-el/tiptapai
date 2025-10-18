// TipTap Custom Mark für LanguageTool Fehler-Highlighting
// Sprint 2.1

import { Mark } from '@tiptap/core';

export const LanguageToolMark = Mark.create({
  name: 'languagetool',

  addAttributes() {
    return {
      // Eindeutige ID für den Fehler
      errorId: {
        default: null,
        parseHTML: element => element.getAttribute('data-error-id'),
        renderHTML: attributes => ({
          'data-error-id': attributes.errorId,
        }),
      },
      // Fehlerbeschreibung
      message: {
        default: '',
        parseHTML: element => element.getAttribute('data-message'),
        renderHTML: attributes => ({
          'data-message': attributes.message,
        }),
      },
      // Korrekturvorschläge (als JSON-String)
      suggestions: {
        default: '[]',
        parseHTML: element => element.getAttribute('data-suggestions'),
        renderHTML: attributes => ({
          'data-suggestions': attributes.suggestions,
        }),
      },
      // Kategorie (error, warning, suggestion)
      category: {
        default: 'error',
        parseHTML: element => element.getAttribute('data-category'),
        renderHTML: attributes => ({
          'data-category': attributes.category,
        }),
      },
      // Rule ID
      ruleId: {
        default: '',
        parseHTML: element => element.getAttribute('data-rule-id'),
        renderHTML: attributes => ({
          'data-rule-id': attributes.ruleId,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.lt-error',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { class: 'lt-error', ...HTMLAttributes }, 0];
  },

  addCommands() {
    return {
      // Fehler-Mark setzen
      setLanguageToolError: (attributes) => ({ commands }) => {
        return commands.setMark(this.name, attributes);
      },
      // Fehler-Mark entfernen
      unsetLanguageToolError: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});
