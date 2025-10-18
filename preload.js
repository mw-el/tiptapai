const { contextBridge, ipcRenderer } = require('electron');

// IPC Bridge - Sprint 1.1: File Operations
contextBridge.exposeInMainWorld('api', {
  // File Operations
  loadFile: (path) => ipcRenderer.invoke('load-file', path),
  saveFile: (path, content) => ipcRenderer.invoke('save-file', path, content),

  // File Tree
  getFiles: (dirPath) => ipcRenderer.invoke('get-files', dirPath),
});

console.log('Preload script loaded - Sprint 1.1');
