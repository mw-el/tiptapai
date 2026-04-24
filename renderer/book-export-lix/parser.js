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
import { GENERIC_BOOK_TEXT, getMeaningfulBookText, mergeWithDefaults } from './frontmatter-schema.js';
// ============ Directive Block Regex ============
const FENCED_DIRECTIVE_RE = /^:::\s*(\w+)(?:\s+(.+))?$/;
const CODE_FENCE_RE = /^```(\w*)\s*$/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const HEADING_RE = /^(#{1,4})\s+(.+)$/;
const HR_RE = /^(---|\*\*\*|___)\s*$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const PAGEBREAK_MARKER = /^\s*<!--\s*pagebreak\s*-->\s*$/i;
/**
 * Parse markdown content (without frontmatter) into BookIR
 *
 * @param markdown The markdown content (should NOT include frontmatter ---)
 * @param options Base path for asset resolution, metadata, profile
 */
export function parseMarkdownToBookIR(markdown, options) {
    const bookConfig = options.metadata.TT_bookConfig || {};
    const bookType = options.profileId || bookConfig.book_type || 'novel';
    const metadata = buildMetadata(options.metadata, bookType);
    // When the export dialog profile differs from the frontmatter book_type,
    // the profile is authoritative for trim size and margins. A Poetry export
    // must not land on a 6x9 News-twocol layout just because the frontmatter
    // still carries the old book_type.
    const bookConfigForLayout = options.profileId && bookConfig.book_type && options.profileId !== bookConfig.book_type
        ? {}
        : bookConfig;
    const layout = buildLayout(bookConfigForLayout, bookType);
    const { frontmatterBlocks, chapters, backmatterBlocks } = parseContent(markdown, options.basePath);
    return {
        metadata,
        layout,
        frontmatter: frontmatterBlocks,
        chapters,
        backmatter: backmatterBlocks
    };
}
// ============ Metadata Building ============
function buildMetadata(frontmatter, bookType) {
    const config = frontmatter.TT_bookConfig || {};
    const rawLicense = config.license || {};
    const rawIsbn = config.isbn || {};
    return {
        title: getMeaningfulBookText(frontmatter.title, GENERIC_BOOK_TEXT.title),
        subtitle: getOptionalBookText(frontmatter.subtitle) || undefined,
        authors: parseAuthors(frontmatter.authors || frontmatter.author),
        language: frontmatter.language || 'de-DE',
        bookType,
        edition: frontmatter.edition,
        publishedYear: (frontmatter.publishedYear || frontmatter.published_year || frontmatter.year),
        publisher: getMeaningfulBookText(frontmatter.publisher, GENERIC_BOOK_TEXT.publisher),
        imprint: parseImprint(frontmatter.imprint),
        license: {
            type: getMeaningfulBookText(rawLicense.type, GENERIC_BOOK_TEXT.licenseId),
            modifiers: Array.isArray(rawLicense.modifiers) ? rawLicense.modifiers : [],
            version: typeof rawLicense.version === 'string' ? rawLicense.version : '',
            holder: getMeaningfulBookText(rawLicense.holder, GENERIC_BOOK_TEXT.licenseHolder)
        },
        isbn: {
            print: getMeaningfulBookText(rawIsbn.print, GENERIC_BOOK_TEXT.isbnPrint),
            ebook: getMeaningfulBookText(rawIsbn.ebook, GENERIC_BOOK_TEXT.isbnEbook)
        },
        cover: config.cover,
        epigraph: getMeaningfulBookText(config.epigraph || frontmatter.epigraph, GENERIC_BOOK_TEXT.epigraph),
        dedication: getMeaningfulBookText(config.dedication || frontmatter.dedication, GENERIC_BOOK_TEXT.dedication)
    };
}
function getOptionalBookText(raw) {
    if (typeof raw !== 'string') {
        return null;
    }
    const trimmed = raw.trim();
    return trimmed || null;
}
function parseAuthors(raw) {
    if (!raw)
        return [{ name: GENERIC_BOOK_TEXT.author }];
    if (Array.isArray(raw)) {
        return raw.map((a) => {
            if (typeof a === 'string') {
                return { name: getMeaningfulBookText(a, GENERIC_BOOK_TEXT.author) };
            }
            return {
                name: getMeaningfulBookText(a?.name, GENERIC_BOOK_TEXT.author),
                email: a?.email
            };
        });
    }
    if (typeof raw === 'string') {
        return [{ name: getMeaningfulBookText(raw, GENERIC_BOOK_TEXT.author) }];
    }
    if (typeof raw === 'object') {
        const a = raw;
        return [{
                name: getMeaningfulBookText(a?.name, GENERIC_BOOK_TEXT.author),
                email: a?.email
            }];
    }
    return [{ name: GENERIC_BOOK_TEXT.author }];
}
function parseImprint(raw) {
    if (!raw)
        return undefined;
    if (typeof raw === 'string')
        return { name: raw };
    if (typeof raw === 'object')
        return raw;
    return undefined;
}
// ============ Layout Building ============
function buildLayout(bookConfig, bookType) {
    return mergeWithDefaults(bookConfig, bookType);
}
function parseContent(markdown, basePath) {
    const lines = markdown.split('\n');
    const chapters = [];
    const frontmatterBlocks = [];
    const backmatterBlocks = [];
    let currentChapter = null;
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
            const { block, nextIndex } = parseFencedDirective(lines, i, directive, title, basePath);
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
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();
            // h1 starts a new chapter
            if (level === 1) {
                // Save previous chapter
                if (currentChapter && currentChapter.blocks.length > 0) {
                    chapters.push(finalizeChapter(currentChapter));
                }
                chapterNumber++;
                currentChapter = {
                    title: text,
                    number: chapterNumber,
                    blocks: [],
                    part: '',
                    subtitle: '',
                    intro: ''
                };
                i++;
                continue;
            }
            // h2-h4 inside chapter
            const block = { type: 'heading', level, text };
            pushBlock(currentChapter, frontmatterBlocks, block);
            i++;
            continue;
        }
        // Image
        const imageMatch = trimmed.match(IMAGE_RE);
        if (imageMatch) {
            const [, alt, imgPath] = imageMatch;
            const block = {
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
            const block = { type: 'hr' };
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
        chapters.push(finalizeChapter(currentChapter));
    }
    return { frontmatterBlocks, chapters, backmatterBlocks };
}

// Extrahiert optionale schreiben-Profile-Meta direkt nach dem H1-Titel:
//   # Kapiteltitel
//   ::: chaptermeta
//   part: Teil I — Grundlagen
//   subtitle: Form, Tradition und das Wesen des Kurzen
//   intro: Die Kurzgeschichte ist keine verkuerzte Version eines Romans ...
//   :::
// Zieht den Chaptermeta-Block aus der blocks-Liste, wenn er als allererster
// Block auftaucht, und haengt part/subtitle/intro an das Chapter-Objekt.
function finalizeChapter(ch) {
    const out = {
        title: ch.title,
        number: ch.number,
        blocks: ch.blocks,
        part: ch.part || '',
        subtitle: ch.subtitle || '',
        intro: ch.intro || ''
    };
    const first = ch.blocks[0];
    if (first && first.type === 'chaptermeta') {
        const meta = first.meta || {};
        if (meta.part) out.part = meta.part;
        if (meta.subtitle) out.subtitle = meta.subtitle;
        if (meta.intro) out.intro = meta.intro;
        out.blocks = ch.blocks.slice(1);
    }
    return out;
}
/**
 * Push block to currentChapter if exists, else to frontmatterBlocks
 */
function pushBlock(currentChapter, frontmatterBlocks, block) {
    if (currentChapter) {
        currentChapter.blocks.push(block);
    }
    else {
        frontmatterBlocks.push(block);
    }
}
// ============ Block-Specific Parsers ============
function parseCodeBlock(lines, startIndex, language) {
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
function parseFencedDirective(lines, startIndex, directive, title, basePath) {
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
function buildDirectiveBlock(directive, title, content) {
    switch (directive.toLowerCase()) {
        case 'poem':
            return {
                type: 'poem',
                lines: content.split('\n')
            };
        case 'theorem':
            return {
                type: 'theorem',
                title,
                content
            };
        case 'definition': {
            // Format: term :: definition OR just content
            const parts = content.split('::');
            if (parts.length >= 2) {
                return {
                    type: 'definition',
                    term: parts[0].trim(),
                    definition: parts.slice(1).join('::').trim()
                };
            }
            return {
                type: 'definition',
                term: title || 'Definition',
                definition: content
            };
        }
        case 'algorithm':
            return {
                type: 'algorithm',
                title,
                steps: content.split('\n').filter(l => l.trim())
            };
        case 'math':
            return {
                type: 'math',
                display: true,
                content
            };
        case 'pullquote': {
            // Optional letzte Zeile beginnt mit "— " oder "— " → Attribution
            const lines = content.split('\n');
            let attribution = '';
            let bodyLines = lines;
            const lastIdx = lines.length - 1;
            if (lastIdx >= 0) {
                const last = lines[lastIdx].trim();
                const attrMatch = last.match(/^[—–-]{1,2}\s*(.+)$/);
                if (attrMatch) {
                    attribution = attrMatch[1].trim();
                    bodyLines = lines.slice(0, lastIdx);
                }
            }
            return {
                type: 'pullquote',
                text: bodyLines.join('\n').trim(),
                attribution,
                title: title || ''
            };
        }
        case 'exercise':
            return {
                type: 'exercise',
                title: title || 'Übung',
                text: content
            };
        case 'chaptermeta': {
            // Erwartet key=value-Paare, getrennt durch "|" oder Zeilenumbrueche.
            const meta = {};
            const kvLines = content.split(/[|\n]/);
            kvLines.forEach((kv) => {
                const eq = kv.indexOf('=');
                if (eq <= 0) return;
                const key = kv.slice(0, eq).trim().toLowerCase();
                const val = kv.slice(eq + 1).trim();
                if (key === 'part' || key === 'subtitle' || key === 'intro') meta[key] = val;
            });
            return { type: 'chaptermeta', meta };
        }
        default:
            // Unknown directive: fallback to paragraph
            return {
                type: 'paragraph',
                text: content
            };
    }
}
function parseBlockquote(lines, startIndex) {
    let text = '';
    let i = startIndex;
    while (i < lines.length) {
        const line = lines[i];
        const match = line.match(BLOCKQUOTE_RE);
        if (!match)
            break;
        text += match[1] + '\n';
        i++;
    }
    return {
        block: { type: 'blockquote', text: text.trim() },
        nextIndex: i
    };
}
function parseParagraph(lines, startIndex) {
    let text = '';
    let i = startIndex;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        // Stop at empty line or other block elements
        if (!trimmed)
            break;
        if (HEADING_RE.test(trimmed))
            break;
        if (BLOCKQUOTE_RE.test(line))
            break;
        if (FENCED_DIRECTIVE_RE.test(trimmed))
            break;
        if (CODE_FENCE_RE.test(trimmed))
            break;
        if (IMAGE_RE.test(trimmed))
            break;
        if (HR_RE.test(trimmed))
            break;
        if (PAGEBREAK_MARKER.test(line))
            break;
        text += (text ? ' ' : '') + trimmed;
        i++;
    }
    return {
        block: { type: 'paragraph', text: text.trim() },
        nextIndex: i
    };
}
// ============ Asset Path Resolution ============
function resolveAssetPath(assetPath, basePath) {
    if (!assetPath)
        return '';
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
export function buildBookIR(markdownContent, frontmatter, basePath, profileId) {
    return parseMarkdownToBookIR(markdownContent, {
        basePath,
        metadata: frontmatter,
        profileId
    });
}
//# sourceMappingURL=parser.js.map