// TipTap Custom Mark für geprüfte Paragraphen
// Visuelles Feedback: Grüner Hintergrund für bereits geprüfte Absätze
// Sprint 2.1 - Paragraph-based incremental checking

import { Mark } from '@tiptap/core';

export const CheckedParagraphMark = Mark.create({
  name: 'checkedParagraph',

  // WICHTIG: inclusive sorgt dafür dass die Mark über den ganzen Paragraph geht
  inclusive: true,

  // spanning: true bedeutet die Mark kann über mehrere Nodes gehen
  spanning: true,

  addAttributes() {
    return {
      // Timestamp wann der Paragraph geprüft wurde
      checkedAt: {
        default: null,
        parseHTML: element => element.getAttribute('data-checked-at'),
        renderHTML: attributes => ({
          'data-checked-at': attributes.checkedAt,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.checked-paragraph',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { class: 'checked-paragraph', ...HTMLAttributes }, 0];
  },

  addCommands() {
    return {
      // Paragraph als geprüft markieren
      setCheckedParagraph: (attributes) => ({ commands }) => {
        return commands.setMark(this.name, attributes);
      },
      // Geprüft-Status entfernen
      unsetCheckedParagraph: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});
