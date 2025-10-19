const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

function createWindow() {
  // Get screen dimensions
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Calculate window size (66vw × 100vh)
  const windowWidth = Math.floor(screenWidth * 0.66);
  const windowHeight = screenHeight;

  // Calculate centered position (17vw margin on each side)
  const x = Math.floor(screenWidth * 0.17);
  const y = 0;

  const mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    title: 'TipTap AI',
    icon: path.join(__dirname, 'tiptapai-icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Set WM_CLASS for proper desktop integration
  mainWindow.setTitle('TipTap AI');

  mainWindow.loadFile('renderer/index.html');

  // DevTools nur im Development-Modus öffnen
  // mainWindow.webContents.openDevTools();
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

// Hierarchische Verzeichnisstruktur lesen (VSCode-style)
ipcMain.handle('get-directory-tree', async (event, dirPath) => {
  try {
    const tree = await buildDirectoryTree(dirPath);
    console.log(`Built directory tree for: ${dirPath}`);
    return { success: true, tree };
  } catch (error) {
    console.error(`Error building directory tree: ${dirPath}`, error);
    return { success: false, error: error.message };
  }
});

// Rekursive Funktion zum Aufbauen des Verzeichnisbaums
async function buildDirectoryTree(dirPath, depth = 0, maxDepth = 3) {
  // Sicherheit: Maximale Tiefe begrenzen (Performance)
  if (depth > maxDepth) {
    return null;
  }

  try {
    const stat = await fs.stat(dirPath);
    const name = path.basename(dirPath);

    // Versteckte Dateien/Ordner ignorieren (beginnen mit .)
    if (name.startsWith('.')) {
      return null;
    }

    if (stat.isDirectory()) {
      // Ordner: Rekursiv Kinder laden
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const children = [];

      for (const entry of entries) {
        // Versteckte Einträge überspringen
        if (entry.name.startsWith('.')) continue;

        const childPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Unterordner: Lazy-Loading (nur erste Ebene laden)
          children.push({
            name: entry.name,
            path: childPath,
            type: 'directory',
            children: null, // Wird bei expand nachgeladen
          });
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          // Markdown/Text-Datei
          children.push({
            name: entry.name,
            path: childPath,
            type: 'file',
          });
        }
      }

      // Sortieren: Ordner zuerst, dann alphabetisch
      children.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });

      return {
        name,
        path: dirPath,
        type: 'directory',
        children,
      };
    } else if (stat.isFile() && (name.endsWith('.md') || name.endsWith('.txt'))) {
      // Einzelne Datei
      return {
        name,
        path: dirPath,
        type: 'file',
      };
    }

    return null;
  } catch (error) {
    console.error(`Error reading ${dirPath}:`, error);
    return null;
  }
}

// Lazy-Loading: Unterordner bei Bedarf nachladen
ipcMain.handle('expand-directory', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children = [];

    for (const entry of entries) {
      // Versteckte Einträge überspringen
      if (entry.name.startsWith('.')) continue;

      const childPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        children.push({
          name: entry.name,
          path: childPath,
          type: 'directory',
          children: null, // Lazy-Loading
        });
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
        children.push({
          name: entry.name,
          path: childPath,
          type: 'file',
        });
      }
    }

    // Sortieren: Ordner zuerst, dann alphabetisch
    children.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'directory' ? -1 : 1;
    });

    console.log(`Expanded directory: ${dirPath} (${children.length} items)`);
    return { success: true, children };
  } catch (error) {
    console.error(`Error expanding directory: ${dirPath}`, error);
    return { success: false, error: error.message };
  }
});

// Recent Items History Management
const HISTORY_FILE = path.join(os.homedir(), '.tiptapai-history.json');
const MAX_RECENT_ITEMS = 15;

async function loadHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist or is invalid, return empty history
    return { items: [], lastOpenedFile: null, lastOpenedFolder: null };
  }
}

async function saveHistory(history) {
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

async function addRecentItem(itemPath, itemType) {
  const history = await loadHistory();
  const now = Date.now();

  // Remove existing entry if present
  history.items = history.items.filter(item => item.path !== itemPath);

  // Add new entry at the beginning
  history.items.unshift({
    path: itemPath,
    type: itemType, // 'file' or 'folder'
    name: path.basename(itemPath),
    lastOpened: now
  });

  // Keep only MAX_RECENT_ITEMS
  history.items = history.items.slice(0, MAX_RECENT_ITEMS);

  await saveHistory(history);
  console.log(`Added to recent items: ${itemPath} (${itemType})`);
}

// Get recent items
ipcMain.handle('get-recent-items', async () => {
  try {
    const history = await loadHistory();
    return { success: true, items: history.items || [] };
  } catch (error) {
    console.error('Error getting recent items:', error);
    return { success: false, error: error.message };
  }
});

// Add recent file
ipcMain.handle('add-recent-file', async (event, filePath) => {
  try {
    await addRecentItem(filePath, 'file');
    // Update last opened file
    const history = await loadHistory();
    history.lastOpenedFile = filePath;
    await saveHistory(history);
    return { success: true };
  } catch (error) {
    console.error('Error adding recent file:', error);
    return { success: false, error: error.message };
  }
});

// Add recent folder
ipcMain.handle('add-recent-folder', async (event, folderPath) => {
  try {
    await addRecentItem(folderPath, 'folder');
    // Update last opened folder
    const history = await loadHistory();
    history.lastOpenedFolder = folderPath;
    await saveHistory(history);
    return { success: true };
  } catch (error) {
    console.error('Error adding recent folder:', error);
    return { success: false, error: error.message };
  }
});

// Set window title
ipcMain.handle('set-window-title', async (event, title) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.setTitle(title);
  }
  return { success: true };
});
