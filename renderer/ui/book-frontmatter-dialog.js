/**
 * Book Frontmatter Dialog
 *
 * Modal for collecting book metadata (TT_bookConfig) when exporting
 * to the LiX/LaTeX book PDF pipeline.
 *
 * Flow:
 * 1. Called from export-dialog when "Buch" format is chosen
 * 2. Prefills fields from existing frontmatter (if any)
 * 3. Highlights missing critical fields
 * 4. Returns Promise<{action, config, saveToFrontmatter}>
 */

import State from '../editor/editor-state.js';
import {
  BOOK_TYPE_REGISTRY,
  GENERIC_BOOK_TEXT,
  getMeaningfulBookText,
  getRecommendedMargins,
  getRecommendedTrimSize,
} from '../book-export-lix/frontmatter-schema.js';

const CRITICAL_FIELDS = ['book_type', 'trim_size', 'margins'];
const DEFAULT_TRIM_SIZE = '5x8';
const MARGIN_FIELD_IDS = [
  'bf-margin-top',
  'bf-margin-bottom',
  'bf-margin-inner',
  'bf-margin-outer'
];

let currentResolve = null;
let bookTypeSelectPopulated = false;

function populateBookTypeSelect() {
  if (bookTypeSelectPopulated) return;
  const select = document.getElementById('bf-book-type');
  if (!select) return;

  const groups = {};
  for (const [id, reg] of Object.entries(BOOK_TYPE_REGISTRY)) {
    if (!groups[reg.group]) groups[reg.group] = [];
    groups[reg.group].push({ id, label: reg.label });
  }
  for (const [groupLabel, options] of Object.entries(groups)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupLabel;
    for (const { id, label } of options) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }
  bookTypeSelectPopulated = true;
}

/**
 * Show the book frontmatter dialog
 * @param {string[]} missingFields - List of missing critical fields to highlight
 * @returns {Promise<{action: 'continue'|'cancel', config?: object, metadataOverrides?: object, saveToFrontmatter?: boolean}>}
 */
export function showBookFrontmatterDialog(missingFields = []) {
  const modal = document.getElementById('book-frontmatter-modal');
  if (!modal) {
    throw new Error('book-frontmatter-modal not found in DOM');
  }

  populateBookTypeSelect();
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
  setValue(
    'bf-isbn-print',
    getMeaningfulBookText(config.isbn?.print, GENERIC_BOOK_TEXT.isbnPrint)
  );
  setValue(
    'bf-isbn-ebook',
    getMeaningfulBookText(config.isbn?.ebook, GENERIC_BOOK_TEXT.isbnEbook)
  );

  // Insel-Cover-Felder (Konvention: leer → Hilfstext gedruckt; Space → leer)
  setValue('bf-genre', typeof config.genre === 'string' ? config.genre : '');
  setValue('bf-band',  typeof config.band  === 'string' ? config.band  : '');
  setValue('bf-blurb', typeof config.blurb === 'string' ? config.blurb : '');
  setValue('bf-cover-pattern', typeof config.cover_pattern === 'string' ? config.cover_pattern : '');
  renderPatternGallery(config.cover_pattern || '');

  // License
  if (config.license) {
    const licenseId = buildLicenseId(config.license);
    setValue('bf-license', licenseId || GENERIC_BOOK_TEXT.licenseId);
    setValue(
      'bf-license-holder',
      getMeaningfulBookText(config.license.holder, GENERIC_BOOK_TEXT.licenseHolder)
    );
  } else {
    setValue('bf-license', GENERIC_BOOK_TEXT.licenseId);
    setValue('bf-license-holder', GENERIC_BOOK_TEXT.licenseHolder);
  }

  // Titel, Autor:in, Untertitel (aus top-level Frontmatter)
  setValue('bf-title', State.currentFileMetadata?.title || '');
  setValue('bf-author', flattenAuthor(
    State.currentFileMetadata?.authors || State.currentFileMetadata?.author || ''
  ));
  setValue('bf-subtitle', State.currentFileMetadata?.subtitle || '');

  // Publisher
  setValue(
    'bf-publisher',
    getMeaningfulBookText(State.currentFileMetadata?.publisher, GENERIC_BOOK_TEXT.publisher)
  );

  // Dedication & Epigraph
  setValue(
    'bf-dedication',
    getMeaningfulBookText(config.dedication, GENERIC_BOOK_TEXT.dedication)
  );
  setValue(
    'bf-epigraph',
    getMeaningfulBookText(config.epigraph, GENERIC_BOOK_TEXT.epigraph)
  );

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
  const dialogData = collectBookDialogData();

  if (!dialogData) {
    // Validation failed, errors already displayed
    return;
  }

  const saveToFrontmatter = getChecked('bf-save-to-frontmatter');

  closeModal();

  if (currentResolve) {
    currentResolve({
      action: 'continue',
      config: dialogData.config,
      metadataOverrides: dialogData.metadataOverrides,
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
 * Collect dialog values and build the book export payload
 * Returns null if validation fails
 */
function collectBookDialogData() {
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

  // Book-production metadata
  const isbnPrint = getValue('bf-isbn-print').trim();
  const isbnEbook = getValue('bf-isbn-ebook').trim();
  if (isbnPrint || isbnEbook) {
    config.isbn = {};
    if (isbnPrint) config.isbn.print = isbnPrint;
    if (isbnEbook) config.isbn.ebook = isbnEbook;
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

  // Insel-Cover-Felder: raw (NICHT getrimmt!) uebernehmen, damit die Konvention
  // 'Leerzeichen = bewusst leer' im cover-builder greifen kann. Nur bei
  // komplett leerem String NICHT speichern (dann greift der Hilfstext-Default).
  const genreRaw = getValue('bf-genre');
  const bandRaw  = getValue('bf-band');
  const blurbRaw = getValue('bf-blurb');
  const patternId = getValue('bf-cover-pattern').trim();
  if (genreRaw !== '') config.genre = genreRaw;
  if (bandRaw  !== '') config.band  = bandRaw;
  if (blurbRaw !== '') config.blurb = blurbRaw;
  if (patternId)       config.cover_pattern = patternId;

  return {
    config,
    metadataOverrides: {
      title:     getValue('bf-title').trim() || State.currentFileMetadata?.title || '',
      subtitle:  getValue('bf-subtitle').trim() || undefined,
      // Autor:innen-String: ggf. " · "-separiert, zu Array fuer Standard-Felder;
      // wird im cover-builder wieder zu einem String zusammengesetzt.
      authors:   parseAuthorInput(getValue('bf-author')),
      publisher: getMeaningfulBookText(getValue('bf-publisher'), GENERIC_BOOK_TEXT.publisher)
    }
  };
}

// ============ Autor:innen-Formate normalisieren ============

// Flatten: Frontmatter-author-Wert kann String, Array<string|object>, Object
// oder undefined sein → " · "-separierter String fuer das Textfeld.
function flattenAuthor(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map((a) => (typeof a === 'string' ? a : (a && a.name) || '')).filter(Boolean).join(' · ');
  }
  if (typeof raw === 'object' && raw.name) return raw.name;
  return '';
}

// Parse input: "A · B · C" oder "A, B" → [{name:'A'},{name:'B'},{name:'C'}]
function parseAuthorInput(str) {
  const s = (str || '').trim();
  if (!s) return [];
  return s.split(/\s*[·,;]\s*/).filter(Boolean).map((name) => ({ name }));
}

// ============ Insel-Cover: Pattern-Galerie ============

async function renderPatternGallery(selectedId) {
  const gallery = document.getElementById('bf-pattern-gallery');
  if (!gallery) return;

  let patterns = [];
  try {
    const res = await window.api.coverListPatterns?.();
    if (res?.success) patterns = res.patterns || [];
  } catch (err) {
    console.warn('[BookFrontmatter] Pattern-Liste konnte nicht geladen werden:', err);
  }

  // Erste Kachel: "kein Pattern" → triggert PNG-Fallback
  const tiles = ['<div class="bf-pattern-tile none" data-pattern-id="">Kein<br>Pattern</div>'];
  for (const p of patterns) {
    tiles.push(
      `<div class="bf-pattern-tile" data-pattern-id="${p.id}" ` +
      `style="background-image:url('${p.fileUrl}')" title="${p.label}"></div>`
    );
  }
  gallery.innerHTML = tiles.join('');

  // Selektion setzen
  markPatternTile(selectedId || '');

  // Click-Handler
  gallery.querySelectorAll('.bf-pattern-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const id = tile.getAttribute('data-pattern-id') || '';
      setValue('bf-cover-pattern', id);
      markPatternTile(id);
    });
  });
}

function markPatternTile(id) {
  const gallery = document.getElementById('bf-pattern-gallery');
  if (!gallery) return;
  gallery.querySelectorAll('.bf-pattern-tile').forEach((t) => {
    t.classList.toggle('selected', (t.getAttribute('data-pattern-id') || '') === id);
  });
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
export function applyConfigToFrontmatter(config, metadataOverrides = {}) {
  if (!State.currentFileMetadata) {
    State.currentFileMetadata = {};
  }

  State.currentFileMetadata.publisher = getMeaningfulBookText(
    metadataOverrides.publisher || State.currentFileMetadata.publisher,
    GENERIC_BOOK_TEXT.publisher
  );

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
