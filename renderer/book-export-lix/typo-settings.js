// renderer/book-export-lix/typo-settings.js
//
// Liest typo-settings.json und erzeugt daraus eine gueltige LaTeX .sty-Datei
// (tiptapai-typo.sty), die beim Export ins tmp-Verzeichnis geschrieben wird.
//
// Designprinzip: EINE Quelle der Wahrheit (JSON). Die .sty ist Artefakt,
// nicht Quelltext — nie von Hand editieren.
//
// UI-Anbindung (spaeter): einfach die JSON-Felder rendern. Die Struktur
// ist flach genug, dass ein generisches Form-Render funktioniert.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, 'typo-settings.json');

export function loadTypoSettings() {
  const raw = readFileSync(SETTINGS_PATH, 'utf8');
  return JSON.parse(raw);
}

export function renderTypoSty(settings = loadTypoSettings()) {
  const lines = [];

  lines.push('% tiptapai-typo.sty');
  lines.push('% AUTO-GENERIERT aus renderer/book-export-lix/typo-settings.json.');
  lines.push('% NICHT von Hand editieren — Aenderungen bitte in typo-settings.json.');
  lines.push('');
  lines.push('\\NeedsTeXFormat{LaTeX2e}');
  lines.push('\\ProvidesPackage{tiptapai-typo}[2026/04/24 TipTapAI typography tunings for LiX pipeline]');
  lines.push('');

  // --- 1. Witwen/Waisen
  const w = settings.widowsAndOrphans;
  if (w?.enabled) {
    lines.push('% Witwen- und Waisenschutz');
    lines.push(`\\widowpenalty=${w.widowPenalty}`);
    lines.push(`\\clubpenalty=${w.clubPenalty}`);
    lines.push(`\\displaywidowpenalty=${w.displayWidowPenalty}`);
    lines.push('');
  }

  // --- 2. Overfull-Schutz
  const o = settings.overfullProtection;
  if (o?.enabled) {
    lines.push('% Overfull-Box-Schutz (deutsche Komposita)');
    lines.push(`\\setlength{\\emergencystretch}{${o.emergencyStretchEm}em}`);
    if (o.tolerance != null)    lines.push(`\\tolerance=${o.tolerance}`);
    if (o.preTolerance != null) lines.push(`\\pretolerance=${o.preTolerance}`);
    if (o.hbadness != null)     lines.push(`\\hbadness=${o.hbadness}`);
    if (o.vbadness != null)     lines.push(`\\vbadness=${o.vbadness}`);
    lines.push('');
  }

  // --- 3. Silbentrennung
  const h = settings.hyphenation;
  if (h) {
    lines.push('% Silbentrennung');
    if (h.leftMin  != null) lines.push(`\\lefthyphenmin=${h.leftMin}`);
    if (h.rightMin != null) lines.push(`\\righthyphenmin=${h.rightMin}`);
    lines.push('');
  }

  // --- 4. Deutsche Satzkonventionen
  const g = settings.germanConventions;
  if (g?.frenchSpacing) {
    lines.push('% Deutsche Satz-Konventionen');
    lines.push('\\frenchspacing');
    lines.push('');
  }

  // --- 5. microtype
  const m = settings.microtype;
  if (m) {
    lines.push('% microtype-Feintuning');
    const opts = [
      `protrusion=${bool(m.protrusion)}`,
      `expansion=${bool(m.expansion)}`,
      `tracking=${bool(m.tracking)}`,
      `kerning=${bool(m.kerning)}`,
      `spacing=${bool(m.spacing)}`,
    ];
    if (m.protrusionFactor != null) opts.push(`factor=${m.protrusionFactor}`);
    lines.push(`\\microtypesetup{${opts.join(', ')}}`);
    lines.push('');
  }

  // --- 6. Seitenboden
  const pb = settings.pageBottom;
  if (pb?.mode === 'ragged') {
    lines.push('% Ragged bottom (Weissraum am Seitenende erlaubt)');
    lines.push('\\raggedbottom');
    lines.push('');
  } else if (pb?.mode === 'flush') {
    lines.push('\\flushbottom');
    lines.push('');
  }

  // --- 7. Zeilenumbruch-Penalty
  if (settings.linePenalty != null) {
    lines.push('% Zeilenumbruch-Penalty');
    lines.push(`\\linepenalty=${settings.linePenalty}`);
    lines.push('');
  }

  lines.push('\\endinput');
  lines.push('');
  return lines.join('\n');
}

function bool(v) { return v ? 'true' : 'false'; }
