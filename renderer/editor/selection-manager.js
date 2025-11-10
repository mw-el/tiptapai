import State from './editor-state.js';

function clampPosition(pos, docSize) {
  return Math.max(0, Math.min(pos, docSize));
}

export function recordUserSelection(editor, { registerInteraction = true } = {}) {
  if (!editor) {
    return;
  }

  const { from, to } = editor.state.selection;
  State.lastUserSelection = { from, to };

  if (registerInteraction) {
    State.lastUserInteraction = Date.now();
  }
}

export function restoreUserSelection(editor, selection = null) {
  if (!editor) {
    return;
  }

  const target = selection || State.lastUserSelection;
  if (!target) {
    return;
  }

  const docSize = editor.state.doc.content.size;
  const from = clampPosition(target.from, docSize);
  const to = clampPosition(target.to, docSize);

  withSystemSelectionChange(() => {
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true)
      .setTextSelection({ from, to })
      .run();
  });

  recordUserSelection(editor, { registerInteraction: false });
}

export function withSystemSelectionChange(callback) {
  State.selectionChangeDepth += 1;
  try {
    return callback();
  } finally {
    State.selectionChangeDepth = Math.max(0, State.selectionChangeDepth - 1);
  }
}
