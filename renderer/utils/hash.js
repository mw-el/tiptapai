// Hash utility functions for paragraph identification
// Simple Hash-Funktion (FNV-1a)

/**
 * Generate a simple hash from a string using FNV-1a algorithm
 * @param {string} str - String to hash
 * @returns {string} Hash as base36 string
 */
export function simpleHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generate a stable paragraph ID based on content
 * Uses first 100 characters after normalization
 * @param {string} paragraphText - Text content of paragraph
 * @returns {string} Stable paragraph ID
 */
export function generateParagraphId(paragraphText) {
  // Normalisiere: trim, lowercase, entferne Whitespace-Variationen
  const normalized = paragraphText.trim().toLowerCase().replace(/\s+/g, ' ');
  // Nimm erste 100 Zeichen (genug um Paragraphen eindeutig zu identifizieren)
  const prefix = normalized.substring(0, 100);
  return simpleHash(prefix);
}
