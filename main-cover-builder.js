// main-cover-builder.js
//
// IPC-Handler fuer die Cover-Build-Pipeline:
//   1. Nimmt CoverInputs (Titel, Autor, Pattern, Trim, Pages, …) entgegen
//   2. Delegiert Template-Fuellung an renderer/book-export-lix/cover-builder
//   3. Rendert jedes HTML-Artefakt in einem offscreen BrowserWindow zu
//      PDF (printToPDF), JPG (capturePage + toJPEG) oder PNG (transparent).
//   4. Schreibt Dateien in den uebergebenen outputDir und gibt die Pfade zurueck.
//
// Zusatz-Kanal `cover-count-pdf-pages` liest die Seitenzahl eines bestehenden
// PDF aus, damit der Renderer nicht raten muss.

const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { pathToFileURL } = require('url');

const COVER_DIR = path.join(__dirname, 'renderer', 'book-export-lix', 'cover-builder');

async function loadCoverBuilder() {
  return await import(path.join(COVER_DIR, 'index.js'));
}

async function renderHtmlToPdf(html, pageWidthMm, pageHeightMm) {
  const tmpHtml = await writeTmp('cover-', '.html', html);
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true },
    width:  Math.round(mmToPx(pageWidthMm)),
    height: Math.round(mmToPx(pageHeightMm)),
  });
  try {
    await win.loadURL(pathToFileURL(tmpHtml).href);
    await waitNextTick(win);
    const pdf = await win.webContents.printToPDF({
      pageSize: {
        width:  mmToInch(pageWidthMm),
        height: mmToInch(pageHeightMm),
      },
      margins: { marginType: 'none' },
      printBackground: true,
      preferCSSPageSize: true,
    });
    return pdf;
  } finally {
    try { win.destroy(); } catch {}
    try { await fsPromises.unlink(tmpHtml); } catch {}
  }
}

async function renderHtmlToJpeg(html, widthPx, heightPx, quality = 92) {
  const tmpHtml = await writeTmp('cover-', '.html', html);
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true },
    width: widthPx, height: heightPx,
    useContentSize: true,
  });
  try {
    await win.loadURL(pathToFileURL(tmpHtml).href);
    await waitNextTick(win);
    const image = await win.webContents.capturePage();
    return image.toJPEG(quality);
  } finally {
    try { win.destroy(); } catch {}
    try { await fsPromises.unlink(tmpHtml); } catch {}
  }
}

async function renderHtmlToTransparentPng(html, pageWidthMm, pageHeightMm) {
  const tmpHtml = await writeTmp('cover-', '.html', html);
  const widthPx  = Math.round(mmToPx(pageWidthMm));
  const heightPx = Math.round(mmToPx(pageHeightMm));
  const win = new BrowserWindow({
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    webPreferences: { offscreen: true, sandbox: true },
    width: widthPx, height: heightPx,
    useContentSize: true,
  });
  try {
    await win.loadURL(pathToFileURL(tmpHtml).href);
    await waitNextTick(win);
    const image = await win.webContents.capturePage();
    return image.toPNG();
  } finally {
    try { win.destroy(); } catch {}
    try { await fsPromises.unlink(tmpHtml); } catch {}
  }
}

// ---------------------------------------------------------------------------

function mmToInch(mm) { return mm / 25.4; }
function mmToPx(mm, dpi = 300) { return mm / 25.4 * dpi; }

// ---------------------------------------------------------------------------
// PDF-Seitenzahl-Ermittlung — vier Strategien, erste die klappt gewinnt.
// ---------------------------------------------------------------------------

function countViaMdls(pdfPath) {
  // macOS Spotlight — schnell und liest auch komprimierte PDFs.
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync('mdls', ['-raw', '-name', 'kMDItemNumberOfPages', pdfPath],
      { timeout: 3000, encoding: 'utf8' });
    const n = parseInt(out.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

function countViaPdfinfo(pdfPath) {
  // Linux/WSL: pdfinfo (poppler-utils). Falls vorhanden.
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync('pdfinfo', [pdfPath], { timeout: 3000, encoding: 'utf8' });
    const m = out.match(/^Pages:\s+(\d+)/m);
    return m ? parseInt(m[1], 10) : null;
  } catch { return null; }
}

async function countViaInflate(pdfPath) {
  // Komprimierte PDF-Streams entpacken und dann auf /Type /Page suchen.
  // Funktioniert fuer Tectonic-PDFs mit xref-streams (PDF 1.5+).
  const zlib = require('zlib');
  const buf = await fsPromises.readFile(pdfPath);
  // Alle Stream-Objekte extrahieren und entpacken, dann zaehlen.
  // Ein PDF-Objekt mit Stream sieht so aus:
  //   <<...>> stream\n<binary>\nendstream
  const text = buf.toString('latin1');
  let pagesFromCount = 0;
  let pagesFromPageType = 0;

  // a) Direkt im Klartext suchen (falls unkomprimiert)
  const directMatch = text.match(/\/Type\s*\/Pages[^<>]*?\/Count\s+(\d+)/s);
  if (directMatch) return parseInt(directMatch[1], 10);

  // b) Xref-Streams entpacken
  const streamRe = /<<([^<>]{0,4000})>>\s*stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  while ((match = streamRe.exec(text)) !== null) {
    const dict = match[1];
    // Xref-Stream? (Type /XRef) oder ObjStm (komprimierte Objekte)?
    const isInteresting =
      /\/Type\s*\/XRef\b/.test(dict) || /\/Type\s*\/ObjStm\b/.test(dict);
    if (!isInteresting) continue;
    // Position des Stream-Inhalts im Original-Buffer finden
    const streamStart = buf.indexOf('stream', match.index) + 'stream'.length;
    const prefix = buf.slice(streamStart, streamStart + 2);
    let offset = streamStart;
    if (prefix[0] === 0x0d && prefix[1] === 0x0a) offset += 2;
    else if (prefix[0] === 0x0a) offset += 1;
    const endstreamIdx = buf.indexOf('endstream', offset);
    if (endstreamIdx < 0) continue;
    const raw = buf.slice(offset, endstreamIdx);
    // FlateDecode (haeufigster Filter)
    const hasFlate = /\/Filter\s*(?:\/FlateDecode|\[[^\]]*\/FlateDecode[^\]]*\])/.test(dict);
    if (!hasFlate) continue;
    try {
      const decoded = zlib.inflateSync(raw).toString('latin1');
      // Suche nach /Type /Pages mit /Count in entpacktem ObjStm
      const m1 = decoded.match(/\/Type\s*\/Pages[^<>]*?\/Count\s+(\d+)/s);
      if (m1) pagesFromCount = Math.max(pagesFromCount, parseInt(m1[1], 10));
      // Zaehle /Type /Page Vorkommen
      const p = (decoded.match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
      pagesFromPageType += p;
    } catch { /* decoding failed — skip */ }
  }
  if (pagesFromCount > 0) return pagesFromCount;
  if (pagesFromPageType > 0) return pagesFromPageType;
  return null;
}

async function countViaPlainRegex(pdfPath) {
  const buf = await fsPromises.readFile(pdfPath);
  const text = buf.toString('latin1');
  const m = text.match(/\/Type\s*\/Pages[^<>]*?\/Count\s+(\d+)/s);
  if (m) return parseInt(m[1], 10);
  const pages = (text.match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
  return pages > 0 ? pages : null;
}

async function writeTmp(prefix, ext, content) {
  const os = require('os');
  const crypto = require('crypto');
  const name = prefix + crypto.randomBytes(6).toString('hex') + ext;
  const abs = path.join(os.tmpdir(), name);
  await fsPromises.writeFile(abs, content, 'utf8');
  return abs;
}

async function waitNextTick(win) {
  return new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => setTimeout(resolve, 150));
    // Falls schon geladen, did-finish-load feuert nicht mehr — Safety-Timer:
    setTimeout(resolve, 400);
  });
}

// ---------------------------------------------------------------------------

function registerCoverBuilderHandlers(app) {
  ipcMain.handle('cover-build-compile', async (_event, options) => {
    const { inputs, outputDir, filenameStem } = options || {};
    if (!inputs || !outputDir) {
      return { success: false, error: 'cover-build-compile: inputs und outputDir sind Pflicht.' };
    }
    try {
      const { buildCover } = await loadCoverBuilder();
      const built = buildCover(inputs);

      await fsPromises.mkdir(outputDir, { recursive: true });
      const stem = filenameStem || 'book';
      const files = {};

      for (const art of built.artifacts) {
        if (art.kind === 'hardcover-skipped') continue;
        const target = path.join(outputDir, `${stem}-${art.filename}`);
        let buf;
        if (art.kind === 'ebook-jpg') {
          buf = await renderHtmlToJpeg(art.html, art.widthPx, art.heightPx);
        } else if (art.transparent) {
          buf = await renderHtmlToTransparentPng(art.html, art.pageWidthMm, art.pageHeightMm);
        } else {
          buf = await renderHtmlToPdf(art.html, art.pageWidthMm, art.pageHeightMm);
        }
        await fsPromises.writeFile(target, buf);
        files[art.kind] = target;
      }

      return {
        success: true,
        mode: built.mode,
        files,
        missingFields: built.missingFields || [],
      };
    } catch (err) {
      console.error('[CoverBuilder] Failed:', err);
      return { success: false, error: err.message, stack: err.stack };
    }
  });

  ipcMain.handle('cover-count-pdf-pages', async (_event, pdfPath) => {
    const methods = [
      { name: 'mdls',     fn: () => countViaMdls(pdfPath) },
      { name: 'pdfinfo',  fn: () => countViaPdfinfo(pdfPath) },
      { name: 'zlib-decompress', fn: () => countViaInflate(pdfPath) },
      { name: 'plain-regex', fn: () => countViaPlainRegex(pdfPath) },
    ];
    const tried = [];
    for (const m of methods) {
      try {
        const pages = await m.fn();
        if (Number.isFinite(pages) && pages > 0) {
          return { success: true, pages, method: m.name };
        }
        tried.push(`${m.name}=∅`);
      } catch (err) {
        tried.push(`${m.name}=${err.message}`);
      }
    }
    return {
      success: false,
      error: `Keine Methode ergab eine Seitenzahl. Versucht: ${tried.join(', ')}`,
      pdfPath,
    };
  });

  ipcMain.handle('cover-list-patterns', async () => {
    try {
      const { listPatterns } = await loadCoverBuilder();
      return { success: true, patterns: listPatterns() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = registerCoverBuilderHandlers;
