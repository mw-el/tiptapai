// Zentrale LanguageTool Check-Runner Logik
// Separation of Concerns: Alle Check-Durchläufe verwenden diese Funktion

import State from '../editor/editor-state.js';
import { checkText } from '../languagetool.js';
import { removeAllErrorMarks, setErrorMarks } from './error-marking.js';
import {
  saveCheckedParagraph,
  isParagraphChecked
} from './paragraph-storage.js';
import { generateParagraphId } from '../utils/hash.js';
import {
  addDiscoveredError,
} from '../ui/error-list-widget.js';
import { showStatus, updateLanguageToolStatus } from '../ui/status.js';

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
      const paragraphText = node.textContent;

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

  // Get plain text from editor (same as what user sees)
  const text = editor.getText();

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
    removeAllErrorMarks(editor);
    setGreenCheckedMarks(editor);
    State.isApplyingLanguageToolMarks = false;
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
    removeAllErrorMarks(editor);
    setGreenCheckedMarks(editor);
    State.isApplyingLanguageToolMarks = false;
    return { errorCount: 0, newErrorCount: 0 };
  }

  updateLanguageToolStatus(`${filteredMatches.length} Fehler`, 'has-errors');

  // FLAG SETZEN: Wir beginnen mit dem Setzen der Marks
  State.isApplyingLanguageToolMarks = true;
  console.log('🚫 State.isApplyingLanguageToolMarks = true (blocking onUpdate)');

  // Entferne ALLE alten Marks
  State.activeErrors.clear();
  removeAllErrorMarks(editor);

  // Setze neue Error-Marks (zentrale Funktion!)
  const marksSet = setErrorMarks(editor, filteredMatches, text);

  console.log('Applied error marks to entire document');

  // ============================================================================
  // TRACK NEW ERRORS (bei Auto-Check)
  // ============================================================================
  let newErrorCount = 0;

  if (isAutoCheck) {
    // Iteriere durch alle gesetzten Fehler
    State.activeErrors.forEach((errorInfo, errorId) => {
      try {
        // Finde den Paragraph zu diesem Fehler
        const $pos = editor.state.doc.resolve(errorInfo.from);

        // Finde den Paragraph-Node
        let paragraphDepth = $pos.depth;
        while (paragraphDepth > 0) {
          const node = $pos.node(paragraphDepth);
          if (node.type.name === 'paragraph' || node.type.name === 'heading') {
            break;
          }
          paragraphDepth--;
        }

        if (paragraphDepth > 0) {
          const paragraphStart = $pos.before(paragraphDepth);
          const paragraphEnd = $pos.after(paragraphDepth);
          const paragraphText = editor.state.doc.textBetween(paragraphStart, paragraphEnd, ' ');

          // War dieser Paragraph vorher gecheckt (grün)?
          if (isParagraphChecked(paragraphText)) {
            // Ja → das ist ein "neuer Fehler"!
            const paragraphHash = generateParagraphId(paragraphText);

            // Extract context (text before/after error for preview)
            const errorOffsetInParagraph = errorInfo.from - paragraphStart;
            const contextBefore = paragraphText.substring(0, errorOffsetInParagraph);
            const contextAfter = paragraphText.substring(errorOffsetInParagraph + errorInfo.errorText.length);

            addDiscoveredError(paragraphHash, errorInfo.from, errorInfo.to, errorInfo.errorText, contextBefore, contextAfter);
            newErrorCount++;
            console.log(`📍 New error discovered in previously checked paragraph: "${errorInfo.errorText}"`);
          }
        }
      } catch (e) {
        console.warn('Could not determine paragraph for error:', e);
      }
    });

    if (newErrorCount > 0) {
      console.log(`✨ Total new errors discovered: ${newErrorCount}`);
    }
  }

  // ============================================================================
  // SET GREEN CHECKED MARKS FOR ALL PARAGRAPHS
  // ============================================================================
  setGreenCheckedMarks(editor);

  // FLAG ZURÜCKSETZEN: Marks sind fertig gesetzt
  State.isApplyingLanguageToolMarks = false;
  console.log('✅ State.isApplyingLanguageToolMarks = false (onUpdate allowed again)');

  return {
    errorCount: filteredMatches.length,
    newErrorCount: newErrorCount
  };
}
