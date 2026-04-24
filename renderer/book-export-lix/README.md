# renderer/book-export-lix — LiX/LaTeX Buchexport-Pipeline

Zweite, vollstaendig isolierte Buchexport-Pipeline. Markdown+YAML → BookIR → LiX-.tex → Tectonic → PDF.

## Isolation

Dieses Modul importiert **nichts** aus `renderer/book-export/` oder `@paragraf/*`.
Es liest nur das profilneutrale BookIR-Modell (reine Datenstruktur).
Die Paragraf-Pipeline kann ersatzlos geloescht werden, ohne dass dieses Modul bricht.

Einzige externe Abhaengigkeit: die vendored LiX-Klassen unter
`lix-classes/` (co-located) und eine LaTeX-Engine (primaer Tectonic).

## Architektur

```
index.js           compileLixPdf(bookIR, options) → { pdf: Buffer, tex, outDir }
tex-builder.js     BookIR → LiX-.tex-String
tex-escape.js      LaTeX-Escaping + Markdown-Inline → LiX-Inline
engine-detect.js   findet tectonic | xelatex | lualatex | latexmk (in dieser Reihenfolge)
engine-runner.js   spawned die Engine, liefert PDF-Buffer oder wirft mit Log-Auszug
assets.js          kopiert .cls/.sty in tmp, resolved und staged Bilder/Cover
```

## Testen

Preflight (System bereit?):

```
node scripts/lix-preflight.mjs
```

Smoke-Test (kompiliert ein Mini-BookIR zu einem echten PDF):

```
node scripts/lix-smoke.mjs
```

## Entfernen

Um diese Pipeline ersatzlos zu entfernen:

1. Ordner loeschen: `renderer/book-export-lix/`
2. `main-book-export-lix.js` im Projekt-Root loeschen
3. Export-Dialog-UI: Umschalter "Engine: LiX" ausbauen
4. `scripts/lix-preflight.mjs` und `scripts/lix-smoke.mjs` loeschen
5. Das co-located `lix-classes/` ist Teil dieses Ordners und geht mit.

Die Paragraf-Pipeline bleibt davon unberuehrt.

## Fail-Fast

- Fehlende LaTeX-Engine → Exception mit Installations-Hinweis.
- LaTeX-Kompilierungsfehler → Exception mit Log-Auszug und Pfad zum vollen Log.
- Nicht aufloesbares Asset (Cover/Bild) → Exception.
- tmp-Verzeichnis wird bei Fehler nicht geloescht, sondern in `err.outDir` hinterlegt.
  Override: `TIPTAPAI_LIX_KEEP_TMP=1` behaelt tmp auch bei Erfolg.
