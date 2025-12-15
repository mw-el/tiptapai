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

Frontmatter-Metadaten werden für die PDF-Generierung verwendet:

```yaml
---
title: "Mein Dokument"
author: "Dein Name"
date: "2025-12-10"
---
```

Checkbox "Frontmatter entfernen" aktivieren, um Metadaten aus dem Export auszuschließen.

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

### Architektur

**Backend:** [main.js:541-681](../main.js)
- `pandoc-check`: Prüft Pandoc-Installation
- `pandoc-check-eisvogel`: Prüft Eisvogel-Template
- `pandoc-install-eisvogel`: Lädt Eisvogel herunter
- `pandoc-export`: Führt Export aus

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
