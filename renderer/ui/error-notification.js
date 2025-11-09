// Error Notification Pop-up for Auto-Check Results
// Shows notification when automatic LanguageTool check finds errors

/**
 * Show notification popup when auto-check finds errors
 * @param {number} errorCount - Number of errors found
 * @param {Function} onJumpToError - Callback to jump to first error
 */
export function showAutoCheckErrorNotification(errorCount, onJumpToError) {
  // Remove existing notification if present
  removeErrorNotification();

  const notification = document.createElement('div');
  notification.id = 'auto-check-notification';
  notification.className = 'auto-check-notification';

  notification.innerHTML = `
    <div class="notification-content">
      <span class="material-icons">warning</span>
      <div class="notification-text">
        <strong>LanguageTool Prüfung abgeschlossen</strong>
        <p>${errorCount} Fehler gefunden</p>
      </div>
      <div class="notification-buttons">
        <button id="jump-to-error-btn" class="btn-primary">Zum Fehler springen</button>
        <button id="dismiss-notification-btn" class="btn-secondary">Schließen</button>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  // Event listeners
  document.getElementById('jump-to-error-btn').addEventListener('click', () => {
    if (onJumpToError) onJumpToError();
    removeErrorNotification();
  });

  document.getElementById('dismiss-notification-btn').addEventListener('click', () => {
    removeErrorNotification();
  });

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    removeErrorNotification();
  }, 30000);
}

/**
 * Remove error notification popup
 */
export function removeErrorNotification() {
  const notification = document.getElementById('auto-check-notification');
  if (notification) {
    notification.remove();
  }
}
