/**
 * EPUB3 Generator
 *
 * Converts BookIR into a valid EPUB3 file with semantic elements:
 * - Theorems, Definitions, Algorithms (for Textbook profile)
 * - Code blocks with syntax highlighting classes
 * - Poetry blocks with preserved line breaks
 * - Proper chapter structure (XHTML files)
 * - OPF manifest with metadata
 * - TOC (nav.xhtml + toc.ncx for legacy readers)
 */
import type { BookIR, Profile } from './types.js';
/**
 * Generate a complete EPUB3 file from a BookIR
 *
 * @param book The BookIR model
 * @param profile The profile (provides EPUB CSS)
 * @param outputPath Absolute path to write .epub file
 */
export declare function generateEpub(book: BookIR, profile: Profile, outputPath: string): Promise<void>;
