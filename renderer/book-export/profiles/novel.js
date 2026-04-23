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
export class NovelProfile extends BaseProfile {
    constructor() {
        super('novel', 'Roman / Erzählung', {
            trimSize: '5x8',
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
                profile: 'novel'
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
                // Novel-specific: first paragraph after chapter heading
                bodyFirstAfterChapter: {
                    ...baseStyles.body,
                    firstLineIndent: 0
                },
                bodyWithIndent: {
                    ...baseStyles.body,
                    firstLineIndent: 11
                },
                // Dropcap style for chapter openings
                dropcap: {
                    font: {
                        family: fonts.serif.bold || fonts.serif.regular,
                        size: 48,
                        weight: 700
                    },
                    alignment: 'left',
                    lineHeight: 48,
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
                        isbn: book.metadata.isbn?.print,
                        edition: book.metadata.edition
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
                } : null
            },
            runningHeads: {
                enabled: true,
                recto: {
                    style: 'smallcaps',
                    content: 'title'
                },
                verso: {
                    style: 'smallcaps',
                    content: 'chapter'
                }
            },
            pageNumbers: {
                enabled: true,
                position: 'bottom-center',
                style: 'body'
            },
            chapters: {
                startOn: book.layout.rectoChapterStart ? 'recto' : 'any',
                numbering: 'arabic',
                prefix: '',
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
/* Novel Profile Specific */

h1 {
  text-align: center;
  font-size: 2em;
  margin-top: 3em;
  margin-bottom: 2em;
}

/* Dropcap on first paragraph of chapter (when enabled) */
${book.layout.dropcaps ? `
h1 + p::first-letter,
.chapter > p:first-child::first-letter {
  font-size: 3.5em;
  font-family: 'SourceSerif4', serif;
  float: left;
  line-height: 0.85;
  padding-right: 0.1em;
  padding-top: 0.1em;
  font-weight: 700;
}
` : ''}

/* First paragraph after chapter: no indent */
h1 + p,
h2 + p.chapter-first {
  text-indent: 0;
}

/* Scene breaks */
.scene-break {
  text-align: center;
  margin: 2em 0;
  font-size: 1.2em;
  letter-spacing: 0.5em;
}
`;
    }
}
//# sourceMappingURL=novel.js.map