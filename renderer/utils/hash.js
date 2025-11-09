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
 * Uses entire paragraph after normalization (lowercase, whitespace normalized)
 * @param {string} paragraphText - Text content of paragraph
 * @returns {string} Stable paragraph ID (hash)
 */
export function generateParagraphId(paragraphText) {
  // Normalisiere: trim, lowercase, entferne Whitespace-Variationen
  const normalized = paragraphText.trim().toLowerCase().replace(/\s+/g, ' ');
  // Hash vom GANZEN Absatz (nicht nur ersten 100 Zeichen)
  // → Jede Änderung wird erkannt, Performance-Unterschied ist vernachlässigbar
  return simpleHash(normalized);
}
