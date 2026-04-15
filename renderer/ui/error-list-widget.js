import State from '../editor/editor-state.js';

let sortedErrors = [];
let currentIndex = -1;

function getNavElements() {
  return {
    countEl: document.getElementById('error-nav-counter'),
    prevBtn: document.getElementById('error-prev-btn'),
    nextBtn: document.getElementById('error-next-btn'),
  };
}

// Wire up toolbar buttons once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const { prevBtn, nextBtn } = getNavElements();
  if (prevBtn) prevBtn.addEventListener('click', () => navigateRelativeError(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateRelativeError(1));
});

export function refreshErrorNavigation({ preserveSelection = true } = {}) {
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
    if (currentIndex === -1) currentIndex = 0;
    if (currentIndex >= sortedErrors.length) currentIndex = sortedErrors.length - 1;
  }

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
  const { countEl, prevBtn, nextBtn } = getNavElements();
  if (!countEl) return;

  const total = sortedErrors.length;

  if (total === 0) {
    countEl.textContent = State.initialCheckCompleted ? '0/0' : '…';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  } else {
    const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    countEl.textContent = `${displayIndex}/${total}`;
    const disabled = total <= 1;
    if (prevBtn) prevBtn.disabled = disabled;
    if (nextBtn) nextBtn.disabled = disabled;
  }
}
