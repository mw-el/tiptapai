const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { spawn, execSync } = require('child_process');

let pendingStartupOpenRequest = null;

// WeasyPrint binary path (hardcoded - FAIL FAST if wrong)
const weasyprintBin = path.join(os.homedir(), 'miniconda3', 'envs', 'weasyprint', 'bin', 'weasyprint');

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
    event.preventDefault(); // Prevent default close

    // Ask renderer if there are unsaved changes
    try {
      const hasUnsaved = await mainWindow.webContents.executeJavaScript(
        'window.editorState?.hasUnsavedChanges || false'
      );

      if (hasUnsaved) {
        // Show warning dialog
        const choice = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['Abbrechen', 'Ohne Speichern beenden', 'Speichern und beenden'],
          defaultId: 0,
          cancelId: 0,
          title: 'Ungespeicherte Änderungen',
          message: 'Das aktuelle Dokument enthält ungespeicherte Änderungen.',
          detail: 'Möchten Sie die Änderungen speichern, bevor Sie beenden?'
        });

        if (choice.response === 0) {
          // Cancel - don't close
          return;
        } else if (choice.response === 2) {
          // Save and quit
          await mainWindow.webContents.executeJavaScript('window.saveCurrentFile?.()');
          // Small delay to ensure save completes
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        // else: choice.response === 1 - Quit without saving
      }

      // Actually close the window
      mainWindow.destroy();
    } catch (err) {
      console.error('Error checking unsaved changes:', err);
      // If we can't check, just close
      mainWindow.destroy();
    }
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
  await startLanguageTool();
  createWindow();
});

app.on('window-all-closed', () => {
  // LanguageTool beenden
  if (languageToolProcess) {
    languageToolProcess.kill();
  }

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

    // For PDF files, use a dedicated PDF viewer instead of system default
    if (resolvedPath.toLowerCase().endsWith('.pdf')) {
      const pdfViewers = ['evince', 'okular', 'xdg-open'];

      for (const viewer of pdfViewers) {
        try {
          spawn(viewer, [resolvedPath], { detached: true, stdio: 'ignore' }).unref();
          console.log(`Opened PDF with ${viewer}: ${resolvedPath}`);
          return { success: true };
        } catch (e) {
          continue; // Try next viewer
        }
      }

      // Fallback if no viewer worked
      return { success: false, error: 'Kein PDF-Viewer gefunden (evince, okular)' };
    }

    // For non-PDF files, use default system handler
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

// ============================================================================
// Pandoc Export Integration
// ============================================================================

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Check if pandoc is installed
ipcMain.handle('pandoc-check', async () => {
  try {
    const { stdout } = await execFileAsync('pandoc', ['--version']);
    const version = stdout.split('\n')[0].replace('pandoc ', '');
    console.log('✓ Pandoc found:', version);
    return { installed: true, version };
  } catch (error) {
    console.warn('⚠ Pandoc not found');
    return { installed: false };
  }
});

// Check if Eisvogel template is installed
ipcMain.handle('pandoc-check-eisvogel', async () => {
  const templatePaths = [
    path.join(os.homedir(), '.local/share/pandoc/templates/Eisvogel.latex'),
    path.join(os.homedir(), '.pandoc/templates/Eisvogel.latex'),
  ];

  for (const templatePath of templatePaths) {
    try {
      await fs.access(templatePath);
      console.log('✓ Eisvogel template found:', templatePath);
      return { installed: true, path: templatePath };
    } catch {
      // Try next path
    }
  }

  console.warn('⚠ Eisvogel template not found');
  return { installed: false };
});

// Download Eisvogel template
ipcMain.handle('pandoc-install-eisvogel', async () => {
  const https = require('https');
  const templateDir = path.join(os.homedir(), '.local/share/pandoc/templates');
  const templatePath = path.join(templateDir, 'Eisvogel.latex');
  const url = 'https://raw.githubusercontent.com/Wandmalfarbe/pandoc-latex-template/master/eisvogel.latex';

  try {
    // Create template directory
    await fs.mkdir(templateDir, { recursive: true });

    // Download template
    const fileStream = require('fs').createWriteStream(templatePath);

    await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      }).on('error', reject);
    });

    console.log('✓ Eisvogel template installed:', templatePath);
    return { success: true, path: templatePath };
  } catch (error) {
    console.error('✗ Failed to install Eisvogel template:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// EPUB Helper Functions
// ============================================================================

/**
 * Escape XML special characters for SVG generation
 */
function escapeXml(text) {
  if (!text) return '';
  return text.toString().replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c]));
}

/**
 * Parse YAML frontmatter into object
 */
function parseYamlFrontmatter(yamlString) {
  const obj = {};
  yamlString.split('\n').forEach(line => {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      value = value.replace(/^["']|["']$/g, '');
      obj[key] = value;
    }
  });
  return obj;
}

/**
 * Generate EPUB cover image from frontmatter metadata
 */
/**
 * Split text into lines that fit within a character limit
 */
function wrapText(text, maxCharsPerLine = 20) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

async function generateEpubCover(targetDir, title, author, subtitle, baseFilename, forceRegenerate = false) {
  // Use baseFilename + "Cover.jpg" instead of generic "cover.jpg"
  const coverFilename = baseFilename ? `${baseFilename}Cover.jpg` : 'cover.jpg';
  const coverPath = path.join(targetDir, coverFilename);

  // If forceRegenerate is true, always generate new cover (auto-generation mode)
  // If false, reuse existing cover (manual cover-image mode)
  if (!forceRegenerate) {
    try {
      await fs.access(coverPath);
      console.log(`✓ Using existing ${coverFilename}`);
      return coverPath; // Use existing cover
    } catch {
      // Generate new cover
      console.log(`⚙ Generating ${coverFilename} from frontmatter...`);
    }
  } else {
    console.log(`⚙ Regenerating ${coverFilename} from frontmatter...`);
  }

  // Wrap title into multiple lines if needed
  // Reduced from 20 to 13 to prevent text clipping with 72px font
  const titleLines = wrapText(title.toUpperCase(), 13);
  const lineHeight = 80; // Line height for title
  const titleStartY = 450 - ((titleLines.length - 1) * lineHeight / 2); // Center vertically

  // Calculate dynamic line position below title
  const lineBottomY = titleStartY + (titleLines.length * lineHeight) + 20; // 20px below title

  // Generate title tspans
  const titleTspans = titleLines.map((line, i) =>
    `<tspan x="400" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n    ');

  // Create SVG with title and author
  const svgContent = `<svg width="800" height="1200" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1200" fill="#ff7b33"/>
  <text x="400" y="${titleStartY}" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle">
    ${titleTspans}
  </text>
  ${subtitle ? `<text x="400" y="620" font-family="Arial, sans-serif" font-size="48" fill="white" text-anchor="middle">
    <tspan x="400">${escapeXml(subtitle)}</tspan>
  </text>` : ''}
  ${author ? `<text x="400" y="1050" font-family="Arial, sans-serif" font-size="36" fill="white" text-anchor="middle">
    <tspan x="400">${escapeXml(author)}</tspan>
  </text>` : ''}
  <line x1="200" y1="${lineBottomY}" x2="600" y2="${lineBottomY}" stroke="white" stroke-width="3"/>
</svg>`;

  // Write SVG temporarily
  const svgPath = path.join(targetDir, 'cover-temp.svg');
  await fs.writeFile(svgPath, svgContent, 'utf-8');

  try {
    // Convert to JPG using ImageMagick
    await execFileAsync('convert', [
      svgPath,
      '-background', 'none',
      '-density', '150',
      coverPath
    ], { timeout: 10000 });

    console.log('✓ Generated cover.jpg');
  } catch (error) {
    console.warn('⚠ ImageMagick not available, falling back to SVG copy');
    // If ImageMagick is not available, just copy the SVG as fallback
    await fs.copyFile(svgPath, path.join(targetDir, 'cover.svg'));
  } finally {
    // Clean up temp SVG
    await fs.unlink(svgPath).catch(() => {});
  }

  return coverPath;
}

/**
 * Resolve EPUB resources (cover image) to absolute paths, or generate cover if missing
 */
async function resolveEpubResources(markdown, originalFilePath, tmpDir) {
  const originalDir = path.dirname(originalFilePath);
  const originalBasename = path.basename(originalFilePath, path.extname(originalFilePath));

  // Extract frontmatter
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) {
    console.log('ℹ No frontmatter found, skipping EPUB preprocessing');
    return { markdown, coverPath: null };
  }

  let frontmatter = frontmatterMatch[1];
  const frontmatterObj = parseYamlFrontmatter(frontmatter);

  // Determine cover filename based on markdown file
  const coverFilename = `${originalBasename}Cover.jpg`;

  // Check if cover-image exists
  let coverImagePath;
  if (frontmatterObj['cover-image']) {
    // Resolve existing relative path to absolute
    const relativePath = frontmatterObj['cover-image'];
    coverImagePath = path.resolve(originalDir, relativePath);
    console.log(`✓ Resolving cover-image: ${relativePath} → ${coverImagePath}`);
  } else {
    // Generate cover from metadata (always regenerate for auto-generation)
    const title = frontmatterObj.title || 'Untitled';
    const author = frontmatterObj.author || '';
    const subtitle = frontmatterObj.subtitle || '';

    console.log(`⚙ No cover-image in frontmatter, generating from metadata...`);
    coverImagePath = await generateEpubCover(originalDir, title, author, subtitle, originalBasename, true);
  }

  // Copy cover to tmp directory next to temporary markdown file
  // This ensures pandoc can find it with a simple relative path
  const tmpCoverPath = path.join(tmpDir, coverFilename);
  try {
    await fs.copyFile(coverImagePath, tmpCoverPath);
    console.log(`✓ Copied cover to: ${tmpCoverPath}`);
  } catch (error) {
    console.warn(`⚠ Could not copy cover image: ${error.message}`);
    return { markdown, coverPath: null };
  }

  // Update frontmatter with relative cover path (relative to tmp file)
  if (frontmatterObj['cover-image']) {
    // Replace existing cover-image with relative path
    frontmatter = frontmatter.replace(
      /^cover-image:\s*(.+)$/m,
      `cover-image: ${coverFilename}`
    );
  } else {
    // Add cover-image to frontmatter
    frontmatter += `\ncover-image: ${coverFilename}`;
  }

  // Reconstruct markdown with updated frontmatter
  const updatedMarkdown = markdown.replace(/^---\n[\s\S]*?\n---\n/, `---\n${frontmatter}\n---\n`);

  return { markdown: updatedMarkdown, coverPath: tmpCoverPath };
}

// ============================================================================
// Pandoc Export
// ============================================================================

// Export with Pandoc
ipcMain.handle('pandoc-export', async (event, options) => {
  // options: { markdown, outputPath, format, pandocArgs, stripFrontmatter, originalFilePath }
  try {
    // Check if pandoc exists
    try {
      await execFileAsync('which', ['pandoc']);
    } catch {
      return {
        success: false,
        error: 'Pandoc nicht installiert. Installiere mit: sudo apt install pandoc texlive-xetex'
      };
    }

    let markdown = options.markdown;

    // DEBUG: Log what we received
    console.log('=== PANDOC EXPORT DEBUG ===');
    console.log('Format:', options.format);
    console.log('Strip frontmatter?', options.stripFrontmatter);
    console.log('Original file path:', options.originalFilePath);
    console.log('Markdown length:', markdown.length);
    console.log('Markdown starts with:', markdown.substring(0, 300));
    console.log('Has frontmatter?', markdown.startsWith('---'));

    // Strip frontmatter if requested
    if (options.stripFrontmatter) {
      markdown = markdown.replace(/^---\n[\s\S]*?\n---\n\n?/, '');
      console.log('✓ Stripped frontmatter');
    }

    // Create temporary input file path
    const tmpInput = path.join(os.tmpdir(), `tiptap-export-${Date.now()}.md`);
    const tmpDir = path.dirname(tmpInput);
    let tmpCoverPath = null;

    // EPUB preprocessing: resolve cover-image or generate cover
    if (options.format === 'epub' && options.originalFilePath && !options.stripFrontmatter) {
      console.log('⚙ Starting EPUB preprocessing...');
      try {
        const result = await resolveEpubResources(markdown, options.originalFilePath, tmpDir);
        markdown = result.markdown;
        tmpCoverPath = result.coverPath;
        console.log('✓ EPUB preprocessing completed');
      } catch (error) {
        console.warn('✗ EPUB preprocessing failed:', error);
        // Continue with original markdown if preprocessing fails
      }
    } else {
      console.log('ℹ Skipping EPUB preprocessing (format or conditions not met)');
    }

    // Write temporary input file
    await fs.writeFile(tmpInput, markdown, 'utf-8');

    // Build pandoc arguments
    const args = [
      tmpInput,
      '-o', options.outputPath,
      ...(options.pandocArgs || [])
    ];

    console.log('📄 Pandoc export:', args.join(' '));

    // Execute pandoc
    // Set working directory to tmpDir so pandoc can find cover images with relative paths
    const { stdout, stderr } = await execFileAsync('pandoc', args, {
      timeout: 60000, // 60 seconds timeout
      cwd: tmpDir     // Working directory = /tmp (where cover images are)
    });

    // Cleanup temp files
    await fs.unlink(tmpInput);
    if (tmpCoverPath) {
      await fs.unlink(tmpCoverPath).catch(() => {});
    }

    if (stderr) {
      console.warn('Pandoc warnings:', stderr);
    }

    console.log('✓ Export successful:', options.outputPath);
    return { success: true, outputPath: options.outputPath };
  } catch (error) {
    console.error('✗ Pandoc export failed:', error);

    // Provide helpful error messages
    let errorMessage = error.message;

    if (error.message.includes('pdflatex') || error.message.includes('xelatex')) {
      errorMessage = 'LaTeX nicht gefunden. Installiere: sudo apt install texlive-xetex texlive-fonts-recommended texlive-latex-extra';
    } else if (error.message.includes('template')) {
      errorMessage = 'Template nicht gefunden. Bitte installiere das Eisvogel-Template.';
    }

    return { success: false, error: errorMessage };
  }
});

// ============================================================================
// Electron PDF Export (Template-based printToPDF)
// ============================================================================

ipcMain.handle('electron-pdf-export', async (event, options) => {
  // options: { assembledHtml, outputPath, baseUrl }
  let hiddenWin = null;
  let tmpHtml = null;

  try {
    // Write assembled HTML to temp file (needed for file:// loading with asset paths)
    tmpHtml = path.join(os.tmpdir(), `tiptap-handout-${Date.now()}.html`);
    await fs.writeFile(tmpHtml, options.assembledHtml, 'utf-8');

    // Create hidden BrowserWindow for rendering
    hiddenWin = new BrowserWindow({
      show: false,
      width: 794,  // A4 width at 96 DPI
      height: 1123, // A4 height at 96 DPI
      webPreferences: {
        offscreen: true,
        javascript: false,
      },
    });

    // Load the HTML file
    await hiddenWin.loadFile(tmpHtml);

    // Wait for fonts and images to load
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Print to PDF with A4 settings and page numbers in footer
    const pdfData = await hiddenWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="font-size:10pt; text-align:right; width:100%; padding-right:2.5cm; padding-bottom:0.5cm;">
          <span style="
            background:#FF7B33;
            color:white;
            padding:0.3cm 0.5cm;
            border-radius:2px;
            font-weight:500;
            display:inline-block;
          " class="pageNumber"></span>
        </div>
      `,
      marginType: 1, // No margins - use CSS @page margins instead
    });

    // Write PDF to output path
    await fs.writeFile(options.outputPath, pdfData);

    console.log('✓ Electron PDF export successful:', options.outputPath);
    return { success: true, outputPath: options.outputPath };
  } catch (error) {
    console.error('✗ Electron PDF export failed:', error);
    return { success: false, error: error.message };
  } finally {
    // Cleanup
    if (hiddenWin) {
      hiddenWin.close();
    }
    if (tmpHtml) {
      await fs.unlink(tmpHtml).catch(() => {});
    }
  }
});

// ============================================================================
// WeasyPrint PDF Export (for templates requiring full CSS support)
// ============================================================================

ipcMain.handle('weasyprint-export', async (event, { htmlContent, outputPath }) => {
  const tmpHtml = path.join(os.tmpdir(), `tiptap-wp-${Date.now()}.html`);

  try {
    // Write HTML to temp file
    await fs.writeFile(tmpHtml, htmlContent, 'utf-8');
    console.log('📄 Temp HTML written:', tmpHtml);

    // Spawn WeasyPrint (FAIL FAST if binary doesn't exist)
    await new Promise((resolve, reject) => {
      const proc = spawn(weasyprintBin, [
        tmpHtml,
        outputPath
      ]);

      let stderr = '';
      proc.stderr.on('data', chunk => stderr += chunk);

      proc.on('close', code => {
        if (code === 0) {
          console.log('✓ WeasyPrint export successful:', outputPath);
          resolve();
        } else {
          reject(new Error(`WeasyPrint failed (code ${code}):\n${stderr}`));
        }
      });

      proc.on('error', err => {
        reject(new Error(`Could not start WeasyPrint: ${err.message}`));
      });
    });

    return { success: true, outputPath: outputPath };
  } catch (error) {
    console.error('✗ WeasyPrint export failed:', error);
    throw error;
  } finally {
    // ALWAYS clean up temp file
    try {
      await fs.unlink(tmpHtml);
    } catch (e) {
      console.warn('Could not delete temp file:', tmpHtml);
    }
  }
});

ipcMain.handle('read-template-files', async (event, templateId) => {
  try {
    const templateDir = path.join(__dirname, 'templates', templateId);
    const templateHtml = await fs.readFile(path.join(templateDir, 'template.html'), 'utf-8');
    const templateCss = await fs.readFile(path.join(templateDir, 'style.css'), 'utf-8');
    const metaJson = JSON.parse(await fs.readFile(path.join(templateDir, 'meta.json'), 'utf-8'));

    return { success: true, html: templateHtml, css: templateCss, meta: metaJson, templateDir };
  } catch (error) {
    return { success: false, error: `Template "${templateId}" nicht gefunden: ${error.message}` };
  }
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: options.title || 'Datei auswählen',
    defaultPath: options.defaultPath || os.homedir(),
    filters: options.filters || [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }
  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('pandoc-to-html', async (event, markdown) => {
  try {
    const tmpInput = path.join(os.tmpdir(), `tiptap-md2html-${Date.now()}.md`);
    await fs.writeFile(tmpInput, markdown, 'utf-8');

    const { stdout } = await execFileAsync('pandoc', [tmpInput, '-f', 'markdown+raw_html', '-t', 'html', '--no-highlight'], {
      timeout: 30000,
    });

    await fs.unlink(tmpInput);
    return { success: true, html: stdout };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Claude Code Integration - Phase 1
// ============================================================================

const SKILLS_ROOT_DIR = path.join(__dirname, 'skills');
const CLAUDE_AUTO_ROOT_DIR = path.join(os.homedir(), '_AA_ClaudeAuto');
const CLAUDE_AUTO_START_SCRIPT = path.join(CLAUDE_AUTO_ROOT_DIR, 'claude-auto-start.sh');
const CLAUDE_AUTO_DROP_DIR = path.join(os.homedir(), '.config', 'aa-claudeauto', 'refinement-drop');
const CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG = 'rechtschreibung-grosse-dokumente';
const CLAUDE_AUTO_SPELLCHECK_SKILL_DIR = path.join(
  CLAUDE_AUTO_ROOT_DIR,
  'skills',
  CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG
);
const CLAUDE_AUTO_SPELLCHECK_SKILL_FILE = path.join(CLAUDE_AUTO_SPELLCHECK_SKILL_DIR, 'SKILL.md');

function toSkillSlug(rawName) {
  const slug = String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return '';
  }

  return slug;
}

function assertSafeSkillSlug(rawName) {
  const slug = toSkillSlug(rawName);
  if (!slug) {
    throw new Error('Ungueltiger Skill-Name. Erlaubt: a-z, 0-9 und Bindestrich.');
  }
  return slug;
}

async function ensureSkillsRoot() {
  await fs.mkdir(SKILLS_ROOT_DIR, { recursive: true });
  return SKILLS_ROOT_DIR;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function extractFrontmatterField(markdownText, fieldName) {
  if (typeof markdownText !== 'string' || !markdownText.startsWith('---')) {
    return '';
  }

  const end = markdownText.indexOf('\n---', 3);
  if (end === -1) {
    return '';
  }

  const frontmatter = markdownText.slice(0, end + 4);
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = frontmatter.match(new RegExp(`^\\s*${escapedField}:\\s*(.+)\\s*$`, 'm'));
  if (!match) return '';

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

async function safeReadFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function listDirectoryFileNames(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function readSkillSummary(skillSlug) {
  const slug = assertSafeSkillSlug(skillSlug);
  const skillDir = path.join(SKILLS_ROOT_DIR, slug);
  const stat = await fs.stat(skillDir);
  if (!stat.isDirectory()) {
    throw new Error(`Skill ist kein Verzeichnis: ${slug}`);
  }

  const skillFilePath = path.join(skillDir, 'SKILL.md');
  const promptsDir = path.join(skillDir, 'prompts');
  const referencesDir = path.join(skillDir, 'references');
  const scriptsDir = path.join(skillDir, 'scripts');
  const usageGuidePath = path.join(referencesDir, 'usage-guide.md');

  const skillText = await safeReadFile(skillFilePath);
  const frontmatterName = extractFrontmatterField(skillText, 'name');
  const frontmatterDescription = extractFrontmatterField(skillText, 'description');
  const promptFiles = (await listDirectoryFileNames(promptsDir))
    .filter((name) => name.toLowerCase().endsWith('.md'));
  const scriptFiles = await listDirectoryFileNames(scriptsDir);

  return {
    slug,
    name: frontmatterName || slug,
    description: frontmatterDescription || '',
    path: skillDir,
    skillFilePath,
    promptsDir,
    referencesDir,
    scriptsDir,
    promptFiles,
    scriptFiles,
    hasUsageGuide: await pathExists(usageGuidePath),
    usageGuidePath,
  };
}

async function listSkillsInternal() {
  await ensureSkillsRoot();
  const entries = await fs.readdir(SKILLS_ROOT_DIR, { withFileTypes: true });
  const skillDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((dirName) => /^[a-z0-9][a-z0-9-]*$/.test(dirName))
    .sort((a, b) => a.localeCompare(b));

  const summaries = [];
  for (const slug of skillDirs) {
    try {
      summaries.push(await readSkillSummary(slug));
    } catch (error) {
      console.warn(`Skipping invalid skill directory '${slug}':`, error.message);
    }
  }
  return summaries;
}

async function createSkillInternal(payload = {}) {
  const requestedName = String(payload?.name || '').trim();
  if (!requestedName) {
    throw new Error('Bitte einen Skill-Namen angeben.');
  }

  const skillSlug = assertSafeSkillSlug(requestedName);
  const description = String(payload?.description || '').trim();
  const safeDescription = description || `Reusable workflow for ${skillSlug}`;

  await ensureSkillsRoot();

  const skillDir = path.join(SKILLS_ROOT_DIR, skillSlug);
  if (await pathExists(skillDir)) {
    throw new Error(`Skill existiert bereits: ${skillSlug}`);
  }

  const promptsDir = path.join(skillDir, 'prompts');
  const referencesDir = path.join(skillDir, 'references');
  const scriptsDir = path.join(skillDir, 'scripts');
  const assetsDir = path.join(skillDir, 'assets');

  await fs.mkdir(promptsDir, { recursive: true });
  await fs.mkdir(referencesDir, { recursive: true });
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const promptPath = path.join(promptsDir, 'default-prompts.md');
  const usageGuidePath = path.join(referencesDir, 'usage-guide.md');
  const scriptPath = path.join(scriptsDir, 'run.sh');

  const skillMd = `---
name: ${skillSlug}
description: "${safeDescription}"
---

# ${skillSlug}

## Ziel
Beschreibe hier das Ergebnis, das dieser Skill liefern soll.

## Trigger
- Wenn der User genau diesen Workflow wiederholt braucht.
- Wenn Prompt, Vorgehen und Skript gemeinsam verwendet werden sollen.

## Workflow
1. Lies zuerst \`prompts/default-prompts.md\`.
2. Befolge dann die Schritte in \`references/usage-guide.md\`.
3. Fuehre bei Bedarf Skripte aus \`scripts/\` aus.

## Ressourcen
- Prompts: \`prompts/default-prompts.md\`
- Vorgehensweise: \`references/usage-guide.md\`
- Skripte: \`scripts/run.sh\`
`;

  const promptMd = `# Prompt-Bausteine fuer ${skillSlug}

## Start-Prompt
Nimm die Rolle dieses Skills ein und arbeite die Aufgabe Schritt fuer Schritt ab.

## Analyse-Prompt
Analysiere den aktuellen Text und nenne nur die relevanten Aenderungen.

## Output-Prompt
Gib das Ergebnis als direkt einsetzbaren Text aus, ohne Zusatzkommentar.
`;

  const usageGuideMd = `# Usage Guide - ${skillSlug}

## Vorbereitung
1. Ziel und Kontext der Aufgabe klar benennen.
2. Falls noetig relevante Dateien in den Kontext laden.

## Ausfuehrung
1. Prompt-Baustein aus \`prompts/default-prompts.md\` verwenden.
2. Falls deterministisch sinnvoll, \`scripts/run.sh\` ausfuehren oder anpassen.
3. Ergebnis pruefen und kurz validieren.

## Abschluss
1. Ergebnis uebernehmen.
2. Verbesserungen direkt in die Skill-Dateien zurueckschreiben.
`;

  const scriptContent = `#!/usr/bin/env bash
set -euo pipefail

echo "[skill:${skillSlug}] Implement your reusable automation here."
`;

  await fs.writeFile(skillMdPath, skillMd, 'utf-8');
  await fs.writeFile(promptPath, promptMd, 'utf-8');
  await fs.writeFile(usageGuidePath, usageGuideMd, 'utf-8');
  await fs.writeFile(scriptPath, scriptContent, 'utf-8');
  await fs.chmod(scriptPath, 0o755);

  return readSkillSummary(skillSlug);
}

function buildTerminalSkillHint(summary, promptFilePath = '', usageGuidePath = '') {
  const lines = [
    'Bitte nutze fuer die naechste Aufgabe diesen Skill:',
    `- SKILL.md: ${summary.skillFilePath || summary.path || '-'}`,
  ];

  if (promptFilePath) {
    lines.push(`- Prompt-Bausteine: ${promptFilePath}`);
  }
  if (usageGuidePath) {
    lines.push(`- Vorgehensweise: ${usageGuidePath}`);
  }

  lines.push('Lies die Dateien und bestaetige kurz, dass du den Skill-Kontext uebernommen hast.');
  return lines.join('\n');
}

function buildClaudeAutoSpellcheckTaskPrompt({
  filePath,
  reportPath,
  correctedPath,
  checkpointPath,
  partialFindingsPath,
  findingsLedgerPath,
  dictionaryPath,
  skillFilePath,
  promptFilePath,
  usageGuidePath,
  reportSchemaPath,
  dictionarySchemaPath,
}) {
  return `MODELL: haiku
TITEL: Rechtschreibung grosse Dokumente - ${path.basename(filePath)}
AUSFUEHRUNG: stepwise
KRITERIUM: Kompletter Dokument-Durchlauf in Slices abgeschlossen, Report + korrigierte Datei geschrieben.

Nutze fuer diesen Task zwingend den Skill:
- ${skillFilePath}
- ${promptFilePath}
- ${usageGuidePath}
- ${reportSchemaPath}
- ${dictionarySchemaPath}

Zu pruefende Datei:
- ${filePath}

Verbindliche Arbeitsweise (aus den bestehenden Spell-Audit-Prinzipien):
1. Ein Agent, sequenziell, keine Subagents, keine Parallel-Batches.
2. Scheibchenweise Review statt Volltext-Umbruch.
3. Bei langen Laeufen ohne Nachfragen autonom fortsetzen (Continue/Reset robust).
4. Keine Methodenwechsel ohne klaren Blocker.
5. Regex/Pattern nur als Helfer, finaler Entscheid aus dem gelesenen Text.

Inhaltliche Regeln:
1. Dokument in Slices von ca. 900 bis 1200 Woertern verarbeiten.
2. Pro Slice nur Rechtschreibung, Grammatik und Interpunktion korrigieren.
3. Keine stilistische Umformulierung ausser zur Korrektur zwingend noetig.
4. Schweizer Schreibweise bevorzugen (ss statt scharfem s), sofern deutschsprachig.
5. Dateinamen/Pfade in Links niemals als Rechtschreibfehler behandeln.
6. Nach jedem Slice Zwischenergebnis sofort in Dateien persistieren.
7. Vor jeder Korrektur Didaktik-Pruefung machen: apply oder keep_example.
8. Wenn der Text erklaerend ueber Schreibweisen/Zeichen spricht, Beispiele nicht automatisch normalisieren.
9. Das Zeichen ß, Minus/Gedankenstrich oder Anfuehrungszeichen/Guillemets nur ersetzen, wenn sie nicht selbst Gegenstand der Erklaerung sind.
10. Bei erkannten Lehrbeispielen Original im korrigierten Text beibehalten und im Report mit Grund markieren.

Artefakte (checkpoint-faehig, script-freundlich):
- Report: ${reportPath}
- Korrigierte Fassung: ${correctedPath}
- Checkpoint Index: ${checkpointPath}
- Partial Findings JSONL: ${partialFindingsPath}
- Findings Ledger CSV: ${findingsLedgerPath}
- False-Positive Dictionary: ${dictionaryPath}

Report-Format (streng):
- Progress Index mit Status je Slice oder Abschnitt (pending / checked).
- Nummerierte Findings mit stabilen IDs (001, 002, ...).
- Human-Table + machine-readable JSON-Block.
- Findings-Ledger CSV laufend synchron halten.
- Fuer jeden Befund decision (apply oder keep_example) sowie Didaktik-Kontext ausweisen.

Wichtig fuer lange Laeufe:
- Wenn ein Reset oder Continue passiert, ab letzter fertig verarbeiteter Slice weiterarbeiten.
- Keine Slice doppelt zaehlen.
- Bei Unsicherheit lieber confidence low markieren statt aggressiv korrigieren.
`;
}

function isClaudeAutoLikelyRunning() {
  try {
    const output = execSync('pgrep -af "_AA_ClaudeAuto"', { encoding: 'utf-8' });
    return output
      .split('\n')
      .some((line) => /electron|claude-auto-start\.sh|start:desktop|_AA_ClaudeAuto/.test(line));
  } catch {
    return false;
  }
}

async function ensureClaudeAutoSpellcheckSkillFiles() {
  const fallbackFiles = [
    {
      relativePath: 'SKILL.md',
      content: `---
name: ${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}
description: "Delegated, slice-based spelling and grammar pass for large Markdown documents with checkpoint/resume artifacts."
---

# ${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}

## Ziel
Grosses Markdown-Dokument scheibchenweise auf Rechtschreibung, Grammatik und Interpunktion pruefen und lauffaehig ueber Continue/Reset halten.

## Regeln
- Single-Agent, sequenziell, keine Subagents.
- Keine Methodenwechsel ohne echten Blocker.
- Keine Dateipfad-Korrekturen in Links.
- Keine freie Stil-Umarbeitung ausser fuer klare Korrektur.
- Didaktische Beispielstellen (Erklaertexte) nicht wegkorrigieren.

## Ressourcen
- prompts/default-prompts.md
- references/usage-guide.md
- references/report-schema.md
- references/dictionary-schema.md
- scripts/run.sh
`,
    },
    {
      relativePath: path.join('prompts', 'default-prompts.md'),
      content: `# Prompt-Bausteine: ${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}

## Slice-Check
Pruefe die aktuelle Slice auf Rechtschreibung, Grammatik und Interpunktion.
Lehrbeispiele und metasprachliche Zeichen-Erklaerungen mit decision=keep_example erhalten.

## Persistenz
Aktualisiere nach jeder Slice:
- rescan-index.json
- findings-rescan.partial.jsonl
- findings-ledger.csv
- korrigierte Zieldatei
`,
    },
    {
      relativePath: path.join('references', 'usage-guide.md'),
      content: `# Usage Guide: ${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}

## Workflow
1. Quelldatei in Slices aufteilen.
2. Jede Slice sequenziell pruefen.
3. Vor jeder Aenderung Didaktik-Kontext pruefen (apply/keep_example).
4. Nach jeder Slice Checkpoint-Artefakte synchronisieren.
5. Bei Unterbruch vom letzten validen Checkpoint fortsetzen.
`,
    },
    {
      relativePath: path.join('references', 'report-schema.md'),
      content: `# Report Schema: ${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}

## Pflicht
- Progress Index
- Numbered Findings
- JSON Findings Block
- Synchron mit findings-ledger.csv
- Entscheidung pro Befund: apply oder keep_example
`,
    },
    {
      relativePath: path.join('references', 'dictionary-schema.md'),
      content: `# Dictionary Schema: ${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}

## Zweck
Wiederkehrende False Positives kontrolliert unterdruecken.

## Minimalfeld
- id
- status
- match
- action
- provenance
- optional: didactic_keep_rules fuer absichtliche Beispielschreibungen
`,
    },
    {
      relativePath: path.join('scripts', 'run.sh'),
      content: `#!/usr/bin/env bash
set -euo pipefail

echo "[${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}] Skill workflow is orchestrated by ClaudeAuto queue tasks."
`,
      chmod: 0o755,
    },
  ];

  const sourceSkillRoot = path.join(SKILLS_ROOT_DIR, CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG);

  for (const file of fallbackFiles) {
    const sourcePath = path.join(sourceSkillRoot, file.relativePath);
    const targetPath = path.join(CLAUDE_AUTO_SPELLCHECK_SKILL_DIR, file.relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (await pathExists(sourcePath)) {
      await fs.copyFile(sourcePath, targetPath);
    } else {
      await fs.writeFile(targetPath, file.content, 'utf-8');
    }

    if (file.chmod) {
      await fs.chmod(targetPath, file.chmod);
    }
  }
}

async function enqueueSpellcheckTaskForClaudeAuto(filePath) {
  if (!filePath) {
    throw new Error('Keine aktive Datei zum Pruefen gefunden.');
  }

  const resolvedFilePath = path.resolve(String(filePath));
  const stat = await fs.stat(resolvedFilePath);
  if (!stat.isFile()) {
    throw new Error('Aktive Datei ist ungueltig.');
  }

  await ensureClaudeAutoSpellcheckSkillFiles();
  await fs.mkdir(CLAUDE_AUTO_DROP_DIR, { recursive: true });

  const fileBaseName = path.basename(resolvedFilePath, path.extname(resolvedFilePath));
  const safeFileBase = fileBaseName
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'document';
  const artifactRoot = path.join(path.dirname(resolvedFilePath), 'aa-claudeauto', 'spell-audit', safeFileBase);
  await fs.mkdir(artifactRoot, { recursive: true });

  const reportPath = path.join(artifactRoot, `${safeFileBase}__spell-audit-report.md`);
  const correctedPath = path.join(artifactRoot, `${safeFileBase}__spellchecked.md`);
  const checkpointPath = path.join(artifactRoot, 'rescan-index.json');
  const partialFindingsPath = path.join(artifactRoot, 'findings-rescan.partial.jsonl');
  const findingsLedgerPath = path.join(artifactRoot, 'findings-ledger.csv');
  const dictionaryPath = path.join(artifactRoot, 'dictionary.json');
  const promptFilePath = path.join(CLAUDE_AUTO_SPELLCHECK_SKILL_DIR, 'prompts', 'default-prompts.md');
  const usageGuidePath = path.join(CLAUDE_AUTO_SPELLCHECK_SKILL_DIR, 'references', 'usage-guide.md');
  const reportSchemaPath = path.join(CLAUDE_AUTO_SPELLCHECK_SKILL_DIR, 'references', 'report-schema.md');
  const dictionarySchemaPath = path.join(CLAUDE_AUTO_SPELLCHECK_SKILL_DIR, 'references', 'dictionary-schema.md');

  const prompt = buildClaudeAutoSpellcheckTaskPrompt({
    filePath: resolvedFilePath,
    reportPath,
    correctedPath,
    checkpointPath,
    partialFindingsPath,
    findingsLedgerPath,
    dictionaryPath,
    skillFilePath: CLAUDE_AUTO_SPELLCHECK_SKILL_FILE,
    promptFilePath,
    usageGuidePath,
    reportSchemaPath,
    dictionarySchemaPath,
  });

  const taskFileName = `task-${Date.now()}-${CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG}.task`;
  const taskFilePath = path.join(CLAUDE_AUTO_DROP_DIR, taskFileName);
  await fs.writeFile(taskFilePath, prompt, 'utf-8');

  let launchedClaudeAuto = false;
  if (!isClaudeAutoLikelyRunning() && await pathExists(CLAUDE_AUTO_START_SCRIPT)) {
    spawn('/bin/bash', [CLAUDE_AUTO_START_SCRIPT], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    launchedClaudeAuto = true;
  }

  return {
    taskFilePath,
    artifactRoot,
    reportPath,
    correctedPath,
    checkpointPath,
    partialFindingsPath,
    findingsLedgerPath,
    dictionaryPath,
    launchedClaudeAuto,
    claudeAutoRoot: CLAUDE_AUTO_ROOT_DIR,
  };
}

ipcMain.handle('skills-list', async () => {
  try {
    const skills = await listSkillsInternal();
    return { success: true, skills, rootDir: SKILLS_ROOT_DIR };
  } catch (error) {
    console.error('Error listing skills:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('skills-get', async (_event, skillName) => {
  try {
    const summary = await readSkillSummary(skillName);
    const promptFileName = summary.promptFiles[0] || '';
    const promptFilePath = promptFileName
      ? path.join(summary.promptsDir, promptFileName)
      : '';

    const skillText = await safeReadFile(summary.skillFilePath);
    const promptText = promptFilePath ? await safeReadFile(promptFilePath) : '';
    const usageGuideText = await safeReadFile(summary.usageGuidePath);

    return {
      success: true,
      skill: {
        ...summary,
        skillText,
        promptFilePath,
        promptText,
        usageGuideText,
      },
    };
  } catch (error) {
    console.error('Error reading skill:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('skills-create', async (_event, payload = {}) => {
  try {
    const skill = await createSkillInternal(payload);
    return { success: true, skill };
  } catch (error) {
    console.error('Error creating skill:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('skills-get-root', async () => {
  try {
    await ensureSkillsRoot();
    return { success: true, rootDir: SKILLS_ROOT_DIR };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('skills-apply', async (_event, payload = {}) => {
  try {
    const skillSlug = assertSafeSkillSlug(payload.skillName || payload.slug || '');
    const summary = await readSkillSummary(skillSlug);
    const promptFileName = summary.promptFiles[0] || '';
    const promptFilePath = promptFileName
      ? path.join(summary.promptsDir, promptFileName)
      : '';

    if (skillSlug === CLAUDE_AUTO_SPELLCHECK_SKILL_SLUG) {
      const filePath = String(payload.filePath || '').trim();
      const dispatchResult = await enqueueSpellcheckTaskForClaudeAuto(filePath);
      return {
        success: true,
        mode: 'claudeauto-delegated',
        skill: summary,
        ...dispatchResult,
      };
    }

    const terminalHint = buildTerminalSkillHint(summary, promptFilePath, summary.usageGuidePath);
    return {
      success: true,
      mode: 'terminal-hint',
      skill: summary,
      terminalHint,
    };
  } catch (error) {
    console.error('Error applying skill:', error);
    return { success: false, error: error.message };
  }
});

function toSafeClaudeModelId(rawModel) {
  const candidate = String(rawModel || '').trim();
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate)) {
    return candidate;
  }
  return '';
}

function sanitizeClaudeModel(rawModel, fallback = 'haiku') {
  const safeCandidate = toSafeClaudeModelId(rawModel);
  if (safeCandidate) {
    return safeCandidate;
  }

  const safeFallback = toSafeClaudeModelId(fallback);
  if (safeFallback) {
    return safeFallback;
  }

  return 'haiku';
}

const CLAUDE_DEFAULT_MODEL = sanitizeClaudeModel(process.env.TIPTAP_CLAUDE_MODEL || 'haiku');
const CLAUDE_MODEL_FALLBACK_LIST = [
  { id: 'haiku', label: 'Haiku (Alias, schnell und guenstig)' },
  { id: 'sonnet', label: 'Sonnet (Alias, ausgewogen)' },
  { id: 'opus', label: 'Opus (Alias, maximale Qualitaet)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Alias)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (2025-10-01)' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Alias)' },
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (2025-09-29)' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5 (Alias)' },
  { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (2025-11-01)' },
  { id: 'claude-opus-4-1', label: 'Claude Opus 4.1 (Alias)' },
  { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1 (2025-08-05)' },
  { id: 'claude-opus-4', label: 'Claude Opus 4 (Alias)' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4 (2025-05-14)' },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4 (Alias)' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (2025-05-14)' },
  { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet (Latest Alias)' },
  { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (2025-02-19)' },
  { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet (Latest Alias)' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (2024-10-22)' },
  { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (2024-06-20)' },
  { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Latest Alias)' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (2024-10-22)' },
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus (2024-02-29)' },
  { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (2024-03-07)' },
];

function dedupeClaudeModels(models) {
  const unique = [];
  const seen = new Set();

  for (const model of models || []) {
    const id = toSafeClaudeModelId(model?.id || '');
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    unique.push({
      id,
      label: String(model?.label || id).trim() || id,
    });
  }

  if (!seen.has(CLAUDE_DEFAULT_MODEL)) {
    unique.unshift({
      id: CLAUDE_DEFAULT_MODEL,
      label: `${CLAUDE_DEFAULT_MODEL} (Default)`,
    });
  }

  return unique;
}

async function fetchClaudeModelsFromAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY || typeof fetch !== 'function') {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const apiModels = Array.isArray(payload?.data) ? payload.data : [];
    if (!apiModels.length) {
      return null;
    }

    return apiModels
      .map((entry) => {
        const id = toSafeClaudeModelId(entry?.id || '');
        if (!id) return null;
        const display = String(entry?.display_name || '').trim();
        return {
          id,
          label: display ? `${display} (${id})` : id,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.warn('Could not fetch model list from Anthropic API:', error.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

ipcMain.handle('claude-list-models', async () => {
  try {
    const apiModels = await fetchClaudeModelsFromAnthropic();
    const source = apiModels ? 'anthropic-api' : 'fallback';
    const models = dedupeClaudeModels([...(apiModels || []), ...CLAUDE_MODEL_FALLBACK_LIST]);
    return { success: true, models, source, defaultModel: CLAUDE_DEFAULT_MODEL };
  } catch (error) {
    console.error('Error listing Claude models:', error);
    const models = dedupeClaudeModels(CLAUDE_MODEL_FALLBACK_LIST);
    return { success: true, models, source: 'fallback', defaultModel: CLAUDE_DEFAULT_MODEL };
  }
});

// Write Claude context files
ipcMain.handle('claude-write-context', async (event, contextDir, files) => {
  try {
    // Erstelle Kontext-Verzeichnis
    await fs.mkdir(contextDir, { recursive: true });

    // Erstelle .claude Unterverzeichnis falls nötig
    const claudeDir = path.join(contextDir, '.claude');
    await fs.mkdir(claudeDir, { recursive: true });

    // Schreibe alle Dateien
    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(contextDir, fileName);
      // Stelle sicher dass Unterverzeichnisse existieren
      const fileDir = path.dirname(filePath);
      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    }

    console.log(`✅ Claude context written to: ${contextDir}`);
    return { success: true, contextDir };
  } catch (error) {
    console.error('Error writing Claude context:', error);
    return { success: false, error: error.message };
  }
});

// Open Claude terminal in context directory
ipcMain.handle('claude-open-terminal', async (event, workDir, model) => {
  try {
    const selectedModel = sanitizeClaudeModel(model, CLAUDE_DEFAULT_MODEL);

    // Prüfe ob claude command existiert
    let claudeExists = false;
    try {
      execSync('which claude', { encoding: 'utf-8' });
      claudeExists = true;
    } catch {
      claudeExists = false;
    }

    if (!claudeExists) {
      // Fallback: Öffne normales Terminal
      console.warn('Claude CLI not found, opening regular terminal');
      spawn('gnome-terminal', ['--working-directory', workDir], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return { success: true, warning: 'Claude CLI nicht gefunden, normales Terminal geöffnet' };
    }

    // Hilfetext der vor Claude angezeigt wird (spart Tokens)
    const helpText = [
      'echo "════════════════════════════════════════════════════════════════"',
      'echo "🤖 TipTap AI - Claude Code Terminal"',
      'echo "════════════════════════════════════════════════════════════════"',
      'echo ""',
      'echo "📄 Dein Dokument ist in CLAUDE.md beschrieben."',
      'echo "📝 Absätze sind nummeriert: §1, §2, ... (siehe document-numbered.txt)"',
      `echo "🤖 Aktives Modell: ${selectedModel}"`,
      'echo ""',
      'echo "💡 BEISPIEL-PROMPTS:"',
      'echo "   • Zeige §5"',
      'echo "   • Formuliere §3 kürzer"',
      'echo "   • Korrigiere Grammatik in §12"',
      'echo "   • Ergebnis in Zwischenablage"',
      'echo ""',
      'echo "📋 WORKFLOW: Text überarbeiten → In Zwischenablage → Ctrl+V im Editor"',
      'echo "════════════════════════════════════════════════════════════════"',
      'echo ""',
    ].join(' && ');

    // Öffne gnome-terminal mit claude
    spawn('gnome-terminal', [
      '--working-directory', workDir,
      '--', 'bash', '-c',
      `${helpText} && claude --model ${selectedModel}; exec bash`
    ], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    console.log(`✅ Claude terminal opened in: ${workDir} (model: ${selectedModel})`);
    return { success: true, model: selectedModel };
  } catch (error) {
    console.error('Error opening Claude terminal:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// File Watcher - Erkennt externe Änderungen an der aktuellen Datei
// ============================================================================

const fsSync = require('fs');
let currentFileWatcher = null;
let lastFileContent = null;
let watchedFilePath = null;

async function readFileContentWithRetry(filePath, attempts = 3, delayMs = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT' && attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
  return null;
}

function notifyExternalChange(filePath) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('file-changed-externally', filePath);
  }
}

async function handleFileContentChange(filePath) {
  try {
    const newContent = await readFileContentWithRetry(filePath);

    if (newContent === null) {
      return;
    }

    if (newContent !== lastFileContent) {
      lastFileContent = newContent;
      console.log(`📝 File changed externally: ${filePath}`);
      notifyExternalChange(filePath);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (lastFileContent !== null) {
        lastFileContent = null;
        console.log(`📝 File missing or replaced: ${filePath}`);
        notifyExternalChange(filePath);
      }
      return;
    }
    console.error('Error reading changed file:', err);
  }
}

async function startFileWatcher(filePath) {
  if (currentFileWatcher) {
    currentFileWatcher.close();
    currentFileWatcher = null;
  }

  if (!filePath) {
    watchedFilePath = null;
    lastFileContent = null;
    return { success: true, message: 'Watcher stopped' };
  }

  watchedFilePath = filePath;
  lastFileContent = await readFileContentWithRetry(filePath);

  currentFileWatcher = fsSync.watch(filePath, { persistent: false }, (eventType) => {
    if (!watchedFilePath || watchedFilePath !== filePath) {
      return;
    }

    if (eventType === 'rename') {
      console.log(`🔁 File rename detected: ${filePath}`);
      handleFileContentChange(filePath);
      setTimeout(() => {
        if (watchedFilePath === filePath) {
          startFileWatcher(filePath).catch((error) => {
            console.error('Error restarting file watcher:', error);
          });
        }
      }, 200);
      return;
    }

    if (eventType === 'change') {
      handleFileContentChange(filePath);
    }
  });

  console.log(`👁️ Watching file: ${filePath}`);
  return { success: true };
}

// Start watching a file for external changes
ipcMain.handle('watch-file', async (event, filePath) => {
  try {
    return await startFileWatcher(filePath);
  } catch (error) {
    console.error('Error setting up file watcher:', error);
    return { success: false, error: error.message };
  }
});

// Stop watching
ipcMain.handle('unwatch-file', async () => {
  if (currentFileWatcher) {
    currentFileWatcher.close();
    currentFileWatcher = null;
    watchedFilePath = null;
    lastFileContent = null;
    console.log('👁️ File watcher stopped');
  }
  return { success: true };
});

// ============================================================================ 
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
      env: { ...process.env },
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

    const shell = process.env.SHELL || '/bin/bash';
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
    disposePtyListeners();
    ptyDataDisposable = ptyProcess.onData((data) => {
      // Log output
      logTerminal('output', data);

      forwardToRenderer('pty-data', data);
    });

    ptyExitDisposable = ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`🖥️ PTY exited (code: ${exitCode}, signal: ${signal})`);
      logTerminalDebug('PTY exited', { exitCode, signal });
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
