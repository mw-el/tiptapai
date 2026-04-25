// renderer/book-export-lix/tex-builder.js
//
// BookIR → LiX-.tex-String.
//
// Mappt das profilneutrale BookIR-Modell (renderer/book-export/types.ts)
// auf LiX-Makros, wie sie in docs/typesetting/lix-readme.md beschrieben sind.
// Keine JS-Reimplementierung von LaTeX-Satz — nur Syntax-Uebersetzung.

import { escapeTex, inlineMarkdownToLix } from './tex-escape.js';
import { BOOK_TYPE_REGISTRY } from './book-type-registry.js';

// ---------------------------------------------------------------------------
// BookType → LiX-Klasse  (abgeleitet aus BOOK_TYPE_REGISTRY)

function classForBookType(t) {
  const reg = BOOK_TYPE_REGISTRY[t];
  if (!reg) throw new Error(`LiX: unbekannter bookType "${t}"`);
  return reg.latexClass;
}

// Klassen, die NICHT auf lix.sty basieren (sz-* haben eigene Praeambel).
function isSzClass(cls) {
  return typeof cls === 'string' && cls.startsWith('sz-');
}

// Unterscheidet echten Content von Schema-Platzhaltern ("[Widmung eintragen]" o.ae.).
function isRealContent(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  // Generische Platzhalter im Schema sind in eckigen Klammern eingefasst.
  if (/^\[.*\]$/.test(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Layout

function buildSize(trimSize) {
  switch (trimSize) {
    case 'a4':      return '\\size{a4}';
    case 'a5':      return '\\size{a5}';
    case 'letter':  return '\\size{letter}';
    case '5x8':     return '\\size{custom}{5in}{8in}';
    case '5.5x8.5': return '\\size{custom}{5.5in}{8.5in}';
    case '6x9':     return '\\size{custom}{6in}{9in}';
    default:        throw new Error(`LiX: unbekannte trimSize "${trimSize}"`);
  }
}

function buildMargins(m) {
  // LiX-Reihenfolge: top, bot, inner, outer
  const fmt = (v) => `${v}mm`;
  return `\\margins{${fmt(m.top)}}{${fmt(m.bottom)}}{${fmt(m.inner)}}{${fmt(m.outer)}}`;
}

// ---------------------------------------------------------------------------
// Metadata → Praeambel

function buildAuthors(authors) {
  if (!authors || authors.length === 0) return '\\authors{}';
  const slice = authors.slice(0, 6).map((a) => `{${escapeTex(a.name)}}`).join('');
  return `\\authors${slice}`;
}

// doclicense (via \license) unterstuetzt nur Creative-Commons-Lizenzen mit
// gueltiger Versionsangabe. Fuer andere Typen (MIT, GPL, All-Rights-Reserved,
// Placeholder, leer) wird \license NICHT emittiert — lix.sty laedt doclicense
// ausschliesslich ueber \license, ohne \license-Aufruf bleibt alles sauber.
function buildLicense(l) {
  if (!l) return '';
  const type = String(l.type || '').trim().toUpperCase();
  if (type !== 'CC') return '';
  const modifiers = Array.isArray(l.modifiers) && l.modifiers.length > 0
    ? l.modifiers.map((m) => String(m).toLowerCase())
    : ['by'];
  const version = String(l.version || '').trim() || '4.0';
  const mods = modifiers.join('-');
  const holder = l.holder ? `{${escapeTex(l.holder)}}` : '';
  return `\\license{CC}{${mods}}{${version}}${holder}`;
}

function buildCover(c) {
  if (!c) return '';
  const front = c.front ? `{${c.front}}` : '{}';
  const back  = c.back  ? `{${c.back}}`  : '{}';
  return `\\cover${front}${back}`;
}

// Babel erwartet Sprachnamen (z. B. "ngerman", "english"),
// keine BCP-47-Locale-Codes wie "de-DE". Mappt die haeufigsten Werte.
function normalizeBabelLanguage(raw) {
  if (!raw) return 'ngerman';
  const tag = String(raw).toLowerCase().replace('_', '-');
  const base = tag.split('-')[0];
  const map = {
    de: 'ngerman',
    german: 'ngerman',
    ngerman: 'ngerman',
    at: 'naustrian',
    ch: 'nswissgerman',
    en: 'english',
    english: 'english',
    us: 'english',
    gb: 'british',
    fr: 'french',
    french: 'french',
    it: 'italian',
    italian: 'italian',
    es: 'spanish',
    spanish: 'spanish',
    nl: 'dutch',
    pt: 'portuguese',
  };
  if (tag === 'de-ch') return 'nswissgerman';
  if (tag === 'de-at') return 'naustrian';
  if (tag === 'en-gb') return 'british';
  return map[tag] || map[base] || 'ngerman';
}

function buildPreamble(book) {
  const { metadata, layout } = book;
  const cls = classForBookType(metadata.bookType);

  if (isSzClass(cls)) {
    return buildSzPreamble(book, cls);
  }

  const lines = [];
  lines.push(`\\documentclass{${cls}}`);
  lines.push('\\usepackage{tiptapai-typo}');
  lines.push('');
  lines.push(`\\lang{${normalizeBabelLanguage(metadata.language)}}`);
  lines.push(buildSize(layout.trimSize));
  lines.push(buildMargins(layout.margins));
  lines.push('');
  lines.push(`\\title{${escapeTex(metadata.title || '')}}`);
  if (metadata.subtitle) lines.push(`\\subtitle{${escapeTex(metadata.subtitle)}}`);
  lines.push(buildAuthors(metadata.authors));
  if (metadata.publishedYear) lines.push(`\\date{${metadata.publishedYear}}`);
  if (metadata.publisher) lines.push(`\\publisher{${escapeTex(metadata.publisher)}}`);
  if (metadata.edition && metadata.publishedYear) {
    lines.push(`\\edition{${metadata.edition}}{${metadata.publishedYear}}`);
  }

  const lic = buildLicense(metadata.license);
  if (lic) lines.push(lic);

  if (metadata.isbn?.print) lines.push(`\\isbn{${escapeTex(metadata.isbn.print)}}`);

  const cov = buildCover(metadata.cover);
  if (cov) lines.push(cov);

  if (metadata.epigraph) {
    lines.push(`\\epigraph{${inlineMarkdownToLix(metadata.epigraph)}}`);
  }
  if (metadata.dedication) {
    // LiX \dedicate erwartet {dedicatee}{message}. Wenn wir nur eine Zeile
    // haben, geben wir sie als dedicatee + leere Message aus.
    lines.push(`\\dedicate{${inlineMarkdownToLix(metadata.dedication)}}{}`);
  }

  if (layout.rectoChapterStart) lines.push('\\start{odd}');

  return lines.join('\n');
}

// Eigene, lix-sty-freie Praeambel fuer alle Sz-Varianten.
// Die sz-*.cls (via sz-common.sty) stellen Kompatibilitaetsmakros
// (\h/\hh/\size/\margins/etc.) bereit, die zu No-Ops werden — so bleibt
// der Body-Renderer identisch.
function buildSzPreamble(book, cls) {
  const { metadata } = book;
  const lines = [];
  lines.push(`\\documentclass{${cls}}`);
  lines.push('');
  lines.push(`\\title{${escapeTex(metadata.title || '')}}`);
  if (metadata.subtitle) lines.push(`\\subtitle{${escapeTex(metadata.subtitle)}}`);
  const authorName = (metadata.authors || []).map((a) => escapeTex(a.name)).join(' \\and ');
  lines.push(`\\author{${authorName}}`);
  if (metadata.publishedYear) lines.push(`\\date{${escapeTex(String(metadata.publishedYear))}}`);

  if (metadata.epigraph) {
    // In diesem Profil emittieren wir die Epigraph-Seite manuell im body.
    // Hier nur Metadatum speichern (kein \epigraph im Preamble).
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Blocks

function renderHeading(b) {
  const text = inlineMarkdownToLix(b.text);
  switch (b.level) {
    case 1: return `\\h{${text}}`;
    case 2: return `\\hh{${text}}`;
    case 3: return `\\hhh{${text}}`;
    case 4: return `\\hhhh{${text}}`;
    case 5: return `\\hhhhh{${text}}`;
    default: throw new Error(`LiX: heading level ${b.level} nicht unterstuetzt`);
  }
}

function renderParagraph(b, opts) {
  // Gedichtband: jede Zeile des Absatzes wird mit \\ als Gedichtzeile gesetzt.
  // Leerzeilen im Markdown erzeugen bereits separate Absaetze (Strophen).
  if (opts?.poemLines && b.text.includes('\n')) {
    return b.text.split('\n')
      .map((l) => inlineMarkdownToLix(l.trim()))
      .filter((l) => l)
      .join('\\\\\n');
  }
  const text = inlineMarkdownToLix(b.text);
  if (opts?.dropcap) {
    // Erster Buchstabe → \l{X}; Rest unveraendert.
    const m = /^([A-Za-zÄÖÜäöüß])(.*)$/s.exec(b.text || '');
    if (m) {
      const first = escapeTex(m[1]);
      const rest = inlineMarkdownToLix(m[2]);
      return `\\l{${first}}${rest}`;
    }
  }
  return text;
}

let figureCounter = 0;
function nextLabel(prefix) {
  figureCounter += 1;
  return `${prefix}-${figureCounter}`;
}

function renderImage(b) {
  const label = nextLabel('fig');
  const caption = b.alt ? escapeTex(b.alt) : '';
  return `\\fig{${label}}{1.0}{${b.path}}{${caption}}`;
}

function renderCode(b) {
  // verbatim ist LaTeX-universell und funktioniert in allen LiX-Klassen.
  // LiX' eigener \code-Macro ist nur im "code"-Bundle (textbook.cls) verfuegbar.
  // verbatim ist robuster, schluckt alle Sonderzeichen und braucht kein Paket.
  return `\\begin{verbatim}\n${b.code}\n\\end{verbatim}`;
}

function renderMath(b) {
  if (b.display) {
    const label = nextLabel('eq');
    return `\\math{${label}}{\n${b.content}\n}`;
  }
  return `\\m{${b.content}}`;
}

function renderBlockquote(b) {
  return `\\begin{quote}\n${inlineMarkdownToLix(b.text)}\n\\end{quote}`;
}

function renderTheorem(b) {
  const title = b.title ? `\\b{${escapeTex(b.title)}}. ` : '';
  return `\\begin{quote}\n${title}${inlineMarkdownToLix(b.content)}\n\\end{quote}`;
}

function renderDefinition(b) {
  return `\\b{${escapeTex(b.term)}}: ${inlineMarkdownToLix(b.definition)}`;
}

function renderAlgorithm(b) {
  const label = nextLabel('alg');
  const caption = b.title ? escapeTex(b.title) : '';
  const body = (b.steps || []).map((s) => inlineMarkdownToLix(s)).join('\\\\\n');
  return `\\algo{${label}}{\n${body}\n}{${caption}}`;
}

function renderPoem(b) {
  const lines = (b.lines || []).map((l) => inlineMarkdownToLix(l));
  return lines.join('\\\\\n');
}

function renderHr() {
  return '\\begin{center}\\pgfornament[width=3cm]{88}\\end{center}';
}

function renderPagebreak() {
  return '\\np';
}

function renderPullquote(b) {
  const attr = b.attribution ? `[${escapeTex(b.attribution)}]` : '';
  return `\\begin{pullquote}${attr}\n${inlineMarkdownToLix(b.text || '')}\n\\end{pullquote}`;
}

function renderExercise(b) {
  const label = b.title ? `[${escapeTex(b.title)}]` : '';
  return `\\begin{exercise}${label}\n${inlineMarkdownToLix(b.text || '')}\n\\end{exercise}`;
}

function renderBlock(b, ctx) {
  switch (b.type) {
    case 'paragraph':  return renderParagraph(b, ctx);
    case 'heading':    return renderHeading(b);
    case 'image':      return renderImage(b);
    case 'code':       return renderCode(b);
    case 'math':       return renderMath(b);
    case 'blockquote': return renderBlockquote(b);
    case 'theorem':    return renderTheorem(b);
    case 'definition': return renderDefinition(b);
    case 'algorithm':  return renderAlgorithm(b);
    case 'poem':       return renderPoem(b);
    case 'hr':         return renderHr();
    case 'pagebreak':  return renderPagebreak();
    case 'pullquote':  return renderPullquote(b);
    case 'exercise':   return renderExercise(b);
    case 'chaptermeta': return ''; // meta, im Preamble konsumiert
    default:
      throw new Error(`LiX: unbekannter Block-Typ "${b.type}"`);
  }
}

function renderBlocks(blocks, opts = {}) {
  const lines = [];
  const dropcapEnabled = !!opts.dropcap;
  let firstParagraphAfterHeading = false;

  for (const b of blocks) {
    const isFirstPara = firstParagraphAfterHeading && b.type === 'paragraph';
    lines.push(renderBlock(b, { dropcap: dropcapEnabled && isFirstPara, poemLines: !!opts.poemLines }));
    lines.push(''); // Leerzeile = Absatz in LaTeX (= Strophenabstand im Gedicht)

    firstParagraphAfterHeading = b.type === 'heading' && b.level === 1;
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Haupt-Builder

export function buildLixTex(bookIR) {
  if (!bookIR) throw new Error('LiX builder: bookIR ist leer');
  if (!bookIR.metadata) throw new Error('LiX builder: bookIR.metadata fehlt');
  if (!bookIR.layout) throw new Error('LiX builder: bookIR.layout fehlt');

  figureCounter = 0; // reset für stabile Labels pro Build

  const cls = classForBookType(bookIR.metadata.bookType);
  if (isSzClass(cls)) return buildSzTex(bookIR);

  const dropcap = !!bookIR.layout.dropcaps;
  const parts = [];

  parts.push(buildPreamble(bookIR));
  parts.push('');
  parts.push('\\begin{document}');
  parts.push('');

  // Frontmatter-TOC optional (Textbook nutzt \toc)
  if (bookIR.metadata.bookType === 'textbook') {
    parts.push('\\toc');
    parts.push('');
  }

  // Frontmatter-Blöcke (z.B. Vorwort)
  if (bookIR.frontmatter?.length) {
    parts.push(renderBlocks(bookIR.frontmatter, { dropcap: false }));
  }

  // Kapitel
  for (const chap of bookIR.chapters || []) {
    parts.push(`\\h{${inlineMarkdownToLix(chap.title)}}`);
    parts.push('');
    parts.push(renderBlocks(chap.blocks, { dropcap }));
  }

  // Backmatter
  if (bookIR.backmatter?.length) {
    parts.push(renderBlocks(bookIR.backmatter, { dropcap: false }));
  }

  parts.push('\\end{document}');
  parts.push('');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Sz-Varianten (sz-schreiben/novel/novella/textbook/poem): gemeinsame Body-
// Komposition. Die Klasse selbst steuert Trim, Farben und Kapitelopener-Stil;
// dieser Builder erzeugt nur die generische Abfolge (Titelblock, Widmung,
// Epigraph, Vorwort, TOC, Kapitel).

function buildSzTex(bookIR) {
  const { metadata } = bookIR;
  const blockOpts = {
    dropcap: false,
    poemLines: metadata.bookType === 'sz-poem',
  };
  const parts = [];

  parts.push(buildPreamble(bookIR));
  parts.push('');
  parts.push('\\begin{document}');
  parts.push('\\pagestyle{empty}');
  parts.push('');

  // Einfacher Titelblock (Halbtitel/Other-books/Impressum bleibt Planning).
  parts.push('\\maketitle');
  parts.push('');

  if (isRealContent(metadata.dedication)) {
    parts.push(`\\dedicate{${inlineMarkdownToLix(metadata.dedication)}}{}`);
    parts.push('');
  }

  if (isRealContent(metadata.epigraph)) {
    parts.push(`\\epigraph{${inlineMarkdownToLix(metadata.epigraph)}}`);
    parts.push('');
  }

  // Vorwort / Frontmatter-Text direkt nach Epigraph
  if (bookIR.frontmatter?.length) {
    parts.push('\\cleardoublepage');
    parts.push(renderBlocks(bookIR.frontmatter, blockOpts));
  }

  // TOC
  parts.push('\\cleardoublepage');
  parts.push('\\tableofcontents');
  parts.push('\\cleardoublepage');
  parts.push('');

  // Kapitel
  parts.push('\\pagestyle{fancy}');
  parts.push('');
  for (const chap of bookIR.chapters || []) {
    if (chap.part)     parts.push(`\\schreibenPart{${escapeTex(chap.part)}}`);
    if (chap.subtitle) parts.push(`\\schreibenSubtitle{${escapeTex(chap.subtitle)}}`);
    if (chap.intro)    parts.push(`\\schreibenIntro{${inlineMarkdownToLix(chap.intro)}}`);
    parts.push(`\\chapter{${inlineMarkdownToLix(chap.title)}}`);
    parts.push('');
    parts.push(renderBlocks(chap.blocks, blockOpts));
  }

  if (bookIR.backmatter?.length) {
    parts.push(renderBlocks(bookIR.backmatter, blockOpts));
  }

  parts.push('\\end{document}');
  parts.push('');
  return parts.join('\n');
}
