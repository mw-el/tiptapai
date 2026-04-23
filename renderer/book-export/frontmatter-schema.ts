/**
 * Frontmatter Schema Validation
 * Validates TT_bookConfig structure and provides defaults
 */

import type {
  BookType,
  TrimSize,
  PrintProfile,
  EbookProfile,
  BookConfig,
  BookFeatures,
  LayoutConfig,
  Margins,
  ValidationResult,
  BookExportValidation
} from './types.js';

// ============ Default Configurations ============

export const DEFAULT_MARGINS: Record<TrimSize, Margins> = {
  '5x8': { top: 18, bottom: 24, inner: 22, outer: 16 },
  '6x9': { top: 20, bottom: 26, inner: 24, outer: 18 },
  'a5': { top: 18, bottom: 24, inner: 22, outer: 16 },
  'a4': { top: 24, bottom: 30, inner: 28, outer: 20 },
  'letter': { top: 22, bottom: 28, inner: 28, outer: 20 }
};

export const DEFAULT_TRIM_SIZE_BY_PROFILE: Record<BookType, TrimSize> = {
  novel: '5x8',
  textbook: 'a4',
  novella: 'a5',
  poetry: 'a5',
  'news-twocol': 'a4'
};

const PROFILE_MARGIN_OVERRIDES: Partial<Record<BookType, Margins>> = {
  'news-twocol': { top: 18, bottom: 22, inner: 16, outer: 16 }
};

export const DEFAULT_FEATURES: BookFeatures = {
  dropcaps: true,
  recto_chapter_start: true,
  auto_toc: true,
  force_recto_blank: false
};

export const DEFAULT_LAYOUT_BY_PROFILE: Record<BookType, LayoutConfig> = {
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
  }
};

// ============ Validation Functions ============

export function isValidBookType(type: unknown): type is BookType {
  return (
    typeof type === 'string' &&
    ['novel', 'textbook', 'novella', 'poetry', 'news-twocol'].includes(type)
  );
}

export function isValidTrimSize(size: unknown): size is TrimSize {
  return (
    typeof size === 'string' &&
    ['5x8', '6x9', 'a5', 'a4', 'letter'].includes(size)
  );
}

export function isValidPrintProfile(profile: unknown): profile is PrintProfile {
  return (
    typeof profile === 'string' &&
    ['kdp', 'tolino', 'generic'].includes(profile)
  );
}

export function isValidEbookProfile(profile: unknown): profile is EbookProfile {
  return (
    typeof profile === 'string' &&
    ['kdp-epub', 'kobo-epub', 'generic-epub'].includes(profile)
  );
}

export function isValidMargins(margins: unknown): margins is Margins {
  if (typeof margins !== 'object' || margins === null) {
    return false;
  }

  const m = margins as Record<string, unknown>;

  return (
    typeof m.top === 'number' &&
    m.top > 0 &&
    typeof m.bottom === 'number' &&
    m.bottom > 0 &&
    typeof m.inner === 'number' &&
    m.inner > 0 &&
    typeof m.outer === 'number' &&
    m.outer > 0
  );
}

function cloneMargins(margins: Margins): Margins {
  return {
    top: margins.top,
    bottom: margins.bottom,
    inner: margins.inner,
    outer: margins.outer
  };
}

export function getRecommendedTrimSize(bookType: BookType): TrimSize {
  return DEFAULT_TRIM_SIZE_BY_PROFILE[bookType];
}

export function getRecommendedMargins(
  trimSize: TrimSize,
  bookType?: BookType
): Margins {
  if (bookType && PROFILE_MARGIN_OVERRIDES[bookType] && trimSize === DEFAULT_TRIM_SIZE_BY_PROFILE[bookType]) {
    return cloneMargins(PROFILE_MARGIN_OVERRIDES[bookType]!);
  }

  return cloneMargins(DEFAULT_MARGINS[trimSize]);
}

/**
 * Validate entire BookConfig from TT_bookConfig field
 * Returns validation result with any missing/invalid fields
 */
export function validateBookConfig(config: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  const missing: string[] = [];

  if (typeof config !== 'object' || config === null) {
    return {
      valid: false,
      missing: ['book_type', 'trim_size', 'margins'],
      errors: { root: 'TT_bookConfig muss ein Objekt sein' }
    };
  }

  const c = config as Record<string, unknown>;

  // Check critical fields

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
export function normalizeBookConfig(
  config: Partial<BookConfig>
): BookConfig | null {
  const validation = validateBookConfig(config);

  if (!validation.valid && validation.missing.length > 0) {
    return null;
  }

  const c = config as Record<string, unknown>;
  const bookType = c.book_type as BookType;
  const trimSize = (c.trim_size as TrimSize) || getRecommendedTrimSize(bookType);

  return {
    book_type: bookType,
    trim_size: trimSize,
    print_profile: (c.print_profile as PrintProfile) || 'generic',
    ebook_profile: (c.ebook_profile as EbookProfile) || 'generic-epub',
    margins: isValidMargins(c.margins)
      ? cloneMargins(c.margins as Margins)
      : getRecommendedMargins(trimSize, bookType),
    cover: c.cover as any,
    isbn: c.isbn as any,
    license: c.license as any,
    epigraph: (c.epigraph as string) || undefined,
    dedication: (c.dedication as string) || undefined,
    features: {
      ...DEFAULT_FEATURES,
      ...(c.features as Partial<BookFeatures>)
    }
  };
}

/**
 * Check which critical fields are missing
 * Used by export dialog to determine if validation modal is needed
 */
export function getMissingCriticalFields(
  config: unknown
): string[] {
  if (typeof config !== 'object' || config === null) {
    return ['book_type', 'trim_size', 'margins'];
  }

  const c = config as Record<string, unknown>;
  const missing: string[] = [];

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
export function validateForBookExport(
  metadata: Record<string, unknown> | undefined
): BookExportValidation {
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
export function getDefaultLayout(bookType: BookType): LayoutConfig {
  const defaults = DEFAULT_LAYOUT_BY_PROFILE[bookType];

  return {
    ...defaults,
    margins: cloneMargins(defaults.margins)
  };
}

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(
  userConfig: Partial<BookConfig>,
  bookType: BookType
): LayoutConfig {
  const defaults = getDefaultLayout(bookType);
  const trimSize = (userConfig.trim_size as TrimSize) || defaults.trimSize;
  const recommendedMargins = getRecommendedMargins(trimSize, bookType);
  const userMargins = isValidMargins(userConfig.margins)
    ? userConfig.margins
    : undefined;

  return {
    trimSize,
    margins: {
      top: (userMargins?.top ?? recommendedMargins.top ?? defaults.margins.top) as number,
      bottom: (userMargins?.bottom ?? recommendedMargins.bottom ?? defaults.margins.bottom) as number,
      inner: (userMargins?.inner ?? recommendedMargins.inner ?? defaults.margins.inner) as number,
      outer: (userMargins?.outer ?? recommendedMargins.outer ?? defaults.margins.outer) as number
    },
    rectoChapterStart:
      userConfig.features?.recto_chapter_start ?? defaults.rectoChapterStart,
    dropcaps: userConfig.features?.dropcaps ?? defaults.dropcaps,
    columns: defaults.columns
  };
}
