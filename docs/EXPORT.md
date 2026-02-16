# Export-Funktion - Pandoc Integration

## Übersicht

TipTap AI unterstützt den Export von Markdown-Dokumenten in verschiedene Formate über Pandoc.

## Unterstützte Formate

| Format | Extension | Beschreibung |
|--------|-----------|--------------|
| PDF | `.pdf` | PDF mit LaTeX, verschiedene Templates verfügbar |
| DOCX | `.docx` | Microsoft Word |
| HTML | `.html` | Standalone HTML mit eingebetteten Ressourcen |
| LaTeX | `.tex` | LaTeX-Quellcode |
| EPUB | `.epub` | eBook Format |
| ODT | `.odt` | OpenDocument Text |
| RTF | `.rtf` | Rich Text Format |

## PDF-Templates

### Standard
- Einfaches Layout mit Inhaltsverzeichnis
- Standard LaTeX-Schriftart

### Eisvogel (Professional)
- Professionelles Design mit Titelseite
- Syntax-Highlighting optimiert
- Header/Footer anpassbar
- **Automatische Installation** beim ersten Gebrauch

### Minimal
- Reduziertes Design
- Kleine Margins (2cm)
- 11pt Schriftgröße

### Academic
- A4 Format mit 2.5cm Margins
- 12pt Schriftgröße, 1.5 Zeilenabstand
- Ideal für wissenschaftliche Arbeiten

## Verwendung

1. **Export-Button** in der Toolbar klicken
2. **Format** auswählen (PDF, DOCX, etc.)
3. Bei PDF: **Template** wählen
4. Optional: **Frontmatter entfernen** aktivieren
5. **Exportieren** klicken
6. Speicherort wählen

## Systemvoraussetzungen

### Minimum (DOCX, HTML, LaTeX, etc.)
```bash
sudo apt install pandoc
```

### Für PDF-Export
```bash
sudo apt install pandoc texlive-xetex texlive-fonts-recommended texlive-latex-extra
```

### Eisvogel-Template
Wird automatisch beim ersten Gebrauch heruntergeladen oder manuell:
```bash
wget https://raw.githubusercontent.com/Wandmalfarbe/pandoc-latex-template/master/eisvogel.latex -O ~/.local/share/pandoc/templates/Eisvogel.latex
```

## Frontmatter-Unterstützung

Frontmatter-Metadaten werden für die PDF- und EPUB-Generierung verwendet:

```yaml
---
title: "Mein Dokument"
author: "Dein Name"
date: "2025-12-10"
subtitle: "Untertitel (optional)"
cover-image: cover.jpg  # Optional für EPUB
---
```

Checkbox "Frontmatter entfernen" aktivieren, um Metadaten aus dem Export auszuschließen.

### EPUB: Automatische Cover-Generierung

Beim EPUB-Export werden Cover-Bilder intelligent verarbeitet:

**Szenario 1 - Vorhandenes Cover:**
- Frontmatter enthält `cover-image: cover.jpg`
- TipTap AI löst den relativen Pfad automatisch auf
- Das vorhandene Bild wird verwendet

**Szenario 2 - Kein Cover vorhanden:**
- Frontmatter enthält **kein** `cover-image` Feld
- TipTap AI generiert automatisch ein `cover.jpg`:
  - Orange Hintergrund (#ff7b33)
  - Titel, Untertitel und Autor aus Frontmatter
  - Professionelles Design mit Trennlinien
- Cover wird im gleichen Verzeichnis wie die Markdown-Datei gespeichert
- Bei erneutem Export wird das vorhandene `cover.jpg` wiederverwendet

**Szenario 3 - Cover.jpg existiert bereits:**
- Auch ohne `cover-image` im Frontmatter
- TipTap AI erkennt vorhandenes `cover.jpg` und verwendet es
- Keine neue Generierung notwendig

**Voraussetzungen:**
- ImageMagick (`convert` command) für Cover-Generierung
- Installation: `sudo apt install imagemagick`
- Falls nicht verfügbar: SVG-Fallback wird erstellt

## Troubleshooting

### Pandoc nicht gefunden
```bash
which pandoc
# Falls nicht vorhanden:
sudo apt install pandoc
```

### LaTeX-Fehler bei PDF
```bash
# Vollständige LaTeX-Installation:
sudo apt install texlive-full
# Oder minimal:
sudo apt install texlive-xetex texlive-fonts-recommended texlive-latex-extra
```

### Eisvogel-Template fehlt
- Im Export-Dialog wird "Template nicht installiert" angezeigt
- Klicke auf **"Jetzt installieren"**
- Template wird automatisch von GitHub heruntergeladen

### EPUB zeigt "UNTITLED" als Titel
- **Lösung**: Stelle sicher, dass das Frontmatter ein `title:` Feld enthält
- Aktiviere **nicht** "Frontmatter entfernen" beim EPUB-Export
- TipTap AI fügt automatisch `--epub-title-page=true` hinzu

### Cover-Generierung schlägt fehl
- ImageMagick installieren: `sudo apt install imagemagick`
- Alternative: Cover manuell als `cover.jpg` im selben Verzeichnis erstellen

## Technische Details

### Pandoc-Argumente

**PDF Standard:**
```bash
pandoc input.md -o output.pdf --pdf-engine=xelatex --toc
```

**PDF Eisvogel:**
```bash
pandoc input.md -o output.pdf \
  --template=Eisvogel \
  --pdf-engine=xelatex \
  --listings \
  -V titlepage=true \
  -V toc-own-page=true
```

**DOCX:**
```bash
pandoc input.md -o output.docx
```

**HTML:**
```bash
pandoc input.md -o output.html --standalone --embed-resources
```

**EPUB:**
```bash
pandoc input.md -o output.epub --toc --epub-title-page=true
```

**EPUB mit automatischer Cover-Verarbeitung:**
- TipTap AI erweitert das Frontmatter automatisch:
  - Löst relative `cover-image` Pfade zu absoluten Pfaden auf
  - Generiert `cover.jpg` aus Titel/Autor falls nicht vorhanden
  - Fügt `cover-image: /absolute/path/cover.jpg` zum Frontmatter hinzu
- Verhindert "UNTITLED" Problem durch korrekte Pfadauflösung
- Siehe: `resolveEpubResources()` in [main.js](../main.js)

### Architektur

**Backend:** [main.js:718-950](../main.js)
- `pandoc-check`: Prüft Pandoc-Installation
- `pandoc-check-eisvogel`: Prüft Eisvogel-Template
- `pandoc-install-eisvogel`: Lädt Eisvogel herunter
- `pandoc-export`: Führt Export aus
- **EPUB Helpers** (NEU):
  - `resolveEpubResources()`: Löst Cover-Pfade auf oder generiert Cover
  - `generateEpubCover()`: Erstellt Cover.jpg aus Frontmatter
  - `parseYamlFrontmatter()`: Parst YAML Metadaten
  - `escapeXml()`: XML-Escaping für SVG

**Frontend:** [renderer/ui/export-dialog.js](../renderer/ui/export-dialog.js)
- Format-Konfigurationen
- Template-Management
- Export-Dialog UI

**IPC Bridge:** [preload.js:46-50](../preload.js)
- API-Funktionen für Renderer-Prozess

## Erweiterungen

### Eigene PDF-Templates hinzufügen

In `renderer/ui/export-dialog.js`:

```javascript
pdf: {
  templates: {
    // ... bestehende Templates
    custom: {
      name: 'Mein Template',
      args: [
        '--template=MeinTemplate',
        '--pdf-engine=xelatex',
        '-V', 'custom-variable=value'
      ]
    }
  }
}
```

Template nach `~/.local/share/pandoc/templates/MeinTemplate.latex` kopieren.

### Neue Export-Formate

```javascript
FORMAT_CONFIGS = {
  // ... bestehende Formate
  markdown: {
    name: 'Markdown (GitHub Flavored)',
    extension: '.md',
    icon: 'description',
    args: ['-t', 'gfm']
  }
}
```

## Performance

- **DOCX/HTML:** < 1 Sekunde
- **PDF (Standard):** 2-5 Sekunden
- **PDF (Eisvogel):** 3-8 Sekunden
- Abhängig von Dokumentgröße und LaTeX-Installation

## Lizenz & Credits

- **Pandoc:** GPL-2.0 License, © John MacFarlane
- **Eisvogel Template:** BSD-3-Clause, © Pascal Wagler
