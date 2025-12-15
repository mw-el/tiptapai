# TipTap AI - Project Rules for Claude Code

**Project:** TipTap AI - Intelligenter Markdown-Editor
**Last Updated:** 2025-12-10 22:30

---

## Projekt-Übersicht

**Zentrale Anforderung:** WYSIWYG Markdown-Editor mit TipTap
**Architektur:** Minimal Electron + TipTap + Frontmatter (keine SQLite!)
**Sprache:** Vanilla JavaScript (kein TypeScript im MVP!)
**Dependencies:** Nur 5! (electron, @tiptap/core, @tiptap/starter-kit, @tiptap/extension-markdown, js-yaml)

---

## Kritische Regeln

### 1. FAIL FAST - Wichtigste Regel!
```javascript
// ❌ VERBOTEN
try {
  const content = await loadFile(path);
} catch {
  content = '';  // Stiller Fehler!
}

// ✅ RICHTIG
const content = await loadFile(path);  // Exception schlägt durch
```

**KEINE stillen Fallbacks ohne explizite Autorisierung!**

### 2. Nur das Geforderte tun
- Keine ungefragten "Verbesserungen"
- Kein Refactoring von funktionierendem Code
- Keine Format-Änderungen ohne Anfrage
- Keine neuen Features ohne Rücksprache

### 3. Architektur NICHT ändern
- ❌ Kein React/Vue hinzufügen
- ❌ Kein TypeScript im MVP
- ❌ Keine SQLite (Frontmatter nutzen!)
- ❌ Keine State-Management-Library

**Bei Architektur-Änderungen:** ERST Konzept vorlegen!

---

## Technologie-Stack (Final)

### Erlaubt
- Electron 28
- TipTap 3.x (core, starter-kit, extension-markdown)
- js-yaml (für Frontmatter)
- Vanilla JavaScript
- Native ES Modules

### VERBOTEN (im MVP)
- ❌ React/Vue/Svelte
- ❌ TypeScript
- ❌ Zustand/Redux
- ❌ SQLite/andere DBs
- ❌ Webpack/Vite (nur wenn wirklich nötig)
- ❌ react-complex-tree (simples HTML nutzen!)

---

## Persistenz: Frontmatter statt DB!

**IMMER Frontmatter nutzen:**

```markdown
---
lastPosition: 1245
lastEdit: 2025-10-18T14:30:00Z
bookmarks:
  - pos: 500
    label: "Review"
---

# Content
```

**NIEMALS SQLite hinzufügen ohne explizite Anfrage!**

---

## Datei-Konventionen

### Development Documents
**Format:** `TIPTAPAI_<type>_YYYY-MM-DD-HHMM.md`

**Workflow:**
1. Document im Root anlegen
2. Nach jedem Schritt updaten + neuer Timestamp
3. Bei Fertigstellung: Status ✅ → nach `docs/archive/`

### Backup vor Überarbeitung
```bash
# ❌ FALSCH
mv file.js file-new.js

# ✅ RICHTIG
cp file.js file_backup_before-feature.js
# Dann file.js bearbeiten (Name bleibt!)
```

---

## Projekt-Struktur

```
tiptapai/
├── TIPTAPAI_<active-task>_YYYY-MM-DD-HHMM.md  # AKTIV
├── CHANGELOG_YYYY-MM-DD-HHMM.md
├── CLAUDE.md                                   # Diese Datei
├── package.json
├── main.js                                     # Electron Main
├── preload.js                                  # IPC Bridge
├── renderer/
│   ├── index.html
│   ├── app.js                                  # TipTap Setup
│   ├── file-tree.js
│   ├── frontmatter.js                          # YAML Parser
│   └── styles.css
├── docker/
│   └── docker-compose.yml                      # LanguageTool
└── docs/
    ├── DEVELOPMENT_PLAN.md                     # Master Plan
    ├── ARCHITECTURE.md
    ├── SETUP.md
    ├── archive/                                # Fertige Dev Docs
    └── lessons-learned/                        # Schwierige Probleme
```

---

## Code-Style

### JavaScript
```javascript
// ✅ Async/Await (nicht Callbacks)
const content = await loadFile(path);

// ✅ ES Modules
import { Editor } from '@tiptap/core';

// ✅ Explizite Fehlerbehandlung
if (!filePath.endsWith('.md')) {
  throw new Error('Only .md files allowed');
}

// ❌ KEINE leeren try-catch
try {
  // ...
} catch {
  // Nichts tun - VERBOTEN!
}
```

### HTML/CSS
```html
<!-- ✅ Semantisches HTML -->
<div id="file-tree">
  <ul>
    <li class="folder">Ordner</li>
    <li class="file" data-path="/path/to/file.md">file.md</li>
  </ul>
</div>

<!-- ❌ Keine komplexen Frameworks -->
<!-- Kein Bootstrap, kein Tailwind im MVP -->
```

### Icons
**NUR Google Material Design Icons (Monochrome)**
- ❌ Keine bunten Emoji-Icons (📁📄🎨)
- ✅ Material Icons via SVG oder Icon-Font
- ✅ Monochrome Design (keine Farben in Icons)

```html
<!-- ✅ RICHTIG: Material Icons -->
<span class="material-icons">folder</span>
<span class="material-icons">description</span>

<!-- ❌ FALSCH: Emoji -->
<span>📁</span>
<span>📄</span>
```

---

## Git-Workflow

### Commit-Format
```
type(scope): description

Types: feat, fix, docs, refactor, test, chore
```

**Beispiele:**
```
feat(editor): integrate TipTap with markdown support
fix(filetree): correct path validation for .md files
docs(setup): add Ubuntu 24.04 specific instructions
```

### Vor jedem Commit
- [ ] Development Document aktualisiert
- [ ] Timestamp im Document-Namen erneuert
- [ ] Nur gewollte Änderungen committen
- [ ] Tests laufen (wenn vorhanden)

---

## Testing (später)

### MVP: Manuell testen
- File Tree: Dateien anklicken
- Editor: Tippen, Formatieren
- Auto-Save: Nach 2s speichern
- Frontmatter: Metadaten korrekt

### Nach MVP: Automatische Tests
```javascript
// Beispiel (Vitest)
import { parseFile } from './frontmatter.js';

test('parse frontmatter', () => {
  const input = '---\nlastPosition: 123\n---\n\nContent';
  const { metadata, content } = parseFile(input);
  expect(metadata.lastPosition).toBe(123);
});
```

---

## Dokumentation

### Wann updaten?
- Nach jedem Sprint
- Bei Architektur-Änderungen
- Bei schwierigen Problemen → `docs/lessons-learned/`
- CHANGELOG bei jeder signifikanten Änderung

### Was dokumentieren?
- **DEVELOPMENT_PLAN.md:** Sprint-Status (✅/⏳/❌)
- **INSIGHTS.md:** Entscheidungen und Begründungen
- **Active Dev Document:** Fortschritt nach jedem Schritt
- **CHANGELOG:** Was wurde geändert?

---

## Häufige Fehler (DON'Ts)

### ❌ React hinzufügen
**Grund:** Vanilla JS ist bewusste Entscheidung für MVP
**Wenn nötig:** Erst Konzept vorlegen!

### ❌ SQLite vorschlagen
**Grund:** Frontmatter ist bewusste Entscheidung
**Ausnahme:** Wenn projektweite Queries wirklich nötig sind

### ❌ TypeScript nutzen
**Grund:** Zu komplex für MVP
**Später:** Kann nach MVP hinzugefügt werden

### ❌ Komplexe State Management
**Grund:** Einfache Variablen reichen für MVP
**Ausnahme:** Wenn wirklich nötig, dann Konzept vorlegen

### ❌ Stille Fallbacks
**Grund:** Fail-Fast Prinzip
**Niemals:** `try-catch` ohne explizite Fehlerbehandlung

---

## Bash-Befehle (häufig genutzt)

```bash
# Development starten
cd ~/tiptapai
nvm use
npm start

# Dependencies installieren
npm install

# LanguageTool starten (WICHTIG: Muss vor App-Start laufen!)
cd /home/matthias/_AA_TipTapAi/LanguageTool-6.6
java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin "*" > /tmp/languagetool.log 2>&1 &

# LanguageTool Status prüfen
curl http://localhost:8081/v2/languages | head -5

# LanguageTool stoppen
pkill -f "languagetool-server.jar"

# Git
git status
git add .
git commit -m "type(scope): description"

# Logs checken
tail -f /tmp/languagetool.log
```

---

## Environment

- **System:** Ubuntu 24.04, X11, RTX 5000 GPU
- **Node.js:** v20 via nvm
- **Package Manager:** npm (nicht yarn/pnpm)
- **Docker:** Für LanguageTool

---

## Bei Unsicherheit

1. **STOP** - Nicht einfach umsetzen
2. **Fragen** - Konzept vorlegen
3. **Plan erstellen** - Schritt für Schritt
4. **Freigabe abwarten**
5. **Dann umsetzen**

---

## Context Management

### `/clear` verwenden
- Nach jedem abgeschlossenen Feature
- Spätestens alle 30-45 Minuten
- Wenn Claude gegen diese Guidelines verstößt

### Diese Datei aktuell halten
- Neue Regeln bei Bedarf hinzufügen
- Häufige Fehler dokumentieren
- Bash-Befehle ergänzen

---

## Desktop Integration (Electron)

### Desktop File Template

```desktop
[Desktop Entry]
Version=1.0
Type=Application
Name=TipTap AI
Comment=Intelligenter Markdown-Editor
Icon=/path/to/tiptapai.png
Exec=/usr/bin/electron /path/to/main.js
Path=/path/to/app/directory
Terminal=false
Categories=Utility;Accessories;TextEditor;
StartupNotify=true
StartupWMClass=tiptapai
```

**Install location:**
```bash
~/.local/share/applications/tiptapai.desktop
```

**Update database:**
```bash
update-desktop-database ~/.local/share/applications/
```

### Icon Display

**Match WM_CLASS in Electron:**
```javascript
const win = new BrowserWindow({
  webPreferences: { preload: path.join(__dirname, 'preload.js') }
});
// WM_CLASS wird automatisch von Electron gesetzt
```

**Validation:**
```bash
# Check WM_CLASS
xprop WM_CLASS  # Click on app window
# Should show matching value with desktop file

# Check desktop file
desktop-file-validate ~/.local/share/applications/tiptapai.desktop

# Test launch
gtk-launch tiptapai.desktop
```

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| No icon in dock | WM_CLASS mismatch | Verify Electron window class matches StartupWMClass |
| Icon not found | Wrong path | Use absolute path, verify file exists |
| App doesn't start | Path issues | Use full paths in Exec line |

---

## Export-Funktion (Pandoc Integration)

**Seit:** 2025-12-10

### Unterstützte Formate

- **PDF** - Mit Templates (Standard, Eisvogel, Minimal, Academic)
- **DOCX** - Microsoft Word
- **HTML** - Standalone mit eingebetteten Ressourcen
- **LaTeX, EPUB, ODT, RTF**

### Systemvoraussetzungen

**Minimum:**
```bash
sudo apt install pandoc
```

**Für PDF:**
```bash
sudo apt install pandoc texlive-xetex texlive-fonts-recommended texlive-latex-extra
```

### Verwendung

1. Export-Button in Toolbar klicken
2. Format wählen (PDF, DOCX, etc.)
3. Bei PDF: Template wählen (Eisvogel = Professional)
4. Exportieren

### Features

- **Eisvogel-Template:** Automatischer Download beim ersten Gebrauch
- **Frontmatter-Support:** Metadaten werden für PDF verwendet
- **Fehlerbehandlung:** Hilfreiche Meldungen bei fehlenden Dependencies

### Dateien

- **Backend:** `main.js` (Zeile 541-681)
- **Frontend:** `renderer/ui/export-dialog.js`
- **Styles:** `renderer/styles.css` (Zeile 2490+)
- **API:** `preload.js` (Zeile 46-50)
- **Docs:** `docs/EXPORT.md`

---

## Referenzen

- **DEVELOPMENT_PLAN.md:** Was wird umgesetzt? (Sprint-Plan)
- **ARCHITECTURE.md:** Wie funktioniert es? (Technisch)
- **SETUP.md:** Wie setup? (Ubuntu 24.04)
- **docs/EXPORT.md:** Export-Funktion Details

---

**Version:** 1.2
**Nächstes Update:** Bei ersten Code-Änderungen oder wenn Regeln fehlen
