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
