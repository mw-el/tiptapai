import { Node } from '@tiptap/core';

const COLUMN_BREAK_HTML = '<div class="column-break"></div>';

export const ColumnBreak = Node.create({
  name: 'columnBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      { tag: 'div.column-break' },
    ];
  },

  renderHTML() {
    return ['div', { class: 'column-break' }, 0];
  },

  parseMarkdown(token) {
    if (token.type !== 'html' || !token.block) {
      return [];
    }
    const raw = (token.raw ?? token.text ?? '').trim();
    if (raw === COLUMN_BREAK_HTML) {
      return { type: 'columnBreak' };
    }
    return [];
  },

  renderMarkdown() {
    return COLUMN_BREAK_HTML + '\n';
  },

  addCommands() {
    return {
      setColumnBreak: () => ({ chain }) => {
        return chain().insertContent({ type: this.name }).run();
      },
    };
  },

  addNodeView() {
    return () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'column-break-widget';
      wrapper.contentEditable = 'false';

      const line = document.createElement('div');
      line.className = 'column-break-line';

      const label = document.createElement('span');
      label.className = 'column-break-label';
      label.textContent = 'Spaltenumbruch';

      wrapper.appendChild(line);
      wrapper.appendChild(label);
      wrapper.appendChild(line.cloneNode());

      return { dom: wrapper };
    };
  },
});
