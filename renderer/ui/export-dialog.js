// Export Dialog - Pandoc Integration
// Allows exporting markdown to various formats (PDF, DOCX, HTML, etc.)

import State from '../editor/editor-state.js';
import { showStatus } from './status.js';

// Format configurations with Pandoc arguments
const FORMAT_CONFIGS = {
  pdf: {
    name: 'PDF',
    extension: '.pdf',
    icon: 'picture_as_pdf',
    templates: {
      default: {
        name: 'Standard',
        args: ['--pdf-engine=xelatex', '--toc']
      },
      eisvogel: {
        name: 'Eisvogel (Professional)',
        args: [
          '--template=Eisvogel',
          '--pdf-engine=xelatex',
          '--listings',
          '-V', 'titlepage=true',
          '-V', 'toc-own-page=true'
        ],
        requiresTemplate: true
      },
      minimal: {
        name: 'Minimal',
        args: [
          '--pdf-engine=xelatex',
          '-V', 'geometry:margin=2cm',
          '-V', 'fontsize=11pt'
        ]
      },
      academic: {
        name: 'Academic',
        args: [
          '--pdf-engine=xelatex',
          '--toc',
          '-V', 'documentclass=article',
          '-V', 'geometry:a4paper,margin=2.5cm',
          '-V', 'fontsize=12pt',
          '-V', 'linestretch=1.5'
        ]
      }
    }
  },
  docx: {
    name: 'Word (DOCX)',
    extension: '.docx',
    icon: 'description',
    args: []
  },
  html: {
    name: 'HTML (standalone)',
    extension: '.html',
    icon: 'code',
    args: ['--standalone', '--embed-resources']
  },
  latex: {
    name: 'LaTeX',
    extension: '.tex',
    icon: 'article',
    args: []
  },
  epub: {
    name: 'EPUB (eBook)',
    extension: '.epub',
    icon: 'menu_book',
    args: ['--toc']
  },
  odt: {
    name: 'OpenDocument (ODT)',
    extension: '.odt',
    icon: 'description',
    args: []
  },
  rtf: {
    name: 'Rich Text Format (RTF)',
    extension: '.rtf',
    icon: 'description',
    args: []
  }
};

let pandocStatus = { installed: false, version: null };
let eisvogelStatus = { installed: false, path: null };

// Check Pandoc availability on module load
async function checkPandocStatus() {
  pandocStatus = await window.api.pandocCheck();
  if (pandocStatus.installed) {
    eisvogelStatus = await window.api.pandocCheckEisvogel();
    console.log('Pandoc:', pandocStatus.version);
    console.log('Eisvogel template:', eisvogelStatus.installed ? 'installed' : 'not installed');
  } else {
    console.warn('Pandoc not installed');
  }
}

// Initialize on load
checkPandocStatus();

export async function showExportDialog() {
  if (!State.currentFilePath || !State.currentEditor) {
    showStatus('Keine Datei geladen', 'error');
    return;
  }

  // Check if pandoc is available
  if (!pandocStatus.installed) {
    const install = confirm(
      'Pandoc ist nicht installiert.\n\n' +
      'Installiere mit:\nsudo apt install pandoc texlive-xetex texlive-fonts-recommended texlive-latex-extra\n\n' +
      'Trotzdem fortfahren? (Export wird fehlschlagen)'
    );
    if (!install) return;
  }

  const modal = document.getElementById('export-modal');
  if (!modal) {
    console.error('Export modal not found in DOM');
    return;
  }

  // Reset modal state
  updateExportDialog('pdf', 'default');
  modal.classList.add('active');

  // Setup event listeners (one-time setup)
  setupExportDialogListeners();
}

function setupExportDialogListeners() {
  const formatSelect = document.getElementById('export-format');
  const templateSelect = document.getElementById('export-template');
  const exportBtn = document.getElementById('export-modal-export');
  const cancelBtn = document.getElementById('export-modal-cancel');

  // Remove old listeners
  const newFormatSelect = formatSelect.cloneNode(true);
  formatSelect.replaceWith(newFormatSelect);
  const newTemplateSelect = templateSelect.cloneNode(true);
  templateSelect.replaceWith(newTemplateSelect);
  const newExportBtn = exportBtn.cloneNode(true);
  exportBtn.replaceWith(newExportBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.replaceWith(newCancelBtn);

  // Get fresh references
  const freshFormatSelect = document.getElementById('export-format');
  const freshTemplateSelect = document.getElementById('export-template');
  const freshExportBtn = document.getElementById('export-modal-export');
  const freshCancelBtn = document.getElementById('export-modal-cancel');

  freshFormatSelect.addEventListener('change', (e) => {
    updateExportDialog(e.target.value, null);
  });

  freshTemplateSelect.addEventListener('change', (e) => {
    updateTemplateInfo(freshFormatSelect.value, e.target.value);
  });

  freshExportBtn.addEventListener('click', () => {
    handleExport();
  });

  freshCancelBtn.addEventListener('click', () => {
    document.getElementById('export-modal').classList.remove('active');
  });
}

function updateExportDialog(format, selectedTemplate) {
  const config = FORMAT_CONFIGS[format];
  const templateContainer = document.getElementById('export-template-container');
  const templateSelect = document.getElementById('export-template');

  // Update template selector visibility
  if (config.templates) {
    templateContainer.style.display = 'block';

    // Populate templates
    templateSelect.innerHTML = Object.keys(config.templates)
      .map(key => {
        const template = config.templates[key];
        const disabled = template.requiresTemplate && !eisvogelStatus.installed;
        return `<option value="${key}" ${disabled ? 'disabled' : ''}>
          ${template.name}${disabled ? ' (Template nicht installiert)' : ''}
        </option>`;
      })
      .join('');

    // Select template
    if (selectedTemplate && config.templates[selectedTemplate]) {
      templateSelect.value = selectedTemplate;
    } else {
      templateSelect.value = Object.keys(config.templates)[0];
    }

    updateTemplateInfo(format, templateSelect.value);
  } else {
    templateContainer.style.display = 'none';
  }
}

function updateTemplateInfo(format, templateKey) {
  const config = FORMAT_CONFIGS[format];
  const infoEl = document.getElementById('export-template-info');

  if (!config.templates || !config.templates[templateKey]) {
    infoEl.style.display = 'none';
    return;
  }

  const template = config.templates[templateKey];

  if (template.requiresTemplate && !eisvogelStatus.installed) {
    infoEl.style.display = 'block';
    infoEl.className = 'export-info warning';
    infoEl.innerHTML = `
      <span class="material-icons">warning</span>
      <div>
        <strong>Template fehlt</strong>
        <p>Das Eisvogel-Template ist nicht installiert.</p>
        <button id="install-eisvogel-btn" class="btn-small">Jetzt installieren</button>
      </div>
    `;

    document.getElementById('install-eisvogel-btn').addEventListener('click', async () => {
      await installEisvogelTemplate();
    });
  } else {
    infoEl.style.display = 'none';
  }
}

async function installEisvogelTemplate() {
  const infoEl = document.getElementById('export-template-info');
  infoEl.innerHTML = '<span class="material-icons">hourglass_empty</span> Installiere Eisvogel-Template...';

  const result = await window.api.pandocInstallEisvogel();

  if (result.success) {
    eisvogelStatus = { installed: true, path: result.path };
    infoEl.className = 'export-info success';
    infoEl.innerHTML = `
      <span class="material-icons">check_circle</span>
      <div>
        <strong>Template installiert!</strong>
        <p>Eisvogel-Template erfolgreich heruntergeladen.</p>
      </div>
    `;
    setTimeout(() => {
      updateExportDialog(document.getElementById('export-format').value, 'eisvogel');
    }, 1500);
  } else {
    infoEl.className = 'export-info error';
    infoEl.innerHTML = `
      <span class="material-icons">error</span>
      <div>
        <strong>Installation fehlgeschlagen</strong>
        <p>${result.error}</p>
      </div>
    `;
  }
}

async function handleExport() {
  const format = document.getElementById('export-format').value;
  const templateKey = document.getElementById('export-template')?.value;
  const stripFrontmatter = document.getElementById('export-strip-frontmatter').checked;

  const config = FORMAT_CONFIGS[format];
  const extension = config.extension;

  // Get default filename
  const currentFileName = State.currentFilePath.split('/').pop().replace(/\.md$/, '');
  const defaultFileName = currentFileName + extension;

  // Show save dialog
  const saveResult = await window.api.showSaveDialog(
    State.currentWorkingDir,
    defaultFileName
  );

  if (saveResult.canceled || !saveResult.filePath) {
    return;
  }

  // Get markdown content
  const markdown = State.currentEditor.getMarkdown();

  // Build pandoc arguments
  let pandocArgs = [];

  if (config.templates && templateKey) {
    const template = config.templates[templateKey];
    pandocArgs = [...template.args];
  } else if (config.args) {
    pandocArgs = [...config.args];
  }

  // Close modal
  document.getElementById('export-modal').classList.remove('active');

  // Show progress
  showStatus(`Exportiere ${config.name}...`, 'saving');

  // Execute export
  const result = await window.api.pandocExport({
    markdown,
    outputPath: saveResult.filePath,
    format,
    pandocArgs,
    stripFrontmatter
  });

  if (result.success) {
    showStatus(`Exportiert: ${config.name}`, 'saved');

    // Ask if user wants to open file
    const open = confirm(`Export erfolgreich!\n\n${result.outputPath}\n\nDatei im System öffnen?`);
    if (open) {
      await window.api.openInSystem(result.outputPath);
    }
  } else {
    showStatus(`Export fehlgeschlagen: ${result.error}`, 'error');

    // Show detailed error
    alert(`Export-Fehler:\n\n${result.error}`);
  }
}

// Export function for external use
export { checkPandocStatus };
