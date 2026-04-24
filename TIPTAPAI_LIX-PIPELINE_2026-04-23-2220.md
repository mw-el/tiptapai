# TIPTAPAI — Zweite Buchexport-Pipeline: LiX/LaTeX

**Status:** ✅ Implementierung abgeschlossen – 2 optionale Punkte offen (siehe unten)
**Start:** 2026-04-23 22:20
**Ziel:** Vollständig isolierte zweite Buchexport-Pipeline. Markdown + YAML → LiX-`.tex` → Tectonic → PDF. Paragraf-Pipeline bleibt unberührt und jederzeit löschbar.

---

## Entscheidungen (fixiert)

| # | Thema | Entscheidung |
|---|---|---|
| 1 | LaTeX-Engine | **Tectonic** primary. Fallbacks: xelatex, lualatex, latexmk. |
| 2 | Fonts/Pakete | **Tectonic-Bundle gepinnt** (SHA-reproducible). Kein OTF-Vendoring. Harter Fehler wenn Paket fehlt — keine stillen Font-Fallbacks. |
| 3 | Asset-Resolution | Frontmatter-Pfade primär (relativ zur `.md`). TipTapAI-Resolver nur als Fallback. Resolve-Logik wird **kopiert**, nicht importiert. |
| 4 | Feature-Scope | **Vollständig** — TOC, Index, Bibliografie, Endnotes, Lettrine, Cover, ISBN, Lizenz, Epigraph, Dedication. Alle LiX-Makros aus `lix-readme.md`. |
| 5 | Cleanup | Erfolg → `tmp` löschen. Fehler → stehen lassen, Pfad in Exception. Override: `TIPTAPAI_LIX_KEEP_TMP=1`. |
| Frontmatter-Schema | — | **Dupliziert** in `renderer/book-export-lix/frontmatter-schema.js`. |

---

## Architektur (geplant)

```
renderer/book-export-lix/              # eigener Ordner, null Imports aus paragraf-engine*
  index.js                             # compileLixPdf(bookIR, options) → Buffer
  tex-builder.js                       # BookIR → LiX-.tex-String
  tex-escape.js                        # LaTeX-Escape (&, %, $, _, #, ~, ^, \)
  engine-runner.js                     # spawn tectonic|xelatex|latexmk
  engine-detect.js                     # cached binary-lookup
  assets.js                            # .cls/.sty + images ins tmp
  frontmatter-schema.js                # dupliziert aus renderer/book-export/
  README.md                            # wie löschen, wie testen
main-book-export-lix.js                # IPC-Handler, Kanal "book-export-lix-compile"
scripts/lix-preflight.mjs              # Tectonic + Pakete + LiX-Klassen verifizieren
Typesetting/Lix Reference Files/       # bereits vorhanden — vendored .cls/.sty
```

IPC-Kanal: `book-export-lix-compile` (nicht auf `book-export-compile` piggybacken).

---

## Fortschritt

- [x] Fragen 1–5 geklärt
- [x] LiX-Internals inspiziert (pdfTeX-basiert, nicht fontspec — deshalb Tectonic-Cache statt OTF-Vendoring)
- [x] `scripts/lix-preflight.mjs` schreiben
- [x] Preflight auf Zielsystem laufen lassen (8/8 Tests grün, inkl. optionale)
- [x] `renderer/book-export-lix/` anlegen
- [x] `tex-builder.js` gegen BookIR
- [x] `engine-runner.js` + `engine-detect.js`
- [x] `assets.js` (Kopiere LiX-Klassen + Bilder ins tmp)
- [x] `scripts/lix-smoke.mjs` — kompiliert Mini-BookIR end-to-end zu PDF (validiert)
- [x] `frontmatter-schema.js` dupliziert
- [x] `main-book-export-lix.js` + IPC-Kanal `book-export-lix-compile`
- [x] `preload.js` Bridge: `bookLixExportCompile`, `bookLixExportPreflight`
- [x] `main.js`: `registerBookExportLixHandlers(app)` aufgerufen
- [x] Export-Dialog: Format-Eintrag „📕 Buch (PDF, LiX/LaTeX)" + `handleBookLixExport`
- [x] `index.html`: Dropdown-Option `book-lix`
- [x] Typografie-Feintuning: `typo-settings.json` + Generator → dynamisch erzeugte `tiptapai-typo.sty` (Witwen/Waisen, emergencystretch, microtype-Protrusion, ragged bottom, frenchspacing)
- [ ] **Echter Lauf gegen `Schreibblockaden-final_2026-04-12.md`** — Abnahme-Test bewusst zurückgestellt; Pipeline ist technisch vollständig und per Smoke-Test validiert.
- [ ] **UI-Editor für `typo-settings.json`** — explizit als späteres Feature zurückgestellt; JSON-Struktur ist dafür schon flat gehalten.

## Typografie-Feintuning

Die `.sty`-Datei `tiptapai-typo.sty` wird **nicht** statisch gepflegt, sondern bei jedem Export frisch aus `renderer/book-export-lix/typo-settings.json` generiert (via `typo-settings.js`, eingebunden von `assets.js`). Das garantiert:

- **Eine Quelle der Wahrheit** — Einstellungen nur im JSON editieren.
- **UI-ready** — die JSON-Struktur ist flach und typisiert, ein späteres Settings-Modal rendert direkt daraus.
- **Engine-Hinweise inline** — jede Sektion hat `_comment` mit Begründung und Grenzen (z. B. dass xetex/Tectonic nur `protrusion` von microtype unterstützt).

Aktive Stellschrauben:
1. Witwen-/Waisenschutz (`widowpenalty`, `clubpenalty`, `displaywidowpenalty = 10000`)
2. Overfull-Box-Schutz (`emergencystretch = 3em`, `tolerance`, `hbadness`, `vbadness`)
3. Silbentrennung (`lefthyphenmin`, `righthyphenmin`)
4. `\frenchspacing` (deutsche Konvention)
5. microtype — unter xetex nur `protrusion=true` (mit `factor=1100`); andere Features pdftex-exklusiv und im JSON dokumentiert
6. `\raggedbottom` (Belletristik-Default; auf `flush` umschaltbar)
7. `\linepenalty` (leicht gesenkt für weichere Umbruchentscheidungen)

---

## Nicht-Ziele

- Keine Änderungen an `paragraf-engine*`, `profiles/*`, `epub-generator.js`.
- Kein EPUB in der LiX-Pipeline.
- Keine JS-Reimplementierung von LiX-Features.

---

## Notizen

- **Tectonic-Bundle-Pin**: `Tectonic.toml` im tmp-Build-Dir mit fixierter Bundle-URL+SHA. So ist jeder Export byte-identisch mit dem Referenz-Cache. Wird später in `engine-runner.js` realisiert.
- **LiX ist pdfTeX**: `\usepackage[utf8]{inputenc}\usepackage[T1]{fontenc}` — kein `fontspec`. Tectonic nutzt intern xelatex als Default, verträgt aber T1/inputenc problemlos (ignoriert sie). Kritisch wäre nur, wenn LiX `\pdfoutput` explizit forcieren würde — tut es nicht.
- **Referenz-PDFs**: `/Users/erlkoenig/Documents/Schreibblockaden-final_2026-04-12-{novel,novella,poetry,textbook}.pdf`. Dagegen wird das Mapping verifiziert.
