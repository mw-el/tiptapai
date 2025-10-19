const { contextBridge, ipcRenderer } = require('electron');

// IPC Bridge - Sprint 1.1: File Operations
contextBridge.exposeInMainWorld('api', {
  // File Operations
  loadFile: (path) => ipcRenderer.invoke('load-file', path),
  saveFile: (path, content) => ipcRenderer.invoke('save-file', path, content),

  // File Tree (deprecated - kept for compatibility)
  getFiles: (dirPath) => ipcRenderer.invoke('get-files', dirPath),

  // Directory Selection
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Hierarchical Directory Tree (VSCode-style)
  getDirectoryTree: (dirPath) => ipcRenderer.invoke('get-directory-tree', dirPath),
  expandDirectory: (dirPath) => ipcRenderer.invoke('expand-directory', dirPath),

  // Recent Items History
  getRecentItems: () => ipcRenderer.invoke('get-recent-items'),
  addRecentFile: (filePath) => ipcRenderer.invoke('add-recent-file', filePath),
  addRecentFolder: (folderPath) => ipcRenderer.invoke('add-recent-folder', folderPath),

  // Window Management
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),

  // System
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
});

console.log('Preload script loaded - Sprint 1.1');
