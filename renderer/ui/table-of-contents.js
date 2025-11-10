// Table of Contents - Inhaltsverzeichnis für aktive Datei
// Zeigt Überschriften-Struktur und ermöglicht Navigation

/**
 * Extract headings from document
 * @param {Editor} editor - TipTap Editor instance
 * @returns {Array} Array of heading objects
 */
export function extractHeadings(editor) {
  if (!editor) return [];

  const headings = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({
        level: node.attrs.level,      // 1-6
        text: node.textContent,        // "Kapitel 1"
        pos: pos,                      // Position vor dem Heading-Node
        contentPos: pos + 1,           // Erste Zeichenposition im Heading
        id: `heading-${pos}`           // Eindeutige ID
      });
    }
  });

  return headings;
}

/**
 * Build hierarchical tree from flat heading list
 * @param {Array} headings - Flat list of headings
 * @returns {Array} Nested tree structure
 */
export function buildHeadingTree(headings) {
  if (headings.length === 0) return [];

  const root = { children: [], level: 0 };
  const stack = [root];

  headings.forEach(heading => {
    // Pop stack until we find correct parent level
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    const item = { ...heading, children: [] };
    parent.children.push(item);
    stack.push(item);
  });

  return root.children;
}

/**
 * Find active heading (closest before cursor)
 * @param {Editor} editor - TipTap Editor instance
 * @param {Array} headings - Flat list of headings
 * @returns {Object|null} Active heading or null
 */
export function findActiveHeading(editor, headings) {
  if (!editor || headings.length === 0) return null;

  const { from } = editor.state.selection;

  // Find last heading before cursor
  for (let i = headings.length - 1; i >= 0; i--) {
    if (headings[i].contentPos <= from) {
      return headings[i];
    }
  }

  return headings[0]; // Fallback: first heading
}

/**
 * Render TOC as HTML
 * @param {Array} tree - Nested heading tree
 * @param {Object} activeHeading - Currently active heading
 * @returns {string} HTML string
 */
export function renderTOC(tree, activeHeading) {
  if (tree.length === 0) {
    return '<div class="toc-empty">Keine Überschriften</div>';
  }

  function renderItem(item) {
    const isActive = activeHeading && activeHeading.id === item.id;
    const hasChildren = item.children && item.children.length > 0;

    return `
      <li class="toc-item ${isActive ? 'active' : ''}">
        <span class="toc-link" data-pos="${item.contentPos}" title="${item.text}">
          ${item.text}
        </span>
        ${hasChildren ? `
          <ul class="toc-list toc-level-${item.level}">
            ${item.children.map(child => renderItem(child)).join('')}
          </ul>
        ` : ''}
      </li>
    `;
  }

  return `
    <ul class="toc-list toc-root">
      ${tree.map(item => renderItem(item)).join('')}
    </ul>
  `;
}

/**
 * Update TOC display
 * @param {Editor} editor - TipTap Editor instance
 * @param {string} containerSelector - CSS selector for TOC container
 */
export function updateTOC(editor, containerSelector = '#toc-content') {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const headings = extractHeadings(editor);
  const tree = buildHeadingTree(headings);
  const activeHeading = findActiveHeading(editor, headings);

  container.innerHTML = renderTOC(tree, activeHeading);

  // Add click handlers
  container.querySelectorAll('.toc-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const pos = parseInt(e.target.getAttribute('data-pos'));
      jumpToHeading(editor, pos);
    });
  });

  // Ensure active heading stays visible inside the TOC container
  const activeItem = container.querySelector('.toc-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Jump to heading position
 * @param {Editor} editor - TipTap Editor instance
 * @param {number} pos - Position in document
 */
export function jumpToHeading(editor, pos) {
  if (!editor) return;

  editor.chain()
    .focus()
    .setTextSelection(Math.max(1, pos))
    .run();

  // Update TOC immediately so highlight switches to the new heading
  updateTOC(editor);

  // Scroll into view
  setTimeout(() => {
    const editorEl = document.querySelector('.tiptap-editor');
    if (editorEl) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Scroll to center of viewport
        editorEl.scrollBy({
          top: rect.top - editorEl.clientHeight / 2,
          behavior: 'smooth'
        });
      }
    }
  }, 50);
}

/**
 * Initialize TOC with auto-update
 * @param {Editor} editor - TipTap Editor instance
 * @returns {Function} Cleanup function
 */
export function initTOC(editor) {
  // Initial update
  updateTOC(editor);

  // Update on content or selection change (debounced)
  let updateTimeout;
  const debouncedUpdate = () => {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => updateTOC(editor), 300);
  };

  // We'll call this from app.js onUpdate/onSelectionUpdate
  return debouncedUpdate;
}
