import { Node } from '@tiptap/core';
import { isImgBlock }   from './html-image-block.js';
import { isMediaBlock } from './html-media-block.js';

/**
 * Returns true when the raw token should be handled by HtmlPreviewBlock
 * (i.e. it is a block html token that is NOT already claimed by the
 * more specific image / media handlers).
 */
export const isPreviewBlock = (raw = '') =>
  !isImgBlock(raw) && !isMediaBlock(raw);

/**
 * TipTap Node that renders arbitrary block-level HTML as a live preview
 * inside the editor rather than as a raw code block.
 *
 * - The stored raw HTML is set as innerHTML of a sandboxed preview div.
 * - A small pencil-button overlaid in the top-right corner opens an
 *   inline editor (textarea + save/cancel) so the user can edit the
 *   HTML directly without leaving the document.
 * - renderMarkdown round-trips the raw HTML verbatim.
 */
export const HtmlPreviewBlock = Node.create({
  name: 'htmlPreviewBlock',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      rawHtml: { default: '' },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-html-preview-block="true"]' },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    // We render a wrapper div with data attribute; the actual innerHTML
    // is injected via addNodeView below (not available in renderHTML).
    // renderHTML is used as fallback (e.g. clipboard / SSR).
    return [
      'div',
      {
        'data-html-preview-block': 'true',
        'data-raw-html': HTMLAttributes.rawHtml || '',
      },
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const raw = node.attrs.rawHtml || '';

      // ── Outer wrapper ──────────────────────────────────────────────────
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-html-preview-block', 'true');
      wrapper.style.cssText = [
        'position:relative',
        'border:1px dashed #ccc',
        'border-radius:4px',
        'padding:8px 36px 8px 8px',
        'margin:4px 0',
        'background:#fafafa',
      ].join(';');

      // ── Preview area ───────────────────────────────────────────────────
      const preview = document.createElement('div');
      preview.className = 'html-preview-content';
      preview.innerHTML = raw;     // render HTML live
      wrapper.appendChild(preview);

      // ── Edit button ────────────────────────────────────────────────────
      const editBtn = document.createElement('button');
      editBtn.title = 'HTML bearbeiten';
      editBtn.innerHTML = '✏️';
      editBtn.style.cssText = [
        'position:absolute',
        'top:4px',
        'right:4px',
        'background:rgba(255,255,255,0.85)',
        'border:1px solid #bbb',
        'border-radius:3px',
        'cursor:pointer',
        'padding:2px 5px',
        'font-size:13px',
        'line-height:1',
        'z-index:10',
      ].join(';');
      wrapper.appendChild(editBtn);

      // ── Inline editor (hidden initially) ───────────────────────────────
      let editorArea = null;

      const openEditor = () => {
        if (editorArea) return; // already open

        preview.style.display = 'none';
        editBtn.style.display = 'none';

        editorArea = document.createElement('div');
        editorArea.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

        const textarea = document.createElement('textarea');
        textarea.value = node.attrs.rawHtml || '';
        textarea.style.cssText = [
          'width:100%',
          'min-height:80px',
          'font-family:monospace',
          'font-size:13px',
          'padding:6px',
          'border:1px solid #aaa',
          'border-radius:3px',
          'resize:vertical',
          'box-sizing:border-box',
        ].join(';');
        textarea.spellcheck = false;

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Abbrechen';
        cancelBtn.style.cssText = 'padding:3px 10px;cursor:pointer;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Speichern';
        saveBtn.style.cssText = 'padding:3px 10px;cursor:pointer;font-weight:bold;';

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);
        editorArea.appendChild(textarea);
        editorArea.appendChild(btnRow);
        wrapper.insertBefore(editorArea, null);

        textarea.focus();

        cancelBtn.addEventListener('click', closeEditor);

        saveBtn.addEventListener('click', () => {
          const newHtml = textarea.value;
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (pos !== null && editor) {
            editor
              .chain()
              .focus()
              .command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { rawHtml: newHtml });
                return true;
              })
              .run();
          }
          closeEditor();
        });
      };

      const closeEditor = () => {
        if (editorArea) {
          editorArea.remove();
          editorArea = null;
        }
        // Refresh preview with latest attr value
        preview.innerHTML = node.attrs.rawHtml || '';
        preview.style.display = '';
        editBtn.style.display = '';
      };

      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEditor();
      });

      return {
        dom: wrapper,
        // Called by TipTap when the node's attrs change (e.g. after save)
        update(updatedNode) {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          if (!editorArea) {
            // Only refresh preview when editor is not open
            preview.innerHTML = updatedNode.attrs.rawHtml || '';
          }
          return true;
        },
      };
    };
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'html' || token.block !== true) return [];
    const raw = token.raw ?? token.text ?? '';
    if (!isPreviewBlock(raw)) return [];
    return helpers.createNode(this.name, { rawHtml: raw.replace(/\n$/, '') });
  },

  renderMarkdown(node) {
    const raw = node.attrs.rawHtml || '';
    return raw.endsWith('\n') ? raw : `${raw}\n`;
  },
});
