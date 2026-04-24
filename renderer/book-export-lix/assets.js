// renderer/book-export-lix/assets.js
//
// Kopiert vendored LiX-Klassen und referenzierte Bilder/Cover in den
// Build-Ordner, damit die Engine sie ueber TEXINPUTS findet.
//
// Asset-Resolution (gemaess Fragerunde):
//   1. Frontmatter-Pfad, absolute: direkt uebernehmen
//   2. Frontmatter-Pfad, relativ : relativ zur Markdown-Datei aufloesen
//   3. Fallback: TipTapAI-Asset-Verzeichnisse (optional)

import { cpSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderTypoSty } from './typo-settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIX_VENDOR_DIR = join(__dirname, 'lix-classes');

export function copyLixClasses(destDir) {
  if (!existsSync(LIX_VENDOR_DIR)) {
    throw new Error(`LiX-Vendor-Verzeichnis fehlt: ${LIX_VENDOR_DIR}`);
  }
  cpSync(LIX_VENDOR_DIR, destDir, { recursive: true });

  // tiptapai-typo.sty wird bei JEDEM Build frisch aus typo-settings.json
  // generiert. Das stellt sicher, dass UI-Aenderungen am JSON sofort wirken
  // und es nur eine Quelle der Wahrheit gibt.
  writeFileSync(join(destDir, 'tiptapai-typo.sty'), renderTypoSty(), 'utf8');
}

export function resolveAssetPath(rawPath, { sourceDir, fallbackDirs = [] }) {
  if (!rawPath) return null;
  if (isAbsolute(rawPath) && existsSync(rawPath)) return rawPath;

  if (sourceDir) {
    const rel = resolve(sourceDir, rawPath);
    if (existsSync(rel)) return rel;
  }

  for (const dir of fallbackDirs) {
    const cand = resolve(dir, rawPath);
    if (existsSync(cand)) return cand;
  }
  return null;
}

/**
 * Kopiert ein Asset in den Build-Ordner und gibt den Basename zurueck.
 * So kann das .tex einfach mit `{basename}` arbeiten und TEXINPUTS findet es.
 */
export function stageAsset(absoluteSrc, destDir) {
  if (!absoluteSrc) return null;
  if (!existsSync(absoluteSrc)) {
    throw new Error(`Asset nicht gefunden: ${absoluteSrc}`);
  }
  mkdirSync(destDir, { recursive: true });
  const target = join(destDir, basename(absoluteSrc));
  copyFileSync(absoluteSrc, target);
  return basename(absoluteSrc);
}
