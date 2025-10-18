// TipTap AI - Renderer Process
// Sprint 1.1: File Operations

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { parseFile, stringifyFile } from './frontmatter.js';
import { LanguageToolMark } from './languagetool-mark.js';
import { checkText, convertMatchToMark } from './languagetool.js';

console.log('Renderer Process geladen - Sprint 1.2');

// State
let currentFilePath = null;
let currentEditor = null;
let currentFileMetadata = {};
let autoSaveTimer = null;
let languageToolTimer = null; // Timer für LanguageTool Debounce
let languageToolEnabled = true; // LanguageTool aktiviert (standardmäßig an)
let currentWorkingDir = '/home/matthias/_AA_TipTapAi'; // Aktuelles Arbeitsverzeichnis

// TipTap Editor initialisieren
const editor = new Editor({
  element: document.querySelector('#editor'),
  editable: true,
  extensions: [
    StarterKit,
    Markdown.configure({
      html: true,                // Allow HTML in markdown
      tightLists: true,          // Tighter list spacing
      transformPastedText: true, // Transform pasted markdown
      transformCopiedText: true, // Transform copied text to markdown
    }),
    LanguageToolMark, // Sprint 2.1: LanguageTool Integration
  ],
  content: `
    <h2>Willkommen zu TipTap AI!</h2>
    <p>Wähle eine Markdown-Datei aus der Sidebar, um sie zu bearbeiten.</p>
  `,
  editorProps: {
    attributes: {
      class: 'tiptap-editor',
      spellcheck: 'false', // Browser-Spellcheck deaktiviert - wir nutzen LanguageTool
      lang: 'de-CH', // Default language
    },
  },
  onUpdate: ({ editor }) => {
    // Auto-Save mit 2s Debounce (Sprint 1.3)
    clearTimeout(autoSaveTimer);

    showStatus('Änderungen...');

    autoSaveTimer = setTimeout(() => {
      if (currentFilePath) {
        showStatus('Speichert...', 'saving');
        saveFile(true); // true = auto-save
      }
    }, 2000);

    // LanguageTool mit 5s Debounce (Sprint 2.1) - nur wenn aktiviert
    clearTimeout(languageToolTimer);
    if (languageToolEnabled) {
      languageToolTimer = setTimeout(() => {
        if (currentFilePath) {
          runLanguageToolCheck();
        }
      }, 5000);
    }
  },
});

currentEditor = editor;
console.log('TipTap Editor initialisiert');

// Simple Markdown to HTML converter (KISS - nur die wichtigsten Features)
function markdownToHTML(markdown) {
  let html = markdown;

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Paragraphs (einfach: Zeilen mit Text werden zu <p>)
  html = html.split('\n\n').map(para => {
    if (!para.trim()) return '';
    if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol')) {
      return para;
    }
    return '<p>' + para.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  return html;
}

// File Tree laden
async function loadFileTree(dirPath = null) {
  const workingDir = dirPath || currentWorkingDir;
  console.log('Loading files from:', workingDir);

  const result = await window.api.getFiles(workingDir);

  if (!result.success) {
    console.error('Error loading files:', result.error);
    return;
  }

  // Aktuelles Verzeichnis speichern und anzeigen
  currentWorkingDir = result.currentDir;
  document.querySelector('#current-folder-path').textContent = currentWorkingDir;

  const fileTreeEl = document.querySelector('#file-tree');
  fileTreeEl.innerHTML = '';

  if (result.files.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'file-tree-empty';
    emptyMsg.textContent = 'Keine Markdown-Dateien gefunden';
    fileTreeEl.appendChild(emptyMsg);
    return;
  }

  result.files.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.dataset.path = file.path;

    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.textContent = 'description';

    const name = document.createElement('span');
    name.textContent = file.name;

    fileItem.appendChild(icon);
    fileItem.appendChild(name);

    fileItem.addEventListener('click', () => loadFile(file.path, file.name));

    fileTreeEl.appendChild(fileItem);
  });

  console.log(`Loaded ${result.files.length} files`);
}

// Ordner-Wechsel-Dialog
async function changeFolder() {
  const result = await window.api.selectDirectory();

  if (!result.success || result.canceled) {
    console.log('Directory selection canceled');
    return;
  }

  console.log('Selected directory:', result.dirPath);
  await loadFileTree(result.dirPath);
}

// File laden
async function loadFile(filePath, fileName) {
  console.log('Loading file:', filePath);

  const result = await window.api.loadFile(filePath);

  if (!result.success) {
    console.error('Error loading file:', result.error);
    return;
  }

  // Frontmatter parsen (Sprint 1.2)
  const { metadata, content } = parseFile(result.content);
  console.log('Frontmatter metadata:', metadata);

  // Metadaten speichern für späteren Save
  currentFileMetadata = metadata;
  currentFilePath = filePath;

  // Nur Content (ohne Frontmatter) in Editor laden
  const html = markdownToHTML(content);
  currentEditor.commands.setContent(html);

  // UI updaten
  document.querySelector('#current-file-name').textContent = fileName;

  // Sprache wiederherstellen (Sprint 1.4)
  const language = metadata.language || 'de-CH'; // Default: Deutsch-CH
  document.querySelector('#language-selector').value = language;

  // HTML lang-Attribut auf contenteditable Element setzen (spellcheck bleibt aus)
  currentEditor.view.dom.setAttribute('lang', language);
  currentEditor.view.dom.setAttribute('spellcheck', 'false');

  // Active State in File Tree
  document.querySelectorAll('.file-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-path="${filePath}"]`)?.classList.add('active');

  console.log('File loaded successfully, language:', language);
}

// Status-Anzeige updaten (Sprint 1.3)
function showStatus(message, cssClass = '') {
  const statusEl = document.querySelector('#save-status');
  statusEl.textContent = message;
  statusEl.className = 'save-status ' + cssClass;
}

// Sprache setzen (Sprint 1.4)
function setDocumentLanguage(langCode) {
  if (!currentFilePath) {
    console.warn('No file loaded');
    return;
  }

  console.log('Setting language to:', langCode);

  // HTML lang-Attribut auf contenteditable Element setzen (spellcheck bleibt aus)
  const editorDom = currentEditor.view.dom;
  editorDom.setAttribute('lang', langCode);
  editorDom.setAttribute('spellcheck', 'false');

  // Frontmatter updaten
  currentFileMetadata.language = langCode;

  // Auto-Save triggern
  showStatus('Sprache geändert...', 'saving');
  setTimeout(() => {
    saveFile(true);
  }, 500);
}

// File speichern
async function saveFile(isAutoSave = false) {
  if (!currentFilePath) {
    console.warn('No file loaded');
    alert('Keine Datei geladen!');
    return;
  }

  // HTML-Content aus Editor holen und zu Markdown konvertieren
  const htmlContent = currentEditor.getHTML();
  const markdown = htmlToMarkdown(htmlContent);

  // Metadaten updaten (Sprint 1.2)
  const updatedMetadata = {
    ...currentFileMetadata,
    lastEdit: new Date().toISOString(),
    lastPosition: currentEditor.state.selection.from, // Cursor-Position
  };

  // Frontmatter + Content kombinieren
  const fileContent = stringifyFile(updatedMetadata, markdown);

  console.log('Saving file with metadata:', updatedMetadata);

  const result = await window.api.saveFile(currentFilePath, fileContent);

  if (!result.success) {
    console.error('Error saving file:', result.error);
    alert('Fehler beim Speichern: ' + result.error);
    return;
  }

  // Metadaten im State aktualisieren
  currentFileMetadata = updatedMetadata;

  console.log('File saved successfully with frontmatter');

  // Visuelles Feedback (Sprint 1.3)
  if (isAutoSave) {
    showStatus('Gespeichert', 'saved');
    setTimeout(() => {
      showStatus('');
    }, 2000);
  } else {
    // Manueller Save - Button-Feedback
    const saveBtn = document.querySelector('#save-btn');
    const originalBg = saveBtn.style.backgroundColor;
    saveBtn.style.backgroundColor = '#27ae60';
    showStatus('Gespeichert', 'saved');
    setTimeout(() => {
      saveBtn.style.backgroundColor = originalBg;
      showStatus('');
    }, 2000);
  }
}

// Simple HTML to Markdown converter (KISS)
function htmlToMarkdown(html) {
  let markdown = html;

  // Headings
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/g, '# $1\n');
  markdown = markdown.replace(/<h2>(.*?)<\/h2>/g, '## $1\n');
  markdown = markdown.replace(/<h3>(.*?)<\/h3>/g, '### $1\n');

  // Bold
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/g, '**$1**');

  // Italic
  markdown = markdown.replace(/<em>(.*?)<\/em>/g, '*$1*');

  // Paragraphs
  markdown = markdown.replace(/<p>(.*?)<\/p>/g, '$1\n\n');

  // Line breaks
  markdown = markdown.replace(/<br\s*\/?>/g, '\n');

  // Clean up multiple newlines
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  return markdown.trim();
}

// LanguageTool Check ausführen (Sprint 2.1)
async function runLanguageToolCheck() {
  if (!currentFilePath) return;

  // Text aus Editor extrahieren (als Plain Text)
  const text = currentEditor.getText();

  if (!text.trim()) {
    console.log('No text to check');
    return;
  }

  // Sprache aus Metadaten oder Dropdown holen
  const language = currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

  console.log('Checking text with LanguageTool, language:', language);

  // API-Call
  const matches = await checkText(text, language);

  if (matches.length === 0) {
    console.log('No errors found');
    return;
  }

  console.log(`Found ${matches.length} errors`);

  // Alle alten Marks entfernen
  currentEditor.commands.unsetLanguageToolError();

  // Fehler-Marks setzen
  matches.forEach((match, index) => {
    const mark = convertMatchToMark(match, text);

    // Mark im Editor setzen
    currentEditor
      .chain()
      .focus()
      .setTextSelection({ from: mark.from + 1, to: mark.to + 1 }) // +1 wegen TipTap offset
      .setLanguageToolError({
        errorId: `lt-${index}`,
        message: mark.message,
        suggestions: JSON.stringify(mark.suggestions),
        category: mark.category,
        ruleId: mark.ruleId,
      })
      .run();
  });

  console.log('Applied error marks to editor');
}

// LanguageTool Toggle Button
document.querySelector('#languagetool-toggle').addEventListener('click', toggleLanguageTool);

// Ordner wechseln Button
document.querySelector('#change-folder-btn').addEventListener('click', changeFolder);

// LanguageTool ein/ausschalten
function toggleLanguageTool() {
  languageToolEnabled = !languageToolEnabled;

  const btn = document.querySelector('#languagetool-toggle');

  if (languageToolEnabled) {
    btn.classList.add('active');
    console.log('LanguageTool aktiviert');
    // Sofort prüfen
    if (currentFilePath) {
      runLanguageToolCheck();
    }
  } else {
    btn.classList.remove('active');
    console.log('LanguageTool deaktiviert');
    // Alle Marks entfernen
    currentEditor.commands.unsetLanguageToolError();
    // Timer stoppen
    clearTimeout(languageToolTimer);
  }
}

// Language Selector
document.querySelector('#language-selector').addEventListener('change', (e) => {
  setDocumentLanguage(e.target.value);
});

// Metadata Button
document.querySelector('#metadata-btn').addEventListener('click', showMetadata);

// Raw Markdown Button
document.querySelector('#raw-btn').addEventListener('click', showRawMarkdown);

// LanguageTool Error Click Handler (Sprint 2.1)
document.querySelector('#editor').addEventListener('click', handleLanguageToolClick);

// LanguageTool Hover Tooltip
document.querySelector('#editor').addEventListener('mouseover', handleLanguageToolHover);
document.querySelector('#editor').addEventListener('mouseout', handleLanguageToolMouseOut);

// Save Button
document.querySelector('#save-btn').addEventListener('click', saveFile);

// Modal schließen (global function)
window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.remove('active');
};

// Hilfsfunktion: Formatiert Wert für Anzeige
function formatMetadataValue(value) {
  // ISO-Timestamp erkennen und formatieren
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    const day = date.getDate();
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}. ${month} ${year}, ${hours}:${minutes}`;
  }

  // Andere Werte: JSON-formatiert
  return JSON.stringify(value, null, 2);
}

// Metadata anzeigen
function showMetadata() {
  if (!currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  const metadataEl = document.getElementById('metadata-content');

  if (Object.keys(currentFileMetadata).length === 0) {
    metadataEl.innerHTML = '<p style="color: #7f8c8d;">Keine Frontmatter-Metadaten vorhanden</p>';
  } else {
    let html = '';
    for (const [key, value] of Object.entries(currentFileMetadata)) {
      const formattedValue = formatMetadataValue(value);
      html += `<div class="meta-item">
        <span class="meta-key">${key}:</span>
        <span class="meta-value">${formattedValue}</span>
      </div>`;
    }
    metadataEl.innerHTML = html;
  }

  document.getElementById('metadata-modal').classList.add('active');
}

// Raw Markdown anzeigen
function showRawMarkdown() {
  if (!currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  const htmlContent = currentEditor.getHTML();
  const markdown = htmlToMarkdown(htmlContent);
  const fullContent = stringifyFile(currentFileMetadata, markdown);

  document.getElementById('raw-content').textContent = fullContent;
  document.getElementById('raw-modal').classList.add('active');
}

// LanguageTool Error Click Handler (Sprint 2.1)
function handleLanguageToolClick(event) {
  const target = event.target;

  // Check if clicked element or parent has lt-error class
  const errorElement = target.closest('.lt-error');
  if (!errorElement) return;

  // Get attributes
  const message = errorElement.getAttribute('data-message');
  const suggestionsJson = errorElement.getAttribute('data-suggestions');
  const ruleId = errorElement.getAttribute('data-rule-id');

  if (!message) return;

  const suggestions = JSON.parse(suggestionsJson || '[]');

  // Create modal content
  let html = `
    <div class="lt-suggestion-header">
      <h3>Korrekturvorschlag</h3>
      <p class="lt-message">${message}</p>
      <p class="lt-rule-id">Regel: ${ruleId}</p>
    </div>
  `;

  if (suggestions.length > 0) {
    html += '<div class="lt-suggestions">';
    html += '<h4>Vorschläge:</h4>';
    suggestions.forEach((suggestion, index) => {
      html += `<button class="lt-suggestion-btn" data-suggestion="${suggestion}">${suggestion}</button>`;
    });
    html += '</div>';
  }

  html += '<div class="lt-actions">';
  html += '<button class="btn-ignore" onclick="closeModal(\'languagetool-modal\')">Ignorieren</button>';
  html += '</div>';

  document.getElementById('languagetool-content').innerHTML = html;
  document.getElementById('languagetool-modal').classList.add('active');

  // Add click handlers for suggestions
  document.querySelectorAll('.lt-suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const suggestion = btn.getAttribute('data-suggestion');
      applySuggestion(errorElement, suggestion);
      closeModal('languagetool-modal');
    });
  });
}

// Korrekturvorschlag anwenden
function applySuggestion(errorElement, suggestion) {
  // Get text content of error element
  const errorText = errorElement.textContent;

  // Find position in editor
  const editorText = currentEditor.getText();
  const pos = editorText.indexOf(errorText);

  if (pos === -1) {
    console.warn('Could not find error text in editor');
    return;
  }

  // Replace text
  currentEditor
    .chain()
    .focus()
    .setTextSelection({ from: pos + 1, to: pos + errorText.length + 1 })
    .insertContent(suggestion)
    .run();

  console.log('Applied suggestion:', suggestion);
}

// Hover Tooltip anzeigen
let tooltipElement = null;

function handleLanguageToolHover(event) {
  const target = event.target;
  const errorElement = target.closest('.lt-error');

  if (!errorElement) {
    // Kein Fehler → Tooltip entfernen falls vorhanden
    removeTooltip();
    return;
  }

  // Tooltip bereits für dieses Element?
  if (tooltipElement && tooltipElement.dataset.errorId === errorElement.getAttribute('data-error-id')) {
    return;
  }

  // Alten Tooltip entfernen
  removeTooltip();

  // Fehler-Info holen
  const message = errorElement.getAttribute('data-message');
  const suggestionsJson = errorElement.getAttribute('data-suggestions');
  const suggestions = JSON.parse(suggestionsJson || '[]');

  if (!message) return;

  // Tooltip erstellen
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'lt-tooltip';
  tooltipElement.dataset.errorId = errorElement.getAttribute('data-error-id');

  let html = `<div class="lt-tooltip-message">${message}</div>`;

  if (suggestions.length > 0) {
    html += '<div class="lt-tooltip-suggestions">';
    html += '<strong>Vorschläge:</strong> ';
    html += suggestions.slice(0, 3).join(', ');
    if (suggestions.length > 3) {
      html += ` (+${suggestions.length - 3} weitere)`;
    }
    html += '</div>';
  }

  html += '<div class="lt-tooltip-hint">Klicken für Details</div>';

  tooltipElement.innerHTML = html;

  // Position berechnen
  const rect = errorElement.getBoundingClientRect();
  tooltipElement.style.position = 'fixed';
  tooltipElement.style.left = rect.left + 'px';
  tooltipElement.style.top = (rect.bottom + 5) + 'px';

  document.body.appendChild(tooltipElement);
}

function handleLanguageToolMouseOut(event) {
  const target = event.target;
  const errorElement = target.closest('.lt-error');

  if (!errorElement) {
    removeTooltip();
  }
}

function removeTooltip() {
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
  }
}

// Initial File Tree laden
loadFileTree();

// Preload API check
if (window.api) {
  console.log('Preload API verfügbar');
} else {
  console.error('Preload API nicht verfügbar!');
}
