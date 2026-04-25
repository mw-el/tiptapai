# Pipeline: Von Markdown zu druckreifem Buch-PDF und EPUB

Diese Spezifikation beschreibt eine End-to-End-Pipeline, die aus einem Markdown-Manuskript mit YAML-Frontmatter ein druckreifes Print-PDF (z. B. für KDP/Tolino) und ein EPUB erzeugt. Sie verwendet:

- **LiX** als inhaltliche Blaupause ("Rezepte" für Roman, Sachbuch, Novelle, Lyrik, zweispaltiges Layout).[file:89][web:121]
- **Paragraf** als Node.js-Typografie-Engine mit Knuth‑Plass-Umbruch, HarfBuzz-Shaping und PDF/SVG-Output.[file:90]

Die Dokumentation ist so formuliert, dass sie als Start-Prompt für einen AI-Coding-Assistenten (z. B. Claude Code) verwendet werden kann.

---

## 1. Zielbild der Pipeline

Ziel ist eine Node.js/TypeScript-Pipeline, die aus **Markdown + YAML-Frontmatter** zwei Artefakte erzeugt:

1. Ein druckreifes **Print-PDF** (Print-Layout für KDP/Tolino/generic), gesetzt mit Paragraf.
2. Ein **EPUB** / reflowable eBook (Kindle/Tolino-kompatibel, typografisch weniger komplex).[web:96][web:99]

**Eckpunkte:**

- Keine direkte LaTeX-Abhängigkeit im Produktionspfad, sondern:
  - LiX nur als *Design- und Feature-Referenz* (Klassen & Kommandos).[file:89][web:121]
  - Paragraf als Satz-Engine für Print.[file:90]
- Inputformat: Markdown mit YAML-Frontmatter (oder `book.yaml` + `book.md`).
- Interne Repräsentation: ein **BookIR**-Modell, das Inhalt, Layout und Metadaten trennt.
- Profile: `novel`, `textbook`, `novella`, `poetry`, `news-twocol`.
- Zielausgaben pro Build:
  - `build/print/book-<type>-<profile>.pdf`
  - `build/epub/book-<type>-<profile>.epub`.

---

## 2. Referenzen: LiX und Paragraf

### 2.1 LiX-Repository (LaTeX-Metapackage)

**Repository:** `https://github.com/NicklasVraa/LiX`.[web:121]

LiX ist ein "Meta-Package" für LaTeX, das viele Pakete bündelt und eine stark vereinfachte, quasi markdownartige Syntax für Autoren zur Verfügung stellt.[file:89] Wichtige Aspekte aus README und Klassenübersicht:

- Ziel: Dokumentenquelltext soll sich wie gut lesbares Markdown anfühlen, Stil und Layout sind sauber vom Inhalt getrennt.[file:89]
- LiX bringt **vordefinierte Klassen für verschiedene Dokumenttypen**:
  - `Novel` – fiktionale Romane mit Cover, Titel-, Metadaten-, Lizenz- und ISBN-Seiten.[file:89]
  - `Textbook` – Lehr-/Sachbücher mit umfangreicher Semantik (Theoreme, Algorithmen, Code, Tabellen, Abbildungen).[file:89]
  - `Novella` – Kurzromane/Kurzgeschichten-Sammlungen.[file:89]
  - `Poem` – Gedichtband mit Ornamenten und spezieller Typografie.[file:89]
  - `News` – Zeitungs-/zweispaltiges Layout mit Periodical-Metadaten (Price, Issue, Volume).[file:89]

- LiX definiert **Buch-spezifische Kommandos**, u. a.:
  - `\cover{front.pdf}{back.pdf}` – Front- und Backcover einbinden.[file:89]
  - `\isbn{978-...}` – ISBN + Barcode.[file:89]
  - `\license{typemodifiersversionholder}` – Lizenzseite, z. B. `CCby-nc-sa4.0`.[file:89]
  - Publish-Bundle: Dedikation, Edition, Publisher, Acknowledgements, Epigraph, Blank Pages.[file:89]
  - `\size{...}` / `\margins{...}` – Dokumentformat und Satzspiegel inkl. inner/outer-Margins.[file:89]

Diese Kommandos bilden einen **präzisen fachlichen Katalog**, welche Elemente ein Roman/Sachbuch/Lyrikband usw. typischerweise enthält.

### 2.2 Paragraf-Repository (Node.js-Typografie-Engine)

**Repository README:** Du hast `Paragraf-README.md` bereitgestellt.[file:90]

Paragraf ist eine modulare Typesetting-Engine für Node.js, die auf professionellen Layout-Engines wie TeX/InDesign basiert:[file:90]

- **Knuth‑Plass optimal line breaking** mit 22 Sprach-Hyphenation.[file:90]
- **OpenType-Shaping** via `rustybuzz` (Rust/WASM-Port von HarfBuzz).
- **Optical Margin Alignment** (optischer Randausgleich) mit Zweiphasen-Reflow.[file:90]
- **Multi-Frame-/Multi-Page-Layout** mit Baseline-Grid.[file:90]
- **ICC-Farbmanagement** inkl. sRGB/Lab/CMYK-Konvertierung für druckfähige PDFs.[file:90]

Architektur (gekürzt):[file:90]

- `paragraflinebreak` – Knuth‑Plass + Hyphenation.
- `paragrafstyle` – Absatz- und Zeichenstile mit Vererbung.
- `paragrafshaping-wasm` – OpenType-Shaper.
- `paragraflayout` / `paragrafrender-core` – Seitengeometrie, Glyph-Layout.[file:90]
- `paragrafrender-pdf` – PDF-Rendering über pdfkit.[file:90]
- `paragrafcompile` – High-Level-API: Template + Daten → PDF/SVG.[file:90]

Paragraf ist damit das ideale Backend, um die typografischen Vorteile von TeX/InDesign in einer Node.js-Pipeline zu nutzen.

### 2.3 Lokale Referenzablage im Repo

Damit die LiX-Analyse nicht nur auf einem externen Link oder einem temporären
Download basiert, liegt die aktuell benoetigte Referenzmenge auch lokal im
Projekt:

```text
Typesetting/
  lix-readme.md
  Lix Reference Files/
    README.md
    lix.sty
    novel.cls
    textbook.cls
    novella.cls
    poem.cls
```

Diese Dateien sind bewusst als **Referenzdaten** abgelegt, nicht als direkter
Produktionspfad. Sie dienen dazu,

- die Frontmatter-/Titelei-Logik gegen LiX zu vergleichen,
- erwartete Buch-Metadaten und Klassenhooks nachvollziehbar zu machen,
- und automatisiert zu testen, ob die benoetigten LiX-Vorlagen ordentlich
  importiert wurden.

Fuer die eigentliche Herkunft und den Importzustand ist
`Typesetting/Lix Reference Files/README.md` die lokale Quelle der Wahrheit.

### 2.4 Konkrete Quellen fuer die aktuelle Implementierung

Die aktuelle TipTapAI-Implementierung fuer fehlertolerante Buch-Metadaten und
Frontmatter-Defaults stuetzt sich auf diese Projektdateien:

- `renderer/book-export-lix/book-type-registry.js`
  **Einzige Quelle der Wahrheit** fuer alle Buchtypen. Jeder Buchtyp ist hier
  mit Label, LaTeX-Klasse, Standard-Trim-Size, Raendern und Layout-Features
  eingetragen. Alle anderen Dateien leiten ihre Listen daraus ab.
  **Um einen neuen Buchtyp hinzuzufuegen oder bestehende Parameter zu aendern,
  genuegt es, diese eine Datei zu bearbeiten.**
- `renderer/book-export-lix/frontmatter-schema.js`
  Validierung und Default-Ableitungsfunktionen. Importiert `BOOK_TYPE_REGISTRY`
  und stellt `isValidBookType`, `getRecommendedTrimSize`, `getRecommendedMargins`,
  `getDefaultLayout` sowie `mergeWithDefaults` bereit. Enthaelt ausserdem
  `DEFAULT_MARGINS` als Fallback fuer nicht-kanonische Trim-Size-Kombinationen.
- `renderer/book-export-lix/parser.js`
  Uebersetzt Frontmatter und Defaultwerte in produktive `BookMetadata`.
- `renderer/book-export-lix/tex-builder.js`
  BookIR → LiX-TeX. Liest die LaTeX-Klasse direkt aus `BOOK_TYPE_REGISTRY`.
- `renderer/ui/book-frontmatter-dialog.js`
  Dialog zum Vorbefuellen, Bearbeiten und Rueckspeichern der Buchdaten.
  Befuellt das Buchtyp-Dropdown beim ersten Oeffnen dynamisch aus `BOOK_TYPE_REGISTRY`.
- `renderer/ui/export-dialog.js`
  Stellt sicher, dass dieselben Werte auch im echten Exportlauf gelten.
- `renderer/index.html`
  Sichtbare Placeholder und Eingabefelder im UI. Das Buchtyp-Dropdown
  enthaelt nur den Leer-Eintrag; die Optionen kommen vom Dialog-JS.

Diese Dateien sind die massgebliche Implementierungsbasis fuer Tests gegen das
derzeitige Verhalten von TipTapAI. Die LiX-Dateien sind dafuer die
fachlich-typografische Referenz, nicht die laufende Engine.

---

## 3. Inputformat: Markdown + YAML-Frontmatter

### 3.1 Projektstruktur

Erwartete Standard-Struktur:

```text
book-project/
  book.yaml      # Metadaten, Layout/Profil, Zielplattformen
  book.md        # Hauptmanuskript im Markdown-Format
  assets/
    cover-front.pdf
    cover-back.pdf
    fonts/
      EBGaramond-Regular.ttf
      EBGaramond-Bold.ttf
  build/
    print/
    epub/
```

Alternativ können Kapitel in `chapters/` liegen, `book.yaml` enthält dann die Reihenfolge der Dateien.

### 3.2 YAML-Schema für Frontmatter

`book.yaml` überträgt die LiX-Konzepte (Publish/License/ISBN/Cover) in eine Engine-neutrale Form:[file:89]

```yaml
title: "A Cool Title"
subtitle: "And a Cool Subtitle"
authors:
  - name: "Author One"
    email: "author1@example.com"
  - name: "Author Two"

language: "en-US"      # für Hyphenation/Paragraf
book_type: "novel"     # novel | textbook | novella | poetry | news-twocol

edition: 1
published_year: 2023
publisher: "My Company"
imprint: |
  My Company, Some Street 1, 8000 Zürich
  Printed in Germany

license:
  type: "CC"
  modifiers: ["by", "nc", "sa"]
  version: "4.0"
  holder: "My Company"

isbn:
  print: "978-0-201-52983-8"
  ebook: "978-0-201-52984-5"

cover:
  front: "assets/cover-front.pdf"
  back: "assets/cover-back.pdf"

epigraph: |
  "Some quotation or poem
  that sets the mood for the book."

dedication: "To my family."

trim_size: "5x8"        # oder "6x9", "a5", "a4" etc.
print_profile: "kdp"    # kdp | tolino | generic
ebook_profile: "kdp-epub"

layout:
  margins:
    top: 36             # mm
    bottom: 40
    inner: 40
    outer: 30
  dropcaps: true
  recto_chapter_start: true

targets:
  - print-pdf
  - epub
```

Dieses Schema spiegelt die LiX-Kommandos `\license`, `\isbn`, `\cover`, `\size`, `\margins` und `\publish` wider, lässt sich aber unabhängig von LaTeX/Paragraf interpretieren.[file:89]

`book.md` enthält reguläres GitHub-Markdown. Zusatzsemantik (Poetry-Blöcke, Szenenwechsel, explizite Pagebreaks) kann über Fenced-Blocks oder Custom-Directives eingebracht werden.

### 3.3 Fehlertolerante Buchmetadaten fuer die Produktion

Fuer die Buchproduktion darf ein Export nicht daran scheitern, dass Titelei-
oder Frontmatter-Felder noch nicht vollstaendig gepflegt wurden. Deshalb
braucht die Pipeline eine fehlertolerante Metadaten-Schicht mit klaren,
sichtbaren Platzhaltern.

**Sollverhalten:**

1. Fehlende Buch-Metadaten werden durch klar erkennbare generische Werte
   ersetzt.
2. Sobald der Nutzer echte Werte eintraegt, haben diese immer Vorrang.
3. Dialog, gespeichertes Frontmatter und produktiver Export muessen dieselben
   Werte verwenden.
4. Dateibasierte Assets wie Cover bekommen **keine** kuenstlichen Fake-Pfade.
5. Der Haupttext des Buches bleibt durch diese Funktion unberuehrt.

**Generische Produktionswerte:**

- Titel: `[Buchtitel eintragen]`
- Autorin/Autor: `[Autorin/Autor eintragen]`
- Verlag: `[Verlag eintragen]`
- ISBN Print: `[ISBN Print eintragen]`
- ISBN eBook: `[ISBN eBook eintragen]`
- Lizenz: `Alle Rechte vorbehalten`
- Rechteinhaber: `[Rechteinhaber eintragen]`
- Widmung: `[Widmung eintragen]`
- Epigraph: `[Motto / Epigraph eintragen]`

Diese Defaults sind **kein finales Design** der Titelei, sondern eine
Produktions-Sicherheitsfunktion. Sie verhindern leere oder technische
Platzhalter wie `Untitled` und `Unknown`, bis spaeter echte Buchdaten
eingetragen wurden.

**Testbare Erwartungen:**

- Ein Buchexport mit leerem oder unvollstaendigem Frontmatter muss trotzdem
  erfolgreich laufen.
- Im erzeugten PDF/EPUB muessen die generischen Produktionswerte erscheinen,
  falls keine echten Werte vorhanden sind.
- Wenn der Nutzer Werte im Dialog oder Frontmatter setzt, muessen diese die
  generischen Werte vollstaendig ersetzen.
- Wenn `In Frontmatter speichern` deaktiviert ist, darf die Quelldatei
  unveraendert bleiben, der Export muss aber dennoch mit denselben Werten
  laufen.
- Ein ordentlicher Import der LiX-Referenzen ist gegeben, wenn die Dateien aus
  `Typesetting/Lix Reference Files/` vorhanden sind und dort die erwarteten
  Hooks wie `\wrap`, `\addMetadata`, `\addFormalPage` und `\addEpigraph`
  nachweisbar sind.

---

## 4. Internes Buchmodell (BookIR)

Zwischen Markdown und Rendering liegt ein Intermediate Representation (IR), das Inhalt, Metadaten und Layout trennt:[file:89][file:90]

```ts
type BookType = 'novel' | 'textbook' | 'novella' | 'poetry' | 'news-twocol';

interface BookMetadata {
  title: string;
  subtitle?: string;
  authors: { name: string; email?: string }[];
  language: string; // z. B. "en-US", "de-DE"
  bookType: BookType;
  edition?: number;
  publishedYear?: number;
  publisher?: string;
  imprint?: string;
  license?: {
    type: string;
    modifiers: string[];
    version: string;
    holder?: string;
  };
  isbn?: { print?: string; ebook?: string };
  cover?: { front?: string; back?: string };
  epigraph?: string;
  dedication?: string;
}

interface LayoutConfig {
  trimSize: '5x8' | '6x9' | 'a5' | 'a4';
  margins: { top: number; bottom: number; inner: number; outer: number }; // mm
  rectoChapterStart: boolean;
  dropcaps: boolean;
  columns?: 1 | 2;
}

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'image'; alt: string; path: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'math'; display: boolean; content: string }
  | { type: 'blockquote'; text: string }
  | { type: 'poem'; lines: string[] }
  | { type: 'hr' }
  | { type: 'pagebreak' };

interface Chapter {
  title: string;
  number: number;
  blocks: Block[];
}

interface BookIR {
  metadata: BookMetadata;
  layout: LayoutConfig;
  frontmatter: Block[];
  chapters: Chapter[];
  backmatter: Block[];
}
```

Der Markdown-Parser (z. B. `remark`) erzeugt aus `book.md` die `Chapter[]` und `Block[]`; `book.yaml` wird in `BookMetadata` und `LayoutConfig` gemappt.[web:96]

---

## 5. Profil-Schicht (Novel/Textbook/Novella/Poetry/Zweispaltig)

### 5.1 Profile-Interface

Profile kapseln die aus LiX extrahierten "Rezepte" für verschiedene Buchtypen:[file:89]

```ts
type ProfileId = 'novel' | 'textbook' | 'novella' | 'poetry' | 'news-twocol';

interface Profile {
  id: ProfileId;
  displayName: string;
  defaultLayout: LayoutConfig;
  buildParagrafTemplate(book: BookIR, fonts: FontConfig): ParagrafTemplate;
}
```

`FontConfig` und `ParagrafTemplate` kommen aus der Paragraf-API.[file:90]

### 5.2 Novel-Profil (Roman, 1‑spaltig)

Aus LiX-`Novel` lässt sich folgendes Rezept ableiten:[file:89]

- Trim Size: `5x8` oder `6x9` (konfigurierbar, default: 5x8).
- Margins: z. B. 36 mm top, 40 mm bottom, 40 mm inner, 30 mm outer (innen breiter für Bindung).
- Layout: einspaltig, Satz im Blocksatz mit Silbentrennung (Paragraf-Hyphenation für `language`).[file:90]
- Kapitelstarts:
  - optional immer auf recto (ungeraden Seiten) → Leerseitenautomatik.
  - Kapitelüberschriften zentriert, größere Schrift, ggf. smallcaps.
- Absätze:
  - erster Absatz nach Kapitel ohne Einzug, Folgeabsätze mit Erstzeileneinzug.
  - optional Dropcaps im ersten Absatz (LiX verwendet `lettrine`).[file:89]
- Frontmatter:
  - (Schmutztitel optional), Haupttitel, Lizenz/Impressum, ISBN, Publisher, Dedication, Epigraph.[file:89]

`buildParagrafTemplate` erzeugt entsprechend:

- `layout.size` und `layout.margins` aus `trimSize`/`layout`.
- Absatzstile `body`, `chapterHeading`, `dropcapFirstPara`, `epigraph` etc.
- Seitenstil mit Running Heads und Seitenzahlen.
- Content-Slots für Cover, Formalpage, Epigraph.

### 5.3 Textbook-Profil (Sachbuch/Lehrbuch)

LiX-`Textbook` liefert:

- Größerer Trim Size (A4, 6x9, 7x10).
- Starke Überschriftenhierarchie (Kapitel, Section, Subsection; `secnumdepth` ≥ 2).[file:89]
- Elemente: Theoreme/Definitionen, Algorithmen, Code-Listings, Tabellen (Tabularray), Abbildungen.[file:89]
- Frontmatter mit Titel, evtl. Abstract/Preface, Inhaltsverzeichnis.
- Backmatter mit Bibliografie/Anhängen.

Das Profil setzt diesen Stil in Paragraf-Stile wie `heading1/2/3`, `theorem`, `code`, `table`, `figureCaption` um und nutzt `paragraflinebreak`/`paragraftypography`, um lange Abschnitte sauber zu setzen.[file:90]

### 5.4 Novella-Profil

Abgeleitet vom Novel-Profil, aber:

- kleinere Trim Size (z. B. A5),
- Stories als Kapitel mit eigenem Titel und ggf. Zwischenblatt,
- etwas kompakterer Satz (leicht kleinere Fonts).

Die typografische Struktur bleibt romanähnlich, die Profile können dieselbe Schriftenwahl nutzen.

### 5.5 Poetry-Profil (Lyrik)

Aus LiX-`Poem`:[file:89]

- Trim Size: A5/A6.
- Layout: eine Spalte, kein Blocksatz, Zeilenumbrüche exakt.[file:89]
- Poesie-Blöcke: `Block { type: 'poem'; lines: string[] }` aus Markdown (z. B. `::: poem`).
- Dekoration: optionale Ornamente (Ecken/Borders) analog `pgfornaments` → in Paragraf als Seitenrahmen oder Hintergrund.[file:89][file:90]
- Fonts: ggf. Script/Gothic für Titel, Serif für Fließtext.

### 5.6 News/Zweispaltig-Profil

Basierend auf LiX-`News` + `multicol`-Bundle:[file:89]

- A4 oder ähnliche Größe.
- Zweispaltiger Satz (2 Frames pro Seite in Paragraf).[file:90]
- Periodical-Metadaten (Price, Issue, Volume, Location) aus `BookMetadata` o. ä.

Dieses Profil eignet sich auch für **zweispaltige Sachbuch‑Abschnitte**.

---

## 6. Paragraf-Integration (Print-PDF)

### 6.1 Abstraktionsmodul `printEngine.ts`

Implementiere ein Modul, das Paragraf kapselt:[file:90]

```ts
import { defineTemplate, compile } from 'paragrafcompile';

export async function compilePrintPdf(
  book: BookIR,
  profile: Profile,
  fonts: FontConfig
): Promise<Buffer> {
  const template = profile.buildParagrafTemplate(book, fonts);
  const result = await compile(template, { book, fonts, output: 'pdf' });
  return result.data as Buffer;
}
```

- `profile.buildParagrafTemplate` ist für die Übersetzung der Profile in ein Paragraf-Template verantwortlich.
- `fonts` enthält Pfade und Namen der zu registrierenden Schriftdateien.

### 6.2 Mapping BookIR → Template

Das Template definiert u. a.:

- **Layout**: Seitengröße, Ränder, Frames (bei Spaltenprofilen zwei Frames pro Seite).[file:90]
- **Styles**:
  - Paragraph Styles: `body`, `heading1`, `heading2`, `epigraph`, `dedication`, `poem`, `theorem`, `code`.
  - Character Styles (falls nötig): `emphasis`, `smallcaps`, `dropcap`.
- **Content**:
  - Frontmatter-Slots (Cover, Titel, Formalpage, Dedication, Epigraph, TOC).
  - Hauptteil-Slots, die `chapters` aus `BookIR` iterieren.
  - Backmatter (Bibliografie, Danksagung, Index).

Die Umsetzung orientiert sich an den LiX-PDFs, kopiert aber keinen Code, sondern reproduziert das Verhalten auf höherer Ebene.[file:89][file:90]

---

## 7. EPUB-Pipeline

EPUB ist typografisch weniger ambitioniert; hier geht es um reflowable Text mit sinnvoller Struktur.[web:96][web:99]

### 7.1 Schritte

1. **BookIR → XHTML**: Für jedes Kapitel ein `chapter-<n>.xhtml` erzeugen.
2. **CSS**: Einfaches Stylesheet mit Profil-spezifischen Defaults (z. B. Serif-Body, moderate Zeilenhöhe, keine Spalten).
3. **OPF/Manifest**: Metadaten aus `BookMetadata` in `content.opf` schreiben (Titel, Autoren, Sprache, ISBN, Publisher, Rechte).[web:96][web:99]
4. **TOC/Nav**: `toc.ncx` bzw. `nav.xhtml` aus `chapters` generieren.
5. **Packaging**: Alles nach EPUB-Spezifikation zippen, inkl. `mimetype` und `META-INF/container.xml`.

### 7.2 Wiederverwendung der Profile

- Profil entscheidet z. B. über:
  - Kapitelbenennung ("Chapter" vs. "Part"),
  - Einbindung von Epigraph/Dedication,
  - Aufteilung in Dateien.
- Es versucht **nicht**, Paragraf-Features (optical margin alignment, exakte Zeilenbrüche) in EPUB zu spiegeln; das übernimmt der eReader.

---

## 8. CLI und Build-Workflow

### 8.1 Ordnerstruktur und Ausgabe

```text
book-project/
  book.yaml
  book.md
  assets/
  build/
    print/
      book-novel-kdp.pdf
    epub/
      book-novel-kdp.epub
```

### 8.2 CLI `booktool`

Implementiere ein CLI (z. B. über `commander` oder ein einfaches Argument-Parsing) mit Kommandos:

- `booktool build print` – erzeugt nur Print-PDF.
- `booktool build epub` – erzeugt nur EPUB.
- `booktool build all` – erzeugt beides.

Die Kommandos:

1. Lesen `book.yaml` und `book.md`.
2. Erzeugen `BookIR`.
3. Wählen auf Basis von `book_type` und `print_profile`/`ebook_profile` die passenden Profile.
4. Rufen `compilePrintPdf` bzw. den EPUB-Renderer auf.

---

## 9. Qualitätsanforderungen

### 9.1 Typografische Qualität (Print)

- **Knuth‑Plass**-Layout mit Hyphenation über Paragraf.[file:90]
- Sinnvolle `lineWidth`-Werte (60–70 Zeichen) für Fließtext.
- Optischer Randausgleich (Hanging Punctuation) in Print-PDF.[file:90]
- Korrekte Kapitelstarts (Recto, Leerseitenhandling).
- Running Heads / Fußzeilen entsprechend Profil.

### 9.2 Trennung von Concerns

- Inhalt (Markdown) vs. Struktur (BookIR) vs. Layout/Profile vs. Rendering (Paragraf/EPUB) strikt trennen.
- Keine Hardcodierung von Layout in Parser oder Renderer; alles über Profile.

### 9.3 Tests

- Unit-Tests für:
  - Markdown → BookIR-Mapping,
  - YAML → Metadata/Layout-Mapping,
  - Profil-Auswahl.
- Snapshot-Tests oder visuelle Regressionstests für Beispielbücher (Novel/Textbook/Novella/Poetry).

---

## 10. Start-Prompt für einen Coding-Assistenten

Die folgenden Punkte können 1:1 als Aufgabenbeschreibung für Claude Code oder einen ähnlichen Assistenten genutzt werden:

1. Implementiere das `BookIR`-Modell (Metadaten, LayoutConfig, Chapter/Block-Strukturen) wie oben beschrieben.[file:89][file:90]
2. Schreibe einen Parser, der `book.yaml` in `BookMetadata` und `LayoutConfig` überführt und `book.md` mit einem Markdown-Parser (z. B. remark) in `Chapter[]` und `Block[]` konvertiert.[web:96]
3. Implementiere eine Profil-Schicht mit `Profile`-Interfaces für `novel`, `textbook`, `novella`, `poetry`, `news-twocol`. Die Profile spiegeln die in LiX vorhandenen Klassen (Novel, Textbook, Novella, Poem, News) auf konzeptioneller Ebene (Elemente, Reihenfolgen, Layoutgrößen, Typografie), ohne LaTeX-Code zu kopieren.[file:89][web:121]
4. Implementiere `printEngine.ts`, das Paragraf einbindet (`paragrafcompile` und ggf. `paragraftypography`) und aus `BookIR` + `Profile` ein druckreifes PDF erzeugt. Nutze Paragrafs Features: Knuth‑Plass, Hyphenation, Optical Margin Alignment, Multi-Frame-Layouts.[file:90]
5. Implementiere einen EPUB-Renderer, der aus `BookIR` ein gültiges EPUB mit pro Kapitel einem XHTML-Dokument, CSS, content.opf, toc.ncx/nav.xhtml und Cover erzeugt.[web:96][web:99]
6. Baue eine CLI `booktool` mit `build print`, `build epub`, `build all`, die die komplette Pipeline ausführt.
7. Schreibe Tests für Parser, Profil-Logik und kritische Layout-Fälle (Kapitelstarts, Epigraph, Dedication, Impressum, zweispaltige Abschnitte).

Mit dieser Spezifikation sollte ein AI-Coding-Assistent die komplette Pipeline iterativ implementieren können.
