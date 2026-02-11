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
          '-V', 'linestretch=1.5',
          '-V', 'header-includes=\\usepackage{titletoc}\\titlecontents{section}[0em]{\\vspace{0.5em}\\bfseries}{\\contentslabel{2em}}{}{\\titlerule*[0.5em]{.}\\contentspage}\\titlecontents{subsection}[2em]{}{\\contentslabel{2.5em}}{}{\\titlerule*[0.5em]{.}\\contentspage}\\titlecontents{subsubsection}[4.5em]{\\small}{\\contentslabel{3em}}{}{\\titlerule*[0.5em]{.}\\contentspage}'
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

async function updateExportDialog(format, selectedTemplate) {
  const config = FORMAT_CONFIGS[format];
  const templateContainer = document.getElementById('export-template-container');
  const templateSelect = document.getElementById('export-template');
  const infoEl = document.getElementById('export-template-info');
  const assetsContainer = document.getElementById('export-assets-container');

  // Electron-based formats: show asset fields instead of info text
  if (config.engine === 'electron') {
    templateContainer.style.display = 'none';
    infoEl.style.display = 'none';
    assetsContainer.style.display = 'block';

    // Load template metadata to get field definitions
    const tmpl = await window.api.readTemplateFiles(config.templateId);
    if (tmpl.success) {
      renderAssetFields(tmpl.meta.fields, assetsContainer);
    } else {
      assetsContainer.innerHTML = `<div class="export-error">Template-Fehler: ${tmpl.error}</div>`;
    }
    return;
  }

  // Hide asset fields for non-electron formats
  assetsContainer.style.display = 'none';

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
    showErrorWithCopy('Export-Fehler', result.error);
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
    showErrorWithCopy('Template-Fehler', tmpl.error);
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

  // 6. Export via appropriate engine (WeasyPrint or Electron printToPDF)
  let result;
  try {
    if (tmpl.meta.engine === 'weasyprint') {
      result = await window.api.weasyprintExport({
        htmlContent: assembledHtml,
        outputPath: saveResult.filePath
      });
    } else {
      // Fallback to Electron printToPDF
      result = await window.api.electronPdfExport({
        assembledHtml,
        outputPath: saveResult.filePath,
      });
    }

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
      showErrorWithCopy('Export-Fehler', result.error);
    }
  } catch (error) {
    // Catch thrown errors (e.g., from WeasyPrint not installed)
    showStatus('Export fehlgeschlagen', 'error');
    showErrorWithCopy('Export-Fehler', error.message);
  }
}

// Show error dialog with copy button
function showErrorWithCopy(title, message) {
  const modal = document.createElement('div');
  modal.className = 'modal active error-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <h2 style="color: #d32f2f; margin-top: 0;">${title}</h2>
      <pre style="background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-height: 400px; font-size: 11px; line-height: 1.4;">${message}</pre>
      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
        <button id="copy-error-btn" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
          <span class="material-icons" style="font-size: 18px; vertical-align: middle;">content_copy</span>
          Kopieren
        </button>
        <button id="close-error-btn" style="padding: 8px 16px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Schließen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Copy button
  document.getElementById('copy-error-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(message).then(() => {
      const btn = document.getElementById('copy-error-btn');
      btn.innerHTML = '<span class="material-icons" style="font-size: 18px; vertical-align: middle;">check</span> Kopiert!';
      setTimeout(() => {
        btn.innerHTML = '<span class="material-icons" style="font-size: 18px; vertical-align: middle;">content_copy</span> Kopieren';
      }, 2000);
    });
  });

  // Close button
  document.getElementById('close-error-btn').addEventListener('click', () => {
    modal.remove();
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

function renderAssetFields(fields, container) {
  if (!fields || !fields.length) {
    container.innerHTML = '';
    return;
  }

  // Load existing values from frontmatter
  const ttExport = State.currentFileMetadata?.TT_export?.template_data || {};
  const saved = ttExport['seminar-handout'] || {};

  let html = '';
  fields.forEach(field => {
    const savedPath = saved[field.key] || '';
    const requiredLabel = field.required ? ' *' : '';

    html += `
      <div class="export-form-group export-asset-field">
        <label>${field.label}${requiredLabel}</label>
        <div class="asset-input-wrapper">
          <input
            type="text"
            class="asset-path-input"
            data-field-key="${field.key}"
            value="${savedPath}"
            placeholder="${field.required ? 'Erforderlich' : 'Optional'}"
            readonly
            title="${savedPath}"
          />
          <button class="asset-browse-btn" data-field-key="${field.key}" data-field-type="${field.type}">
            <span class="material-icons">folder_open</span>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Attach event listeners to browse buttons
  container.querySelectorAll('.asset-browse-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const fieldKey = btn.getAttribute('data-field-key');
      const fieldType = btn.getAttribute('data-field-type');
      const input = container.querySelector(`.asset-path-input[data-field-key="${fieldKey}"]`);

      // Find the label from the parent .export-asset-field
      const fieldContainer = btn.closest('.export-asset-field');
      const label = fieldContainer?.querySelector('label')?.textContent.replace(' *', '') || 'Datei auswählen';

      // Determine default directory: use directory of existing asset, or markdown file directory
      let defaultPath = '';
      if (input.value) {
        // Use directory of currently selected asset
        defaultPath = input.value.replace(/[^/]+$/, '');
      } else if (State.currentFilePath) {
        // Use directory of markdown file
        defaultPath = State.currentFilePath.replace(/[^/]+$/, '');
      }

      const result = await window.api.showOpenDialog({
        title: label,
        defaultPath,
        filters: fieldType === 'image'
          ? [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }]
          : [{ name: 'Alle Dateien', extensions: ['*'] }],
      });

      if (!result.canceled) {
        input.value = result.filePath;
        input.title = result.filePath;
      }
    });
  });
}

async function collectAssets(fields) {
  if (!fields || !fields.length) {
    return {};
  }

  const assets = {};
  const assetsContainer = document.getElementById('export-assets-container');

  // Read values from input fields
  for (const field of fields) {
    const input = assetsContainer.querySelector(`.asset-path-input[data-field-key="${field.key}"]`);
    if (!input) continue;

    const value = input.value.trim();
    if (value) {
      assets[field.key] = value;
    } else if (field.required) {
      alert(`Bitte wähle ein ${field.label} aus.`);
      return null; // Cancel export
    }
  }

  return assets;
}

function assembleTemplate(templateHtml, templateCss, contentHtml, metadata, assets) {
  const author = metadata.author || '';
  const date = metadata.date || new Date().toLocaleDateString('de-DE');
  const year = new Date().getFullYear();
  const authorShort = author.split('\n')[0] || '';

  // Extract first h1 from content for cover title
  const h1Match = contentHtml.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const coverTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '') : (metadata.title || 'Dokument');

  // Remove first h1 from content (it goes on cover)
  const contentWithoutFirstH1 = h1Match
    ? contentHtml.replace(/<h1[^>]*>.*?<\/h1>/is, '')
    : contentHtml;

  // Build logo img tag (or empty string)
  const logoImg = assets.logo
    ? `<img class="logo" src="file://${assets.logo}" alt="Logo">`
    : '';

  // Build cover logo img tag (100px width, fixed at bottom)
  const logoImgCover = assets.logo
    ? `<img class="cover-logo" src="file://${assets.logo}" alt="Logo">`
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
    content: contentWithoutFirstH1,  // Content WITHOUT first h1
    title: coverTitle,  // First h1 text OR frontmatter title
    author,
    author_short: authorShort,
    date,
    year: String(year),
    cover_image: coverImage,
    logo_img: logoImg,
    logo_img_cover: logoImgCover,
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
