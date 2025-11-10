// Smart viewport-based background checking for LanguageTool
// Checks paragraphs starting from viewport, then continues to end, then beginning
// Non-blocking, cancellable, with progress tracking

import State from '../editor/editor-state.js';
import { getAllParagraphs, addCleanParagraph, removeCleanParagraph, isParagraphSkipped } from '../languagetool/paragraph-storage.js';
import { checkText } from '../languagetool.js';
import { setErrorMarks } from '../languagetool/error-marking.js';
import { restoreUserSelection, withSystemSelectionChange } from '../editor/selection-manager.js';
import { refreshErrorNavigation } from '../ui/error-list-widget.js';
import { normalizeWord } from '../utils/word-normalizer.js';

function filterMatchesForText(fullText, matches) {
  const personalDict = JSON.parse(localStorage.getItem('personalDictionary') || '[]');
  const personalDictSet = new Set(personalDict.map(normalizeWord));
  const documentDict = (State.currentFileMetadata?.TT_Dict_Additions || [])
    .map(normalizeWord)
    .filter(Boolean);
  documentDict.forEach(entry => personalDictSet.add(entry));

  const ignoredErrors = JSON.parse(localStorage.getItem('ignoredLanguageToolErrors') || '[]');
  const ignoredRawSet = new Set(ignoredErrors);
  const ignoredNormalizedSet = new Set(
    ignoredErrors.map(entry => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex === -1) {
        return entry;
      }
      const ruleId = entry.slice(0, separatorIndex);
      const token = entry.slice(separatorIndex + 1);
      return `${ruleId}:${normalizeWord(token)}`;
    })
  );

  return matches.filter(match => {
    const errorText = fullText.substring(match.offset, match.offset + match.length);
    const normalizedError = normalizeWord(errorText);

    if (personalDictSet.has(normalizedError)) {
      return false;
    }

    const errorKey = `${match.rule.id}:${errorText}`;
    const normalizedKey = `${match.rule.id}:${normalizedError}`;
    if (ignoredRawSet.has(errorKey) || ignoredNormalizedSet.has(normalizedKey)) {
      return false;
    }

    return true;
  });
}

/**
 * Check Queue for managing background checks
 * Allows cancellation and progress tracking
 */
class CheckQueue {
  constructor() {
    this.queue = [];
    this.running = false;
    this.cancelled = false;
    this.processed = 0;
    this.total = 0;
    this.onProgress = null;
    this.onComplete = null;
  }

  /**
   * Cancel the current queue
   */
  cancel() {
    console.log('⏸️  Check queue cancelled');
    this.queue = [];
    this.running = false;
    this.cancelled = true;
  }

  /**
   * Add paragraphs to queue
   * @param {Array} paragraphs - Array of paragraph objects
   */
  setParagraphs(paragraphs) {
    this.queue = chunkParagraphs(
      paragraphs,
      State.backgroundCheckConfig?.maxParagraphsPerBatch || 12,
      State.backgroundCheckConfig?.maxWordsPerBatch || 1200
    );
    this.total = paragraphs.length;
    this.processed = 0;
    this.cancelled = false;
  }

  /**
   * Process queue sequentially with delays
   * Non-blocking: Yields control between checks
   */
  async process() {
    if (this.running) {
      console.warn('Check queue already running');
      return;
    }

    this.running = true;
    console.log(`🔍 Starting background check queue (${this.total} paragraphs in ${this.queue.length} batches)`);

    const workerCount = Math.min(
      State.backgroundCheckConfig?.maxParallelBatches || 2,
      this.queue.length || 1
    );

    const runWorker = async () => {
      while (this.queue.length > 0 && !this.cancelled) {
        const chunk = this.queue.shift();
        if (!chunk) break;

        // Pause if user recently interacted with the editor
        const lastInteraction = State.lastUserInteraction || 0;
        if (Date.now() - lastInteraction < 750) {
          this.queue.unshift(chunk);
          await new Promise(resolve => setTimeout(resolve, 250));
          continue;
        }

        try {
          // Check if user is typing (high priority)
          if (State.isApplyingLanguageToolMarks) {
            console.log('⏸️  Pausing check: user is editing');
            await new Promise(resolve => setTimeout(resolve, 500));
            this.queue.unshift(chunk); // Put back
            continue;
          }

          // Process this chunk
          await this.checkChunk(chunk);

          this.processed += chunk.paragraphs.length;

          // Progress callback
          if (this.onProgress) {
            this.onProgress(this.processed, this.total);
          }

          // Small delay to keep UI responsive
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error('Error checking paragraph chunk:', error);
          this.processed += chunk.paragraphs.length;
        }
      }
    };

    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }

    await Promise.all(workers);

    this.running = false;

    if (!this.cancelled) {
      console.log(`✓ Background check queue completed (${this.processed}/${this.total})`);
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  /**
   * Check a chunk of paragraphs via single API call
   * @param {Object} chunk - { paragraphs: Array, separatorLength: number }
   */
  async checkChunk(chunk) {
    if (!chunk || chunk.paragraphs.length === 0) return;
    const language = State.currentFileMetadata.language ||
                     document.querySelector('#language-selector')?.value ||
                     'de-CH';
    const chunkText = chunk.paragraphs.map(p => p.text).join('\n\n');
    console.log(`📝 Checking chunk with ${chunk.paragraphs.length} paragraphs (${chunkText.length} chars)...`);

    const matches = await checkText(chunkText, language);

    const filteredMatches = filterMatchesForText(chunkText, matches);

    // Map matches to individual paragraphs
    const paragraphBoundaries = [];
    let offset = 0;
    chunk.paragraphs.forEach((paragraph, index) => {
      const start = offset;
      const end = start + paragraph.text.length;
      paragraphBoundaries.push({
        paragraph,
        start,
        end
      });
      offset = end + (index === chunk.paragraphs.length - 1 ? 0 : 2); // account for separator
    });

    for (const boundary of paragraphBoundaries) {
      const { paragraph, start, end } = boundary;
      const paragraphMatches = filteredMatches
        .filter(match => match.offset >= start && match.offset < end)
        .map(match => ({
          ...match,
          offset: match.offset - start,
          length: match.length
        }));

      await processParagraphResult(paragraph, paragraphMatches);
    }
  }
}

// Global queue instance
const globalQueue = new CheckQueue();

/**
 * Find the first visible paragraph in viewport
 * @param {Editor} editor - TipTap editor instance
 * @returns {number} Index of first visible paragraph
 */
function findViewportParagraphIndex(editor) {
  const editorElement = editor.view.dom;
  const container = editorElement.parentElement;

  if (!container) {
    return 0;
  }

  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;

  // Get all paragraph elements
  const paragraphElements = Array.from(editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));

  // Find first paragraph that's visible (partially or fully)
  for (let i = 0; i < paragraphElements.length; i++) {
    const el = paragraphElements[i];
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Check if element is in viewport
    if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
      return Math.max(0, i - 5); // Start 5 paragraphs before
    }
  }

  return 0;
}

/**
 * Run smart initial check starting from viewport
 * Checks paragraphs in priority order: viewport → end → beginning
 *
 * @param {Editor} editor - TipTap editor instance
 * @param {Function} onProgress - Callback(current, total)
 * @param {Function} onComplete - Callback when done
 */
export async function runSmartInitialCheck(editor, onProgress = null, onComplete = null, options = {}) {
  if (!editor) {
    console.error('No editor available for initial check');
    return;
  }

  const {
    startFromBeginning = false,
    maxWords = Infinity
  } = options || {};

  // Cancel any running check
  if (globalQueue.running) {
    globalQueue.cancel();
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for cancellation
  }

  console.log('🚀 Starting smart initial check...');

  // Get all paragraphs from document
  const allParagraphs = getAllParagraphs(editor);
  console.log(`📊 Found ${allParagraphs.length} paragraphs in document`);

  // Filter: Only check paragraphs that are NOT in clean list
  const cleanHashes = new Set(State.currentFileMetadata.TT_CleanParagraphs || []);
  const paragraphsToCheck = allParagraphs.filter(p => !cleanHashes.has(p.hash) && !isParagraphSkipped(p.text));

  console.log(`📊 ${paragraphsToCheck.length} paragraphs need checking (${cleanHashes.size} already clean)`);

  if (paragraphsToCheck.length === 0) {
    console.log('✓ All paragraphs are clean, no check needed');

    // Still set green marks for all clean paragraphs
    State.isApplyingLanguageToolMarks = true;
    try {
      allParagraphs.forEach(p => {
        if (cleanHashes.has(p.hash)) {
          State.currentEditor.chain()
            .setTextSelection({ from: p.from, to: p.to })
            .setCheckedParagraph({ checkedAt: new Date().toISOString() })
            .setMeta('addToHistory', false)
            .setMeta('preventUpdate', true)
            .run();
        }
      });
    } finally {
      State.isApplyingLanguageToolMarks = false;
    }

    if (onComplete) {
      onComplete();
    }
    return;
  }

  // Find viewport position
  let orderedParagraphs;

  if (startFromBeginning) {
    orderedParagraphs = [...paragraphsToCheck];
    console.log(`📋 Check order: full document from beginning (${orderedParagraphs.length} paragraphs)`);
  } else {
    const viewportIndex = findViewportParagraphIndex(editor);
    console.log(`👁️  Viewport starts at paragraph index ${viewportIndex}`);

    // Reorder paragraphs: viewport → end → beginning
    const viewportParagraphs = paragraphsToCheck.slice(viewportIndex);
    const beforeViewportParagraphs = paragraphsToCheck.slice(0, viewportIndex);
    orderedParagraphs = [...viewportParagraphs, ...beforeViewportParagraphs];

    console.log(`📋 Check order: ${viewportParagraphs.length} from viewport, then ${beforeViewportParagraphs.length} before`);
  }

  if (orderedParagraphs.length === 0) {
    if (onComplete) {
      onComplete();
    }
    return;
  }

  const limitedParagraphs = limitParagraphsByWordCount(orderedParagraphs, maxWords);
  if (limitedParagraphs.length === 0) {
    console.log('⚠️  Word limit resulted in zero paragraphs to check');
    if (onComplete) {
      onComplete();
    }
    return;
  }

  // Set up queue
  globalQueue.setParagraphs(limitedParagraphs);
  globalQueue.onProgress = onProgress;
  globalQueue.onComplete = onComplete;

  // Start processing (non-blocking)
  await globalQueue.process();
}

/**
 * Cancel any running background check
 */
export function cancelBackgroundCheck() {
  globalQueue.cancel();
}

/**
 * Check if background check is currently running
 * @returns {boolean}
 */
export function isCheckRunning() {
  return globalQueue.running;
}

/**
 * Limit a paragraph list by cumulative word count
 * @param {Array} paragraphs
 * @param {number} maxWords
 * @returns {Array}
 */
function limitParagraphsByWordCount(paragraphs, maxWords) {
  if (!Number.isFinite(maxWords)) {
    return paragraphs;
  }

  let words = 0;
  const limited = [];

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.wordCount ??
      paragraph.text.split(/\s+/).filter(w => w.length > 0).length;

    if (words + paragraphWords > maxWords && limited.length > 0) {
      break;
    }

    limited.push(paragraph);
    words += paragraphWords;

    if (words >= maxWords) {
      break;
    }
  }

  return limited;
}

export async function checkParagraphDirect(paragraph) {
  if (!paragraph) {
    return;
  }

  const language = State.currentFileMetadata.language ||
                   document.querySelector('#language-selector')?.value ||
                   'de-CH';

  const matches = await checkText(paragraph.text, language);
  const filteredMatches = filterMatchesForText(paragraph.text, matches);
  await processParagraphResult(paragraph, filteredMatches);
}

async function processParagraphResult(paragraph, matches) {
  if (!paragraph) return;
  const { text, hash, from, to } = paragraph;
  const selectionToRestore = State.lastUserSelection || State.currentEditor.state.selection;

  State.isApplyingLanguageToolMarks = true;

  try {
    withSystemSelectionChange(() => {
      State.currentEditor.chain()
        .setTextSelection({ from, to })
        .unsetCheckedParagraph()
        .unsetLanguageToolError()
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
        .run();
    });

    removeErrorsInRange(from, to);

    if (!matches || matches.length === 0) {
      addCleanParagraph(text, null);

      withSystemSelectionChange(() => {
        State.currentEditor.chain()
          .setTextSelection({ from, to })
          .setCheckedParagraph({ checkedAt: new Date().toISOString(), status: 'clean' })
          .setMeta('addToHistory', false)
          .setMeta('preventUpdate', true)
          .run();
      });

      console.log(`   ✅ Clean paragraph: ${hash}`);
      refreshErrorNavigation();
      refreshErrorNavigation();
    } else {
      console.log(`   ❌ Paragraph has ${matches.length} errors`);
      removeCleanParagraph(text);
      setErrorMarks(State.currentEditor, matches, text, { baseDocPos: from });
    }
  } finally {
    State.isApplyingLanguageToolMarks = false;
    restoreUserSelection(State.currentEditor, selectionToRestore);
    if (State.paragraphsNeedingCheck) {
      State.paragraphsNeedingCheck.delete(paragraph.from);
    }
  }
}

function chunkParagraphs(paragraphs, maxParagraphsPerBatch, maxWordsPerBatch) {
  if (!paragraphs || paragraphs.length === 0) {
    return [];
  }

  const chunks = [];
  let current = [];
  let currentWords = 0;

  paragraphs.forEach(paragraph => {
    const words = paragraph.wordCount ||
      paragraph.text.split(/\s+/).filter(w => w.length > 0).length;

    const wouldExceed =
      current.length > 0 &&
      (current.length >= maxParagraphsPerBatch ||
        currentWords + words > maxWordsPerBatch);

    if (wouldExceed) {
      chunks.push({ paragraphs: current });
      current = [];
      currentWords = 0;
    }

    current.push(paragraph);
    currentWords += words;
  });

  if (current.length > 0) {
    chunks.push({ paragraphs: current });
  }

  return chunks;
}

function removeErrorsInRange(rangeFrom, rangeTo) {
  State.activeErrors.forEach((error, errorId) => {
    if (error.from >= rangeFrom && error.to <= rangeTo) {
      State.activeErrors.delete(errorId);
    }
  });
}
