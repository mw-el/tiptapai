/**
 * News / Two-Column Profile
 *
 * Source: LiX News class (https://github.com/NicklasVraa/LiX)
 *
 * Characteristics:
 * - Newspaper/periodical two-column layout
 * - Trim: A4 or similar large format
 * - 2 columns per page (frames in Paragraf)
 * - Periodical metadata: Price, Issue, Volume, Location
 * - Masthead (newspaper header)
 * - Articles as chapters
 * - Multiple headline hierarchy
 */
import { BaseProfile } from './base-profile.js';
export class NewsTwoColProfile extends BaseProfile {
    constructor() {
        super('news-twocol', 'Zeitung / Zweispaltig', {
            trimSize: 'a4',
            margins: { top: 18, bottom: 22, inner: 16, outer: 16 },
            rectoChapterStart: false,
            dropcaps: false,
            columns: 2
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
                profile: 'news-twocol',
                periodical: {
                    issue: book.metadata.issue,
                    volume: book.metadata.volume,
                    date: book.metadata.publishedYear,
                    price: book.metadata.price,
                    location: book.metadata.location
                }
            },
            layout: {
                size: pageSize,
                margins,
                mirrorMargins: false,
                columns: 2,
                columnGap: 6
            },
            fonts: {
                serif: fonts.serif,
                sans: fonts.sansSerif,
                mono: fonts.monospace
            },
            styles: {
                ...baseStyles,
                // Two-column body: slightly smaller for column width
                body: {
                    ...baseStyles.body,
                    size: 9,
                    lineHeight: 12,
                    firstLineIndent: 8
                },
                // Masthead (newspaper title)
                masthead: {
                    font: {
                        family: fonts.sansSerif?.bold || fonts.serif.bold || fonts.serif.regular,
                        size: 36,
                        weight: 900
                    },
                    alignment: 'center',
                    lineHeight: 44,
                    spaceBefore: 0,
                    spaceAfter: 8,
                    letterSpacing: 2,
                    fullWidth: true
                },
                // Periodical metadata strip (under masthead)
                periodical: {
                    font: {
                        family: fonts.sansSerif?.regular || fonts.serif.regular,
                        size: 8
                    },
                    alignment: 'center',
                    borderTop: { width: 1, color: '#000' },
                    borderBottom: { width: 1, color: '#000' },
                    padding: 3,
                    spaceAfter: 12,
                    fullWidth: true
                },
                // Large headline for lead article
                headline: {
                    font: {
                        family: fonts.serif.bold || fonts.serif.regular,
                        size: 24,
                        weight: 700
                    },
                    alignment: 'left',
                    lineHeight: 28,
                    spaceBefore: 0,
                    spaceAfter: 8,
                    fullWidth: true
                },
                subheadline: {
                    font: {
                        family: fonts.serif.italic || fonts.serif.regular,
                        size: 12,
                        style: 'italic'
                    },
                    alignment: 'left',
                    lineHeight: 16,
                    spaceBefore: 0,
                    spaceAfter: 8
                },
                // Article heading (per column)
                heading1: {
                    font: {
                        family: fonts.serif.bold || fonts.serif.regular,
                        size: 16,
                        weight: 700
                    },
                    alignment: 'left',
                    lineHeight: 20,
                    spaceBefore: 12,
                    spaceAfter: 6
                },
                heading2: {
                    font: {
                        family: fonts.serif.bold || fonts.serif.regular,
                        size: 12,
                        weight: 700
                    },
                    alignment: 'left',
                    lineHeight: 15,
                    spaceBefore: 8,
                    spaceAfter: 4
                },
                // Byline
                byline: {
                    font: {
                        family: fonts.sansSerif?.regular || fonts.serif.regular,
                        size: 8,
                        style: 'italic'
                    },
                    alignment: 'left',
                    lineHeight: 11,
                    spaceAfter: 6,
                    color: '#555'
                },
                // Dateline (city name before article text)
                dateline: {
                    font: {
                        family: fonts.serif.bold || fonts.serif.regular,
                        size: 9,
                        weight: 700
                    },
                    alignment: 'left',
                    letterSpacing: 0.5,
                    inline: true
                }
            },
            pages: {
                // No cover/title page for newspapers
                cover: { enabled: false },
                titlePage: { enabled: false },
                formalPage: { enabled: false },
                // Masthead on first page
                masthead: {
                    enabled: true,
                    fullWidth: true,
                    content: {
                        title: book.metadata.title,
                        subtitle: book.metadata.subtitle
                    }
                }
            },
            runningHeads: {
                enabled: true,
                recto: { style: 'smallcaps', content: 'title' },
                verso: { style: 'smallcaps', content: 'title' }
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
                frontmatter: [],
                chapters: book.chapters,
                backmatter: book.backmatter
            }
        };
    }
    buildEpubCss(book) {
        const base = super.buildEpubCss(book);
        // Note: EPUB doesn't support true multi-column well
        // The eReader handles reflow; we add visual hints but not real columns
        return base + `
/* News Two-Column Profile (EPUB: reflow only, columns on print) */

body {
  font-family: 'SourceSerif4', 'Georgia', serif;
  font-size: 0.95em;
  line-height: 1.45;
}

h1 {
  font-size: 1.8em;
  font-weight: 700;
  text-align: left;
  page-break-before: auto;
  margin-top: 1.5em;
  border-bottom: 2px solid #000;
  padding-bottom: 0.3em;
}

h2 {
  font-size: 1.3em;
  font-weight: 700;
  text-align: left;
  margin-top: 1.5em;
  border-bottom: none;
}

h3 {
  font-size: 1.1em;
  font-weight: 700;
}

p {
  text-indent: 1em;
  margin: 0;
}

h1 + p, h2 + p, h3 + p {
  text-indent: 0;
}

/* Masthead */
.masthead {
  text-align: center;
  font-family: 'Times New Roman', 'SourceSerif4', serif;
  font-size: 3em;
  font-weight: 900;
  letter-spacing: 0.05em;
  margin: 0.5em 0 0.2em 0;
  border-bottom: 2px solid #000;
  padding-bottom: 0.2em;
}

.periodical-meta {
  text-align: center;
  font-size: 0.75em;
  border-bottom: 1px solid #000;
  padding: 0.3em 0;
  margin-bottom: 1em;
  display: flex;
  justify-content: space-around;
  font-family: 'Inter', sans-serif;
}

/* Byline */
.byline {
  font-size: 0.8em;
  font-style: italic;
  color: #555;
  margin-bottom: 0.5em;
}

/* Dateline */
.dateline {
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* Article separator */
.article-separator {
  border-top: 1px solid #ccc;
  margin: 1.5em 0;
}
`;
    }
}
//# sourceMappingURL=news-twocol.js.map