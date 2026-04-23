/**
 * Paragraf PDF Engine Wrapper
 *
 * Wraps @paragraf/compile to produce print-ready PDF from BookIR.
 *
 * Uses:
 * - @paragraf/compile: High-level API (template + data → PDF)
 * - Knuth-Plass optimal line breaking
 * - HarfBuzz OpenType shaping (via rustybuzz WASM)
 * - Optical margin alignment (two-phase reflow)
 * - Multi-frame layout with baseline grid
 * - ICC colour management for print
 */
import type { BookIR, Profile, FontConfig } from './types.js';
/**
 * Compile a BookIR into a print-ready PDF using the profile's Paragraf template.
 *
 * @returns PDF as Buffer
 */
export declare function compilePrintPdf(book: BookIR, profile: Profile, fonts: FontConfig): Promise<Buffer>;
/**
 * Check if Paragraf is installed and available
 */
export declare function isParagrafAvailable(): Promise<boolean>;
