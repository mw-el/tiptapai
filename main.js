const { app, BrowserWindow, ipcMain, dialog, shell, session, net, protocol } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { randomUUID } = require('crypto');
const platform = require('./platform');
const registerBookExportLixHandlers = require('./main-book-export-lix');
const registerCoverBuilderHandlers = require('./main-cover-builder');

app.setName('TipTap AI');

// Lokale Bilder über eigenes Protokoll laden: localfile:///abs/path/to/img.png
// file:// wird von Chromium blockiert wenn das Renderer-Dokument aus einem anderen Verzeichnis stammt.
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
]);

let pendingStartupOpenRequest = null;
let isQuitting = false;

// macOS: Finder übergibt Dateien nicht per argv, sondern via 'open-file'.
// Muss VOR app.whenReady() registriert sein, damit frühe Events nicht verloren gehen.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  console.log('📂 macOS open-file event:', filePath);
  const openRequest = { filePath, line: null };

  const wins = BrowserWindow.getAllWindows();
  if (wins.length === 0) {
    // App startet gerade durch den Doppelklick → an createWindow() weiterreichen
    pendingStartupOpenRequest = openRequest;
    return;
  }

  const target = BrowserWindow.getFocusedWindow() || wins[0];
  const send = () => target.webContents.send('open-file-from-cli', openRequest);
  if (target.webContents.isLoading()) {
    target.webContents.once('did-finish-load', () => setTimeout(send, 120));
  } else {
    send();
  }
  if (target.isMinimized()) target.restore();
  target.focus();
});

// WeasyPrint binary path (discovered at runtime via PATH)
const weasyprintBin = platform.findBinary('weasyprint');

// Enable auto-reload during development
// Nicht aktiv wenn aus dem .app-Bundle gestartet (execPath liegt in Contents/MacOS)
const isRunningFromAppBundle = process.execPath.includes('.app/Contents/MacOS');
if (process.env.NODE_ENV !== 'production' && !isRunningFromAppBundle) {
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

  // Handle command-line / protocol file opening (including tiptapai://open)
  const args = process.argv.slice(2);
  console.log('🚀 App started with command line arguments:', args);
  const argvRequest = parseOpenRequestFromArgs(args);
  // argv (CLI / Protokoll) hat Vorrang, sonst ein evtl. zuvor eingetroffenes macOS 'open-file'-Event
  const openRequest = argvRequest || pendingStartupOpenRequest;
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
  // localfile:///abs/path → liest Datei vom Dateisystem und liefert sie als Response
  protocol.handle('localfile', async (request) => {
    const url = new URL(request.url);
    // url.pathname ist bereits URL-dekodiert bei protocol.handle
    const filePath = decodeURIComponent(url.pathname);
    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
      const mime = mimeMap[ext] || 'application/octet-stream';
      return new Response(data, { headers: { 'Content-Type': mime } });
    } catch (err) {
      return new Response(`File not found: ${filePath}`, { status: 404 });
    }
  });

  // Icon muss nach ready gesetzt werden – so früh wie möglich um Flash zu minimieren
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'tiptapai-macos.png'));
  }

  // Externe Bilder (http/https) im Renderer erlauben
  // Nötig weil webSecurity:false allein in manchen Electron-Versionen
  // nicht ausreicht um cross-origin img-Requests durchzulassen
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src * file: data: blob: filesystem:; media-src * file: data: blob:; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src *;"
        ]
      }
    });
  });

  await startLanguageTool();
  registerBookExportLixHandlers(app);
  registerCoverBuilderHandlers(app);
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
  if (!isQuitting && BrowserWindow.getAllWindows().length === 0) {
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

// Datei IM Finder/Explorer markieren (selectiert sie im Verzeichnis,
// statt sie zu oeffnen). Cross-platform via shell.showItemInFolder.
ipcMain.handle('reveal-in-finder', async (event, targetPath) => {
  try {
    const resolved = path.isAbsolute(targetPath) ? targetPath : path.join(__dirname, targetPath);
    shell.showItemInFolder(resolved);
    return { success: true };
  } catch (error) {
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

ipcMain.handle('claude-write-context', async (event, contextDir, files = {}) => {
  try {
    if (!contextDir || typeof contextDir !== 'string') {
      return { success: false, error: 'contextDir fehlt' };
    }

    const root = path.resolve(contextDir);
    await fs.mkdir(root, { recursive: true });

    for (const [relativePath, content] of Object.entries(files || {})) {
      if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
        return { success: false, error: `Ungültiger Kontextpfad: ${relativePath}` };
      }

      const targetPath = path.resolve(root, relativePath);
      if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
        return { success: false, error: `Kontextpfad ausserhalb des Kontextordners: ${relativePath}` };
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, String(content ?? ''), 'utf-8');

      if (relativePath === 'apply-editor-edit.js') {
        await fs.chmod(targetPath, 0o755).catch(() => {});
      }
    }

    return { success: true, contextDir: root };
  } catch (error) {
    console.error('Error writing Claude context:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claude-list-models', async () => {
  return {
    success: true,
    models: [
      { id: 'haiku', label: 'Haiku (Alias)' },
      { id: 'sonnet', label: 'Sonnet (Alias)' },
      { id: 'opus', label: 'Opus (Alias)' },
    ],
  };
});

ipcMain.handle('claude-open-terminal', async () => {
  return {
    success: false,
    error: 'Externes Claude-Terminal ist deaktiviert; bitte das integrierte Terminal verwenden.',
  };
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
// PTY Terminal - Integriertes Terminal mit xterm.js
// ============================================================================

// Lazy-load node-pty um Startup-Probleme zu vermeiden
let pty = null;
let ptyProcess = null;
let ptyWorkDir = null;
let ptyForwardWebContents = null;
let ptyDataDisposable = null;
let ptyExitDisposable = null;
let terminalLogStream = null;
let currentLogPath = null;
const terminalDebugLogPath = path.join(os.homedir(), '.tiptap-ai', 'terminal-debug.log');
const summaryWorkerPath = path.join(__dirname, 'scripts', 'session_summary_worker.js');
const summaryDefaultModel = process.env.TIPTAP_SUMMARY_MODEL || 'haiku';
const summaryFallbackModel = process.env.TIPTAP_SUMMARY_FALLBACK_MODEL || 'sonnet';
const summaryTimeoutMs = process.env.TIPTAP_SUMMARY_TIMEOUT_MS || '180000';

// Session Registry – persistente Claude-Session-IDs für --resume
let currentSessionId = null;

function getSessionRegistryPath() {
  return path.join(app.getPath('userData'), 'sessions.json');
}

async function readSessionRegistry() {
  try {
    const raw = await fs.readFile(getSessionRegistryPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { sessions: [] };
  }
}

async function writeSessionRegistry(registry) {
  try {
    await fs.writeFile(getSessionRegistryPath(), JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    logTerminalDebug('Failed to write session registry', { error: err.message });
  }
}

async function getSessionByWorkDir(workDir) {
  const registry = await readSessionRegistry();
  return registry.sessions
    .filter(s => s.workDir === workDir && s.status !== 'terminated')
    .sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt))[0] || null;
}

async function upsertSession(entry) {
  const registry = await readSessionRegistry();
  const idx = registry.sessions.findIndex(s => s.id === entry.id);
  const now = new Date().toISOString();
  if (idx >= 0) {
    registry.sessions[idx] = { ...registry.sessions[idx], ...entry, lastActiveAt: now };
  } else {
    registry.sessions.push({ ...entry, lastActiveAt: now, startedAt: now });
  }
  await writeSessionRegistry(registry);
}

// SessionOutputWatcher – parst PTY-Output-Stream nach bekannten Claude-Signalen
class SessionOutputWatcher {
  constructor() {
    this._buffer = '';
    this._resumeFailedEmitted = false;
    this._readyEmitted = false;
  }

  feed(chunk) {
    this._buffer += chunk;
    if (this._buffer.length > 4096) {
      this._buffer = this._buffer.slice(-4096);
    }

    const events = [];

    if (!this._resumeFailedEmitted && this._buffer.includes('No conversation found with session ID:')) {
      this._resumeFailedEmitted = true;
      const match = this._buffer.match(/No conversation found with session ID:\s*([a-f0-9-]{36})/i);
      events.push({ type: 'resume-failed', sessionId: match ? match[1] : null });
    }

    if (!this._readyEmitted && this._buffer.includes('__TERMINAL_KIT_READY__')) {
      this._readyEmitted = true;
      events.push({ type: 'session-ready' });
    }

    return events;
  }

  reset() {
    this._buffer = '';
    this._resumeFailedEmitted = false;
    this._readyEmitted = false;
  }
}

const sessionOutputWatcher = new SessionOutputWatcher();

/**
 * Schreibt schnelle Debug-Logs für Terminal/PTY-Fehler in eine immer gleiche Datei,
 * damit wir auch bei frühen Fehlern (vor Session-Log) Hinweise haben.
 */
function logTerminalDebug(message, data) {
  try {
    const dir = path.dirname(terminalDebugLogPath);
    fsSync.mkdirSync(dir, { recursive: true });
    const suffix = data ? ` | ${JSON.stringify(data, null, 2)}` : '';
    fsSync.appendFileSync(
      terminalDebugLogPath,
      `[${new Date().toISOString()}] ${message}${suffix}\n`,
      'utf-8'
    );
  } catch (err) {
    console.error('Failed to write terminal debug log:', err);
  }
}

function setPtyForwardTarget(webContents) {
  if (webContents && !webContents.isDestroyed()) {
    ptyForwardWebContents = webContents;
  } else {
    ptyForwardWebContents = null;
  }
}

function forwardToRenderer(channel, payload) {
  const target = ptyForwardWebContents;
  if (target && !target.isDestroyed()) {
    target.send(channel, payload);
  }
}

function disposePtyListeners() {
  if (ptyDataDisposable?.dispose) {
    ptyDataDisposable.dispose();
  }
  if (ptyExitDisposable?.dispose) {
    ptyExitDisposable.dispose();
  }
  ptyDataDisposable = null;
  ptyExitDisposable = null;
}

function getPty() {
  if (!pty) {
    try {
      pty = require('node-pty');
      logTerminalDebug('node-pty loaded');
    } catch (err) {
      logTerminalDebug('node-pty load failed', { error: err.message, stack: err.stack });
      throw err;
    }
  }
  return pty;
}

/**
 * Erstellt eine neue Log-Datei für die Terminal-Session
 */
async function createTerminalLog(workDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(workDir, '.terminal-logs');

  // Erstelle Log-Verzeichnis falls nötig
  await fs.mkdir(logDir, { recursive: true });

  currentLogPath = path.join(logDir, `session-${timestamp}.log`);

  // Öffne Stream für Logging
  terminalLogStream = fsSync.createWriteStream(currentLogPath, { flags: 'a' });

  // Schreibe Header
  const header = `
================================================================================
TipTap AI - Terminal Session Log
Started: ${new Date().toISOString()}
Working Directory: ${workDir}
================================================================================

`;
  terminalLogStream.write(header);

  logTerminalDebug('Session log opened', { workDir, path: currentLogPath });
  console.log(`📝 Terminal log: ${currentLogPath}`);
  return currentLogPath;
}

/**
 * Schreibt in die Log-Datei
 */
function logTerminal(type, data) {
  if (!terminalLogStream) return;

  // ANSI Escape-Codes entfernen für bessere Lesbarkeit
  const cleanData = data.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

  if (type === 'input') {
    // User-Eingaben markieren
    terminalLogStream.write(`>>> ${cleanData}`);
  } else {
    // Terminal-Ausgabe
    terminalLogStream.write(cleanData);
  }
}

/**
 * Flusht den Log-Stream (wichtig fuer Checkpoint-Summaries)
 */
function flushTerminalLog() {
  return new Promise((resolve) => {
    if (!terminalLogStream) {
      resolve();
      return;
    }
    terminalLogStream.write('', () => resolve());
  });
}

/**
 * Startet den Session-Summary-Worker als separaten Hintergrundprozess
 */
function startSessionSummaryJob(logPath, mode = 'final') {
  try {
    if (!logPath) {
      return { success: false, error: 'No session log path' };
    }

    const resolvedLogPath = path.resolve(logPath);
    const statusSuffix = mode === 'checkpoint' ? 'checkpoint' : 'final';
    const statusFile = `${resolvedLogPath}.summary.${statusSuffix}.status.json`;
    const args = [
      summaryWorkerPath,
      '--log-file',
      resolvedLogPath,
      '--mode',
      mode,
      '--model',
      summaryDefaultModel,
      '--fallback-model',
      summaryFallbackModel,
      '--timeout-ms',
      String(summaryTimeoutMs),
      '--status-file',
      statusFile,
    ];

    const child = spawn(process.execPath, args, {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore',
      // ELECTRON_RUN_AS_NODE=1 verhindert dass Electron die App-Infrastruktur (Dock, Fenster)
      // initialisiert — der Worker läuft dann als plain Node.js ohne macOS-App-Registrierung.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    child.unref();

    logTerminalDebug('Session summary job started', {
      mode,
      logPath: resolvedLogPath,
      statusFile,
      pid: child.pid,
      model: summaryDefaultModel,
      fallbackModel: summaryFallbackModel,
    });

    return {
      success: true,
      mode,
      logPath: resolvedLogPath,
      statusFile,
      model: summaryDefaultModel,
      fallbackModel: summaryFallbackModel,
    };
  } catch (error) {
    logTerminalDebug('Session summary job start failed', { mode, logPath, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Schließt die Log-Datei
 */
function closeTerminalLog(options = {}) {
  const { scheduleFinalSummary = true } = options;
  if (!terminalLogStream) return;

  const logPath = currentLogPath;
  const footer = `
================================================================================
Session ended: ${new Date().toISOString()}
================================================================================
`;
  terminalLogStream.write(footer);
  terminalLogStream.end(() => {
    if (scheduleFinalSummary && logPath) {
      startSessionSummaryJob(logPath, 'final');
    }
  });
  terminalLogStream = null;
  currentLogPath = null;
  console.log(`📝 Terminal log closed: ${logPath}`);
}

// Create PTY process
ipcMain.handle('pty-create', async (event, workDir, cols, rows) => {
  try {
    const webContents = event.sender;
    setPtyForwardTarget(webContents);

    const resolvedWorkDir = workDir || os.homedir();

    // Reuse existing PTY for the same workDir to keep session alive
    if (ptyProcess && ptyWorkDir === resolvedWorkDir) {
      if (cols && rows) {
        ptyProcess.resize(cols, rows);
      }
      logTerminalDebug('pty-create reused existing PTY', { pid: ptyProcess.pid, workDir: resolvedWorkDir });
      return { success: true, pid: ptyProcess.pid, logPath: currentLogPath, reused: true };
    }

    // Kill existing PTY if any (different workDir)
    if (ptyProcess) {
      logTerminalDebug('pty-create replacing PTY', { oldWorkDir: ptyWorkDir, newWorkDir: resolvedWorkDir });
      closeTerminalLog();
      disposePtyListeners();
      ptyProcess.kill();
      ptyProcess = null;
      ptyWorkDir = null;
    }

    const shell = platform.shell();
    logTerminalDebug('pty-create requested', { workDir: resolvedWorkDir, cols, rows, shell });
    const nodePty = getPty();

    // Terminal-Log starten
    await createTerminalLog(resolvedWorkDir);

    ptyProcess = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: resolvedWorkDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });
    ptyWorkDir = resolvedWorkDir;

    console.log(`🖥️ PTY created (PID: ${ptyProcess.pid}), shell: ${shell}, cwd: ${resolvedWorkDir}`);
    logTerminalDebug('PTY spawned', {
      pid: ptyProcess.pid,
      shell,
      cwd: resolvedWorkDir,
      cols: cols || 80,
      rows: rows || 24,
    });

    // Forward PTY output to renderer + Log
    sessionOutputWatcher.reset();
    disposePtyListeners();
    ptyDataDisposable = ptyProcess.onData((data) => {
      // Log output
      logTerminal('output', data);

      forwardToRenderer('pty-data', data);

      // Feed to watcher and emit session events to renderer
      const events = sessionOutputWatcher.feed(data);
      for (const event of events) {
        forwardToRenderer('pty-session-event', event);
        if (event.type === 'resume-failed' && currentSessionId) {
          logTerminalDebug('Session resume failed', { sessionId: currentSessionId });
          upsertSession({ id: currentSessionId, status: 'terminated' });
          currentSessionId = null;
        }
      }
    });

    ptyExitDisposable = ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`🖥️ PTY exited (code: ${exitCode}, signal: ${signal})`);
      logTerminalDebug('PTY exited', { exitCode, signal });
      if (currentSessionId) {
        upsertSession({ id: currentSessionId, status: 'suspended' });
        currentSessionId = null;
      }
      closeTerminalLog();
      forwardToRenderer('pty-exit', { exitCode, signal });
      ptyProcess = null;
      ptyWorkDir = null;
      disposePtyListeners();
      setPtyForwardTarget(null);
    });

    return { success: true, pid: ptyProcess.pid, logPath: currentLogPath };
  } catch (error) {
    console.error('Error creating PTY:', error);
    logTerminalDebug('Error creating PTY', { error: error.message, stack: error.stack, workDir });
    return { success: false, error: error.message };
  }
});

// Send input to PTY
ipcMain.handle('pty-input', async (event, data) => {
  if (ptyProcess) {
    // Log user input
    logTerminal('input', data);
    ptyProcess.write(data);
    return { success: true };
  }
  logTerminalDebug('pty-input attempted without active PTY');
  return { success: false, error: 'No PTY process' };
});

// Resize PTY
ipcMain.handle('pty-resize', async (event, cols, rows) => {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
    logTerminalDebug('PTY resized', { cols, rows });
    return { success: true };
  }
  return { success: false, error: 'No PTY process' };
});

// Manuelle Session-Summary (Checkpoint/Final)
ipcMain.handle('pty-summarize', async (event, mode = 'checkpoint') => {
  const safeMode = mode === 'final' ? 'final' : 'checkpoint';

  if (!currentLogPath) {
    return { success: false, error: 'No active session log' };
  }

  try {
    await flushTerminalLog();
    return startSessionSummaryJob(currentLogPath, safeMode);
  } catch (error) {
    logTerminalDebug('Session summary trigger failed', { mode: safeMode, error: error.message });
    return { success: false, error: error.message };
  }
});

// Kill PTY
ipcMain.handle('pty-kill', async () => {
  if (ptyProcess) {
    logTerminalDebug('PTY kill requested', { pid: ptyProcess.pid });
    if (currentSessionId) {
      await upsertSession({ id: currentSessionId, status: 'suspended' });
      currentSessionId = null;
    }
    closeTerminalLog();
    disposePtyListeners();
    ptyProcess.kill();
    ptyProcess = null;
    ptyWorkDir = null;
    setPtyForwardTarget(null);
    console.log('🖥️ PTY killed');
    return { success: true };
  }
  logTerminalDebug('pty-kill called with no active PTY');
  return { success: true, message: 'No PTY to kill' };
});

// Session Registry: vorhandene Session für ein Arbeitsverzeichnis abrufen
ipcMain.handle('pty-get-session', async (event, workDir) => {
  const session = await getSessionByWorkDir(workDir);
  return { success: true, session };
});

// Session Registry: Session-Eintrag anlegen oder aktualisieren
ipcMain.handle('pty-set-session', async (event, sessionEntry) => {
  if (!sessionEntry?.id) {
    return { success: false, error: 'Missing session id' };
  }
  currentSessionId = sessionEntry.id;
  await upsertSession(sessionEntry);
  return { success: true };
});

// Session Registry: Session als beendet markieren
ipcMain.handle('pty-end-session', async (event, sessionId) => {
  if (sessionId) {
    await upsertSession({ id: sessionId, status: 'suspended' });
    if (currentSessionId === sessionId) {
      currentSessionId = null;
    }
  }
  return { success: true };
});

// Session Registry: neue UUID generieren (für Renderer ohne Node.js crypto)
ipcMain.handle('pty-new-session-id', async () => {
  return { success: true, sessionId: randomUUID() };
});

// ============================================================================
// SKILLS IPC HANDLERS
// ============================================================================
const SKILLS_ROOT = path.join(__dirname, 'skills');

async function parseSkillMd(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  let raw = '';
  try { raw = await fs.readFile(skillFile, 'utf8'); } catch { return null; }

  // Parse YAML frontmatter between --- markers
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let name = path.basename(skillDir);
  let description = '';
  if (match) {
    const fm = match[1];
    const nameLine = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    const descLine = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
    if (nameLine) name = nameLine[1];
    if (descLine) description = descLine[1];
  }
  return { slug: path.basename(skillDir), name, description, path: skillDir, skillFilePath: skillFile };
}

ipcMain.handle('skills-get-root', async () => {
  return { success: true, rootDir: SKILLS_ROOT };
});

ipcMain.handle('skills-list', async () => {
  try {
    const entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const parsed = await parseSkillMd(path.join(SKILLS_ROOT, entry.name));
      if (parsed) skills.push(parsed);
    }
    skills.sort((a, b) => a.slug.localeCompare(b.slug));
    return { success: true, skills, rootDir: SKILLS_ROOT };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skills-get', async (event, skillName) => {
  try {
    const skillDir = path.join(SKILLS_ROOT, skillName);
    const summary = await parseSkillMd(skillDir);
    if (!summary) return { success: false, error: 'SKILL.md nicht gefunden' };

    // Read first .md in prompts/
    let promptText = '';
    const promptsDir = path.join(skillDir, 'prompts');
    try {
      const files = (await fs.readdir(promptsDir)).filter(f => f.endsWith('.md'));
      if (files.length) promptText = await fs.readFile(path.join(promptsDir, files[0]), 'utf8');
    } catch { /* no prompts dir */ }

    // Read usage-guide.md if present
    let usageGuideText = '';
    try { usageGuideText = await fs.readFile(path.join(skillDir, 'usage-guide.md'), 'utf8'); } catch { /* none */ }

    return { success: true, skill: { ...summary, promptText, usageGuideText } };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skills-create', async (event, { name, description = '' }) => {
  try {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const skillDir = path.join(SKILLS_ROOT, slug);
    await fs.mkdir(path.join(skillDir, 'prompts'), { recursive: true });
    await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });
    const fm = `---\nname: ${slug}\ndescription: "${description}"\n---\n\n# ${name}\n`;
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), fm, 'utf8');
    await fs.writeFile(path.join(skillDir, 'prompts', 'default-prompts.md'), '', 'utf8');
    const summary = await parseSkillMd(skillDir);
    return { success: true, skill: summary };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skills-apply', async (event, { skillName }) => {
  return { success: true, mode: 'terminal-hint', terminalHint: `/${skillName}` };
});

// Cleanup PTY when app closes
app.on('before-quit', () => {
  closeTerminalLog();
  if (ptyProcess) {
    disposePtyListeners();
    ptyProcess.kill();
    ptyProcess = null;
    ptyWorkDir = null;
    setPtyForwardTarget(null);
  }
});
