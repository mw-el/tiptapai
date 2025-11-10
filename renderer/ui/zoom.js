import State from '../editor/editor-state.js';

export function applyZoom() {
  const editorElement = document.querySelector('#editor .tiptap-editor');
  const editorContainer = document.querySelector('#editor');

  if (editorElement && editorContainer) {
    editorElement.style.fontSize = `${State.currentZoomLevel}%`;
  }

  console.log('Zoom level:', State.currentZoomLevel + '%');
}
