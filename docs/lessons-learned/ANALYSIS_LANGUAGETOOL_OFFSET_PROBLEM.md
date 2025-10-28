# LanguageTool Offset Problem - Root Cause & Solution Analysis

**Date:** 2025-10-26
**Problem:** LanguageTool error markers appear at wrong positions, especially in complex documents
**Root Cause Identified:** getText() flattens the document structure, breaking position mapping

---

## The Real Problem (Not What We Thought Before)

### Current Implementation (BROKEN)
```
Editor (with structure)
  ↓ getText()
Flat text string (structure lost!)
  ↓ LanguageTool API
Raw offsets: [0, 5, 12, ...]
  ↓ Try to map back to tree positions (IMPOSSIBLE!)
Error marks at wrong positions
```

**Why this fails:**
1. `getText()` flattens everything into a string
2. Structure information is **lost**
3. We can't reliably map flat offsets back to tree positions
4. Different document structures produce different flattened text

### Example of Structure Loss
```
Document with lists:
- Item 1
- Item 2

Paragraph after list

getText() returns:
"Item 1Item 2Paragraph after list"

All structure markers are gone!
LanguageTool offsets don't know about the list structure.
When we try to apply them, the positions are wrong.
```

---

## The Right Solution: Work with Markdown (Not Flat Text!)

### Proposed Implementation (CORRECT)
```
Editor (with structure via Markdown extension)
  ↓ Use Markdown.getMarkdown() or editor.storage.markdown.getMarkdown()
Markdown source (structure preserved!)
  ↓ LanguageTool API
Raw offsets: [0, 5, 12, ...] (these are now positions in Markdown!)
  ↓ Find error positions in Markdown source
Apply corrections directly to Markdown
  ↓ Update editor from Markdown
Correct positions maintained!
```

**Why this works:**
1. Markdown preserves structure: `- Item`, `##`, `>`, etc.
2. Offsets are positions in the **source**, not the rendered tree
3. We can directly find and replace in Markdown
4. Structure is rebuilt when we load Markdown back into editor

### Example with Lists
```
Markdown source:
- Item 1
- Item 2

Paragraph after list

LanguageTool works with this exact text.
Offsets are correct for this text.
We find the error at offset X in this source.
We fix it in the source.
We reload the editor from the fixed source.
Done!
```

---

## Why getText() Causes the Problem

Let's trace what happens with getText():

```markdown
# Title

This is a paragraph.

- List item 1
- List item 2

Another paragraph.
```

When we call `getText()`:
```
getText() returns:
"Title

This is a paragraph.

List item 1List item 2

Another paragraph."
```

Notice:
- Heading markers (`#`) are gone
- List markers (`-`) are gone
- Structure is flattened
- Text is concatenated weirdly

Now LanguageTool finds an error at offset 50. But:
- In the flattened getText() version, offset 50 points to one place
- In the actual editor tree with proper structure, offset 50 points to a different place!
- **This mismatch causes wrong error positioning**

---

## Implementation Plan

### Step 1: Check if TipTap Markdown Extension Provides Direct Access
```javascript
// Check what the Markdown extension offers
console.log(currentEditor.storage);
// Should contain: markdown.getMarkdown() or similar
```

### Step 2: Replace getText() with Markdown Source
```javascript
// BEFORE (BROKEN)
let text = currentEditor.getText();
const matches = await checkText(text, language);

// AFTER (CORRECT)
// Get markdown source instead of flattened text
const markdownSource = getMarkdownSource(); // TBD implementation
const matches = await checkText(markdownSource, language);
```

### Step 3: Map LanguageTool Offsets Back to Markdown
Since offsets are now in markdown source:
```javascript
// Offsets from LanguageTool are positions in markdownSource
// We can directly find and replace there!

for (const match of matches) {
  const { offset, length } = match;

  // These offsets are correct for markdownSource!
  const errorText = markdownSource.substring(offset, offset + length);

  // To mark in editor: need to translate markdown position → tree position
  // But now this is much simpler because markdown is structured!
}
```

### Step 4: Apply Corrections Directly to Markdown
```javascript
function applySuggestion(markdownSource, offset, length, suggestion) {
  // Simple string replacement in markdown
  const corrected = markdownSource.substring(0, offset)
                  + suggestion
                  + markdownSource.substring(offset + length);

  // Reload editor from corrected markdown
  currentEditor.setContent(corrected); // or similar
}
```

---

## Technical Details

### TipTap Markdown Extension
The Markdown extension we're already using should provide:
- `editor.storage.markdown` - storage for markdown-related data
- Possibly `editor.state.doc.toMarkdown()` or similar
- Need to verify actual API

### Why This Is Better Than Complex Offset Mapping
1. **Simpler logic** - work with familiar string offsets
2. **More reliable** - offsets are directly in source
3. **Debugging easier** - can see markdown source vs offsets
4. **Extensible** - works for any markdown structure
5. **Correct** - not a workaround, a proper solution

---

## Potential Issues to Consider

### Character Encoding
- LanguageTool works with UTF-8 positions
- JavaScript uses UTF-16 internally
- Need to verify offset consistency
- Test with non-ASCII characters (ä, ö, ü, etc.)

### Markdown Rendering Consistency
- When we load markdown back, does TipTap render it the same way?
- Could there be differences in how markdown is interpreted?
- Need to test with complex markdown

### Position Translation Still Needed (Partially)
Even with markdown source, we still need to:
1. Find the offset in markdown source (✓ easy)
2. Translate that to tree position for marking in editor (✓ easier than before, because markdown is structured)

But this is much simpler than before because markdown has explicit structure (`-`, `#`, `>`, etc.)

---

## Next Steps

1. **Investigate** - Check what TipTap Markdown extension actually provides
2. **Prototype** - Create a simple version that uses markdown instead of getText()
3. **Test** - Verify with documents containing:
   - Lists
   - Multiple paragraphs
   - Headings
   - Blockquotes
   - Nested structures
4. **Implement** - Replace getText() with markdown source
5. **Fix offset mapping** - Leverage markdown structure for better position translation

---

## Why This Approach Is Different From Before

### Previous Attempts
- `resolveRawOffsetToTreePos()` - tried to map flat offsets to tree positions (HARD)
- Complex tree iteration - tried to reverse-engineer the structure (FRAGILE)
- +1 adjustment - bandaid fix that only works for simple cases (WRONG)

### New Approach
- Don't lose the structure in the first place!
- Use markdown source which preserves structure
- Offsets are meaningful in context of markdown
- Much simpler and more correct

---

## Conclusion

**The problem wasn't that we needed better offset mapping.**
**The problem was that we threw away the structure with getText().**

**The solution: Keep the structure by using markdown source.**

This is a paradigm shift:
- Don't: flatten → fix → map back to tree
- Do: keep structure → fix in structure → reload

---

**Ready to investigate and implement!**
