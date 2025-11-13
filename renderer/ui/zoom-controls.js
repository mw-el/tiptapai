import State from '../editor/editor-state.js';
import { applyZoom } from './zoom.js';

function createZoomFunctions() {
  const zoomIn = () => {
    State.currentZoomLevel = Math.min(State.currentZoomLevel + 10, 200);
    applyZoom();
  };

  const zoomOut = () => {
    State.currentZoomLevel = Math.max(State.currentZoomLevel - 10, 50);
    applyZoom();
  };

  const resetZoom = () => {
    State.currentZoomLevel = 100;
    applyZoom();
  };

  return { zoomIn, zoomOut, resetZoom };
}

export function initZoomControls({ showFindReplace }) {
  const { zoomIn, zoomOut, resetZoom } = createZoomFunctions();

  document.addEventListener('keydown', (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
    } else if (event.key === '-') {
      event.preventDefault();
      zoomOut();
    } else if (event.key === '0' && !event.altKey) {
      event.preventDefault();
      resetZoom();
    } else if (event.key === '0' && event.altKey) {
      setTimeout(() => {
        applyZoom();
      }, 10);
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      showFindReplace();
    }
  });

  return { zoomIn, zoomOut, resetZoom };
}
