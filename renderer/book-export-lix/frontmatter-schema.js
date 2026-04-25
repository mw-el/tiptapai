/**
 * Frontmatter Schema — Validierung und Defaults
 *
 * Buchtyp-spezifische Werte kommen ausschliesslich aus BOOK_TYPE_REGISTRY.
 * Diese Datei stellt nur noch die Ableitungsfunktionen und die
 * formatunabhaengigen Fallback-Raender bereit.
 */

export { BOOK_TYPE_REGISTRY } from './book-type-registry.js';
import  { BOOK_TYPE_REGISTRY } from './book-type-registry.js';

// Generische Randbreiten nach Buchformat — Fallback wenn kein Buchtyp bekannt
// oder der Nutzer ein vom Standard abweichendes Format waehlt.
export const DEFAULT_MARGINS = {
    '5x8':    { top: 17, bottom: 22, inner: 20, outer: 15 },
    '5.5x8.5':{ top: 20, bottom: 22, inner: 20, outer: 16 },
    '6x9':    { top: 20, bottom: 24, inner: 22, outer: 17 },
    'a5':     { top: 18, bottom: 22, inner: 20, outer: 15 },
    'a4':     { top: 26, bottom: 28, inner: 24, outer: 22 },
    'letter': { top: 25, bottom: 28, inner: 26, outer: 22 },
};

export const DEFAULT_FEATURES = {
    dropcaps: true,
    recto_chapter_start: true,
    auto_toc: true,
    force_recto_blank: false,
};

export const GENERIC_BOOK_TEXT = {
    title:         '[Buchtitel eintragen]',
    subtitle:      '[Untertitel eintragen oder leer lassen]',
    author:        '[Autorin/Autor eintragen]',
    publisher:     '[Verlag eintragen]',
    isbnPrint:     '[ISBN Print eintragen]',
    isbnEbook:     '[ISBN eBook eintragen]',
    licenseId:     'All-Rights-Reserved',
    licenseHolder: '[Rechteinhaber eintragen]',
    dedication:    '[Widmung eintragen]',
    epigraph:      '[Motto / Epigraph eintragen]',
};

// ============ Hilfsfunktionen ============

function cloneMargins(m) {
    return { top: m.top, bottom: m.bottom, inner: m.inner, outer: m.outer };
}

export function getMeaningfulBookText(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

// ============ Buchtyp-Abfragen (abgeleitet aus Registry) ============

export function isValidBookType(type) {
    return typeof type === 'string' && type in BOOK_TYPE_REGISTRY;
}

export function getRecommendedTrimSize(bookType) {
    return BOOK_TYPE_REGISTRY[bookType]?.trimSize;
}

/**
 * Standardraender fuer eine trimSize+bookType-Kombination.
 * Wenn die Kombination dem Typ-Canonical entspricht → Registry-Raender.
 * Sonst → generischer Fallback aus DEFAULT_MARGINS.
 */
export function getRecommendedMargins(trimSize, bookType) {
    const reg = BOOK_TYPE_REGISTRY[bookType];
    if (reg && reg.trimSize === trimSize) return cloneMargins(reg.margins);
    return cloneMargins(DEFAULT_MARGINS[trimSize] || DEFAULT_MARGINS['a5']);
}

export function getDefaultLayout(bookType) {
    const reg = BOOK_TYPE_REGISTRY[bookType];
    if (!reg) throw new Error(`frontmatter-schema: unbekannter bookType "${bookType}"`);
    return {
        trimSize:          reg.trimSize,
        margins:           cloneMargins(reg.margins),
        rectoChapterStart: reg.rectoChapterStart,
        dropcaps:          reg.dropcaps,
        ...(reg.columns !== undefined ? { columns: reg.columns } : {}),
    };
}

// ============ Validierung ============

export function isValidTrimSize(size) {
    return typeof size === 'string' && size in DEFAULT_MARGINS;
}

export function isValidPrintProfile(profile) {
    return typeof profile === 'string' && ['kdp', 'tolino', 'generic'].includes(profile);
}

export function isValidEbookProfile(profile) {
    return typeof profile === 'string' &&
        ['kdp-epub', 'kobo-epub', 'generic-epub'].includes(profile);
}

export function isValidMargins(margins) {
    if (typeof margins !== 'object' || margins === null) return false;
    const m = margins;
    return (
        typeof m.top    === 'number' && m.top    > 0 &&
        typeof m.bottom === 'number' && m.bottom > 0 &&
        typeof m.inner  === 'number' && m.inner  > 0 &&
        typeof m.outer  === 'number' && m.outer  > 0
    );
}

export function validateBookConfig(config) {
    const errors = {};
    const missing = [];
    if (typeof config !== 'object' || config === null) {
        return {
            valid: false,
            missing: ['book_type', 'trim_size', 'margins'],
            errors: { root: 'TT_bookConfig muss ein Objekt sein' },
        };
    }
    const c = config;
    if (!c.book_type) {
        missing.push('book_type');
        errors['book_type'] = 'Buchtyp ist erforderlich';
    } else if (!isValidBookType(c.book_type)) {
        errors['book_type'] = `Ungültiger Buchtyp: ${c.book_type}`;
    }
    if (!c.trim_size) {
        missing.push('trim_size');
        errors['trim_size'] = 'Seitengröße ist erforderlich';
    } else if (!isValidTrimSize(c.trim_size)) {
        errors['trim_size'] = `Ungültige Seitengröße: ${c.trim_size}`;
    }
    if (!c.margins) {
        missing.push('margins');
        errors['margins'] = 'Seitenränder sind erforderlich';
    } else if (!isValidMargins(c.margins)) {
        errors['margins'] = 'Ungültige Seitenränder (müssen alle > 0 sein)';
    }
    if (c.print_profile && !isValidPrintProfile(c.print_profile)) {
        errors['print_profile'] = `Ungültiges Print-Profil: ${c.print_profile}`;
    }
    if (c.ebook_profile && !isValidEbookProfile(c.ebook_profile)) {
        errors['ebook_profile'] = `Ungültiges eBook-Profil: ${c.ebook_profile}`;
    }
    return { valid: Object.keys(errors).length === 0, missing, errors };
}

export function normalizeBookConfig(config) {
    const validation = validateBookConfig(config);
    if (!validation.valid && validation.missing.length > 0) return null;
    const c = config;
    const bookType = c.book_type;
    const trimSize = c.trim_size || getRecommendedTrimSize(bookType);
    return {
        book_type:     bookType,
        trim_size:     trimSize,
        print_profile: c.print_profile || 'generic',
        ebook_profile: c.ebook_profile || 'generic-epub',
        margins: isValidMargins(c.margins)
            ? cloneMargins(c.margins)
            : getRecommendedMargins(trimSize, bookType),
        isbn:         c.isbn,
        license:      c.license,
        epigraph:     c.epigraph     || undefined,
        dedication:   c.dedication   || undefined,
        band:         typeof c.band         === 'string' ? c.band.trim()         : undefined,
        genre:        typeof c.genre        === 'string' ? c.genre.trim()        : undefined,
        blurb:        typeof c.blurb        === 'string' ? c.blurb.trim()        : undefined,
        cover_pattern: typeof c.cover_pattern === 'string' ? c.cover_pattern.trim() : undefined,
        features: { ...DEFAULT_FEATURES, ...c.features },
    };
}

export function getMissingCriticalFields(config) {
    if (typeof config !== 'object' || config === null) {
        return ['book_type', 'trim_size', 'margins'];
    }
    const c = config;
    const missing = [];
    if (!isValidBookType(c.book_type))  missing.push('book_type');
    if (!isValidTrimSize(c.trim_size))  missing.push('trim_size');
    if (!isValidMargins(c.margins))     missing.push('margins');
    return missing;
}

export function validateForBookExport(metadata) {
    if (!metadata) {
        return { success: false, missing: ['book_type', 'trim_size', 'margins'], hasConfig: false };
    }
    const config = metadata.TT_bookConfig;
    const missing = getMissingCriticalFields(config);
    return { success: missing.length === 0, missing, hasConfig: !!config };
}

export function mergeWithDefaults(userConfig, bookType) {
    const defaults = getDefaultLayout(bookType);
    const trimSize = userConfig.trim_size || defaults.trimSize;
    const recommendedMargins = getRecommendedMargins(trimSize, bookType);
    const userMargins = isValidMargins(userConfig.margins) ? userConfig.margins : undefined;
    return {
        trimSize,
        margins: {
            top:    userMargins?.top    ?? recommendedMargins.top    ?? defaults.margins.top,
            bottom: userMargins?.bottom ?? recommendedMargins.bottom ?? defaults.margins.bottom,
            inner:  userMargins?.inner  ?? recommendedMargins.inner  ?? defaults.margins.inner,
            outer:  userMargins?.outer  ?? recommendedMargins.outer  ?? defaults.margins.outer,
        },
        rectoChapterStart: userConfig.features?.recto_chapter_start ?? defaults.rectoChapterStart,
        dropcaps:          userConfig.features?.dropcaps             ?? defaults.dropcaps,
        columns:           defaults.columns,
    };
}
