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
  const refreshBtn = document.querySelector('#languagetool-refresh');

  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'languagetool-status ' + cssClass;

    // Cursor-Style: pointer bei Fehlern, damit klar ist dass man klicken kann
    if (cssClass === 'has-errors') {
      statusEl.style.cursor = 'pointer';
      statusEl.title = 'Klick um zum ersten Fehler zu springen';
    } else {
      statusEl.style.cursor = 'default';
      statusEl.title = '';
    }
  }

  // Animiere den Refresh-Button während der Analyse
  // "checking" CSS-Klasse wird hinzugefügt wenn Analyse läuft
  if (refreshBtn) {
    if (cssClass === 'checking') {
      refreshBtn.classList.add('checking');
      refreshBtn.disabled = true;
    } else {
      refreshBtn.classList.remove('checking');
      refreshBtn.disabled = false;
    }
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

  const controlPanel = document.querySelector('.control-panel');
  const errorList = document.getElementById('error-list');
  const saveStatus = document.getElementById('save-status');

  if (controlPanel && errorList && errorList.parentNode === controlPanel) {
    errorList.insertAdjacentElement('afterend', indicator);
  } else if (controlPanel && saveStatus && saveStatus.parentNode === controlPanel) {
    controlPanel.insertBefore(indicator, saveStatus);
  } else if (controlPanel) {
    controlPanel.appendChild(indicator);
  } else {
    document.body.appendChild(indicator);
  }

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
