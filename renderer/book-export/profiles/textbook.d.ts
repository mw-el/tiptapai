/**
 * Textbook Profile
 *
 * Source: LiX Textbook class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Trim: A4 (default) or 6x9" for academic
 * - Strong hierarchy: Chapter > Section > Subsection > Paragraph
 * - Numbered headings (secnumdepth ≥ 2)
 * - Semantic elements: theorems, definitions, algorithms, code
 * - Table of contents (TOC)
 * - Bibliography support
 * - Figure/Table captions
 */
import { BaseProfile } from './base-profile.js';
import type { BookIR, FontConfig } from '../types.js';
export declare class TextbookProfile extends BaseProfile {
    constructor();
    buildParagrafTemplate(book: BookIR, fonts: FontConfig): Promise<Record<string, any>>;
    buildEpubCss(book: BookIR): string;
}
