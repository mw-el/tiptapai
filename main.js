const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { spawn, execSync } = require('child_process');
const { randomUUID } = require('crypto');
const platform = require('./platform');

app.setName('TipTap AI');

let pendingStartupOpenRequest = null;
let isQuitting = false;

// WeasyPrint binary path (discovered at runtime via PATH)
const weasyprintBin = platform.findBinary('weasyprint');

// Enable auto-reload during development
if (process.env.NODE_ENV !== 'production') {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit',
      // Avoid reload loops when Claude context/log files are written inside the repo
      ignored: [
        /(^|[\\/])\.tiptap-context[\\/]/,
        /(^|[\\/])\.terminal-logs[\\/]/,
      ],
    });
  } catch (err) {
    console.log('electron-reload not available:', err.message);
  }
}

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
    icon: path.join(__dirname, 'tiptapai.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Set WM_CLASS for proper desktop integration
  mainWindow.setTitle('TipTap AI');

  mainWindow.loadFile('renderer/index.html');

  // DevTools können mit Ctrl+Shift+I oder F12 geöffnet werden
  // mainWindow.webContents.openDevTools();

  // Handle command-line / protocol file opening (including tiptapai://open)
  const args = process.argv.slice(2);
  console.log('🚀 App started with command line arguments:', args);
  const openRequest = parseOpenRequestFromArgs(args);
  pendingStartupOpenRequest = openRequest || null;

  if (openRequest && openRequest.filePath) {
    console.log('📂 CLI OPEN REQUEST:', openRequest);
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        mainWindow.webContents.send('open-file-from-cli', openRequest);
        console.log('✅ CLI open request sent to renderer');
      }, 120);
    });
  } else {
    console.log('ℹ️  No markdown open request in command line arguments');
  }

  // Handle window close with unsaved changes check
  mainWindow.on('close', async (event) => {
    if (isQuitting) return; // already decided to quit, let it close
    event.preventDefault();

    try {
      const hasUnsaved = await mainWindow.webContents.executeJavaScript(
        'window.editorState?.hasUnsavedChanges || false'
      );

      if (hasUnsaved) {
        const choice = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['Abbrechen', 'Ohne Speichern beenden', 'Speichern und beenden'],
          defaultId: 0,
          cancelId: 0,
          title: 'Ungespeicherte Änderungen',
          message: 'Das aktuelle Dokument enthält ungespeicherte Änderungen.',
          detail: 'Möchten Sie die Änderungen speichern, bevor Sie beenden?'
        });

        if (choice.response === 0) return; // Cancel

        if (choice.response === 2) {
          await mainWindow.webContents.executeJavaScript('window.saveCurrentFile?.()');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (err) {
      console.error('Error checking unsaved changes:', err);
    }

    isQuitting = true;
    app.quit();
  });

  return mainWindow;
}

function decodeFileArg(raw) {
  if (!raw) return '';
  let value = String(raw).trim();
  if (!value) return '';

  if (value.startsWith('file://')) {
    try {
      const u = new URL(value);
      value = decodeURIComponent(u.pathname || '');
    } catch (_) {}
  }

  // Strip optional quotes from shell wrappers.
  value = value.replace(/^['"]+|['"]+$/g, '');
  return value;
}

function parseMdPathWithLine(raw) {
  const decoded = decodeFileArg(raw);
  if (!decoded) return null;

  // Support "/path/file.md:123" style.
  const m = decoded.match(/^(.*\.md):(\d+)$/i);
  if (m) {
    return {
      filePath: m[1],
      line: Number(m[2]) || null,
      query: '',
      source: 'cli',
    };
  }

  if (/\.md$/i.test(decoded)) {
    return {
      filePath: decoded,
      line: null,
      query: '',
      source: 'cli',
    };
  }

  return null;
}

function parseProtocolOpen(raw) {
  if (!raw || !String(raw).startsWith('tiptapai://')) return null;
  try {
    const u = new URL(String(raw));
    const action = (u.hostname || u.pathname || '').replace(/^\//, '');
    if (action !== 'open') return null;

    const filePath = decodeFileArg(u.searchParams.get('file') || '');
    if (!filePath) return null;

    const lineParam = Number(u.searchParams.get('line') || 0);
    const query = String(u.searchParams.get('q') || '').trim();

    return {
      filePath,
      line: Number.isFinite(lineParam) && lineParam > 0 ? lineParam : null,
      query,
      source: 'protocol',
    };
  } catch (err) {
    console.warn('Could not parse tiptapai protocol URL:', raw, err.message);
    return null;
  }
}

function parseOpenRequestFromArgs(args) {
  if (!Array.isArray(args)) return null;

  for (const arg of args) {
    if (!arg || String(arg).startsWith('-')) continue;

    const protocolReq = parseProtocolOpen(arg);
    if (protocolReq) return protocolReq;

    const mdReq = parseMdPathWithLine(arg);
    if (mdReq) return mdReq;
  }

  return null;
}

// LanguageTool Server starten (falls noch nicht läuft)
let languageToolProcess = null;

async function startLanguageTool() {
  const http = require('http');

  // Prüfe ob LanguageTool bereits läuft
  const isRunning = await new Promise((resolve) => {
    const req = http.get('http://localhost:8081/v2/languages', (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });

  if (isRunning) {
    console.log('LanguageTool ist bereits gestartet');
    return;
  }

  console.log('Starte LanguageTool Server...');
  const ltPath = path.join(__dirname, 'LanguageTool-6.6');
  const jarPath = path.join(ltPath, 'languagetool-server.jar');
  const configPath = path.join(ltPath, 'languagetool.properties');

  languageToolProcess = spawn('java', [
    '-cp', jarPath,
    'org.languagetool.server.HTTPServer',
    '--port', '8081',
    '--allow-origin', '*',
    '--config', configPath
  ], {
    cwd: ltPath,
    detached: false,
    stdio: 'ignore'
  });

  languageToolProcess.on('error', (err) => {
    console.error('Fehler beim Starten von LanguageTool:', err);
  });

  console.log('LanguageTool Server gestartet (PID:', languageToolProcess.pid, ')');
}

app.whenReady().then(async () => {
  // Icon muss nach ready gesetzt werden – so früh wie möglich um Flash zu minimieren
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'tiptapai.png'));
  }

  // Externe Bilder (http/https) im Renderer erlauben
  // Nötig weil webSecurity:false allein in manchen Electron-Versionen
  // nicht ausreicht um cross-origin img-Requests durchzulassen
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src * data: blob: filesystem:; media-src * data: blob:; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src *;"
        ]
      }
    });
  });

  await startLanguageTool();
  createWindow();
});

app.on('window-all-closed', () => {
  if (languageToolProcess) {
    languageToolProcess.kill();
    languageToolProcess = null;
  }
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  app.quit();
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
    return { success: true, content };
  } catch (error) {
    console.error(`Error loading file: ${filePath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    const previousContent = lastFileContent;
    if (watchedFilePath === filePath) {
      lastFileContent = content;
    }
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    if (watchedFilePath === filePath) {
      lastFileContent = previousContent;
    }
    console.error(`Error saving file: ${filePath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stat-file', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      success: true,
      stats: {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      },
    };
  } catch (error) {
    console.error(`Error stating file: ${filePath}`, error);
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
    return { success: true, files, currentDir: dirPath };
  } catch (error) {
    console.error(`Error reading directory: ${dirPath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-in-system', async (event, targetPath) => {
  try {
    const resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.join(__dirname, targetPath);

    // Use system default handler for all files (works cross-platform)
    const result = await shell.openPath(resolvedPath);
    if (result) {
      return { success: false, error: result };
    }
    return { success: true };
  } catch (error) {
    console.error('Error opening path in system handler:', error);
    return { success: false, error: error.message };
  }
});

// Ordner-Dialog öffnen
ipcMain.handle('select-directory', async (event) => {
  console.log('Opening directory selection dialog...');

  // Get the window that made the request
  const win = BrowserWindow.fromWebContents(event.sender);

  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'showHiddenFiles', 'dontAddToRecent'],
    title: 'Ordner wählen',
    defaultPath: os.homedir(),
    // Zeige alle Dateisystem-Typen an (inkl. NFS)
    securityScopedBookmarks: false
  });

  console.log('Dialog closed. Result:', result);

  if (result.canceled) {
    console.log('User canceled directory selection');
    return { success: false, canceled: true };
  }

  console.log('User selected directory:', result.filePaths[0]);
  return { success: true, dirPath: result.filePaths[0] };
});

// Save-As Dialog für Datei mit Ordnerauswahl
ipcMain.handle('show-save-dialog', async (event, defaultPath, defaultFilename) => {
  console.log('Opening save dialog...', { defaultPath, defaultFilename });

  const win = BrowserWindow.fromWebContents(event.sender);

  const result = await dialog.showSaveDialog(win, {
    title: 'Speichern unter...',
    defaultPath: defaultPath ? path.join(defaultPath, defaultFilename || 'document.md') : defaultFilename || 'document.md',
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
  });

  console.log('Save dialog closed. Result:', result);

  if (result.canceled) {
    console.log('User canceled save dialog');
    return { success: false, canceled: true };
  }

  console.log('User selected save path:', result.filePath);
  return { success: true, filePath: result.filePath };
});

// Hierarchische Verzeichnisstruktur lesen (VSCode-style)
ipcMain.handle('get-directory-tree', async (event, dirPath) => {
  try {
    const tree = await buildDirectoryTree(dirPath);
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

// Custom choice dialog for renderer (explicit button labels instead of OK/Cancel)
ipcMain.handle('show-choice-dialog', async (event, options = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showMessageBox(win || undefined, {
      type: options.type || 'question',
      title: options.title || 'Hinweis',
      message: options.message || '',
      detail: options.detail || '',
      buttons: Array.isArray(options.buttons) && options.buttons.length > 0
        ? options.buttons
        : ['Ja', 'Nein'],
      defaultId: Number.isInteger(options.defaultId) ? options.defaultId : 0,
      cancelId: Number.isInteger(options.cancelId) ? options.cancelId : 1,
      noLink: true,
    });

    return {
      success: true,
      response: result.response,
      checkboxChecked: result.checkboxChecked,
    };
  } catch (error) {
    console.error('Error showing choice dialog:', error);
    return { success: false, error: error.message };
  }
});

// Generate unified text diff (used for external-change conflict review)
ipcMain.handle('generate-unified-diff', async (event, leftText = '', rightText = '', options = {}) => {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const runExecFile = promisify(execFile);

  const left = typeof leftText === 'string' ? leftText : String(leftText ?? '');
  const right = typeof rightText === 'string' ? rightText : String(rightText ?? '');
  const leftLabel = options?.leftLabel || 'Editor-Version';
  const rightLabel = options?.rightLabel || 'Externe Version';

  let tmpDir = '';
  const leftPath = () => path.join(tmpDir, 'left.tmp.md');
  const rightPath = () => path.join(tmpDir, 'right.tmp.md');

  try {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiptapai-diff-'));
    await fs.writeFile(leftPath(), left, 'utf-8');
    await fs.writeFile(rightPath(), right, 'utf-8');

    try {
      const { stdout } = await runExecFile('diff', [
        '-u',
        '--label', leftLabel,
        '--label', rightLabel,
        leftPath(),
        rightPath(),
      ], {
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true, diff: stdout || 'Keine Unterschiede gefunden.\n' };
    } catch (error) {
      if (error && Number(error.code) === 1) {
        return { success: true, diff: error.stdout || 'Unterschiede erkannt, aber keine Diff-Ausgabe verfügbar.\n' };
      }

      const stderr = (error && (error.stderr || error.message)) || 'Unbekannter Diff-Fehler';
      return { success: false, error: String(stderr) };
    }
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
});

// Startup open request (for deterministic renderer boot logic)
ipcMain.handle('get-startup-open-request', async () => {
  const request = pendingStartupOpenRequest;
  pendingStartupOpenRequest = null; // consume once
  return { success: true, request };
});

// Get home directory
ipcMain.handle('get-home-dir', async () => {
  return { success: true, homeDir: os.homedir() };
});

// Get platform-specific install hint for a tool
ipcMain.handle('get-install-hint', (_event, tool) => {
  return { hint: platform.installHint(tool), platform: process.platform };
});

// Get app directory (for internal resources like docs)
ipcMain.handle('get-app-dir', async () => {
  return { success: true, appDir: __dirname };
});

// Create new file
ipcMain.handle('create-file', async (event, dirPath, fileName, content = '') => {
  try {
    const filePath = path.join(dirPath, fileName);

    // Check if file already exists
    try {
      await fs.access(filePath);
      return { success: false, error: 'Datei existiert bereits' };
    } catch {
      // File doesn't exist, good to create
    }

    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    console.error(`Error creating file:`, error);
    return { success: false, error: error.message };
  }
});

// Rename file
ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
  try {
    // Check if new path already exists
    try {
      await fs.access(newPath);
      return { success: false, error: 'Zieldatei existiert bereits' };
    } catch {
      // File doesn't exist, good to rename
    }

    await fs.rename(oldPath, newPath);
    return { success: true };
  } catch (error) {
    console.error(`Error renaming file:`, error);
    return { success: false, error: error.message };
  }
});

// Delete file
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    console.error(`Error deleting file:`, error);
    return { success: false, error: error.message };
  }
});

// Show open dialog for file selection
ipcMain.handle('show-open-dialog', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: options.filters || [{ name: 'Markdown', extensions: ['md'] }],
    defaultPath: options.defaultPath || os.homedir(),
    title: options.title || 'Datei öffnen',
  });
  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true };
  }
  return { success: true, filePath: result.filePaths[0] };
});

// Show open dialog for asset files (images, templates, etc.)
ipcMain.handle('show-asset-dialog', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: options.defaultPath || os.homedir(),
    title: options.title || 'Asset auswählen',
  });
  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true };
  }
  return { success: true, filePath: result.filePaths[0] };
});

// Export file using Pandoc
ipcMain.handle('export-with-pandoc', async (event, options = {}) => {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const runExecFile = promisify(execFile);

  const { inputPath, outputPath, format, templatePath, additionalArgs = [] } = options;

  if (!inputPath || !outputPath || !format) {
    return { success: false, error: 'inputPath, outputPath und format sind erforderlich' };
  }

  const pandocBin = platform.findBinary('pandoc');
  if (!pandocBin) {
    return { success: false, error: 'Pandoc nicht gefunden. Bitte installieren: brew install pandoc' };
  }

  const args = [
    inputPath,
    '-o', outputPath,
    '--from', 'markdown',
  ];

  if (templatePath) {
    args.push('--template', templatePath);
  }

  args.push(...additionalArgs);

  try {
    const { stdout, stderr } = await runExecFile(pandocBin, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
    });
    return { success: true, stdout, stderr };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stderr: error.stderr || '',
      stdout: error.stdout || '',
    };
  }
});

// WeasyPrint PDF export
ipcMain.handle('export-with-weasyprint', async (event, options = {}) => {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const runExecFile = promisify(execFile);

  const { inputPath, outputPath } = options;

  if (!inputPath || !outputPath) {
    return { success: false, error: 'inputPath und outputPath sind erforderlich' };
  }

  if (!weasyprintBin) {
    return { success: false, error: 'WeasyPrint nicht gefunden.' };
  }

  try {
    const { stdout, stderr } = await runExecFile(weasyprintBin, [inputPath, outputPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 120000,
    });
    return { success: true, stdout, stderr };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stderr: error.stderr || '',
      stdout: error.stdout || '',
    };
  }
});

// Check if binary exists
ipcMain.handle('check-binary', async (event, binaryName) => {
  const binPath = platform.findBinary(binaryName);
  return { exists: !!binPath, path: binPath || null };
});

// Watch file for external changes
let watchedFilePath = null;
let lastFileContent = null;
let fileWatcher = null;

ipcMain.handle('watch-file', async (event, filePath, currentContent) => {
  // Stop any existing watcher
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }

  watchedFilePath = filePath;
  lastFileContent = currentContent;

  try {
    const { watch } = require('fs');
    let debounceTimer = null;

    fileWatcher = watch(filePath, { persistent: false }, (eventType) => {
      if (eventType !== 'change') return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const newContent = await fs.readFile(filePath, 'utf-8');
          if (newContent !== lastFileContent) {
            lastFileContent = newContent;
            const win = BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('file-changed-externally', { filePath, newContent });
            }
          }
        } catch (err) {
          console.error('Error reading watched file:', err);
        }
      }, 300);
    });

    fileWatcher.on('error', (err) => {
      console.error('File watcher error:', err);
    });

    return { success: true };
  } catch (error) {
    console.error('Error setting up file watcher:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('unwatch-file', async () => {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  watchedFilePath = null;
  lastFileContent = null;
  return { success: true };
});

ipcMain.handle('update-watched-content', async (event, content) => {
  lastFileContent = content;
  return { success: true };
});
