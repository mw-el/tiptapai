/**
 * Poetry Profile
 *
 * Source: LiX Poem class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Trim: A5 or A6 (compact)
 * - Single column, NOT justified (preserve line breaks exactly)
 * - Line breaks matter (no word wrap)
 * - Decorative ornaments (corners/borders)
 * - Softer fonts (script or transitional serif for titles)
 * - Poetry blocks use type: 'poem' with lines array
 * - No chapter numbering usually
 */
import { BaseProfile } from './base-profile.js';
import type { BookIR, FontConfig } from '../types.js';
export declare class PoetryProfile extends BaseProfile {
    constructor();
    buildParagrafTemplate(book: BookIR, fonts: FontConfig): Promise<Record<string, any>>;
    buildEpubCss(book: BookIR): string;
}
