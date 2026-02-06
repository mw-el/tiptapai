import State from '../editor/editor-state.js';
import { showStatus } from './status.js';
import { refreshErrorNavigation } from './error-list-widget.js';
import {
  addSkippedParagraph,
  removeCleanParagraph,
  removeSkippedParagraph,
  isParagraphSkipped
} from '../languagetool/paragraph-storage.js';
import {
  getParagraphInfoAtPosition,
  getTargetParagraphsForContextAction
} from '../editor/paragraph-info.js';

const SPECIAL_CHARACTERS = [
  { char: '–', label: 'Gedankenstrich (–)' },
  { char: '—', label: 'Em Dash (—)' },
  { char: '«', label: 'Guillemets links («)' },
  { char: '»', label: 'Guillemets rechts (»)' },
  { char: '‹', label: 'Einfache Guillemets links (‹)' },
  { char: '›', label: 'Einfache Guillemets rechts (›)' },
  { char: '…', label: 'Ellipsen (…)' },
  { char: '€', label: 'Euro (€)' },
  { char: '@', label: 'At-Zeichen (@)' },
  { char: '©', label: 'Copyright (©)' }
];

let contextMenuElement = null;

export function initContextMenu({
  editorElement,
  onCheckParagraph,
  runLanguageToolCheck,
  removeTooltip
}) {
  if (!editorElement) {
    return;
  }

  editorElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    State.contextMenuParagraphInfo = null;

    const clickedError = event.target.closest('.lt-error');
    if (clickedError && typeof removeTooltip === 'function') {
      removeTooltip();
    }

    if (!event.target.closest('.tiptap-editor')) {
      return;
    }

    const { state, view } = State.currentEditor;
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });

    if (!pos) {
      showContextMenu({
        x: event.clientX,
        y: event.clientY,
        word: null,
        onCheckParagraph,
        runLanguageToolCheck
      });
      return;
    }

    const $pos = state.doc.resolve(pos.pos);
    const node = $pos.parent;
    State.contextMenuParagraphInfo = getParagraphInfoAtPosition(pos.pos);

    const fullText = node.textContent;
    if (!fullText || !fullText.trim()) {
      showContextMenu({ x: event.clientX, y: event.clientY, word: null, onCheckParagraph, runLanguageToolCheck });
      return;
    }

    const offsetInNode = pos.pos - $pos.start();
    const wordChar = /[a-zA-ZäöüÄÖÜß0-9]/;
    let start = offsetInNode;
    while (start > 0 && wordChar.test(fullText[start - 1])) {
      start--;
    }
    let end = offsetInNode;
    while (end < fullText.length && wordChar.test(fullText[end])) {
      end++;
    }

    if (offsetInNode < start || offsetInNode > end) {
      showContextMenu({ x: event.clientX, y: event.clientY, word: null, onCheckParagraph, runLanguageToolCheck });
      return;
    }

    const word = fullText.substring(start, end).trim();
    if (word.length >= 3) {
      showContextMenu({ x: event.clientX, y: event.clientY, word, onCheckParagraph, runLanguageToolCheck });
    } else {
      showContextMenu({ x: event.clientX, y: event.clientY, word: null, onCheckParagraph, runLanguageToolCheck });
    }
  });
}

export function closeContextMenu() {
  if (contextMenuElement) {
    contextMenuElement.remove();
    contextMenuElement = null;
  }
  document.removeEventListener('click', closeContextMenu);
  State.contextMenuParagraphInfo = null;

  // Restore editor focus after context menu closes
  if (State.currentEditor) {
    requestAnimationFrame(() => {
      State.currentEditor.view.dom.focus();
    });
  }
}

function showContextMenu({ x, y, word, onCheckParagraph, runLanguageToolCheck }) {
  closeContextMenu();

  contextMenuElement = document.createElement('div');
  contextMenuElement.className = 'context-menu';

  const targetParagraphs = getTargetParagraphsForContextAction();
  const hasTargets = targetParagraphs.length > 0;
  const selectionIsSkipped = hasTargets && targetParagraphs.every(p => isParagraphSkipped(p.text));

  let menuHTML = '';

  if (word) {
    menuHTML += `
      <div class="context-menu-item context-menu-thesaurus" data-word="${word}">
        📖 Thesaurus: "${word}"
        <span class="context-menu-arrow">▶</span>
        <div class="context-menu-submenu">
          <div class="synonym-loading">Lade Synonyme...</div>
        </div>
      </div>
      <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    `;
  }

  menuHTML += `
    <button class="context-menu-item" data-action="check" style="font-weight: bold; background-color: rgba(39, 174, 96, 0.1);">✓ Diesen Absatz prüfen</button>
    <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    ${hasTargets ? `
      <button class="context-menu-item" data-action="${selectionIsSkipped ? 'unskip' : 'skip'}">
        ${selectionIsSkipped ? 'Markierte Absätze wieder prüfen' : 'Markierte Absätze vom Check ausnehmen'}
      </button>
      <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    ` : ''}
    <div class="context-menu-item context-menu-special">
      📝 Absatz/Überschrift
      <span class="context-menu-arrow">▶</span>
      <div class="context-menu-submenu">
        <button class="context-menu-item" data-action="paragraph">Absatz</button>
        <button class="context-menu-item" data-action="heading-1">Überschrift Level 1</button>
        <button class="context-menu-item" data-action="heading-2">Überschrift Level 2</button>
        <button class="context-menu-item" data-action="heading-3">Überschrift Level 3</button>
        <button class="context-menu-item" data-action="heading-4">Überschrift Level 4</button>
        <button class="context-menu-item" data-action="heading-5">Überschrift Level 5</button>
        <button class="context-menu-item" data-action="heading-6">Überschrift Level 6</button>
      </div>
    </div>
    <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    <div class="context-menu-item context-menu-special">
      ✨ Sonderzeichen einfügen
      <span class="context-menu-arrow">▶</span>
      <div class="context-menu-submenu">
        ${SPECIAL_CHARACTERS.map(item => `
          <button class="special-char-btn" data-char="${item.char}">
            ${item.label}
          </button>
        `).join('')}
      </div>
    </div>
    <hr style="margin: 4px 0; border: none; border-top: 1px solid #ddd;">
    <button class="context-menu-item" data-action="copy">Kopieren</button>
    <button class="context-menu-item" data-action="paste">Einfügen</button>
  `;

  contextMenuElement.innerHTML = menuHTML;
  contextMenuElement.style.position = 'fixed';
  contextMenuElement.style.left = `${x}px`;
  contextMenuElement.style.top = `${y}px`;
  contextMenuElement.style.zIndex = '1000';

  document.body.appendChild(contextMenuElement);

  if (word) {
    setupThesaurusSubmenu(word, runLanguageToolCheck);
  }

  contextMenuElement.querySelectorAll('.special-char-btn').forEach(button => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const char = button.getAttribute('data-char');
      if (char) {
        insertSpecialCharacter(char);
      }
      closeContextMenu();
    });
  });

  contextMenuElement.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const action = button.getAttribute('data-action');

      if (action === 'check' && typeof onCheckParagraph === 'function') {
        onCheckParagraph();
      } else if (action === 'skip') {
        skipParagraphSelection();
      } else if (action === 'unskip') {
        unskipParagraphSelection();
      } else if (action === 'copy') {
        copySelection();
      } else if (action === 'paste') {
        await pasteContent();
      } else if (action === 'paragraph') {
        setParagraphForContext();
      } else if (action && action.startsWith('heading-')) {
        const level = parseInt(action.split('-')[1], 10);
        if (Number.isInteger(level)) {
          setHeadingForContext(level);
        }
      }

      closeContextMenu();
    });
  });

  document.addEventListener('click', closeContextMenu);
}

function setupThesaurusSubmenu(word, runLanguageToolCheck) {
  const thesaurusItem = contextMenuElement.querySelector('.context-menu-thesaurus');
  if (!thesaurusItem) {
    return;
  }
  const submenu = thesaurusItem.querySelector('.context-menu-submenu');
  let synonymsLoaded = false;

  thesaurusItem.addEventListener('mouseenter', async () => {
    if (synonymsLoaded) return;
    synonymsLoaded = true;
    const synonyms = await fetchSynonyms(word);

    if (!synonyms.length) {
      submenu.innerHTML = '<div class="synonym-item-disabled">Keine Synonyme gefunden</div>';
      return;
    }

    submenu.innerHTML = synonyms.map(syn => `<div class="synonym-item" data-synonym="${syn}">${syn}</div>`).join('');
    submenu.querySelectorAll('.synonym-item').forEach(item => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        const synonym = event.target.dataset.synonym;
        replaceSynonymInContext(word, synonym, runLanguageToolCheck);
        closeContextMenu();
      });
    });
  });
}

async function fetchSynonyms(word) {
  try {
    const language = document.querySelector('#language-selector')?.value || 'de-CH';
    const isGerman = language.startsWith('de-');

    if (isGerman) {
      const url = `https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(word)}&format=application/json`;
      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      if (!data.synsets || data.synsets.length === 0) {
        return [];
      }

      const synonyms = [];
      data.synsets.forEach(synset => {
        synset.terms.forEach(term => {
          if (term.term.toLowerCase() !== word.toLowerCase()) {
            synonyms.push(term.term);
          }
        });
      });

      return synonyms.slice(0, 15);
    }

    const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=15`;
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    if (!data || data.length === 0) {
      return [];
    }
    return data.map(item => item.word).filter(syn => syn.toLowerCase() !== word.toLowerCase()).slice(0, 15);
  } catch (error) {
    console.error('❌ Error fetching synonyms:', error);
    return [];
  }
}

function insertSpecialCharacter(char) {
  if (!State.currentEditor) {
    return;
  }

  State.currentEditor.chain().focus().insertContent(char).run();
  showStatus(`"${char}" eingefügt`, 'saved');
}

function skipParagraphSelection() {
  const targets = getTargetParagraphsForContextAction();
  if (!targets.length) {
    showStatus('Keine Absätze ausgewählt', 'info');
    return;
  }

  targets.forEach(target => {
    addSkippedParagraph(target.text);
    removeCleanParagraph(target.text);
  });

  refreshErrorNavigation({ preserveSelection: false });
  showStatus(`${targets.length} ${targets.length === 1 ? 'Absatz' : 'Absätze'} vom Check ausgenommen`, 'info');
}

function unskipParagraphSelection() {
  const targets = getTargetParagraphsForContextAction();
  if (!targets.length) {
    showStatus('Keine Absätze ausgewählt', 'info');
    return;
  }

  targets.forEach(target => removeSkippedParagraph(target.text));
  refreshErrorNavigation({ preserveSelection: false });
  showStatus(`${targets.length} ${targets.length === 1 ? 'Absatz' : 'Absätze'} wieder zur Prüfung vorgemerkt`, 'info');
}

function replaceSynonymInContext(oldWord, newWord, runLanguageToolCheck) {
  const { state } = State.currentEditor;
  const { from } = state.selection;
  const $pos = state.doc.resolve(from);
  const textNode = $pos.parent.childAfter($pos.parentOffset);

  if (!textNode || !textNode.node) {
    return;
  }

  const text = textNode.node.text || '';
  const wordStart = from - $pos.parentOffset + textNode.offset;
  const wordEnd = wordStart + text.length;

  State.currentEditor.chain()
    .focus()
    .setTextSelection({ from: wordStart, to: wordEnd })
    .insertContent(newWord)
    .run();

  setTimeout(() => {
    if (typeof runLanguageToolCheck === 'function' && State.languageToolEnabled && State.currentFilePath) {
      runLanguageToolCheck();
    }
  }, 5000);
}

function copySelection() {
  const { state } = State.currentEditor;
  const { $from, $to } = state.selection;

  if ($from.pos !== $to.pos) {
    const selectedText = state.doc.textBetween($from.pos, $to.pos, '\n');
    navigator.clipboard.writeText(selectedText);
    return;
  }

  const { parent, parentOffset } = $from;
  if (!parent.isText) {
    return;
  }

  const text = parent.text;
  const wordChar = /[a-zA-ZäöüÄÖÜß0-9]/;
  let start = parentOffset;
  while (start > 0 && wordChar.test(text[start - 1])) {
    start--;
  }
  let end = parentOffset;
  while (end < text.length && wordChar.test(text[end])) {
    end++;
  }
  if (start !== end) {
    navigator.clipboard.writeText(text.substring(start, end));
  }
}

async function pasteContent() {
  try {
    const text = await navigator.clipboard.readText();
    State.currentEditor.chain().focus().insertContent(text).run();
  } catch (error) {
    console.error('Paste failed:', error);
  }
}

function ensureContextSelection() {
  if (!State.currentEditor) {
    return;
  }

  const { selection } = State.currentEditor.state;
  if (selection && !selection.empty) {
    return;
  }

  const target = State.contextMenuParagraphInfo;
  if (target) {
    State.currentEditor.commands.setTextSelection({ from: target.from, to: target.to });
  }
}

function setHeadingForContext(level) {
  if (!State.currentEditor) {
    return;
  }

  ensureContextSelection();
  State.currentEditor.chain().focus().setHeading({ level }).run();
}

function setParagraphForContext() {
  if (!State.currentEditor) {
    return;
  }

  ensureContextSelection();
  State.currentEditor.chain().focus().setParagraph().run();
}
