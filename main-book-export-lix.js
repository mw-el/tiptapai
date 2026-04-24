/**
 * Book Export LiX Pipeline — IPC Handler
 *
 * Kanal: book-export-lix-compile
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const LIX_DIR = path.join(__dirname, 'renderer', 'book-export-lix');

async function loadParser() {
  const jsPath = path.join(LIX_DIR, 'parser.js');
  if (!fs.existsSync(jsPath)) {
    throw new Error(`LiX-Pipeline: Parser nicht gefunden unter ${jsPath}.`);
  }
  return await import(jsPath);
}

async function loadLixCompiler() {
  const jsPath = path.join(LIX_DIR, 'index.js');
  return await import(jsPath);
}

function stripFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function registerBookExportLixHandlers(app) {
  ipcMain.handle('book-export-lix-compile', async (event, options) => {
    const {
      filePath,
      markdown,
      metadata,
      profileId,
      bookConfig,
      outputDir,
    } = options;

    console.log('[BookExportLix] Compilation starting:', {
      filePath,
      profileId,
      outputDir,
    });

    try {
      const parserMod = await loadParser();
      const lixMod = await loadLixCompiler();

      const enrichedMetadata = {
        ...metadata,
        TT_bookConfig: bookConfig || metadata?.TT_bookConfig,
      };

      const markdownBody = stripFrontmatter(markdown);
      const basePath = path.dirname(filePath || '');

      const bookIR = parserMod.buildBookIR(
        markdownBody,
        enrichedMetadata,
        basePath,
        profileId
      );

      console.log('[BookExportLix] BookIR built:', {
        chapters: bookIR.chapters.length,
        title: bookIR.metadata.title,
      });

      const baseName = filePath ? path.basename(filePath, '.md') : 'book';
      const pdfPath = path.join(outputDir, `${baseName}-${profileId}-lix.pdf`);

      const { pdf, pages } = await lixMod.compileLixPdf(bookIR, {
        sourceDir: basePath,
      });

      await fsPromises.writeFile(pdfPath, pdf);
      console.log('[BookExportLix] PDF written:', pdfPath, 'pages=', pages);

      return {
        success: true,
        files: { pdf: pdfPath },
        pages,
      };
    } catch (error) {
      console.error('[BookExportLix] Pipeline failed:', error);
      const msg = error.message || String(error);
      const extra = error.logPath ? `\n\nLaTeX-Log: ${error.logPath}` : '';
      const tmp = error.outDir ? `\n\ntmp fuer Inspektion: ${error.outDir}` : '';
      return {
        success: false,
        error: msg + extra + tmp,
      };
    }
  });

  ipcMain.handle('book-export-lix-preflight', async () => {
    try {
      const lixMod = await loadLixCompiler();
      const { detectEngine } = await import(path.join(LIX_DIR, 'engine-detect.js'));
      const engine = detectEngine({ force: true });
      return { success: true, engine };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  console.log('[BookExportLix] IPC handlers registered');
}

module.exports = registerBookExportLixHandlers;
