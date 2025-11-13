// HTML Placeholder Editor Modal
// Allows editing of protected HTML content

import State from '../editor/editor-state.js';

let currentPlaceholder = null;
let currentPosition = null;

/**
 * Extract text content from HTML for LanguageTool checking
 */
function extractTextFromHtml(html) {
  // Remove HTML comments
  let text = html.replace(/<!--[\s\S]*?-->/g, '');

  // Remove Hugo shortcodes (they don't contain checkable text)
  text = text.replace(/\{\{<[\s\S]*?>\}\}/g, '');

  // Remove HTML tags but keep content
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  text = textarea.value;

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Check HTML content with LanguageTool
 */
async function checkHtmlWithLanguageTool(html) {
  const text = extractTextFromHtml(html);

  if (!text || text.length < 3) {
    return { text: '', matches: [] };
  }

  try {
    const language = document.querySelector('#language-selector')?.value || 'de-CH';
    const response = await fetch('http://localhost:8081/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        text,
        language,
        enabledOnly: 'false'
      })
    });

    if (!response.ok) {
      throw new Error('LanguageTool request failed');
    }

    const data = await response.json();
    return { text, matches: data.matches || [] };
  } catch (error) {
    console.error('LanguageTool check failed:', error);
    return { text, matches: [], error: error.message };
  }
}

/**
 * Show the HTML editor modal
 */
export async function showHtmlEditorModal(placeholder, position) {
  // Prevent duplicate modals
  const existingModal = document.getElementById('html-editor-modal');
  if (existingModal) {
    console.log('[HTML Editor] Modal already open, ignoring duplicate request');
    return;
  }

  currentPlaceholder = placeholder;
  currentPosition = position;

  const html = State.currentHtmlMap.get(placeholder) || '';

  // Validate placeholder exists in map
  if (!State.currentHtmlMap.has(placeholder)) {
    console.warn('[HTML Editor] Placeholder not found in htmlMap:', placeholder);
    // Initialize with empty content
    State.currentHtmlMap.set(placeholder, '');
  }

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'html-editor-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="modal-header">
        <h3>HTML-Code bearbeiten</h3>
        <button class="modal-close" id="html-editor-close">&times;</button>
      </div>

      <div class="modal-body" style="flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 15px;">
        <!-- Code Editor -->
        <div style="flex: 1; display: flex; flex-direction: column;">
          <label style="font-weight: bold; margin-bottom: 5px;">HTML-Code:</label>
          <textarea
            id="html-code-input"
            style="flex: 1; font-family: monospace; font-size: 14px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; resize: none;"
            spellcheck="false"
          >${html}</textarea>
        </div>

        <!-- Preview Section -->
        <div style="flex: 1; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <label style="font-weight: bold;">Vorschau:</label>
            <button id="html-preview-refresh" class="btn-secondary" style="padding: 5px 10px; font-size: 12px;">
              🔄 Aktualisieren
            </button>
          </div>
          <div id="html-preview" style="flex: 1; border: 1px solid #ccc; border-radius: 4px; padding: 10px; background: #f9f9f9; overflow: auto; min-height: 100px;">
            <em style="color: #999;">Klicken Sie auf "Aktualisieren" für Vorschau</em>
          </div>
        </div>

        <!-- LanguageTool Check Section -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <label style="font-weight: bold;">Rechtschreibprüfung:</label>
            <button id="html-check-spelling" class="btn-secondary" style="padding: 5px 10px; font-size: 12px;">
              ✓ Prüfen
            </button>
          </div>
          <div id="html-spelling-results" style="border: 1px solid #ccc; border-radius: 4px; padding: 10px; background: #f9f9f9; min-height: 60px; max-height: 150px; overflow: auto;">
            <em style="color: #999;">Klicken Sie auf "Prüfen" um den Text zu überprüfen</em>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="html-editor-cancel" class="btn-secondary">Abbrechen</button>
        <button id="html-editor-save" class="btn-primary">Speichern</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Wire up event handlers
  const closeBtn = document.getElementById('html-editor-close');
  const cancelBtn = document.getElementById('html-editor-cancel');
  const saveBtn = document.getElementById('html-editor-save');
  const previewBtn = document.getElementById('html-preview-refresh');
  const checkBtn = document.getElementById('html-check-spelling');
  const textarea = document.getElementById('html-code-input');

  const closeModal = () => {
    try {
      // Remove modal from DOM
      if (modal && modal.parentNode) {
        modal.remove();
      }

      // Clear state
      currentPlaceholder = null;
      currentPosition = null;

      console.log('[HTML Editor] Modal closed successfully');
    } catch (error) {
      console.error('[HTML Editor] Error closing modal:', error);
    }
  };

  // Ensure buttons exist before adding listeners
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // Preview button
  previewBtn.addEventListener('click', () => {
    const code = textarea.value;
    const previewDiv = document.getElementById('html-preview');

    // Create sandboxed iframe for safe preview
    previewDiv.innerHTML = `
      <iframe
        sandbox="allow-same-origin"
        style="width: 100%; height: 100%; border: none; background: white;"
        srcdoc="${code.replace(/"/g, '&quot;')}"
      ></iframe>
    `;
  });

  // Spelling check button
  checkBtn.addEventListener('click', async () => {
    const code = textarea.value;
    const resultsDiv = document.getElementById('html-spelling-results');

    resultsDiv.innerHTML = '<em style="color: #666;">Prüfe...</em>';

    const { text, matches, error } = await checkHtmlWithLanguageTool(code);

    if (error) {
      resultsDiv.innerHTML = `<div style="color: red;">Fehler: ${error}</div>`;
      return;
    }

    if (!text) {
      resultsDiv.innerHTML = '<em style="color: #999;">Kein prüfbarer Text im HTML gefunden</em>';
      return;
    }

    if (matches.length === 0) {
      resultsDiv.innerHTML = `
        <div style="color: green;">
          ✓ Keine Fehler gefunden<br>
          <small style="color: #666;">Geprüfter Text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"</small>
        </div>
      `;
      return;
    }

    // Show matches
    let html = `<div style="color: #666; margin-bottom: 10px;">
      <strong>Geprüfter Text:</strong> "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"
    </div>`;

    html += `<div><strong>${matches.length} Fehler gefunden:</strong></div>`;

    matches.forEach((match, i) => {
      const context = match.context?.text || '';
      const offset = match.context?.offset || 0;
      const length = match.context?.length || 0;

      const before = context.substring(0, offset);
      const error = context.substring(offset, offset + length);
      const after = context.substring(offset + length);

      html += `
        <div style="margin: 8px 0; padding: 8px; background: white; border-left: 3px solid #ff6b6b; border-radius: 3px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
            ${match.rule?.category?.name || 'Fehler'}: ${match.message}
          </div>
          <div style="font-family: monospace; font-size: 13px;">
            ${before}<span style="background: #ffe0e0; color: #c00; text-decoration: underline;">${error}</span>${after}
          </div>
          ${match.replacements?.length > 0 ? `
            <div style="font-size: 12px; margin-top: 4px;">
              <strong>Vorschläge:</strong> ${match.replacements.slice(0, 3).map(r => r.value).join(', ')}
            </div>
          ` : ''}
        </div>
      `;
    });

    resultsDiv.innerHTML = html;
  });

  // Save button
  saveBtn.addEventListener('click', () => {
    const newHtml = textarea.value;

    // Update the htmlMap with new value
    State.currentHtmlMap.set(currentPlaceholder, newHtml);

    console.log(`[HTML Editor] Updated ${currentPlaceholder}:`, newHtml.substring(0, 50));

    // Mark as unsaved
    State.hasUnsavedChanges = true;

    closeModal();
  });

  // Focus textarea
  textarea.focus();
}
