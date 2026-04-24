#!/usr/bin/env node
// scripts/lix-smoke.mjs
//
// End-to-end Smoke-Test fuer die LiX-Buchexport-Pipeline.
// Baut ein Mini-BookIR, kompiliert es zu PDF, gibt Dateigroesse aus.
// Exit != 0 bei Fehler.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileLixPdf } from '../renderer/book-export-lix/index.js';

const bookIR = {
  metadata: {
    title: 'Schreibblockaden',
    subtitle: 'Entwarnung',
    authors: [{ name: 'Matthias W.' }],
    language: 'german',
    bookType: 'novel',
    publishedYear: 2026,
    epigraph: 'Alles Schreiben ist **ein Experiment**.',
    dedication: 'Für alle, die vor dem leeren Blatt sitzen.',
  },
  layout: {
    trimSize: 'a5',
    margins: { top: 22, bottom: 22, inner: 22, outer: 18 },
    rectoChapterStart: true,
    dropcaps: true,
  },
  frontmatter: [],
  chapters: [
    {
      title: 'Was Schreibblockaden wirklich sind',
      number: 1,
      blocks: [
        { type: 'paragraph', text: 'Wer nicht schreiben kann, ist nicht *dumm*. Er hat bloss gerade keinen Zugang zu dem, was er sagen will.' },
        { type: 'paragraph', text: 'Das ist ein **wichtiger** Unterschied. Die Blockade ist kein Defekt, sondern ein Signal.' },
        { type: 'heading', level: 2, text: 'Das Missverständnis' },
        { type: 'paragraph', text: 'Viele glauben, eine Schreibblockade sei ein Mangel an Disziplin. Das Gegenteil ist wahr: gerade disziplinierte Schreibende trifft es am härtesten.' },
        { type: 'blockquote', text: 'Der innere Kritiker ist lauter als jede Muse.' },
        { type: 'hr' },
      ],
    },
    {
      title: 'Der neue Anfang',
      number: 2,
      blocks: [
        { type: 'paragraph', text: 'Beginne dort, wo es leicht ist. Nicht dort, wo es richtig ist. Leichtigkeit führt zu Richtigkeit, aber Richtigkeit blockiert Leichtigkeit.' },
        { type: 'paragraph', text: 'Die Klammer-Technik: [noch zu klären] setzen und weiterschreiben.' },
        { type: 'code', language: 'text', code: '[Beispiel für Klammer: hier fehlt die Recherche]\nDie Firma X wurde in [Jahr] gegründet.' },
      ],
    },
  ],
  backmatter: [],
};

async function main() {
  process.stdout.write('TipTapAI LiX Smoke-Test ... ');
  try {
    const t0 = Date.now();
    const { pdf, tex, outDir } = await compileLixPdf(bookIR, { keepTmp: true });
    const ms = Date.now() - t0;

    const outPath = join(tmpdir(), `tiptapai-lix-smoke-${Date.now()}.pdf`);
    const texOutPath = outPath.replace(/\.pdf$/, '.tex');
    writeFileSync(outPath, pdf);
    writeFileSync(texOutPath, tex, 'utf8');

    console.log('OK');
    console.log(`  PDF:    ${outPath}  (${pdf.length} bytes, ${ms} ms)`);
    console.log(`  .tex:   ${texOutPath}`);
    console.log(`  tmp:    ${outDir}`);
  } catch (err) {
    console.log('FAIL');
    console.error('');
    console.error(err.message);
    if (err.outDir) console.error(`  tmp fuer Inspektion: ${err.outDir}`);
    process.exit(1);
  }
}

main();
