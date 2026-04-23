/**
 * Novella Profile
 *
 * Source: LiX Novella class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Short stories / novellas collection
 * - Trim: A5 (more compact than novel)
 * - Stories as chapters with own titles
 * - Optional separator page between stories
 * - Slightly smaller fonts (10-10.5pt)
 * - Inherits most behavior from Novel, but more compact
 */
import { BaseProfile } from './base-profile.js';
import type { BookIR, FontConfig } from '../types.js';
export declare class NovellaProfile extends BaseProfile {
    constructor();
    buildParagrafTemplate(book: BookIR, fonts: FontConfig): Promise<Record<string, any>>;
    buildEpubCss(book: BookIR): string;
}
