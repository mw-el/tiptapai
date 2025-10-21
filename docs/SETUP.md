# TipTap AI - Setup Anleitung

**System**: Ubuntu 24.04 (X11, RTX 5000 GPU)
**Ziel**: Isoliertes Development-Environment für Electron + TipTap

---

## Überblick

Diese Anleitung führt durch das komplette Setup von:
1. nvm (Node Version Manager)
2. Node.js 20
3. TipTap AI Projekt
4. LanguageTool (Docker)
5. System-Dependencies für Electron

---

## Voraussetzungen

- Ubuntu 24.04
- X11 Session (kein Wayland) ✅ Du nutzt bereits X11
- Docker (für LanguageTool)
- ~500 MB freier Disk Space

---

## Schritt 1: System-Dependencies installieren

Electron braucht einige System-Libraries:

```bash
# System-Dependencies für Electron
sudo apt update
sudo apt install -y \
  libgtk-3-0 \
  libnotify4 \
  libnss3 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  libatspi2.0-0 \
  libdrm2 \
  libgbm1 \
  libxcb-dri3-0 \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgcc1 \
  libgconf-2-4 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxshmfence1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

**Warum?** Electron embeds Chromium, das diese Libraries braucht.

---

## Schritt 2: nvm installieren

nvm (Node Version Manager) ermöglicht isolierte Node.js-Installationen:

```bash
# nvm Installer herunterladen und ausführen
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Shell-Konfiguration neu laden
source ~/.bashrc

# Prüfen ob nvm funktioniert
nvm --version
# Sollte ausgeben: 0.39.7
```

**Was macht das?**
- Installiert nvm in `~/.nvm/`
- Fügt nvm zu deiner `~/.bashrc` hinzu
- Kein sudo nötig, alles in deinem Home-Verzeichnis

---

## Schritt 3: Node.js 20 installieren

```bash
# Node.js 20 installieren (LTS)
nvm install 20

# Als Default setzen
nvm alias default 20

# Prüfen
node --version
# Sollte ausgeben: v20.x.x

npm --version
# Sollte ausgeben: 10.x.x
```

**Isolation**: Node.js ist in `~/.nvm/versions/node/v20.x.x/` installiert, nicht system-weit!

---

## Schritt 4: Projekt-Verzeichnis erstellen

```bash
# Projekt-Verzeichnis
mkdir -p ~/tiptapai
cd ~/tiptapai

# Node-Version festlegen
echo "20" > .nvmrc

# Jetzt automatisch: cd ~/tiptapai → nvm use
# (wenn Auto-Switching aktiviert, siehe MULTI_PROJECT.md)
```

---

## Schritt 5: Projekt initialisieren

```bash
# package.json erstellen
npm init -y

# Dependencies installieren (nur 5!)
npm install electron @tiptap/core @tiptap/starter-kit @tiptap/extension-markdown js-yaml

# Dev-Dependencies (optional, für später)
npm install --save-dev electron-reload
```

**Fertig!** Dependencies sind in `~/tiptapai/node_modules/` installiert.

---

## Schritt 6: Basis-Struktur erstellen

```bash
# Ordner erstellen
mkdir -p renderer docker docs

# Hauptdateien erstellen
touch main.js preload.js
touch renderer/index.html renderer/app.js renderer/styles.css
```

**Resultierende Struktur:**

```
~/tiptapai/
├── .nvmrc
├── package.json
├── main.js
├── preload.js
├── renderer/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── docker/
├── docs/
└── node_modules/
```

---

## Schritt 7: Minimal Electron-App erstellen

### main.js

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('renderer/index.html');
  mainWindow.webContents.openDevTools(); // DevTools automatisch öffnen
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### preload.js

```javascript
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Später: File-Operationen
});
```

### renderer/index.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TipTap AI</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>TipTap AI - Minimal Setup</h1>
  <div id="editor"></div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

### renderer/app.js

```javascript
console.log('TipTap AI loaded!');
```

### renderer/styles.css

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin: 0;
  padding: 20px;
}

h1 {
  color: #333;
}
```

---

## Schritt 8: package.json konfigurieren

```json
{
  "name": "tiptapai",
  "version": "0.1.0",
  "description": "Intelligenter Markdown-Editor mit WYSIWYG",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --inspect=5858"
  },
  "keywords": ["markdown", "editor", "tiptap"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "electron": "^28.0.0",
    "@tiptap/core": "^2.1.0",
    "@tiptap/starter-kit": "^2.1.0",
    "@tiptap/extension-markdown": "^2.1.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "electron-reload": "^2.0.0"
  }
}
```

---

## Schritt 9: Erste Testfahrt

```bash
# App starten
npm start
```

**Erwartung**: Electron-Fenster öffnet sich mit "TipTap AI - Minimal Setup"

**Falls Fehler**:

### Fehler: "The SUID sandbox helper binary was found..."

```bash
# Workaround für Development:
electron . --no-sandbox

# Oder in package.json:
{
  "scripts": {
    "start": "electron . --no-sandbox"
  }
}
```

### Fehler: "Electron not found"

```bash
# Dependencies neu installieren
rm -rf node_modules package-lock.json
npm install
```

### Fehler: GPU-Probleme

```bash
# GPU deaktivieren (für Dev OK)
electron . --disable-gpu
```

---

## Schritt 10: LanguageTool Setup (Java Standalone)

**LanguageTool 6.6 ist bereits im Projekt enthalten (`LanguageTool-6.6/`).**

```bash
# LanguageTool Server starten (Port 8081)
cd /home/matthias/_AA_TipTapAi/LanguageTool-6.6
java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin "*" > /tmp/languagetool.log 2>&1 &

# Prüfen ob läuft (sollte JSON mit Sprachen zurückgeben)
curl http://localhost:8081/v2/languages | head -5

# Status prüfen
ps aux | grep languagetool-server
```

**LanguageTool läuft jetzt im Hintergrund!**

Stoppen:
```bash
pkill -f "languagetool-server.jar"
```

Logs anzeigen:
```bash
tail -f /tmp/languagetool.log
```

**Wichtig**: LanguageTool muss **vor** dem Start der TipTap AI App laufen!

---

## Schritt 11: Development-Workflow einrichten

### Auto-Reload aktivieren (optional)

```javascript
// main.js - ganz oben hinzufügen
if (process.env.NODE_ENV !== 'production') {
  require('electron-reload')(__dirname, {
    electron: require('path').join(__dirname, 'node_modules', '.bin', 'electron')
  });
}
```

**Dann**: Datei ändern → speichern → Electron lädt automatisch neu!

### DevTools Shortcut

In laufender Electron-App:
- **Ctrl+Shift+I**: DevTools öffnen/schließen
- **Ctrl+R**: Reload
- **F5**: Reload

---

## Schritt 12: Git-Repository initialisieren

```bash
cd ~/tiptapai

# Git initialisieren
git init

# .gitignore erstellen
cat > .gitignore << 'EOF'
node_modules/
dist/
*.log
.DS_Store
EOF

# Erster Commit
git add .
git commit -m "Initial setup: Minimal Electron + TipTap structure"
```

---

## Projekt-Status prüfen

### Checklist

- [ ] nvm installiert und funktioniert (`nvm --version`)
- [ ] Node.js 20 aktiv (`node --version` → v20.x.x)
- [ ] Projekt-Struktur vorhanden (`ls -la ~/tiptapai`)
- [ ] Dependencies installiert (`ls node_modules/electron`)
- [ ] Electron startet (`npm start`)
- [ ] LanguageTool läuft (`curl http://localhost:8010/v2/languages`)
- [ ] Git-Repository initialisiert (`git status`)

---

## Nächste Schritte

✅ **Setup abgeschlossen!**

Jetzt geht's an die Entwicklung:

1. **TipTap integrieren** (siehe DEVELOPMENT_PLAN.md → Sprint 1)
2. **File Tree implementieren**
3. **Frontmatter-Handling**
4. **Auto-Save**

**Dokumentation:**
- DEVELOPMENT_PLAN.md: Was wird implementiert?
- ARCHITECTURE.md: Wie funktioniert es?
- MULTI_PROJECT.md: Mehrere Projekte parallel

---

## Troubleshooting

### Problem: nvm command not found

**Lösung**:
```bash
# Shell-Config neu laden
source ~/.bashrc

# Falls weiterhin Fehler:
cat ~/.bashrc | grep nvm
# Sollte nvm-Zeilen enthalten

# Manuell hinzufügen falls fehlt:
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### Problem: Electron-Fenster bleibt schwarz

**Lösung**:
```bash
# DevTools öffnen (Ctrl+Shift+I) und Console checken
# Oft: JavaScript-Fehler in app.js

# Oder: GPU-Problem
electron . --disable-gpu
```

### Problem: LanguageTool startet nicht

**Lösung**:
```bash
# Docker läuft?
docker ps | grep languagetool

# Logs checken
docker logs languagetool

# Neu starten
cd docker
docker-compose down
docker-compose up -d
```

### Problem: RTX 5000 GPU macht Probleme

**Lösung**:
```bash
# GPU für Electron deaktivieren
# In package.json:
{
  "scripts": {
    "start": "electron . --disable-gpu"
  }
}
```

**GPU ist nur für Rendering**, nicht für die App-Funktionalität nötig.

---

## Ubuntu 24.04 Spezifika

### Wayland vs X11

Ubuntu 24.04 nutzt standardmäßig Wayland. Electron läuft besser auf X11.

**Check deine Session:**
```bash
echo $XDG_SESSION_TYPE
# x11 → Gut! ✅ (du nutzt bereits X11)
# wayland → Electron kann Probleme machen
```

**Falls Wayland**: Beim Login X11 wählen (Zahnrad-Symbol unten rechts)

### Sandbox-Issues

Ubuntu 24.04 hat strengere Sandbox-Regeln.

**Für Development** (nicht Production!):
```bash
# Sandbox deaktivieren
electron . --no-sandbox

# Oder system-weit:
sudo sysctl -w kernel.unprivileged_userns_clone=1
```

---

## Performance-Check

```bash
# Node.js-Version
node --version
# Sollte: v20.x.x

# Electron-Version
npx electron --version
# Sollte: v28.x.x

# LanguageTool
time curl -s http://localhost:8010/v2/languages > /dev/null
# Sollte: < 1 Sekunde

# Disk Space
du -sh ~/tiptapai
# Sollte: ~150-200 MB (mit node_modules)
```

---

## Fertig!

Setup ist komplett. Bereit für Development!

**Nächster Schritt**: Siehe DEVELOPMENT_PLAN.md → Sprint 1.1 für erste Implementierung.
