# WeasyPrint Integration Plan for TipTap AI Export

**Purpose**  
This document specifies the target behavior, architecture, and implementation plan for integrating WeasyPrint-based PDF export into TipTap AI. It is intended as a handoff document for development, with concrete design decisions, file structure, and code-level guidance.  

**Engineering Principles**  
Apply these guidelines everywhere in the implementation.
- Fail Fast: validate inputs early and return clear errors.
- DRY: avoid repeated logic across export engines.
- Separation of Concerns: renderer UI, IPC bridge, and main-process execution are cleanly separated.
- KISS: prefer simple, composable primitives over complex frameworks.
- Professional coding standards: clear naming, typed interfaces where possible, consistent error handling.

---

**Goal**  
Add a second export engine (WeasyPrint) alongside the existing Pandoc export, with:
- Template selection in the export dialog.
- Template-specific “requirements” (assets and metadata) collected via a generated UI mask.
- Persistence of selected template and template inputs in the document’s Frontmatter.
- A clean template folder structure and manifest-based metadata to scale.

**Non-Goals**  
- Replacing or removing the existing Pandoc export.
- Auto-embedding binary assets inside Markdown.
- Complex visual editor for templates.

---

**Current Context (Repo State)**  
The repo already has:
- Pandoc export pipeline in `main.js` with IPC handlers.  
- Export dialog UI in `renderer/ui/export-dialog.js` and markup in `renderer/index.html`.  
- Frontmatter handling in `renderer/frontmatter.js`.  
- Markdown is the source of truth; export uses `State.currentEditor.getMarkdown()`.

This integration should extend the existing export flow without breaking Pandoc.

---

**Template Organization**

**Recommended folder layout**
```
templates/
  weasyprint/
    modern-report/
      template.html
      style.css
      meta.json
      assets/
    clean/
      template.html
      style.css
      meta.json
      assets/
  pandoc/
    eisvogel/
      template.latex
      meta.json
      assets/
```

**Rationale**
- Each template is a self-contained package: HTML/CSS or LaTeX, assets, and manifest.
- `meta.json` defines the template’s identity, description, and required inputs.
- Assets are local to the template to avoid global asset sprawl.

---

**Frontmatter Model**

Store selected template and user-provided inputs under a dedicated key.

**Proposed Frontmatter shape**
```yaml
---
title: "Report Q1"
TT_export:
  default_template: "weasyprint/modern-report"
  template_data:
    weasyprint/modern-report:
      cover_image: "assets/cover.jpg"
      signature: "assets/signature.png"
      subtitle: "Management Summary"
---
```

**Rules**
- `default_template` is empty until user selects one.
- On export, update `TT_export.default_template` with the selected template.
- Template field values live under `TT_export.template_data[templateId]`.
- Values are stored as strings or simple scalars only.
- Paths are relative to the document folder to preserve portability.

---

**Template Manifest (`meta.json`)**

Each template declares its requirements so the UI can generate a form.

**Example**
```json
{
  "id": "modern-report",
  "engine": "weasyprint",
  "name": "Modern Report",
  "description": "Cover page with image, subtitle, and signature",
  "fields": [
    { "key": "cover_image", "label": "Titelbild", "type": "image", "required": true },
    { "key": "subtitle", "label": "Untertitel", "type": "text", "required": false },
    { "key": "signature", "label": "Unterschrift", "type": "image", "required": false }
  ]
}
```

**Field types**
- `text`
- `image`
- `file`
- `color`
- `boolean`

**Validation policy**
- Required fields must be non-empty.
- `image` and `file` must resolve to readable files at export time.
- Any unknown field types should fail fast with a user-facing error.

---

**UI Behavior**

**Export Dialog**
- Add a new format entry: `PDF (WeasyPrint)`.
- When WeasyPrint is selected, show a template dropdown.
- When a template is selected:
  - Load its `meta.json`.
  - Render a requirements form based on `fields`.
  - Pre-fill values from Frontmatter if present.
  - Save any changes back into Frontmatter on export.

**User flow**
1. Open export dialog.
2. Choose `PDF (WeasyPrint)`.
3. Select a template.
4. Fill in required assets.
5. Click export.
6. Frontmatter is updated with defaults.

**Fail Fast UX**
- If WeasyPrint is not installed, show a blocking warning with install hints.
- If required assets are missing, show validation errors before export.
- If template files are missing, show a clear error message.

---

**Rendering Strategy**

**WeasyPrint export pipeline**
1. Convert Markdown to HTML using Pandoc in HTML mode, or by using the editor’s HTML output.  
2. Wrap content into the selected template.
3. Apply template CSS.
4. Call WeasyPrint to generate PDF.

**Recommended approach**
- Use Pandoc to produce “clean” HTML from Markdown, so the template can be consistent.
- Use `--base-url` set to the document directory so relative assets resolve.

**HTML Assembly**
- `template.html` should include placeholders:
  - `{{styles}}` in `<style>`.
  - `{{content}}` for main body.
  - Additional placeholders for common metadata: `{{title}}`, `{{subtitle}}`, `{{author}}`, `{{date}}`.
- At export time, do a simple string replace.

---

**Backend Integration**

**New IPC handlers**
- `weasyprint-check`: detect availability and version.
- `weasyprint-export`: assemble HTML, write temp file, call WeasyPrint, clean up.

**Process execution**
- Try `weasyprint` binary first.
- Fall back to `python -m weasyprint`.
- Fail fast if neither exists.

**Timeout**
- Use a reasonable timeout (60s) and return a helpful error if exceeded.

---

**Renderer Integration**

**New format config**
Add a new format definition similar to Pandoc formats.

**Pseudo-code**
```javascript
const FORMAT_CONFIGS = {
  pdf_weasyprint: {
    name: 'PDF (WeasyPrint)',
    extension: '.pdf',
    engine: 'weasyprint',
    templates: { /* loaded dynamically from templates/weasyprint */ }
  }
};
```

**Template discovery**
- On dialog open, read `templates/weasyprint/*/meta.json`.
- Map `id` and `name` into dropdown options.
- Cache results in memory.

---

**Template Asset Handling**

**Goal**
- Keep assets per-document and per-template.

**Rules**
- Asset paths stored in Frontmatter are relative to the document folder.
- `--base-url` is set to the document folder when calling WeasyPrint.
- Template-local assets live under `templates/weasyprint/<template>/assets/`.
- Template-local assets should be referenced by CSS using relative paths.

---

**WeasyPrint Samples: Report Template Findings**

The sample `report` template in `weasyprint/report` has no formal requirements manifest.  
All dependencies are implicit in `report.css`:
- Font files: `FiraSans-*.ttf`
- Cover image: `report-cover.jpg`
- Icon SVGs: `table-content.svg`, `heading.svg`, `multi-columns.svg`, `internal-links.svg`, `style.svg`

If this is adopted as a real template, these should be declared in `meta.json`.

---

**Implementation Phases**

**Phase 1: Engine + Templates**
1. Add WeasyPrint IPC handlers.
2. Add WeasyPrint format entry in UI.
3. Add template discovery + selection.
4. Export using HTML content with a default template.

**Phase 2: Requirements UI**
1. Add `meta.json` loader.
2. Generate input form from `fields`.
3. Save values in Frontmatter.
4. Validate fields before export.

**Phase 3: Polishing**
1. Better error strings and localization.
2. Template preview thumbnail in the dialog.
3. Optional “Use as default for this document” toggle.

---

**Testing Strategy**
- Unit tests for manifest parsing and frontmatter read/write.
- UI tests for template selection, form validation, and persistence.
- Manual tests for asset resolution and PDF generation.

---

**Risks and Mitigations**
- WeasyPrint availability varies by OS. Mitigate with clear install checks and guidance.
- Large assets increase PDF render time. Mitigate by warnings and file size checks.
- HTML/CSS features not supported by WeasyPrint. Mitigate with documented template constraints.

---

**Reference Code Blocks**

**Frontmatter update**
```javascript
const updatedMetadata = {
  ...State.currentFileMetadata,
  TT_export: {
    ...(State.currentFileMetadata.TT_export || {}),
    default_template: selectedTemplateId,
    template_data: {
      ...(State.currentFileMetadata.TT_export?.template_data || {}),
      [selectedTemplateId]: formValues
    }
  }
};
```

**Template HTML placeholder replacement**
```javascript
function applyTemplate({ templateHtml, templateCss, contentHtml, metadata }) {
  const replacements = {
    styles: templateCss,
    content: contentHtml,
    title: metadata?.title || 'Untitled'
  };

  let output = templateHtml;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(`{{${key}}}`).join(value ?? '');
  }
  return output;
}
```

---

**Summary**
This plan adds a robust WeasyPrint export pipeline with template selection, asset requirements, and Frontmatter persistence. It respects existing export infrastructure, scales with additional templates, and keeps the implementation clean and maintainable.

