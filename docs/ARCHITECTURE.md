# TipTap AI - Technische Architektur

**Projekt**: Intelligenter Markdown-Editor
**Letzte Aktualisierung**: 2025-11-13
**Architektur**: Minimal Electron + TipTap + Frontmatter + HTML Protection

---

## Design-Philosophie

**Einfachheit über Komplexität:**
- Minimal Dependencies (nur 5!)
- Kein Framework-Overhead (kein React/Vue/TypeScript)
- Vanilla JavaScript
- Frontmatter statt Datenbank
- WYSIWYG mit TipTap (das zentrale Requirement)

---

## Überblick

TipTap AI ist eine **minimalistische Electron Desktop-App**, die:
- Lokale Markdown-Dateien mit WYSIWYG-Editor (TipTap) bearbeitet
- Metadaten im YAML-Frontmatter speichert (keine separate DB)
- LanguageTool für Rechtschreibprüfung nutzt (Docker, self-hosted)
- Später: KI-gestützte Schreibhilfen (optional)

---

## System-Architektur

```
┌─────────────────────────────────────────────────────────────┐
│              Electron Desktop Window                        │
│              (Single Window, Native Look)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  File Tree   │  │   Editor View    │  │  Side Panel  │ │
│  │  (HTML/CSS)  │  │   (TipTap)       │  │  (Optional)  │ │
│  │              │  │                  │  │              │ │
│  │  - Navigate  │  │  - WYSIWYG Edit  │  │  - Errors    │ │
│  │  - ul/li     │  │  - Markdown I/O  │  │  - Bookmarks │ │
│  │  - Click     │  │  - Highlighting  │  │              │ │
│  └──────────────┘  └──────────────────┘  └──────────────┘ │
│                                                             │
│                     Vanilla JavaScript                      │
│              (Kein React, kein Framework)                   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ↓                    ↓                    ↓
    IPC Bridge           IPC Bridge          IPC Bridge
         │                    │                    │
         ↓                    ↓                    ↓
┌──────────────────────────────────────────────────────────────┐
│              Electron Main Process (Node.js)                 │
├──────────────────────────────────────────────────────────────┤
│  - File System (fs/promises)                                 │
│  - Frontmatter Parser (js-yaml)                              │
│  - Window Management                                         │
└──────────────────────────────────────────────────────────────┘
         │                    │                    │
         ↓                    ↓                    ↓
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│   Markdown   │    │  LanguageTool    │    │  KI APIs     │
│   Files      │    │  (Docker)        │    │  (Phase 2)   │
│              │    │                  │    │              │
│  mit YAML    │    │  localhost:8010  │    │  - OpenAI    │
│  Frontmatter │    │                  │    │  - Claude    │
│              │    │                  │    │  - Ollama    │
└──────────────┘    └──────────────────┘    └──────────────┘
```

---

## Technologie-Stack (Minimal!)

### Core Dependencies (nur 5!)

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "@tiptap/core": "^2.1.0",
    "@tiptap/starter-kit": "^2.1.0",
    "@tiptap/extension-markdown": "^2.1.0",
    "js-yaml": "^4.1.0"
  }
}
```

**Das war's!** Keine 50+ Dependencies wie ursprünglich geplant.

### Warum diese?

1. **Electron**: Desktop-Framework (Chromium + Node.js embedded)
2. **TipTap**: WYSIWYG Markdown-Editor (das zentrale Requirement!)
3. **js-yaml**: Frontmatter-Parsing

---

## HTML Protection System (Added 2025-11-13)

### Problem
TipTap's Markdown extension strips or transforms raw HTML/Hugo shortcodes, causing data loss.

### Solution: Placeholder-Based Protection

```javascript
// 1. Before loading into TipTap
import { escapeHtml } from './utils/html-escape.js';

const { escapedContent, htmlMap } = escapeHtml(markdown);
// "{{< figure >}}" → "XHTMLX1X"
// "<div class='foo'>" → "XHTMLX2X"

editor.commands.setContent(escapedContent);

// 2. Before saving
import { unescapeHtml } from './utils/html-escape.js';

const markdown = editor.getMarkdown();
const restored = unescapeHtml(markdown, htmlMap);
// "XHTMLX1X" → "{{< figure >}}"
```

### Features
- **Visual Highlighting**: Placeholders styled with blue background
- **Click-to-Edit**: Click placeholder opens HTML editor modal
- **Roundtrip Validation**: Detect if HTML would be lost
- **Safe Patterns**: Alphanumeric-only placeholders (XHTMLX123X)

### Protected Elements
- HTML comments: `<!--...-->`
- Hugo shortcodes: `{{< ... >}}`
- HTML tags: `<div>`, `<table>`, `<br/>`, etc.
- Self-closing tags: `<img ... />`

---

## Komponenten-Übersicht

### Frontend (Renderer Process)

**Alles Vanilla JavaScript, kein Framework!**

#### 1. File Tree (HTML/CSS/JS)

```html
<!-- Einfaches HTML -->
<div id="file-tree">
  <ul>
    <li class="folder">
      <span>📁 Projekt</span>
      <ul>
        <li class="file" data-path="/path/to/file.md">📄 kapitel1.md</li>
      </ul>
    </li>
  </ul>
</div>
```

```javascript
// file-tree.js - Vanilla JS!
document.getElementById('file-tree').addEventListener('click', (e) => {
  if (e.target.classList.contains('file')) {
    const path = e.target.dataset.path;
    loadFile(path);
  }
});

async function loadFile(path) {
  const content = await window.api.loadFile(path);
  editor.commands.setContent(content);
}
```

**Keine react-complex-tree, nur simples HTML!**

#### 2. Editor (TipTap)

```javascript
// app.js
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/extension-markdown';

const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [
    StarterKit,
    Markdown,
  ],
  content: '',
  onUpdate: ({ editor }) => {
    const markdown = editor.storage.markdown.getMarkdown();
    autoSave(markdown);
  },
});
```

**Kein React-Wrapper, direkte TipTap-API!**

#### 3. Frontmatter-Handling

```javascript
// frontmatter.js
import yaml from 'js-yaml';

function parseFile(content) {
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content };

  const metadata = yaml.load(match[1]);
  const body = match[2];
  return { metadata, content: body };
}

function stringifyFile(content, metadata) {
  const yamlStr = yaml.dump(metadata);
  return `---\n${yamlStr}---\n\n${content}`;
}

// Metadaten lesen
const { metadata, content } = parseFile(fileContent);
console.log(metadata.lastPosition);  // 1245
console.log(metadata.bookmarks);     // [{pos: 500, label: "Review"}]

// Metadaten schreiben
const updated = stringifyFile(content, {
  lastPosition: editor.state.selection.from,
  lastEdit: new Date().toISOString(),
  bookmarks: [...]
});
```

---

### Backend (Main Process)

#### 1. File System Handler

```javascript
// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs').promises;
const path = require('path');

// IPC: File Tree laden
ipcMain.handle('load-file-tree', async (event, rootPath) => {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() || e.name.endsWith('.md'))
    .map(e => ({
      name: e.name,
      path: path.join(rootPath, e.name),
      type: e.isDirectory() ? 'folder' : 'file'
    }));
});

// IPC: Datei laden
ipcMain.handle('load-file', async (event, filePath) => {
  const content = await fs.readFile(filePath, 'utf-8');
  return content;
});

// IPC: Datei speichern
ipcMain.handle('save-file', async (event, filePath, content) => {
  await fs.writeFile(filePath, content, 'utf-8');
  return { success: true };
});
```

**Kein komplexes Database-Layer, nur File I/O!**

#### 2. IPC Bridge (Preload)

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadFileTree: (path) => ipcRenderer.invoke('load-file-tree', path),
  loadFile: (path) => ipcRenderer.invoke('load-file', path),
  saveFile: (path, content) => ipcRenderer.invoke('save-file', path, content),
});
```

**Renderer kann dann nutzen:**
```javascript
const content = await window.api.loadFile('/path/to/file.md');
```

---

## Datenpersistenz: Frontmatter statt Datenbank

**Keine SQLite, alles im Markdown-Frontmatter!**

### Beispiel-Datei:

```markdown
---
lastPosition: 1245
lastEdit: 2025-10-18T14:30:00Z
bookmarks:
  - pos: 500
    label: "Kapitel 3 Review"
  - pos: 1245
    label: "Hier weitermachen"
reviewProgress: 57
wordCount: 15000
---

# Mein Dokument

Hier beginnt der eigentliche Content...
```

### Vorteile:

- ✅ Keine separate Datenbank nötig
- ✅ Metadaten reisen mit der Datei
- ✅ Git-freundlich (Änderungen sichtbar)
- ✅ Human-readable
- ✅ Standard (Jekyll, Hugo, Obsidian nutzen das)
- ✅ Backup = einfach Dateien kopieren

### Nachteile:

- ⚠️ Projektweite Queries schwieriger (aber im MVP nicht nötig)
- ⚠️ User sieht Frontmatter beim manuellen Öffnen (aber nicht in der App)

**Trade-off ist es wert für die Einfachheit!**

---

## Projekt-Struktur (Minimal!)

```
tiptapai/
├── package.json              # Dependencies (nur 5!)
├── main.js                   # Electron Main Process
├── preload.js                # IPC Bridge
│
├── renderer/
│   ├── index.html            # Single HTML File
│   ├── app.js                # TipTap Setup
│   ├── file-tree.js          # File Tree Logic
│   ├── frontmatter.js        # YAML Parser
│   └── styles.css            # Minimales Styling
│
├── node_modules/             # Dependencies (auto-generiert)
│
├── docker/
│   └── docker-compose.yml    # LanguageTool
│
└── docs/
    ├── DEVELOPMENT_PLAN.md
    ├── ARCHITECTURE.md       # Dieses Dokument
    ├── SETUP.md
    └── MULTI_PROJECT.md
```

**Keine komplexe Ordnerstruktur mit 20 Unterordnern!**

---

## Datenfluss-Szenarien

### Szenario 1: Datei öffnen

```
1. User klickt auf Datei im File Tree
   ↓
2. JavaScript Event Handler (file-tree.js)
   ↓
3. window.api.loadFile(path) → IPC Call
   ↓
4. Main Process: fs.readFile(path)
   ↓
5. Content zurück an Renderer
   ↓
6. frontmatter.js: Parse YAML
   ↓
7. Metadata extrahieren (lastPosition, bookmarks)
   ↓
8. Dialog: "Zur letzten Position springen?" (falls vorhanden)
   ↓
9. editor.commands.setContent(content)
   ↓
10. Optional: editor.commands.setTextSelection(lastPosition)
```

### Szenario 2: Auto-Save mit Metadaten

```
1. User tippt im Editor
   ↓
2. TipTap onUpdate Event
   ↓
3. Debounce (2 Sekunden)
   ↓
4. Markdown extrahieren: editor.storage.markdown.getMarkdown()
   ↓
5. Metadaten sammeln:
   - lastPosition: editor.state.selection.from
   - lastEdit: new Date().toISOString()
   - bookmarks: aus State
   ↓
6. frontmatter.js: stringifyFile(content, metadata)
   ↓
7. window.api.saveFile(path, completeContent)
   ↓
8. Main Process: fs.writeFile(path, content)
```

### Szenario 3: Rechtschreibprüfung (Phase 1)

```
1. User tippt → Pause (3 Sekunden)
   ↓
2. Text extrahieren: editor.getText()
   ↓
3. HTTP Request zu LanguageTool (localhost:8010)
   ↓
4. Fehler zurück
   ↓
5. TipTap Marks setzen (rote Unterstreichung)
   ↓
6. User klickt auf Fehler → Bubble Menu
   ↓
7. User wählt Korrektur → Text ersetzen
```

---

## LanguageTool Integration

### Docker Setup

```yaml
# docker/docker-compose.yml
version: '3'
services:
  languagetool:
    image: erikvl87/languagetool
    ports:
      - "8010:8010"
    environment:
      - Java_Xms=512m
      - Java_Xmx=2g
```

### Client (Renderer)

```javascript
// languagetool.js
class LanguageToolClient {
  constructor(baseUrl = 'http://localhost:8010') {
    this.baseUrl = baseUrl;
  }

  async check(text, language = 'de-DE') {
    const response = await fetch(`${this.baseUrl}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language })
    });

    const data = await response.json();
    return data.matches.map(match => ({
      offset: match.offset,
      length: match.length,
      message: match.message,
      replacements: match.replacements.map(r => r.value)
    }));
  }
}

// Verwendung
const lt = new LanguageToolClient();
const errors = await lt.check(editor.getText());
// Markiere Fehler im Editor
```

**Kein komplexes Service-Layer, direkte Fetch-Calls!**

---

## Performance-Überlegungen

### Kritische Pfade

1. **Auto-Save**: Debounce 2 Sekunden
2. **Proofread**: Debounce 3 Sekunden
3. **File Tree**: Lazy-Loading für große Verzeichnisse (später)

### Optimierungen

```javascript
// Debounce-Utility (einfach!)
function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

// Auto-Save
const autoSave = debounce(async (markdown) => {
  const complete = stringifyFile(markdown, getMetadata());
  await window.api.saveFile(currentPath, complete);
}, 2000);

// Proofread
const proofread = debounce(async (text) => {
  const errors = await languageTool.check(text);
  applyErrorMarks(errors);
}, 3000);
```

---

## Security

### Electron-Sicherheit

```javascript
// main.js
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    contextIsolation: true,      // ✅ Aktiviert
    nodeIntegration: false,       // ✅ Deaktiviert
    sandbox: true,                // ✅ Aktiviert
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### IPC-Sicherheit

```javascript
// Pfad-Validierung in Main Process
ipcMain.handle('load-file', async (event, filePath) => {
  // Validierung
  if (!filePath.endsWith('.md')) {
    throw new Error('Only .md files allowed');
  }
  if (filePath.includes('..')) {
    throw new Error('Path traversal not allowed');
  }

  // Dann erst laden
  return await fs.readFile(filePath, 'utf-8');
});
```

---

## KI-Integration (Phase 2, später)

**Modulares System, ähnlich wie LanguageTool:**

```javascript
// ai-client.js
class AIClient {
  constructor(provider, apiKey) {
    this.provider = provider; // 'openai', 'anthropic', 'ollama'
    this.apiKey = apiKey;
  }

  async check(prompt, text) {
    // Provider-spezifische Logik
  }
}

// Prompts als einfache JSON-Dateien
const prompts = {
  characterConsistency: {
    template: "Analysiere Charakter-Konsistenz: {{text}}",
    variables: ['text']
  }
};
```

**Kommt später, jetzt nicht über-engineeren!**

---

## Testing-Strategie

### Manuelles Testing (MVP)

- File Tree: Dateien anklicken → Editor zeigt Content
- Editor: Tippen → Auto-Save nach 2s
- Frontmatter: Position speichern → Beim Öffnen wieder da
- LanguageTool: Fehler unterstreichen → Korrektur übernehmen

### Automatische Tests (später)

```javascript
// Beispiel mit Vitest
import { test, expect } from 'vitest';
import { parseFile, stringifyFile } from './frontmatter.js';

test('parse frontmatter', () => {
  const input = '---\nlastPosition: 123\n---\n\nContent';
  const { metadata, content } = parseFile(input);
  expect(metadata.lastPosition).toBe(123);
  expect(content).toBe('Content');
});
```

**Aber erst nach MVP, jetzt: Manuell testen!**

---

## Deployment (später)

### Development

```bash
npm start  # Electron-Fenster öffnet sich
```

### Distribution (wenn fertig)

```bash
npm install electron-builder --save-dev
npx electron-builder --linux AppImage
# Resultat: dist/TipTapAI-1.0.0.AppImage
```

**Aber zuerst: MVP entwickeln!**

---

## Entscheidungen & Begründungen

| Was | Entscheidung | Begründung |
|-----|--------------|------------|
| **Framework** | Vanilla JS | WYSIWYG braucht TipTap, aber kein React-Overhead |
| **Persistenz** | Frontmatter | Einfacher als SQLite, Git-freundlich |
| **Desktop** | Electron | TipTap braucht Web-Technologie, Electron ist einfachste Lösung |
| **State** | Keine Library | Einfache Variablen reichen für MVP |
| **Build** | Minimal | Kein Webpack, nur native ES Modules |
| **Types** | Keine | TypeScript erst wenn Projekt wächst |

---

## Nächste Schritte

1. ✅ Architektur definiert
2. ⏳ Setup (nvm, npm install)
3. ⏳ Minimal Electron-App (Hello World)
4. ⏳ TipTap integrieren
5. ⏳ File Tree (simpel)
6. ⏳ Frontmatter
7. ⏳ Auto-Save
8. ⏳ LanguageTool

**Siehe DEVELOPMENT_PLAN.md für Details.**
