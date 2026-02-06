/**
 * Search & Replace preset configuration.
 *
 * Jede Option definiert:
 * - `id`: ID des Checkbox-Elements in renderer/index.html
 * - `label`: Anzeigename (kann für Tooltips/Labels verwendet werden)
 * - `tooltip`: Beschreibung, wie die Option arbeitet
 * - `summaryLabel`: Kurzer Text für Statusmeldungen (z. B. "Anführungszeichen")
 * - `apply(text, context)`: Funktion, die den gesamten Markdown-Text
 *   verarbeitet und `{ text, count }` zurückgibt. `count` = Anzahl gefundener
 *   bzw. ersetzter Stellen. `context` enthält u. a. die Dokumentsprache.
 *
 * Um neue Optionen hinzuzufügen:
 * 1. Checkbox mit eindeutiger `id` in renderer/index.html ergänzen.
 * 2. Hier einen Eintrag im Array hinzufügen und in `apply` die gewünschte
 *    Ersetzungslogik implementieren.
 * 3. Optional `summaryLabel` und `tooltip` anpassen.
 */

import { escapeHtml, unescapeHtml } from '../utils/html-escape.js';

const NARROW_NO_BREAK_SPACE = '\u202F';
const CODE_PLACEHOLDER_PREFIX = '__TIPTAP_PROTECTED_CODE_';
const CODE_PLACEHOLDER_SUFFIX = '__';

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function protectCodeSegments(text) {
  const protectedMap = new Map();
  let placeholderIndex = 0;

  const store = (match) => {
    const placeholder = `${CODE_PLACEHOLDER_PREFIX}${placeholderIndex}${CODE_PLACEHOLDER_SUFFIX}`;
    protectedMap.set(placeholder, match);
    placeholderIndex++;
    return placeholder;
  };

  const fencedCodeRegex = /(^|\n)(```+|~~~+)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;
  let protectedText = text.replace(fencedCodeRegex, (match) => store(match));

  const inlineCodeRegex = /(`+)([^`\n]*?)\1/g;
  protectedText = protectedText.replace(inlineCodeRegex, (match) => store(match));

  return { text: protectedText, protectedMap };
}

function restoreProtectedSegments(text, protectedMap) {
  if (!protectedMap || protectedMap.size === 0) {
    return text;
  }

  let restored = text;
  protectedMap.forEach((value, placeholder) => {
    if (restored.includes(placeholder)) {
      restored = restored.replace(new RegExp(escapeRegex(placeholder), 'g'), value);
    }
  });

  return restored;
}

function applyWithProtectedSegments(text, applyFn) {
  const { text: withoutCode, protectedMap } = protectCodeSegments(text);
  const { escapedContent, htmlMap } = escapeHtml(withoutCode);
  const { text: updated, count } = applyFn(escapedContent);
  const restoredHtml = unescapeHtml(updated, htmlMap);
  const restored = restoreProtectedSegments(restoredHtml, protectedMap);

  return { text: restored, count };
}

function getQuoteStyle(language = 'de-CH') {
  const lang = language.toLowerCase();

  if (lang.startsWith('de-ch')) {
    return { open: '«', close: '»' };
  }

  if (lang.startsWith('de')) {
    return { open: '„', close: '“' };
  }

  if (lang.startsWith('fr')) {
    return { open: `«${NARROW_NO_BREAK_SPACE}`, close: `${NARROW_NO_BREAK_SPACE}»` };
  }

  if (lang.startsWith('en')) {
    return { open: '“', close: '”' };
  }

  return { open: '„', close: '“' };
}

function extractQuotePairs(text) {
  const quoteChars = /["«»„“‚‘’‹›]/g;
  const positions = [];
  let match;

  while ((match = quoteChars.exec(text)) !== null) {
    positions.push(match.index);
  }

  const pairs = [];
  for (let i = 0; i < positions.length - 1; i += 2) {
    const openPos = positions[i];
    const closePos = positions[i + 1];
    pairs.push({ openPos, closePos, text: text.slice(openPos + 1, closePos) });
  }

  return pairs;
}

function replaceQuotationMarksRaw(text, context = {}) {
  const pairs = extractQuotePairs(text);
  if (pairs.length === 0) {
    return { text, count: 0 };
  }

  const { open, close } = getQuoteStyle(context.language);
  let result = text;

  for (let i = pairs.length - 1; i >= 0; i--) {
    const pair = pairs[i];
    const replacement = `${open}${pair.text}${close}`;
    result = result.slice(0, pair.openPos) + replacement + result.slice(pair.closePos + 1);
  }

  return { text: result, count: pairs.length };
}

function applyRegexWithCount(text, regex, replacement) {
  let count = 0;
  const output = text.replace(regex, (...args) => {
    count++;
    if (typeof replacement === 'function') {
      return replacement(...args);
    }
    return replacement;
  });
  return { text: output, count };
}

function replaceDashesTypographicallyRaw(text) {
  const BULLET_PLACEHOLDER = '__TIPTAP_BULLET_MARKER__';
  let result = text.replace(/(^\s*)-\s(?=\S)/gm, (_, indent) => `${indent}${BULLET_PLACEHOLDER}`);
  let total = 0;

  const steps = [
    { regex: /--/g, replacement: '–' },
    { regex: /—/g, replacement: '–' },
    { regex: /\s-\s/g, replacement: ' – ' },
    {
      regex: /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g,
      replacement: (_, start, end) => `${start}–${end}`
    },
    {
      regex: /(\b\d{1,4}(?:[.,]\d+)?)(\s*-\s*)(\d{1,4}(?:[.,]\d+)?\b)(?!-)/g,
      replacement: (_, start, __, end) => `${start}–${end}`
    },
    {
      regex: /(\d{1,4})\s*-\s*(\d{1,4})(\s?(?:kg|cm|mm|m|km|g|mg|t|l|ml|°c|%|h|min|s|sek|m²|m³|§|nr\.|s\.))/gi,
      replacement: (_, start, end, unit) => `${start}–${end}${unit}`
    }
  ];

  steps.forEach(step => {
    const { text: updated, count } = applyRegexWithCount(result, step.regex, step.replacement);
    result = updated;
    total += count;
  });

  result = result.replace(new RegExp(BULLET_PLACEHOLDER, 'g'), '- ');

  return { text: result, count: total };
}

function replaceEllipsesRaw(text) {
  const { text: updated, count } = applyRegexWithCount(text, /(\.\s*){3}/g, '…');
  return { text: updated, count };
}

function replaceQuotationMarks(text, context = {}) {
  return applyWithProtectedSegments(text, (input) => replaceQuotationMarksRaw(input, context));
}

function replaceDashesTypographically(text) {
  return applyWithProtectedSegments(text, (input) => replaceDashesTypographicallyRaw(input));
}

function replaceEllipses(text) {
  return applyWithProtectedSegments(text, (input) => replaceEllipsesRaw(input));
}

export const findReplacePresets = [
  {
    id: 'quotes',
    label: 'Anführungszeichen typografisch korrigieren',
    tooltip: 'Formatiert alle gefundenen Anführungszeichen passend zur Dokumentensprache (z. B. «…» in de-CH, „…“ in de-DE, “…” in Englisch, « … » in Französisch).',
    summaryLabel: 'Anführungszeichen',
    apply: replaceQuotationMarks,
  },
  {
    id: 'dashes',
    label: 'Gedankenstriche typografisch korrigieren',
    tooltip: 'Vereinheitlicht alle Gedankenstriche: ersetzt Doppelbindestriche (--), em dash (—), Bindestriche mit Abständen sowie Zahlen- und Zeitbereiche (3-5, 08:00-12:00, 5-7 kg) durch den europäischen Gedankenstrich (–).',
    summaryLabel: 'Gedankenstriche',
    apply: replaceDashesTypographically,
  },
  {
    id: 'ellipses',
    label: 'Ellipsen korrigieren (... → …)',
    tooltip: 'Ersetzt drei Punkte (... oder . . .) durch das typografische Ellipsenzeichen (…).',
    summaryLabel: 'Ellipsen',
    apply: replaceEllipses,
  },
];
