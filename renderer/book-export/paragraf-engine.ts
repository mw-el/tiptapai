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

import type { BookIR, Profile, FontConfig, Block, Chapter } from './types.js';

// Dynamic import wrapper for @paragraf/compile
// Note: Paragraf is Node-only, will be called from main process
type ParagrafCompileFn = (
  template: any,
  options: {
    data?: any;
    fonts?: any;
    output?: 'pdf' | 'svg' | 'document';
  }
) => Promise<{ data: Buffer | Uint8Array; format: string }>;

type ParagrafModule = {
  defineTemplate: (template: any) => any;
  compile: ParagrafCompileFn;
};

let paragrafModule: ParagrafModule | null = null;

async function loadParagraf(): Promise<ParagrafModule> {
  if (paragrafModule) return paragrafModule;

  try {
    // Dynamic import for Node.js environment
    const mod = await import('@paragraf/compile' as any);
    paragrafModule = mod as ParagrafModule;
    return paragrafModule;
  } catch (error) {
    throw new Error(
      `Paragraf nicht verfügbar: ${(error as Error).message}. ` +
      `Bitte sicherstellen, dass die Paragraf-Packages installiert sind (npm install).`
    );
  }
}

// ============ Main Entry Point ============

/**
 * Compile a BookIR into a print-ready PDF using the profile's Paragraf template.
 *
 * @returns PDF as Buffer
 */
export async function compilePrintPdf(
  book: BookIR,
  profile: Profile,
  fonts: FontConfig
): Promise<Buffer> {
  const paragraf = await loadParagraf();

  try {
    // 1. Build the template from the profile
    const template = await profile.buildParagrafTemplate(book, fonts);

    // 2. Prepare data object for template slots
    const data = buildTemplateData(book);

    // 3. Compile via Paragraf
    const result = await paragraf.compile(template, {
      data,
      fonts: buildParagrafFonts(fonts),
      output: 'pdf'
    });

    return Buffer.isBuffer(result.data)
      ? result.data
      : Buffer.from(result.data);
  } catch (error) {
    throw new Error(
      `Paragraf-Kompilierung fehlgeschlagen: ${(error as Error).message}`
    );
  }
}

// ============ Data Preparation ============

/**
 * Transform BookIR into data object suitable for Paragraf template slots
 */
function buildTemplateData(book: BookIR): Record<string, any> {
  return {
    // Meta
    title: book.metadata.title,
    subtitle: book.metadata.subtitle,
    authors: book.metadata.authors,
    authorsString: book.metadata.authors.map(a => a.name).join(', '),
    language: book.metadata.language,

    // Publishing
    edition: book.metadata.edition,
    publishedYear: book.metadata.publishedYear,
    publisher: book.metadata.publisher,
    imprint: book.metadata.imprint,

    // Legal
    license: book.metadata.license,
    licenseString: buildLicenseString(book.metadata.license),
    isbn: book.metadata.isbn,
    copyright: buildCopyrightString(book.metadata),

    // Decorative
    epigraph: book.metadata.epigraph,
    dedication: book.metadata.dedication,

    // Cover
    cover: book.metadata.cover,

    // Content
    frontmatter: book.frontmatter.map(renderBlockToParagrafInput),
    chapters: book.chapters.map(ch => ({
      title: ch.title,
      number: ch.number,
      blocks: ch.blocks.map(renderBlockToParagrafInput)
    })),
    backmatter: book.backmatter.map(renderBlockToParagrafInput)
  };
}

/**
 * Convert BookIR Block → Paragraf input format
 * Each block becomes a paragraph or layout element
 */
function renderBlockToParagrafInput(block: Block): Record<string, any> {
  switch (block.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        style: 'body',
        text: block.text
      };

    case 'heading':
      return {
        type: 'paragraph',
        style: `heading${block.level}`,
        text: block.text
      };

    case 'image':
      return {
        type: 'image',
        src: block.path,
        alt: block.alt
      };

    case 'code':
      return {
        type: 'paragraph',
        style: 'code',
        text: block.code,
        language: block.language,
        preserveWhitespace: true
      };

    case 'math':
      return {
        type: 'math',
        display: block.display,
        content: block.content,
        style: block.display ? 'mathDisplay' : 'mathInline'
      };

    case 'blockquote':
      return {
        type: 'paragraph',
        style: 'blockquote',
        text: block.text
      };

    case 'theorem':
      return {
        type: 'paragraph',
        style: 'theorem',
        text: block.content,
        title: block.title
      };

    case 'definition':
      return {
        type: 'paragraph',
        style: 'definition',
        text: `${block.term}: ${block.definition}`
      };

    case 'algorithm':
      return {
        type: 'paragraph',
        style: 'algorithm',
        text: block.steps.join('\n'),
        title: block.title,
        preserveWhitespace: true
      };

    case 'poem':
      return {
        type: 'paragraph',
        style: 'poemLine',
        text: block.lines.join('\n'),
        preserveWhitespace: true
      };

    case 'hr':
      return { type: 'separator' };

    case 'pagebreak':
      return { type: 'pagebreak' };

    default:
      return {
        type: 'paragraph',
        style: 'body',
        text: (block as any).text || ''
      };
  }
}

// ============ Font Configuration for Paragraf ============

/**
 * Transform our FontConfig into Paragraf's expected format
 */
function buildParagrafFonts(fonts: FontConfig): Record<string, any> {
  const result: Record<string, any> = {};

  // Serif family (body)
  if (fonts.serif) {
    result['SourceSerif'] = {
      regular: fonts.serif.regular,
      bold: fonts.serif.bold,
      italic: fonts.serif.italic,
      boldItalic: fonts.serif.boldItalic
    };
  }

  // Sans-serif family (headings)
  if (fonts.sansSerif) {
    result['Inter'] = {
      regular: fonts.sansSerif.regular,
      bold: fonts.sansSerif.bold,
      italic: fonts.sansSerif.italic
    };
  }

  // Monospace (code)
  if (fonts.monospace) {
    result['Mono'] = {
      regular: fonts.monospace.regular,
      bold: fonts.monospace.bold
    };
  }

  return result;
}

// ============ Legal String Builders ============

function buildLicenseString(license?: BookIR['metadata']['license']): string {
  if (!license) return '';

  if (license.type === 'CC') {
    const modifiers = license.modifiers.map(m => m.toUpperCase()).join('-');
    return `CC ${modifiers} ${license.version}`;
  }

  if (license.type === 'MIT') return 'MIT License';
  if (license.type === 'GPL') return `GPL ${license.version}`;
  if (license.type === 'All-Rights-Reserved') return 'Alle Rechte vorbehalten';

  return license.type;
}

function buildCopyrightString(metadata: BookIR['metadata']): string {
  const year = metadata.publishedYear || new Date().getFullYear();
  const holder = metadata.license?.holder ||
                 metadata.authors.map(a => a.name).join(', ');
  return `© ${year} ${holder}`;
}

// ============ Availability Check ============

/**
 * Check if Paragraf is installed and available
 */
export async function isParagrafAvailable(): Promise<boolean> {
  try {
    await loadParagraf();
    return true;
  } catch {
    return false;
  }
}
