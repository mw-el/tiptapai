/**
 * Novel Profile
 *
 * Source: LiX Novel class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Trim: 5x8" (default), single column
 * - Recto chapter starts (traditional Western bookbinding)
 * - Justified text with hyphenation
 * - Dropcaps on first paragraph of chapters
 * - First paragraph of chapter: no indent
 * - Following paragraphs: first-line indent (1.5em)
 * - Frontmatter: Cover, title, formal page, dedication, epigraph
 */
import { BaseProfile } from './base-profile.js';
import type { BookIR, FontConfig } from '../types.js';
export declare class NovelProfile extends BaseProfile {
    constructor();
    buildParagrafTemplate(book: BookIR, fonts: FontConfig): Promise<Record<string, any>>;
    buildEpubCss(book: BookIR): string;
}
