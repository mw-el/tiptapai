const SUPPORTED_CATEGORIES = new Set([
  'TYPOS',
  'GRAMMAR',
  'CASING',
  'PUNCTUATION',
  'TYPOGRAPHY',
  'REDUNDANCY',
  'REPETITIONS_STYLE',
  'STYLE',
  'REGISTER',
  'CONFUSED_WORDS',
  'SEMANTICS',
  'MISC'
]);

const ISSUE_TYPE_MAP = {
  STYLE: 'STYLE',
  REGISTER: 'REGISTER',
  GRAMMAR: 'GRAMMAR',
  CASING: 'CASING',
  PUNCTUATION: 'PUNCTUATION',
  TYPO: 'TYPOS',
  TYPOS: 'TYPOS',
  TYPOGRAPHICAL: 'TYPOGRAPHY',
  TYPOGRAPHY: 'TYPOGRAPHY',
  REDUNDANCY: 'REDUNDANCY',
  REPETITION: 'REPETITIONS_STYLE',
  REPETITIONS: 'REPETITIONS_STYLE',
  SEMANTICS: 'SEMANTICS',
  CONFUSED_WORDS: 'CONFUSED_WORDS',
};

const CATEGORY_ALIASES = {
  MISSPELLING: 'TYPOS',
  SPELLING: 'TYPOS',
  TYPOS: 'TYPOS',
  TYPO: 'TYPOS',
  GRAMMAR: 'GRAMMAR',
  CASING: 'CASING',
  PUNCTUATION: 'PUNCTUATION',
  TYPOGRAPHY: 'TYPOGRAPHY',
  TYPOGRAPHICAL: 'TYPOGRAPHY',
  STYLE: 'STYLE',
  REGISTER: 'REGISTER',
  REDUNDANCY: 'REDUNDANCY',
  REPETITIONS: 'REPETITIONS_STYLE',
  REPETITIONS_STYLE: 'REPETITIONS_STYLE',
  CONFUSED_WORDS: 'CONFUSED_WORDS',
  SEMANTICS: 'SEMANTICS',
};

export function resolveErrorCategory(match) {
  if (!match?.rule) {
    return 'MISC';
  }

  const issueType = (match.rule.issueType || '').toUpperCase();
  if (issueType && ISSUE_TYPE_MAP[issueType]) {
    return ISSUE_TYPE_MAP[issueType];
  }

  const rawCategory = (match.rule.category?.id || match.rule.category || '').toUpperCase();
  if (rawCategory && CATEGORY_ALIASES[rawCategory]) {
    return CATEGORY_ALIASES[rawCategory];
  }

  if (SUPPORTED_CATEGORIES.has(rawCategory)) {
    return rawCategory;
  }

  return 'MISC';
}

export { SUPPORTED_CATEGORIES };
