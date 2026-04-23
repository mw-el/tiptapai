const { contextBridge, ipcRenderer } = require('electron');

// IPC Bridge - Sprint 1.1: File Operations
contextBridge.exposeInMainWorld('api', {
  // File Operations
  loadFile: (path) => ipcRenderer.invoke('load-file', path),
  saveFile: (path, content) => ipcRenderer.invoke('save-file', path, content),
  statFile: (path) => ipcRenderer.invoke('stat-file', path),

  // File Tree (deprecated - kept for compatibility)
  getFiles: (dirPath) => ipcRenderer.invoke('get-files', dirPath),

  // Directory Selection
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Save-As Dialog (full file manager)
  showSaveDialog: (defaultPath, defaultFilename) => ipcRenderer.invoke('show-save-dialog', defaultPath, defaultFilename),

  // Hierarchical Directory Tree (VSCode-style)
  getDirectoryTree: (dirPath) => ipcRenderer.invoke('get-directory-tree', dirPath),
  expandDirectory: (dirPath) => ipcRenderer.invoke('expand-directory', dirPath),

  // Recent Items History
  getRecentItems: () => ipcRenderer.invoke('get-recent-items'),
  addRecentFile: (filePath) => ipcRenderer.invoke('add-recent-file', filePath),
  addRecentFolder: (folderPath) => ipcRenderer.invoke('add-recent-folder', folderPath),

  // Window Management
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
  getStartupOpenRequest: () => ipcRenderer.invoke('get-startup-open-request'),
  showChoiceDialog: (options) => ipcRenderer.invoke('show-choice-dialog', options),
  generateUnifiedDiff: (leftText, rightText, options) => ipcRenderer.invoke('generate-unified-diff', leftText, rightText, options),

  // System
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getInstallHint: (tool) => ipcRenderer.invoke('get-install-hint', tool),
  getAppDir: () => ipcRenderer.invoke('get-app-dir'),

  // File Management
  createFile: (dirPath, fileName, content) => ipcRenderer.invoke('create-file', dirPath, fileName, content),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),

  // Command-line file opening (double-click from file manager)
  onOpenFileFromCLI: (callback) => {
    ipcRenderer.on('open-file-from-cli', (event, payload) => {
      callback(payload);
    });
  },
  openInSystem: (relativePath) => ipcRenderer.invoke('open-in-system', relativePath),

  // Pandoc Export
  pandocCheck: () => ipcRenderer.invoke('pandoc-check'),
  pandocCheckEisvogel: () => ipcRenderer.invoke('pandoc-check-eisvogel'),
  pandocInstallEisvogel: () => ipcRenderer.invoke('pandoc-install-eisvogel'),
  pandocExport: (options) => ipcRenderer.invoke('pandoc-export', options),

  // Electron PDF Export (template-based)
  electronPdfExport: (options) => ipcRenderer.invoke('electron-pdf-export', options),

  // WeasyPrint PDF Export (for advanced CSS layouts)
  weasyprintExport: (options) => ipcRenderer.invoke('weasyprint-export', options),

  readTemplateFiles: (templateId) => ipcRenderer.invoke('read-template-files', templateId),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  pandocToHtml: (markdown) => ipcRenderer.invoke('pandoc-to-html', markdown),

  // Book Export API (Paragraf pipeline)
  bookExportValidate: (options) => ipcRenderer.invoke('book-export-validate', options),
  bookExportCompile: (options) => ipcRenderer.invoke('book-export-compile', options),
  bookExportDiscoverFonts: (profileId) => ipcRenderer.invoke('book-export-discover-fonts', profileId),
});

// Claude Code Integration API (separater Namespace)
contextBridge.exposeInMainWorld('claude', {
  // Write context files to .tiptap-context directory
  writeContext: (contextDir, files) => ipcRenderer.invoke('claude-write-context', contextDir, files),
  // Get available Claude models (API + fallback list)
  getModels: () => ipcRenderer.invoke('claude-list-models'),
  // Open terminal with claude in context directory
  openTerminal: (workDir, model) => ipcRenderer.invoke('claude-open-terminal', workDir, model),
});

// Skill Repository API
contextBridge.exposeInMainWorld('skills', {
  list: () => ipcRenderer.invoke('skills-list'),
  get: (skillName) => ipcRenderer.invoke('skills-get', skillName),
  create: (payload) => ipcRenderer.invoke('skills-create', payload),
  getRoot: () => ipcRenderer.invoke('skills-get-root'),
  apply: (payload) => ipcRenderer.invoke('skills-apply', payload),
});

// File Watcher API
contextBridge.exposeInMainWorld('fileWatcher', {
  // Start watching a file for external changes
  watch: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  // Stop watching
  unwatch: () => ipcRenderer.invoke('unwatch-file'),
  // Register callback for external changes
  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed-externally', (event, payload) => {
      callback(payload?.filePath || payload, payload);
    });
  },
});

// PTY Terminal API (für integriertes xterm.js Terminal)
contextBridge.exposeInMainWorld('pty', {
  // Create new PTY process
  create: (workDir, cols, rows) => ipcRenderer.invoke('pty-create', workDir, cols, rows),
  // Send input to PTY
  write: (data) => ipcRenderer.invoke('pty-input', data),
  // Resize PTY
  resize: (cols, rows) => ipcRenderer.invoke('pty-resize', cols, rows),
  // Trigger session summary worker (checkpoint|final)
  summarize: (mode = 'checkpoint') => ipcRenderer.invoke('pty-summarize', mode),
  // Kill PTY
  kill: () => ipcRenderer.invoke('pty-kill'),
  // Session Registry
  getSession: (workDir) => ipcRenderer.invoke('pty-get-session', workDir),
  setSession: (sessionEntry) => ipcRenderer.invoke('pty-set-session', sessionEntry),
  endSession: (sessionId) => ipcRenderer.invoke('pty-end-session', sessionId),
  newSessionId: () => ipcRenderer.invoke('pty-new-session-id'),
  // Receive output from PTY
  onData: (callback) => {
    ipcRenderer.on('pty-data', (event, data) => callback(data));
  },
  // PTY exit event
  onExit: (callback) => {
    ipcRenderer.on('pty-exit', (event, info) => callback(info));
  },
  // Session events (resume-failed, session-ready)
  onSessionEvent: (callback) => {
    ipcRenderer.on('pty-session-event', (event, data) => callback(data));
  },
});

console.log('Preload script loaded - Sprint 1.1 + Claude + FileWatcher + PTY');
