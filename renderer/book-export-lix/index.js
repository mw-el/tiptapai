// renderer/book-export-lix/index.js
//
// Orchestriert die LiX/LaTeX-Buchexport-Pipeline:
//   BookIR → .tex → LaTeX-Engine → PDF-Buffer

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildLixTex } from './tex-builder.js';
import { detectEngine } from './engine-detect.js';
import { runEngine } from './engine-runner.js';
import { copyLixClasses, resolveAssetPath, stageAsset } from './assets.js';

/**
 * @typedef {Object} CompileOptions
 * @property {string}   [sourceDir]         — Verzeichnis der Markdown-Quelle, fuer relative Asset-Pfade
 * @property {string[]} [assetFallbackDirs] — zusaetzliche Suchpfade fuer Bilder/Cover
 * @property {string}   [engine]            — Engine erzwingen (tectonic|xelatex|...)
 * @property {boolean}  [keepTmp]           — tmp-Verzeichnis nicht loeschen
 */

/**
 * @param {object} bookIR
 * @param {CompileOptions} [options]
 * @returns {Promise<{ pdf: Buffer, tex: string, outDir: string }>}
 */
export async function compileLixPdf(bookIR, options = {}) {
  const keepTmp = options.keepTmp || process.env.TIPTAPAI_LIX_KEEP_TMP === '1';
  const outDir = join(tmpdir(), `tiptapai-lix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(outDir, { recursive: true });

  try {
    copyLixClasses(outDir);

    // Assets stagen und Pfade im BookIR durch die gestagten Basenames ersetzen.
    stageAssetsInBookIR(bookIR, outDir, options);

    const tex = buildLixTex(bookIR);
    const texPath = join(outDir, 'book.tex');
    writeFileSync(texPath, tex, 'utf8');

    const engine = options.engine
      ? { name: options.engine, bin: resolveEngineBin(options.engine) }
      : detectEngine();

    const result = await runEngine(engine, texPath, outDir);
    // runEngine gibt { pdf: Buffer, pages: number|null } zurueck.
    const pdf = result.pdf;
    const pages = result.pages;

    if (!keepTmp) {
      try { rmSync(outDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
    }
    return { pdf, tex, outDir, pages };
  } catch (err) {
    // Bei Fehler NICHT loeschen — Log zum Inspizieren behalten.
    err.outDir = outDir;
    throw err;
  }
}

function resolveEngineBin(name) {
  // Bei explizitem Override verlassen wir uns auf PATH; die runEngine-Fehlerbehandlung greift ohnehin.
  return name;
}

/**
 * Laeuft rekursiv durch BookIR, resolved Bildpfade, kopiert Dateien in outDir,
 * und ersetzt die Pfade im IR durch nackte Basenames (damit das .tex
 * ueber TEXINPUTS draufzeigt).
 */
function stageAssetsInBookIR(bookIR, outDir, options) {
  const ctx = {
    sourceDir: options.sourceDir || null,
    fallbackDirs: options.assetFallbackDirs || [],
  };

  const stagePath = (p) => {
    if (!p) return p;
    const abs = resolveAssetPath(p, { sourceDir: ctx.sourceDir, fallbackDirs: ctx.fallbackDirs });
    if (!abs) throw new Error(`LiX: Asset nicht aufloesbar: "${p}" (sourceDir=${ctx.sourceDir || 'n/a'})`);
    return stageAsset(abs, outDir);
  };

  // Cover
  if (bookIR.metadata?.cover) {
    if (bookIR.metadata.cover.front) bookIR.metadata.cover.front = stagePath(bookIR.metadata.cover.front);
    if (bookIR.metadata.cover.back)  bookIR.metadata.cover.back  = stagePath(bookIR.metadata.cover.back);
  }

  // Blocks in frontmatter, chapters, backmatter
  const stageBlocks = (blocks) => {
    for (const b of blocks || []) {
      if (b.type === 'image' && b.path) b.path = stagePath(b.path);
    }
  };
  stageBlocks(bookIR.frontmatter);
  for (const ch of bookIR.chapters || []) stageBlocks(ch.blocks);
  stageBlocks(bookIR.backmatter);
}
