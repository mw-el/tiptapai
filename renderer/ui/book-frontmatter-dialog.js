/**
 * Book Frontmatter Dialog
 *
 * Modal for collecting book metadata (TT_bookConfig) when exporting
 * to the Paragraf-powered Book PDF + EPUB pipeline.
 *
 * Flow:
 * 1. Called from export-dialog when "Buch" format is chosen
 * 2. Prefills fields from existing frontmatter (if any)
 * 3. Highlights missing critical fields
 * 4. Returns Promise<{action, config, saveToFrontmatter}>
 */

import State from '../editor/editor-state.js';
import {
  getRecommendedMargins,
  getRecommendedTrimSize
} from '../book-export/frontmatter-schema.js';

const CRITICAL_FIELDS = ['book_type', 'trim_size', 'margins'];
const DEFAULT_TRIM_SIZE = '5x8';
const MARGIN_FIELD_IDS = [
  'bf-margin-top',
  'bf-margin-bottom',
  'bf-margin-inner',
  'bf-margin-outer'
];

let currentResolve = null;

/**
 * Show the book frontmatter dialog
 * @param {string[]} missingFields - List of missing critical fields to highlight
 * @returns {Promise<{action: 'continue'|'cancel', config?: object, saveToFrontmatter?: boolean}>}
 */
export function showBookFrontmatterDialog(missingFields = []) {
  const modal = document.getElementById('book-frontmatter-modal');
  if (!modal) {
    throw new Error('book-frontmatter-modal not found in DOM');
  }

  prefillFromFrontmatter();
  highlightMissingFields(missingFields);
  setupEventListeners();

  modal.classList.add('active');

  return new Promise((resolve) => {
    currentResolve = resolve;
  });
}

/**
 * Prefill form fields from current file's TT_bookConfig (if any)
 */
function prefillFromFrontmatter() {
  const config = State.currentFileMetadata?.TT_bookConfig || {};
  const bookType = config.book_type || '';
  const trimSize = config.trim_size ||
    (bookType ? getRecommendedTrimSize(bookType) : DEFAULT_TRIM_SIZE);

  // Critical fields
  setValue('bf-book-type', bookType);
  setValue('bf-trim-size', trimSize);

  if (hasValidMargins(config.margins)) {
    applyMargins(config.margins);
    storeRecommendedMargins(getRecommendedMargins(trimSize, bookType || undefined));
  } else {
    applyRecommendedMargins(trimSize, bookType, { force: true });
  }
  updateMarginsSummary(trimSize, bookType);

  // Profile selection
  setValue('bf-print-profile', config.print_profile || 'generic');
  setValue('bf-ebook-profile', config.ebook_profile || 'generic-epub');

  // ISBN
  setValue('bf-isbn-print', config.isbn?.print || '');
  setValue('bf-isbn-ebook', config.isbn?.ebook || '');

  // Cover
  setValue('bf-cover-front', config.cover?.front || '');
  setValue('bf-cover-back', config.cover?.back || '');

  // License
  if (config.license) {
    const licenseId = buildLicenseId(config.license);
    setValue('bf-license', licenseId);
    setValue('bf-license-holder', config.license.holder || '');
  } else {
    setValue('bf-license', '');
    setValue('bf-license-holder', '');
  }

  // Publisher
  setValue('bf-publisher', State.currentFileMetadata?.publisher || '');

  // Dedication & Epigraph
  setValue('bf-dedication', config.dedication || '');
  setValue('bf-epigraph', config.epigraph || '');

  // Feature toggles
  setChecked('bf-dropcaps', config.features?.dropcaps ?? true);
  setChecked('bf-recto-start', config.features?.recto_chapter_start ?? true);
  setChecked('bf-auto-toc', config.features?.auto_toc ?? true);

  // Save to frontmatter (always default to true)
  setChecked('bf-save-to-frontmatter', true);
}

/**
 * Highlight critical fields that are missing
 */
function highlightMissingFields(missing) {
  // Clear existing highlights
  document.querySelectorAll('#book-frontmatter-modal .book-form-group.missing')
    .forEach(el => el.classList.remove('missing'));

  // Add highlights for missing fields
  missing.forEach(field => {
    if (field === 'book_type') {
      markMissing('bf-book-type');
    } else if (field === 'trim_size') {
      markMissing('bf-trim-size');
    } else if (field === 'margins') {
      ['bf-margin-top', 'bf-margin-bottom', 'bf-margin-inner', 'bf-margin-outer']
        .forEach(id => markMissing(id));
    }
  });
}

function markMissing(id) {
  const el = document.getElementById(id);
  if (el) {
    const group = el.closest('.book-form-group');
    if (group) group.classList.add('missing');
  }
}

/**
 * Setup all event listeners for the dialog
 * (Idempotent: removes old, adds new)
 */
function setupEventListeners() {
  const continueBtn = document.getElementById('bf-continue');
  const cancelBtn = document.getElementById('bf-cancel');

  if (!continueBtn || !cancelBtn) return;

  continueBtn.replaceWith(continueBtn.cloneNode(true));
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));

  document.getElementById('bf-continue').addEventListener('click', handleContinue);
  document.getElementById('bf-cancel').addEventListener('click', handleCancel);

  // Setup asset browse buttons
  document.querySelectorAll('#book-frontmatter-modal .asset-browse-btn')
    .forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
  document.querySelectorAll('#book-frontmatter-modal .asset-browse-btn')
    .forEach(btn => btn.addEventListener('click', handleAssetBrowse));

  document.querySelectorAll('#book-frontmatter-modal .asset-clear-btn')
    .forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
  document.querySelectorAll('#book-frontmatter-modal .asset-clear-btn')
    .forEach(btn => btn.addEventListener('click', handleAssetClear));

  const bookTypeEl = document.getElementById('bf-book-type');
  if (bookTypeEl) {
    bookTypeEl.onchange = () => {
      clearMissingGroup(bookTypeEl);
      const trimSize = getValue('bf-trim-size') || DEFAULT_TRIM_SIZE;
      const bookType = getValue('bf-book-type');
      applyRecommendedMargins(trimSize, bookType);
      updateMarginsSummary(trimSize, bookType);
    };
  }

  const trimSizeEl = document.getElementById('bf-trim-size');
  if (trimSizeEl) {
    trimSizeEl.onchange = () => {
      clearMissingGroup(trimSizeEl);
      const trimSize = trimSizeEl.value || DEFAULT_TRIM_SIZE;
      const bookType = getValue('bf-book-type');
      applyRecommendedMargins(trimSize, bookType);
      updateMarginsSummary(trimSize, bookType);
    };
  }

  MARGIN_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    const clear = () => clearMissingGroup(el);
    el.onchange = clear;
    el.oninput = clear;
  });
}

async function handleAssetBrowse(event) {
  const btn = event.currentTarget;
  const targetId = btn.dataset.target;
  const filter = btn.dataset.filter || 'all';

  try {
    const filters = filter === 'pdf'
      ? [{ name: 'PDF Files', extensions: ['pdf'] }]
      : [{ name: 'All Files', extensions: ['*'] }];

    const result = await window.api.showOpenDialog({
      properties: ['openFile'],
      filters
    });

    if (!result.canceled && result.filePaths?.[0]) {
      setValue(targetId, result.filePaths[0]);
    }
  } catch (error) {
    console.error('[BookFrontmatter] Asset browse failed:', error);
  }
}

function handleAssetClear(event) {
  const btn = event.currentTarget;
  const targetId = btn.dataset.target;
  setValue(targetId, '');
}

function handleContinue() {
  const config = collectBookConfig();

  if (!config) {
    // Validation failed, errors already displayed
    return;
  }

  const saveToFrontmatter = getChecked('bf-save-to-frontmatter');

  closeModal();

  if (currentResolve) {
    currentResolve({
      action: 'continue',
      config,
      saveToFrontmatter
    });
    currentResolve = null;
  }
}

function handleCancel() {
  closeModal();

  if (currentResolve) {
    currentResolve({ action: 'cancel' });
    currentResolve = null;
  }
}

function closeModal() {
  const modal = document.getElementById('book-frontmatter-modal');
  if (modal) modal.classList.remove('active');
}

/**
 * Collect all form values and build a BookConfig object
 * Returns null if validation fails
 */
function collectBookConfig() {
  const bookType = getValue('bf-book-type');
  const trimSize = getValue('bf-trim-size');

  const marginTop = parseInt(getValue('bf-margin-top'), 10);
  const marginBottom = parseInt(getValue('bf-margin-bottom'), 10);
  const marginInner = parseInt(getValue('bf-margin-inner'), 10);
  const marginOuter = parseInt(getValue('bf-margin-outer'), 10);

  // Validate critical fields
  if (!bookType) {
    alert('Bitte Buchtyp auswählen!');
    markMissing('bf-book-type');
    return null;
  }

  if (!trimSize) {
    alert('Bitte Seitengröße auswählen!');
    markMissing('bf-trim-size');
    return null;
  }

  if (![marginTop, marginBottom, marginInner, marginOuter].every(m => m > 0)) {
    alert('Alle Seitenränder müssen > 0 mm sein!');
    ['bf-margin-top', 'bf-margin-bottom', 'bf-margin-inner', 'bf-margin-outer']
      .forEach(id => markMissing(id));
    return null;
  }

  // Build config
  const config = {
    book_type: bookType,
    trim_size: trimSize,
    print_profile: getValue('bf-print-profile') || 'generic',
    ebook_profile: getValue('bf-ebook-profile') || 'generic-epub',
    margins: {
      top: marginTop,
      bottom: marginBottom,
      inner: marginInner,
      outer: marginOuter
    },
    features: {
      dropcaps: getChecked('bf-dropcaps'),
      recto_chapter_start: getChecked('bf-recto-start'),
      auto_toc: getChecked('bf-auto-toc'),
      force_recto_blank: false
    }
  };

  // Optional fields (omit if empty)
  const isbnPrint = getValue('bf-isbn-print').trim();
  const isbnEbook = getValue('bf-isbn-ebook').trim();
  if (isbnPrint || isbnEbook) {
    config.isbn = {};
    if (isbnPrint) config.isbn.print = isbnPrint;
    if (isbnEbook) config.isbn.ebook = isbnEbook;
  }

  const coverFront = getValue('bf-cover-front').trim();
  const coverBack = getValue('bf-cover-back').trim();
  if (coverFront || coverBack) {
    config.cover = {};
    if (coverFront) config.cover.front = coverFront;
    if (coverBack) config.cover.back = coverBack;
  }

  const licenseId = getValue('bf-license');
  const licenseHolder = getValue('bf-license-holder').trim();
  if (licenseId) {
    config.license = parseLicenseId(licenseId);
    if (licenseHolder) config.license.holder = licenseHolder;
  }

  const dedication = getValue('bf-dedication').trim();
  if (dedication) config.dedication = dedication;

  const epigraph = getValue('bf-epigraph').trim();
  if (epigraph) config.epigraph = epigraph;

  return config;
}

// ============ License ID Helpers ============

function parseLicenseId(id) {
  // CC-BY-SA-4.0 → { type: 'CC', modifiers: ['by', 'sa'], version: '4.0' }
  if (id.startsWith('CC-')) {
    const parts = id.split('-');
    const version = parts[parts.length - 1];
    const modifiers = parts.slice(1, -1).map(m => m.toLowerCase());
    return { type: 'CC', modifiers, version };
  }

  if (id === 'MIT') {
    return { type: 'MIT', modifiers: [], version: '' };
  }

  if (id === 'GPL-3.0') {
    return { type: 'GPL', modifiers: [], version: '3.0' };
  }

  if (id === 'All-Rights-Reserved') {
    return { type: 'All-Rights-Reserved', modifiers: [], version: '' };
  }

  return { type: id, modifiers: [], version: '' };
}

function buildLicenseId(license) {
  if (!license) return '';

  if (license.type === 'CC' && license.modifiers?.length > 0) {
    const modifierStr = license.modifiers.map(m => m.toUpperCase()).join('-');
    return `CC-${modifierStr}-${license.version}`;
  }

  if (license.type === 'MIT') return 'MIT';
  if (license.type === 'GPL' && license.version === '3.0') return 'GPL-3.0';
  if (license.type === 'All-Rights-Reserved') return 'All-Rights-Reserved';

  return license.type || '';
}

function clearMissingGroup(el) {
  const group = el?.closest('.book-form-group');
  if (group) group.classList.remove('missing');
}

function getMarginValues() {
  return {
    top: parseInt(getValue('bf-margin-top'), 10),
    bottom: parseInt(getValue('bf-margin-bottom'), 10),
    inner: parseInt(getValue('bf-margin-inner'), 10),
    outer: parseInt(getValue('bf-margin-outer'), 10)
  };
}

function hasValidMargins(margins) {
  return !!margins && MARGIN_FIELD_IDS.every((id, index) => {
    const keys = ['top', 'bottom', 'inner', 'outer'];
    const value = margins[keys[index]];
    return Number.isFinite(value) && value > 0;
  });
}

function marginsEqual(a, b) {
  return !!a && !!b &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.inner === b.inner &&
    a.outer === b.outer;
}

function applyMargins(margins) {
  setValue('bf-margin-top', margins.top);
  setValue('bf-margin-bottom', margins.bottom);
  setValue('bf-margin-inner', margins.inner);
  setValue('bf-margin-outer', margins.outer);
}

function readRecommendedMargins() {
  const modal = document.getElementById('book-frontmatter-modal');
  if (!modal?.dataset.recommendedMargins) return null;

  try {
    return JSON.parse(modal.dataset.recommendedMargins);
  } catch {
    return null;
  }
}

function storeRecommendedMargins(margins) {
  const modal = document.getElementById('book-frontmatter-modal');
  if (modal) {
    modal.dataset.recommendedMargins = JSON.stringify(margins);
  }
}

function applyRecommendedMargins(trimSize, bookType, options = {}) {
  const nextMargins = getRecommendedMargins(trimSize || DEFAULT_TRIM_SIZE, bookType || undefined);
  const currentMargins = getMarginValues();
  const previousRecommended = readRecommendedMargins();
  const shouldApply = options.force ||
    !hasValidMargins(currentMargins) ||
    !previousRecommended ||
    marginsEqual(currentMargins, previousRecommended);

  if (shouldApply) {
    applyMargins(nextMargins);
  }

  storeRecommendedMargins(nextMargins);
}

function updateMarginsSummary(trimSize, bookType) {
  const summary = document.getElementById('bf-margin-summary');
  if (!summary) return;

  const recommended = getRecommendedMargins(trimSize || DEFAULT_TRIM_SIZE, bookType || undefined);
  summary.textContent =
    `Empfohlene Satzspiegel-Defaults: oben ${recommended.top} mm, unten ${recommended.bottom} mm, ` +
    `innen ${recommended.inner} mm, außen ${recommended.outer} mm.`;
}

// ============ DOM Helpers ============

function getValue(id) {
  const el = document.getElementById(id);
  return el?.value || '';
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) {
    el.value = value;
  }
}

function getChecked(id) {
  const el = document.getElementById(id);
  return el?.checked || false;
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}

// ============ Save Config to Frontmatter ============

/**
 * Apply a BookConfig to currentFileMetadata
 * Caller is responsible for saving the file
 */
export function applyConfigToFrontmatter(config) {
  if (!State.currentFileMetadata) {
    State.currentFileMetadata = {};
  }
  State.currentFileMetadata.TT_bookConfig = config;
}

/**
 * Check if critical fields are missing in current frontmatter
 */
export function checkMissingFields(metadata) {
  const config = metadata?.TT_bookConfig;
  const missing = [];

  if (!config) {
    return ['book_type', 'trim_size', 'margins'];
  }

  if (!config.book_type) missing.push('book_type');
  if (!config.trim_size) missing.push('trim_size');

  if (!config.margins ||
      !config.margins.top ||
      !config.margins.bottom ||
      !config.margins.inner ||
      !config.margins.outer) {
    missing.push('margins');
  }

  return missing;
}
