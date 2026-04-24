#!/usr/bin/env node
// scripts/lix-preflight.mjs
//
// Verifiziert, dass die TipTapAI LiX/LaTeX-Buchexport-Pipeline auf diesem System
// lauffaehig ist. Prueft:
//   1. Tectonic (primary) — fallback: xelatex, lualatex, latexmk
//   2. LiX-Klassen (novel, novella, poem, textbook) aus dem vendored Ordner
//   3. Kritische Pakete: ebgaramond, lettrine, pgfornament, miama, inconsolata
//
// Fail-Fast: erster blockierender Fehler → Exit != 0, Pfad zum tmp-Log ausgegeben.
// Kein stiller Fallback.
//
// Usage:
//   node scripts/lix-preflight.mjs              # normal
//   node scripts/lix-preflight.mjs --verbose    # komplette LaTeX-Logs
//   node scripts/lix-preflight.mjs --keep-tmp   # tmp nie loeschen
//   node scripts/lix-preflight.mjs --engine=xelatex   # engine erzwingen

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LIX_VENDOR_DIR = join(REPO_ROOT, 'Typesetting', 'Lix Reference Files');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const KEEP_TMP = args.includes('--keep-tmp') || process.env.TIPTAPAI_LIX_KEEP_TMP === '1';
const ENGINE_ARG = args.find((a) => a.startsWith('--engine='))?.split('=')[1];

const ENGINE_CANDIDATES = ENGINE_ARG
  ? [ENGINE_ARG]
  : ['tectonic', 'xelatex', 'lualatex', 'latexmk'];

const SEARCH_PATHS = [
  ...(process.env.PATH || '').split(':'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/Library/TeX/texbin',
  `${process.env.HOME || ''}/.cargo/bin`,
];

// ---------------------------------------------------------------------------
// Utility

function color(code, s) {
  return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}
const red = (s) => color('31', s);
const green = (s) => color('32', s);
const yellow = (s) => color('33', s);
const bold = (s) => color('1', s);
const dim = (s) => color('2', s);

function which(binary) {
  for (const p of SEARCH_PATHS) {
    if (!p) continue;
    const candidate = join(p, binary);
    if (existsSync(candidate)) return candidate;
  }
  const r = spawnSync('which', [binary], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return null;
}

function engineArgs(engine, texFile, outDir) {
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
      throw new Error(`Unknown engine: ${engine}`);
  }
}

function compile(engineBin, engine, texFile, outDir) {
  const cmdArgs = engineArgs(engine, texFile, outDir);
  const r = spawnSync(engineBin, cmdArgs, {
    encoding: 'utf8',
    cwd: outDir,
    env: { ...process.env, TEXINPUTS: `${outDir}:${LIX_VENDOR_DIR}:` },
  });
  return {
    ok: r.status === 0 && existsSync(join(outDir, texFile.replace(/\.tex$/, '.pdf').split('/').pop())),
    code: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function extractError(log) {
  const lines = log.split('\n');
  const errIdx = lines.findIndex((l) => /^!/.test(l) || /LaTeX Error|Fatal error|Emergency stop/.test(l));
  if (errIdx === -1) return log.split('\n').slice(-10).join('\n');
  return lines.slice(errIdx, errIdx + 8).join('\n');
}

// ---------------------------------------------------------------------------
// Phase 1: vendored files present?

function checkVendoredLix() {
  const required = ['lix.sty', 'novel.cls', 'novella.cls', 'poem.cls', 'textbook.cls'];
  const missing = required.filter((f) => !existsSync(join(LIX_VENDOR_DIR, f)));
  if (missing.length) {
    console.error(red(`✗ LiX-Vendor-Dateien fehlen in ${LIX_VENDOR_DIR}:`));
    for (const f of missing) console.error(red(`  - ${f}`));
    process.exit(2);
  }
  console.log(green(`✓ LiX-Klassen vendored (${required.length} Dateien in ${dim(LIX_VENDOR_DIR)})`));
}

// ---------------------------------------------------------------------------
// Phase 2: engine detection

function detectEngine() {
  for (const name of ENGINE_CANDIDATES) {
    const bin = which(name);
    if (bin) {
      const v = spawnSync(bin, ['--version'], { encoding: 'utf8' });
      const versionLine = (v.stdout || v.stderr || '').split('\n')[0] || '(unknown version)';
      console.log(green(`✓ Engine gefunden: ${bold(name)} — ${dim(bin)}`));
      console.log(`  ${dim(versionLine)}`);
      return { name, bin };
    }
  }
  console.error(red('✗ Keine LaTeX-Engine gefunden.'));
  console.error('');
  console.error('  Empfohlen: Tectonic (single-binary, laedt Pakete bei Bedarf).');
  console.error('');
  console.error('    ' + bold('brew install tectonic'));
  console.error('');
  console.error('  Alternativ (gross): MacTeX (https://tug.org/mactex/).');
  console.error('');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Phase 3: test battery

const TESTS = [
  {
    id: 'baseline',
    label: 'Baseline (plain article)',
    critical: true,
    source: `\\documentclass{article}
\\begin{document}
Hello, preflight.
\\end{document}
`,
  },
  {
    id: 'lix-novel',
    label: 'LiX novel.cls + ebgaramond',
    critical: true,
    source: `\\documentclass{novel}
\\lang{german}
\\size{a5}
\\title{Preflight}
\\authors{TipTapAI}
\\begin{document}
\\h{Kapitel 1}
\\l{D}as ist ein Test.
\\end{document}
`,
  },
  {
    id: 'lix-novella',
    label: 'LiX novella.cls',
    critical: true,
    source: `\\documentclass{novella}
\\lang{german}
\\size{a5}
\\title{Preflight}
\\authors{TipTapAI}
\\begin{document}
\\h{Kapitel 1}
Text.
\\end{document}
`,
  },
  {
    id: 'lix-textbook',
    label: 'LiX textbook.cls (TOC + refs + license)',
    critical: true,
    source: `\\documentclass{textbook}
\\lang{german}
\\size{a4}
\\title{Preflight}
\\authors{TipTapAI}
\\license{CC}{by}{4.0}{TipTapAI}
\\begin{document}
\\toc
\\h{Kapitel 1}
\\hh{Abschnitt}
Text.
\\end{document}
`,
  },
  {
    id: 'lix-poem',
    label: 'LiX poem.cls + miama',
    critical: false, // poem ist eher Rand-Usecase
    source: `\\documentclass{poem}
\\lang{german}
\\size{a5}
\\title{Preflight}
\\authors{TipTapAI}
\\begin{document}
\\h{Gedicht}
Zeile eins.\\\\
Zeile zwei.
\\end{document}
`,
  },
  {
    id: 'pkg-lettrine',
    label: 'Paket: lettrine (Dropcaps)',
    critical: true,
    source: `\\documentclass{novel}
\\lang{german}
\\size{a5}
\\title{P}\\authors{T}
\\begin{document}
\\h{K}
\\l{W}enn der Dropcap funktioniert, ist lettrine ok.
\\end{document}
`,
  },
  {
    id: 'pkg-pgfornament',
    label: 'Paket: pgfornament (Ornaments)',
    critical: true,
    source: `\\documentclass{novel}
\\lang{german}
\\size{a5}
\\title{P}\\authors{T}
\\begin{document}
\\h{K}
Text.

\\noindent\\pgfornament[width=2cm]{88}
\\end{document}
`,
  },
  {
    id: 'pkg-inconsolata',
    label: 'Paket: inconsolata (Code-Listings)',
    critical: false,
    source: `\\documentclass{textbook}
\\lang{german}
\\size{a4}
\\title{P}\\authors{T}
\\begin{document}
\\h{Code}
\\begin{lstlisting}
let x = 1;
\\end{lstlisting}
\\end{document}
`,
  },
];

function runTest(test, tmpDir, engineName, engineBin) {
  const testDir = join(tmpDir, test.id);
  mkdirSync(testDir, { recursive: true });
  const texFile = join(testDir, `${test.id}.tex`);
  writeFileSync(texFile, test.source, 'utf8');

  // LiX-Klassen ins tmp kopieren, damit TEXINPUTS sie findet
  cpSync(LIX_VENDOR_DIR, testDir, { recursive: true });

  const result = compile(engineBin, engineName, texFile, testDir);
  const logFile = join(testDir, `${test.id}.log`);
  const logContent = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';

  return { test, result, logContent, logPath: logFile };
}

// ---------------------------------------------------------------------------
// Main

function main() {
  console.log(bold('\nTipTapAI LiX/LaTeX Preflight\n'));

  checkVendoredLix();
  const { name: engineName, bin: engineBin } = detectEngine();

  const tmpDir = join(tmpdir(), `tiptapai-lix-preflight-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  console.log(dim(`  Arbeitsverzeichnis: ${tmpDir}`));
  console.log('');

  let anyCriticalFailed = false;
  const results = [];

  for (const test of TESTS) {
    process.stdout.write(`  ${test.label} ... `);
    const { result, logContent, logPath } = runTest(test, tmpDir, engineName, engineBin);
    results.push({ test, result, logContent, logPath });

    if (result.ok) {
      console.log(green('PASS'));
    } else {
      const tag = test.critical ? red('FAIL (critical)') : yellow('FAIL (optional)');
      console.log(tag);
      if (test.critical) anyCriticalFailed = true;

      const combined = logContent || `${result.stdout}\n${result.stderr}`;
      console.log(dim('    ── Error excerpt ──'));
      for (const line of extractError(combined).split('\n')) {
        console.log(dim(`    ${line}`));
      }
      console.log(dim(`    Log: ${logPath}`));
      console.log('');
    }

    if (VERBOSE) {
      console.log(dim('    ── Full log ──'));
      console.log(dim(logContent || result.stdout || result.stderr));
    }
  }

  console.log('');

  if (anyCriticalFailed) {
    console.error(red(bold('✗ Preflight gescheitert. Kritische Tests fehlgeschlagen.')));
    console.error(`  tmp-Verzeichnis zum Inspizieren: ${tmpDir}`);
    if (engineName === 'tectonic') {
      console.error('');
      console.error('  Hinweis: Tectonic laedt Pakete beim ersten Lauf aus dem Bundle.');
      console.error('  Das kann 1–2 Minuten dauern und braucht Internet. Danach ist es offline-faehig.');
    }
    process.exit(1);
  }

  const optionalFailed = results.filter((r) => !r.result.ok && !r.test.critical);
  if (optionalFailed.length) {
    console.log(yellow(`⚠ ${optionalFailed.length} optionale Tests gescheitert (nicht blockierend).`));
  }
  console.log(green(bold('✓ Preflight ok.')));

  if (!KEEP_TMP) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.log(dim(`  (tmp konnte nicht geloescht werden: ${e.message})`));
    }
  } else {
    console.log(dim(`  tmp behalten: ${tmpDir}`));
  }
}

main();
