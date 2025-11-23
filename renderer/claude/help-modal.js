// Claude Help Modal
// Zeigt Hilfe-Informationen für den Claude-Workflow

/**
 * Zeigt das Claude-Hilfe-Modal an
 */
export function showClaudeHelp() {
  const modal = document.getElementById('claude-help-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Schließt das Claude-Hilfe-Modal
 */
export function closeClaudeHelp() {
  const modal = document.getElementById('claude-help-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Initialisiert Event-Listener für das Modal
 */
export function initClaudeHelpModal() {
  const modal = document.getElementById('claude-help-modal');
  if (!modal) return;

  // Schließen bei Klick auf X
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeClaudeHelp);
  }

  // Schließen bei Klick außerhalb
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeClaudeHelp();
    }
  });

  // Schließen bei Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeClaudeHelp();
    }
  });
}
