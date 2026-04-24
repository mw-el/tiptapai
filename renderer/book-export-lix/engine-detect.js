// renderer/book-export-lix/engine-detect.js
//
// Findet eine LaTeX-Engine. Reihenfolge: tectonic > xelatex > lualatex > latexmk.
// Kein stiller Fallback: wenn nichts gefunden wird, Exception mit Installations-Hinweis.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ENGINE_ORDER = ['tectonic', 'xelatex', 'lualatex', 'latexmk'];

const SEARCH_PATHS = () => [
  ...(process.env.PATH || '').split(':'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/Library/TeX/texbin',
  `${process.env.HOME || ''}/.cargo/bin`,
];

function which(binary) {
  for (const p of SEARCH_PATHS()) {
    if (!p) continue;
    const candidate = join(p, binary);
    if (existsSync(candidate)) return candidate;
  }
  const r = spawnSync('which', [binary], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return null;
}

let cached = null;

export function detectEngine({ force } = {}) {
  if (cached && !force) return cached;
  for (const name of ENGINE_ORDER) {
    const bin = which(name);
    if (bin) {
      cached = { name, bin };
      return cached;
    }
  }
  throw new Error(
    'Keine LaTeX-Engine gefunden. Installations-Empfehlung: "brew install tectonic". ' +
    'Alternativ MacTeX (enthaelt xelatex/latexmk). ' +
    'Danach "node scripts/lix-preflight.mjs" zur Verifikation.'
  );
}
