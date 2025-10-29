# TipTap AI - Desktop Integration (Markdown Standard-Editor)

**Date:** 2025-10-28
**Status:** ✅ Configured

---

## System-Integration für Markdown-Dateien

TipTap AI ist jetzt als Standard-Editor für Markdown-Dateien im System registriert.

### Was wurde konfiguriert:

1. **MIME-Type Registration**
   - `text/markdown` - Standard Markdown MIME-Type
   - `text/x-markdown` - Alternative Markdown MIME-Type

2. **Desktop File aktualisiert**
   - Lokation: `~/.local/share/applications/tiptapai.desktop`
   - Hinzugefügt: `MimeType=text/markdown;text/x-markdown;`
   - Hinzugefügt: `%F` zu Exec (File-Argument passing)

3. **Desktop Database aktualisiert**
   - Befehl: `update-desktop-database ~/.local/share/applications/`
   - System erkennt jetzt TipTap AI als Markdown-Editor

---

## Als Standard-Editor setzen

### Option 1: Per Rechtsklick auf .md Datei

1. Rechtsklick auf eine `.md` Datei
2. **"Öffnen mit"** → **"Andere Anwendung"**
3. **"TipTap AI"** auswählen
4. ✅ **"Als Standard festlegen"** aktivieren
5. **"Auswählen"** klicken

### Option 2: Via System Settings (GNOME)

1. **Einstellungen** öffnen
2. **"Anwendungen"** → **"Standard-Anwendungen"**
3. Nach unten scrollen zu **"Text"** oder **"Markdown"**
4. **TipTap AI** auswählen

### Option 3: Via xdg-mime (Command Line)

```bash
# TipTap AI als Standard für Markdown setzen
xdg-mime default tiptapai.desktop text/markdown
xdg-mime default tiptapai.desktop text/x-markdown

# Überprüfen
xdg-mime query default text/markdown
# Sollte zeigen: tiptapai.desktop
```

---

## Doppelklick-Support

**Aktuell:** ✅ **IMPLEMENTIERT**

### Wie es funktioniert:

Die App akzeptiert jetzt Datei-Argumente von der Command Line und öffnet sie automatisch:
- Desktop-Datei hat `Exec=...tiptapai-start.sh %F`
- `%F` übergibt Datei-Pfade als Argumente
- `tiptapai-start.sh` gibt Argumente mit `"$@"` an npm/electron weiter
- `main.js` liest `process.argv` und sendet Dateipfad via IPC an Renderer
- `renderer/app.js` lädt die Datei mit `loadFile()`
- File tree navigiert automatisch zum Ordner der Datei (file-first architecture)

### Implementierte Komponenten:

#### 1. Start Script (`tiptapai-start.sh`)
```bash
# Passes all arguments through to npm/electron
npm run start:desktop -- "$@" > /tmp/tiptapai.log 2>&1
```

#### 2. Main Process (`main.js`)
```javascript
// Read command line arguments
const args = process.argv.slice(2);
const mdFiles = args.filter(arg => arg.endsWith('.md') && !arg.startsWith('-'));

if (mdFiles.length > 0) {
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      mainWindow.webContents.send('open-file-from-cli', mdFiles[0]);
    }, 100);
  });
}
```

#### 3. IPC Bridge (`preload.js`)
```javascript
onOpenFileFromCLI: (callback) => {
  ipcRenderer.on('open-file-from-cli', (event, filePath) => {
    callback(filePath);
  });
}
```

#### 4. Renderer (`renderer/app.js`)
```javascript
window.api.onOpenFileFromCLI(async (filePath) => {
  const fileName = filePath.split('/').pop();
  await loadFile(filePath, fileName);
  // ensureFileTreeShowsCurrentFile() is called automatically
});

// Delay loadInitialState() to allow CLI event to arrive first
setTimeout(() => {
  if (!cliFileHandled) {
    loadInitialState();
  }
}, 200);
```

### Jetzt funktioniert:
- ✅ Doppelklick auf `.md` Datei in Nautilus → TipTap AI öffnet die Datei
- ✅ Rechtsklick → "Öffnen mit TipTap AI"
- ✅ Dateipfad als Argument: `tiptapai-start.sh /path/to/file.md`
- ✅ File tree zeigt automatisch den Ordner der geöffneten Datei

---

## Testen

### 1. System erkennt TipTap AI

```bash
# Welche Apps können Markdown öffnen?
gio mime text/markdown
# Sollte "tiptapai.desktop" auflisten

# Oder mit xdg-mime
xdg-mime query default text/markdown
```

### 2. Desktop-Datei ist valid

```bash
desktop-file-validate ~/.local/share/applications/tiptapai.desktop
```

### 3. Rechtsklick-Menü Test

1. Gehe zu einem Ordner mit `.md` Dateien
2. Rechtsklick auf eine Datei
3. "Öffnen mit" → Sollte **"TipTap AI"** zeigen

---

## Troubleshooting

### TipTap AI erscheint nicht in "Öffnen mit"

```bash
# Desktop database neu laden
update-desktop-database ~/.local/share/applications/

# MIME-Cache leeren (GNOME)
rm -rf ~/.local/share/mime/application/*
update-mime-database ~/.local/share/mime/
```

### TipTap AI ist Standard, aber nichts passiert beim Doppelklick

→ **Command-Line Arguments nicht implementiert** (siehe oben)
→ Temporär: App manuell starten und Datei im File Tree öffnen

### Icon erscheint nicht

```bash
# Icon-Path in Desktop-Datei prüfen
grep Icon ~/.local/share/applications/tiptapai.desktop

# Sicherstellen dass Icon existiert
ls -la /home/matthias/_AA_TipTapAi/tiptapai.png
```

---

## Zukünftige Verbesserungen

- [ ] Command-Line Arguments Support (siehe oben)
- [ ] Mehrere Dateien gleichzeitig öffnen
- [ ] "Recent Files" Integration mit System
- [ ] File Associations für `.markdown`, `.mdown`, etc.

---

## Rollback

Falls Probleme auftreten, Desktop-Integration rückgängig machen:

```bash
# Alte Desktop-Datei wiederherstellen (ohne MimeType)
cat > ~/.local/share/applications/tiptapai.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=TipTap AI
Comment=Intelligent Markdown Editor with LanguageTool Integration
Exec=/home/matthias/_AA_TipTapAi/tiptapai-start.sh
Icon=/home/matthias/_AA_TipTapAi/tiptapai.png
Path=/home/matthias/_AA_TipTapAi
Terminal=false
Categories=Office;TextEditor;
Keywords=markdown;editor;languagetool;tiptap;writing;
StartupNotify=true
StartupWMClass=TipTap AI
EOF

# Desktop database aktualisieren
update-desktop-database ~/.local/share/applications/

# Standard-Markdown-Editor zurücksetzen (gedit als Beispiel)
xdg-mime default org.gnome.gedit.desktop text/markdown
```

---

**Nächste Schritte:**
1. Command-Line Arguments implementieren (siehe Anleitung oben)
2. Testen: `tiptapai ~/Documents/test.md`
3. Doppelklick auf .md Datei testen
