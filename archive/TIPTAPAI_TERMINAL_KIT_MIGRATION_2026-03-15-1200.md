# Terminal Kit Migration Plan – TipTap AI
**Erstellt:** 2026-03-15
**Status:** ✅ Implementiert und getestet 2026-03-15

---

## Ausgangslage

TipTap AI hat bereits eine funktionierende Terminal-Integration:
- xterm.js + FitAddon mit korrekter PTY-Geometry-Sync
- Electron IPC via `window.pty.*` / `window.api.*`
- `context-writer.js`: schreibt CLAUDE.md, settings.local.json, etc.
- Edit-Bridge: JSON-Polling für Direkt-Edits im Editor
- Model-Selector mit `/model <name>` Live-Switch

Was fehlt (analog Terminal Kit):
- Output-Parsing: kein `SessionOutputWatcher` → kein Erkennen ob Resume fehlschlägt
- Session-Registry: kein `--resume <id>`, nur PTY-Reuse ohne Session-ID
- Strukturierte Fehlermeldungen (Code + Hint)
- Lock-Button
- Handover-File bei fehlgeschlagenem Resume
- Session-Smoke-Test

---

## Schichten-Mapping

| Terminal Kit | TipTap AI (neu) |
|---|---|
| `TerminalPanel` | `renderer/claude/terminal-panel.js` (erweitern) |
| `TerminalSessionService` | `main.js` PTY-Abschnitt (erweitern) |
| `ContextProvider` | `renderer/claude/context-writer.js` (bleibt, minimale Erweiterung) |
| `TerminalTransport` | **nicht umsetzen** – bleibt hardcoded Electron IPC (kein WebSocket-Bedarf in TipTap AI) |

**Hinweis zu TypeScript:** Das Terminal Kit Konzept ist in TS verfasst. TipTap AI bleibt Vanilla JS.
Alle neuen Komponenten werden in Vanilla JS implementiert.

---

## Phase 0: Empirische Validierung ✅ Abgeschlossen 2026-03-15

### 0.1 Session-ID-Format ✅
**Ergebnis:**
- Format: Standard-UUID, z.B. `c47d2285-69f8-4704-8618-dde28d2cba08`
- **NICHT im Terminal-Output sichtbar** – kein `"Session ID:"` String im PTY-Stream
- Claude-Header zeigt: `ClaudeCodev2.1.76` + `Sonnet4.6·ClaudePro` + Arbeitsverzeichnis
- Verfügbar via `--print --output-format=json` als `session_id` Feld
- **Besser:** `--session-id <uuid>` Flag erlaubt eigene UUID vorzugeben → TipTap AI generiert UUID selbst und kennt sie schon vor dem Start
- Scoped auf Arbeitsverzeichnis: Session aus anderem Verzeichnis kann nicht resumiert werden

### 0.2 `--resume` Verhalten ✅
**Ergebnis:**
- `claude --resume <id>` funktioniert korrekt (getestet mit `--print`)
- Bei ungültiger/unbekannter ID: Exit Code 1 + **parsebarer String**: `"No conversation found with session ID: <id>"`
- Dieser String ist im PTY-Output-Stream vorhanden → `SessionOutputWatcher` kann ihn erkennen

### 0.3 Model-Override bei Resume ✅
**Ergebnis:**
- `claude --resume <id> --model sonnet` funktioniert – Sonnet aktiv, gleiche Session-ID
- Model-Override bei Resume funktioniert sauber, keine sichtbare Warnung

### 0.4 Permission-Strings ✅
**Ergebnis:**
- Aktuelles Format `Read(//home/.../**)` (doppelter Slash) funktioniert
- `Bash(node:*)` funktioniert ohne Nachfrage
- Format ist gültig und stabil

### 0.5 Smoke-Test ✅
**Ergebnis:**
- `echo "__TERMINAL_KIT_READY__"` in der PTY-Shell (vor Claude-Start) ist 100% zuverlässig
- String erscheint exakt so im Output-Stream
- Erkennt PTY-Bereitschaft (nicht Claude-Bereitschaft – das ist ausreichend für TipTap AI)

---

### Konsequenzen für den Implementierungsplan

**SessionOutputWatcher – revidierte Strategie:**

| Konzept-Ansatz | TipTap-AI-Ansatz |
|---|---|
| `Session ID:` aus Terminal parsen | `--session-id <uuid>` → UUID selbst generieren und speichern |
| `Model: claude-xxx` parsen | `--model` Flag + `--resume` (getestet: funktioniert) |
| `Starting new session` parsen | `No conversation found with session ID:` parsen |
| Filesystem-Watch | nicht nötig (UUID wird selbst generiert) |

**Fazit:** Die `SessionOutputWatcher`-Patterns aus dem Konzept-Dokument funktionieren **nicht** wie beschrieben für Claude 2.1.76. Die TipTap-AI-Implementierung nutzt stattdessen `--session-id` und parst den Resume-Fehler-String direkt.

### 0.3 Model-Override bei Resume
```bash
claude --resume <id> --model sonnet
# Wird das Modell tatsächlich gewechselt?
# Was zeigt die Ausgabe im Header?
```
**Ergebnis:** _noch nicht getestet_

### 0.4 Permission-Strings validieren
Die aktuellen Strings aus `context-writer.js` prüfen:
```json
"Read(//home/.../**)"
"Write(//home/.../**)"
"Bash(node:*)"
```
```bash
# Testen ob Claude mit diesen Permissions tatsächlich autonom arbeitet
# oder weiterhin nach Bestätigung fragt
```
**Ergebnis:** _noch nicht getestet_

### 0.5 `__TERMINAL_KIT_READY__` Smoke-Test
```bash
# In einer neuen PTY-Session:
echo "__TERMINAL_KIT_READY__"
# Erscheint die Zeichenkette exakt so im Output-Stream?
```
**Ergebnis:** _noch nicht getestet_

---

## Phase 1: SessionOutputWatcher + Session-Registry

**Scope:** Nur `main.js` (PTY-Abschnitt). Kein Renderer-Code.

### 1.1 `SessionOutputWatcher` in main.js

Neue Klasse direkt in `main.js` vor dem PTY-Abschnitt:

```javascript
class SessionOutputWatcher {
  constructor() {
    this._buffer = '';
  }

  feed(chunk) {
    this._buffer += chunk;
    const events = [];

    // Session-ID extrahieren (Format nach Phase-0-Test anpassen!)
    const idMatch = this._buffer.match(/Session ID:\s*([a-f0-9-]{36})/i);
    if (idMatch && !this._sessionIdEmitted) {
      this._sessionIdEmitted = true;
      events.push({ type: 'session-id', id: idMatch[1] });
    }

    // Unerwarteter New-Session-Start trotz Resume
    if (!this._newSessionEmitted && this._buffer.includes('Starting new session')) {
      this._newSessionEmitted = true;
      events.push({ type: 'unexpected-new-session' });
    }

    // Aktives Modell bestätigt
    const modelMatch = this._buffer.match(/Model:\s*(claude-[a-z0-9-]+)/i);
    if (modelMatch && !this._modelEmitted) {
      this._modelEmitted = true;
      events.push({ type: 'model-confirmed', model: modelMatch[1] });
    }

    // Smoke-Test: Session ist bereit
    if (!this._readyEmitted && this._buffer.includes('__TERMINAL_KIT_READY__')) {
      this._readyEmitted = true;
      events.push({ type: 'session-ready' });
    }

    return events;
  }

  reset() {
    this._buffer = '';
    this._sessionIdEmitted = false;
    this._newSessionEmitted = false;
    this._modelEmitted = false;
    this._readyEmitted = false;
  }
}
```

### 1.2 Session-Registry in main.js

Neue Hilfsfunktionen direkt neben dem PTY-Abschnitt:

```javascript
const SESSION_REGISTRY_PATH = path.join(app.getPath('userData'), 'sessions.json');

async function readSessionRegistry() {
  try {
    const raw = await fs.readFile(SESSION_REGISTRY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { sessions: [] };
  }
}

async function writeSessionRegistry(registry) {
  await fs.writeFile(SESSION_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

async function upsertSession(entry) {
  const registry = await readSessionRegistry();
  const idx = registry.sessions.findIndex(s => s.id === entry.id);
  if (idx >= 0) {
    registry.sessions[idx] = { ...registry.sessions[idx], ...entry };
  } else {
    registry.sessions.push(entry);
  }
  await writeSessionRegistry(registry);
}

async function findSessionByWorkingRoot(workingRoot) {
  const registry = await readSessionRegistry();
  return registry.sessions
    .filter(s => s.workingRoot === workingRoot && s.status !== 'terminated')
    .sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt))[0] || null;
}
```

### 1.3 `pty-create` um Watcher + Registry erweitern

Im bestehenden `ipcMain.handle('pty-create', ...)`:
- `sessionOutputWatcher = new SessionOutputWatcher()` instanziieren
- Im `onData`-Handler: `watcher.feed(chunk)` aufrufen, Events verarbeiten
- Bei `session-id`: `upsertSession({ id, workingRoot, startedAt, status: 'running' })`
- Bei `unexpected-new-session` + Resume-Mode: Fehlermeldung an Renderer senden
- Bei Session-Ende: `upsertSession({ id, status: 'suspended', lastActiveAt })`

### 1.4 Neuer IPC-Handler: `pty-get-session`

```javascript
ipcMain.handle('pty-get-session', async (event, workingRoot) => {
  const session = await findSessionByWorkingRoot(workingRoot);
  return { success: true, session };
});
```

### 1.5 Neuer IPC-Handler: `pty-create-resume`

Ergänzung zu `pty-create`: wenn eine Session-ID aus der Registry vorhanden ist,
startet Claude mit `--resume <id>` statt frisch.

### 1.6 Preload.js erweitern

```javascript
// In window.pty:
getSession: (workingRoot) => ipcRenderer.invoke('pty-get-session', workingRoot),
// Neue Event-Callbacks:
onSessionEvent: (callback) => {
  ipcRenderer.on('pty-session-event', (event, data) => callback(data));
},
```

---

## Phase 2: Strukturierte Fehlermeldungen im Renderer

**Scope:** `terminal-panel.js` + minimale HTML/CSS-Ergänzung.

### 2.1 `TerminalErrorPanel` Komponente

Neue Funktion in `terminal-panel.js`:

```javascript
function showTerminalError({ code, message, hint }) {
  const container = document.getElementById('terminal-error-panel');
  if (!container) return;

  container.innerHTML = `
    <div class="terminal-error">
      <div class="terminal-error-icon">⚠</div>
      <div class="terminal-error-body">
        <div class="terminal-error-message">${escapeHtml(message)}</div>
        <div class="terminal-error-hint">${escapeHtml(hint)}</div>
      </div>
      <button class="terminal-error-dismiss" onclick="this.parentElement.parentElement.classList.add('hidden')">OK</button>
    </div>
  `;
  container.classList.remove('hidden');
}
```

### 2.2 Session-Events im Renderer verarbeiten

In `initTerminal()`:
```javascript
window.pty.onSessionEvent((event) => {
  if (event.type === 'unexpected-new-session' && currentResumeMode) {
    showTerminalError({
      code: 'RESUME_FAILED_NEW_SESSION',
      message: 'Resume fehlgeschlagen – Claude hat eine neue Session gestartet.',
      hint: currentSessionId
        ? `Session "${currentSessionId}" nicht gefunden oder abgelaufen.\n→ Handover-Datei wurde geschrieben.`
        : `Keine Session-ID verfügbar.`
    });
  }
  if (event.type === 'model-confirmed' && currentRequestedModel) {
    if (event.model !== currentRequestedModel) {
      showTerminalError({
        code: 'MODEL_MISMATCH',
        message: `Erwartetes Modell: ${currentRequestedModel} – Aktiv: ${event.model}`,
        hint: `→ Manuelle Eingabe: /model ${currentRequestedModel}`
      });
    }
  }
});
```

### 2.3 Lock-Button

Im Terminal-Header ein Lock-Icon ergänzen (Material Icons):
```html
<span id="terminal-lock-btn" class="material-icons terminal-lock locked" title="Terminal gesperrt – klicken zum Entsperren">lock</span>
```

```javascript
let terminalInputLocked = true; // Default: gesperrt

function setTerminalLocked(locked) {
  terminalInputLocked = locked;
  const btn = document.getElementById('terminal-lock-btn');
  if (btn) {
    btn.textContent = locked ? 'lock' : 'lock_open';
    btn.title = locked
      ? 'Terminal gesperrt – klicken zum Entsperren'
      : 'Terminal aktiv – klicken zum Sperren';
  }
}
```

Im `terminal.onData`-Handler:
```javascript
terminal.onData((data) => {
  if (terminalInputLocked) return; // blockieren wenn gesperrt
  window.pty.write(data);
});
```

---

## Phase 3: Resume-Hierarchie in `startTerminalWithClaude()`

**Scope:** `terminal-panel.js` + `main.js`.

### Aktuelle Logik (vereinfacht):
```
pty-create(contextDir) → result.reused? → starte claude --model X
```

### Neue Logik:
```
1. pty-get-session(contextDir) → session?
2. Falls session.id vorhanden:
   a. pty-create mit resume-flag → claude --resume <id> --model X
   b. SessionOutputWatcher prüft ob Resume erfolgreich
   c. Fehler → showTerminalError + Handover-File schreiben
3. Falls keine session:
   a. pty-create (neu) → claude --model X
   b. SessionOutputWatcher extrahiert neue Session-ID
   c. ID → session-registry
```

### Handover-File

Bei `unexpected-new-session` Event schreibt der ContextProvider:
`.tiptap-context/.claude/session-handoff.md` mit:
- Aktueller Dokumentpfad
- Letzter bekannter Stand
- Grund des Neustarts

---

## Phase 4: Smoke-Test

**Scope:** `terminal-panel.js` – minimal.

Nach PTY-Start, vor Claude-Start:
```javascript
// Nach pty.create():
await window.pty.write('echo "__TERMINAL_KIT_READY__"\r');
// SessionOutputWatcher emittiert 'session-ready' Event
// Erst dann: showStatus('Terminal bereit') + Claude-Start-Kommando senden
```

Bis `session-ready` empfangen: Loading-Indikator im Terminal-Header zeigen.

---

## Was sich NICHT ändert

- `context-writer.js`: schreibt weiterhin alle Kontext-Dateien (ContextProvider-Rolle)
- Edit-Bridge (Request/Response JSON): bleibt unverändert
- `apply-editor-edit.js`: bleibt unverändert
- Paragraph-Nummerierung, viewport.html, etc.: unverändert
- `TerminalTransport`-Abstraktion: **nicht umsetzen** – kein WebSocket-Bedarf

---

## Reihenfolge + Abhängigkeiten

```
Phase 0 (manuell, kein Code)
  ↓
Phase 1 (main.js) ← unabhängig, kann als erstes umgesetzt werden
  ↓
Phase 2 (terminal-panel.js) ← benötigt Phase-1-Events
  ↓
Phase 3 (beide) ← benötigt Phase-1-Registry + Phase-2-Error-UI
  ↓
Phase 4 (terminal-panel.js) ← benötigt Phase-1-Watcher ('session-ready')
```

---

## Offene Fragen (für Phase 0 zu klären)

1. Welches exakte Format hat die Session-ID in der Claude-Ausgabe?
2. Ist `--resume <id>` in der aktuell installierten Claude-Version verfügbar?
3. Zeigt Claude `Model: claude-...` im Header bei jedem Start?
4. Funktioniert `--resume <id> --model <other>` oder erfordert das einen Fork?

---

## Nicht in diesem Plan

- `TerminalTransport`-Interface (kein Bedarf ohne WebSocket-Host)
- `ContextProvider`-Conflict-Detection (kein anderer Provider in TipTap AI)
- Claude-Version/Compatibility-Management (erst wenn konkret benötigt)
- Working-Root-Dropdown (aktuell ist der Kontext-Ordner fix an die offene Datei gebunden)
