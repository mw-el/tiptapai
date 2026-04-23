/**
 * Markdown → BookIR Parser
 *
 * Converts markdown content + YAML frontmatter into the BookIR model.
 *
 * Approach: Regex-based parsing (fast, debuggable)
 * Supports:
 * - Headings (h1-h4)
 * - Code blocks (fenced ```)
 * - Images (![alt](path))
 * - Blockquotes (> ...)
 * - Paragraphs
 * - Horizontal rules (---)
 * - Poem blocks (::: poem ... :::)
 * - Theorem/Definition/Algorithm blocks (::: theorem ... :::)
 */
import type { BookIR, BookType } from './types.js';
export interface ParseOptions {
    basePath: string;
    metadata: Record<string, unknown>;
    profileId?: BookType;
}
/**
 * Parse markdown content (without frontmatter) into BookIR
 *
 * @param markdown The markdown content (should NOT include frontmatter ---)
 * @param options Base path for asset resolution, metadata, profile
 */
export declare function parseMarkdownToBookIR(markdown: string, options: ParseOptions): BookIR;
/**
 * Parse a complete markdown file content (with frontmatter)
 * and build the BookIR. Frontmatter should already be parsed and passed in.
 */
export declare function buildBookIR(markdownContent: string, frontmatter: Record<string, unknown>, basePath: string, profileId?: BookType): BookIR;
