---
lastEdit: '2025-11-13T22:00:00.000Z'
lastPosition: 6198
---

# TipTap AI - Intelligenter Markdown-Editor
Ein **minimalistischer** Desktop Markdown-Editor mit WYSIWYG-Funktionalität, gebaut mit Electron und TipTap.

**Status**: ✅ MVP Released - Fully Functional
**Version**: 0.2.0-alpha
**Letzte Aktualisierung**: 2025-11-26

---

## Überblick
 TipTap AI ist ein WYSIWYG Markdown-Editor für Autoren, der: - Lokale Markdown-Dateien mit echtem WYSIWYG bearbeitet (TipTap) - Metadaten in Frontmatter speichert (keine separate Datenbank) - Rechtschreibprüfung via self-hosted LanguageTool bietet - Später: KI-gestützte Stil- und Konsistenz-Checks

**Design-Philosophie**: So einfach wie möglich, nur 5 Dependencies.

---

## Features
### ✅ Implementiert (MVP Complete)
- ✅ WYSIWYG Markdown-Editor (TipTap)
- ✅ File Tree Navigation mit Hierarchie
- ✅ Auto-Save mit Frontmatter-Metadaten
- ✅ "Wo aufgehört"-Lesezeichen (Last Position)
- ✅ Rechtschreibprüfung (LanguageTool)
- ✅ HTML/Hugo Shortcode Protection
- ✅ Progressive Non-Blocking LanguageTool Checks
- ✅ Error Navigation & Correction UI
- ✅ Find & Replace
- ✅ Zoom Controls mit Persistenz
- ✅ Recent Files/Folders
- ✅ Integrated Terminal (xterm.js)
- ✅ Desktop Integration (Ubuntu/Linux)
- ✅ Table Support (Markdown Tables)
- ✅ **PDF Export mit WeasyPrint** (professionelle Layouts mit CSS Paged Media)

### Später (Phase 2+)
 - ⏳ KI-gestützte Stil-Checks - ⏳ Charakter-Konsistenz-Prüfung - ⏳ Namen-Konsistenz - ⏳ Timeline-Checks

---

## Technologie-Stack
**Minimalistisch: Nur 5 Core Dependencies!**

```json
{
"electron": "^28.0.0",
"@tiptap/core": "^2.1.0",
"@tiptap/starter-kit": "^2.1.0",
"@tiptap/extension-markdown": "^2.1.0",
"js-yaml": "^4.1.0"
}
```

- **Desktop**: Electron (keine Web-App!)
- **Editor**: TipTap 3.x (WYSIWYG!)
- **Sprache**: Vanilla JavaScript (kein TypeScript im MVP)
- **Persistenz**: YAML Frontmatter (keine SQLite!)
- **Node.js**: v20 via nvm

---

## Quick Start

### Automatische Installation (empfohlen)

```bash
# Repository clonen
git clone https://github.com/mw-el/TipTapAi.git
cd TipTapAi

# Install-Script ausführen
chmod +x install.sh
./install.sh
```

Das Install-Script:
- Prüft alle Dependencies (Node.js, Java)
- Installiert npm-Pakete
- Lädt LanguageTool herunter
- Richtet Desktop-Integration ein
- Generiert App-Icon

Nach der Installation finden Sie **TipTap AI** im Anwendungsmenü.

**Vollständige Anleitung:** Siehe `INSTALL.md`

---

## Projekt-Struktur
 ``` tiptapai/ ├── TIPTAPAI_initial-planning_2025-10-18-1600.md # Aktives Dev Doc ├── CHANGELOG_2025-10-18-1600.md # Changelog mit Timestamp ├── CLAUDE.md # Projekt-Regeln für Claude ├── README.md # Diese Datei │ ├── package.json # Nur 5 Dependencies! ├── main.js # Electron Main Process ├── preload.js # IPC Bridge │ ├── renderer/ │ ├── index.html # Single HTML │ ├── app.js # TipTap Setup │ ├── file-tree.js # Simpler File Tree │ ├── frontmatter.js # YAML Parser │ └── styles.css # Minimales Styling │ ├── docker/ │ └── docker-compose.yml # LanguageTool │ └── docs/ ├── DEVELOPMENT_PLAN.md # Sprint-Plan (MASTER) ├── ARCHITECTURE.md # Technische Architektur ├── SETUP.md # Setup Ubuntu 24.04 ├── MULTI_PROJECT.md # Mehrere Node.js-Projekte ├── GUIDELINES.md # Development Best Practices ├── INSIGHTS.md # Entscheidungen &amp; Learnings ├── archive/ # Abgeschlossene Dev Docs └── lessons-learned/ # Schwierige Probleme ```

---

## Dokumentation
### Für Entwickler
 - **DEVELOPMENT_PLAN.md**: Sprint-basierter Implementierungsplan - **ARCHITECTURE.md**: Technische Architektur, Code-Beispiele - **SETUP.md**: Setup-Anleitung für Ubuntu 24.04 - **GUIDELINES.md**: Development Best Practices

### Für User mit mehreren Projekten
 - **MULTI_PROJECT.md**: Arbeiten mit mehreren Node.js-Projekten parallel

### Projekt-Management
 - **CHANGELOG**: Was wurde geändert? (mit Timestamp) - **Dev Documents**: Live-Dokumentation während Entwicklung (im Root) - **CLAUDE.md**: Projekt-Regeln für Claude Code

---

## Frontmatter-System
 Metadaten werden direkt im Markdown gespeichert (kein separates DB-File):

```markdown
---
lastPosition: 1245
lastEdit: 2025-10-18T14:30:00Z
bookmarks:
- pos: 500
label: "Kapitel 3 Review"
- pos: 1245
label: "Hier weitermachen"
---

# Mein Dokument
 Content beginnt hier... ```

**Vorteile:**
- Git-freundlich (Änderungen sichtbar)
- Metadaten reisen mit der Datei
- Kein separates Backup nötig
- Standard (Jekyll, Hugo, Obsidian nutzen das)

---

## PDF Export mit WeasyPrint

TipTap AI nutzt **WeasyPrint** für professionelle PDF-Exporte mit fortgeschrittenen Layout-Funktionen.

### Was ist WeasyPrint?

WeasyPrint ist eine Python-basierte PDF-Engine, die HTML/CSS in hochqualitative PDFs umwandelt. Im Gegensatz zu Electron's `printToPDF` (Chromium-basiert) unterstützt WeasyPrint die **CSS Paged Media Level 3 Spezifikation** vollständig.

**Unterstützte Features:**
- ✅ CSS `columns` (Mehrspalten-Layout)
- ✅ `@page` Margin Boxes (gestylte Seitenzahlen)
- ✅ Ausschluss der ersten Seite von Seitennummerierung
- ✅ Erweiterte CSS-Pagination (Seitenumbrüche, Waisenzeilen-Kontrolle)
- ✅ Professionelle Typografie mit voller Font-Unterstützung

### Installation

WeasyPrint wird in einer isolierten Conda-Umgebung installiert:

```bash
# Conda-Umgebung erstellen
conda create -n weasyprint python=3.11 -y

# Aktivieren
conda activate weasyprint

# WeasyPrint installieren
pip install weasyprint

# Testen
weasyprint --version
# → WeasyPrint version 68.1
```

**Größe:** ~150 MB (inkl. Cairo, Pango, GdkPixbuf Dependencies)

**Vorteile von Conda:**
- ✅ Isoliert von System-Python
- ✅ Conda managed native C-Dependencies automatisch
- ✅ Kein `sudo` erforderlich
- ✅ Einfach zu aktualisieren/entfernen

### Wie funktioniert die Integration?

Die Integration folgt dem KISS-Prinzip und benötigt **keine neuen Dateien** – nur minimale Änderungen an bestehenden Dateien:

#### 1. Auto-Detection beim Start

`main.js` erkennt WeasyPrint automatisch:

```javascript
// Auto-detect WeasyPrint path on startup
let weasyprintBin = null;
try {
  const condaEnvs = execSync('conda info --envs', { encoding: 'utf-8' });
  const weasyprintLine = condaEnvs.split('\n')
    .find(line => line.includes('weasyprint'));

  if (weasyprintLine) {
    const envPath = weasyprintLine.trim().split(/\s+/).pop();
    weasyprintBin = path.join(envPath, 'bin', 'weasyprint');
    console.log('✓ WeasyPrint found:', weasyprintBin);
  }
} catch (e) {
  console.warn('WeasyPrint not detected.');
}
```

Falls WeasyPrint nicht gefunden wird, erscheint beim Export eine hilfreiche Fehlermeldung mit Installationsanleitung.

#### 2. Export-Workflow

```
┌─────────────────────────────────────────┐
│   USER: Export → PDF Seminar-Handout   │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  export-dialog.js                       │
│  1. Template laden (meta.json)          │
│  2. Assets sammeln (Cover, Logo)        │
│  3. Markdown → HTML (Pandoc)            │
│  4. HTML-Dokument assemblieren          │
│  5. Engine-Check: meta.engine?          │
└─────────────────────────────────────────┘
                  │
       ┌──────────┴──────────┐
       │                     │
       ▼                     ▼
┌─────────────┐    ┌─────────────────┐
│  Electron   │    │  WeasyPrint     │
│  printToPDF │    │  IPC Handler    │
└─────────────┘    └─────────────────┘
       │                     │
       │                     ▼
       │           ┌─────────────────┐
       │           │ Write temp.html │
       │           │ Spawn weasyprint│
       │           │ Clean up temp   │
       │           └─────────────────┘
       │                     │
       └──────────┬──────────┘
                  ▼
          ┌───────────────┐
          │  output.pdf   │
          └───────────────┘
```

#### 3. Template-System

Templates definieren, welche Engine verwendet wird:

**`templates/seminar-handout/meta.json`:**
```json
{
  "id": "seminar-handout",
  "engine": "weasyprint",
  "name": "Seminar-Handout",
  "fields": [
    { "key": "cover_image", "label": "Titelbild", "type": "image", "required": true },
    { "key": "logo", "label": "Logo", "type": "image", "required": false }
  ]
}
```

**`templates/seminar-handout/template.html`:**
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>{{title}}</title>
  <style>{{styles}}</style>
</head>
<body>
  <article id="cover">
    <div class="cover-image" style="background-image: url('{{cover_image}}')"></div>
    <div class="cover-bottom">
      <h1>{{title}}</h1>
      {{logo_img_cover}}
    </div>
  </article>

  <article id="main-content">
    {{content}}
  </article>

  <article id="copyright">
    {{logo_img}}
    <h3>{{title}}</h3>
    <p>&copy; {{year}} {{author_short}}. Alle Rechte vorbehalten.</p>
  </article>
</body>
</html>
```

**`templates/seminar-handout/style.css`:**
```css
@page {
  size: A4;
  margin: 2cm 2.5cm;

  /* Seitenzahlen in der Mitte */
  @bottom-center {
    content: counter(page);
    font-size: 10pt;
    color: #666;
  }
}

/* Erste Seite (Cover): Keine Seitenzahl */
@page :first {
  margin: 0;
  @bottom-center {
    content: "";
  }
}

/* Zweispalten-Layout für Haupttext */
#main-content {
  columns: 2;
  column-gap: 1cm;
  hyphens: auto;
}

/* Überschriften spannen beide Spalten */
#main-content h1,
#main-content h2,
#main-content h3 {
  column-span: all;
}
```

#### 4. Engine-Routing

`export-dialog.js` routet basierend auf `meta.engine`:

```javascript
// Check template's engine specification
if (tmpl.meta.engine === 'weasyprint') {
  result = await window.api.weasyprintExport({
    htmlContent: assembledHtml,
    outputPath: saveResult.filePath
  });
} else {
  // Fallback to Electron printToPDF
  result = await window.api.electronPdfExport({
    assembledHtml,
    outputPath: saveResult.filePath
  });
}
```

### WeasyPrint vs. Electron printToPDF

| Feature | WeasyPrint | Electron printToPDF |
|---------|------------|---------------------|
| CSS `columns` | ✅ Ja | ❌ Nein |
| `@page` Margin Boxes | ✅ Ja | ❌ Nein |
| Erste Seite ausschließen | ✅ Ja | ❌ Nein |
| Typografie-Qualität | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| CSS Paged Media | ✅ Level 3 | ❌ Limitiert |
| Installation | ~150 MB | ✅ Integriert |
| Best for | Reports, Magazine, Handouts | Einfache PDFs |

### Verwendung

1. **Export-Dialog öffnen:** Toolbar → Export-Button
2. **Format wählen:** PDF Seminar-Handout
3. **Assets auswählen:** Titelbild + Logo (inline Dateiauswahl)
4. **Exportieren:** PDF wird mit WeasyPrint generiert

**Hinweis:** Asset-Pfade werden im Frontmatter gespeichert (`TT_export.template_data`) und beim nächsten Export automatisch vorausgefüllt.

### Neue Templates erstellen

Um ein neues WeasyPrint-Template zu erstellen:

1. **Ordner anlegen:** `templates/mein-template/`
2. **`meta.json` erstellen:**
   ```json
   {
     "id": "mein-template",
     "engine": "weasyprint",
     "name": "Mein Template",
     "fields": [...]
   }
   ```
3. **`template.html` erstellen** (mit Platzhaltern: `{{title}}`, `{{content}}`, etc.)
4. **`style.css` erstellen** (mit `@page` Regeln für WeasyPrint)

**Beispiel-Templates:** Siehe `templates/seminar-handout/`

### Vorteile der Architektur

- ✅ **Minimal:** Nur ~80 Zeilen Code-Änderungen, 0 neue Dateien
- ✅ **Test-first:** Standalone-Validierung vor Integration
- ✅ **Engine-agnostic:** Templates können Electron oder WeasyPrint nutzen
- ✅ **KISS:** Leverages WeasyPrint's Fähigkeiten statt Workarounds
- ✅ **Erweiterbar:** Neue Templates einfach hinzufügbar

### Troubleshooting

**WeasyPrint nicht gefunden:**
```
Error: WeasyPrint nicht installiert.

Installation:
  conda create -n weasyprint python=3.11
  conda activate weasyprint
  pip install weasyprint
```

**Conda nicht installiert?**
```bash
# Miniconda installieren
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
```

**Fonts fehlen?**
Fonts werden aus `weasyprint/report/` geladen. Template nutzt Fira Sans (im Repo enthalten).

### Weitere Informationen

- **Implementation Details:** `weasyprint-integration.md`
- **WeasyPrint Docs:** https://doc.courtbouillon.org/weasyprint/
- **CSS Paged Media:** https://www.w3.org/TR/css-page-3/

---

## System-Anforderungen
 - **OS**: Ubuntu 24.04 (X11) - oder andere Linux-Distros - **Node.js**: v20 (via nvm empfohlen) - **Docker**: Für LanguageTool (optional, für Rechtschreibprüfung) - **Disk Space**: ~200 MB (mit node_modules) - **RAM**: ~200 MB idle, ~500 MB mit großem Dokument

---

## Architektur-Entscheidungen
### Warum Electron?
**TipTap ist Web-basiert** → braucht Browser-Engine → Electron ist einfachste Desktop-Lösung

### Warum Vanilla JS statt React?
**TipTap braucht kein React** → Weniger Dependencies, einfacher zu lernen

### Warum Frontmatter statt SQLite?
**Git-freundlich** → Metadaten reisen mit Datei → Kein separates DB-File

### Warum nvm statt conda?
**Node.js-Projekte sind automatisch isoliert** → nvm ist nativer für Node.js

**Details:** Siehe `docs/ARCHITECTURE.md` und `docs/INSIGHTS.md`

---

## Development-Workflow
### Vor jeder Session
 1. `DEVELOPMENT_PLAN.md` öffnen 2. Status checken 3. Nächsten Sprint identifizieren

### Während der Arbeit
 1. Dev Document im Root anlegen (`TIPTAPAI__YYYY-MM-DD-HHMM.md`) 2. Nach jedem Schritt: Document updaten + neuer Timestamp 3. Code implementieren 4. Testen

### Nach Abschluss
 1. Status auf ✅ 2. Dev Document nach `docs/archive/` verschieben 3. CHANGELOG aktualisieren 4. Git Commit

**Details:** Siehe `docs/DEVELOPMENT-GUIDELINES-QUICK.md`

---

## Installation

Siehe **INSTALL.md** für vollständige Installationsanleitung.

**Schnellstart:**
```bash
git clone https://github.com/mw-el/TipTapAi.git
cd TipTapAi
chmod +x install.sh
./install.sh
```

Das Install-Script richtet automatisch alles ein, inkl. Desktop-Integration.

---

## Contributing
**Aktuell**: Entwicklung nur durch Projektowner (Matthias)

**Später**: Contributing Guidelines werden nach MVP erstellt

---

## License
**TODO**: Lizenz festlegen (z.B. MIT, GPL, Apache 2.0)

---

## Changelog
 Siehe `CHANGELOG_2025-10-18-1600.md` für vollständige Änderungshistorie.

### Latest Changes (2025-10-18)
 - ✅ Planning Phase abgeschlossen - ✅ Architektur definiert (minimal Electron + TipTap) - ✅ Dokumentation erstellt (7 Dokumente) - ✅ Development-Workflow etabliert - ⏳ Next: Environment Setup

---

## Support &amp; Contact
 Bei Fragen: 1. Dokumentation in `docs/` durchsuchen 2. `DEVELOPMENT_PLAN.md` checken 3. Issue erstellen (später, nach MVP)

---

## Acknowledgments
 Dieses Projekt nutzt folgende Open-Source-Technologien: - **TipTap** - Moderner WYSIWYG-Editor - **Electron** - Cross-Platform Desktop-Apps - **LanguageTool** - Open-Source Rechtschreibprüfung - **js-yaml** - YAML-Parser für Frontmatter

---

**Status**: ✅ Fully Functional MVP
**Latest Features**: Terminal Integration, LanguageTool, Find & Replace, Recent Files
**Installation**: See INSTALL.md

Für Development-Details siehe `docs/DEVELOPMENT_PLAN.md`.