#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    [
      'Usage:',
      '  node scripts/vectorize-patterns.mjs --out-dir <dir> [--colors <n>] <image.png> [...]',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const files = [];
  let outDir = null;
  let colors = 128;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--out-dir') {
      outDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--colors') {
      colors = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    files.push(arg);
  }

  if (!outDir || files.length === 0 || !Number.isInteger(colors) || colors < 2) {
    usage();
    process.exit(1);
  }

  return { outDir, colors, files };
}

function runMagick(args, options = {}) {
  return execFileSync('magick', args, {
    encoding: options.encoding ?? 'buffer',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function identifyDimensions(file) {
  const raw = runMagick(['identify', '-format', '%w %h', file], { encoding: 'utf8' }).trim();
  const [width, height] = raw.split(/\s+/).map(Number);
  return { width, height };
}

function quantizeToRgba(file, colors) {
  return runMagick(
    [
      file,
      '-colorspace',
      'sRGB',
      '-colors',
      String(colors),
      '+dither',
      '-alpha',
      'off',
      'rgba:-',
    ],
    { encoding: 'buffer' },
  );
}

function colorKey(buffer, offset) {
  return ((buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2]) >>> 0;
}

function keyToHex(key) {
  return `#${key.toString(16).padStart(6, '0')}`;
}

function buildRectangles(rgba, width, height) {
  const byColor = new Map();
  const areaByColor = new Map();
  let active = new Map();

  function appendRect(rect) {
    const hex = keyToHex(rect.color);
    const segment = `M${rect.x} ${rect.y}h${rect.w}v${rect.h}H${rect.x}z`;

    if (!byColor.has(hex)) {
      byColor.set(hex, []);
      areaByColor.set(hex, 0);
    }

    byColor.get(hex).push(segment);
    areaByColor.set(hex, areaByColor.get(hex) + rect.w * rect.h);
  }

  for (let y = 0; y < height; y += 1) {
    const nextActive = new Map();
    const rowOffset = y * width * 4;
    let x = 0;

    while (x < width) {
      const start = x;
      const startOffset = rowOffset + x * 4;
      const currentColor = colorKey(rgba, startOffset);
      x += 1;

      while (x < width) {
        const offset = rowOffset + x * 4;
        if (colorKey(rgba, offset) !== currentColor) {
          break;
        }
        x += 1;
      }

      const runKey = `${currentColor}:${start}:${x}`;
      const existing = active.get(runKey);

      if (existing) {
        existing.h += 1;
        nextActive.set(runKey, existing);
        active.delete(runKey);
      } else {
        nextActive.set(runKey, {
          color: currentColor,
          x: start,
          y,
          w: x - start,
          h: 1,
        });
      }
    }

    for (const rect of active.values()) {
      appendRect(rect);
    }

    active = nextActive;
  }

  for (const rect of active.values()) {
    appendRect(rect);
  }

  return { byColor, areaByColor };
}

function buildSvg(name, width, height, byColor, areaByColor, colors) {
  const paths = Array.from(byColor.entries())
    .sort((a, b) => areaByColor.get(b[0]) - areaByColor.get(a[0]))
    .map(([hex, segments]) => `  <path fill="${hex}" d="${segments.join('')}"/>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">`,
    `  <title>${name}</title>`,
    `  <desc>True-vector seamless tile derived from a ${colors}-color quantization of the source PNG. No raster image is embedded.</desc>`,
    paths,
    '</svg>',
    '',
  ].join('\n');
}

function outputName(file) {
  const base = path.basename(file, path.extname(file));
  return `${base}.svg`;
}

function main() {
  const { outDir, colors, files } = parseArgs(process.argv.slice(2));
  mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const { width, height } = identifyDimensions(file);
    const rgba = quantizeToRgba(file, colors);
    const expectedLength = width * height * 4;

    if (rgba.length !== expectedLength) {
      throw new Error(`Unexpected RGBA payload for ${file}: got ${rgba.length}, expected ${expectedLength}`);
    }

    const { byColor, areaByColor } = buildRectangles(rgba, width, height);
    const svg = buildSvg(path.basename(file), width, height, byColor, areaByColor, colors);
    const target = path.join(outDir, outputName(file));
    writeFileSync(target, svg, 'utf8');
    console.log(`${file} -> ${target}`);
  }
}

main();
