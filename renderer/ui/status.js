// Status message display utilities

/**
 * Show a status message in the save status area
 * @param {string} message - Message to display
 * @param {string} cssClass - CSS class for styling (e.g., 'success', 'error')
 */
export function showStatus(message, cssClass = '') {
  const statusEl = document.querySelector('#save-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'save-status ' + cssClass;
  }
  // Fallback: Console logging wenn kein Status-Element vorhanden
  console.log('Status:', message);
}

/**
 * Update LanguageTool status display
 * @param {string} message - Message to display
 * @param {string} cssClass - CSS class for styling (e.g., 'checking', 'has-errors', 'success')
 */
export function updateLanguageToolStatus(message, cssClass = '') {
  const statusEl = document.querySelector('#languagetool-status');

  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'languagetool-status ' + cssClass;
  }

  console.log('LanguageTool Status:', message);
}

let languagetoolBlockingCount = 0;

function ensureBlockingIndicator() {
  let indicator = document.getElementById('languagetool-block-indicator');
  if (indicator) {
    return indicator;
  }

  indicator = document.createElement('div');
  indicator.id = 'languagetool-block-indicator';
  indicator.className = 'lt-block-indicator';
  indicator.innerHTML = `
    <span class="material-icons lt-block-icon">hourglass_empty</span>
    <span class="lt-block-text">LanguageTool aktualisiert Markierungen – Eingaben kurz blockiert</span>
  `;

  document.body.appendChild(indicator);

  return indicator;
}

export function setLanguageToolBlocking(isBlocking) {
  languagetoolBlockingCount += isBlocking ? 1 : -1;
  languagetoolBlockingCount = Math.max(0, languagetoolBlockingCount);

  const indicator = ensureBlockingIndicator();
  if (languagetoolBlockingCount > 0) {
    indicator.classList.add('visible');
  } else {
    indicator.classList.remove('visible');
  }
}
