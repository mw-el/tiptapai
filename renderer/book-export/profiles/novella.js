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
export class NovellaProfile extends BaseProfile {
    constructor() {
        super('novella', 'Novelle / Kurzgeschichte', {
            trimSize: 'a5',
            margins: { top: 18, bottom: 24, inner: 22, outer: 16 },
            rectoChapterStart: true,
            dropcaps: true
        });
    }
    async buildParagrafTemplate(book, fonts) {
        const pageSize = this.buildPageSize(book.layout.trimSize);
        const margins = this.buildMargins(book.layout);
        const baseStyles = this.buildBaseStyles(fonts, book.layout);
        return {
            meta: {
                title: book.metadata.title,
                author: book.metadata.authors.map(a => a.name).join(', '),
                language: book.metadata.language,
                profile: 'novella'
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
                // Novella: slightly smaller body text
                body: {
                    ...baseStyles.body,
                    size: 10,
                    lineHeight: 14,
                    firstLineIndent: 10
                },
                bodyFirstAfterChapter: {
                    ...baseStyles.body,
                    size: 10,
                    lineHeight: 14,
                    firstLineIndent: 0
                },
                heading1: {
                    ...baseStyles.heading1,
                    size: 20,
                    lineHeight: 26,
                    spaceBefore: 30,
                    spaceAfter: 20
                },
                // Story separator (used between stories in collection)
                storySeparator: {
                    font: {
                        family: fonts.serif.regular,
                        size: 14
                    },
                    alignment: 'center',
                    lineHeight: 18,
                    pageBreakBefore: 'recto',
                    pageBreakAfter: 'always'
                },
                dropcap: {
                    font: {
                        family: fonts.serif.bold || fonts.serif.regular,
                        size: 38,
                        weight: 700
                    },
                    alignment: 'left',
                    lineHeight: 38,
                    float: 'left',
                    lines: 3
                }
            },
            pages: {
                cover: {
                    enabled: !!book.metadata.cover?.front,
                    frontPath: book.metadata.cover?.front,
                    backPath: book.metadata.cover?.back
                },
                titlePage: {
                    enabled: true,
                    recto: true,
                    content: {
                        title: { style: 'heading1', text: book.metadata.title },
                        subtitle: book.metadata.subtitle
                            ? { style: 'heading3', text: book.metadata.subtitle }
                            : null,
                        authors: {
                            style: 'body',
                            text: book.metadata.authors.map(a => a.name).join(', ')
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
                        isbn: book.metadata.isbn?.print
                    }
                },
                dedication: book.metadata.dedication ? {
                    enabled: true,
                    recto: true,
                    content: {
                        style: 'dedication',
                        text: book.metadata.dedication
                    }
                } : null,
                epigraph: book.metadata.epigraph ? {
                    enabled: true,
                    recto: true,
                    content: {
                        style: 'epigraph',
                        text: book.metadata.epigraph
                    }
                } : null,
                // Table of Stories (contents for novella collections)
                toc: {
                    enabled: true,
                    recto: true,
                    title: 'Geschichten',
                    depth: 1
                }
            },
            runningHeads: {
                enabled: true,
                recto: { style: 'italic', content: 'chapter' },
                verso: { style: 'italic', content: 'title' }
            },
            pageNumbers: {
                enabled: true,
                position: 'bottom-center',
                style: 'body'
            },
            chapters: {
                startOn: 'recto',
                numbering: 'none',
                dropcap: book.layout.dropcaps
            },
            content: {
                frontmatter: this.generateFrontmatterBlocks(book),
                chapters: book.chapters,
                backmatter: book.backmatter
            }
        };
    }
    buildEpubCss(book) {
        const base = super.buildEpubCss(book);
        return base + `
/* Novella Profile Specific */

body {
  font-size: 0.95em;
  line-height: 1.55;
}

h1 {
  text-align: center;
  font-size: 1.6em;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  margin-top: 4em;
  margin-bottom: 2em;
}

${book.layout.dropcaps ? `
h1 + p::first-letter {
  font-size: 3em;
  font-family: 'SourceSerif4', serif;
  float: left;
  line-height: 0.85;
  padding-right: 0.1em;
  font-weight: 700;
}
` : ''}

/* Story separator decoration */
.story-separator {
  text-align: center;
  margin: 4em 0;
  font-size: 1.5em;
  color: #999;
}

.story-separator::before {
  content: "✦ ✦ ✦";
  letter-spacing: 0.5em;
}
`;
    }
}
//# sourceMappingURL=novella.js.map