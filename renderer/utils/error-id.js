// Error ID generation for LanguageTool errors

/**
 * Generate a stable error ID based on rule, text, and position
 * @param {string} ruleId - LanguageTool rule ID
 * @param {string} errorText - Text that contains the error
 * @param {number} absoluteFrom - Absolute position in document
 * @returns {string} Stable error ID
 */
export function generateErrorId(ruleId, errorText, absoluteFrom) {
  // Simple aber stabile ID: ruleId + errorText + position
  // So können wir Fehler eindeutig identifizieren
  return `${ruleId}:${errorText}:${absoluteFrom}`;
}
