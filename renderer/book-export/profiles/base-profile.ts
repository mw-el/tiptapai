/**
 * Base Profile - Abstract parent class for all book profiles
 *
 * Profiles encapsulate the "recipes" from LiX:
 * - Novel, Textbook, Novella, Poetry, News-twocol
 *
 * Each concrete profile extends this and implements:
 * - buildParagrafTemplate(): JSON for Paragraf compile
 * - buildEpubCss(): CSS for EPUB styles
 */

import type {
  BookIR,
  Block,
  Profile,
  ProfileId,
  LayoutConfig,
  FontConfig,
  TrimSize
} from '../types.js';

// ============ Trim Size → Physical Dimensions ============

export const TRIM_SIZE_DIMENSIONS: Record<TrimSize, { width: string; height: string; widthMm: number; heightMm: number }> = {
  '5x8': { width: '5in', height: '8in', widthMm: 127, heightMm: 203.2 },
  '6x9': { width: '6in', height: '9in', widthMm: 152.4, heightMm: 228.6 },
  'a5': { width: '148mm', height: '210mm', widthMm: 148, heightMm: 210 },
  'a4': { width: '210mm', height: '297mm', widthMm: 210, heightMm: 297 },
  'letter': { width: '8.5in', height: '11in', widthMm: 215.9, heightMm: 279.4 }
};

// ============ BaseProfile Abstract Class ============

export abstract class BaseProfile implements Profile {
  id: ProfileId;
  displayName: string;
  defaultLayout: LayoutConfig;

  constructor(
    id: ProfileId,
    displayName: string,
    defaultLayout: LayoutConfig
  ) {
    this.id = id;
    this.displayName = displayName;
    this.defaultLayout = defaultLayout;
  }

  /**
   * Must be implemented by each profile: build Paragraf template
   */
  abstract buildParagrafTemplate(
    book: BookIR,
    fonts: FontConfig
  ): Promise<Record<string, any>>;

  /**
   * Generate EPUB CSS (can be overridden per profile)
   */
  buildEpubCss(book: BookIR): string {
    return this.generateBaseCss(book);
  }

  // ============ Shared Helper Methods ============

  /**
   * Generate common frontmatter blocks (dedication, epigraph)
   * Used by profiles that render these sections before chapters
   */
  protected generateFrontmatterBlocks(book: BookIR): Block[] {
    const blocks: Block[] = [];

    if (book.metadata.dedication) {
      blocks.push({
        type: 'paragraph',
        text: book.metadata.dedication
      });
      blocks.push({ type: 'pagebreak' });
    }

    if (book.metadata.epigraph) {
      blocks.push({
        type: 'blockquote',
        text: book.metadata.epigraph
      });
      blocks.push({ type: 'pagebreak' });
    }

    return blocks;
  }

  /**
   * Generate base EPUB CSS with common styling
   * Concrete profiles can append their specific styles
   */
  protected generateBaseCss(book: BookIR): string {
    return `/* Base EPUB Styles - ${this.displayName} */
@namespace epub "http://www.idpf.org/2007/ops";

body {
  font-family: 'SourceSerif4', 'Georgia', 'Times New Roman', serif;
  font-size: 1em;
  line-height: 1.6;
  margin: 0;
  padding: 0.5em 1em;
  color: #222;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Inter', 'Helvetica Neue', 'Arial', sans-serif;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  page-break-after: avoid;
}

h1 {
  font-size: 1.8em;
  text-align: center;
  margin-top: 2em;
  page-break-before: always;
}

h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.1em; }

p {
  margin: 0;
  text-align: justify;
  text-indent: 1.5em;
  widows: 2;
  orphans: 2;
}

p:first-of-type,
h1 + p,
h2 + p,
h3 + p,
h4 + p,
.dropcap + p,
.no-indent {
  text-indent: 0;
}

/* Code Blocks (for Textbook profiles) */
pre.code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 0.85em;
  line-height: 1.4;
  background: #f4f4f4;
  border-left: 3px solid #888;
  padding: 0.75em 1em;
  margin: 1em 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  page-break-inside: avoid;
}

pre.code.language-typescript,
pre.code.language-javascript { border-left-color: #f7df1e; }
pre.code.language-python { border-left-color: #3776ab; }
pre.code.language-rust { border-left-color: #ce422b; }

code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 0.9em;
  background: #f4f4f4;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

/* Theorem Blocks */
section.theorem,
section.definition,
section.algorithm {
  margin: 1em 0;
  padding: 0.75em 1em;
  border-left: 4px solid;
  page-break-inside: avoid;
}

section.theorem {
  border-left-color: #c44;
  background: #fff7f7;
}

section.theorem::before {
  content: "Theorem";
  font-weight: 700;
  display: block;
  margin-bottom: 0.3em;
  color: #c44;
}

section.definition {
  border-left-color: #448;
  background: #f7f7ff;
}

section.definition::before {
  content: "Definition";
  font-weight: 700;
  display: block;
  margin-bottom: 0.3em;
  color: #448;
}

section.algorithm {
  border-left-color: #484;
  background: #f7fff7;
}

section.algorithm::before {
  content: "Algorithmus";
  font-weight: 700;
  display: block;
  margin-bottom: 0.3em;
  color: #484;
}

/* Blockquotes */
blockquote {
  margin: 1em 2em;
  padding: 0.5em 1em;
  border-left: 3px solid #ccc;
  font-style: italic;
  color: #555;
}

/* Poem Blocks */
div.poem {
  margin: 1.5em 1em;
  white-space: pre-line;
  text-align: left;
  text-indent: 0;
  font-family: 'SourceSerif4', serif;
}

div.poem p {
  text-indent: 0;
  margin: 0;
  text-align: left;
}

/* Images */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
}

figure {
  margin: 1em 0;
  page-break-inside: avoid;
}

figcaption {
  font-size: 0.9em;
  color: #666;
  text-align: center;
  margin-top: 0.5em;
  font-style: italic;
}

/* Math */
.math.display {
  display: block;
  margin: 1em auto;
  text-align: center;
}

/* Dedication & Epigraph */
.dedication,
.epigraph {
  text-align: center;
  font-style: italic;
  margin: 3em 2em;
  color: #444;
}

.dedication p,
.epigraph p {
  text-indent: 0;
  text-align: center;
}

/* Horizontal Rule */
hr {
  border: none;
  text-align: center;
  margin: 2em 0;
}

hr::after {
  content: "❦";
  font-size: 1.5em;
  color: #888;
}

/* Page Breaks */
.pagebreak {
  page-break-after: always;
}

/* TOC */
nav[epub|type="toc"] ol {
  list-style: none;
  padding-left: 0;
}

nav[epub|type="toc"] li {
  margin: 0.3em 0;
}

nav[epub|type="toc"] a {
  text-decoration: none;
  color: inherit;
}
`;
  }

  /**
   * Build page size for Paragraf template
   */
  protected buildPageSize(trimSize: TrimSize): { width: string; height: string } {
    const dims = TRIM_SIZE_DIMENSIONS[trimSize];
    return { width: dims.width, height: dims.height };
  }

  /**
   * Build page margins object for Paragraf
   * Note: Paragraf uses a single margins definition; we use inner/outer
   * by alternating per page (handled in template compilation)
   */
  protected buildMargins(layout: LayoutConfig) {
    const toMm = (n: number) => `${n}mm`;
    return {
      top: toMm(layout.margins.top),
      bottom: toMm(layout.margins.bottom),
      left: toMm(layout.margins.inner),
      right: toMm(layout.margins.outer),
      mirror: true
    };
  }

  /**
   * Build base Paragraf styles shared across profiles
   */
  protected buildBaseStyles(fonts: FontConfig, layout: LayoutConfig) {
    return {
      body: {
        font: {
          family: fonts.serif.regular,
          size: 11,
          weight: 400
        },
        alignment: 'justified',
        lineHeight: 16,
        hyphenate: true
      },
      bodyBold: {
        font: {
          family: fonts.serif.bold || fonts.serif.regular,
          size: 11,
          weight: 700
        },
        alignment: 'justified',
        lineHeight: 16
      },
      heading1: {
        font: {
          family: fonts.sansSerif?.bold || fonts.serif.bold || fonts.serif.regular,
          size: 24,
          weight: 700
        },
        alignment: 'center',
        lineHeight: 32,
        spaceBefore: 36,
        spaceAfter: 24,
        pageBreakBefore: layout.rectoChapterStart ? 'recto' : 'always'
      },
      heading2: {
        font: {
          family: fonts.sansSerif?.bold || fonts.serif.bold || fonts.serif.regular,
          size: 18,
          weight: 700
        },
        alignment: 'left',
        lineHeight: 24,
        spaceBefore: 20,
        spaceAfter: 12
      },
      heading3: {
        font: {
          family: fonts.sansSerif?.bold || fonts.serif.bold || fonts.serif.regular,
          size: 14,
          weight: 700
        },
        alignment: 'left',
        lineHeight: 20,
        spaceBefore: 16,
        spaceAfter: 8
      },
      heading4: {
        font: {
          family: fonts.sansSerif?.regular || fonts.serif.regular,
          size: 12,
          weight: 600
        },
        alignment: 'left',
        lineHeight: 16,
        spaceBefore: 12,
        spaceAfter: 6
      },
      blockquote: {
        font: {
          family: fonts.serif.italic || fonts.serif.regular,
          size: 10,
          weight: 400,
          style: 'italic'
        },
        alignment: 'left',
        lineHeight: 14,
        marginLeft: 24,
        marginRight: 24,
        spaceBefore: 8,
        spaceAfter: 8
      },
      code: {
        font: {
          family: fonts.monospace?.regular || 'Courier',
          size: 9
        },
        alignment: 'left',
        lineHeight: 12,
        marginLeft: 12,
        spaceBefore: 6,
        spaceAfter: 6
      },
      epigraph: {
        font: {
          family: fonts.serif.italic || fonts.serif.regular,
          size: 11,
          style: 'italic'
        },
        alignment: 'center',
        lineHeight: 16,
        spaceBefore: 24,
        spaceAfter: 24
      },
      dedication: {
        font: {
          family: fonts.serif.italic || fonts.serif.regular,
          size: 12,
          style: 'italic'
        },
        alignment: 'center',
        lineHeight: 18,
        spaceBefore: 48,
        spaceAfter: 48
      }
    };
  }
}
