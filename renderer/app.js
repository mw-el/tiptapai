// TipTap AI - Renderer Process
// Sprint 1.1: File Operations

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
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
let languageToolScrollTimer = null; // Timer für Scroll-basiertes LanguageTool
let languageToolEnabled = true; // LanguageTool aktiviert (standardmäßig an)
let currentWorkingDir = null; // Aktuelles Arbeitsverzeichnis (wird beim Start gesetzt)
let lastScrollPosition = 0; // Letzte Scroll-Position für Smart-Check

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
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
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

// Hierarchischer File Tree laden (VSCode-style)
async function loadFileTree(dirPath = null) {
  // Falls currentWorkingDir noch null ist, hole Home-Verzeichnis
  if (!currentWorkingDir && !dirPath) {
    const homeDirResult = await window.api.getHomeDir();
    currentWorkingDir = homeDirResult.success ? homeDirResult.homeDir : '/home/matthias';
  }

  const workingDir = dirPath || currentWorkingDir;
  console.log('Loading directory tree from:', workingDir);

  const result = await window.api.getDirectoryTree(workingDir);

  if (!result.success) {
    console.error('Error loading directory tree:', result.error);
    return;
  }

  // Aktuelles Verzeichnis speichern
  currentWorkingDir = workingDir;

  const fileTreeEl = document.querySelector('#file-tree');
  fileTreeEl.innerHTML = '';

  if (!result.tree || !result.tree.children || result.tree.children.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'file-tree-empty';
    emptyMsg.textContent = 'Keine Markdown/Text-Dateien gefunden';
    fileTreeEl.appendChild(emptyMsg);
    return;
  }

  // Tree root rendern
  renderTreeNode(result.tree, fileTreeEl, 0);

  console.log(`Loaded directory tree for: ${workingDir}`);
}

// Rekursiv Tree-Nodes rendern
function renderTreeNode(node, parentElement, depth = 0) {
  if (!node) return;

  // Für root node: direkt children rendern
  if (depth === 0 && node.children) {
    node.children.forEach(child => renderTreeNode(child, parentElement, depth + 1));
    return;
  }

  const itemWrapper = document.createElement('div');
  itemWrapper.className = 'tree-item-wrapper';
  itemWrapper.style.paddingLeft = `${depth * 12}px`;

  const item = document.createElement('div');
  item.className = node.type === 'directory' ? 'tree-folder' : 'tree-file';
  item.dataset.path = node.path;
  item.dataset.type = node.type;

  if (node.type === 'directory') {
    // Ordner: Expand/Collapse Icon
    const expandIcon = document.createElement('span');
    expandIcon.className = 'material-icons tree-expand-icon';
    expandIcon.textContent = 'chevron_right'; // collapsed by default
    item.appendChild(expandIcon);

    const folderIcon = document.createElement('span');
    folderIcon.className = 'material-icons tree-icon';
    folderIcon.textContent = 'folder';
    item.appendChild(folderIcon);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    item.appendChild(name);

    // Click handler: Expand/Collapse
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolder(item, node, itemWrapper, depth);
    });
  } else {
    // Datei
    const fileIcon = document.createElement('span');
    fileIcon.className = 'material-icons tree-icon';
    fileIcon.textContent = 'description';
    item.appendChild(fileIcon);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    item.appendChild(name);

    // Click handler: Datei öffnen
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      loadFile(node.path, node.name);

      // Active state setzen
      document.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
      item.classList.add('active');
    });
  }

  itemWrapper.appendChild(item);
  parentElement.appendChild(itemWrapper);
}

// Ordner expand/collapse
async function toggleFolder(folderElement, node, itemWrapper, depth) {
  const expandIcon = folderElement.querySelector('.tree-expand-icon');
  const isExpanded = expandIcon.textContent === 'expand_more';

  if (isExpanded) {
    // Collapse: Children entfernen
    expandIcon.textContent = 'chevron_right';
    const childrenContainer = itemWrapper.querySelector('.tree-children');
    if (childrenContainer) {
      childrenContainer.remove();
    }
  } else {
    // Expand: Children laden und anzeigen
    expandIcon.textContent = 'expand_more';

    // Lazy-Loading: Falls children noch nicht geladen
    if (node.children === null) {
      const result = await window.api.expandDirectory(node.path);
      if (result.success) {
        node.children = result.children;
      } else {
        console.error('Error expanding directory:', result.error);
        return;
      }
    }

    // Children-Container erstellen
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';

    // Children rendern
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        renderTreeNode(child, childrenContainer, depth + 1);
      });
    }

    itemWrapper.appendChild(childrenContainer);
  }
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

// Hilfsfunktion: Alle Parent-Ordner einer Datei expandieren
async function expandParentFolders(filePath) {
  const pathParts = filePath.split('/');
  // Baue alle Parent-Pfade auf (ohne die Datei selbst)
  for (let i = 1; i < pathParts.length - 1; i++) {
    const parentPath = pathParts.slice(0, i + 1).join('/');
    const folderElement = document.querySelector(`[data-path="${parentPath}"][data-type="directory"]`);

    if (folderElement && !folderElement.classList.contains('expanded')) {
      // Simuliere Click zum Expandieren
      folderElement.click();
      // Kurze Verzögerung für Animation
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
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

  // Add to recent items
  await window.api.addRecentFile(filePath);

  // Nur Content (ohne Frontmatter) in Editor laden
  const html = markdownToHTML(content);
  currentEditor.commands.setContent(html);

  // Zur letzten Position springen (Sprint 1.5.2)
  if (metadata.lastPosition && metadata.lastPosition > 0) {
    // Warte kurz, bis Content geladen ist
    setTimeout(() => {
      try {
        currentEditor.commands.setTextSelection(metadata.lastPosition);
        console.log('Jumped to last position:', metadata.lastPosition);
      } catch (error) {
        console.warn('Could not restore position:', error);
      }
    }, 100);
  }

  // Window-Titel updaten (nur Dateiname, kein App-Name)
  await window.api.setWindowTitle(fileName);

  // Filename im Control Panel anzeigen
  const filenameDisplay = document.getElementById('current-filename');
  if (filenameDisplay) {
    filenameDisplay.textContent = fileName;
  }

  // Sprache wiederherstellen (Sprint 1.4)
  const language = metadata.language || 'de-CH'; // Default: Deutsch-CH
  document.querySelector('#language-selector').value = language;

  // HTML lang-Attribut auf contenteditable Element setzen (spellcheck bleibt aus)
  currentEditor.view.dom.setAttribute('lang', language);
  currentEditor.view.dom.setAttribute('spellcheck', 'false');

  // Expandiere Parent-Ordner, damit die Datei sichtbar wird
  await expandParentFolders(filePath);

  // Active State in File Tree setzen und zum Element scrollen
  document.querySelectorAll('.tree-file').forEach(item => {
    item.classList.remove('active');
  });
  const activeFile = document.querySelector(`[data-path="${filePath}"]`);
  if (activeFile) {
    activeFile.classList.add('active');
    // Zum Element scrollen (in der Mitte des Viewports)
    activeFile.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  console.log('File loaded successfully, language:', language);
}

// Status-Anzeige updaten (Sprint 1.3)
function showStatus(message, cssClass = '') {
  const statusEl = document.querySelector('#save-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'save-status ' + cssClass;
  }
  // Fallback: Console logging wenn kein Status-Element vorhanden
  console.log('Status:', message);
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

// LanguageTool Check ausführen (Sprint 2.1) - Viewport-basiert für große Dokumente
async function runLanguageToolCheck() {
  if (!currentFilePath) return;

  // Text aus Editor extrahieren (als Plain Text)
  const fullText = currentEditor.getText();

  if (!fullText.trim()) {
    console.log('No text to check');
    return;
  }

  // Viewport-basierte Optimierung für große Dokumente
  const { text, startOffset, endOffset } = getViewportText();

  if (!text.trim()) {
    console.log('No visible text to check');
    return;
  }

  // Sprache aus Metadaten oder Dropdown holen
  const language = currentFileMetadata.language || document.querySelector('#language-selector').value || 'de-CH';

  console.log(`Checking ${text.length} chars (offset ${startOffset}-${endOffset}) with LanguageTool, language:`, language);

  // API-Call
  const matches = await checkText(text, language);

  if (matches.length === 0) {
    console.log('No errors found in viewport');
    return;
  }

  console.log(`Found ${matches.length} errors in viewport`);

  // NUR Marks im Viewport-Bereich entfernen
  removeViewportMarks(startOffset, endOffset);

  // Fehler-Marks setzen (mit offset korrigieren)
  matches.forEach((match, index) => {
    const mark = convertMatchToMark(match, text);

    // Position im Gesamt-Dokument berechnen
    const absoluteFrom = startOffset + mark.from;
    const absoluteTo = startOffset + mark.to;

    // Mark im Editor setzen
    currentEditor
      .chain()
      .focus()
      .setTextSelection({ from: absoluteFrom + 1, to: absoluteTo + 1 }) // +1 wegen TipTap offset
      .setLanguageToolError({
        errorId: `lt-${startOffset}-${index}`,
        message: mark.message,
        suggestions: JSON.stringify(mark.suggestions),
        category: mark.category,
        ruleId: mark.ruleId,
      })
      .run();
  });

  console.log('Applied error marks to editor viewport');
}

// Viewport-Text extrahieren (sichtbarer Bereich + 3-4 Screens voraus)
function getViewportText() {
  const editorElement = document.querySelector('#editor');
  const scrollTop = editorElement.scrollTop;
  const viewportHeight = editorElement.clientHeight;

  // Berechne sichtbaren Bereich + 4 Screens voraus
  const bufferScreens = 4;
  const checkHeight = viewportHeight * (1 + bufferScreens);

  // Position im Editor als Character-Offset berechnen
  const { from: cursorPos } = currentEditor.state.selection;

  // Einfache Heuristik: ~60 Zeichen pro Zeile, ~50 Zeilen pro Screen
  const charsPerScreen = 60 * 50; // ca. 3000 Zeichen
  const startOffset = Math.max(0, Math.floor(scrollTop / viewportHeight) * charsPerScreen);
  const endOffset = Math.min(
    currentEditor.state.doc.content.size,
    startOffset + (charsPerScreen * (1 + bufferScreens))
  );

  const fullText = currentEditor.getText();
  const text = fullText.substring(startOffset, endOffset);

  return { text, startOffset, endOffset };
}

// Nur Marks im Viewport-Bereich entfernen
function removeViewportMarks(startOffset, endOffset) {
  // TipTap hat keine direkte API, um nur Marks in einem Bereich zu entfernen
  // Wir müssen alle entfernen - aber das ist ok, da wir gleich neue setzen
  currentEditor.commands.unsetLanguageToolError();
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

// Scroll-basierte LanguageTool-Checks (bei Inaktivität voraus-checken)
document.querySelector('#editor').addEventListener('scroll', handleEditorScroll);

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

// Scroll Handler für intelligentes Background-Checking
function handleEditorScroll() {
  if (!languageToolEnabled || !currentFilePath) return;

  const editorElement = document.querySelector('#editor');
  const currentScrollPosition = editorElement.scrollTop;

  // Speichere aktuelle Scroll-Position
  lastScrollPosition = currentScrollPosition;

  // Debounce: Nach 2s Inaktivität (kein weiteres Scrollen) → check
  clearTimeout(languageToolScrollTimer);
  languageToolScrollTimer = setTimeout(() => {
    console.log('Scroll idle detected - triggering background LanguageTool check');
    runLanguageToolCheck();
  }, 2000); // 2s Inaktivität
}

// Initial state laden: Letzter Zustand wiederherstellen
async function loadInitialState() {
  // Get home directory as fallback
  const homeDirResult = await window.api.getHomeDir();
  const homeDir = homeDirResult.success ? homeDirResult.homeDir : '/home/matthias';

  const result = await window.api.getRecentItems();

  if (result.success) {
    const history = result.items || [];

    // Lade letzten Ordner, falls vorhanden, sonst Home-Verzeichnis
    const lastFolder = history.find(item => item.type === 'folder');
    if (lastFolder) {
      currentWorkingDir = lastFolder.path;
    } else {
      currentWorkingDir = homeDir;
    }
    await loadFileTree();

    // Lade letzte Datei, falls vorhanden
    const lastFile = history.find(item => item.type === 'file');
    if (lastFile) {
      const fileName = lastFile.path.split('/').pop();
      await loadFile(lastFile.path, fileName);
    }
  } else {
    // Fallback: Home-Verzeichnis laden
    currentWorkingDir = homeDir;
    await loadFileTree();
  }
}

// Initial laden
loadInitialState();

// Preload API check
if (window.api) {
  console.log('Preload API verfügbar');
} else {
  console.error('Preload API nicht verfügbar!');
}

// ============================================
// RECENT ITEMS FEATURE
// ============================================

const recentItemsBtn = document.getElementById('recent-items-btn');
const recentItemsDropdown = document.getElementById('recent-items-dropdown');

// Toggle dropdown
recentItemsBtn.addEventListener('click', async (e) => {
  e.stopPropagation();

  if (recentItemsDropdown.classList.contains('hidden')) {
    await loadRecentItems();
    recentItemsDropdown.classList.remove('hidden');
  } else {
    recentItemsDropdown.classList.add('hidden');
  }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!recentItemsDropdown.contains(e.target) && e.target !== recentItemsBtn) {
    recentItemsDropdown.classList.add('hidden');
  }
});

// Load and display recent items
async function loadRecentItems() {
  const result = await window.api.getRecentItems();

  if (!result.success) {
    console.error('Error loading recent items:', result.error);
    recentItemsDropdown.innerHTML = '<div class="recent-dropdown-empty">Fehler beim Laden</div>';
    return;
  }

  const items = result.items || [];

  if (items.length === 0) {
    recentItemsDropdown.innerHTML = '<div class="recent-dropdown-empty">Noch keine kürzlich verwendeten Elemente</div>';
    return;
  }

  // Build dropdown HTML
  const html = items.map(item => {
    const icon = item.type === 'file' ? 'description' : 'folder';
    return `
      <div class="dropdown-item" data-type="${item.type}" data-path="${item.path}" title="${item.path}">
        <span class="material-icons">${icon}</span>
        <span class="item-name">${item.name}</span>
      </div>
    `;
  }).join('');

  recentItemsDropdown.innerHTML = html;

  // Add click handlers
  const dropdownItems = recentItemsDropdown.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      const type = item.dataset.type;
      const path = item.dataset.path;

      // Close dropdown
      recentItemsDropdown.classList.add('hidden');

      if (type === 'file') {
        const fileName = path.split('/').pop();
        await loadFile(path, fileName);
      } else if (type === 'folder') {
        currentWorkingDir = path;
        await loadFileTree();
        await window.api.addRecentFolder(path);
      }
    });
  });
}

// Modify changeFolder to add to recent items
const changeFolderBtn = document.getElementById('change-folder-btn');
changeFolderBtn.removeEventListener('click', changeFolder); // Remove old listener
changeFolderBtn.addEventListener('click', async () => {
  const result = await window.api.selectDirectory();
  if (result.success && !result.canceled) {
    currentWorkingDir = result.dirPath;
    await loadFileTree();
    await window.api.addRecentFolder(result.dirPath);
    console.log(`Ordner gewechselt: ${result.dirPath}`);
  }
});
