import State from '../editor/editor-state.js';
import { findReplacePresets } from './find-replace-settings.js';

let currentSearchIndex = -1;
let searchMatches = [];
let initialized = false;
let lastSearchText = '';
let dragState = null;
let storedModalPosition = null;
let dragSetupComplete = false;

function ensureEditorReady() {
  if (!State.currentEditor) {
    updateFindReplaceStatus('Kein Dokument geöffnet');
    return false;
  }
  return true;
}

function resetSearchProgress({ clearLastSearch = false } = {}) {
  currentSearchIndex = -1;
  searchMatches = [];
  if (clearLastSearch) {
    lastSearchText = '';
  }
}

function getDocumentLanguage() {
  return State.currentFileMetadata?.language ||
    document.querySelector('#language-selector')?.value ||
    'de-CH';
}

function updateFindReplaceStatus(message) {
  const statusEl = document.getElementById('find-replace-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

export function showFindReplace() {
  const modal = document.getElementById('find-replace-modal');
  if (!modal) {
    return;
  }

  modal.classList.add('active');
  modal.classList.remove('dragging');
  applyFindReplaceModalPosition();
  updateFindReplaceStatus('');
  document.getElementById('find-input')?.focus();
}

function findNext() {
  if (!ensureEditorReady()) {
    return;
  }

  const findInput = document.getElementById('find-input');
  const searchText = findInput?.value ?? '';

  if (!searchText) {
    updateFindReplaceStatus('Bitte Suchtext eingeben');
    return;
  }

  if (searchText !== lastSearchText) {
    lastSearchText = searchText;
    currentSearchIndex = -1;
  }

  const editorText = State.currentEditor.getText();
  const matches = [];
  let index = 0;

  while ((index = editorText.indexOf(searchText, index)) !== -1) {
    matches.push(index);
    index += searchText.length || 1;
  }

  if (matches.length === 0) {
    resetSearchProgress();
    updateFindReplaceStatus('Keine Treffer gefunden');
    return;
  }

  searchMatches = matches;
  currentSearchIndex = (currentSearchIndex + 1) % matches.length;

  const matchPos = matches[currentSearchIndex];
  State.currentEditor.commands.setTextSelection({
    from: matchPos + 1,
    to: matchPos + searchText.length + 1
  });
  State.currentEditor.commands.focus();
  updateFindReplaceStatus(`Treffer ${currentSearchIndex + 1} von ${matches.length}`);
}

function replaceCurrent() {
  if (!ensureEditorReady()) {
    return;
  }

  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const searchText = findInput?.value;
  let replaceText = replaceInput?.value ?? '';

  if (!searchText) {
    updateFindReplaceStatus('Bitte Suchtext eingeben');
    return;
  }

  const replaceEszett = document.getElementById('replace-eszett')?.checked;
  if (replaceEszett) {
    replaceText = replaceText.replace(/ß/g, 'ss');
  }

  const selection = State.currentEditor.state.selection;
  const selectedText = State.currentEditor.state.doc.textBetween(selection.from, selection.to);

  if (selectedText === searchText) {
    State.currentEditor.commands.insertContent(replaceText);
    State.currentEditor.commands.focus();
    updateFindReplaceStatus('Ersetzt');
    setTimeout(() => findNext(), 100);
  } else {
    updateFindReplaceStatus('Bitte zuerst suchen');
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAll() {
  if (!ensureEditorReady()) {
    return;
  }

  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const searchText = findInput?.value || '';
  let replaceText = replaceInput?.value ?? '';

  if (!searchText) {
    updateFindReplaceStatus('Bitte Suchtext eingeben');
    return;
  }

  const replaceEszett = document.getElementById('replace-eszett')?.checked;
  if (replaceEszett) {
    replaceText = replaceText.replace(/ß/g, 'ss');
  }

  const markdown = State.currentEditor.getMarkdown();
  let count = 0;
  const regex = new RegExp(escapeRegex(searchText), 'g');
  const newMarkdown = markdown.replace(regex, () => {
    count++;
    return replaceText;
  });

  if (count === 0) {
    updateFindReplaceStatus('Keine Treffer gefunden');
    return;
  }

  State.currentEditor.commands.setContent(newMarkdown, { contentType: 'markdown' });
  State.currentEditor.commands.focus();
  resetSearchProgress();
  updateFindReplaceStatus(`${count}× "${searchText}" ersetzt`);
}

function runPreset(presetId) {
  if (!ensureEditorReady()) {
    return;
  }

  const preset = findReplacePresets.find(p => p.id === presetId);
  if (!preset) {
    updateFindReplaceStatus('Unbekannte Option');
    return;
  }

  const markdown = State.currentEditor.getMarkdown();
  const { text: updated, count } = preset.apply(markdown, { language: getDocumentLanguage() });

  if (count === 0) {
    updateFindReplaceStatus(`Keine Änderungen für ${preset.summaryLabel}`);
    return;
  }

  State.currentEditor.commands.setContent(updated, { contentType: 'markdown' });
  State.currentEditor.commands.focus();
  resetSearchProgress();
  updateFindReplaceStatus(`${preset.summaryLabel} (${count}) ersetzt`);
}

function bindCoreHandlers() {
  document.getElementById('find-next-btn')?.addEventListener('click', findNext);
  document.getElementById('replace-btn')?.addEventListener('click', replaceCurrent);
  document.getElementById('replace-all-btn')?.addEventListener('click', replaceAll);

  const replaceEszettCheckbox = document.getElementById('replace-eszett');
  if (replaceEszettCheckbox) {
    replaceEszettCheckbox.addEventListener('change', (e) => {
      const findInput = document.getElementById('find-input');
      const replaceInput = document.getElementById('replace-input');
      if (e.target.checked) {
        if (findInput) findInput.value = 'ß';
        if (replaceInput) replaceInput.value = 'ss';
      } else {
        if (findInput) findInput.value = '';
        if (replaceInput) replaceInput.value = '';
      }
    });
  }
}

function bindPresetButtons() {
  document.querySelectorAll('.preset-action').forEach(button => {
    const presetId = button.getAttribute('data-preset');
    const preset = findReplacePresets.find(p => p.id === presetId);
    if (!preset) return;

    button.title = preset.tooltip;
    button.addEventListener('click', () => runPreset(presetId));
  });
}

function initDraggableFindReplaceModal() {
  if (dragSetupComplete) {
    return;
  }

  const modal = document.getElementById('find-replace-modal');
  const header = modal?.querySelector('.modal-header');
  if (!modal || !header) {
    return;
  }

  header.addEventListener('mousedown', (event) => {
    if (event.target.closest('.modal-close')) {
      return;
    }
    startModalDrag(event);
  });

  header.addEventListener('dblclick', () => {
    storedModalPosition = null;
    applyFindReplaceModalPosition();
  });

  window.addEventListener('resize', () => {
    if (!storedModalPosition) {
      return;
    }
    const content = modal.querySelector('.modal-content');
    if (!content || content.offsetWidth === 0 || content.offsetHeight === 0) {
      return;
    }
    const { left, top } = clampModalPosition(storedModalPosition.left, storedModalPosition.top, content);
    storedModalPosition = { left, top };
    if (modal.classList.contains('active')) {
      content.style.transform = 'none';
      content.style.left = `${left}px`;
      content.style.top = `${top}px`;
    }
  });

  dragSetupComplete = true;
}

function applyFindReplaceModalPosition() {
  const modal = document.getElementById('find-replace-modal');
  const content = modal?.querySelector('.modal-content');
  if (!modal || !content) {
    return;
  }

  if (storedModalPosition) {
    content.style.transform = 'none';
    content.style.left = `${storedModalPosition.left}px`;
    content.style.top = `${storedModalPosition.top}px`;
  } else {
    content.style.left = '50%';
    content.style.top = '50%';
    content.style.transform = 'translate(-50%, -50%)';
  }
}

function startModalDrag(event) {
  const modal = document.getElementById('find-replace-modal');
  const content = modal?.querySelector('.modal-content');
  if (!modal || !content) {
    return;
  }

  const rect = content.getBoundingClientRect();
  dragState = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    content,
    modal,
  };

  content.style.transform = 'none';
  modal.classList.add('dragging');

  document.addEventListener('mousemove', handleModalDrag);
  document.addEventListener('mouseup', stopModalDrag);
  event.preventDefault();
}

function handleModalDrag(event) {
  if (!dragState) {
    return;
  }

  const { content } = dragState;
  const tentativeLeft = event.clientX - dragState.offsetX;
  const tentativeTop = event.clientY - dragState.offsetY;
  const { left, top } = clampModalPosition(tentativeLeft, tentativeTop, content);

  content.style.left = `${left}px`;
  content.style.top = `${top}px`;
  storedModalPosition = { left, top };
}

function stopModalDrag() {
  if (!dragState) {
    return;
  }

  dragState.modal.classList.remove('dragging');
  document.removeEventListener('mousemove', handleModalDrag);
  document.removeEventListener('mouseup', stopModalDrag);
  dragState = null;
}

function clampModalPosition(left, top, content) {
  const maxLeft = Math.max(0, window.innerWidth - content.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - content.offsetHeight);

  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  };
}

export function initFindReplace() {
  if (initialized) {
    return;
  }
  initialized = true;
  bindCoreHandlers();
  bindPresetButtons();
  initDraggableFindReplaceModal();
}
