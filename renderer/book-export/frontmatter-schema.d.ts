/**
 * Frontmatter Schema Validation
 * Validates TT_bookConfig structure and provides defaults
 */
import type { BookType, TrimSize, PrintProfile, EbookProfile, BookConfig, BookFeatures, LayoutConfig, Margins, ValidationResult, BookExportValidation } from './types.js';
export declare const DEFAULT_MARGINS: Record<TrimSize, Margins>;
export declare const DEFAULT_TRIM_SIZE_BY_PROFILE: Record<BookType, TrimSize>;
export declare const DEFAULT_FEATURES: BookFeatures;
export declare const DEFAULT_LAYOUT_BY_PROFILE: Record<BookType, LayoutConfig>;
export declare function isValidBookType(type: unknown): type is BookType;
export declare function isValidTrimSize(size: unknown): size is TrimSize;
export declare function isValidPrintProfile(profile: unknown): profile is PrintProfile;
export declare function isValidEbookProfile(profile: unknown): profile is EbookProfile;
export declare function isValidMargins(margins: unknown): margins is Margins;
export declare function getRecommendedTrimSize(bookType: BookType): TrimSize;
export declare function getRecommendedMargins(trimSize: TrimSize, bookType?: BookType): Margins;
/**
 * Validate entire BookConfig from TT_bookConfig field
 * Returns validation result with any missing/invalid fields
 */
export declare function validateBookConfig(config: unknown): ValidationResult;
/**
 * Build normalized BookConfig from partial config
 * Fills in defaults where needed
 */
export declare function normalizeBookConfig(config: Partial<BookConfig>): BookConfig | null;
/**
 * Check which critical fields are missing
 * Used by export dialog to determine if validation modal is needed
 */
export declare function getMissingCriticalFields(config: unknown): string[];
/**
 * Validate for IPC: check if frontmatter has sufficient config
 * Returns result needed by export-dialog.js
 */
export declare function validateForBookExport(metadata: Record<string, unknown> | undefined): BookExportValidation;
/**
 * Get default layout config for a given profile
 */
export declare function getDefaultLayout(bookType: BookType): LayoutConfig;
/**
 * Merge user config with defaults
 */
export declare function mergeWithDefaults(userConfig: Partial<BookConfig>, bookType: BookType): LayoutConfig;
