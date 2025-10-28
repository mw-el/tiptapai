// Centralized state management for the editor
// All shared state variables that are used across multiple modules
// These are exported as a mutable object for easier state management

const state = {
  // File state
  currentFilePath: null,
  currentFileMetadata: {},
  currentWorkingDir: null,

  // Editor state
  currentEditor: null,
  currentZoomLevel: 100,

  // Timer state
  autoSaveTimer: null,
  languageToolTimer: null,
  languageToolScrollTimer: null,

  // LanguageTool state
  languageToolEnabled: true,
  lastScrollPosition: 0,
  isApplyingLanguageToolMarks: false,
  appliedCorrections: [], // [{from, to, originalLength, newLength, delta}, ...]
  activeErrors: new Map(), // errorId -> {match, from, to, errorText, ruleId}
  progressiveCheckAbortController: null
};

export default state;
