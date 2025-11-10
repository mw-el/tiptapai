import State from '../editor/editor-state.js';

let sortedErrors = [];
let currentIndex = -1;
let navElements = {
  countEl: null,
  prevBtn: null,
  nextBtn: null,
};

export function refreshErrorNavigation({ preserveSelection = true } = {}) {
  const container = document.getElementById('error-list');
  if (!container) {
    return;
  }

  const previousErrorId = preserveSelection && sortedErrors[currentIndex]?.errorId;

  sortedErrors = Array.from(State.activeErrors.entries())
    .map(([errorId, data]) => ({ errorId, ...data }))
    .sort((a, b) => a.from - b.from);

  if (previousErrorId) {
    currentIndex = sortedErrors.findIndex(error => error.errorId === previousErrorId);
  }

  if (sortedErrors.length === 0) {
    currentIndex = -1;
  } else {
    if (currentIndex === -1) {
      currentIndex = 0;
    }
    if (currentIndex >= sortedErrors.length) {
      currentIndex = sortedErrors.length - 1;
    }
  }

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'error-nav';

  const title = document.createElement('div');
  title.className = 'error-nav-title';
  title.textContent = 'Rechtschreibfehler';
  wrapper.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'error-nav-controls';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'error-nav-btn';
  prevBtn.setAttribute('aria-label', 'Vorheriger Fehler');
  prevBtn.innerText = '‹';
  prevBtn.addEventListener('click', () => navigateRelativeError(-1));

  const countEl = document.createElement('span');
  countEl.className = 'error-nav-counter';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'error-nav-btn';
  nextBtn.setAttribute('aria-label', 'Nächster Fehler');
  nextBtn.innerText = '›';
  nextBtn.addEventListener('click', () => navigateRelativeError(1));

  controls.appendChild(prevBtn);
  controls.appendChild(countEl);
  controls.appendChild(nextBtn);

  wrapper.appendChild(controls);
  container.appendChild(wrapper);

  navElements = { countEl, prevBtn, nextBtn };
  updateNavigationControls();
}

export function navigateRelativeError(delta) {
  if (sortedErrors.length === 0) {
    return;
  }

  if (currentIndex === -1) {
    currentIndex = 0;
  } else {
    currentIndex = (currentIndex + delta + sortedErrors.length) % sortedErrors.length;
  }

  focusCurrentError();
  updateNavigationControls();
}

export function resetErrorNavigation() {
  sortedErrors = [];
  currentIndex = -1;
  refreshErrorNavigation({ preserveSelection: false });
}

function focusCurrentError() {
  if (currentIndex < 0 || currentIndex >= sortedErrors.length) {
    return;
  }

  const error = sortedErrors[currentIndex];
  const callback = window.jumpToErrorCallback;

  if (callback) {
    callback(error.from, error.to, error.errorId);
  } else if (State.currentEditor) {
    State.currentEditor.chain()
      .focus()
      .setTextSelection({ from: error.from, to: error.from })
      .run();
  }
}

function updateNavigationControls() {
  if (!navElements.countEl) {
    return;
  }

  const total = sortedErrors.length;

  if (total === 0) {
    navElements.countEl.textContent = State.initialCheckCompleted ? 'Keine Fehler' : 'Prüfung läuft...';
    navElements.prevBtn.disabled = true;
    navElements.nextBtn.disabled = true;
  } else {
    const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    navElements.countEl.textContent = `Fehler ${displayIndex}/${total}`;
    const disabled = total <= 1;
    navElements.prevBtn.disabled = disabled;
    navElements.nextBtn.disabled = disabled;
  }
}
