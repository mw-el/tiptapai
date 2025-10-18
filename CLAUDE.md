# TipTap AI - Project Rules for Claude Code

**Project:** TipTap AI - Intelligenter Markdown-Editor
**Last Updated:** 2025-10-18 16:00

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

# LanguageTool starten
cd docker
docker-compose up -d

# LanguageTool stoppen
docker-compose down

# Git
git status
git add .
git commit -m "type(scope): description"

# Logs checken
docker logs languagetool
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

## Referenzen

- **DEVELOPMENT_PLAN.md:** Was wird umgesetzt? (Sprint-Plan)
- **ARCHITECTURE.md:** Wie funktioniert es? (Technisch)
- **SETUP.md:** Wie setup? (Ubuntu 24.04)
- **GUIDELINES.md:** Wie entwickeln? (Best Practices)

---

**Version:** 1.0
**Nächstes Update:** Bei ersten Code-Änderungen oder wenn Regeln fehlen
