/**
 * Poetry Profile
 *
 * Source: LiX Poem class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Trim: A5 or A6 (compact)
 * - Single column, NOT justified (preserve line breaks exactly)
 * - Line breaks matter (no word wrap)
 * - Decorative ornaments (corners/borders)
 * - Softer fonts (script or transitional serif for titles)
 * - Poetry blocks use type: 'poem' with lines array
 * - No chapter numbering usually
 */
import { BaseProfile } from './base-profile.js';
export class PoetryProfile extends BaseProfile {
    constructor() {
        super('poetry', 'Lyrik / Gedichtband', {
            trimSize: 'a5',
            margins: { top: 18, bottom: 24, inner: 22, outer: 16 },
            rectoChapterStart: false,
            dropcaps: false
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
                profile: 'poetry'
            },
            layout: {
                size: pageSize,
                margins,
                mirrorMargins: true,
                columns: 1,
                // Decorative borders (optional per-page)
                decorations: {
                    corners: {
                        enabled: false,
                        ornamentId: 84,
                        color: '#888',
                        opacity: 0.4,
                        width: 24,
                        padding: 4
                    }
                }
            },
            fonts: {
                serif: fonts.serif,
                sans: fonts.sansSerif,
                mono: fonts.monospace
            },
            styles: {
                ...baseStyles,
                // Poetry: NOT justified, preserve lines exactly
                body: {
                    ...baseStyles.body,
                    size: 11,
                    alignment: 'left',
                    firstLineIndent: 0,
                    hyphenate: false
                },
                // Poem title
                poemTitle: {
                    font: {
                        family: fonts.serif.italic || fonts.serif.regular,
                        size: 16,
                        style: 'italic'
                    },
                    alignment: 'center',
                    lineHeight: 22,
                    spaceBefore: 32,
                    spaceAfter: 16
                },
                // Poem line (single line of poetry)
                poemLine: {
                    font: {
                        family: fonts.serif.regular,
                        size: 11
                    },
                    alignment: 'left',
                    lineHeight: 15,
                    firstLineIndent: 0,
                    hyphenate: false,
                    preserveSpaces: true
                },
                // Stanza separator (blank line between stanzas)
                stanzaBreak: {
                    spaceBefore: 8,
                    spaceAfter: 8
                },
                heading1: {
                    font: {
                        family: fonts.serif.italic || fonts.serif.regular,
                        size: 20,
                        style: 'italic'
                    },
                    alignment: 'center',
                    lineHeight: 28,
                    pageBreakBefore: 'always',
                    spaceBefore: 48,
                    spaceAfter: 32
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
                            ? { style: 'poemTitle', text: book.metadata.subtitle }
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
                toc: {
                    enabled: true,
                    recto: true,
                    title: 'Gedichte',
                    depth: 1
                }
            },
            runningHeads: {
                enabled: false
            },
            pageNumbers: {
                enabled: true,
                position: 'bottom-center',
                style: 'body'
            },
            chapters: {
                startOn: 'any',
                numbering: 'none',
                dropcap: false
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
/* Poetry Profile Specific */

body {
  font-family: 'SourceSerif4', 'Georgia', serif;
  font-size: 1.05em;
  line-height: 1.5;
}

/* Poems: preserve line breaks, no justification */
div.poem {
  text-align: left;
  margin: 1.5em 2em;
  white-space: pre-line;
  font-style: normal;
}

div.poem p {
  text-indent: 0;
  margin: 0;
  line-height: 1.5;
}

/* Poem title */
h2.poem-title {
  font-style: italic;
  font-family: 'SourceSerif4', serif;
  font-weight: 400;
  text-align: center;
  font-size: 1.3em;
  margin-top: 2em;
  margin-bottom: 1em;
  border-bottom: none;
}

/* Stanza separator */
.stanza-break {
  display: block;
  height: 1em;
}

/* Decorative separator between poems */
.poem-separator {
  text-align: center;
  margin: 3em 0;
  font-size: 1.2em;
  color: #999;
}

.poem-separator::after {
  content: "❦";
}

/* Chapter: section of poems (e.g. "Fruehe Gedichte") */
h1 {
  text-align: center;
  font-style: italic;
  font-weight: 400;
  font-family: 'SourceSerif4', serif;
  font-size: 1.6em;
  margin-top: 4em;
  margin-bottom: 2em;
}
`;
    }
}
//# sourceMappingURL=poetry.js.map