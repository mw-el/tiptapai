const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('renderer/index.html');

  // DevTools automatisch öffnen für Development
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers - Sprint 1.1: File Operations

ipcMain.handle('load-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`Loaded file: ${filePath}`);
    return { success: true, content };
  } catch (error) {
    console.error(`Error loading file: ${filePath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`Saved file: ${filePath}`);
    return { success: true };
  } catch (error) {
    console.error(`Error saving file: ${filePath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-files', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name)
      }));
    console.log(`Found ${files.length} markdown files in ${dirPath}`);
    return { success: true, files, currentDir: dirPath };
  } catch (error) {
    console.error(`Error reading directory: ${dirPath}`, error);
    return { success: false, error: error.message };
  }
});

// Ordner-Dialog öffnen
ipcMain.handle('select-directory', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  return { success: true, dirPath: result.filePaths[0] };
});
