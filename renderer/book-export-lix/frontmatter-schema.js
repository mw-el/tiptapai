/**
 * Frontmatter Schema Validation
 * Validates TT_bookConfig structure and provides defaults
 */
// ============ Default Configurations ============
export const DEFAULT_MARGINS = {
    '5x8': { top: 17, bottom: 22, inner: 20, outer: 15 },
    '5.5x8.5': { top: 20, bottom: 22, inner: 20, outer: 16 },
    '6x9': { top: 20, bottom: 24, inner: 22, outer: 17 },
    'a5': { top: 18, bottom: 22, inner: 20, outer: 15 },
    'a4': { top: 26, bottom: 28, inner: 24, outer: 22 },
    'letter': { top: 25, bottom: 28, inner: 26, outer: 22 }
};
export const DEFAULT_TRIM_SIZE_BY_PROFILE = {
    novel: '5x8',
    textbook: 'a4',
    novella: 'a5',
    poetry: 'a5',
    'news-twocol': 'a4',
    // Schreibszene-Design-Varianten (sz-common.sty)
    'sz-schreiben': '6x9',
    'sz-novel': '6x9',
    'sz-novella': '5.5x8.5',
    'sz-textbook': 'a4',
    'sz-poem': 'a5'
};
const PROFILE_MARGIN_OVERRIDES = {
    'news-twocol': { top: 18, bottom: 20, inner: 16, outer: 16 },
    poetry: { top: 28, bottom: 28, inner: 26, outer: 26 },
    textbook: { top: 28, bottom: 28, inner: 22, outer: 22 },
    'sz-schreiben': { top: 20, bottom: 24, inner: 22, outer: 17 },
    'sz-novel':     { top: 24, bottom: 26, inner: 22, outer: 18 },
    'sz-novella':   { top: 20, bottom: 22, inner: 20, outer: 16 },
    'sz-textbook':  { top: 26, bottom: 28, inner: 24, outer: 22 },
    'sz-poem':      { top: 22, bottom: 22, inner: 20, outer: 20 }
};
export const DEFAULT_FEATURES = {
    dropcaps: true,
    recto_chapter_start: true,
    auto_toc: true,
    force_recto_blank: false
};
export const GENERIC_BOOK_TEXT = {
    title: '[Buchtitel eintragen]',
    subtitle: '[Untertitel eintragen oder leer lassen]',
    author: '[Autorin/Autor eintragen]',
    publisher: '[Verlag eintragen]',
    isbnPrint: '[ISBN Print eintragen]',
    isbnEbook: '[ISBN eBook eintragen]',
    licenseId: 'All-Rights-Reserved',
    licenseHolder: '[Rechteinhaber eintragen]',
    dedication: '[Widmung eintragen]',
    epigraph: '[Motto / Epigraph eintragen]'
};
export const DEFAULT_LAYOUT_BY_PROFILE = {
    novel: {
        trimSize: '5x8',
        margins: getRecommendedMargins('5x8', 'novel'),
        rectoChapterStart: true,
        dropcaps: true
    },
    textbook: {
        trimSize: 'a4',
        margins: getRecommendedMargins('a4', 'textbook'),
        rectoChapterStart: true,
        dropcaps: false
    },
    novella: {
        trimSize: 'a5',
        margins: getRecommendedMargins('a5', 'novella'),
        rectoChapterStart: true,
        dropcaps: true
    },
    poetry: {
        trimSize: 'a5',
        margins: getRecommendedMargins('a5', 'poetry'),
        rectoChapterStart: false,
        dropcaps: false
    },
    'news-twocol': {
        trimSize: 'a4',
        margins: getRecommendedMargins('a4', 'news-twocol'),
        rectoChapterStart: false,
        dropcaps: false,
        columns: 2
    },
    'sz-schreiben': {
        trimSize: '6x9',
        margins: getRecommendedMargins('6x9', 'sz-schreiben'),
        rectoChapterStart: false,
        dropcaps: false
    },
    'sz-novel': {
        trimSize: '6x9',
        margins: getRecommendedMargins('6x9', 'sz-novel'),
        rectoChapterStart: true,
        dropcaps: true
    },
    'sz-novella': {
        trimSize: '5.5x8.5',
        margins: getRecommendedMargins('5.5x8.5', 'sz-novella'),
        rectoChapterStart: true,
        dropcaps: false
    },
    'sz-textbook': {
        trimSize: 'a4',
        margins: getRecommendedMargins('a4', 'sz-textbook'),
        rectoChapterStart: false,
        dropcaps: false
    },
    'sz-poem': {
        trimSize: 'a5',
        margins: getRecommendedMargins('a5', 'sz-poem'),
        rectoChapterStart: false,
        dropcaps: false
    }
};
// ============ Validation Functions ============
export function isValidBookType(type) {
    return (typeof type === 'string' &&
        ['novel', 'textbook', 'novella', 'poetry', 'news-twocol',
         'sz-schreiben', 'sz-novel', 'sz-novella', 'sz-textbook', 'sz-poem'
        ].includes(type));
}
export function isValidTrimSize(size) {
    return (typeof size === 'string' &&
        ['5x8', '5.5x8.5', '6x9', 'a5', 'a4', 'letter'].includes(size));
}
export function isValidPrintProfile(profile) {
    return (typeof profile === 'string' &&
        ['kdp', 'tolino', 'generic'].includes(profile));
}
export function isValidEbookProfile(profile) {
    return (typeof profile === 'string' &&
        ['kdp-epub', 'kobo-epub', 'generic-epub'].includes(profile));
}
export function isValidMargins(margins) {
    if (typeof margins !== 'object' || margins === null) {
        return false;
    }
    const m = margins;
    return (typeof m.top === 'number' &&
        m.top > 0 &&
        typeof m.bottom === 'number' &&
        m.bottom > 0 &&
        typeof m.inner === 'number' &&
        m.inner > 0 &&
        typeof m.outer === 'number' &&
        m.outer > 0);
}
function cloneMargins(margins) {
    return {
        top: margins.top,
        bottom: margins.bottom,
        inner: margins.inner,
        outer: margins.outer
    };
}
export function getMeaningfulBookText(value, fallback) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed || fallback;
}
export function getRecommendedTrimSize(bookType) {
    return DEFAULT_TRIM_SIZE_BY_PROFILE[bookType];
}
export function getRecommendedMargins(trimSize, bookType) {
    if (bookType && PROFILE_MARGIN_OVERRIDES[bookType] && trimSize === DEFAULT_TRIM_SIZE_BY_PROFILE[bookType]) {
        return cloneMargins(PROFILE_MARGIN_OVERRIDES[bookType]);
    }
    return cloneMargins(DEFAULT_MARGINS[trimSize]);
}
/**
 * Validate entire BookConfig from TT_bookConfig field
 * Returns validation result with any missing/invalid fields
 */
export function validateBookConfig(config) {
    const errors = {};
    const missing = [];
    if (typeof config !== 'object' || config === null) {
        return {
            valid: false,
            missing: ['book_type', 'trim_size', 'margins'],
            errors: { root: 'TT_bookConfig muss ein Objekt sein' }
        };
    }
    const c = config;
    // Check critical fields
    if (!c.book_type) {
        missing.push('book_type');
        errors['book_type'] = 'Buchtyp ist erforderlich';
    }
    else if (!isValidBookType(c.book_type)) {
        errors['book_type'] = `Ungültiger Buchtyp: ${c.book_type}`;
    }
    if (!c.trim_size) {
        missing.push('trim_size');
        errors['trim_size'] = 'Seitengröße ist erforderlich';
    }
    else if (!isValidTrimSize(c.trim_size)) {
        errors['trim_size'] = `Ungültige Seitengröße: ${c.trim_size}`;
    }
    if (!c.margins) {
        missing.push('margins');
        errors['margins'] = 'Seitenränder sind erforderlich';
    }
    else if (!isValidMargins(c.margins)) {
        errors['margins'] = 'Ungültige Seitenränder (müssen alle > 0 sein)';
    }
    // Check optional fields
    if (c.print_profile && !isValidPrintProfile(c.print_profile)) {
        errors['print_profile'] = `Ungültiges Print-Profil: ${c.print_profile}`;
    }
    if (c.ebook_profile && !isValidEbookProfile(c.ebook_profile)) {
        errors['ebook_profile'] = `Ungültiges eBook-Profil: ${c.ebook_profile}`;
    }
    return {
        valid: Object.keys(errors).length === 0,
        missing,
        errors
    };
}
/**
 * Build normalized BookConfig from partial config
 * Fills in defaults where needed
 */
export function normalizeBookConfig(config) {
    const validation = validateBookConfig(config);
    if (!validation.valid && validation.missing.length > 0) {
        return null;
    }
    const c = config;
    const bookType = c.book_type;
    const trimSize = c.trim_size || getRecommendedTrimSize(bookType);
    return {
        book_type: bookType,
        trim_size: trimSize,
        print_profile: c.print_profile || 'generic',
        ebook_profile: c.ebook_profile || 'generic-epub',
        margins: isValidMargins(c.margins)
            ? cloneMargins(c.margins)
            : getRecommendedMargins(trimSize, bookType),
        cover: c.cover,
        isbn: c.isbn,
        license: c.license,
        epigraph: c.epigraph || undefined,
        dedication: c.dedication || undefined,
        // Cover-Metadaten fuer Insel-Stil-Generator (alle optional):
        band: typeof c.band === 'string' ? c.band.trim() : undefined,
        genre: typeof c.genre === 'string' ? c.genre.trim() : undefined,
        blurb: typeof c.blurb === 'string' ? c.blurb.trim() : undefined,
        cover_pattern: typeof c.cover_pattern === 'string' ? c.cover_pattern.trim() : undefined,
        features: {
            ...DEFAULT_FEATURES,
            ...c.features
        }
    };
}
/**
 * Check which critical fields are missing
 * Used by export dialog to determine if validation modal is needed
 */
export function getMissingCriticalFields(config) {
    if (typeof config !== 'object' || config === null) {
        return ['book_type', 'trim_size', 'margins'];
    }
    const c = config;
    const missing = [];
    if (!isValidBookType(c.book_type)) {
        missing.push('book_type');
    }
    if (!isValidTrimSize(c.trim_size)) {
        missing.push('trim_size');
    }
    if (!isValidMargins(c.margins)) {
        missing.push('margins');
    }
    return missing;
}
/**
 * Validate for IPC: check if frontmatter has sufficient config
 * Returns result needed by export-dialog.js
 */
export function validateForBookExport(metadata) {
    if (!metadata) {
        return {
            success: false,
            missing: ['book_type', 'trim_size', 'margins'],
            hasConfig: false
        };
    }
    const config = metadata.TT_bookConfig;
    const missing = getMissingCriticalFields(config);
    return {
        success: missing.length === 0,
        missing,
        hasConfig: !!config
    };
}
/**
 * Get default layout config for a given profile
 */
export function getDefaultLayout(bookType) {
    const defaults = DEFAULT_LAYOUT_BY_PROFILE[bookType];
    return {
        ...defaults,
        margins: cloneMargins(defaults.margins)
    };
}
/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(userConfig, bookType) {
    const defaults = getDefaultLayout(bookType);
    const trimSize = userConfig.trim_size || defaults.trimSize;
    const recommendedMargins = getRecommendedMargins(trimSize, bookType);
    const userMargins = isValidMargins(userConfig.margins)
        ? userConfig.margins
        : undefined;
    return {
        trimSize,
        margins: {
            top: (userMargins?.top ?? recommendedMargins.top ?? defaults.margins.top),
            bottom: (userMargins?.bottom ?? recommendedMargins.bottom ?? defaults.margins.bottom),
            inner: (userMargins?.inner ?? recommendedMargins.inner ?? defaults.margins.inner),
            outer: (userMargins?.outer ?? recommendedMargins.outer ?? defaults.margins.outer)
        },
        rectoChapterStart: userConfig.features?.recto_chapter_start ?? defaults.rectoChapterStart,
        dropcaps: userConfig.features?.dropcaps ?? defaults.dropcaps,
        columns: defaults.columns
    };
}
//# sourceMappingURL=frontmatter-schema.js.map