# TipTap AI - Export Feature (PDF/Word)

**Status:** Planned - Not Started
**Date:** 2025-10-28 16:00
**Priority:** Medium

---

## Overview

Add export functionality to convert markdown documents to PDF and Word (DOCX) formats using Pandoc.

---

## Requirements

### User Story
As a user, I want to export my markdown documents to PDF or Word format so that I can share them with others who prefer these formats.

### Acceptance Criteria
- [ ] Export button in UI (toolbar or file menu)
- [ ] Export to PDF option
- [ ] Export to Word (DOCX) option
- [ ] Preserve formatting (headings, lists, bold, italic, etc.)
- [ ] Handle frontmatter appropriately (either strip or include as metadata)
- [ ] Show progress indicator during export
- [ ] Error handling if Pandoc not installed

---

## Technical Approach

### Option 1: Pandoc (Recommended)
**Pros:**
- Industry standard for document conversion
- Excellent markdown support
- High-quality PDF output
- Preserves formatting perfectly

**Cons:**
- External dependency (user must install Pandoc)
- Need to handle missing Pandoc gracefully

**Implementation:**
```javascript
// Main process (main.js)
const { exec } = require('child_process');
const path = require('path');

async function exportToPDF(markdownContent, outputPath) {
  const tempMdPath = path.join(os.tmpdir(), 'temp-export.md');
  await fs.writeFile(tempMdPath, markdownContent);

  return new Promise((resolve, reject) => {
    exec(`pandoc "${tempMdPath}" -o "${outputPath}" --pdf-engine=xelatex`,
      (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(outputPath);
      }
    );
  });
}
```

### Option 2: Native Libraries
- **jsPDF** for PDF generation
- **docx** npm package for Word documents

**Pros:**
- No external dependencies
- Works out of the box

**Cons:**
- Limited formatting support
- May not handle complex markdown well
- Lower quality output

---

## Implementation Plan

### Phase 1: Pandoc Integration
1. **Check for Pandoc availability**
   - On app startup, check if Pandoc is installed
   - Show warning if not available
   - Provide installation instructions

2. **Add Export UI**
   - Add "Export" button to toolbar
   - Dropdown menu with options:
     - Export to PDF
     - Export to Word (DOCX)
   - Or add to File menu (Datei → Exportieren)

3. **Implement Export Functions**
   ```javascript
   // preload.js - Add IPC handlers
   exportToPDF: (markdownContent, filePath) =>
     ipcRenderer.invoke('export-to-pdf', markdownContent, filePath),
   exportToWord: (markdownContent, filePath) =>
     ipcRenderer.invoke('export-to-word', markdownContent, filePath),
   ```

4. **Handle Frontmatter**
   - Strip TT_* metadata (internal use only)
   - Convert YAML frontmatter to Pandoc metadata
   - Or completely strip frontmatter for clean exports

5. **Progress Indicator**
   - Show modal: "Exportiere Dokument..."
   - Close on success with "Export erfolgreich"
   - Show error message on failure

### Phase 2: PDF Styling (Optional)
- Custom CSS for PDF output
- Page headers/footers
- Custom fonts
- TOC (Table of Contents) generation

---

## File Structure

```
renderer/
├── export/
│   ├── export-pdf.js       # PDF export logic
│   ├── export-word.js      # Word export logic
│   └── pandoc-checker.js   # Check if Pandoc available
```

---

## User Workflow

1. User clicks "Export" button (or Datei → Exportieren)
2. Dropdown shows: PDF | Word
3. User selects format
4. File dialog opens: "Wo möchten Sie die Datei speichern?"
5. App shows progress: "Exportiere zu PDF..."
6. Success message: "Export erfolgreich: /path/to/file.pdf"
7. Optional: "Datei öffnen" button

---

## Error Handling

### Pandoc Not Installed
```
❌ Pandoc nicht gefunden

Um Dokumente zu exportieren, muss Pandoc installiert sein.

Installation:
• Ubuntu: sudo apt install pandoc texlive-xetex
• macOS: brew install pandoc
• Windows: Download von pandoc.org

[Installation-Anleitung öffnen] [Abbrechen]
```

### Export Failed
```
❌ Export fehlgeschlagen

Fehler beim Exportieren der Datei.
Details: [error message]

[Erneut versuchen] [Abbrechen]
```

---

## Dependencies

### Required
- Pandoc (external, user must install)
- For PDF: XeLaTeX or similar (usually part of texlive)

### Optional
- Custom CSS/template for PDF styling

---

## Testing Checklist

- [ ] Export to PDF with German Umlaute (ä, ö, ü, ß)
- [ ] Export with headings (H1-H6)
- [ ] Export with lists (ordered/unordered)
- [ ] Export with bold, italic, code
- [ ] Export with tables
- [ ] Export large documents (5000+ words)
- [ ] Export without Pandoc installed (show error)
- [ ] Cancel export mid-process

---

## Future Enhancements

- Export to HTML
- Export to EPUB (for e-readers)
- Batch export (multiple files)
- Custom PDF templates
- Include images in exports

---

## References

- Pandoc Documentation: https://pandoc.org/MANUAL.html
- XeLaTeX: https://www.xelatex.org/
- jsPDF (alternative): https://github.com/parallax/jsPDF
- docx npm package: https://www.npmjs.com/package/docx

---

**Next Steps:**
1. Install Pandoc on development machine
2. Test Pandoc with sample markdown files
3. Create export UI mockup
4. Implement Phase 1
