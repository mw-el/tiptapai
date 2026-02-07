# WeasyPrint Integration Plan for TipTap AI Export

**Last Updated:** 2025-02-07
**Status:** Ready for Implementation

---

## Executive Summary

Add WeasyPrint as a second PDF export engine to enable professional layouts with:
- ✅ True two-column layouts
- ✅ Page numbering with custom styling (margin boxes)
- ✅ First page without page number
- ✅ Full CSS support (flexbox, grid, columns)
- ✅ Template-based exports with asset management

**Core Principle:** KISS - Minimal code changes, maximum leverage of WeasyPrint's capabilities.

---

## Why WeasyPrint?

### Current Limitation: Electron printToPDF

Electron's Chromium-based printToPDF does NOT support:
- ❌ CSS `columns` (multi-column layout)
- ❌ `@page` margin boxes (styled page numbers)
- ❌ Excluding first page from numbering
- ❌ Advanced CSS pagination

### WeasyPrint Advantages

- ✅ Full CSS Paged Media Level 3 support
- ✅ Print-quality typography
- ✅ Professional layouts (reports, magazines, handouts)
- ✅ HTML/CSS workflow (no new language like LaTeX)
- ✅ Small footprint (~150 MB with dependencies)

**Analogy:** WeasyPrint is to Pandoc what Pandoc is to `cat` - a specialized tool for the job.

---

## Installation & Environment

### Conda Environment (Recommended)

WeasyPrint has native C dependencies (Cairo, Pango). Conda manages them cleanly.

```bash
# Create isolated environment
conda create -n weasyprint python=3.11 -y

# Activate
conda activate weasyprint

# Install WeasyPrint
pip install weasyprint

# Verify
weasyprint --version
# → WeasyPrint version 61.2

# Note the path
which weasyprint
# → /home/matthias/miniconda3/envs/weasyprint/bin/weasyprint
```

**Installation size:** ~150 MB (including Cairo, Pango, GdkPixbuf)

### Why Conda?

- ✅ Isolated from system Python
- ✅ Conda handles C dependencies automatically
- ✅ Easy to update/remove
- ✅ No sudo required
- ✅ Reproducible across machines

---

## Implementation Strategy: KISS Approach

### Phase 1: Standalone Testing (BEFORE integration)

**Goal:** Validate WeasyPrint works with our templates BEFORE writing integration code.

```bash
# 1. Test existing report.html
cd ~/tiptapai/weasyprint/report
weasyprint report.html test-output.pdf
# Compare with report.pdf - does it match?

# 2. Create test HTML for seminar-handout template
# Manually assemble: template.html + style.css + sample content
weasyprint test-handout.html handout-test.pdf

# 3. Verify:
# - Two-column layout works?
# - Cover page correct?
# - Page numbers styled?
# - First page without number?
```

**Only proceed to Phase 2 if Phase 1 succeeds!**

### Phase 2: Minimal Integration

**NO new files.** Only extend existing code:

| File | Change | Lines |
|------|--------|-------|
| `main.js` | Add WeasyPrint IPC handler + path detection | ~40 |
| `preload.js` | Expose WeasyPrint API | 1 |
| `renderer/ui/export-dialog.js` | Add engine routing | ~20 |
| `templates/seminar-handout/meta.json` | Set `"engine": "weasyprint"` | 1 |
| `templates/seminar-handout/template.html` | Wrap content in `<article>` | 2 |
| `templates/seminar-handout/style.css` | Add @page rules | ~15 |

**Total:** ~80 lines of code changes, zero new files.

---

## Code Implementation

### 1. Backend: main.js

```javascript
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Auto-detect WeasyPrint path on startup
let weasyprintBin = null;
try {
  const condaEnvs = execSync('conda info --envs', { encoding: 'utf-8' });
  const weasyprintLine = condaEnvs.split('\n')
    .find(line => line.includes('weasyprint'));

  if (weasyprintLine) {
    const envPath = weasyprintLine.trim().split(/\s+/).pop();
    weasyprintBin = path.join(envPath, 'bin', 'weasyprint');
    console.log('✓ WeasyPrint found:', weasyprintBin);
  }
} catch (e) {
  console.warn('WeasyPrint not detected. Install: conda create -n weasyprint python=3.11 && pip install weasyprint');
}

// New IPC Handler
ipcMain.handle('weasyprint-export', async (event, { htmlContent, outputPath }) => {
  if (!weasyprintBin) {
    throw new Error('WeasyPrint nicht installiert.\n\nInstallation:\n  conda create -n weasyprint python=3.11\n  conda activate weasyprint\n  pip install weasyprint');
  }

  const tmpHtml = path.join(os.tmpdir(), `tiptap-wp-${Date.now()}.html`);

  try {
    // Write HTML to temp file
    await fs.writeFile(tmpHtml, htmlContent, 'utf-8');

    // Spawn WeasyPrint
    await new Promise((resolve, reject) => {
      const proc = spawn(weasyprintBin, [
        tmpHtml,
        outputPath,
        '--pdf-variant', 'pdf/a-3b',
        '--optimize-size', 'all'
      ]);

      let stderr = '';
      proc.stderr.on('data', chunk => stderr += chunk);

      proc.on('close', code => {
        if (code === 0) {
          console.log('✓ WeasyPrint export successful:', outputPath);
          resolve();
        } else {
          reject(new Error(`WeasyPrint failed (code ${code}):\n${stderr}`));
        }
      });

      proc.on('error', err => {
        reject(new Error(`Could not start WeasyPrint: ${err.message}`));
      });
    });

    return { success: true, path: outputPath };
  } finally {
    // ALWAYS clean up temp file
    try {
      await fs.unlink(tmpHtml);
    } catch (e) {
      console.warn('Could not delete temp file:', tmpHtml);
    }
  }
});
```

**Size:** ~35 lines of actual code

### 2. Preload: preload.js

```javascript
contextBridge.exposeInMainWorld('api', {
  // ... existing APIs ...

  // NEW: WeasyPrint export
  weasyprintExport: (options) => ipcRenderer.invoke('weasyprint-export', options),
});
```

### 3. Frontend: renderer/ui/export-dialog.js

```javascript
async function handleExport() {
  const selectedFormat = document.getElementById('export-format').value;

  // Load template
  const template = await loadTemplate(selectedFormat);

  // Collect assets
  const assets = await collectAssets(template.meta.assets);

  // Convert Markdown → HTML
  const contentHtml = await window.api.pandocToHtml(
    State.currentContent,
    { stripFrontmatter: true }
  );

  // Assemble complete HTML document
  const fullHtml = assembleTemplate(template, contentHtml, metadata, assets);

  // Save dialog
  const savePath = await window.api.showSaveDialog({
    defaultPath: `${metadata.title || 'dokument'}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (!savePath) return;

  try {
    // ENGINE ROUTING based on meta.json
    if (template.meta.engine === 'weasyprint') {
      await window.api.weasyprintExport({
        htmlContent: fullHtml,
        outputPath: savePath
      });
    } else {
      // Fallback to Electron printToPDF
      await window.api.electronPdfExport({
        assembledHtml: fullHtml,
        outputPath: savePath
      });
    }

    showStatus('✓ PDF erfolgreich erstellt', 'success');
  } catch (err) {
    showStatus(`Export fehlgeschlagen: ${err.message}`, 'error');
  }
}
```

**Change:** ~20 lines (just the engine routing if-statement)

### 4. Template: meta.json

```json
{
  "id": "seminar-handout",
  "name": "Seminar-Handout (2-spaltig)",
  "engine": "weasyprint",
  "assets": [
    {
      "key": "cover_image",
      "label": "Titelbild",
      "type": "image",
      "required": true
    },
    {
      "key": "logo",
      "label": "Logo",
      "type": "image",
      "required": false
    }
  ]
}
```

**Change:** Add `"engine": "weasyprint"` (1 line)

### 5. Template: template.html

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>{{title}}</title>
  <style>{{styles}}</style>
</head>
<body>
  <!-- Cover Page -->
  <article id="cover">
    <div class="cover-image" style="background-image: url('{{cover_image}}')"></div>
    <div class="cover-bottom">
      <h1>{{title}}</h1>
      {{logo_img_cover}}
    </div>
  </article>

  <!-- Main Content (wrapped for columns CSS) -->
  <article id="main-content">
    {{content}}
  </article>

  <!-- Copyright -->
  <article id="copyright">
    {{logo_img}}
    <h3>{{title}}</h3>
    <p>&copy; {{year}} {{author_short}}. Alle Rechte vorbehalten.</p>
  </article>
</body>
</html>
```

**Change:** Lines 20-22 - wrap `{{content}}` in `<article id="main-content">`

### 6. Template: style.css

```css
/* Add WeasyPrint-specific @page rules */

@page {
  size: A4;
  margin: 2cm 2.5cm;

  /* Page numbers in bottom center */
  @bottom-center {
    content: counter(page);
    font-size: 10pt;
    color: #666;
    background: #FF7B33;
    color: white;
    padding: 0.3cm 0.5cm;
    border-radius: 2px;
  }
}

/* First page: no margin, no page number */
@page :first {
  margin: 0;
  @bottom-center { content: none; }
}

/* Two-column layout for main content */
#main-content {
  columns: 2;
  column-gap: 1cm;
}

#main-content h1,
#main-content h2,
#main-content h3,
#main-content h4 {
  column-span: all;
}

#main-content p {
  text-align: justify;
  margin-bottom: 0.5cm;
}
```

**Change:** Add @page rules (~15 lines)

---

## Workflow Diagram

```
┌─────────────────────────────────────────┐
│   USER: Click "Export PDF Handout"      │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  export-dialog.js                       │
│  1. Load template (meta.json)           │
│  2. Collect assets (cover, logo)        │
│  3. Markdown → HTML (Pandoc)            │
│  4. Assemble HTML document              │
│  5. Check meta.engine                   │
└─────────────────────────────────────────┘
                  │
       ┌──────────┴──────────┐
       │                     │
       ▼                     ▼
┌─────────────┐    ┌─────────────────┐
│  Electron   │    │  WeasyPrint     │
│  printToPDF │    │  IPC Handler    │
└─────────────┘    └─────────────────┘
       │                     │
       │                     ▼
       │           ┌─────────────────┐
       │           │ Write temp.html │
       │           │ Spawn weasyprint│
       │           │ Clean up temp   │
       │           └─────────────────┘
       │                     │
       └──────────┬──────────┘
                  ▼
          ┌───────────────┐
          │  output.pdf   │
          └───────────────┘
```

---

## Testing Checklist

### Phase 1: Standalone

- [ ] WeasyPrint installed in conda env
- [ ] `weasyprint --version` works
- [ ] `weasyprint report.html test.pdf` matches report.pdf
- [ ] Manual test with seminar-handout template shows:
  - [ ] Two-column layout
  - [ ] Cover page correct
  - [ ] Page numbers styled
  - [ ] First page without number

### Phase 2: Integration

- [ ] Export dialog shows engine selection
- [ ] WeasyPrint engine calls IPC handler
- [ ] HTML document correctly assembled
- [ ] Assets resolve correctly (file:// URLs)
- [ ] Error handling shows clear messages
- [ ] Temp files cleaned up on success/failure

### Phase 3: Edge Cases

- [ ] WeasyPrint not installed → clear error
- [ ] Large document (50+ pages) → reasonable speed
- [ ] Special characters in filenames → works
- [ ] Missing required assets → validation error

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WeasyPrint not installed | High | High | Clear install instructions in error message |
| CSS incompatibility | Medium | Medium | Test standalone first (Phase 1) |
| Slow render (large docs) | Low | Medium | Show progress indicator, add timeout |
| Asset path resolution | Medium | High | Use `file://` absolute paths |
| Font loading issues | Low | Low | Bundle fonts in template |

---

## Comparison: WeasyPrint vs. LaTeX

| Criterion | WeasyPrint | LaTeX |
|-----------|------------|-------|
| Learning curve | ★☆☆☆☆ (HTML/CSS) | ★★★★★ (TeX markup) |
| Installation | ~150 MB | 3-6 GB |
| Typography quality | ★★★★☆ | ★★★★★ |
| Layout flexibility | ★★★★★ | ★★★☆☆ |
| Mathematical formulas | ★★☆☆☆ | ★★★★★ |
| Template customization | ★★★★★ | ★★☆☆☆ |
| Best for | Reports, magazines, handouts | Academic papers, books |

**For TipTap AI:** WeasyPrint is the clear choice (already using HTML/CSS templates).

---

## Future Enhancements (Out of Scope)

- Template preview thumbnails
- Live PDF preview while editing
- Custom page number formats
- Table of contents generation
- Multi-language hyphenation

---

## References

- **WeasyPrint Docs:** https://doc.courtbouillon.org/weasyprint/
- **CSS Paged Media:** https://www.w3.org/TR/css-page-3/
- **Existing report template:** `/weasyprint/report/`

---

## Summary

This plan integrates WeasyPrint using the KISS principle:
- ✅ Minimal code changes (~80 lines)
- ✅ No new files
- ✅ Test standalone before integration
- ✅ Leverages existing template system
- ✅ Clean error handling
- ✅ Isolated conda environment

**Next Step:** Phase 1 - Install WeasyPrint and test standalone.
