// renderer/book-export-lix/cover-builder/index.js
//
// Orchestriert den Cover-Build:
//   1. Dimensionen berechnen (paperback/hardcover/ebook)
//   2. Template waehlen (Wrap | eBook | Transparent-Fallback)
//   3. Platzhalter fuellen, HTML + Asset-Pfade zurueckgeben
//   4. Rendering (PDF / PNG / JPG) uebernimmt der Aufrufer via
//      Electron printToPDF bzw. BrowserWindow.capturePage().
//
// Alle Pfade werden absolut zurueckgegeben, damit das aufrufende
// BrowserWindow das Template korrekt laden kann, auch wenn es in
// einem tmp-Verzeichnis geladen wird.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  calculateWrap, calculateKindleFront,
  PAPERBACK_BLEED, HARDCOVER_WRAP, SPINE_TEXT_MIN_PAGES,
  inchToMm,
} from './kdp-dimensions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, 'templates');
const PATTERNS_DIR = join(__dirname, 'patterns');
const PATTERNS_META_PATH = join(__dirname, 'patterns.json');

/**
 * @typedef {Object} CoverInputs
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} author
 * @property {string} [genre]     — e.g. "Roman"
 * @property {string} [band]      — e.g. "BAND 07"
 * @property {string} [blurb]     — Rueckklappentext (1–4 Saetze)
 * @property {string} [isbn]      — optional fuer Rueckschild-Meta
 * @property {string} [edition]   — e.g. "EDITION 2026"
 * @property {string} [publisher]
 * @property {string} [patternId] — "insel-01" .. "insel-05" oder eigener absoluter Pfad
 * @property {string|[number,number]} trim
 * @property {number} pages
 * @property {string} [paperType] — bw_white|bw_cream|std_color|prem_color
 */

export function listPatterns() {
  const raw = readFileSync(PATTERNS_META_PATH, 'utf8');
  const meta = JSON.parse(raw);
  return meta.patterns.map((p) => ({
    id: p.id,
    label: p.label,
    fileUrl: pathToFileURL(join(PATTERNS_DIR, p.file)).href,
    absPath: join(PATTERNS_DIR, p.file),
  }));
}

function resolvePatternUrl(patternId) {
  if (!patternId) return '';
  // Absoluter Pfad → direkt in file:// wandeln.
  if (patternId.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(patternId)) {
    return existsSync(patternId) ? pathToFileURL(resolve(patternId)).href : '';
  }
  // Builtin-ID (insel-XX).
  const p = listPatterns().find((x) => x.id === patternId);
  return p ? p.fileUrl : '';
}

function hasRequiredFields(inputs) {
  return Boolean(
    inputs && inputs.title && inputs.author && inputs.patternId
  );
}

// Hilfstext-Defaults fuer optionale Cover-Felder. Wenn das Feld leer ist
// (undefined / null / Leerstring), wird der Hilfstext ausgegeben — das macht
// sichtbar, was dort hingehoert. Nur Leerzeichen ("  ") = bewusst leer.
export const FIELD_HELP_TEXT = {
  genre:   '[Genre eintragen — z. B. Roman, Novelle, Essay]',
  band:    '[Band eintragen — z. B. BAND 07]',
  blurb:   '[Klappentext: zwei bis vier Saetze, was die Leser:in erwartet.]',
  edition: '[Ausgabe/Jahr — z. B. ERSTE AUSGABE 2026]',
  isbn:    '[ISBN eintragen — z. B. 978-3-12345-678-9]',
};

/**
 * Aufloesung fuer optionale Textfelder:
 *   undefined | null | ''       → Hilfstext ausgeben (sichtbare Erinnerung)
 *   '  ' (nur Whitespace)       → leer ausgeben (bewusst leergelassen)
 *   'echter Text'               → getrimmter Text
 */
export function resolveField(raw, helpKey) {
  if (raw === undefined || raw === null || raw === '') {
    return FIELD_HELP_TEXT[helpKey] || '';
  }
  if (typeof raw !== 'string') return String(raw);
  if (raw.trim() === '') return ''; // bewusst leer durch Leerzeichen-Eingabe
  return raw.trim();
}

function fillTemplate(tmpl, values) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = values[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Baut die Substitutions-Map fuer ein Wrap-Template (paperback oder hardcover).
 */
function buildWrapValues(inputs, dims, patternUrl, opts = {}) {
  // Optionale Felder: leer → Hilfstext / nur-Whitespace → bewusst leer.
  const genre = resolveField(inputs.genre, 'genre');
  const band  = resolveField(inputs.band,  'band');
  const blurb = resolveField(inputs.blurb, 'blurb');
  const editionHint = resolveField(inputs.edition, 'edition');
  const isbnHint    = resolveField(inputs.isbn, 'isbn');

  // ISBN: eigene zentrierte Zeile unter dem Klappentext (statt in backMeta zu mischen).
  const isbnLine = isbnHint ? `ISBN ${isbnHint}` : '';

  // backMeta: nur noch Edition + (Verlag falls keine Edition).
  const backMetaParts = [];
  if (editionHint) backMetaParts.push(editionHint);
  if (inputs.publisher && !editionHint) backMetaParts.push(inputs.publisher);

  // Spine-Text nur ab SPINE_TEXT_MIN_PAGES Seiten anzeigen.
  const spineLabelDisplay = dims.spineTextAllowed ? 'flex' : 'none';
  // Spine-Label-Breite = Spine-Breite minus Luft (2mm), mindestens 6mm.
  const spineLabelWmm = Math.max(6, Math.round(inchToMm(dims.coords.xFrontStart - dims.coords.xSpineStart) - 4));

  return {
    totalWmm:  inchToMm(dims.totalWidthIn),
    totalHmm:  inchToMm(dims.totalHeightIn),
    bleedMm:   inchToMm(dims.bleedOrWrap),
    trimWmm:   inchToMm(dims.trimW),
    trimHmm:   inchToMm(dims.trimH),
    spineMm:   inchToMm(dims.spineWidthIn),
    safeMm:    inchToMm(dims.safeZoneIn),
    barcodeWmm: 50,  // ~2" → 50 mm
    barcodeHmm: 30,  // ~1.2" → 30 mm
    spineLabelWmm,
    spineLabelDisplay,
    patternUrl,
    title:      escapeHtml(inputs.title),
    author:     escapeHtml(inputs.author || ''),
    genre:      escapeHtml(genre),
    band:       escapeHtml(band),
    spineTitle: escapeHtml((inputs.title || '').toUpperCase()),
    backTitle:  escapeHtml((inputs.title || '').toUpperCase()),
    blurb:      escapeHtml(blurb),
    isbnLine:   escapeHtml(isbnLine),
    backMeta:   escapeHtml(backMetaParts.join(' · ')),
    // Kontrollbild-Annotationen
    bookTypeLabel: escapeHtml(opts.bookTypeLabel || dims.bookType || ''),
    pages: dims.pages,
  };
}

/**
 * Substitutions fuer eBook-Template (nur Front, 1600×2560).
 */
function buildEbookValues(inputs, patternUrl) {
  return {
    patternUrl,
    title:  escapeHtml(inputs.title),
    author: escapeHtml(inputs.author || ''),
    genre:  escapeHtml(resolveField(inputs.genre, 'genre')),
    band:   escapeHtml(resolveField(inputs.band,  'band')),
  };
}

/**
 * Baut die vollen Cover-HTML-Quellen fuer alle drei Ausgabe-Varianten +
 * (falls Pflichtdaten fehlen) die zwei Transparent-PNG-Varianten.
 *
 * @param {CoverInputs} inputs
 * @returns {{ mode: 'full'|'fallback', artifacts: Array }}
 *
 * artifacts-Struktur pro Eintrag:
 *   { kind, filename, html, pageWidthMm, pageHeightMm, widthPx?, heightPx?, dims? }
 */
export function buildCover(inputs) {
  if (!inputs || !inputs.trim || !Number.isFinite(inputs.pages)) {
    throw new Error('cover-builder: trim und pages sind Pflicht.');
  }
  const paperType = inputs.paperType || 'bw_cream';
  const patternUrl = resolvePatternUrl(inputs.patternId);
  const full = hasRequiredFields(inputs) && patternUrl;

  const wrapTmpl    = readFileSync(join(TEMPLATE_DIR, 'cover-wrap.html'),         'utf8');
  const wrapCtlTmpl = readFileSync(join(TEMPLATE_DIR, 'cover-wrap-control.html'), 'utf8');
  const ebookTmpl   = readFileSync(join(TEMPLATE_DIR, 'cover-ebook.html'),        'utf8');
  const labelTmpl   = readFileSync(join(TEMPLATE_DIR, 'cover-labels.html'),       'utf8');

  const artifacts = [];

  if (full) {
    // Paperback-Wrap + Kontrollbild
    const pbDims = calculateWrap({ trim: inputs.trim, pages: inputs.pages, paperType, bookType: 'paperback' });
    const pbValues = buildWrapValues(inputs, pbDims, patternUrl, { bookTypeLabel: 'Paperback' });
    artifacts.push({
      kind: 'paperback-pdf',
      filename: 'cover-paperback.pdf',
      html: fillTemplate(wrapTmpl, pbValues),
      pageWidthMm: inchToMm(pbDims.totalWidthIn),
      pageHeightMm: inchToMm(pbDims.totalHeightIn),
      dims: pbDims,
    });
    artifacts.push({
      kind: 'paperback-control-pdf',
      filename: 'cover-paperback-control.pdf',
      html: fillTemplate(wrapCtlTmpl, pbValues),
      pageWidthMm: inchToMm(pbDims.totalWidthIn),
      pageHeightMm: inchToMm(pbDims.totalHeightIn),
      dims: pbDims,
    });

    // Hardcover-Wrap + Kontrollbild (Papier muss hardcover-kompatibel sein)
    try {
      const hcDims = calculateWrap({ trim: inputs.trim, pages: inputs.pages, paperType, bookType: 'hardcover' });
      const hcValues = buildWrapValues(inputs, hcDims, patternUrl, { bookTypeLabel: 'Hardcover' });
      artifacts.push({
        kind: 'hardcover-pdf',
        filename: 'cover-hardcover.pdf',
        html: fillTemplate(wrapTmpl, hcValues),
        pageWidthMm: inchToMm(hcDims.totalWidthIn),
        pageHeightMm: inchToMm(hcDims.totalHeightIn),
        dims: hcDims,
      });
      artifacts.push({
        kind: 'hardcover-control-pdf',
        filename: 'cover-hardcover-control.pdf',
        html: fillTemplate(wrapCtlTmpl, hcValues),
        pageWidthMm: inchToMm(hcDims.totalWidthIn),
        pageHeightMm: inchToMm(hcDims.totalHeightIn),
        dims: hcDims,
      });
    } catch (err) {
      // Hardcover fuer std_color nicht erlaubt — ueberspringen.
      artifacts.push({ kind: 'hardcover-skipped', reason: err.message });
    }

    // eBook-Frontcover (1600×2560) — kein Kontrollbild noetig
    const kindle = calculateKindleFront();
    artifacts.push({
      kind: 'ebook-jpg',
      filename: 'cover-ebook.jpg',
      html: fillTemplate(ebookTmpl, buildEbookValues(inputs, patternUrl)),
      widthPx:  kindle.width_px,
      heightPx: kindle.height_px,
    });

    return { mode: 'full', artifacts };
  }

  // Fallback: zwei transparente PNGs (schwarz + weiss) mit Schnittmarken
  // fuer Photoshop-Overlay. Dimensionen = Paperback-Wrap.
  const dims = calculateWrap({ trim: inputs.trim, pages: inputs.pages, paperType, bookType: 'paperback' });
  const baseValues = buildWrapValues(inputs, dims, ''); // patternUrl irrelevant (Fallback hat kein Pattern)
  baseValues.legend = escapeHtml(
    `${dims.trim} · ${inputs.pages}S · ${paperType} · Spine ${inchToMm(dims.spineWidthIn).toFixed(2)}mm`
  );

  // Schwarz-Variante (dunkle Tinten, fuer helle Fotos)
  artifacts.push({
    kind: 'labels-black-png',
    filename: 'cover-labels-black.png',
    html: fillTemplate(labelTmpl, {
      ...baseValues,
      inkColor: '#1a1915', mutedColor: '#5c554e',
      ruleColor: '#2a2d33', accentColor: '#0b5878', markColor: '#2a2d33',
    }),
    pageWidthMm: inchToMm(dims.totalWidthIn),
    pageHeightMm: inchToMm(dims.totalHeightIn),
    transparent: true,
    dims,
  });

  // Weiss-Variante (helle Tinten, fuer dunkle Fotos)
  artifacts.push({
    kind: 'labels-white-png',
    filename: 'cover-labels-white.png',
    html: fillTemplate(labelTmpl, {
      ...baseValues,
      inkColor: '#fdfcf7', mutedColor: '#d8d2c8',
      ruleColor: '#fdfcf7', accentColor: '#9ec8e0', markColor: '#fdfcf7',
    }),
    pageWidthMm: inchToMm(dims.totalWidthIn),
    pageHeightMm: inchToMm(dims.totalHeightIn),
    transparent: true,
    dims,
  });

  return {
    mode: 'fallback',
    artifacts,
    missingFields: missingFieldList(inputs),
  };
}

function missingFieldList(inputs) {
  const miss = [];
  if (!inputs.title)     miss.push('title');
  if (!inputs.author)    miss.push('author');
  if (!inputs.patternId) miss.push('pattern');
  return miss;
}
