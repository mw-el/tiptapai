// TipTap AI - Renderer Process
// Sprint 1.1: File Operations

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { parseFile, stringifyFile } from './frontmatter.js';

console.log('Renderer Process geladen - Sprint 1.2');

// State
let currentFilePath = null;
let currentEditor = null;
let currentFileMetadata = {};
let autoSaveTimer = null;

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
    })
  ],
  content: `
    <h2>Willkommen zu TipTap AI!</h2>
    <p>Wähle eine Markdown-Datei aus der Sidebar, um sie zu bearbeiten.</p>
  `,
  editorProps: {
    attributes: {
      class: 'tiptap-editor',
      spellcheck: 'true',
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
async function loadFileTree() {
  // Hardcoded working directory - später als Setting
  const workingDir = '/home/matthias/_AA_TipTapAi';
  console.log('Loading files from:', workingDir);

  const result = await window.api.getFiles(workingDir);

  if (!result.success) {
    console.error('Error loading files:', result.error);
    return;
  }

  const fileTreeEl = document.querySelector('#file-tree');
  fileTreeEl.innerHTML = '';

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

  // Active State in File Tree
  document.querySelectorAll('.file-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-path="${filePath}"]`)?.classList.add('active');

  console.log('File loaded successfully');
}

// Status-Anzeige updaten (Sprint 1.3)
function showStatus(message, cssClass = '') {
  const statusEl = document.querySelector('#save-status');
  statusEl.textContent = message;
  statusEl.className = 'save-status ' + cssClass;
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

// Metadata Button
document.querySelector('#metadata-btn').addEventListener('click', showMetadata);

// Raw Markdown Button
document.querySelector('#raw-btn').addEventListener('click', showRawMarkdown);

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

// Initial File Tree laden
loadFileTree();

// Preload API check
if (window.api) {
  console.log('Preload API verfügbar');
} else {
  console.error('Preload API nicht verfügbar!');
}
