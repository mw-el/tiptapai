# Export HTML-Placeholder Fix

## Problem

TipTap AI nutzt ein HTML-Escape-System um HTML-Tags, Hugo-Shortcodes und andere spezielle Markup vor dem TipTap-Parser zu schützen:

1. **Beim Laden**: HTML wird mit Platzhaltern ersetzt (`XHTMLX123X`)
2. **Im Editor**: User sieht und editiert Platzhalder
3. **Beim Speichern**: Platzhalter werden zurück in HTML konvertiert

**Vor dem Fix:**
- Export nutzte `editor.getMarkdown()` direkt
- Markdown enthielt **Platzhalter statt echtem HTML**
- Exportierte PDFs/DOCX hatten `XHTMLX123X` im Text

## Lösung

Export-Dialog nutzt jetzt `unescapeHtml()` vor dem Export:

```javascript
// Get markdown content (with HTML placeholders)
const markdownWithPlaceholders = State.currentEditor.getMarkdown();

// Unescape HTML: Replace XHTMLX placeholders with original HTML/shortcodes
const markdown = unescapeHtml(markdownWithPlaceholders, State.currentHtmlMap);

// Export with real HTML
await window.api.pandocExport({ markdown, ... });
```

## Technische Details

### HTML-Escape System

**Dateien:**
- `renderer/utils/html-escape.js` - Escape/Unescape Funktionen
- `renderer/document/session-manager.js` - Verwendet beim Load/Save
- `renderer/ui/export-dialog.js` - Jetzt auch beim Export

**State:**
- `State.currentHtmlMap` - Mapping von Platzhaldern zu Original-HTML
- Wird beim Laden einer Datei gefüllt
- Persistiert während der Session

### Geschützte Patterns

```javascript
// HTML comments
<!--...-->

// Hugo shortcodes
{{< ... >}}
{{< ... />}}

// HTML tags
<div>, </div>, <br>, <hr>, <img ... />
<span style="...">, etc.
```

### Workflow

```
Datei laden:
  Raw MD → escapeHtml() → XHTMLX123X → TipTap Editor
                  ↓
            State.currentHtmlMap = { "XHTMLX123X": "<div>..." }

Export:
  TipTap Editor → getMarkdown() → XHTMLX123X → unescapeHtml()
                                                      ↓
                                              <div>...</div> → Pandoc
```

## Testing

**Test-Dokument:** `/tmp/test-html-export.md`

Enthält:
- Inline HTML (`<strong>`, `<span>`)
- Block HTML (`<div>`, `<ul>`)
- Hugo Shortcodes (`{{< ... >}}`)
- HTML Kommentare (`<!-- ... -->`)
- Selbstschließende Tags (`<hr>`, `<br>`, `<img />`)

**Erwartetes Verhalten:**
- Export enthält **echtes HTML**, nicht Platzhalter
- Pandoc kann HTML korrekt verarbeiten
- PDF/DOCX zeigen HTML-Formatierung

## Commit

```bash
git add renderer/ui/export-dialog.js
git commit -m "fix(export): unescape HTML placeholders before export

- Import unescapeHtml from html-escape.js
- Replace XHTMLX placeholders with original HTML before sending to Pandoc
- Prevents placeholder strings in exported PDFs/DOCX
- Same logic as saveFile() in session-manager.js"
```

## Related Files

- [renderer/ui/export-dialog.js](../renderer/ui/export-dialog.js)
- [renderer/utils/html-escape.js](../renderer/utils/html-escape.js)
- [renderer/document/session-manager.js](../renderer/document/session-manager.js)
- [renderer/editor/editor-state.js](../renderer/editor/editor-state.js)
