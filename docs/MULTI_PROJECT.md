# Arbeiten mit mehreren Node.js-Projekten

**Zweck**: Erklärt, wie mehrere Node.js/Electron-Projekte parallel entwickelt werden können, ohne dass sie sich gegenseitig stören.

---

## TL;DR - Die wichtigste Erkenntnis

**Node.js-Projekte sind automatisch isoliert!**

Jedes Projekt hat sein eigenes `node_modules/` Verzeichnis mit eigenen Dependencies. Du kannst beliebig viele Projekte parallel haben, ohne dass sie sich in die Quere kommen.

---

## Wie Isolation funktioniert

### 1. Dependencies sind projekt-lokal

```
~/projects/
├── tiptapai/
│   ├── package.json
│   └── node_modules/          # NUR für tiptapai!
│       ├── electron@28.0.0
│       └── @tiptap/core@2.1.0
│
└── andere-app/
    ├── package.json
    └── node_modules/          # Komplett separate Dependencies!
        ├── electron@27.0.0    # Kann andere Version sein!
        └── react@18.0.0
```

**Vergleich zu Python:**

```
Python/conda:
❌ Globale Environments (müssen explizit aktiviert werden)
   conda activate projekt1  # Wechselt global!
   conda activate projekt2  # Deaktiviert projekt1

Node.js/npm:
✅ Automatisch projekt-lokal
   cd projekt1  # Dependencies sind im Ordner
   cd projekt2  # Andere Dependencies
```

---

### 2. Node.js-Version per Projekt (mit nvm)

```bash
# Projekt 1: Node 20
cd ~/tiptapai
echo "20" > .nvmrc
nvm use  # Nutzt Node 20

# Projekt 2: Node 18
cd ~/andere-app
echo "18" > .nvmrc
nvm use  # Nutzt Node 18

# Kein Konflikt! Jedes Projekt mit eigener Version.
```

---

### 3. Parallele Ausführung

```bash
# Terminal 1: TipTap AI starten
cd ~/tiptapai
npm start
# → Electron-Fenster 1 öffnet sich

# Terminal 2: Andere App starten
cd ~/andere-app
npm start
# → Electron-Fenster 2 öffnet sich

# Beide laufen parallel, kein Konflikt!
```

---

## Praktisches Setup für mehrere Projekte

### Projekt-Struktur

```
~/projects/
├── tiptapai/
│   ├── .nvmrc               # "20"
│   ├── package.json
│   ├── node_modules/
│   └── ...
│
├── markdown-viewer/
│   ├── .nvmrc               # "18"
│   ├── package.json
│   ├── node_modules/
│   └── ...
│
└── chat-app/
    ├── .nvmrc               # "20"
    ├── package.json
    ├── node_modules/
    └── ...
```

**Jedes Projekt komplett unabhängig!**

---

## nvm: Automatisches Switching

### Manuelles Switching

```bash
cd ~/tiptapai
nvm use  # Liest .nvmrc → nutzt Node 20

cd ~/andere-app
nvm use  # Liest .nvmrc → nutzt Node 18
```

### Automatisches Switching (bash)

```bash
# In ~/.bashrc hinzufügen:
cdnvm() {
  builtin cd "$@"
  if [[ -f .nvmrc ]]; then
    nvm use
  fi
}
alias cd='cdnvm'
```

**Dann**: `cd ~/tiptapai` → automatisch richtige Node-Version!

### Automatisches Switching (zsh)

```bash
# In ~/.zshrc hinzufügen:
autoload -U add-zsh-hook
load-nvmrc() {
  if [[ -f .nvmrc ]]; then
    nvm use
  fi
}
add-zsh-hook chpwd load-nvmrc
```

---

## Workflow-Beispiele

### Beispiel 1: Zwei Projekte parallel entwickeln

```bash
# Terminal 1: TipTap AI
cd ~/tiptapai
nvm use              # Node 20
npm install          # Dependencies installieren
npm start            # App starten

# Terminal 2: Andere App
cd ~/markdown-viewer
nvm use              # Node 18 (automatisch!)
npm install          # Andere Dependencies
npm start            # Andere App starten

# Beide Apps laufen gleichzeitig, kein Problem!
```

### Beispiel 2: Zwischen Projekten wechseln

```bash
# Morgens: TipTap AI
cd ~/tiptapai
npm start
# ... Arbeiten ...
# Ctrl+C zum Beenden

# Nachmittags: Andere App
cd ~/andere-app
npm start
# ... Arbeiten ...

# Kein "conda deactivate" nötig!
# Einfach cd ins andere Projekt.
```

### Beispiel 3: Dependencies aktualisieren

```bash
# TipTap AI: Electron auf v29 updaten
cd ~/tiptapai
npm install electron@29
# → Nur in tiptapai aktualisiert!

# Andere App: Bleibt bei v27
cd ~/andere-app
npm list electron
# → electron@27.0.0 (unverändert)
```

---

## Best Practices

### 1. Immer .nvmrc verwenden

```bash
# In jedem Projekt:
echo "20" > .nvmrc

# Dann automatisches Switching mit nvm use
```

### 2. Node-Version committen

```bash
# .nvmrc ins Git-Repo
git add .nvmrc
git commit -m "Add Node.js version specification"

# Dann: Andere Entwickler nutzen automatisch richtige Version
```

### 3. Globale Packages vermeiden

```bash
# ❌ Vermeiden:
npm install -g some-package

# ✅ Besser: Projekt-lokal
npm install --save-dev some-package
npx some-package  # Ausführen
```

**Warum?** Globale Packages sind shared zwischen Projekten → potenzielle Konflikte.

### 4. Shell-Helper für schnelles Switching

```bash
# In ~/.bashrc:
function dev() {
    cd ~/projects/$1
    nvm use
    npm start
}

# Nutzung:
dev tiptapai        # cd + nvm use + npm start
dev markdown-viewer # Wechselt zu anderem Projekt
```

---

## Isolation-Level

| Was | Isoliert? | Wie? |
|-----|-----------|------|
| **Dependencies** | ✅ Ja | Jedes Projekt hat eigenes `node_modules/` |
| **Node.js Version** | ✅ Ja | nvm pro Projekt (.nvmrc) |
| **Package-Versionen** | ✅ Ja | package.json pro Projekt |
| **Ports (Dev-Server)** | ⚠️ Config | In package.json konfigurieren |
| **Globals (npm -g)** | ❌ Shared | Besser vermeiden, nur lokal installieren |
| **Dateisystem** | ❌ Nein | Alle Projekte sehen gleiches Filesystem |

---

## Häufige Fragen

### Q: Brauche ich conda für Node.js-Projekte?

**Nein!** Node.js-Projekte sind von Natur aus isoliert. nvm + npm ersetzen conda komplett.

```
conda create -n projekt1  →  mkdir projekt1 && cd projekt1
conda activate projekt1   →  nvm use (automatisch via .nvmrc)
conda install package     →  npm install package
```

---

### Q: Was passiert, wenn zwei Projekte denselben Port nutzen?

**Lösung**: Port konfigurieren

```json
// Projekt 1: package.json
{
  "scripts": {
    "start": "PORT=3000 electron ."
  }
}

// Projekt 2: package.json
{
  "scripts": {
    "start": "PORT=3001 electron ."
  }
}
```

**Bei Electron**: Kein Problem, jede App hat eigenes Fenster (kein Port).

---

### Q: Können Projekte Dependencies sharen?

**Nein (und das ist gut so!)** Jedes Projekt hat eigene Dependencies. Das verhindert Konflikte.

**Trade-off**: Mehr Disk Space (~100-200 MB pro Projekt mit Electron).

**Aber**: Disk Space ist billig, Isolation ist wertvoll!

---

### Q: Was ist mit globalen npm-Packages?

**Minimieren!** Globale Packages sind shared → können Konflikte verursachen.

```bash
# ❌ Global installieren
npm install -g electron

# ✅ Projekt-lokal installieren
npm install --save-dev electron
npx electron .  # Ausführen via npx
```

---

## Vergleich: Python vs. Node.js

| Aspekt | Python/conda | Node.js/nvm+npm |
|--------|--------------|-----------------|
| **Environment-Aktivierung** | Manuell (`conda activate`) | Automatisch (cd ins Projekt) |
| **Dependencies** | Global im Environment | Lokal in `node_modules/` |
| **Mehrere Projekte** | Ein Environment aktiv | Alle parallel möglich |
| **Wechsel** | `conda activate` nötig | Einfach `cd` |
| **Isolation** | Environment-Level | Projekt-Level (besser!) |

---

## Troubleshooting

### Problem: Falsche Node-Version wird genutzt

**Symptom**:
```bash
cd ~/tiptapai
node --version
# v18.0.0 (aber sollte v20 sein!)
```

**Lösung**:
```bash
# .nvmrc prüfen
cat .nvmrc
# 20

# Manuell wechseln
nvm use 20

# Oder: Auto-Switching aktivieren (siehe oben)
```

---

### Problem: npm install findet Packages nicht

**Symptom**:
```bash
npm start
# Error: Cannot find module 'electron'
```

**Lösung**:
```bash
# Dependencies installieren (in jedem Projekt!)
cd ~/tiptapai
npm install

# Falls package.json fehlt:
npm init -y
npm install electron @tiptap/core ...
```

---

### Problem: Port bereits belegt

**Symptom**:
```
Error: Port 3000 already in use
```

**Lösung**:
```bash
# Anderen Port verwenden
PORT=3001 npm start

# Oder: Port in package.json konfigurieren
```

---

## Zusammenfassung

✅ **Node.js-Projekte sind automatisch isoliert**
- Jedes Projekt hat eigene Dependencies
- Jedes Projekt kann eigene Node-Version nutzen
- Projekte können parallel laufen
- Kein manuelles "Environment aktivieren" nötig

✅ **Best Practices**
- .nvmrc in jedem Projekt
- Globale Packages vermeiden
- Auto-Switching aktivieren für Komfort

✅ **Einfacher als conda**
- Weniger manuelles Switching
- Bessere Isolation
- Nativer Teil des Node.js-Ökosystems

---

**Nächste Schritte**: Siehe SETUP.md für initiales Projekt-Setup.
