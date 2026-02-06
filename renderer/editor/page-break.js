import { Node } from '@tiptap/core';

const PAGE_BREAK_HTML = '<div class="page-break"></div>';

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      { tag: 'div.page-break' },
    ];
  },

  renderHTML() {
    return ['div', { class: 'page-break' }, 0];
  },

  parseMarkdown(token) {
    if (token.type !== 'html' || !token.block) {
      return [];
    }
    const raw = (token.raw ?? token.text ?? '').trim();
    if (raw === PAGE_BREAK_HTML) {
      return { type: 'pageBreak' };
    }
    return [];
  },

  renderMarkdown() {
    return PAGE_BREAK_HTML + '\n';
  },

  addCommands() {
    return {
      setPageBreak: () => ({ chain }) => {
        return chain().insertContent({ type: this.name }).run();
      },
    };
  },

  addNodeView() {
    return () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'page-break-widget';
      wrapper.contentEditable = 'false';

      const line = document.createElement('div');
      line.className = 'page-break-line';

      const label = document.createElement('span');
      label.className = 'page-break-label';
      label.textContent = 'Seitenumbruch';

      wrapper.appendChild(line);
      wrapper.appendChild(label);
      wrapper.appendChild(line.cloneNode());

      return { dom: wrapper };
    };
  },
});
