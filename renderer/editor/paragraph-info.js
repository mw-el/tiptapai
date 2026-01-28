import State from './editor-state.js';
import { generateParagraphId } from '../utils/hash.js';
import { getParagraphOffsetMapper, getParagraphTextForCheck } from '../languagetool/paragraph-storage.js';

export function getParagraphInfoAtPosition(pos) {
  if (!State.currentEditor) return null;
  const { doc } = State.currentEditor.state;
  const $pos = doc.resolve(Math.max(1, pos));

  let paragraphDepth = $pos.depth;
  while (paragraphDepth > 0) {
    const node = $pos.node(paragraphDepth);
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      break;
    }
    paragraphDepth--;
  }

  if (paragraphDepth === 0) {
    return null;
  }

  const paragraphNode = $pos.node(paragraphDepth);
  const paragraphStart = $pos.before(paragraphDepth);
  const paragraphEnd = $pos.after(paragraphDepth);
  const paragraphText = getParagraphTextForCheck(paragraphNode);

  if (!paragraphText || !paragraphText.trim()) {
    return null;
  }

  return {
    text: paragraphText,
    hash: generateParagraphId(paragraphText),
    from: paragraphStart,
    to: paragraphEnd,
    wordCount: paragraphText.split(/\s+/).filter(word => word.length > 0).length,
    offsetMapper: getParagraphOffsetMapper(paragraphNode, paragraphStart, false)
  };
}

export function getParagraphInfoForSelection(selection) {
  if (!State.currentEditor) {
    return null;
  }

  const targetSelection = selection || State.currentEditor.state.selection;
  if (!targetSelection) {
    return null;
  }

  return getParagraphInfoAtPosition(targetSelection.from);
}

export function getParagraphInfosFromSelection(selection) {
  if (!State.currentEditor) {
    return [];
  }

  const targetSelection = selection || State.currentEditor.state.selection;
  if (!targetSelection || targetSelection.empty) {
    return [];
  }

  const { doc } = State.currentEditor.state;
  const rangeFrom = Math.max(0, Math.min(targetSelection.from, targetSelection.to));
  const rangeTo = Math.min(doc.content.size, Math.max(targetSelection.from, targetSelection.to));
  const results = [];
  const seen = new Set();

  doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const start = pos;
      const end = pos + node.nodeSize;

      if (end <= rangeFrom || start >= rangeTo) {
        return true;
      }

      const key = `${start}-${end}`;
      if (seen.has(key)) {
        return false;
      }

      const text = getParagraphTextForCheck(node);
      if (!text.trim()) {
        return false;
      }

      seen.add(key);
      results.push({
        text,
        hash: generateParagraphId(text),
        from: start,
        to: end,
        wordCount: text.split(/\s+/).filter(word => word.length > 0).length,
        offsetMapper: getParagraphOffsetMapper(node, start, false)
      });

      return false;
    }

    return true;
  });

  return results;
}

export function isFrontmatterParagraph(paragraphText, paragraphStart = 0) {
  if (!paragraphText) {
    return false;
  }

  const trimmed = paragraphText.trim();
  if (trimmed.startsWith('---')) {
    return true;
  }

  if (paragraphStart < 200) {
    const indicators = [
      'TT_lastEdit:',
      'TT_lastPosition:',
      'TT_zoomLevel:',
      'TT_scrollPosition:',
      'TT_checkedRanges:',
      'TT_totalWords:',
      'TT_totalCharacters:',
      'lastEdit:',
      'lastPosition:',
      'zoomLevel:',
      'scrollPosition:',
      'language:',
    ];

    if (indicators.some(token => trimmed.includes(token))) {
      return true;
    }

    if (/^\s*[a-zA-Z_]+:\s*/.test(trimmed)) {
      return true;
    }
  }

  return false;
}

export function getTargetParagraphsForContextAction() {
  const selectionTargets = getParagraphInfosFromSelection();
  if (selectionTargets.length > 0) {
    return selectionTargets;
  }

  const fallback = State.contextMenuParagraphInfo || getParagraphInfoForSelection(State.lastUserSelection);
  return fallback ? [fallback] : [];
}
