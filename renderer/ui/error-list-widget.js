// Error List Widget - Shows newly discovered errors after auto-check
// Allows user to jump to errors and tracks which have been visited

// Track discovered errors: Map<paragraphHash, errorInfo>
const discoveredErrors = new Map();

/**
 * Add a newly discovered error to the list
 * @param {string} paragraphHash - Hash of the paragraph with error
 * @param {number} from - Start position in document
 * @param {number} to - End position in document
 * @param {string} errorText - Text of the error
 */
export function addDiscoveredError(paragraphHash, from, to, errorText) {
  discoveredErrors.set(paragraphHash, {
    from,
    to,
    errorText,
    visited: false
  });

  updateErrorListDisplay();
}

/**
 * Remove an error from the list (when user visits the paragraph)
 * @param {string} paragraphHash - Hash of the paragraph
 */
export function removeDiscoveredError(paragraphHash) {
  if (discoveredErrors.has(paragraphHash)) {
    discoveredErrors.delete(paragraphHash);
    updateErrorListDisplay();
  }
}

/**
 * Clear all discovered errors
 */
export function clearDiscoveredErrors() {
  discoveredErrors.clear();
  updateErrorListDisplay();
}

/**
 * Check if a paragraph has a discovered error
 * @param {string} paragraphHash - Hash of the paragraph
 * @returns {boolean} True if paragraph has discovered error
 */
export function hasDiscoveredError(paragraphHash) {
  return discoveredErrors.has(paragraphHash);
}

/**
 * Update the error list display in UI
 */
function updateErrorListDisplay() {
  const listEl = document.getElementById('error-list');
  if (!listEl) return;

  // Clear current display
  listEl.innerHTML = '';

  // Show all discovered errors
  discoveredErrors.forEach((errorInfo, paragraphHash) => {
    const item = document.createElement('div');
    item.className = 'error-list-item';
    item.textContent = 'Neuer Fehler entdeckt';
    item.title = `Klicken um zum Fehler zu springen: "${errorInfo.errorText}"`;

    // Click handler: jump to error
    item.addEventListener('click', () => {
      jumpToError(errorInfo.from, errorInfo.to);

      // Mark as visited (but keep in list until paragraph is edited)
      errorInfo.visited = true;
    });

    listEl.appendChild(item);
  });
}

/**
 * Jump to error position in editor
 * @param {number} from - Start position
 * @param {number} to - End position
 */
function jumpToError(from, to) {
  // This will be called from app.js with State.currentEditor
  // We'll expose this via a callback
  if (window.jumpToErrorCallback) {
    window.jumpToErrorCallback(from, to);
  }
}

/**
 * Get count of discovered errors
 * @returns {number} Number of discovered errors
 */
export function getDiscoveredErrorCount() {
  return discoveredErrors.size;
}
