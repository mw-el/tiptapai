// renderer/book-export-lix/engine-runner.js
//
// Ruft die erkannte LaTeX-Engine auf, liest das erzeugte PDF zurueck.
// Fail-Fast: bei Nicht-Null-Exit wird Exception mit Log-Auszug geworfen.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function buildArgs(engine, texFile, outDir) {
  switch (engine) {
    case 'tectonic':
      return ['--chatter=minimal', '--keep-logs', '--outdir', outDir, texFile];
    case 'xelatex':
    case 'lualatex':
    case 'pdflatex':
      return [
        '-halt-on-error',
        '-interaction=nonstopmode',
        `-output-directory=${outDir}`,
        texFile,
      ];
    case 'latexmk':
      return ['-xelatex', '-halt-on-error', '-interaction=nonstopmode', `-outdir=${outDir}`, texFile];
    default:
      throw new Error(`engine-runner: unbekannte Engine "${engine}"`);
  }
}

function extractPageCount(text) {
  if (!text) return null;
  // Tectonic/pdflatex/xelatex: "Output written on book.pdf (N pages, X bytes)."
  const m = text.match(/Output written on [^(]+\((\d+)\s+pages?,/i);
  return m ? parseInt(m[1], 10) : null;
}

function safeReadLog(pdfPath) {
  try {
    const p = pdfPath.replace(/\.pdf$/, '.log');
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  } catch { return ''; }
}

function extractError(log) {
  const lines = log.split('\n');
  const idx = lines.findIndex((l) => /^!|LaTeX Error|Fatal error|Emergency stop|Undefined control sequence/.test(l));
  if (idx === -1) return lines.slice(-15).join('\n');
  return lines.slice(Math.max(0, idx - 1), idx + 12).join('\n');
}

/**
 * @param {{name: string, bin: string}} engine
 * @param {string} texFile  — Pfad zur .tex-Datei (im Build-Dir)
 * @param {string} outDir   — Build-Verzeichnis (enthält LiX .cls/.sty + staged assets)
 * @returns {Promise<Buffer>} PDF-Buffer
 */
export function runEngine(engine, texFile, outDir) {
  const args = buildArgs(engine.name, texFile, outDir);
  return new Promise((resolvePromise, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(engine.bin, args, {
      cwd: outDir,
      env: {
        ...process.env,
        TEXINPUTS: `${outDir}:${process.env.TEXINPUTS || ''}`,
      },
    });
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      const pdfPath = texFile.replace(/\.tex$/, '.pdf');
      const pdfInOut = join(outDir, pdfPath.split('/').pop());
      if (code === 0 && existsSync(pdfInOut)) {
        const buf = readFileSync(pdfInOut);
        // Seitenzahl aus stdout/stderr extrahieren — zuverlaessiger als
        // das PDF hinterher zu parsen. Tectonic/pdflatex/xelatex loggen:
        //   "Output written on book.pdf (8 pages, 37012 bytes)."
        const pages = extractPageCount(stdout + stderr) ??
                      extractPageCount(safeReadLog(pdfInOut));
        resolvePromise({ pdf: buf, pages });
        return;
      }
      const logPath = pdfInOut.replace(/\.pdf$/, '.log');
      const logContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : stdout + stderr;
      const err = new Error(
        `LaTeX-Engine "${engine.name}" fehlgeschlagen (exit ${code}).\n` +
        `Log: ${logPath}\n\n` +
        extractError(logContent)
      );
      err.logPath = logPath;
      err.outDir = outDir;
      err.engine = engine.name;
      reject(err);
    });
  });
}
