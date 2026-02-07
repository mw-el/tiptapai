# TipTap AI - Installation Guide

Intelligenter Markdown-Editor mit LanguageTool-Integration und hierarchischem Dateibaum.

## Inhaltsverzeichnis

- [Systemanforderungen](#systemanforderungen)
- [Automatische Installation](#automatische-installation)
- [Manuelle Installation](#manuelle-installation)
- [LanguageTool Setup](#languagetool-setup)
- [Desktop-Integration](#desktop-integration)
- [Troubleshooting](#troubleshooting)

---

## Systemanforderungen

### Betriebssystem
- Ubuntu 24.04 (empfohlen)
- Andere Linux-Distributionen mit GNOME/KDE

### Software-Anforderungen

| Software | Version | Zweck |
|----------|---------|-------|
| Node.js | v20+ | Runtime für Electron-App |
| npm | Latest | Package Manager |
| Java | 11+ | LanguageTool Server |
| ImageMagick | Latest | Icon-Generierung (optional) |
| WeasyPrint | Latest | Professionelle PDF-Layouts (optional) |
| Conda/Miniconda | Latest | Python-Umgebung für WeasyPrint (optional) |

---

## Automatische Installation

Die einfachste Methode ist das mitgelieferte Install-Script:

```bash
cd /home/matthias/_AA_TipTapAi
chmod +x install.sh
./install.sh
```

Das Script führt automatisch folgende Schritte aus:

1. Prüft alle Systemabhängigkeiten (Node.js, npm, Java)
2. Installiert npm-Pakete
3. **Fragt nach WeasyPrint-Installation** (optional, für professionelle PDF-Layouts)
4. Lädt LanguageTool 6.6 herunter (falls nicht vorhanden)
5. Baut das Application Bundle
6. Generiert das App-Icon
7. Erstellt und installiert Desktop-Launcher
8. Aktualisiert die Desktop-Datenbank

**Hinweis**: Bei Schritt 3 können Sie WeasyPrint installieren lassen (~150MB), um professionelle PDF-Layouts mit zwei-Spalten-Layout, benutzerdefinierten Seitenzahlen und fortgeschrittener CSS-Typografie zu ermöglichen. Dies ist optional und kann auch später nachinstalliert werden.

Nach erfolgreicher Installation ist TipTap AI im Anwendungsmenü verfügbar.

---

## Manuelle Installation

Falls Sie die Installation manuell durchführen möchten:

### Schritt 1: Node.js installieren

**Option A: via nvm (empfohlen)**
```bash
# nvm installieren
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Terminal neu starten oder:
source ~/.bashrc

# Node.js v20 installieren
nvm install 20
nvm use 20
```

**Option B: via apt (Ubuntu)**
```bash
sudo apt update
sudo apt install nodejs npm
```

Prüfen Sie die Installation:
```bash
node --version  # Sollte v20+ anzeigen
npm --version
```

### Schritt 2: Java installieren

LanguageTool benötigt Java Runtime Environment:

```bash
sudo apt update
sudo apt install default-jre

# Prüfen
java -version
```

### Schritt 3: Optionale Dependencies

**ImageMagick** (für Icon-Generierung):
```bash
sudo apt install imagemagick
```

**wget** (für LanguageTool-Download):
```bash
sudo apt install wget unzip
```

**WeasyPrint** (für professionelle PDF-Layouts, optional):

WeasyPrint ermöglicht fortgeschrittene PDF-Layouts mit zwei-Spalten-Layout, benutzerdefinierten Seitenzahlen und CSS-Typografie. Es wird in einer isolierten Conda-Umgebung installiert.

```bash
# Miniconda installieren (falls noch nicht vorhanden)
# Download von: https://docs.conda.io/en/latest/miniconda.html
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh

# Terminal neu starten oder:
source ~/.bashrc

# WeasyPrint in eigener Umgebung installieren
conda create -n weasyprint python=3.11 -y
conda activate weasyprint
pip install weasyprint
conda deactivate
```

**Hinweis**: Die Fonts (FiraSans) für die Templates sind bereits im Repository unter `weasyprint/report/` enthalten.

### Schritt 4: Repository clonen

```bash
cd ~
git clone https://github.com/mw-el/tiptapai.git
cd tiptapai
```

Oder wenn Sie das Repo bereits haben:
```bash
cd /home/matthias/_AA_TipTapAi
```

### Schritt 5: npm-Pakete installieren

```bash
npm install
```

Dies installiert alle Abhängigkeiten aus `package.json`:
- `electron`
- `@tiptap/core`
- `@tiptap/starter-kit`
- `@tiptap/markdown`
- `js-yaml`

### Schritt 6: Application Bundle bauen

```bash
npx esbuild renderer/app.js --bundle --outfile=renderer/app.bundle.js --loader:.js=js
```

---

## LanguageTool Setup

### Automatischer Download

Das `install.sh` Script lädt LanguageTool automatisch herunter. Alternativ manuell:

```bash
cd /home/matthias/_AA_TipTapAi

# LanguageTool 6.6 herunterladen
wget https://languagetool.org/download/LanguageTool-stable.zip

# Entpacken
unzip LanguageTool-stable.zip
rm LanguageTool-stable.zip
```

### LanguageTool Server starten

Der Server wird automatisch mit der App gestartet. Für manuellen Start:

```bash
cd /home/matthias/_AA_TipTapAi
java -cp LanguageTool-6.6/languagetool-server.jar \
  org.languagetool.server.HTTPServer \
  --port 8081 \
  --allow-origin "*"
```

Der Server läuft dann auf `http://localhost:8081`.

### Unterstützte Sprachen

- Deutsch (Deutschland): `de-DE`
- Deutsch (Schweiz): `de-CH`
- Englisch (US): `en-US`

Weitere Sprachen können über die Dropdown-Auswahl im Editor gesetzt werden.

---

## Desktop-Integration

**Status**: ✅ Vollständig funktionsfähig

Die App ist vollständig in das System integriert:
- Erscheint im Anwendungsmenü
- .md Dateien können per Doppelklick geöffnet werden
- Rechtsklick → "Öffnen mit TipTap AI" funktioniert
- File tree navigiert automatisch zum Ordner der geöffneten Datei

### Icon generieren

Falls nicht automatisch erstellt:

```bash
cd /home/matthias/_AA_TipTapAi

convert -size 256x256 xc:none \
  -fill '#3498db' -draw 'roundrectangle 20,20 236,236 20,20' \
  -fill white -font DejaVu-Sans-Bold -pointsize 80 -gravity center -annotate +0-10 'T' \
  -fill white -pointsize 60 -annotate +0+50 'AI' \
  tiptapai-icon.png
```

### Desktop-File installieren

Das Repository enthält eine Template-Datei `tiptapai.desktop.template`:

```bash
# Template anpassen und installieren
sed "s|INSTALL_DIR|$(pwd)|g" tiptapai.desktop.template > tiptapai.desktop

# Ins User-Applications-Verzeichnis kopieren
cp tiptapai.desktop ~/.local/share/applications/

# Desktop-Datenbank aktualisieren
update-desktop-database ~/.local/share/applications/
```

Das `install.sh` Script führt diese Schritte automatisch aus.

### Desktop-File manuell erstellen

Falls `tiptapai.desktop.template` nicht vorhanden ist:

```bash
cat > ~/.local/share/applications/tiptapai.desktop << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=TipTap AI
Comment=Intelligent Markdown Editor with LanguageTool Integration
Exec=$(pwd)/tiptapai-start.sh %F
Icon=$(pwd)/tiptapai.png
Path=$(pwd)
Terminal=false
Categories=Office;TextEditor;
Keywords=markdown;editor;languagetool;tiptap;writing;
MimeType=text/markdown;text/x-markdown;
StartupNotify=true
StartupWMClass=TipTap AI
EOF

# Desktop-Datenbank aktualisieren
update-desktop-database ~/.local/share/applications/
```

**Wichtig**:
- `%F` in Exec-Zeile ermöglicht das Öffnen von Dateien per Doppelklick
- `tiptapai-start.sh` übergibt Argumente mit `"$@"` an die App
- `MimeType` registriert .md Dateiassoziation

---

## App starten

### Via Desktop-Launcher

Nach der Installation finden Sie **TipTap AI** im Anwendungsmenü unter:
- **Office** oder **Development**

### Via Terminal

```bash
cd /home/matthias/_AA_TipTapAi
npm start
```

### Via nvm

Falls Sie nvm nutzen:

```bash
cd /home/matthias/_AA_TipTapAi
nvm use 20
npm start
```

---

## Features

Nach erfolgreicher Installation haben Sie Zugriff auf:

### Editor Features
- WYSIWYG Markdown-Editing mit TipTap
- Auto-Save mit 2-Sekunden-Debounce
- Cursor-Position wird in Frontmatter gespeichert
- Metadaten-Anzeige (lastEdit, lastPosition, Sprache)
- Raw-Markdown-Ansicht

### File Browser
- VSCode-Style hierarchischer Dateibaum
- Expand/Collapse Ordner
- Lazy-Loading für Performance
- Filter auf .md und .txt Dateien
- Navigation durch gesamte Dateisystem inkl. Netzlaufwerke

### LanguageTool Integration
- Lokaler LanguageTool-Server (Port 8081)
- Rechtschreib- und Grammatikprüfung
- Error-Highlighting mit roten Unterstreichungen
- Hover-Tooltips mit Fehlererkl ärungen
- Click-to-Apply Korrekturvorschläge
- Toggle-Button zum Ein-/Ausschalten
- Viewport-basiertes Checking (nur sichtbarer Bereich + 4 Screens)
- Scroll-basierte Background-Checks

### PDF-Export mit WeasyPrint (optional)

- Professionelle PDF-Layouts mit zwei-Spalten-Layout
- Benutzerdefinierte Seitenzahlen und Kopfzeilen
- Fortgeschrittene CSS-Typografie
- Templates: Seminar-Handout, Report, etc.
- Fonts (FiraSans) im Repository enthalten
- Keine externe Font-Installation erforderlich

---

## Troubleshooting

### App startet nicht

**Problem**: Electron-Fenster öffnet sich nicht

**Lösung**:
```bash
# DevTools prüfen (bereits im Code aktiviert)
# Schauen Sie in main.js:19

# Logs prüfen
npm start 2>&1 | tee app.log
```

### LanguageTool funktioniert nicht

**Problem**: Keine Fehlermarkierungen im Text

**Checks**:
1. Ist der Server gestartet?
   ```bash
   curl http://localhost:8081/v2/check -d "text=Helo World" -d "language=en-US"
   ```

2. Java installiert?
   ```bash
   java -version
   ```

3. LanguageTool-Verzeichnis vorhanden?
   ```bash
   ls -la LanguageTool-6.6/
   ```

**Fix**: LanguageTool neu herunterladen
```bash
rm -rf LanguageTool-6.6
./install.sh
```

### Desktop-Icon wird nicht angezeigt

**Problem**: App erscheint nicht im Anwendungsmenü

**Lösung**:
```bash
# Desktop-Datenbank manuell aktualisieren
update-desktop-database ~/.local/share/applications/

# Prüfen ob Desktop-File installiert ist
ls -la ~/.local/share/applications/tiptapai.desktop

# Desktop-File validieren
desktop-file-validate ~/.local/share/applications/tiptapai.desktop
```

Falls das nicht hilft:
```bash
# Icon-Cache neu laden
gtk-update-icon-cache ~/.local/share/icons/ 2>/dev/null || true

# Desktop-Environment neu starten (GNOME)
# Press Alt+F2, type 'r', press Enter
# Oder: Ausloggen und neu einloggen
```

### Dateien aus Dateimanager öffnen nicht

**Problem**: Doppelklick auf .md Datei öffnet sie nicht in TipTap AI

**Check**:
```bash
# Prüfen ob MIME-Type registriert ist
xdg-mime query default text/markdown
# Sollte "tiptapai.desktop" zeigen

# Testen ob Argumente weitergegeben werden
/path/to/tiptapai-start.sh /path/to/test.md
# Sollte die Datei öffnen
```

**Fix**:
```bash
# TipTap AI als Standard setzen
xdg-mime default tiptapai.desktop text/markdown
xdg-mime default tiptapai.desktop text/x-markdown

# Desktop-File prüfen - muss %F enthalten
grep "Exec=" ~/.local/share/applications/tiptapai.desktop
# Sollte zeigen: Exec=.../tiptapai-start.sh %F
```

### npm install schlägt fehl

**Problem**: Fehler bei `npm install`

**Lösung**:
```bash
# Cache löschen
npm cache clean --force

# node_modules entfernen
rm -rf node_modules package-lock.json

# Neu installieren
npm install
```

### Permission Denied

**Problem**: `./install.sh: Permission denied`

**Lösung**:
```bash
chmod +x install.sh
./install.sh
```

---

## Verzeichnisstruktur

Nach der Installation sollte die Struktur so aussehen:

```
_AA_TipTapAi/
├── main.js                    # Electron Main Process
├── preload.js                 # IPC Bridge
├── package.json               # npm Dependencies
├── install.sh                 # Installation Script
├── tiptapai.desktop          # Desktop Launcher
├── tiptapai-icon.png         # App Icon
├── renderer/
│   ├── index.html            # UI
│   ├── app.js                # Main App Logic
│   ├── app.bundle.js         # Gebaut via esbuild
│   ├── styles.css            # Styling
│   ├── frontmatter.js        # YAML Parsing
│   ├── languagetool.js       # LT API Client
│   └── languagetool-mark.js  # TipTap Mark Extension
├── LanguageTool-6.6/         # LanguageTool Installation
│   └── languagetool-server.jar
└── docs/
    └── DEVELOPMENT_PLAN.md   # Sprint-Plan
```

---

## Deinstallation

Falls Sie TipTap AI entfernen möchten:

```bash
# Desktop-Launcher entfernen
rm ~/.local/share/applications/tiptapai.desktop
update-desktop-database ~/.local/share/applications/

# Anwendung entfernen
rm -rf /home/matthias/_AA_TipTapAi
```

---

## Support & Feedback

- **GitHub Issues**: https://github.com/mw-el/tiptapai/issues
- **Dokumentation**: `docs/DEVELOPMENT_PLAN.md`

---

## Lizenz

Siehe LICENSE-Datei im Repository.

---

**Letzte Aktualisierung**: 2026-02-07
**Version**: Sprint 3.0 (Desktop Integration + Multi-Language Thesaurus + File-First Architecture + WeasyPrint PDF-Export)
