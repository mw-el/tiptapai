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
 * @param {string} contextBefore - Text before the error (for preview)
 * @param {string} contextAfter - Text after the error (for preview)
 */
export function addDiscoveredError(paragraphHash, from, to, errorText, contextBefore = '', contextAfter = '') {
  discoveredErrors.set(paragraphHash, {
    from,
    to,
    errorText,
    contextBefore,
    contextAfter,
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

    // Context preview: "...text before ERROR text after..."
    const contextDiv = document.createElement('div');
    contextDiv.className = 'error-list-context';

    const maxContextLength = 20; // Characters before/after error
    const before = errorInfo.contextBefore.slice(-maxContextLength);
    const after = errorInfo.contextAfter.slice(0, maxContextLength);

    contextDiv.textContent = `...${before}${errorInfo.errorText}${after}...`;

    // Clickable link
    const link = document.createElement('span');
    link.className = 'error-list-link';
    link.textContent = 'Zum Fehler springen';
    link.title = `Fehler: "${errorInfo.errorText}"`;

    // Click handler: jump to error
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      jumpToError(errorInfo.from, errorInfo.to);

      // Mark as visited (but keep in list until paragraph is edited)
      errorInfo.visited = true;
    });

    item.appendChild(contextDiv);
    item.appendChild(link);
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
