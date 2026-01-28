const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { spawn } = require('child_process');

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

  // Handle command-line file opening (double-click .md files in file manager)
  // Check IMMEDIATELY - before renderer even loads
  const args = process.argv.slice(2);
  console.log('🚀 App started with command line arguments:', args);

  // Find .md files in arguments
  const mdFiles = args.filter(arg => {
    // Filter out flags (starting with -)
    if (arg.startsWith('-')) return false;
    // Check if it's a .md file
    return arg.endsWith('.md');
  });

  if (mdFiles.length > 0) {
    const fileToOpen = mdFiles[0]; // Open first .md file
    console.log('📂 CLI FILE TO OPEN:', fileToOpen);

    // Send to renderer process IMMEDIATELY after load, with small delay
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('🌐 Renderer loaded, sending CLI file:', fileToOpen);

      // Send with small delay to ensure renderer is ready
      setTimeout(() => {
        mainWindow.webContents.send('open-file-from-cli', fileToOpen);
        console.log('✅ CLI file event sent to renderer');
      }, 100);
    });
  } else {
    console.log('ℹ️  No .md files in command line arguments');
  }

  return mainWindow;
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
    await fs.writeFile(filePath, content, 'utf-8');
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
    return { success: true, files, currentDir: dirPath };
  } catch (error) {
    console.error(`Error reading directory: ${dirPath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-in-system', async (event, targetPath) => {
  try {
    const resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.join(__dirname, targetPath);
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

// Export with Pandoc
ipcMain.handle('pandoc-export', async (event, options) => {
  // options: { markdown, outputPath, format, pandocArgs, stripFrontmatter }
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

    // Strip frontmatter if requested
    if (options.stripFrontmatter) {
      markdown = markdown.replace(/^---\n[\s\S]*?\n---\n\n?/, '');
    }

    // Create temporary input file
    const tmpInput = path.join(os.tmpdir(), `tiptap-export-${Date.now()}.md`);
    await fs.writeFile(tmpInput, markdown, 'utf-8');

    // Build pandoc arguments
    const args = [
      tmpInput,
      '-o', options.outputPath,
      ...(options.pandocArgs || [])
    ];

    console.log('📄 Pandoc export:', args.join(' '));

    // Execute pandoc
    const { stdout, stderr } = await execFileAsync('pandoc', args, {
      timeout: 60000 // 60 seconds timeout
    });

    // Cleanup temp file
    await fs.unlink(tmpInput);

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
// Claude Code Integration - Phase 1
// ============================================================================

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
ipcMain.handle('claude-open-terminal', async (event, workDir) => {
  try {
    // Prüfe ob claude command existiert
    const { execSync } = require('child_process');
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
      helpText + ' && claude; exec bash'
    ], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    console.log(`✅ Claude terminal opened in: ${workDir}`);
    return { success: true };
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

// Start watching a file for external changes
ipcMain.handle('watch-file', async (event, filePath) => {
  try {
    // Stop existing watcher
    if (currentFileWatcher) {
      currentFileWatcher.close();
      currentFileWatcher = null;
    }

    if (!filePath) {
      return { success: true, message: 'Watcher stopped' };
    }

    watchedFilePath = filePath;

    // Read initial content for comparison
    lastFileContent = await fs.readFile(filePath, 'utf-8');

    // Watch for changes
    currentFileWatcher = fsSync.watch(filePath, { persistent: false }, async (eventType) => {
      if (eventType === 'change') {
        try {
          // Small delay to ensure file write is complete
          await new Promise(resolve => setTimeout(resolve, 100));

          const newContent = await fs.readFile(filePath, 'utf-8');

          // Only notify if content actually changed
          if (newContent !== lastFileContent) {
            lastFileContent = newContent;
            console.log(`📝 File changed externally: ${filePath}`);

            // Notify renderer
            const win = BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('file-changed-externally', filePath);
            }
          }
        } catch (err) {
          console.error('Error reading changed file:', err);
        }
      }
    });

    console.log(`👁️ Watching file: ${filePath}`);
    return { success: true };
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
      pty = require('node-pty-prebuilt-multiarch');
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
 * Schließt die Log-Datei
 */
function closeTerminalLog() {
  if (terminalLogStream) {
    const footer = `
================================================================================
Session ended: ${new Date().toISOString()}
================================================================================
`;
    terminalLogStream.write(footer);
    terminalLogStream.end();
    terminalLogStream = null;
    console.log(`📝 Terminal log closed: ${currentLogPath}`);
  }
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
