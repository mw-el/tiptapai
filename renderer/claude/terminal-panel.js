/**
 * Terminal Panel - Integriertes xterm.js Terminal für Claude Code
 *
 * Verantwortlichkeit: Terminal-Anzeige und PTY-Kommunikation
 * - Initialisiert xterm.js
 * - Verbindet mit PTY-Prozess
 * - Startet automatisch Claude
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { generateAndWriteContext } from './context-writer.js';
import State from '../editor/editor-state.js';
import { showStatus } from '../ui/status.js';
import { stripFrontmatterFromMarkdown } from '../file-management/utils.js';
import { saveFile } from '../document/session-manager.js';

let terminal = null;
let fitAddon = null;
let isTerminalVisible = false;
let isTerminalStarted = false;
let currentFontSize = 14;
let lastContextRefreshAt = 0;
let focusRefreshTimeout = null;
let editRefreshTimeout = null;
let contextRefreshInFlight = null;
let currentContextDir = null;
let editRequestPollTimer = null;
let editRequestInFlight = false;
let lastHandledEditRequestId = null;
let currentSessionId = null;
let terminalInputLocked = true;
let shellReadyResolve = null;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const FOCUS_REFRESH_DEBOUNCE_MS = 300;
const FOCUS_REFRESH_THROTTLE_MS = 1000;
const EDIT_CONTEXT_REFRESH_DEBOUNCE_MS = 5000;
const EDIT_REQUEST_POLL_MS = 800;
const EDIT_REQUEST_FILE = 'editor-edit-request.json';
const EDIT_RESPONSE_FILE = 'editor-edit-response.json';
const CLAUDE_MODEL_STORAGE_KEY = 'tiptapai.claude.model';
const CLAUDE_MODEL_DEFAULT = 'haiku';
const CLAUDE_MODEL_FALLBACK_OPTIONS = [
  { id: 'haiku', label: 'Haiku (Alias)' },
  { id: 'sonnet', label: 'Sonnet (Alias)' },
  { id: 'opus', label: 'Opus (Alias)' },
];
let availableClaudeModels = [...CLAUDE_MODEL_FALLBACK_OPTIONS];
let selectedClaudeModel = CLAUDE_MODEL_DEFAULT;

function toSafeModelId(rawModel) {
  const candidate = String(rawModel || '').trim();
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate)) {
    return candidate;
  }
  return '';
}

function normalizeModelOptions(models) {
  const normalized = [];
  const seen = new Set();

  for (const model of models || []) {
    const id = toSafeModelId(model?.id || model);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalized.push({
      id,
      label: String(model?.label || id).trim() || id,
    });
  }

  if (!seen.has(CLAUDE_MODEL_DEFAULT)) {
    normalized.unshift({ id: CLAUDE_MODEL_DEFAULT, label: 'Haiku (Alias)' });
  }

  return normalized.length ? normalized : [...CLAUDE_MODEL_FALLBACK_OPTIONS];
}

function resolveSelectedModel(rawModel, models = availableClaudeModels) {
  const candidate = toSafeModelId(rawModel);
  if (candidate && models.some((model) => model.id === candidate)) {
    return candidate;
  }
  if (models.some((model) => model.id === CLAUDE_MODEL_DEFAULT)) {
    return CLAUDE_MODEL_DEFAULT;
  }
  return models[0]?.id || CLAUDE_MODEL_DEFAULT;
}

async function loadAvailableClaudeModels() {
  try {
    if (!window.claude?.getModels) {
      return [...CLAUDE_MODEL_FALLBACK_OPTIONS];
    }

    const result = await window.claude.getModels();
    if (!result?.success || !Array.isArray(result.models) || result.models.length === 0) {
      return [...CLAUDE_MODEL_FALLBACK_OPTIONS];
    }

    return normalizeModelOptions(result.models);
  } catch (error) {
    console.warn('Could not load Claude models, using fallback list:', error);
    return [...CLAUDE_MODEL_FALLBACK_OPTIONS];
  }
}

async function initModelSelector() {
  const selector = document.getElementById('terminal-model-selector');
  if (!selector) {
    return;
  }

  availableClaudeModels = await loadAvailableClaudeModels();
  selector.innerHTML = '';

  for (const model of availableClaudeModels) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    selector.appendChild(option);
  }

  const storedModel = localStorage.getItem(CLAUDE_MODEL_STORAGE_KEY);
  selectedClaudeModel = resolveSelectedModel(storedModel, availableClaudeModels);
  selector.value = selectedClaudeModel;
  localStorage.setItem(CLAUDE_MODEL_STORAGE_KEY, selectedClaudeModel);

  selector.addEventListener('change', async () => {
    const previousModel = selectedClaudeModel;
    selectedClaudeModel = resolveSelectedModel(selector.value, availableClaudeModels);
    selector.value = selectedClaudeModel;
    localStorage.setItem(CLAUDE_MODEL_STORAGE_KEY, selectedClaudeModel);

    const modelChanged = previousModel !== selectedClaudeModel;
    if (modelChanged && isTerminalStarted) {
      await switchClaudeModelLive(selectedClaudeModel);
      showStatus(`Claude-Modell live gewechselt: ${selectedClaudeModel}`, 'saved');
      return;
    }

    showStatus(`Claude-Modell: ${selectedClaudeModel}`, 'saved');
  });
}

function getClaudeStartModel() {
  return resolveSelectedModel(selectedClaudeModel, availableClaudeModels);
}

async function switchClaudeModelLive(modelId) {
  if (!isTerminalStarted) {
    return;
  }

  const safeModel = resolveSelectedModel(modelId, availableClaudeModels);
  const switchCommand = `/model ${safeModel}\r`;

  try {
    await window.pty.write(switchCommand);
    if (terminal) {
      terminal.writeln(`\r\n[Model-Switch gesendet: ${safeModel}]`);
    }
  } catch (error) {
    console.error('Live model switch failed:', error);
  }
}

/**
 * Initialisiert das Terminal (einmalig)
 */
export function initTerminal() {
  const container = document.getElementById('terminal-container');
  if (!container) {
    console.error('Terminal container not found');
    return;
  }

  const storedModel = toSafeModelId(localStorage.getItem(CLAUDE_MODEL_STORAGE_KEY));
  if (storedModel) {
    selectedClaudeModel = storedModel;
  }

  // xterm.js Terminal erstellen
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      cursorAccent: '#1e1e1e',
      selection: 'rgba(255, 255, 255, 0.3)',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff',
    },
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Terminal in Container rendern
  terminal.open(container);

  // PTY Output empfangen
  window.pty.onData((data) => {
    terminal.write(data);
    // Shell-Prompt-Listener benachrichtigen (einmalig beim Start)
    if (shellReadyResolve) {
      // Prompt-Erkennung: zsh/bash geben % oder $ aus, oft nach ANSI-Codes
      if (/[$%#>]\s*$/.test(data.replace(/\x1b\[[0-9;]*[mABCDHJKST]/g, ''))) {
        const resolve = shellReadyResolve;
        shellReadyResolve = null;
        resolve();
      }
    }
  });

  // PTY Exit Event
  window.pty.onExit((info) => {
    terminal.writeln(`\r\n[Terminal beendet (code: ${info.exitCode})]`);
    isTerminalStarted = false;
    currentSessionId = null;
    stopEditRequestPolling();
  });

  // Session Events (resume-failed, session-ready)
  window.pty.onSessionEvent((event) => {
    if (event.type === 'resume-failed') {
      const failedId = event.sessionId;
      writeHandoverFile(failedId);
      const hint = failedId
        ? `Session "${failedId.slice(0, 8)}..." nicht gefunden oder abgelaufen.\n→ Claude startet neue Session.\n→ Handover-Datei geschrieben: .claude/session-handoff.md`
        : `→ Claude startet neue Session.\n→ Handover-Datei geschrieben: .claude/session-handoff.md`;
      showTerminalError({
        message: 'Resume fehlgeschlagen',
        hint,
      });
      currentSessionId = null;
    }
  });

  // Terminal Input an PTY senden (gesperrt wenn Lock aktiv)
  terminal.onData((data) => {
    if (terminalInputLocked) return;
    window.pty.write(data);
  });

  // Custom Key Handler: Ctrl+C/V für Copy/Paste abfangen
  terminal.attachCustomKeyEventHandler((event) => {
    // Ctrl+C: Copy wenn Text selektiert, sonst SIGINT
    if (event.ctrlKey && event.key === 'c' && event.type === 'keydown') {
      const selection = terminal.getSelection();
      if (selection) {
        // Text ist selektiert -> Copy
        navigator.clipboard.writeText(selection);
        terminal.clearSelection();
        return false; // Event nicht an Terminal weitergeben
      }
      // Kein Text selektiert -> SIGINT an PTY senden
      return true;
    }

    // Ctrl+V: Paste (nur bei keydown, keyup blockieren)
    if (event.ctrlKey && event.key === 'v') {
      if (event.type === 'keydown') {
        event.preventDefault();
        pasteFromClipboard();
      }
      return false; // Event nicht an Terminal weitergeben
    }

    // Ctrl+Shift+C: Immer Copy
    if (event.ctrlKey && event.shiftKey && event.key === 'C' && event.type === 'keydown') {
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
        terminal.clearSelection();
      }
      return false;
    }

    // Ctrl+Shift+V: Immer Paste (nur bei keydown, keyup blockieren)
    if (event.ctrlKey && event.shiftKey && event.key === 'V') {
      if (event.type === 'keydown') {
        event.preventDefault();
        pasteFromClipboard();
      }
      return false;
    }

    // Alle anderen Tasten normal verarbeiten
    return true;
  });

  // Resize-Observer für automatische Größenanpassung
  const resizeObserver = new ResizeObserver(() => {
    if (isTerminalVisible && fitAddon) {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          window.pty.resize(dims.cols, dims.rows);
        }
      } catch (e) {
        // Ignore resize errors during transition
      }
    }
  });
  resizeObserver.observe(container);

  // Keyboard-Handler für Zoom (Ctrl+Plus/Minus)
  container.addEventListener('keydown', handleTerminalKeydown);
  // Kontext-Refresh beim Fokus im Terminal
  container.addEventListener('mousedown', scheduleFocusContextRefresh);
  container.addEventListener('focusin', scheduleFocusContextRefresh);

  // Lock-Button
  const lockBtn = document.getElementById('terminal-lock-btn');
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      setTerminalLocked(!terminalInputLocked);
    });
  }

  initModelSelector().catch((error) => {
    console.error('Model selector initialization failed:', error);
  });

  console.log('✅ Terminal initialized');
}

/**
 * Keyboard-Handler für Terminal-spezifische Shortcuts (Zoom)
 * Copy/Paste wird über attachCustomKeyEventHandler in xterm.js gehandelt
 */
function handleTerminalKeydown(event) {
  // Ctrl+Plus oder Ctrl+= für Zoom In
  if (event.ctrlKey && (event.key === '+' || event.key === '=')) {
    event.preventDefault();
    zoomIn();
    return;
  }

  // Ctrl+Minus für Zoom Out
  if (event.ctrlKey && event.key === '-') {
    event.preventDefault();
    zoomOut();
    return;
  }

  // Ctrl+0 für Reset Zoom
  if (event.ctrlKey && event.key === '0') {
    event.preventDefault();
    resetZoom();
    return;
  }
}

/**
 * Fügt Text aus Clipboard ins Terminal ein
 */
async function pasteFromClipboard() {
  if (!terminal) return;

  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      // Text an PTY senden
      window.pty.write(text);
    }
  } catch (error) {
    console.error('Clipboard paste failed:', error);
  }
}

/**
 * Vergrößert die Terminal-Schrift
 */
export function zoomIn() {
  if (!terminal) return;
  if (currentFontSize < MAX_FONT_SIZE) {
    currentFontSize += 2;
    terminal.options.fontSize = currentFontSize;
    fitTerminal();
    console.log(`🔍 Terminal font size: ${currentFontSize}px`);
  }
}

/**
 * Verkleinert die Terminal-Schrift
 */
export function zoomOut() {
  if (!terminal) return;
  if (currentFontSize > MIN_FONT_SIZE) {
    currentFontSize -= 2;
    terminal.options.fontSize = currentFontSize;
    fitTerminal();
    console.log(`🔍 Terminal font size: ${currentFontSize}px`);
  }
}

/**
 * Setzt Zoom auf Standard zurück
 */
export function resetZoom() {
  if (!terminal) return;
  currentFontSize = 14;
  terminal.options.fontSize = currentFontSize;
  fitTerminal();
  console.log(`🔍 Terminal font size reset: ${currentFontSize}px`);
}

/**
 * Setzt Terminal-Input-Sperre und aktualisiert Lock-Button
 */
function setTerminalLocked(locked) {
  terminalInputLocked = locked;
  const btn = document.getElementById('terminal-lock-btn');
  if (!btn) return;
  const icon = btn.querySelector('.material-icons');
  if (locked) {
    btn.classList.add('locked');
    btn.classList.remove('unlocked');
    btn.setAttribute('aria-label', 'Terminal gesperrt – klicken zum Entsperren');
    btn.setAttribute('data-tooltip', 'Terminal gesperrt: Eingaben werden blockiert. Klicken zum Entsperren.');
    if (icon) icon.textContent = 'lock';
  } else {
    btn.classList.remove('locked');
    btn.classList.add('unlocked');
    btn.setAttribute('aria-label', 'Terminal aktiv – klicken zum Sperren');
    btn.setAttribute('data-tooltip', 'Terminal aktiv: Eingaben werden weitergeleitet. Klicken zum Sperren.');
    if (icon) icon.textContent = 'lock_open';
  }
}

/**
 * Zeigt strukturierte Fehlermeldung über dem Terminal
 */
function showTerminalError({ message, hint }) {
  const panel = document.getElementById('terminal-error-panel');
  if (!panel) return;

  const hintHtml = hint
    ? `<div class="terminal-error-hint">${hint.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
    : '';

  panel.innerHTML = `
    <div class="terminal-error-icon">⚠</div>
    <div class="terminal-error-body">
      <div class="terminal-error-message">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      ${hintHtml}
    </div>
    <button class="terminal-error-dismiss" aria-label="Meldung schliessen">OK</button>
  `;
  panel.classList.remove('hidden');

  panel.querySelector('.terminal-error-dismiss').addEventListener('click', () => {
    panel.classList.add('hidden');
  });
}

/**
 * Schreibt Handover-Datei wenn Resume fehlschlägt.
 * Claude kann diese beim Start einer neuen Session lesen.
 */
async function writeHandoverFile(failedSessionId) {
  if (!currentContextDir) return;
  const filePath = `${currentContextDir}/.claude/session-handoff.md`;
  const content = `# Session Handover

**Erstellt:** ${new Date().toISOString()}
**Grund:** Resume fehlgeschlagen

## Letzte Session
- **Session-ID:** ${failedSessionId || '(unbekannt)'}
- **Dokument:** ${State.currentFilePath || '(unbekannt)'}

## Kontext
Die vorherige Session konnte nicht wiederhergestellt werden.
Der vollständige Dokumentkontext liegt in \`CLAUDE.md\` und \`document-numbered.txt\`.

## Nächster Schritt
Lies \`CLAUDE.md\` für den aktuellen Stand und fahre mit der Arbeit fort.
`;
  try {
    const result = await window.api.saveFile(filePath, content);
    if (!result?.success) {
      console.warn('Handover file write failed:', result?.error);
    }
  } catch (err) {
    console.warn('Handover file write error:', err.message);
  }
}

/**
 * Passt Terminal-Größe an und informiert PTY
 */
function fitTerminal() {
  if (fitAddon && isTerminalVisible) {
    try {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        window.pty.resize(dims.cols, dims.rows);
      }
    } catch (e) {
      // Ignore errors
    }
  }
}

function getContextFilePath(fileName) {
  if (!currentContextDir) {
    return null;
  }
  return `${currentContextDir}/${fileName}`;
}

function createIdleRequestPayload() {
  return JSON.stringify({
    id: null,
    status: 'idle',
    updatedAt: new Date().toISOString(),
  }, null, 2);
}

function createIdleResponsePayload() {
  return JSON.stringify({
    id: null,
    status: 'idle',
    updatedAt: new Date().toISOString(),
  }, null, 2);
}

async function ensureBridgeFile(filePath, content) {
  if (!filePath) {
    return;
  }

  try {
    const loadResult = await window.api.loadFile(filePath);
    if (loadResult?.success) {
      return;
    }
  } catch (error) {
    console.warn('Bridge file load check failed:', filePath, error);
  }

  const saveResult = await window.api.saveFile(filePath, content);
  if (!saveResult?.success) {
    console.warn('Could not create bridge file:', filePath, saveResult?.error);
  }
}

async function ensureEditBridgeFiles() {
  const requestPath = getContextFilePath(EDIT_REQUEST_FILE);
  const responsePath = getContextFilePath(EDIT_RESPONSE_FILE);
  await ensureBridgeFile(requestPath, createIdleRequestPayload());
  await ensureBridgeFile(responsePath, createIdleResponsePayload());
}

function startEditRequestPolling() {
  if (editRequestPollTimer) {
    return;
  }

  editRequestPollTimer = setInterval(() => {
    pollEditBridge().catch((error) => {
      console.error('Edit bridge poll failed:', error);
    });
  }, EDIT_REQUEST_POLL_MS);
}

function stopEditRequestPolling() {
  if (editRequestPollTimer) {
    clearInterval(editRequestPollTimer);
    editRequestPollTimer = null;
  }
}

async function loadJsonFile(filePath) {
  if (!filePath) {
    return null;
  }

  const result = await window.api.loadFile(filePath);
  if (!result?.success || typeof result.content !== 'string') {
    return null;
  }

  try {
    return JSON.parse(result.content);
  } catch (error) {
    console.warn('Invalid JSON in bridge file:', filePath, error);
    return null;
  }
}

async function writeJsonFile(filePath, value) {
  const raw = JSON.stringify(value, null, 2);
  const saveResult = await window.api.saveFile(filePath, raw);
  if (!saveResult?.success) {
    console.warn('Could not write bridge file:', filePath, saveResult?.error);
  }
}

function setUnsavedUiState() {
  const saveBtn = document.querySelector('#save-btn');
  if (saveBtn && saveBtn.classList.contains('saved')) {
    saveBtn.classList.remove('saved');
  }
}

// TipTap serializes HorizontalRule as \n\n---\n\n (two blank lines on each side).
// old_string from the raw .md file may use \n---\n (one newline). Normalize to match.
function normalizeHorizontalRules(str) {
  return str.replace(/\n{1,3}---\n{1,3}/g, '\n\n---\n\n');
}

function applyBridgeRequestToEditor(request) {
  if (!State.currentEditor) {
    return { success: false, error: 'No active editor instance.' };
  }

  if (typeof request.old_string !== 'string' || typeof request.new_string !== 'string') {
    return { success: false, error: 'Request needs old_string and new_string.' };
  }

  if (request.old_string.length === 0) {
    return { success: false, error: 'old_string must not be empty.' };
  }

  const currentMarkdown = stripFrontmatterFromMarkdown(State.currentEditor.getMarkdown());
  const normalizedOldString = normalizeHorizontalRules(request.old_string);
  const firstIndex = currentMarkdown.indexOf(normalizedOldString);

  if (firstIndex === -1) {
    return { success: false, error: 'old_string not found in current editor content.' };
  }

  const secondIndex = currentMarkdown.indexOf(normalizedOldString, firstIndex + normalizedOldString.length);
  if (secondIndex !== -1) {
    return { success: false, error: 'old_string is not unique; refine the selection.' };
  }

  const nextMarkdown = currentMarkdown.slice(0, firstIndex)
    + request.new_string
    + currentMarkdown.slice(firstIndex + normalizedOldString.length);

  if (nextMarkdown === currentMarkdown) {
    return { success: true, message: 'No content change detected.' };
  }

  const editorElement = document.querySelector('#editor');
  const oldScrollTop = editorElement ? editorElement.scrollTop : null;

  State.currentEditor.commands.setContent(nextMarkdown, { contentType: 'markdown' });

  if (editorElement && typeof oldScrollTop === 'number') {
    editorElement.scrollTop = oldScrollTop;
  }

  setUnsavedUiState();
  State.hasUnsavedChanges = true;

  return { success: true, message: 'Applied in editor buffer.' };
}

async function pollEditBridge() {
  if (!currentContextDir || editRequestInFlight) {
    return;
  }

  const requestPath = getContextFilePath(EDIT_REQUEST_FILE);
  const responsePath = getContextFilePath(EDIT_RESPONSE_FILE);
  const request = await loadJsonFile(requestPath);

  if (!request || !request.id) {
    return;
  }

  if (request.id === lastHandledEditRequestId) {
    return;
  }

  const response = await loadJsonFile(responsePath);
  if (response?.id && response.id === request.id) {
    lastHandledEditRequestId = request.id;
    return;
  }

  editRequestInFlight = true;
  try {
    const applyResult = applyBridgeRequestToEditor(request);

    let fileSaved = false;
    if (applyResult.success && State.currentFilePath) {
      const saveResult = await saveFile(true);
      fileSaved = Boolean(saveResult?.success);
    }

    const responsePayload = {
      id: request.id,
      success: Boolean(applyResult.success),
      fileSaved,
      error: applyResult.error || null,
      message: applyResult.message || null,
      processedAt: new Date().toISOString(),
    };

    await writeJsonFile(responsePath, responsePayload);
    lastHandledEditRequestId = request.id;

    if (responsePayload.success) {
      if (fileSaved) {
        showStatus('KI-Edit angewendet und gespeichert', 'saved');
      } else {
        showStatus('KI-Edit im Editor angewendet (ungespeichert)', 'unsaved');
      }
    } else {
      showStatus(`KI-Edit fehlgeschlagen: ${responsePayload.error}`, 'error');
    }
  } finally {
    editRequestInFlight = false;
  }
}

/**
 * Zeigt das Terminal und startet Claude
 */
export async function showTerminal() {
  const terminalPanel = document.getElementById('terminal-panel');
  if (!terminalPanel) {
    console.error('Terminal panel not found');
    return;
  }

  terminalPanel.classList.remove('hidden');
  isTerminalVisible = true;

  // Terminal Größe anpassen
  if (fitAddon) {
    setTimeout(() => fitAddon.fit(), 100);
  }

  // Terminal starten falls noch nicht geschehen
  if (!isTerminalStarted) {
    await startTerminalWithClaude();
  } else {
    refreshContextInternal({ silent: true });
  }

  if (terminal) {
    terminal.focus();
  }
}

/**
 * Versteckt das Terminal (File-Tree anzeigen)
 */
export function hideTerminal() {
  const filesView = document.getElementById('files-view');
  const terminalPanel = document.getElementById('terminal-panel');
  const filesHeaderButtons = document.getElementById('files-header-buttons');
  const terminalHeaderButtons = document.getElementById('terminal-header-buttons');
  const viewFilesBtn = document.getElementById('view-files-btn');
  const viewTerminalBtn = document.getElementById('view-terminal-btn');

  if (!filesView || !terminalPanel) return;

  // Views umschalten
  filesView.classList.remove('hidden');
  terminalPanel.classList.add('hidden');

  // Header-Buttons umschalten
  if (filesHeaderButtons) filesHeaderButtons.classList.remove('hidden');
  if (terminalHeaderButtons) terminalHeaderButtons.classList.add('hidden');

  // Toggle-Buttons aktualisieren
  if (viewFilesBtn) viewFilesBtn.classList.add('active');
  if (viewTerminalBtn) viewTerminalBtn.classList.remove('active');

  isTerminalVisible = false;
}

/**
 * Startet das Terminal und führt Claude aus
 */
async function startTerminalWithClaude() {
  try {
    let contextDir;

    if (State.currentFilePath) {
      terminal.writeln('🔄 Generiere Kontext...');
      contextDir = await generateAndWriteContext();
      if (!contextDir) {
        terminal.writeln('❌ Kontext konnte nicht generiert werden.');
        return;
      }
      currentContextDir = contextDir;
      await ensureEditBridgeFiles();
      startEditRequestPolling();
      terminal.writeln(`📁 Kontext: ${contextDir}`);
    } else {
      // Ohne offene Datei: im App-Verzeichnis starten
      const appDirResult = await window.api.getAppDir();
      contextDir = appDirResult?.appDir || '.';
      currentContextDir = contextDir;
      terminal.writeln('💡 Kein Dokument geöffnet – starte Claude im App-Verzeichnis.');
    }

    terminal.writeln('🚀 Starte Terminal...\r\n');

    // PTY im Kontext-Verzeichnis starten
    const dims = fitAddon ? fitAddon.proposeDimensions() : { cols: 80, rows: 24 };
    const result = await window.pty.create(contextDir, dims?.cols || 80, dims?.rows || 24);

    if (!result.success) {
      terminal.writeln(`❌ PTY Fehler: ${result.error}`);
      return;
    }

    isTerminalStarted = true;
    setTerminalLocked(false);

    if (result.reused) {
      const currentModel = getClaudeStartModel();
      terminal.writeln('🔁 Terminal-Sitzung wiederhergestellt.');
      terminal.writeln(`💡 Falls Claude nicht läuft, tippe: claude --model ${currentModel}`);
      return;
    }

    // Session-ID aus Registry laden oder neue generieren
    const sessionResult = await window.pty.getSession(contextDir);
    const existingSession = sessionResult?.session;

    let claudeSessionId;
    let claudeStartFlag;

    if (existingSession?.id) {
      claudeSessionId = existingSession.id;
      claudeStartFlag = `--resume ${claudeSessionId}`;
      terminal.writeln(`🔁 Resumiere Session ${claudeSessionId.slice(0, 8)}...`);
    } else {
      const idResult = await window.pty.newSessionId();
      claudeSessionId = idResult.sessionId;
      claudeStartFlag = `--session-id ${claudeSessionId}`;
    }

    currentSessionId = claudeSessionId;

    // Session in Registry eintragen
    await window.pty.setSession({
      id: claudeSessionId,
      workDir: contextDir,
      status: 'running',
    });

    // Willkommenstext direkt ins Terminal schreiben (kein echo — vermeidet Garbage)
    const currentModel = getClaudeStartModel();
    terminal.writeln('════════════════════════════════════════════════════════════════');
    terminal.writeln('🤖 TipTap AI - Claude Code Terminal');
    terminal.writeln('════════════════════════════════════════════════════════════════');
    if (State.currentFilePath) {
      terminal.writeln(`📄 Dokument: ${State.currentFilePath}`);
    }
    terminal.writeln(`🤖 Modell: ${currentModel}`);
    terminal.writeln('════════════════════════════════════════════════════════════════');
    terminal.writeln('');

    // Warten bis Shell-Prompt erscheint, dann claude starten (max. 10s Fallback)
    await new Promise((resolve) => {
      shellReadyResolve = resolve;
      setTimeout(() => {
        if (shellReadyResolve) {
          shellReadyResolve = null;
          resolve();
        }
      }, 10000);
    });
    window.pty.write(`claude --model ${currentModel} ${claudeStartFlag}\n`);

  } catch (error) {
    terminal.writeln(`❌ Fehler: ${error.message}`);
    console.error('Terminal start error:', error);
  }
}


async function refreshContextInternal({ silent }) {
  if (!terminal) return;

  if (!silent) {
    terminal.writeln('\r\n🔄 Aktualisiere Kontext...');
  }

  try {
    const contextDir = await generateAndWriteContext();
    currentContextDir = contextDir;
    await ensureEditBridgeFiles();
    startEditRequestPolling();
    if (!silent) {
      terminal.writeln(`✅ Kontext aktualisiert: ${contextDir}`);
      terminal.writeln('💡 Sage Claude: "Lies den aktuellen Kontext neu ein"\r\n');
    }
    lastContextRefreshAt = Date.now();
  } catch (error) {
    if (!silent) {
      terminal.writeln(`❌ Fehler: ${error.message}`);
    }
  }
}

function scheduleFocusContextRefresh() {
  if (!isTerminalVisible) return;

  const now = Date.now();
  if (now - lastContextRefreshAt < FOCUS_REFRESH_THROTTLE_MS) {
    return;
  }

  if (focusRefreshTimeout) {
    clearTimeout(focusRefreshTimeout);
  }

  focusRefreshTimeout = setTimeout(async () => {
    if (contextRefreshInFlight) {
      return;
    }
    contextRefreshInFlight = refreshContextInternal({ silent: true }).finally(() => {
      contextRefreshInFlight = null;
    });
  }, FOCUS_REFRESH_DEBOUNCE_MS);
}

/**
 * Plant einen stillen Kontext-Refresh nach Benutzer-Edits (5s Debounce).
 * Nur aktiv wenn ein Kontext-Verzeichnis existiert (Terminal wurde gestartet).
 */
export function scheduleEditContextRefresh() {
  if (!currentContextDir) return;

  if (editRefreshTimeout) {
    clearTimeout(editRefreshTimeout);
  }

  editRefreshTimeout = setTimeout(() => {
    if (contextRefreshInFlight) return;
    contextRefreshInFlight = refreshContextInternal({ silent: true }).finally(() => {
      contextRefreshInFlight = null;
    });
  }, EDIT_CONTEXT_REFRESH_DEBOUNCE_MS);
}

/**
 * Gibt Ressourcen frei
 */
export function disposeTerminal({ keepPty = false } = {}) {
  stopEditRequestPolling();

  if (currentSessionId) {
    window.pty.endSession(currentSessionId);
    currentSessionId = null;
  }

  currentContextDir = null;
  lastHandledEditRequestId = null;

  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
  if (!keepPty) {
    window.pty.kill();
  }
  isTerminalStarted = false;
  isTerminalVisible = false;
}

/**
 * Prüft ob Terminal sichtbar ist
 */
export function isVisible() {
  return isTerminalVisible;
}
