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

import * as path from 'path';
import type {
  BookIR,
  BookMetadata,
  LayoutConfig,
  Chapter,
  Block,
  BookType,
  TrimSize,
  Author,
  ParagraphBlock,
  HeadingBlock,
  ImageBlock,
  CodeBlock,
  BlockquoteBlock,
  TheoremBlock,
  DefinitionBlock,
  AlgorithmBlock,
  PoemBlock,
  HrBlock,
  PagebreakBlock,
  MathBlock
} from './types.js';
import { mergeWithDefaults } from './frontmatter-schema.js';

// ============ Directive Block Regex ============

const FENCED_DIRECTIVE_RE = /^:::\s*(\w+)(?:\s+(.+))?$/;
const CODE_FENCE_RE = /^```(\w*)\s*$/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const HEADING_RE = /^(#{1,4})\s+(.+)$/;
const HR_RE = /^(---|\*\*\*|___)\s*$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const PAGEBREAK_MARKER = /^\s*<!--\s*pagebreak\s*-->\s*$/i;

// ============ Main Parser Entry Point ============

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
export function parseMarkdownToBookIR(
  markdown: string,
  options: ParseOptions
): BookIR {
  const bookConfig = (options.metadata as any).TT_bookConfig || {};
  const bookType: BookType = options.profileId || bookConfig.book_type || 'novel';

  const metadata = buildMetadata(options.metadata, bookType);
  const layout = buildLayout(bookConfig, bookType);

  const { frontmatterBlocks, chapters, backmatterBlocks } = parseContent(
    markdown,
    options.basePath
  );

  return {
    metadata,
    layout,
    frontmatter: frontmatterBlocks,
    chapters,
    backmatter: backmatterBlocks
  };
}

// ============ Metadata Building ============

function buildMetadata(
  frontmatter: Record<string, unknown>,
  bookType: BookType
): BookMetadata {
  const config = (frontmatter.TT_bookConfig as any) || {};

  return {
    title: (frontmatter.title as string) || 'Untitled',
    subtitle: frontmatter.subtitle as string | undefined,
    authors: parseAuthors(frontmatter.authors || frontmatter.author),
    language: (frontmatter.language as string) || 'de-DE',
    bookType,
    edition: frontmatter.edition as number | undefined,
    publishedYear: (frontmatter.publishedYear || frontmatter.published_year || frontmatter.year) as number | undefined,
    publisher: frontmatter.publisher as string | undefined,
    imprint: parseImprint(frontmatter.imprint),

    license: config.license,
    isbn: config.isbn,
    cover: config.cover,
    epigraph: config.epigraph,
    dedication: config.dedication
  };
}

function parseAuthors(raw: unknown): Author[] {
  if (!raw) return [{ name: 'Unknown' }];

  if (Array.isArray(raw)) {
    return raw.map((a: any) => {
      if (typeof a === 'string') return { name: a };
      return { name: a.name || 'Unknown', email: a.email };
    });
  }

  if (typeof raw === 'string') {
    return [{ name: raw }];
  }

  if (typeof raw === 'object') {
    const a = raw as any;
    return [{ name: a.name || 'Unknown', email: a.email }];
  }

  return [{ name: 'Unknown' }];
}

function parseImprint(raw: unknown) {
  if (!raw) return undefined;
  if (typeof raw === 'string') return { name: raw };
  if (typeof raw === 'object') return raw as any;
  return undefined;
}

// ============ Layout Building ============

function buildLayout(
  bookConfig: Record<string, unknown>,
  bookType: BookType
): LayoutConfig {
  return mergeWithDefaults(bookConfig as any, bookType);
}

// ============ Content Parsing ============

interface ParsedContent {
  frontmatterBlocks: Block[];
  chapters: Chapter[];
  backmatterBlocks: Block[];
}

function parseContent(markdown: string, basePath: string): ParsedContent {
  const lines = markdown.split('\n');
  const chapters: Chapter[] = [];
  const frontmatterBlocks: Block[] = [];
  const backmatterBlocks: Block[] = [];

  let currentChapter: { title: string; number: number; blocks: Block[] } | null = null;
  let chapterNumber = 0;
  let inBackmatter = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      i++;
      continue;
    }

    // Page break marker
    if (PAGEBREAK_MARKER.test(line)) {
      pushBlock(currentChapter, frontmatterBlocks, { type: 'pagebreak' });
      i++;
      continue;
    }

    // Fenced directive block (:::)
    const directiveMatch = trimmed.match(FENCED_DIRECTIVE_RE);
    if (directiveMatch) {
      const [, directive, title] = directiveMatch;
      const { block, nextIndex } = parseFencedDirective(
        lines,
        i,
        directive,
        title,
        basePath
      );
      if (block) {
        pushBlock(currentChapter, frontmatterBlocks, block);
      }
      i = nextIndex;
      continue;
    }

    // Code block (```)
    const codeMatch = trimmed.match(CODE_FENCE_RE);
    if (codeMatch) {
      const { block, nextIndex } = parseCodeBlock(lines, i, codeMatch[1]);
      pushBlock(currentChapter, frontmatterBlocks, block);
      i = nextIndex;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      const text = headingMatch[2].trim();

      // h1 starts a new chapter
      if (level === 1) {
        // Save previous chapter
        if (currentChapter && currentChapter.blocks.length > 0) {
          chapters.push({
            title: currentChapter.title,
            number: currentChapter.number,
            blocks: currentChapter.blocks
          });
        }

        chapterNumber++;
        currentChapter = {
          title: text,
          number: chapterNumber,
          blocks: []
        };
        i++;
        continue;
      }

      // h2-h4 inside chapter
      const block: HeadingBlock = { type: 'heading', level, text };
      pushBlock(currentChapter, frontmatterBlocks, block);
      i++;
      continue;
    }

    // Image
    const imageMatch = trimmed.match(IMAGE_RE);
    if (imageMatch) {
      const [, alt, imgPath] = imageMatch;
      const block: ImageBlock = {
        type: 'image',
        alt,
        path: resolveAssetPath(imgPath, basePath)
      };
      pushBlock(currentChapter, frontmatterBlocks, block);
      i++;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(trimmed)) {
      const block: HrBlock = { type: 'hr' };
      pushBlock(currentChapter, frontmatterBlocks, block);
      i++;
      continue;
    }

    // Blockquote
    if (BLOCKQUOTE_RE.test(line)) {
      const { block, nextIndex } = parseBlockquote(lines, i);
      pushBlock(currentChapter, frontmatterBlocks, block);
      i = nextIndex;
      continue;
    }

    // Default: paragraph (can span multiple lines)
    const { block, nextIndex } = parseParagraph(lines, i);
    pushBlock(currentChapter, frontmatterBlocks, block);
    i = nextIndex;
  }

  // Save last chapter
  if (currentChapter && currentChapter.blocks.length > 0) {
    chapters.push({
      title: currentChapter.title,
      number: currentChapter.number,
      blocks: currentChapter.blocks
    });
  }

  return { frontmatterBlocks, chapters, backmatterBlocks };
}

/**
 * Push block to currentChapter if exists, else to frontmatterBlocks
 */
function pushBlock(
  currentChapter: { blocks: Block[] } | null,
  frontmatterBlocks: Block[],
  block: Block
) {
  if (currentChapter) {
    currentChapter.blocks.push(block);
  } else {
    frontmatterBlocks.push(block);
  }
}

// ============ Block-Specific Parsers ============

function parseCodeBlock(
  lines: string[],
  startIndex: number,
  language: string
): { block: CodeBlock; nextIndex: number } {
  let code = '';
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      return {
        block: {
          type: 'code',
          language: language || 'text',
          code: code.replace(/\n$/, '')
        },
        nextIndex: i + 1
      };
    }
    code += line + '\n';
    i++;
  }

  // No closing fence - treat as unterminated
  return {
    block: { type: 'code', language: language || 'text', code },
    nextIndex: i
  };
}

function parseFencedDirective(
  lines: string[],
  startIndex: number,
  directive: string,
  title: string | undefined,
  basePath: string
): { block: Block | null; nextIndex: number } {
  let content = '';
  let i = startIndex + 1;

  while (i < lines.length) {
    if (lines[i].trim() === ':::') {
      // Build appropriate block
      const block = buildDirectiveBlock(directive, title, content.trim());
      return { block, nextIndex: i + 1 };
    }
    content += lines[i] + '\n';
    i++;
  }

  return { block: null, nextIndex: i };
}

function buildDirectiveBlock(
  directive: string,
  title: string | undefined,
  content: string
): Block | null {
  switch (directive.toLowerCase()) {
    case 'poem':
      return {
        type: 'poem',
        lines: content.split('\n')
      } as PoemBlock;

    case 'theorem':
      return {
        type: 'theorem',
        title,
        content
      } as TheoremBlock;

    case 'definition': {
      // Format: term :: definition OR just content
      const parts = content.split('::');
      if (parts.length >= 2) {
        return {
          type: 'definition',
          term: parts[0].trim(),
          definition: parts.slice(1).join('::').trim()
        } as DefinitionBlock;
      }
      return {
        type: 'definition',
        term: title || 'Definition',
        definition: content
      } as DefinitionBlock;
    }

    case 'algorithm':
      return {
        type: 'algorithm',
        title,
        steps: content.split('\n').filter(l => l.trim())
      } as AlgorithmBlock;

    case 'math':
      return {
        type: 'math',
        display: true,
        content
      } as MathBlock;

    default:
      // Unknown directive: fallback to paragraph
      return {
        type: 'paragraph',
        text: content
      } as ParagraphBlock;
  }
}

function parseBlockquote(
  lines: string[],
  startIndex: number
): { block: BlockquoteBlock; nextIndex: number } {
  let text = '';
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(BLOCKQUOTE_RE);
    if (!match) break;
    text += match[1] + '\n';
    i++;
  }

  return {
    block: { type: 'blockquote', text: text.trim() },
    nextIndex: i
  };
}

function parseParagraph(
  lines: string[],
  startIndex: number
): { block: ParagraphBlock; nextIndex: number } {
  let text = '';
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop at empty line or other block elements
    if (!trimmed) break;
    if (HEADING_RE.test(trimmed)) break;
    if (BLOCKQUOTE_RE.test(line)) break;
    if (FENCED_DIRECTIVE_RE.test(trimmed)) break;
    if (CODE_FENCE_RE.test(trimmed)) break;
    if (IMAGE_RE.test(trimmed)) break;
    if (HR_RE.test(trimmed)) break;
    if (PAGEBREAK_MARKER.test(line)) break;

    text += (text ? ' ' : '') + trimmed;
    i++;
  }

  return {
    block: { type: 'paragraph', text: text.trim() },
    nextIndex: i
  };
}

// ============ Asset Path Resolution ============

function resolveAssetPath(assetPath: string, basePath: string): string {
  if (!assetPath) return '';

  // Absolute path (POSIX or Windows)
  if (path.isAbsolute(assetPath)) {
    return assetPath;
  }

  // Relative path: resolve against basePath (markdown file's directory)
  return path.resolve(basePath, assetPath);
}

// ============ Convenience Export ============

/**
 * Parse a complete markdown file content (with frontmatter)
 * and build the BookIR. Frontmatter should already be parsed and passed in.
 */
export function buildBookIR(
  markdownContent: string,
  frontmatter: Record<string, unknown>,
  basePath: string,
  profileId?: BookType
): BookIR {
  return parseMarkdownToBookIR(markdownContent, {
    basePath,
    metadata: frontmatter,
    profileId
  });
}
