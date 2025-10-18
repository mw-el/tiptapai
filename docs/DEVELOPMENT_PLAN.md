# TipTap AI - Development Plan & Status Tracking

**Projekt**: Intelligenter Markdown-Editor mit WYSIWYG
**Erstellt**: 2025-10-18
**Aktualisiert**: 2025-10-18
**Status**: Setup Phase
**Architektur**: Minimal Electron + TipTap + Frontmatter

---

## Projekt-Übersicht

Ein **minimalistischer** Desktop Markdown-Editor mit WYSIWYG-Funktionalität (TipTap), Dateiverwaltung und später KI-gestützten Schreibhilfen.

### Design-Prinzipien

- **WYSIWYG first**: TipTap für echtes What-You-See-Is-What-You-Get
- **Minimal Dependencies**: Nur 5 npm-Packages
- **Kein Framework-Overhead**: Vanilla JavaScript, kein React/Vue
- **Frontmatter statt DB**: Metadaten in YAML im Markdown
- **Isoliert**: nvm für Node.js, projekt-lokale Dependencies

### Kern-Features

1. **WYSIWYG-Editor**: TipTap mit Markdown I/O (das zentrale Feature!)
2. **Datei-Management**: Simpler File Tree (HTML/CSS/JS)
3. **Auto-Save**: Mit Frontmatter-Metadaten
4. **Lesezeichen**: "Wo aufgehört"-Tracking
5. **Rechtschreibprüfung**: LanguageTool (Docker, Phase 1)
6. **KI-Assistenz**: Stil-/Konsistenz-Checks (Phase 2, später)

### Technologie-Stack (Minimal!)

- **Desktop**: Electron 28
- **Editor**: TipTap 3.x (WYSIWYG!)
- **Language**: Vanilla JavaScript (kein TypeScript im MVP)
- **Persistenz**: YAML Frontmatter (keine SQLite!)
- **Node.js**: v20 via nvm
- **Rechtschreibung**: LanguageTool (Docker)

**Dependencies** (nur 5!):
```json
{
  "electron": "^28.0.0",
  "@tiptap/core": "^2.1.0",
  "@tiptap/starter-kit": "^2.1.0",
  "@tiptap/extension-markdown": "^2.1.0",
  "js-yaml": "^4.1.0"
}
```

---

## Projektstruktur (Minimal!)

```
tiptapai/
├── .nvmrc                    # Node.js Version (20)
├── package.json              # Dependencies
├── main.js                   # Electron Main Process
├── preload.js                # IPC Bridge
│
├── renderer/
│   ├── index.html            # Single HTML
│   ├── app.js                # TipTap Setup
│   ├── file-tree.js          # File Tree Logic
│   ├── frontmatter.js        # YAML Parser
│   ├── languagetool.js       # LT Client (Phase 1)
│   └── styles.css            # Styling
│
├── node_modules/             # Dependencies (auto)
│
├── docker/
│   └── docker-compose.yml    # LanguageTool
│
└── docs/
    ├── DEVELOPMENT_PLAN.md   # Dieser Plan (MASTER)
    ├── ARCHITECTURE.md       # Technische Architektur
    ├── SETUP.md              # Setup-Anleitung
    ├── MULTI_PROJECT.md      # Mehrere Projekte parallel
    ├── GUIDELINES.md         # Development Guidelines
    └── INSIGHTS.md           # Erkenntnisse
```

**Keine komplexe Ordnerstruktur!**

---

## Phasen-Planung

### Phase 0: Setup & Minimal MVP (Woche 1)

**Ziel**: Funktionierender Minimal-Editor

#### Sprint 0.1: Environment Setup ⏳

- [x] nvm installieren
- [x] Node.js 20 installieren
- [x] System-Dependencies (Electron)
- [x] Projekt-Struktur anlegen
- [x] Git-Repository

**Siehe**: docs/SETUP.md

#### Sprint 0.2: Minimal Electron App ⏳

- [ ] main.js: Basic Window
- [ ] preload.js: IPC Bridge (leer erst mal)
- [ ] renderer/index.html: Basic HTML
- [ ] renderer/app.js: Console-Log
- [ ] npm start funktioniert

**Akzeptanzkriterien**:
- Electron-Fenster öffnet sich
- "Hello World" sichtbar
- DevTools öffnen (Ctrl+Shift+I)
- Keine Fehler in Console

#### Sprint 0.3: TipTap Integration ⏳

- [ ] TipTap in app.js importieren
- [ ] Editor-Instanz erstellen
- [ ] StarterKit + Markdown Extension
- [ ] Basic Styling (lesbarer Editor)
- [ ] Kann tippen und formatieren

**Code-Struktur**:
```javascript
// renderer/app.js
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/extension-markdown';

const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [StarterKit, Markdown],
  content: '# Hello TipTap!',
});
```

**Akzeptanzkriterien**:
- Editor zeigt formatierten Text
- User kann tippen
- Bold/Italic funktioniert (Ctrl+B/I)
- Markdown wird korrekt konvertiert

---

### Phase 1: File-Operationen (Woche 2)

**Ziel**: Dateien öffnen/speichern mit Frontmatter

#### Sprint 1.1: IPC für File-Operationen

- [ ] main.js: IPC Handler für loadFile
- [ ] main.js: IPC Handler für saveFile
- [ ] main.js: IPC Handler für loadFileTree
- [ ] preload.js: contextBridge API
- [ ] Pfad-Validierung (nur .md-Dateien)

**Code**:
```javascript
// main.js
ipcMain.handle('load-file', async (event, filePath) => {
  if (!filePath.endsWith('.md')) throw new Error('Only .md');
  return await fs.readFile(filePath, 'utf-8');
});

// preload.js
contextBridge.exposeInMainWorld('api', {
  loadFile: (path) => ipcRenderer.invoke('load-file', path),
  saveFile: (path, content) => ipcRenderer.invoke('save-file', path, content),
});
```

**Akzeptanzkriterien**:
- `window.api.loadFile()` funktioniert
- `window.api.saveFile()` funktioniert
- Fehler bei ungültigen Pfaden

#### Sprint 1.2: Frontmatter-Parsing

- [ ] frontmatter.js: parseFile()
- [ ] frontmatter.js: stringifyFile()
- [ ] Test mit Beispiel-Datei
- [ ] Metadaten extrahieren funktioniert

**Code**:
```javascript
// frontmatter.js
import yaml from 'js-yaml';

export function parseFile(content) {
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content };

  return {
    metadata: yaml.load(match[1]),
    content: match[2]
  };
}
```

**Test-Datei**:
```markdown
---
lastPosition: 100
---

# Test Content
```

**Akzeptanzkriterien**:
- Parse findet Frontmatter
- Metadata ist JavaScript-Objekt
- Content ohne Frontmatter

#### Sprint 1.3: File Tree (Simpel)

- [ ] HTML: ul/li Struktur
- [ ] CSS: Basic Styling
- [ ] JavaScript: Click-Handler
- [ ] Rekursiv: Ordner + Dateien
- [ ] Nur .md-Dateien anzeigen

**HTML**:
```html
<div id="file-tree">
  <ul>
    <li class="folder">📁 Projekt
      <ul>
        <li class="file" data-path="/path/to/file.md">📄 kapitel1.md</li>
      </ul>
    </li>
  </ul>
</div>
```

**Akzeptanzkriterien**:
- File Tree zeigt Dateien
- Click öffnet Datei im Editor
- Ordner können auf-/zugeklappt werden

#### Sprint 1.4: Load & Save Integration

- [ ] File Tree Click → Datei laden
- [ ] Editor Content setzen
- [ ] Frontmatter parsen
- [ ] Editor onChange → Auto-Save
- [ ] Debounce (2 Sekunden)

**Workflow**:
```
User click Datei
  → loadFile()
  → parseFile()
  → editor.setContent()

User tippt
  → onChange (debounced 2s)
  → stringifyFile()
  → saveFile()
```

**Akzeptanzkriterien**:
- Click auf Datei lädt im Editor
- Tippen triggert Auto-Save
- Frontmatter bleibt erhalten

---

### Phase 1.5: Lesezeichen (Woche 3)

**Ziel**: "Wo aufgehört"-Feature

#### Sprint 1.5.1: Position speichern

- [ ] onUpdate: Cursor-Position speichern
- [ ] Frontmatter: lastPosition field
- [ ] Debounced (2s, zusammen mit Auto-Save)

**Frontmatter**:
```yaml
---
lastPosition: 1245
lastEdit: 2025-10-18T14:30:00Z
---
```

**Code**:
```javascript
const autoSave = debounce(() => {
  const markdown = editor.storage.markdown.getMarkdown();
  const metadata = {
    lastPosition: editor.state.selection.from,
    lastEdit: new Date().toISOString()
  };
  const complete = stringifyFile(markdown, metadata);
  window.api.saveFile(currentPath, complete);
}, 2000);
```

**Akzeptanzkriterien**:
- Position wird gespeichert
- Frontmatter korrekt

#### Sprint 1.5.2: Zur Position springen

- [ ] Beim Öffnen: Frontmatter lesen
- [ ] Dialog: "Zur letzten Position?"
- [ ] Wenn Ja: editor.setTextSelection()
- [ ] Wenn Nein: Anfang

**Dialog** (erstmal simpel mit confirm()):
```javascript
if (metadata.lastPosition) {
  const shouldJump = confirm('Zur letzten Position springen?');
  if (shouldJump) {
    editor.commands.setTextSelection(metadata.lastPosition);
  }
}
```

**Akzeptanzkriterien**:
- Dialog erscheint
- Sprung funktioniert
- Cursor an richtiger Stelle

---

### Phase 2: LanguageTool (Woche 4-5)

**Ziel**: Rechtschreibprüfung mit Fehler-Highlighting

#### Sprint 2.1: LanguageTool Setup

- [ ] docker-compose.yml erstellen
- [ ] LanguageTool starten
- [ ] Test: curl localhost:8010
- [ ] languagetool.js: Client-Class

**Code**:
```javascript
// languagetool.js
export class LanguageToolClient {
  constructor(baseUrl = 'http://localhost:8010') {
    this.baseUrl = baseUrl;
  }

  async check(text, language = 'de-DE') {
    const response = await fetch(`${this.baseUrl}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language })
    });
    return await response.json();
  }
}
```

**Akzeptanzkriterien**:
- Docker-Container läuft
- API antwortet
- Client parst Response

#### Sprint 2.2: Fehler-Highlighting

- [ ] TipTap Mark Extension (SpellingError)
- [ ] CSS: red wavy underline
- [ ] Nach Pause (3s): Text prüfen
- [ ] Fehler im Editor markieren

**Extension**:
```javascript
const SpellingError = Mark.create({
  name: 'spellingError',
  addAttributes() {
    return {
      message: { default: null },
      replacements: { default: [] },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-spelling-error]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', {
      ...HTMLAttributes,
      'data-spelling-error': '',
      class: 'spelling-error'
    }, 0];
  },
});
```

**CSS**:
```css
.spelling-error {
  text-decoration: wavy underline red;
}
```

**Akzeptanzkriterien**:
- Fehler werden unterstrichen
- Pause triggert Prüfung
- Keine Performance-Probleme

#### Sprint 2.3: Korrektur-UI

- [ ] Click auf Fehler → Popup
- [ ] Vorschläge anzeigen
- [ ] Accept → Text ersetzen
- [ ] Ignore → Mark entfernen

**UI** (erstmal simpel):
```javascript
// Click-Handler
editor.on('click', ({ editor, pos }) => {
  const marks = editor.state.doc.marksAt(pos);
  const errorMark = marks.find(m => m.type.name === 'spellingError');

  if (errorMark) {
    showCorrectionPopup(errorMark.attrs);
  }
});

function showCorrectionPopup(attrs) {
  // Erstmal: alert() mit Vorschlägen
  // Später: Schönes Popup
  const choice = prompt(`Fehler: ${attrs.message}\n\nVorschläge: ${attrs.replacements.join(', ')}`);
  if (choice) {
    // Text ersetzen
  }
}
```

**Akzeptanzkriterien**:
- Click zeigt Popup
- Accept ersetzt Text
- Ignore entfernt Mark

---

### Phase 3: Polish (Woche 6)

**Ziel**: Stabiles, nutzbares MVP

#### Sprint 3.1: UI Polish

- [ ] Besseres Layout (Grid)
- [ ] Schöneres Styling
- [ ] Icons statt Emojis (optional)
- [ ] Responsive Sidebar

#### Sprint 3.2: Error Handling

- [ ] File-Load Fehler abfangen
- [ ] LanguageTool offline → Meldung
- [ ] Invalid Frontmatter → Warnung
- [ ] Console-Logs aufräumen

#### Sprint 3.3: Testing

- [ ] Manuell: File Tree
- [ ] Manuell: Editor
- [ ] Manuell: Auto-Save
- [ ] Manuell: Lesezeichen
- [ ] Manuell: Rechtschreibung

#### Sprint 3.4: Dokumentation

- [ ] README aktualisieren
- [ ] Screenshots erstellen (optional)
- [ ] INSIGHTS.md updaten

**Deliverable**: **Nutzbare Version 1.0!**

---

### Phase 4: KI-Features (Woche 7+, später)

**Ziel**: Intelligente Schreibhilfen

#### Features (grob geplant)

- [ ] KI-Provider-Abstraction (OpenAI/Claude/Ollama)
- [ ] Prompt-Bibliothek (JSON-Dateien)
- [ ] Charakter-Konsistenz-Check
- [ ] Stil-Konsistenz-Check
- [ ] Namen-Konsistenz
- [ ] Timeline-Check

**Siehe**: Ursprüngliches DEVELOPMENT_PLAN für Details

**Aber**: Erst nach solidem MVP!

---

## Aktueller Status

**Phase**: Phase 0 - Setup
**Sprint**: 0.1 - Environment Setup
**Letzte Aktualisierung**: 2025-10-18

### Abgeschlossen
- ✅ Dokumentation erstellt
- ✅ Architektur definiert (minimal!)
- ✅ Setup-Anleitung geschrieben

### In Arbeit
- ⏳ Setup durchführen (nvm, npm, Projekt-Struktur)

### Nächste Schritte
1. Setup nach SETUP.md durchführen
2. Minimal Electron-App (Sprint 0.2)
3. TipTap integrieren (Sprint 0.3)

---

## Wichtige Entscheidungen

### Architektur
- **Electron (minimal)**: Kein React/Vue, nur Vanilla JS
- **Frontmatter statt DB**: Einfacher, Git-freundlich
- **nvm statt conda**: Nativer für Node.js

### Scope
- **MVP first**: Nur essenzielle Features
- **KI später**: Erst wenn Basis stabil
- **No over-engineering**: Keep it simple

---

## Offene Fragen

- [ ] Multi-Tab oder Single-File? → MVP: Single-File
- [ ] File Watching (externe Änderungen)? → MVP: Nein
- [ ] Dark Mode? → Später
- [ ] Besseres Korrektur-Popup? → Nach MVP

---

## Notizen

### Was anders ist als ursprünglich geplant

**Vereinfacht**:
- ❌ Kein React/TypeScript → ✅ Vanilla JS
- ❌ Keine SQLite → ✅ Frontmatter
- ❌ Keine 50 Dependencies → ✅ Nur 5
- ❌ Kein Zustand Store → ✅ Simple Variablen
- ❌ Keine react-complex-tree → ✅ Simple HTML/CSS

**Warum**: Fokus auf WYSIWYG (TipTap) mit minimalem Overhead

**Resultat**: Viel einfacher zu entwickeln und warten!

---

## Beim nächsten Mal weitermachen mit

**TODO**: Sprint 0.1 - Setup durchführen

1. SETUP.md durchgehen
2. nvm installieren
3. Node.js 20 installieren
4. Projekt initialisieren
5. Minimal Electron-App starten

**Siehe**: docs/SETUP.md für Details

---

## Entwicklungs-Rhythmus

### Vor jeder Session
1. DEVELOPMENT_PLAN.md öffnen
2. Status checken
3. Nächsten Sprint identifizieren

### Nach jedem Sprint
1. Status aktualisieren (✅/⏳/❌)
2. Erkenntnisse in INSIGHTS.md
3. Nächsten Sprint vorbereiten

### Nach jeder Phase
1. Deliverable testen
2. Dokumentation aktualisieren
3. Git Commit mit Phase-Tag

---

Diese Planung ist ein lebendiges Dokument und wird fortlaufend aktualisiert!
