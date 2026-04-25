// renderer/book-export-lix/book-type-registry.js
//
// Einzige Quelle der Wahrheit fuer alle Buchtypen.
//
// Ein neuer Buchtyp braucht nur einen Eintrag hier — alle anderen
// Dateien (frontmatter-schema, tex-builder, UI-Dropdown) leiten
// ihre Listen und Defaults automatisch daraus ab.
//
// Felder pro Eintrag:
//   label            — Anzeigename im UI-Dropdown
//   group            — Optgroup-Label im Dropdown
//   latexClass       — \documentclass-Argument
//   trimSize         — Standard-Buchformat (Schluessel aus DEFAULT_MARGINS)
//   margins          — Standardraender fuer dieses Format (mm)
//   dropcaps         — Initialbuchstaben standardmaessig aktiv?
//   rectoChapterStart — Kapitelstart immer auf ungerader Seite?
//   columns          — optional; nur fuer mehrspaltigen Satz

export const BOOK_TYPE_REGISTRY = {

  // ── Schreibszene-Design-Varianten (basieren auf sz-common.sty) ───────────

  'sz-schreiben': {
    label:             'Sz · Schreibsachbuch',
    group:             'Schreibszene-Design (Sz)',
    latexClass:        'sz-schreiben',
    trimSize:          '6x9',
    margins:           { top: 20, bottom: 24, inner: 22, outer: 17 },
    dropcaps:          false,
    rectoChapterStart: false,
  },
  'sz-novel': {
    label:             'Sz · Roman',
    group:             'Schreibszene-Design (Sz)',
    latexClass:        'sz-novel',
    trimSize:          '6x9',
    margins:           { top: 24, bottom: 26, inner: 22, outer: 18 },
    dropcaps:          true,
    rectoChapterStart: true,
  },
  'sz-novella': {
    label:             'Sz · Novelle / Kurzgeschichte',
    group:             'Schreibszene-Design (Sz)',
    latexClass:        'sz-novella',
    trimSize:          '5.5x8.5',
    margins:           { top: 20, bottom: 22, inner: 20, outer: 16 },
    dropcaps:          false,
    rectoChapterStart: true,
  },
  'sz-textbook': {
    label:             'Sz · Lehrbuch',
    group:             'Schreibszene-Design (Sz)',
    latexClass:        'sz-textbook',
    trimSize:          'a4',
    margins:           { top: 26, bottom: 28, inner: 24, outer: 22 },
    dropcaps:          false,
    rectoChapterStart: false,
  },
  'sz-poem': {
    label:             'Sz · Gedichtband',
    group:             'Schreibszene-Design (Sz)',
    latexClass:        'sz-poem',
    trimSize:          'a5',
    margins:           { top: 22, bottom: 22, inner: 20, outer: 20 },
    dropcaps:          false,
    rectoChapterStart: false,
  },

  // ── LiX-Basisklassen ─────────────────────────────────────────────────────

  'novel': {
    label:             'Roman / Erzählung',
    group:             'LiX-Basis',
    latexClass:        'novel',
    trimSize:          '5x8',
    margins:           { top: 17, bottom: 22, inner: 20, outer: 15 },
    dropcaps:          true,
    rectoChapterStart: true,
  },
  'textbook': {
    label:             'Sachbuch / Lehrbuch',
    group:             'LiX-Basis',
    latexClass:        'textbook',
    trimSize:          'a4',
    margins:           { top: 28, bottom: 28, inner: 22, outer: 22 },
    dropcaps:          false,
    rectoChapterStart: true,
  },
  'novella': {
    label:             'Novelle / Kurzgeschichte',
    group:             'LiX-Basis',
    latexClass:        'novella',
    trimSize:          'a5',
    margins:           { top: 18, bottom: 22, inner: 20, outer: 15 },
    dropcaps:          true,
    rectoChapterStart: true,
  },
  'poetry': {
    label:             'Lyrik / Gedichtband',
    group:             'LiX-Basis',
    latexClass:        'poem',
    trimSize:          'a5',
    margins:           { top: 28, bottom: 28, inner: 26, outer: 26 },
    dropcaps:          false,
    rectoChapterStart: false,
  },
  'news-twocol': {
    label:             'Zeitung / Zweispaltig',
    group:             'LiX-Basis',
    latexClass:        'novel', // kein eigenes LiX-Aequivalent; Fallback auf novel
    trimSize:          'a4',
    margins:           { top: 18, bottom: 20, inner: 16, outer: 16 },
    dropcaps:          false,
    rectoChapterStart: false,
    columns:           2,
  },
};
