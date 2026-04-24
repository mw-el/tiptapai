// kdp-dimensions.js
//
// JS-Port von docs/archive/kdp_cover_calculator.py — identische Konstanten
// und Formeln. Berechnet Wrap-Abmessungen fuer KDP Paperback & Hardcover,
// liefert Kindle-Frontcover-Dimensionen fuer eBook-Output.
//
// Quellen:
//   https://kdp.amazon.com/help/topic/G201953020  (Paperback Cover)
//   https://kdp.amazon.com/help/topic/G201834180  (Papiertypen)
//   https://kdp.amazon.com/help/topic/GVBQ3CMEQW3W2VL6 (Trim & Bleed)

export const DPI = 300;

export const PAPER_THICKNESS = {
  bw_white:   0.002252,
  bw_cream:   0.002500,
  std_color:  0.002252,
  prem_color: 0.002347,
};

export const PAPER_LABELS = {
  bw_white:   'Schwarz/Weiss - Weiss',
  bw_cream:   'Schwarz/Weiss - Creme',
  std_color:  'Standard-Farbe - Weiss',
  prem_color: 'Premium-Farbe - Weiss',
};

export const HARDCOVER_ALLOWED = new Set(['bw_white', 'bw_cream', 'prem_color']);

// Trim → [width, height] in Inch. Keys matchen das bestehende Schema
// (5x8, 5.5x8.5, 6x9, a5, a4) plus KDP-spezifische Groessen.
export const TRIM_SIZES = {
  '5x8':       [5.000, 8.000],
  '5.06x7.81': [5.060, 7.810],
  '5.25x8':    [5.250, 8.000],
  '5.5x8.5':   [5.500, 8.500],
  '6x9':       [6.000, 9.000],
  '6.14x9.21': [6.140, 9.210],
  '7x10':      [7.000, 10.000],
  '8x10':      [8.000, 10.000],
  '8.5x11':    [8.500, 11.000],
  // Metrische Aequivalente (zum Weiterreichen an KDP in Inch umrechnen):
  'a5':        [5.827, 8.268],   // 148x210 mm
  'a4':        [8.268, 11.693],  // 210x297 mm
};

export const PAPERBACK_BLEED       = 0.125;
export const HARDCOVER_WRAP        = 0.591;
export const PAPERBACK_SPINE_EXTRA = 0.060;
export const HARDCOVER_SPINE_EXTRA = 0.125;
export const SAFE_ZONE             = 0.125;
export const SPINE_TEXT_MIN_PAGES  = 79;
export const BARCODE_WIDTH         = 2.0;  // Inch — Barcode-Reservierung
export const BARCODE_HEIGHT        = 1.2;

// Kindle-Frontcover (KDP eBook):
export const KINDLE_COVER = {
  width_px: 1600,
  height_px: 2560,
  dpi: 300,
  ratio: '1:1.6',
};

export function inchToMm(v) { return Math.round(v * 25.4 * 100) / 100; }
export function inchToPx(v, dpi = DPI) { return Math.round(v * dpi); }

export function resolveTrim(trim) {
  if (Array.isArray(trim) && trim.length === 2) return [Number(trim[0]), Number(trim[1])];
  if (typeof trim === 'string' && TRIM_SIZES[trim]) return TRIM_SIZES[trim];
  throw new Error(`KDP: unbekannte Trim-Groesse "${trim}". Erlaubt: ${Object.keys(TRIM_SIZES).join(', ')} oder [w,h] in Inch.`);
}

/**
 * Berechnet die vollstaendige Wrap-Dimensionierung.
 *
 * @param {object} opts
 * @param {string|[number,number]} opts.trim
 * @param {number} opts.pages                — Gesamtseitenzahl (gerade, >= 24)
 * @param {string} [opts.paperType='bw_cream']
 * @param {string} [opts.bookType='paperback']  'paperback' | 'hardcover'
 * @returns {object} Vollstaendiges Dimensions-Objekt mit In/Mm/Px-Werten.
 */
export function calculateWrap({ trim, pages, paperType = 'bw_cream', bookType = 'paperback' }) {
  if (!['paperback', 'hardcover'].includes(bookType)) {
    throw new Error(`KDP: bookType muss 'paperback' oder 'hardcover' sein, nicht '${bookType}'.`);
  }
  if (!PAPER_THICKNESS[paperType]) {
    throw new Error(`KDP: unbekannter Papiertyp '${paperType}'.`);
  }
  if (bookType === 'hardcover' && !HARDCOVER_ALLOWED.has(paperType)) {
    throw new Error(`KDP: Papiertyp '${paperType}' ist fuer Hardcover nicht erlaubt.`);
  }
  if (!Number.isFinite(pages) || pages < 24) {
    throw new Error(`KDP: mindestens 24 Seiten noetig (erhalten: ${pages}).`);
  }
  if (pages % 2 !== 0) {
    throw new Error(`KDP: Seitenzahl muss gerade sein (erhalten: ${pages}).`);
  }

  const [trimW, trimH] = resolveTrim(trim);
  const thickness = PAPER_THICKNESS[paperType];

  const spineExtra = bookType === 'paperback' ? PAPERBACK_SPINE_EXTRA : HARDCOVER_SPINE_EXTRA;
  const bleed      = bookType === 'paperback' ? PAPERBACK_BLEED       : HARDCOVER_WRAP;
  const spine      = pages * thickness + spineExtra;
  const totalW     = bleed + trimW + spine + trimW + bleed;
  const totalH     = bleed + trimH + bleed;

  // Koordinaten im Wrap (Origin oben-links der Datei inkl. Bleed):
  const xBackStart   = bleed;
  const xSpineStart  = bleed + trimW;
  const xSpineMid    = xSpineStart + spine / 2;
  const xFrontStart  = bleed + trimW + spine;
  const xFrontEnd    = xFrontStart + trimW;
  const yTrimTop     = bleed;
  const yTrimBottom  = bleed + trimH;

  return {
    bookType, paperType, pages, trim: `${trimW}x${trimH}`,
    trimW, trimH,
    bleedOrWrap:  bleed,
    spineWidthIn: round6(spine),
    totalWidthIn: round6(totalW),
    totalHeightIn: round6(totalH),
    safeZoneIn: SAFE_ZONE,
    spineTextAllowed: pages >= SPINE_TEXT_MIN_PAGES,
    // Handige mm/px-Versionen:
    spineWidthMm:  inchToMm(spine),
    spineWidthPx:  inchToPx(spine),
    totalWidthMm:  inchToMm(totalW),
    totalHeightMm: inchToMm(totalH),
    totalWidthPx:  inchToPx(totalW),
    totalHeightPx: inchToPx(totalH),
    // Wrap-Koordinaten in Inch (Origin oben-links):
    coords: {
      xBackStart, xSpineStart, xSpineMid, xFrontStart, xFrontEnd,
      yTrimTop, yTrimBottom,
    },
    // CSS-ready: Werte als mm-String fuer @page/print-Layout.
    cssPage: {
      widthMm:  `${inchToMm(totalW)}mm`,
      heightMm: `${inchToMm(totalH)}mm`,
      bleedMm:  `${inchToMm(bleed)}mm`,
      trimWMm:  `${inchToMm(trimW)}mm`,
      trimHMm:  `${inchToMm(trimH)}mm`,
      spineMm:  `${inchToMm(spine)}mm`,
      safeMm:   `${inchToMm(SAFE_ZONE)}mm`,
      barcodeWMm: `${inchToMm(BARCODE_WIDTH)}mm`,
      barcodeHMm: `${inchToMm(BARCODE_HEIGHT)}mm`,
    },
  };
}

/**
 * Kindle-eBook-Front (nur Front, kein Wrap, kein Bleed, RGB).
 * Liefert empfohlene Pixel-Dimensionen.
 */
export function calculateKindleFront() {
  return { ...KINDLE_COVER };
}

function round6(v) { return Math.round(v * 1e6) / 1e6; }
