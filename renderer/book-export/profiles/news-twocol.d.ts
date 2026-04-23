/**
 * News / Two-Column Profile
 *
 * Source: LiX News class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Newspaper/periodical two-column layout
 * - Trim: A4 or similar large format
 * - 2 columns per page (frames in Paragraf)
 * - Periodical metadata: Price, Issue, Volume, Location
 * - Masthead (newspaper header)
 * - Articles as chapters
 * - Multiple headline hierarchy
 */
import { BaseProfile } from './base-profile.js';
import type { BookIR, FontConfig } from '../types.js';
export declare class NewsTwoColProfile extends BaseProfile {
    constructor();
    buildParagrafTemplate(book: BookIR, fonts: FontConfig): Promise<Record<string, any>>;
    buildEpubCss(book: BookIR): string;
}
