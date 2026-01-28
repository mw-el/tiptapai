// Zentrale LanguageTool Check-Runner Logik
// Separation of Concerns: Alle Check-Durchläufe verwenden diese Funktion

import State from '../editor/editor-state.js';
import { checkText } from '../languagetool.js';
import { removeAllErrorMarks, setErrorMarks } from './error-marking.js';
import {
  saveCheckedParagraph,
  isParagraphChecked,
  getParagraphTextForCheck,
  getDocumentTextForCheck,
} from './paragraph-storage.js';
import { showStatus, updateLanguageToolStatus, setLanguageToolBlocking } from '../ui/status.js';

/**
 * Markiert alle Paragraphen mit grünem Hintergrund nach erfolgreicher Prüfung
 * @param {Editor} editor - TipTap Editor Instanz
 */
function setGreenCheckedMarks(editor) {
  if (!editor) {
    console.warn('No editor available');
    return;
  }

  console.log('📗 Setting green checked marks for all paragraphs...');

  const { doc } = editor.state;
  let checkedCount = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const paragraphText = getParagraphTextForCheck(node);

      // Skip empty paragraphs
      if (!paragraphText || !paragraphText.trim()) {
        return;
      }

      // Skip frontmatter
      const isFrontmatter = (
        paragraphText.startsWith('---') ||
        (pos < 200 && (
          paragraphText.includes('TT_lastEdit:') ||
          paragraphText.includes('TT_lastPosition:') ||
          paragraphText.includes('TT_checkedRanges:') ||
          /^\s*[a-zA-Z_]+:\s*/.test(paragraphText)
        ))
      );

      if (isFrontmatter) {
        return;
      }

      // Set green checked mark
      const from = pos;
      const to = pos + node.nodeSize;

      editor.chain()
        .setTextSelection({ from, to })
        .setCheckedParagraph({ checkedAt: new Date().toISOString() })
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();

      // Save to frontmatter
      saveCheckedParagraph(paragraphText, null); // null = don't trigger save yet
      checkedCount++;
    }
  });

  console.log(`✓ Set ${checkedCount} green checked marks`);
}

/**
 * Führt LanguageTool-Check durch
 * ZENTRALE FUNKTION - alle Checks laufen durch diese Funktion
 *
 * @param {Editor} editor - TipTap Editor Instanz
 * @param {Object} options - Check-Optionen
 * @param {boolean} options.isAutoCheck - Ist dies ein automatischer Check?
 * @param {string} options.language - Sprache für die Prüfung (optional)
 * @param {string} options.filePath - Dateipfad (optional)
 * @returns {Promise<Object>} Result mit errorCount, newErrorCount
 */
export async function runLanguageToolCheck(editor, options = {}) {
  const {
    isAutoCheck = false,
    language = null,
    filePath = State.currentFilePath
  } = options;

  if (!editor || !filePath) {
    console.warn('Cannot run check: no editor or file path');
    return { errorCount: 0, newErrorCount: 0 };
  }

  // Status: Prüfung läuft
  updateLanguageToolStatus('Prüfe Text...', 'checking');

  // Get plain text from editor (excluding protected markup)
  const { text, offsetMapper } = getDocumentTextForCheck(editor);

  if (!text.trim()) {
    console.log('No text content to check');
    updateLanguageToolStatus('', '');
    return { errorCount: 0, newErrorCount: 0 };
  }

  // Sprache aus Metadaten oder Selector holen
  const checkLanguage = language || State.currentFileMetadata.language || document.querySelector('#language-selector')?.value || 'de-CH';

  console.log(`Checking ${text.length} chars with LanguageTool, language:`, checkLanguage);

  // API-Call
  const matches = await checkText(text, checkLanguage);

  if (matches.length === 0) {
    console.log('No errors found');
    updateLanguageToolStatus('Keine Fehler', 'no-errors');

    // ✅ AUCH BEI 0 FEHLERN: Grüne Marks setzen
    State.isApplyingLanguageToolMarks = true;
    setLanguageToolBlocking(true);
    const { from: selFrom, to: selTo } = editor.state.selection;

    try {
      State.activeErrors.clear();
      removeAllErrorMarks(editor);
      setGreenCheckedMarks(editor);
      editor.commands.setTextSelection({ from: selFrom, to: selTo });
    } catch (error) {
      console.error('❌ Exception during mark setting (no errors case):', error);
    } finally {
      State.isApplyingLanguageToolMarks = false;
      setLanguageToolBlocking(false);
    }

    return { errorCount: 0, newErrorCount: 0 };
  }

  console.log(`Found ${matches.length} errors`);

  // Filtere Fehler basierend auf persönlichem Wörterbuch
  const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');
  const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');

  const filteredMatches = matches.filter(match => {
    const errorText = text.substring(match.offset, match.offset + match.length);

    // Prüfe persönliches Wörterbuch
    if (personalDict.includes(errorText)) {
      return false;
    }

    // Prüfe ignorierte Fehler (ruleId + Text Kombination)
    const errorKey = `${match.rule.id}:${errorText}`;
    if (ignoredErrors.includes(errorKey)) {
      return false;
    }

    return true;
  });

  if (filteredMatches.length === 0) {
    console.log('All errors are in personal dictionary');
    updateLanguageToolStatus('Keine Fehler', 'no-errors');

    // ✅ AUCH BEI 0 FEHLERN (nach Filter): Grüne Marks setzen
    State.isApplyingLanguageToolMarks = true;
    setLanguageToolBlocking(true);
    const { from: selFrom, to: selTo } = editor.state.selection;

    try {
      State.activeErrors.clear();
      removeAllErrorMarks(editor);
      setGreenCheckedMarks(editor);
      editor.commands.setTextSelection({ from: selFrom, to: selTo });
    } catch (error) {
      console.error('❌ Exception during mark setting (filtered case):', error);
    } finally {
      State.isApplyingLanguageToolMarks = false;
      setLanguageToolBlocking(false);
    }

    return { errorCount: 0, newErrorCount: 0 };
  }

  updateLanguageToolStatus(`${filteredMatches.length} Fehler`, 'has-errors');

  // ============================================================================
  // KRITISCH: FLAG mit try-finally, damit es IMMER zurückgesetzt wird!
  // ============================================================================
  // Wenn irgendwo eine Exception passiert, MUSS das Flag zurückgesetzt werden
  // Sonst ist die App permanent blockiert!

  // FLAG SETZEN: Wir beginnen mit dem Setzen der Marks
  State.isApplyingLanguageToolMarks = true;
  console.log('🚫 State.isApplyingLanguageToolMarks = true (blocking onUpdate)');
  setLanguageToolBlocking(true);

  // Speichere aktuelle Selection, um sie nach Mark-Setzen wiederherzustellen
  const { from: selFrom, to: selTo } = editor.state.selection;

  try {
    // Entferne ALLE alten Marks
    State.activeErrors.clear();
    removeAllErrorMarks(editor);

    // Setze neue Error-Marks (zentrale Funktion!)
    const marksSet = setErrorMarks(editor, filteredMatches, text, { offsetMapper });

    console.log('Applied error marks to entire document');

    // Stelle ursprüngliche Selection wieder her
    // WICHTIG: Damit User nicht plötzlich woanders ist oder Text markiert hat
    editor.commands.setTextSelection({ from: selFrom, to: selTo });

    // FLAG ZURÜCKSETZEN: Marks sind fertig gesetzt
    State.isApplyingLanguageToolMarks = false;
    console.log('✅ State.isApplyingLanguageToolMarks = false (onUpdate allowed again)');
    setLanguageToolBlocking(false);

    return {
      errorCount: filteredMatches.length
    };
  } catch (error) {
    // KRITISCH: Exception während Mark-Setzen → Flag MUSS zurückgesetzt werden!
    console.error('❌ CRITICAL: Exception during mark setting:', error);
    State.isApplyingLanguageToolMarks = false;
    console.log('✅ State.isApplyingLanguageToolMarks = false (reset after exception)');
    setLanguageToolBlocking(false);

    // Versuche Selection wiederherzustellen
    try {
      editor.commands.setTextSelection({ from: selFrom, to: selTo });
    } catch (e) {
      console.warn('Could not restore selection:', e);
    }

    throw error; // Re-throw für Debugging
  }
}
