// Utility to normalize words for dictionary comparisons
// Ensures consistent handling regardless of case, whitespace or Unicode variants

export function normalizeWord(word) {
  if (!word) {
    return '';
  }

  return word
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
