// Viewport Calculator für Claude Context
// Ermittelt welche Absätze aktuell sichtbar sind
// Wiederverwendbar für andere Features

import State from '../editor/editor-state.js';

/**
 * Ermittelt die Indizes der sichtbaren Absätze
 * @param {Array} paragraphs - Array von Absatz-Objekten mit {from, to, text}
 * @returns {{ from: number, to: number, paragraphs: Array }}
 */
export function getVisibleParagraphRange(paragraphs) {
  if (!State.currentEditor || !paragraphs || paragraphs.length === 0) {
    return { from: 0, to: 0, paragraphs: [] };
  }

  const editorEl = document.querySelector('.ProseMirror');
  if (!editorEl) {
    return { from: 0, to: 0, paragraphs: [] };
  }

  const editorRect = editorEl.getBoundingClientRect();
  const scrollContainer = editorEl.closest('.editor-area') || editorEl.parentElement;
  const containerRect = scrollContainer?.getBoundingClientRect() || editorRect;

  // Viewport-Grenzen (mit etwas Buffer)
  const viewportTop = containerRect.top;
  const viewportBottom = containerRect.bottom;

  const visibleParagraphs = [];

  paragraphs.forEach((para, index) => {
    try {
      // Nutze ProseMirror coordsAtPos für genaue Position
      const startCoords = State.currentEditor.view.coordsAtPos(para.from);
      const endCoords = State.currentEditor.view.coordsAtPos(Math.min(para.to, State.currentEditor.state.doc.content.size));

      // Prüfe ob Absatz im sichtbaren Bereich
      const paraTop = startCoords.top;
      const paraBottom = endCoords.bottom;

      // Absatz ist sichtbar wenn er den Viewport überlappt
      if (paraBottom >= viewportTop && paraTop <= viewportBottom) {
        visibleParagraphs.push({
          ...para,
          index: index + 1, // 1-basiert für User
        });
      }
    } catch (e) {
      // Position außerhalb des Dokuments - ignorieren
    }
  });

  if (visibleParagraphs.length === 0) {
    return { from: 0, to: 0, paragraphs: [] };
  }

  return {
    from: visibleParagraphs[0].index,
    to: visibleParagraphs[visibleParagraphs.length - 1].index,
    paragraphs: visibleParagraphs,
  };
}

/**
 * Ermittelt den Absatz-Index an einer bestimmten Scroll-Position
 * Nützlich für "Springe zu §N" Features
 * @param {Array} paragraphs - Array von Absatz-Objekten
 * @param {number} targetIndex - 1-basierter Absatz-Index
 * @returns {number|null} Document-Position oder null
 */
export function getParagraphPosition(paragraphs, targetIndex) {
  if (!paragraphs || targetIndex < 1 || targetIndex > paragraphs.length) {
    return null;
  }
  return paragraphs[targetIndex - 1].from;
}
