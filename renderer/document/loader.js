// Document Loader - Orchestrates loading and initial checking
// Separation of Concerns: File loading logic extracted from app.js

import State from '../editor/editor-state.js';
import { parseFile } from '../frontmatter.js';
import { runSmartInitialCheck } from './viewport-checker.js';
import { updateTOC } from '../ui/table-of-contents.js';

/**
 * Load and check a document
 * Main entry point for opening files
 *
 * @param {Editor} editor - TipTap editor instance
 * @param {string} filePath - Absolute path to file
 * @param {Function} onProgress - Callback(current, total) for check progress
 * @param {Function} onComplete - Callback when check is done
 * @returns {Promise<void>}
 */
export async function loadAndCheckDocument(editor, filePath, onProgress = null, onComplete = null) {
  if (!editor || !filePath) {
    console.error('Invalid parameters for loadAndCheckDocument');
    return;
  }

  console.log(`📂 Loading document: ${filePath}`);

  try {
    // 1. Read file content via IPC
    const content = await window.electronAPI.readFile(filePath);

    // 2. Parse Markdown with Frontmatter
    const { metadata, content: markdownContent } = parseFile(content);

    // 3. Store in State
    State.currentFilePath = filePath;
    State.currentFileMetadata = metadata;
    State.appliedCorrections = []; // Reset offset tracking

    // Log metadata
    console.log('📄 File metadata:', {
      language: metadata.language || 'de-CH',
      cleanParagraphs: metadata.TT_CleanParagraphs?.length || 0,
      lastEdit: metadata.TT_lastEdit
    });

    // 4. Set content in editor
    editor.commands.setContent(markdownContent);

    // 5. Update language in UI
    const language = metadata.language || 'de-CH';
    const languageSelector = document.querySelector('#language-selector');
    if (languageSelector) {
      languageSelector.value = language;
    }

    // 6. Set HTML lang attribute
    editor.view.dom.setAttribute('lang', language);
    editor.view.dom.setAttribute('spellcheck', 'false');

    // 7. Update TOC
    const tocContainer = document.getElementById('toc-container');
    if (tocContainer) {
      tocContainer.classList.remove('hidden');
      updateTOC(editor);
    }

    // 8. Update UI (file name, etc.)
    const fileName = filePath.split('/').pop();
    const fileNameSpan = document.getElementById('current-file-name');
    if (fileNameSpan) {
      fileNameSpan.textContent = fileName;
    }

    console.log('✓ Document loaded into editor');

    // 9. Run smart initial check (non-blocking, viewport-based)
    // This will start checking in the background
    console.log('🔍 Starting background check...');

    await runSmartInitialCheck(editor, onProgress, () => {
      console.log('✅ Background check completed');

      // Save clean paragraphs to file (batched)
      if (State.currentFilePath) {
        // Note: saveFile will be called from app.js context
        console.log('💾 Clean paragraphs updated, save will be triggered');
      }

      if (onComplete) {
        onComplete();
      }
    });

    console.log('✓ Document load and check initiated');

  } catch (error) {
    console.error('❌ Error loading document:', error);
    throw error;
  }
}

/**
 * Simplified loader for when you just want to load without checking
 * (e.g., for quick file switching)
 *
 * @param {Editor} editor - TipTap editor instance
 * @param {string} filePath - Absolute path to file
 * @returns {Promise<void>}
 */
export async function loadDocumentWithoutCheck(editor, filePath) {
  if (!editor || !filePath) {
    console.error('Invalid parameters for loadDocumentWithoutCheck');
    return;
  }

  console.log(`📂 Loading document (no check): ${filePath}`);

  try {
    // Read file
    const content = await window.electronAPI.readFile(filePath);

    // Parse
    const { metadata, content: markdownContent } = parseFile(content);

    // Store
    State.currentFilePath = filePath;
    State.currentFileMetadata = metadata;
    State.appliedCorrections = [];

    // Set content
    editor.commands.setContent(markdownContent);

    // Update language
    const language = metadata.language || 'de-CH';
    const languageSelector = document.querySelector('#language-selector');
    if (languageSelector) {
      languageSelector.value = language;
    }

    editor.view.dom.setAttribute('lang', language);
    editor.view.dom.setAttribute('spellcheck', 'false');

    // Update TOC
    const tocContainer = document.getElementById('toc-container');
    if (tocContainer) {
      tocContainer.classList.remove('hidden');
      updateTOC(editor);
    }

    // Update UI
    const fileName = filePath.split('/').pop();
    const fileNameSpan = document.getElementById('current-file-name');
    if (fileNameSpan) {
      fileNameSpan.textContent = fileName;
    }

    console.log('✓ Document loaded (no check)');

  } catch (error) {
    console.error('❌ Error loading document:', error);
    throw error;
  }
}
