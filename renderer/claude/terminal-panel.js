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

let terminal = null;
let fitAddon = null;
let isTerminalVisible = false;
let isTerminalStarted = false;
let currentFontSize = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;

/**
 * Initialisiert das Terminal (einmalig)
 */
export function initTerminal() {
  const container = document.getElementById('terminal-container');
  if (!container) {
    console.error('Terminal container not found');
    return;
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
  });

  // PTY Exit Event
  window.pty.onExit((info) => {
    terminal.writeln(`\r\n[Terminal beendet (code: ${info.exitCode})]`);
    isTerminalStarted = false;
  });

  // Terminal Input an PTY senden
  terminal.onData((data) => {
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

/**
 * Zeigt das Terminal und startet Claude
 */
export async function showTerminal() {
  const filesView = document.getElementById('files-view');
  const terminalPanel = document.getElementById('terminal-panel');
  const filesHeaderButtons = document.getElementById('files-header-buttons');
  const terminalHeaderButtons = document.getElementById('terminal-header-buttons');
  const viewFilesBtn = document.getElementById('view-files-btn');
  const viewTerminalBtn = document.getElementById('view-terminal-btn');

  if (!filesView || !terminalPanel) {
    console.error('View containers not found');
    return;
  }

  // Views umschalten
  filesView.classList.add('hidden');
  terminalPanel.classList.remove('hidden');

  // Header-Buttons umschalten
  if (filesHeaderButtons) filesHeaderButtons.classList.add('hidden');
  if (terminalHeaderButtons) terminalHeaderButtons.classList.remove('hidden');

  // Toggle-Buttons aktualisieren
  if (viewFilesBtn) viewFilesBtn.classList.remove('active');
  if (viewTerminalBtn) viewTerminalBtn.classList.add('active');

  isTerminalVisible = true;

  // Terminal Größe anpassen
  if (fitAddon) {
    setTimeout(() => {
      fitAddon.fit();
    }, 100);
  }

  // Terminal starten falls noch nicht geschehen
  if (!isTerminalStarted) {
    await startTerminalWithClaude();
  }

  // Fokus auf Terminal
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
  if (!State.currentFilePath) {
    terminal.writeln('⚠️  Keine Datei geöffnet. Öffne zuerst eine Datei.');
    return;
  }

  terminal.writeln('🔄 Generiere Kontext...');

  try {
    // Kontext generieren
    const contextDir = await generateAndWriteContext();

    if (!contextDir) {
      terminal.writeln('❌ Kontext konnte nicht generiert werden.');
      return;
    }

    terminal.writeln(`📁 Kontext: ${contextDir}`);
    terminal.writeln('🚀 Starte Terminal...\r\n');

    // PTY im Kontext-Verzeichnis starten
    const dims = fitAddon ? fitAddon.proposeDimensions() : { cols: 80, rows: 24 };
    const result = await window.pty.create(contextDir, dims?.cols || 80, dims?.rows || 24);

    if (!result.success) {
      terminal.writeln(`❌ PTY Fehler: ${result.error}`);
      return;
    }

    isTerminalStarted = true;

    // Claude automatisch starten (mit Verzögerung für Shell-Start)
    setTimeout(() => {
      // Hilfetext ausgeben und dann Claude starten
      const helpText = `echo "════════════════════════════════════════════════════════════════"
echo "🤖 TipTap AI - Claude Code Terminal"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📄 Dokument: ${State.currentFilePath}"
echo "📝 Absätze sind nummeriert: §1, §2, ... (siehe document-numbered.txt)"
echo ""
echo "💡 BEISPIEL-PROMPTS:"
echo "   • Zeige §5"
echo "   • Formuliere §3 kürzer"
echo "   • Korrigiere Grammatik in §12"
echo "   • Ergebnis in Zwischenablage"
echo ""
echo "📋 WORKFLOW: Text überarbeiten → In Zwischenablage → Ctrl+V im Editor"
echo "════════════════════════════════════════════════════════════════"
echo ""
claude
`;
      window.pty.write(helpText);
    }, 500);

  } catch (error) {
    terminal.writeln(`❌ Fehler: ${error.message}`);
    console.error('Terminal start error:', error);
  }
}

/**
 * Aktualisiert den Kontext (Refresh-Button)
 */
export async function refreshContext() {
  if (!terminal) return;

  terminal.writeln('\r\n🔄 Aktualisiere Kontext...');

  try {
    const contextDir = await generateAndWriteContext();
    terminal.writeln(`✅ Kontext aktualisiert: ${contextDir}`);
    terminal.writeln('💡 Sage Claude: "Lies den aktuellen Kontext neu ein"\r\n');
  } catch (error) {
    terminal.writeln(`❌ Fehler: ${error.message}`);
  }
}

/**
 * Gibt Ressourcen frei
 */
export function disposeTerminal() {
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
  window.pty.kill();
  isTerminalStarted = false;
  isTerminalVisible = false;
}

/**
 * Prüft ob Terminal sichtbar ist
 */
export function isVisible() {
  return isTerminalVisible;
}
