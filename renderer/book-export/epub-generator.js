/**
 * EPUB3 Generator
 *
 * Converts BookIR into a valid EPUB3 file with semantic elements:
 * - Theorems, Definitions, Algorithms (for Textbook profile)
 * - Code blocks with syntax highlighting classes
 * - Poetry blocks with preserved line breaks
 * - Proper chapter structure (XHTML files)
 * - OPF manifest with metadata
 * - TOC (nav.xhtml + toc.ncx for legacy readers)
 */
import * as path from 'path';
import * as fs from 'fs/promises';
let JSZipCtor = null;
async function loadJSZip() {
    if (JSZipCtor)
        return JSZipCtor;
    try {
        const mod = await import('jszip');
        JSZipCtor = mod.default || mod;
        return JSZipCtor;
    }
    catch (error) {
        throw new Error(`JSZip nicht verfügbar: ${error.message}. Bitte 'npm install jszip' ausführen.`);
    }
}
// ============ Main Entry Point ============
/**
 * Generate a complete EPUB3 file from a BookIR
 *
 * @param book The BookIR model
 * @param profile The profile (provides EPUB CSS)
 * @param outputPath Absolute path to write .epub file
 */
export async function generateEpub(book, profile, outputPath) {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    // 1. Mimetype MUST be first and uncompressed
    zip.file('mimetype', 'application/epub+zip', {
        compression: 'STORE'
    });
    // 2. META-INF/container.xml
    zip.file('META-INF/container.xml', generateContainerXml());
    // 3. OEBPS folder
    const oebps = zip.folder('OEBPS');
    if (!oebps)
        throw new Error('Failed to create OEBPS folder');
    // 4. Chapter XHTMLs
    for (let idx = 0; idx < book.chapters.length; idx++) {
        const chapter = book.chapters[idx];
        const xhtml = generateChapterXhtml(chapter, book, idx);
        oebps.file(`chapter-${idx.toString().padStart(3, '0')}.xhtml`, xhtml);
    }
    // 5. Frontmatter XHTML (if present)
    if (book.frontmatter.length > 0 || book.metadata.dedication || book.metadata.epigraph) {
        oebps.file('frontmatter.xhtml', generateFrontmatterXhtml(book));
    }
    // 6. CSS (from profile)
    oebps.file('styles.css', profile.buildEpubCss(book));
    // 7. Cover image (if present)
    let coverFilename = null;
    if (book.metadata.cover?.front) {
        try {
            const coverData = await fs.readFile(book.metadata.cover.front);
            const ext = path.extname(book.metadata.cover.front).toLowerCase().slice(1) || 'jpg';
            coverFilename = `cover.${ext === 'pdf' ? 'png' : ext}`;
            oebps.file(coverFilename, coverData);
        }
        catch {
            // Cover not readable, skip
            coverFilename = null;
        }
    }
    // 8. OPF manifest
    oebps.file('content.opf', generateContentOpf(book, coverFilename));
    // 9. TOC (EPUB3 nav)
    oebps.file('nav.xhtml', generateNavXhtml(book));
    // 10. TOC (NCX for backward compatibility)
    oebps.file('toc.ncx', generateTocNcx(book));
    // 11. Generate ZIP
    const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        mimeType: 'application/epub+zip'
    });
    await fs.writeFile(outputPath, buffer);
}
// ============ Container XML ============
function generateContainerXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}
// ============ Chapter XHTML Generation ============
function generateChapterXhtml(chapter, book, index) {
    const blocksHtml = chapter.blocks.map(renderBlockAsXhtml).join('\n');
    const title = escapeXml(chapter.title);
    const lang = book.metadata.language || 'de';
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <section epub:type="chapter" class="chapter" id="chapter-${index}">
    <h1>${title}</h1>
${blocksHtml}
  </section>
</body>
</html>`;
}
// ============ Frontmatter XHTML ============
function generateFrontmatterXhtml(book) {
    const lang = book.metadata.language || 'de';
    const blocks = [];
    if (book.metadata.dedication) {
        blocks.push(`<section class="dedication" epub:type="dedication">
  <p>${escapeXml(book.metadata.dedication).replace(/\n/g, '</p><p>')}</p>
</section>`);
    }
    if (book.metadata.epigraph) {
        blocks.push(`<section class="epigraph" epub:type="epigraph">
  <blockquote><p>${escapeXml(book.metadata.epigraph).replace(/\n/g, '</p><p>')}</p></blockquote>
</section>`);
    }
    book.frontmatter.forEach(block => {
        blocks.push(renderBlockAsXhtml(block));
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>Frontmatter</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${blocks.join('\n')}
</body>
</html>`;
}
// ============ Block → XHTML Renderer ============
function renderBlockAsXhtml(block) {
    switch (block.type) {
        case 'paragraph':
            return `    <p>${escapeXml(block.text)}</p>`;
        case 'heading': {
            const tag = `h${block.level}`;
            return `    <${tag}>${escapeXml(block.text)}</${tag}>`;
        }
        case 'image':
            return `    <figure>
      <img src="${escapeXml(block.path)}" alt="${escapeXml(block.alt)}"/>
      ${block.alt ? `<figcaption>${escapeXml(block.alt)}</figcaption>` : ''}
    </figure>`;
        case 'code':
            return `    <pre class="code language-${escapeXml(block.language)}"><code>${escapeXml(block.code)}</code></pre>`;
        case 'math':
            if (block.display) {
                return `    <div class="math display">${escapeXml(block.content)}</div>`;
            }
            return `    <span class="math inline">${escapeXml(block.content)}</span>`;
        case 'blockquote':
            return `    <blockquote><p>${escapeXml(block.text).replace(/\n/g, '</p><p>')}</p></blockquote>`;
        case 'theorem': {
            const title = block.title
                ? `<span class="theorem-title">${escapeXml(block.title)}</span>`
                : '';
            return `    <section class="theorem" epub:type="concept">
      ${title}
      <p>${escapeXml(block.content).replace(/\n/g, '</p><p>')}</p>
    </section>`;
        }
        case 'definition':
            return `    <section class="definition" epub:type="glossdef">
      <dt class="term"><strong>${escapeXml(block.term)}</strong></dt>
      <dd>${escapeXml(block.definition)}</dd>
    </section>`;
        case 'algorithm': {
            const title = block.title
                ? `<span class="algorithm-title">${escapeXml(block.title)}</span>`
                : '';
            const stepsHtml = block.steps
                .map((s, i) => `<li>${escapeXml(s)}</li>`)
                .join('\n');
            return `    <section class="algorithm">
      ${title}
      <ol>
${stepsHtml}
      </ol>
    </section>`;
        }
        case 'poem':
            return `    <div class="poem">${block.lines.map(l => `<p>${escapeXml(l) || '&#160;'}</p>`).join('')}</div>`;
        case 'hr':
            return `    <hr class="scene-break"/>`;
        case 'pagebreak':
            return `    <div class="pagebreak" epub:type="pagebreak" role="doc-pagebreak"/>`;
        default:
            return `    <p>${escapeXml(block.text || '')}</p>`;
    }
}
// ============ OPF Manifest ============
function generateContentOpf(book, coverFilename) {
    const uuid = generateUuid();
    const lang = book.metadata.language || 'de';
    const title = escapeXml(book.metadata.title);
    const modDate = new Date().toISOString().split('.')[0] + 'Z';
    const manifestItems = [
        '<item id="styles" href="styles.css" media-type="text/css"/>',
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
    ];
    // Frontmatter
    const hasFrontmatter = book.frontmatter.length > 0 || book.metadata.dedication || book.metadata.epigraph;
    if (hasFrontmatter) {
        manifestItems.push('<item id="frontmatter" href="frontmatter.xhtml" media-type="application/xhtml+xml"/>');
    }
    // Chapters
    for (let idx = 0; idx < book.chapters.length; idx++) {
        const paddedIdx = idx.toString().padStart(3, '0');
        manifestItems.push(`<item id="chapter-${paddedIdx}" href="chapter-${paddedIdx}.xhtml" media-type="application/xhtml+xml"/>`);
    }
    // Cover
    if (coverFilename) {
        const ext = path.extname(coverFilename).toLowerCase().slice(1);
        const mediaType = ext === 'png' ? 'image/png' :
            ext === 'webp' ? 'image/webp' :
                ext === 'gif' ? 'image/gif' :
                    'image/jpeg';
        manifestItems.push(`<item id="cover-image" href="${escapeXml(coverFilename)}" media-type="${mediaType}" properties="cover-image"/>`);
    }
    const spineItems = [];
    if (hasFrontmatter) {
        spineItems.push('<itemref idref="frontmatter"/>');
    }
    for (let idx = 0; idx < book.chapters.length; idx++) {
        const paddedIdx = idx.toString().padStart(3, '0');
        spineItems.push(`<itemref idref="chapter-${paddedIdx}"/>`);
    }
    // Metadata
    const authors = book.metadata.authors
        .map(a => `<dc:creator>${escapeXml(a.name)}</dc:creator>`)
        .join('\n    ');
    const isbnElement = book.metadata.isbn?.ebook
        ? `<dc:identifier id="isbn">${escapeXml(book.metadata.isbn.ebook)}</dc:identifier>`
        : '';
    const publisherElement = book.metadata.publisher
        ? `<dc:publisher>${escapeXml(book.metadata.publisher)}</dc:publisher>`
        : '';
    const rightsElement = book.metadata.license?.holder
        ? `<dc:rights>© ${book.metadata.publishedYear || new Date().getFullYear()} ${escapeXml(book.metadata.license.holder)}${book.metadata.license ? ' (' + buildLicenseString(book.metadata.license) + ')' : ''}</dc:rights>`
        : '';
    const descriptionElement = book.metadata.subtitle
        ? `<dc:description>${escapeXml(book.metadata.subtitle)}</dc:description>`
        : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier>
    ${isbnElement}
    <dc:title>${title}</dc:title>
    ${authors}
    <dc:language>${lang}</dc:language>
    ${publisherElement}
    ${descriptionElement}
    ${rightsElement}
    <meta property="dcterms:modified">${modDate}</meta>
    ${coverFilename ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
}
// ============ Nav XHTML (EPUB3 TOC) ============
function generateNavXhtml(book) {
    const lang = book.metadata.language || 'de';
    const tocItems = book.chapters
        .map((ch, idx) => {
        const paddedIdx = idx.toString().padStart(3, '0');
        return `      <li><a href="chapter-${paddedIdx}.xhtml">${escapeXml(ch.title)}</a></li>`;
    })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>Inhaltsverzeichnis</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Inhalt</h1>
    <ol>
${tocItems}
    </ol>
  </nav>
</body>
</html>`;
}
// ============ Toc NCX (Legacy EPUB2 TOC) ============
function generateTocNcx(book) {
    const uuid = generateUuid();
    const title = escapeXml(book.metadata.title);
    const navPoints = book.chapters
        .map((ch, idx) => {
        const paddedIdx = idx.toString().padStart(3, '0');
        return `    <navPoint id="navPoint-${idx}" playOrder="${idx + 1}">
      <navLabel>
        <text>${escapeXml(ch.title)}</text>
      </navLabel>
      <content src="chapter-${paddedIdx}.xhtml"/>
    </navPoint>`;
    })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${title}</text>
  </docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}
// ============ Helpers ============
function escapeXml(str) {
    if (!str)
        return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function generateUuid() {
    // Simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
function buildLicenseString(license) {
    if (!license)
        return '';
    if (license.type === 'CC') {
        const modifiers = license.modifiers.map(m => m.toUpperCase()).join('-');
        return `CC ${modifiers} ${license.version}`;
    }
    if (license.type === 'MIT')
        return 'MIT License';
    if (license.type === 'GPL')
        return `GPL ${license.version}`;
    return license.type;
}
//# sourceMappingURL=epub-generator.js.map