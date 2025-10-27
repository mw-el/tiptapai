# Instructions for Claude Opus - LanguageTool Offset Bug Fix

**Date:** 2025-10-26
**Status:** ACTIVE - Debugging Phase
**Context:** Continuing from Haiku session, model switch for better reasoning

---

## THE PROBLEM (In One Sentence)

LanguageTool error positions (0-based offsets in stripped markdown) don't match TipTap editor positions (1-based ProseMirror tree positions), causing error markers to appear at wrong locations in documents with lists/blockquotes.

---

## CRITICAL DATA FROM LATEST DEBUG RUN

**Actual Numbers (REAL, not theoretical):**

```
markdown.length: 14412                    (content sent to LanguageTool)
fullMarkdown.length: 14412                (same - no frontmatter!)
frontmatterLength: 0                      (confirmed: NO FRONTMATTER)
currentEditor.state.doc.content.size: 14358  (what TipTap has)

⚠️ DIFFERENCE: 14412 - 14358 = 54 CHARACTERS MISMATCH
```

**Sample Error from Debug Log:**

```
Error 1:
  Raw LT offset: 4140-4151
  Error text: "überttragen"
  markdown[4140]="ü", markdown[4150]="n"
  TipTap pos will be: 4141-4152
  (but error appears at WRONG location in editor)
```

---

## KEY ARCHITECTURAL FACTS

### Document Loading Pipeline (renderer/app.js)

```javascript
// Line 751: loadFile() calls parseFile()
const { metadata, content } = parseFile(result.content);  // STRIPS frontmatter

// Line 768: Editor gets ONLY content (no frontmatter)
currentEditor.commands.setContent(html);
```

### Error Marking Pipeline (renderer/app.js, ~line 1000+)

```javascript
// Gets FULL markdown from editor
const fullMarkdown = currentEditor.getMarkdown();  // Line 1004

// Current implementation strips frontmatter BEFORE sending to LanguageTool
const frontmatterMatch = fullMarkdown.match(/^---\n[\s\S]*?\n---\n/);
if (frontmatterMatch) {
  frontmatterLength = frontmatterMatch[0].length;
  markdown = fullMarkdown.substring(frontmatterLength);  // Strip for LT
}

// Send STRIPPED content to LanguageTool
const matches = await checkText(markdown, language);  // Line 1033

// But then offsets are applied with +1 for TipTap
const tiptapFrom = from + 1;  // Line 1171
const tiptapTo = to + 1;      // Line 1172
```

---

## THE MYSTERY: 54-CHARACTER DIFFERENCE

**What we know:**
- `getMarkdown()` returns 14412 chars
- `editor.getText()` or `doc.content.size` is 14358 chars
- Difference: 54 chars

**Why this matters:**
- LanguageTool positions are for 14412-char text
- But we're trying to mark positions in 14358-char editor
- Result: All error positions are ~54 chars off

**Possible causes:**
1. Extra line breaks or formatting in `getMarkdown()`?
2. Blockquote/list syntax that's in markdown output but not rendered in editor?
3. Escape sequences or special characters?
4. TipTap node structure that adds/removes whitespace?

---

## INVESTIGATION IN PROGRESS

**Added Debug Output** in renderer/app.js (lines 1115-1128):

```javascript
debugLog.push(`DIFFERENCE: ${markdown.length - currentEditor.state.doc.content.size} chars`);

// Show first 300 chars
debugLog.push(`markdown: ${markdown.substring(0, 300).replace(/\n/g, '\\n')}`);
const editorText = currentEditor.getText();
debugLog.push(`editor text: ${editorText.substring(0, 300).replace(/\n/g, '\\n')}`);

// Show last 300 chars
debugLog.push(`markdown: ${markdown.substring(markdown.length - 300).replace(/\n/g, '\\n')}`);
debugLog.push(`editor: ${editorText.substring(editorText.length - 300).replace(/\n/g, '\\n')}`);
```

**Debug Output Location:** `/tmp/renderer-debug.log`

---

## HOW TO PROCEED

### Step 1: Analyze Content Difference
- Read `/tmp/renderer-debug.log` after user clicks "Scan"
- Compare first 300 chars: look for extra newlines, markdown syntax, etc.
- Compare last 300 chars: see if document ends differently
- Find WHERE the 54-char difference appears

### Step 2: Identify Root Cause
Once you know WHAT the difference is:
- If extra `\n` characters: count them and adjust offset
- If markdown syntax (e.g., `- ` for lists): understand how editor represents it
- If escape sequences: decode them
- If TipTap node boundaries: check how ProseMirror tree is structured

### Step 3: Implement Global Fix
Apply offset correction to ALL error positions:

```javascript
// Pseudocode
const offset = calculateOffset(markdown, editorText);  // e.g., 54

filteredMatches.forEach((match) => {
  const from = match.offset + offset;  // Adjust ALL positions
  const to = match.offset + match.length + offset;

  // Then apply to editor with +1 for TipTap
  const tiptapFrom = from + 1;
  const tiptapTo = to + 1;

  setMark(tiptapFrom, tiptapTo);
});
```

### Step 4: Test & Verify
- Run app, load document with errors
- Click "Scan"
- Verify error markers appear at CORRECT locations
- Test with "Scan again"
- Test with different documents (lists, blockquotes, mixed)

---

## FILES TO MODIFY

### renderer/app.js
- **runLanguageToolCheck()** function (~line 1000-1200)
  - Current: Attempts frontmatter stripping (but doc has no frontmatter!)
  - Fix: Once root cause found, apply correct offset adjustment here
  - Key lines: 1004 (getMarkdown), 1018-1033 (frontmatter logic), 1130-1180 (error marking)

### renderer/languagetool.js
- **convertMatchToMark()** function (~line 142-179)
  - Current: Returns `{ from: match.offset, to: match.offset + match.length }`
  - May need: Offset parameter to adjust positions

### preload.js / main.js
- ✅ Already added `writeDebugLog()` IPC handler for file-based logging

---

## PREVIOUS ATTEMPTS (DON'T REPEAT)

1. **Frontmatter stripping approach** (commits ba0d998, c22ee16, 6ac6979)
   - ❌ Didn't work because document has NO frontmatter
   - But stripping logic might be useful if offset is frontmatter-related

2. **Double-counting offset** (commit c22ee16)
   - ❌ Added frontmatterLength both to variable AND to offset calculation
   - Result: Made positioning worse

3. **getMarkdown() API switch** (commits 568f58e, 82ce818)
   - ✅ Correct decision (vs getText())
   - But offset issue still exists even with correct API

---

## TESTS TO RUN

### After implementing fix:

```bash
# Kill old app and start fresh
pkill -9 electron npm
npm start

# In app:
# 1. Open document with lists/blockquotes
# 2. Click Scan
# 3. Check if error markers are at correct words
# 4. Click "Scan again"
# 5. Verify markers stay correct

# Expected: All error red squiggles align perfectly with misspelled words
# Current: Error markers appear 40-50+ characters away from actual errors
```

---

## DEBUG LOG ANALYSIS CHECKLIST

When you see `/tmp/renderer-debug.log` output:

- [ ] Check if `DIFFERENCE:` is still 54 or different
- [ ] Compare markdown vs editor first 300 chars character-by-character
- [ ] Look for: extra `\n`, markdown syntax (`- `, `> `, etc.), escape sequences
- [ ] Compare last 300 chars to see if document end differs
- [ ] Calculate: at which position in document does the difference start?
- [ ] Count: how many characters of each type are different?

---

## GIT CONTEXT

**Last commit:** `4f99a3d` (feat(core-fix): Implement smart tree position resolution for error markers)
**Current branch:** main
**Build system:** esbuild (IIFE format - no external modules allowed except via IPC)

---

## CONTACT POINTS IF STUCK

If you hit a wall:
1. Check `/tmp/renderer-debug.log` - it has the actual numbers
2. Add more granular logging (compare char-by-char sections)
3. Test with simple document (no lists) to isolate issue
4. Check if the 54-char difference is consistent across different documents

---

## REMEMBER

**This is NOT about theory.** We have REAL DATA now:
- 14412 vs 14358 character difference
- Actual error positions from LanguageTool
- Actual content from both markdown source and editor

**Your job:** Find WHERE the 54 chars are hidden and adjust offsets accordingly.

Good luck! 🚀
