# Druck-Template Änderung

**Zweck:** Anleitung zur Änderung von Buchblock- und Cover-Templates für den PDF-Export

---

## Übersicht

TipTap AI exportiert Markdown-Dokumente zu druckfertigen PDFs (Buchblock + Cover). Die Templates liegen in:

```
renderer/book-export-lix/
├── lix-classes/          # LaTeX-Klassen für Buchblock
│   ├── sz-common.sty     # Gemeinsame Styles (alle Templates)
│   ├── sz-novel.cls      # Roman-Template
│   ├── sz-textbook.cls   # Lehrbuch-Template
│   └── ...
├── cover-builder/
│   └── templates/
│       ├── cover-labels.html    # Cover-Etiketten (Insel-Stil)
│       ├── cover-wrap.html      # Vollumschlag
│       └── cover-wrap-control.html  # Kontroll-PDF
└── tex-builder.js        # Generiert LaTeX aus Markdown
```

---

## Buchblock-Templates ändern

### 1. Globale Änderungen (alle Templates)

**Datei:** `renderer/book-export-lix/lix-classes/sz-common.sty`

**Häufige Anpassungen:**

- **Schrift:** Zeilen 36-62 (EB Garamond, Source Sans Pro, Ligaturen)
- **Seitenkopf/Fußzeile:** Zeilen 63-76 (`fancyhdr`)
- **Kapitelformatierung:** Zeilen 88-149 (`\titleformat`)
- **TOC-Format:** Zeilen 240-266 (Inhaltsverzeichnis)
- **Titelseite:** Zeilen 228-242 (`\maketitle`)

**Beispiel: TOC-Überschrift ändern**
```latex
% Zeile 263
{\rmfamily\mdseries\fontsize{30pt}{32pt}\selectfont\color{szInk}\noindent\contentsname\par}%
```

### 2. Template-spezifische Änderungen

**Datei:** `renderer/book-export-lix/lix-classes/sz-novel.cls` (oder andere `.cls`)

**Häufige Anpassungen:**

- **Seitenformat:** Zeilen 10-14 (`geometry`)
- **Kapitel-Opener:** Zeilen 23-31 (`\titleformat{\chapter}`)
- **Farben:** Zeile 16 (`\def\sz@accent{...}`)

**Beispiel: Kapitel-Opener zentrieren**
```latex
\titleformat{\chapter}[display]%
  {\thispagestyle{plain}\centering\normalfont\vspace*{36pt}}%  % centering hier
  {\sffamily\scriptsize\color{szPale}\MakeUppercase{Kapitel \thechapter}}%
  {14pt}%
  {\rmfamily\fontsize{34pt}{38pt}\selectfont\color{szInk}}%
  [\sz@chapterPost]
```

### 3. Frontmatter-Reihenfolge ändern

**Datei:** `renderer/book-export-lix/tex-builder.js`

**Funktion:** `buildSzTex()` (Zeile 399+)

**Beispiel: TOC vor Widmung**
```javascript
parts.push('\\maketitle');
parts.push('\\cleardoublepage');
parts.push('\\tableofcontents');  // TOC zuerst
parts.push('\\cleardoublepage');

if (isRealContent(metadata.dedication)) {
  parts.push(`\\dedicate{${inlineMarkdownToLix(metadata.dedication)}}{}`);
}
```

### 4. Header/Footer-Verhalten

**Frontmatter ohne Header:** `tex-builder.js` Zeile 406
```javascript
parts.push('\\pagestyle{empty}');  // Keine Header im Frontmatter
```

**Header ab Kapitel 1:** `tex-builder.js` Zeile 439
```javascript
parts.push('\\pagestyle{fancy}');  // Header ab hier
```

---

## Cover-Templates ändern

### 1. Cover-Etiketten (Insel-Stil)

**Datei:** `renderer/book-export-lix/cover-builder/templates/cover-labels.html`

**Struktur:**
- **CSS:** Zeilen 6-198 (Styles)
- **HTML:** Zeilen 200-246 (3 Labels: Back, Spine, Front)

**Häufige Anpassungen:**

**Rahmen ändern (Zeilen 74-84):**
```css
.label::before {
  content: ""; position: absolute; inset: 2.1mm;
  border: 0.18mm solid var(--rule);  /* Innerer Rahmen */
}
.label::after {
  content: ""; position: absolute; inset: -0.4mm;
  border: 0.15mm solid var(--rule);  /* Äußerer Rahmen */
}
```

**Ornament entfernen (Zeile 226):**
```html
<article class="label spine-label">
  <div class="spine-title">{{spineTitle}}</div>
  <!-- <div class="ornament">✥</div> -->  <!-- Auskommentiert -->
</article>
```

**Schriftgröße ändern (Zeile 117):**
```css
.front-label .title { 
  font-size: 26pt;  /* Größer: 30pt */
  line-height: 0.98; 
  font-weight: 400; 
}
```

### 2. Vollumschlag

**Datei:** `renderer/book-export-lix/cover-builder/templates/cover-wrap.html`

Ähnliche Struktur wie `cover-labels.html`, aber für den kompletten Umschlag (Back + Spine + Front in einem Stück).

---

## Änderungen testen

### Development-Modus (empfohlen)

```bash
cd /Users/erlkoenig/Documents/AA/_AA_TipTapAi
npm start
```

Die App lädt Templates direkt von der Festplatte — Änderungen sind sofort sichtbar.

### Produktions-App neu packen

Wenn du die installierte App in `/Applications/TipTap AI.app` nutzt, musst du sie neu bauen:

```bash
cd /Users/erlkoenig/Documents/AA/_AA_TipTapAi

# 1. Frontend bundlen
npm run build

# 2. App packen (macOS)
npx electron-builder --mac --dir

# 3. Installieren
# Die neue App liegt in dist/mac/TipTap AI.app
# Kopiere sie nach /Applications/ oder starte direkt:
open "dist/mac/TipTap AI.app"
```

**Wichtig:** Ohne Neupacken sieht die installierte App keine Template-Änderungen!

---

## Häufige Probleme

### Problem: Änderungen erscheinen nicht

**Ursache:** Du nutzt die installierte App (`/Applications/TipTap AI.app`), nicht die Development-Version.

**Lösung:** 
1. App komplett beenden
2. `npm start` im Repo-Verzeichnis ausführen
3. Oder: App neu packen (siehe oben)

### Problem: LaTeX-Fehler nach Änderung

**Ursache:** Syntax-Fehler in `.sty` oder `.cls`

**Lösung:**
1. Export-Log prüfen (wird im Fehler-Dialog angezeigt)
2. LaTeX-Syntax validieren (z.B. fehlende `}` oder `\fi`)
3. Änderung rückgängig machen und schrittweise testen

### Problem: Cover-Farben falsch

**Ursache:** CSS-Variablen in `cover-labels.html` nicht gesetzt

**Lösung:** Prüfe Zeilen 7-21:
```css
:root {
  --label-paper: #fffdf6;  /* Papierfarbe */
  --label-edge: #e8dfcc;   /* Randfarbe */
  --ink: {{inkColor}};     /* Wird vom Generator gefüllt */
  --accent: {{accentColor}};
}
```

---

## Checkliste für Template-Änderungen

- [ ] Datei identifiziert (`.sty`, `.cls`, `.html`)
- [ ] Änderung gemacht
- [ ] Development-Modus gestartet (`npm start`)
- [ ] Export getestet
- [ ] Bei Erfolg: Commit + Push
- [ ] Optional: Produktions-App neu gepackt

---

## Weitere Ressourcen

- **LaTeX-Doku:** `design/README.md` (im Repo)
- **Cover-Generator:** `renderer/book-export-lix/cover-builder/README.md`
- **Frontmatter-Schema:** `renderer/book-export-lix/frontmatter-schema.js`
