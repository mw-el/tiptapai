/**
 * Book Export Pipeline - IPC Handlers
 *
 * Orchestrates the complete pipeline:
 * Markdown → BookIR → Paragraf (PDF) + EPUB Generator → Files on disk
 *
 * All heavy lifting happens in the main process.
 * TypeScript modules in renderer/book-export/ are compiled to .js by tsc.
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

// Base path for compiled TypeScript modules
const BOOK_EXPORT_DIR = path.join(__dirname, 'renderer', 'book-export');

/**
 * Dynamically load a compiled book-export TypeScript module
 * (handles both .ts source during dev and .js compiled at runtime)
 */
async function loadBookExportModule(relativePath) {
  // Prefer .js (compiled) over .ts (source)
  const jsPath = path.join(BOOK_EXPORT_DIR, relativePath + '.js');
  const tsPath = path.join(BOOK_EXPORT_DIR, relativePath + '.ts');

  if (fs.existsSync(jsPath)) {
    return await import(jsPath);
  }

  if (fs.existsSync(tsPath)) {
    throw new Error(
      `TypeScript source found at ${tsPath} but no compiled .js. ` +
      `Run 'npm run build:ts' first.`
    );
  }

  throw new Error(`Module not found: ${relativePath}`);
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(fileContent) {
  const yaml = require('js-yaml');
  const match = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/.exec(fileContent);

  if (!match) {
    return { metadata: {}, content: fileContent };
  }

  try {
    const metadata = yaml.load(match[1]) || {};
    return { metadata, content: match[2] };
  } catch (error) {
    console.error('[BookExport] Frontmatter parse error:', error);
    return { metadata: {}, content: fileContent };
  }
}

// ============ Handler Registration ============

function registerBookExportHandlers(app) {

  // ======= book-export-validate =======
  ipcMain.handle('book-export-validate', async (event, options) => {
    try {
      const { currentMetadata } = options;

      const config = currentMetadata?.TT_bookConfig;
      const missing = [];

      if (!config) {
        return {
          success: true,
          missing: ['book_type', 'trim_size', 'margins'],
          hasConfig: false
        };
      }

      if (!config.book_type) missing.push('book_type');
      if (!config.trim_size) missing.push('trim_size');

      if (!config.margins ||
          !config.margins.top ||
          !config.margins.bottom ||
          !config.margins.inner ||
          !config.margins.outer) {
        missing.push('margins');
      }

      return {
        success: true,
        missing,
        hasConfig: !!config
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        missing: []
      };
    }
  });

  // ======= book-export-compile =======
  ipcMain.handle('book-export-compile', async (event, options) => {
    const {
      filePath,
      markdown,
      metadata,
      profileId,
      bookConfig,
      formats = ['pdf', 'epub'],
      outputDir
    } = options;

    console.log('[BookExport] Compilation starting:', {
      filePath,
      profileId,
      formats,
      outputDir
    });

    try {
      // Step 1: Load book-export modules
      const parserMod = await loadBookExportModule('parser');
      const profilesMod = await loadBookExportModule('profiles/index');
      const paragrafMod = await loadBookExportModule('paragraf-engine');
      const epubMod = await loadBookExportModule('epub-generator');

      // Step 2: Merge bookConfig into metadata
      const enrichedMetadata = {
        ...metadata,
        TT_bookConfig: bookConfig || metadata?.TT_bookConfig
      };

      // Step 3: Strip frontmatter from markdown if present
      const markdownBody = stripFrontmatter(markdown);

      // Step 4: Build BookIR
      const basePath = path.dirname(filePath || '');
      const bookIR = parserMod.buildBookIR(
        markdownBody,
        enrichedMetadata,
        basePath,
        profileId
      );

      console.log('[BookExport] BookIR built:', {
        chapters: bookIR.chapters.length,
        title: bookIR.metadata.title
      });

      // Step 5: Get profile
      const profile = profilesMod.getProfile(profileId);

      // Step 6: Discover fonts
      const fonts = await discoverFonts();

      // Step 7: Build output filenames
      const baseName = filePath
        ? path.basename(filePath, '.md')
        : 'book';
      const profileSuffix = `-${profileId}`;

      const pdfPath = path.join(outputDir, `${baseName}${profileSuffix}.pdf`);
      const epubPath = path.join(outputDir, `${baseName}${profileSuffix}.epub`);

      const results = { pdf: null, epub: null };

      // Step 8: Compile PDF if requested
      if (formats.includes('pdf')) {
        try {
          console.log('[BookExport] Compiling PDF...');
          const pdfBuffer = await paragrafMod.compilePrintPdf(
            bookIR,
            profile,
            fonts
          );
          await fsPromises.writeFile(pdfPath, pdfBuffer);
          results.pdf = pdfPath;
          console.log('[BookExport] PDF written:', pdfPath);
        } catch (error) {
          console.error('[BookExport] PDF compilation failed:', error);
          throw new Error(`PDF-Kompilierung: ${error.message}`);
        }
      }

      // Step 9: Compile EPUB if requested
      if (formats.includes('epub')) {
        try {
          console.log('[BookExport] Compiling EPUB...');
          await epubMod.generateEpub(bookIR, profile, epubPath);
          results.epub = epubPath;
          console.log('[BookExport] EPUB written:', epubPath);
        } catch (error) {
          console.error('[BookExport] EPUB compilation failed:', error);
          throw new Error(`EPUB-Generierung: ${error.message}`);
        }
      }

      return {
        success: true,
        files: results
      };
    } catch (error) {
      console.error('[BookExport] Pipeline failed:', error);
      return {
        success: false,
        error: error.message || String(error)
      };
    }
  });

  // ======= book-export-discover-fonts =======
  ipcMain.handle('book-export-discover-fonts', async (event, profileId) => {
    try {
      const fonts = await discoverFonts();
      return { success: true, fonts };
    } catch (error) {
      console.error('[BookExport] Font discovery failed:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[BookExport] IPC handlers registered');
}

// ============ Font Discovery ============

/**
 * Discover fonts with this priority:
 * 1. Bundled fonts in app/fonts/
 * 2. System fonts (platform-specific)
 * 3. Fallback to generic names
 */
async function discoverFonts() {
  const bundledDir = path.join(__dirname, 'app', 'fonts');

  // Check bundled fonts
  const bundled = {
    serif: {
      regular: path.join(bundledDir, 'SourceSerif4-Regular.ttf'),
      bold: path.join(bundledDir, 'SourceSerif4-Bold.ttf'),
      italic: path.join(bundledDir, 'SourceSerif4-Italic.ttf'),
      boldItalic: path.join(bundledDir, 'SourceSerif4-BoldItalic.ttf')
    },
    sansSerif: {
      regular: path.join(bundledDir, 'Inter-Regular.ttf'),
      bold: path.join(bundledDir, 'Inter-Bold.ttf')
    },
    monospace: {
      regular: path.join(bundledDir, 'SourceCodePro-Regular.ttf')
    }
  };

  // Verify bundled fonts exist, fall back to system
  const fonts = {
    serif: filterExistingFontFamily(bundled.serif) ||
           getSystemSerifFonts(),
    sansSerif: filterExistingFontFamily(bundled.sansSerif) ||
               getSystemSansSerifFonts(),
    monospace: filterExistingFontFamily(bundled.monospace) ||
               getSystemMonospaceFonts()
  };

  return fonts;
}

/**
 * Remove non-existent paths from a font family; return null if regular missing
 */
function filterExistingFontFamily(family) {
  if (!family.regular || !fs.existsSync(family.regular)) {
    return null;
  }

  const result = { regular: family.regular };
  if (family.bold && fs.existsSync(family.bold)) result.bold = family.bold;
  if (family.italic && fs.existsSync(family.italic)) result.italic = family.italic;
  if (family.boldItalic && fs.existsSync(family.boldItalic)) result.boldItalic = family.boldItalic;
  return result;
}

function getSystemSerifFonts() {
  const platform = process.platform;

  if (platform === 'darwin') {
    const macSerifPaths = [
      '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
      '/System/Library/Fonts/Times.ttc',
      '/Library/Fonts/Georgia.ttf'
    ];
    for (const p of macSerifPaths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  if (platform === 'linux') {
    const linuxSerifPaths = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
      '/usr/share/fonts/TTF/DejaVuSerif.ttf'
    ];
    for (const p of linuxSerifPaths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  if (platform === 'win32') {
    const winSerifPaths = [
      'C:\\Windows\\Fonts\\georgia.ttf',
      'C:\\Windows\\Fonts\\times.ttf'
    ];
    for (const p of winSerifPaths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  return { regular: 'serif' };
}

function getSystemSansSerifFonts() {
  const platform = process.platform;

  if (platform === 'darwin') {
    const paths = [
      '/System/Library/Fonts/Helvetica.ttc',
      '/System/Library/Fonts/SFNS.ttf'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  if (platform === 'linux') {
    const paths = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  if (platform === 'win32') {
    const paths = [
      'C:\\Windows\\Fonts\\arial.ttf',
      'C:\\Windows\\Fonts\\segoeui.ttf'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  return { regular: 'sans-serif' };
}

function getSystemMonospaceFonts() {
  const platform = process.platform;

  if (platform === 'darwin') {
    const paths = [
      '/System/Library/Fonts/Menlo.ttc',
      '/System/Library/Fonts/Monaco.ttf'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  if (platform === 'linux') {
    const paths = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  if (platform === 'win32') {
    const paths = [
      'C:\\Windows\\Fonts\\consola.ttf',
      'C:\\Windows\\Fonts\\cour.ttf'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return { regular: p };
    }
  }

  return { regular: 'monospace' };
}

// ============ Utility ============

/**
 * Strip YAML frontmatter from markdown content
 */
function stripFrontmatter(markdown) {
  if (!markdown) return '';
  const match = /^---\n[\s\S]+?\n---\n([\s\S]*)$/.exec(markdown);
  return match ? match[1] : markdown;
}

module.exports = registerBookExportHandlers;
