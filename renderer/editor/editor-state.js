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

  // LanguageTool state
  languageToolEnabled: true,
  lastScrollPosition: 0,
  isApplyingLanguageToolMarks: false,
  appliedCorrections: [], // [{from, to, originalLength, newLength, delta}, ...]
  activeErrors: new Map(), // errorId -> {match, from, to, errorText, ruleId}

  // Selection / interaction tracking
  hasUnsavedChanges: false,
  lastUserSelection: null,
  lastUserInteraction: 0,
  selectionChangeDepth: 0,
  paragraphsNeedingCheck: new Set(),
  initialCheckCompleted: false,
  contextMenuParagraphInfo: null,

  // Background check configuration
  backgroundCheckConfig: {
    maxParagraphsPerBatch: 12,
    maxWordsPerBatch: 1200,
    maxParallelBatches: 2,
  },
};

export default state;
