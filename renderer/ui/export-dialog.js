// Export Dialog - Pandoc + Electron PDF Integration
// Allows exporting markdown to various formats (PDF, DOCX, HTML, etc.)

import State from '../editor/editor-state.js';
import { showStatus } from './status.js';
import { stringifyFile } from '../frontmatter.js';

// Format configurations with Pandoc arguments
const FORMAT_CONFIGS = {
  pdf: {
    name: 'PDF (Pandoc)',
    extension: '.pdf',
    icon: 'picture_as_pdf',
    engine: 'pandoc',
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
  pdf_handout: {
    name: 'PDF Seminar-Handout',
    extension: '.pdf',
    icon: 'picture_as_pdf',
    engine: 'electron',
    templateId: 'seminar-handout',
  },
  docx: {
    name: 'Word (DOCX)',
    extension: '.docx',
    icon: 'description',
    engine: 'pandoc',
    args: []
  },
  html: {
    name: 'HTML (standalone)',
    extension: '.html',
    icon: 'code',
    engine: 'pandoc',
    args: ['--standalone', '--embed-resources']
  },
  latex: {
    name: 'LaTeX',
    extension: '.tex',
    icon: 'article',
    engine: 'pandoc',
    args: []
  },
  epub: {
    name: 'EPUB (eBook)',
    extension: '.epub',
    icon: 'menu_book',
    engine: 'pandoc',
    args: ['--toc']
  },
  odt: {
    name: 'OpenDocument (ODT)',
    extension: '.odt',
    icon: 'description',
    engine: 'pandoc',
    args: []
  },
  rtf: {
    name: 'Rich Text Format (RTF)',
    extension: '.rtf',
    icon: 'description',
    engine: 'pandoc',
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
  const infoEl = document.getElementById('export-template-info');

  // Electron-based formats have no template selector (template is fixed)
  if (config.engine === 'electron') {
    templateContainer.style.display = 'none';
    infoEl.style.display = 'block';
    infoEl.className = 'export-info';
    infoEl.innerHTML = `
      <span class="material-icons">info</span>
      <div>
        <strong>${config.name}</strong>
        <p>Fehlende Assets (Titelbild, Logo) werden beim Export abgefragt.</p>
      </div>
    `;
    return;
  }

  // Pandoc templates
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
    infoEl.style.display = 'none';
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
  const config = FORMAT_CONFIGS[format];

  if (config.engine === 'electron') {
    await handleElectronExport(config);
  } else {
    await handlePandocExport(config);
  }
}

// ============================================================================
// Pandoc Export (existing flow)
// ============================================================================

async function handlePandocExport(config) {
  const templateKey = document.getElementById('export-template')?.value;
  const stripFrontmatter = document.getElementById('export-strip-frontmatter').checked;
  const extension = config.extension;

  // Check pandoc
  if (!pandocStatus.installed) {
    alert('Pandoc ist nicht installiert.\n\nInstalliere mit:\nsudo apt install pandoc texlive-xetex texlive-fonts-recommended texlive-latex-extra');
    return;
  }

  const currentFileName = State.currentFilePath.split('/').pop().replace(/\.md$/, '');
  const defaultFileName = currentFileName + extension;

  const saveResult = await window.api.showSaveDialog(State.currentWorkingDir, defaultFileName);
  if (saveResult.canceled || !saveResult.filePath) {
    return;
  }

  const markdown = State.currentEditor.getMarkdown();

  let pandocArgs = [];
  if (config.templates && templateKey) {
    pandocArgs = [...config.templates[templateKey].args];
  } else if (config.args) {
    pandocArgs = [...config.args];
  }

  document.getElementById('export-modal').classList.remove('active');
  showStatus(`Exportiere ${config.name}...`, 'saving');

  const result = await window.api.pandocExport({
    markdown,
    outputPath: saveResult.filePath,
    format: document.getElementById('export-format').value,
    pandocArgs,
    stripFrontmatter
  });

  if (result.success) {
    showStatus(`Exportiert: ${config.name}`, 'saved');
    const open = confirm(`Export erfolgreich!\n\n${result.outputPath}\n\nDatei im System öffnen?`);
    if (open) {
      await window.api.openInSystem(result.outputPath);
    }
  } else {
    showStatus(`Export fehlgeschlagen: ${result.error}`, 'error');
    alert(`Export-Fehler:\n\n${result.error}`);
  }
}

// ============================================================================
// Electron PDF Export (template-based printToPDF)
// ============================================================================

async function handleElectronExport(config) {
  const templateId = config.templateId;

  // 1. Load template files
  const tmpl = await window.api.readTemplateFiles(templateId);
  if (!tmpl.success) {
    alert(`Template-Fehler: ${tmpl.error}`);
    return;
  }

  // 2. Collect assets from frontmatter or file picker
  const assets = await collectAssets(tmpl.meta.fields);
  if (!assets) {
    return; // User canceled
  }

  // 3. Save dialog
  const currentFileName = State.currentFilePath.split('/').pop().replace(/\.md$/, '');
  const saveResult = await window.api.showSaveDialog(State.currentWorkingDir, currentFileName + '.pdf');
  if (saveResult.canceled || !saveResult.filePath) {
    return;
  }

  document.getElementById('export-modal').classList.remove('active');
  showStatus(`Exportiere ${config.name}...`, 'saving');

  // 4. Get markdown and convert to HTML via Pandoc
  let markdown = State.currentEditor.getMarkdown();
  markdown = markdown.replace(/^---\n[\s\S]*?\n---\n\n?/, ''); // Strip frontmatter

  const htmlResult = await window.api.pandocToHtml(markdown);
  if (!htmlResult.success) {
    showStatus('Markdown-Konvertierung fehlgeschlagen', 'error');
    alert(`Pandoc HTML-Konvertierung fehlgeschlagen:\n\n${htmlResult.error}`);
    return;
  }

  // 5. Assemble HTML from template
  const metadata = State.currentFileMetadata || {};
  const assembledHtml = assembleTemplate(tmpl.html, tmpl.css, htmlResult.html, metadata, assets);

  // 6. Export via Electron printToPDF
  const result = await window.api.electronPdfExport({
    assembledHtml,
    outputPath: saveResult.filePath,
  });

  if (result.success) {
    showStatus(`Exportiert: ${config.name}`, 'saved');

    // Save asset paths to frontmatter for next time
    saveAssetsToFrontmatter(templateId, assets);

    const open = confirm(`Export erfolgreich!\n\n${result.outputPath}\n\nDatei im System öffnen?`);
    if (open) {
      await window.api.openInSystem(result.outputPath);
    }
  } else {
    showStatus(`Export fehlgeschlagen: ${result.error}`, 'error');
    alert(`Export-Fehler:\n\n${result.error}`);
  }
}

async function collectAssets(fields) {
  if (!fields || !fields.length) {
    return {};
  }

  // Try to load existing values from frontmatter
  const ttExport = State.currentFileMetadata?.TT_export?.template_data || {};
  const saved = ttExport['seminar-handout'] || {};
  const docDir = State.currentFilePath ? State.currentFilePath.replace(/[^/]+$/, '') : '';
  const assets = {};

  for (const field of fields) {
    // Check if we have a saved path
    if (saved[field.key]) {
      // Offer to keep existing or replace
      const fileName = saved[field.key].split('/').pop();
      const replace = confirm(
        `"${field.label}" ist bereits gesetzt:\n${fileName}\n\nNeu auswählen? (Abbrechen = behalten)`
      );

      if (!replace) {
        assets[field.key] = saved[field.key];
        continue;
      }
    }

    // For required fields (or user chose to replace), prompt file picker
    if (field.required || saved[field.key]) {
      const result = await window.api.showOpenDialog({
        title: `${field.label} auswählen`,
        defaultPath: docDir,
        filters: field.type === 'image'
          ? [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }]
          : [{ name: 'Alle Dateien', extensions: ['*'] }],
      });

      if (result.canceled) {
        if (field.required && !saved[field.key]) {
          return null; // User canceled required field selection
        }
        // Keep old value if available
        if (saved[field.key]) {
          assets[field.key] = saved[field.key];
        }
      } else {
        assets[field.key] = result.filePath;
      }
    }
  }

  // For optional fields without saved values, prompt once
  for (const field of fields) {
    if (!field.required && !assets[field.key]) {
      const wantAsset = confirm(`Optional: "${field.label}" hinzufügen?`);
      if (wantAsset) {
        const result = await window.api.showOpenDialog({
          title: `${field.label} auswählen`,
          defaultPath: docDir,
          filters: field.type === 'image'
            ? [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }]
            : [{ name: 'Alle Dateien', extensions: ['*'] }],
        });
        if (!result.canceled) {
          assets[field.key] = result.filePath;
        }
      }
    }
  }

  return assets;
}

function assembleTemplate(templateHtml, templateCss, contentHtml, metadata, assets) {
  const title = metadata.title || 'Dokument';
  const author = metadata.author || '';
  const date = metadata.date || new Date().toLocaleDateString('de-DE');
  const year = new Date().getFullYear();
  const authorShort = author.split('\n')[0] || '';

  // Build logo img tag (or empty string)
  const logoImg = assets.logo
    ? `<img class="logo" src="file://${assets.logo}" alt="Logo">`
    : '';

  // Cover image as file:// URL
  const coverImage = assets.cover_image
    ? `file://${assets.cover_image}`
    : '';

  // Font paths: resolve relative to app directory
  const appDir = window.location.href.replace(/\/renderer\/.*$/, '');
  const resolvedCss = templateCss.replace(
    /url\(\.\.\/\.\.\/weasyprint\/report\//g,
    `url(${appDir}/weasyprint/report/`
  );

  const replacements = {
    styles: resolvedCss,
    content: contentHtml,
    title,
    author,
    author_short: authorShort,
    date,
    year: String(year),
    cover_image: coverImage,
    logo_img: logoImg,
  };

  let output = templateHtml;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(`{{${key}}}`).join(value ?? '');
  }
  return output;
}

function saveAssetsToFrontmatter(templateId, assets) {
  if (!State.currentFileMetadata || !Object.keys(assets).length) {
    return;
  }

  const updated = {
    ...State.currentFileMetadata,
    TT_export: {
      ...(State.currentFileMetadata.TT_export || {}),
      default_template: templateId,
      template_data: {
        ...(State.currentFileMetadata.TT_export?.template_data || {}),
        [templateId]: assets,
      },
    },
  };

  State.currentFileMetadata = updated;

  // Persist: re-save the file with updated frontmatter
  const content = State.currentEditor.getMarkdown();
  const fullFile = stringifyFile(updated, content);
  window.api.saveFile(State.currentFilePath, fullFile);
}

// Export function for external use
export { checkPandocStatus };
