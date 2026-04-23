/**
 * Base Profile - Abstract parent class for all book profiles
 *
 * Profiles encapsulate the "recipes" from LiX:
 * - Novel, Textbook, Novella, Poetry, News-twocol
 *
 * Each concrete profile extends this and implements:
 * - buildParagrafTemplate(): JSON for Paragraf compile
 * - buildEpubCss(): CSS for EPUB styles
 */
import type { BookIR, Block, Profile, ProfileId, LayoutConfig, FontConfig, TrimSize } from '../types.js';
export declare const TRIM_SIZE_DIMENSIONS: Record<TrimSize, {
    width: string;
    height: string;
    widthMm: number;
    heightMm: number;
}>;
export declare abstract class BaseProfile implements Profile {
    id: ProfileId;
    displayName: string;
    defaultLayout: LayoutConfig;
    constructor(id: ProfileId, displayName: string, defaultLayout: LayoutConfig);
    /**
     * Must be implemented by each profile: build Paragraf template
     */
    abstract buildParagrafTemplate(book: BookIR, fonts: FontConfig): Promise<Record<string, any>>;
    /**
     * Generate EPUB CSS (can be overridden per profile)
     */
    buildEpubCss(book: BookIR): string;
    /**
     * Generate common frontmatter blocks (dedication, epigraph)
     * Used by profiles that render these sections before chapters
     */
    protected generateFrontmatterBlocks(book: BookIR): Block[];
    /**
     * Generate base EPUB CSS with common styling
     * Concrete profiles can append their specific styles
     */
    protected generateBaseCss(book: BookIR): string;
    /**
     * Build page size for Paragraf template
     */
    protected buildPageSize(trimSize: TrimSize): {
        width: string;
        height: string;
    };
    /**
     * Build page margins object for Paragraf
     * Note: Paragraf uses a single margins definition; we use inner/outer
     * by alternating per page (handled in template compilation)
     */
    protected buildMargins(layout: LayoutConfig): {
        top: string;
        bottom: string;
        left: string;
        right: string;
        mirror: boolean;
    };
    /**
     * Build base Paragraf styles shared across profiles
     */
    protected buildBaseStyles(fonts: FontConfig, layout: LayoutConfig): {
        body: {
            font: {
                family: string;
                size: number;
                weight: number;
            };
            alignment: string;
            lineHeight: number;
            hyphenate: boolean;
        };
        bodyBold: {
            font: {
                family: string;
                size: number;
                weight: number;
            };
            alignment: string;
            lineHeight: number;
        };
        heading1: {
            font: {
                family: string;
                size: number;
                weight: number;
            };
            alignment: string;
            lineHeight: number;
            spaceBefore: number;
            spaceAfter: number;
            pageBreakBefore: string;
        };
        heading2: {
            font: {
                family: string;
                size: number;
                weight: number;
            };
            alignment: string;
            lineHeight: number;
            spaceBefore: number;
            spaceAfter: number;
        };
        heading3: {
            font: {
                family: string;
                size: number;
                weight: number;
            };
            alignment: string;
            lineHeight: number;
            spaceBefore: number;
            spaceAfter: number;
        };
        heading4: {
            font: {
                family: string;
                size: number;
                weight: number;
            };
            alignment: string;
            lineHeight: number;
            spaceBefore: number;
            spaceAfter: number;
        };
        blockquote: {
            font: {
                family: string;
                size: number;
                weight: number;
                style: string;
            };
            alignment: string;
            lineHeight: number;
            marginLeft: number;
            marginRight: number;
            spaceBefore: number;
            spaceAfter: number;
        };
        code: {
            font: {
                family: string;
                size: number;
            };
            alignment: string;
            lineHeight: number;
            marginLeft: number;
            spaceBefore: number;
            spaceAfter: number;
        };
        epigraph: {
            font: {
                family: string;
                size: number;
                style: string;
            };
            alignment: string;
            lineHeight: number;
            spaceBefore: number;
            spaceAfter: number;
        };
        dedication: {
            font: {
                family: string;
                size: number;
                style: string;
            };
            alignment: string;
            lineHeight: number;
            spaceBefore: number;
            spaceAfter: number;
        };
    };
}
