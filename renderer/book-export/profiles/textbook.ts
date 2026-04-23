/**
 * Textbook Profile
 *
 * Source: LiX Textbook class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Trim: A4 (default) or 6x9" for academic
 * - Strong hierarchy: Chapter > Section > Subsection > Paragraph
 * - Numbered headings (secnumdepth ≥ 2)
 * - Semantic elements: theorems, definitions, algorithms, code
 * - Table of contents (TOC)
 * - Bibliography support
 * - Figure/Table captions
 */

import { BaseProfile } from './base-profile.js';
import type { BookIR, FontConfig } from '../types.js';

export class TextbookProfile extends BaseProfile {
  constructor() {
    super('textbook', 'Sachbuch / Lehrbuch', {
      trimSize: 'a4',
      margins: { top: 24, bottom: 30, inner: 28, outer: 20 },
      rectoChapterStart: true,
      dropcaps: false
    });
  }

  async buildParagrafTemplate(
    book: BookIR,
    fonts: FontConfig
  ): Promise<Record<string, any>> {
    const pageSize = this.buildPageSize(book.layout.trimSize);
    const margins = this.buildMargins(book.layout);
    const baseStyles = this.buildBaseStyles(fonts, book.layout);

    return {
      meta: {
        title: book.metadata.title,
        author: book.metadata.authors.map(a => a.name).join(', '),
        language: book.metadata.language,
        profile: 'textbook'
      },

      layout: {
        size: pageSize,
        margins,
        mirrorMargins: true,
        columns: 1
      },

      fonts: {
        serif: fonts.serif,
        sans: fonts.sansSerif,
        mono: fonts.monospace
      },

      styles: {
        ...baseStyles,

        // Textbook: larger body text
        body: {
          ...baseStyles.body,
          size: 11,
          lineHeight: 17,
          firstLineIndent: 0,
          spaceAfter: 6
        },

        // Numbered chapter heading
        heading1: {
          ...baseStyles.heading1,
          prefix: 'Kapitel ',
          numbering: 'arabic',
          pageBreakBefore: 'recto'
        },

        heading2: {
          ...baseStyles.heading2,
          numbering: 'chapter.arabic'
        },

        heading3: {
          ...baseStyles.heading3,
          numbering: 'chapter.section.arabic'
        },

        // Theorem box
        theorem: {
          font: {
            family: fonts.serif.italic || fonts.serif.regular,
            size: 10,
            style: 'italic'
          },
          alignment: 'justified',
          lineHeight: 14,
          background: '#fff7f7',
          borderLeft: { width: 3, color: '#c44' },
          padding: 8,
          marginLeft: 0,
          marginRight: 0,
          spaceBefore: 10,
          spaceAfter: 10
        },

        definition: {
          font: {
            family: fonts.serif.regular,
            size: 10
          },
          alignment: 'justified',
          lineHeight: 14,
          background: '#f7f7ff',
          borderLeft: { width: 3, color: '#448' },
          padding: 8,
          spaceBefore: 10,
          spaceAfter: 10
        },

        algorithm: {
          font: {
            family: fonts.monospace?.regular || fonts.serif.regular,
            size: 9
          },
          alignment: 'left',
          lineHeight: 13,
          background: '#f7fff7',
          borderLeft: { width: 3, color: '#484' },
          padding: 8,
          spaceBefore: 10,
          spaceAfter: 10
        },

        code: {
          ...baseStyles.code,
          size: 8.5,
          background: '#f4f4f4',
          padding: 8,
          spaceBefore: 8,
          spaceAfter: 8
        },

        figureCaption: {
          font: {
            family: fonts.sansSerif?.regular || fonts.serif.regular,
            size: 9
          },
          alignment: 'center',
          lineHeight: 12,
          color: '#555',
          spaceBefore: 4
        },

        tableCaption: {
          font: {
            family: fonts.sansSerif?.regular || fonts.serif.regular,
            size: 9,
            weight: 600
          },
          alignment: 'center',
          spaceBefore: 4,
          spaceAfter: 8
        }
      },

      pages: {
        titlePage: {
          enabled: true,
          recto: true,
          content: {
            title: { style: 'heading1', text: book.metadata.title },
            subtitle: book.metadata.subtitle
              ? { style: 'heading2', text: book.metadata.subtitle }
              : null,
            authors: {
              style: 'body',
              text: book.metadata.authors.map(a => a.name).join('\n')
            }
          }
        },

        formalPage: {
          enabled: true,
          recto: false,
          content: {
            copyright: book.metadata.license?.holder
              ? `© ${book.metadata.publishedYear || new Date().getFullYear()} ${book.metadata.license.holder}`
              : null,
            license: book.metadata.license,
            publisher: book.metadata.publisher,
            isbn: book.metadata.isbn?.print,
            edition: book.metadata.edition
          }
        },

        toc: {
          enabled: true,
          recto: true,
          title: 'Inhaltsverzeichnis',
          depth: 3
        }
      },

      runningHeads: {
        enabled: true,
        recto: { style: 'smallcaps', content: 'section' },
        verso: { style: 'smallcaps', content: 'chapter' }
      },

      pageNumbers: {
        enabled: true,
        position: 'bottom-outer'
      },

      chapters: {
        startOn: 'recto',
        numbering: 'arabic',
        prefix: 'Kapitel ',
        dropcap: false
      },

      content: {
        frontmatter: this.generateFrontmatterBlocks(book),
        chapters: book.chapters,
        backmatter: book.backmatter
      }
    };
  }

  buildEpubCss(book: BookIR): string {
    const base = super.buildEpubCss(book);

    return base + `
/* Textbook Profile Specific */

body {
  font-size: 1em;
  line-height: 1.6;
}

h1 {
  font-size: 1.8em;
  margin-top: 2em;
  page-break-before: always;
}

h2 {
  font-size: 1.4em;
  border-bottom: 1px solid #ccc;
  padding-bottom: 0.2em;
}

h3 {
  font-size: 1.2em;
  color: #333;
}

/* First paragraph after heading: no indent */
h1 + p, h2 + p, h3 + p, h4 + p {
  text-indent: 0;
}

/* Numbered headings counter */
body {
  counter-reset: chapter;
}

h1 {
  counter-reset: section;
  counter-increment: chapter;
}

h2 {
  counter-reset: subsection;
  counter-increment: section;
}

h3 {
  counter-increment: subsection;
}

/* Figures & Tables */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.9em;
}

table th, table td {
  border: 1px solid #aaa;
  padding: 0.5em 0.75em;
  text-align: left;
}

table th {
  background: #eee;
  font-weight: 700;
}

table caption {
  font-size: 0.9em;
  font-weight: 600;
  margin-bottom: 0.5em;
  text-align: left;
}
`;
  }
}
