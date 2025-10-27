# Critical Learnings - TipTap AI

**DO NOT MODIFY THESE SOLUTIONS WITHOUT CAREFUL TESTING**

This document captures critical implementation decisions that were hard-won through extensive debugging. Changing these patterns will break core functionality.

---

## 1. Markdown Conversion: MUST Use TipTap Native APIs

### ❌ WRONG: Custom HTML/Markdown Converters

```javascript
// NEVER DO THIS - incomplete and breaks lists, blockquotes, line breaks
function htmlToMarkdown(html) {
  let markdown = html;
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/g, '# $1\n');
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  // ... more regex that WILL corrupt content
  return markdown;
}

function markdownToHTML(markdown) {
  // Similar regex-based conversion - WILL fail
}
```

**Problem:** Custom regex-based converters:
- Don't handle lists (bullets get lost)
- Don't handle blockquotes (> symbols appear as text)
- Don't handle nested structures
- Break line breaks and paragraphs
- Corrupt files on every save

### ✅ CORRECT: TipTap Native APIs

```javascript
// LOADING: Markdown → Editor
currentEditor.commands.setContent(markdownContent, {
  contentType: 'markdown'
});

// SAVING: Editor → Markdown
const markdown = currentEditor.getMarkdown();
```

**Why This Works:**
- TipTap's `@tiptap/markdown` extension handles ALL markdown syntax correctly
- Preserves lists, blockquotes, tables, formatting
- Bidirectional conversion is lossless
- Files remain clean markdown

**API Details:**
- `setContent()` takes 2 parameters: `(content, options)`
- Options must include `{ contentType: 'markdown' }` for markdown parsing
- `getMarkdown()` is called directly on editor instance (NOT `editor.storage.markdown.getMarkdown()`)

---

## 2. LanguageTool Offset Positioning

### The Challenge

LanguageTool returns character offsets in plain text, but TipTap operates on a ProseMirror document tree. Mapping between these is complex because:

1. Markdown has formatting syntax (`**bold**`) that becomes nodes in the tree
2. Lists, headings, blockquotes have structural overhead
3. Frontmatter is stripped before checking but affects all positions

### ✅ CORRECT: Use getMarkdown() for Text Source

```javascript
async function runLanguageToolCheck() {
  // Get plain text AND markdown to detect formatting
  const text = currentEditor.getText();
  const markdown = currentEditor.getMarkdown();

  // Send TEXT to LanguageTool (no markdown syntax)
  const response = await fetch('http://localhost:8081/v2/check', {
    method: 'POST',
    body: new URLSearchParams({
      text: text,  // Plain text
      language: 'de-CH'
    })
  });
}
```

### ✅ CORRECT: ProseMirror Position Resolution

```javascript
function applyLanguageToolMarks(matches) {
  matches.forEach(match => {
    const textOffset = match.offset;

    // Walk ProseMirror tree to find position
    let currentTextPos = 0;
    let editorPos = null;

    currentEditor.state.doc.descendants((node, pos) => {
      if (node.isText) {
        const nodeTextLength = node.text.length;
        if (currentTextPos + nodeTextLength > textOffset) {
          editorPos = pos + (textOffset - currentTextPos);
          return false; // Stop iteration
        }
        currentTextPos += nodeTextLength;
      }
    });

    // Apply mark at resolved position
    if (editorPos !== null) {
      currentEditor.commands.setTextSelection({
        from: editorPos,
        to: editorPos + match.length
      });
      currentEditor.commands.setMark('languageToolMark', {
        errorId: match.rule.id,
        // ... more data
      });
    }
  });
}
```

**Critical Points:**
- NEVER use HTML positions - they include tags
- Use `getText()` for LanguageTool submission
- Use `getMarkdown()` for format detection (bullets, bold, etc.)
- Walk ProseMirror tree node-by-node to map text offsets to editor positions
- Account for applied corrections with offset tracking

---

## 3. Raw Markdown Modal

### ❌ WRONG: Show Only Current Block

```javascript
// DON'T DO THIS - confuses users
function showRawMarkdown() {
  const node = getCurrentNode(); // Only one paragraph
  const markdown = htmlToMarkdown(nodeHTML); // And wrong converter!
  textarea.value = markdown; // User sees fragment
}
```

### ✅ CORRECT: Show Complete Document

```javascript
function showRawMarkdown() {
  // Show ENTIRE document
  const markdown = currentEditor.getMarkdown();

  // Calculate cursor position in markdown
  const cursorPos = currentEditor.state.selection.from;
  const totalTextLength = currentEditor.state.doc.textContent.length;
  const cursorRatio = cursorPos / totalTextLength;
  const markdownCursorPos = Math.floor(markdown.length * cursorRatio);

  textarea.value = markdown;

  // Scroll to current position
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(markdownCursorPos, markdownCursorPos);

    const lineHeight = 20;
    const lines = markdown.substring(0, markdownCursorPos).split('\n').length;
    textarea.scrollTop = Math.max(0, (lines - 10) * lineHeight);
  }, 100);
}

function closeRawModal() {
  const newMarkdown = textarea.value;

  // Reload ENTIRE document with TipTap native parsing
  currentEditor.commands.setContent(newMarkdown, {
    contentType: 'markdown'
  });

  // Modal closes
  document.getElementById('raw-modal').classList.remove('active');
}
```

**Why:**
- Users expect to see and edit the complete file
- Partial editing is confusing and error-prone
- TipTap handles reloading the entire document efficiently

---

## 4. File Persistence: Markdown is Single Source of Truth

### Principle

The `.md` file on disk is the ONLY source of truth. Never store state in:
- HTML format
- Editor-internal JSON
- Separate databases (no SQLite for MVP)

### ✅ CORRECT: Save Flow

```javascript
async function saveFile() {
  // 1. Get markdown from editor
  const markdown = currentEditor.getMarkdown();

  // 2. Update frontmatter metadata
  const updatedMetadata = {
    ...currentFileMetadata,
    lastEdit: new Date().toISOString(),
    lastPosition: currentEditor.state.selection.from,
    zoomLevel: currentZoomLevel,
    scrollPosition: editorElement.scrollTop
  };

  // 3. Combine frontmatter + markdown
  const fileContent = stringifyFile(updatedMetadata, markdown);

  // 4. Write to disk
  await window.api.saveFile(currentFilePath, fileContent);
}
```

### ✅ CORRECT: Load Flow

```javascript
async function loadFile(filePath) {
  // 1. Read from disk
  const result = await window.api.loadFile(filePath);

  // 2. Parse frontmatter
  const { metadata, content } = parseFile(result.content);

  // 3. Load markdown into editor with TipTap native parsing
  currentEditor.commands.setContent(content, {
    contentType: 'markdown'
  });

  // 4. Restore cursor position
  if (metadata.lastPosition) {
    setTimeout(() => {
      currentEditor.commands.setTextSelection(metadata.lastPosition);
    }, 100);
  }
}
```

**Critical:**
- Never save HTML - it contains rendering artifacts
- Never use custom converters - they corrupt content
- Frontmatter stores metadata (position, zoom, etc.)
- Markdown body stores actual content

---

## 5. Common Pitfalls to Avoid

### ❌ Don't Mix HTML and Markdown
```javascript
// WRONG - editor contains HTML, you're inserting markdown strings
const html = currentEditor.getHTML();
html = html.replace('old', 'new'); // Brittle and breaks
currentEditor.commands.setContent(html);
```

### ❌ Don't Use Wrong API Syntax
```javascript
// WRONG - setContent takes 2 params, not 3
currentEditor.commands.setContent(content, false, { contentType: 'markdown' });

// CORRECT
currentEditor.commands.setContent(content, { contentType: 'markdown' });
```

### ❌ Don't Use Wrong getMarkdown Path
```javascript
// WRONG - this doesn't exist
currentEditor.storage.markdown.getMarkdown();

// CORRECT
currentEditor.getMarkdown();
```

---

## 6. Testing Critical Paths

Before any major refactor, test these scenarios:

### Test 1: Markdown Round-Trip
1. Create file with lists, bold, headings, blockquotes
2. Open in TipTap AI
3. Make small edit
4. Save
5. Open file in VS Code
6. **Expected:** All markdown syntax intact, no HTML tags

### Test 2: LanguageTool Positioning
1. Create file with errors at different positions
2. Include lists and formatting around errors
3. Run LanguageTool check
4. **Expected:** Underlines appear at exact error positions

### Test 3: Raw Markdown Modal
1. Open large file (10+ pages)
2. Scroll to middle
3. Click Raw Markdown button
4. **Expected:** Modal shows full file, scrolled to current position
5. Make edit in modal
6. Close modal
7. **Expected:** Edit applied, document re-rendered correctly

---

## Version History

- **2025-10-27**: Initial documentation after fixing markdown corruption and LanguageTool offset bugs
- **Critical Commits:**
  - `798cf2b`: fix(markdown): use TipTap native markdown conversion
  - `792256b`: fix(languagetool): solve offset bug using ProseMirror tree detection

---

## References

- TipTap Markdown API: https://tiptap.dev/docs/editor/markdown
- TipTap setContent: https://tiptap.dev/docs/editor/api/commands/content/set-content
- ProseMirror Document Model: https://prosemirror.net/docs/guide/#doc
