# Alternative Approach: Use HTML instead of Markdown for LanguageTool

**Proposed by:** User
**Date:** 2025-10-26
**Status:** Critical Analysis

---

## The Idea

Instead of:
1. Extract raw text from TipTap
2. Send to LanguageTool
3. Get offsets for raw text
4. Map to TipTap positions (complex!)
5. Correct and convert back

Do:
1. Get HTML from TipTap (`getHTML()`)
2. Send HTML to LanguageTool
3. Get offsets for HTML
4. Mark directly in HTML
5. No position conversion needed

---

## Analysis: This Will NOT Work ❌

### Problem 1: LanguageTool Doesn't Support HTML Input

**Evidence:**
- LanguageTool API accepts: `text` parameter (plain text only)
- LanguageTool API does NOT have `html` parameter
- All documentation shows: POST with `text=...` parameter

**What happens if you send HTML?**
```
Input to LanguageTool: "<p>Hallo <strong>Welt</strong></p>"
LanguageTool sees: The literal string "<p>Hallo <strong>Welt</strong></p>"
Not the semantic meaning!
```

LanguageTool will:
- Flag `<p>` as a typo (it's not a word)
- Flag `strong>` as a typo
- Completely break spell-checking
- Report errors at wrong positions (within HTML tags)

**Verification:** Check LanguageTool v6.6 API docs:
- Parameter: `text` (text to check)
- No parameter for HTML input
- No HTML stripping
- No semantic HTML understanding

### Problem 2: Even If LanguageTool Supported HTML...

Converting HTML positions back to text positions is **equally complex**:

```
HTML:  "<p>Hello <strong>World</strong></p>"
       0123456789...

Error at position 15 (in "World") in HTML
→ What's position 15 in raw text? "Hello World"?
  Position 15 doesn't exist in "Hello World"!

Why? Because HTML tags add ~30 characters!
```

**You're just moving the complexity, not solving it.**

---

## Problem 3: Text Extraction From HTML Is Lossy

When LanguageTool corrects text in HTML context:

```
Original HTML: "<p>The quick <em>brown</em> fox</p>"
LanguageTool checks: "The quick brown fox" (text extracted)

Finds error: "quuick" (typo) at position 4-10
Correction: "quick"

Question: How do we re-insert this into the original HTML?
Answer: We don't know! The position is for EXTRACTED text, not HTML!
```

**The HTML offset problem is fundamentally different:**
- HTML offsets include: `<`, `p`, `>`, `/`, attributes, etc.
- Text offsets are clean: just characters
- They're incommensurable

---

## Why This Seems Like It Would Work (But Doesn't)

The idea is intuitively appealing because:
- "HTML is what TipTap renders anyway"
- "Why convert back and forth?"
- "Just use HTML everywhere!"

**But this misunderstands the architecture:**
- LanguageTool is a **text processor**, not an HTML processor
- TipTap is an **HTML renderer**, not a text editor
- They serve fundamentally different purposes

---

## What You COULD Do With HTML (But Shouldn't)

### Option A: Strip HTML, Send Text, Rebuild

```javascript
// Get HTML from TipTap
const html = editor.getHTML();

// Extract text (remove HTML tags)
const text = html
  .replace(/<[^>]*>/g, '')  // Remove all tags
  .replace(/&nbsp;/g, ' ')   // Decode entities
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  // ... many more entity decodings

// Send to LanguageTool
const matches = await checkText(text);

// ??? Now we have offsets for STRIPPED text
// But TipTap uses TREE offsets, not HTML or text offsets
// We're back to square one!
```

**Result:** You'd just recreate the exact same problem.

### Option B: Use TipTap's Built-in HTML Parser

```javascript
const html = editor.getHTML();
// TipTap can parse HTML back into a ProseMirror document
const newDoc = schema.parseDOM(html);
```

**But then:** You're parsing HTML → tree, and we're back to the tree position problem that we started with!

---

## The Real Root Problem You're Identifying

You're noticing something true:
> "Why are we doing all this complex position conversion?"

**Answer:** Because there's a **fundamental impedance mismatch** in the architecture:

```
LanguageTool
    ↓ (returns text offsets)
Raw Text
    ↓ (loaded into)
TipTap/ProseMirror
    ↓ (uses tree offsets)
Document Tree
```

**The positions at each level are different!**

This is not a LanguageTool problem, not a Markdown problem, not an HTML problem.
**It's a TipTap/ProseMirror problem.**

---

## What COULD Actually Solve This

### Solution 1: Don't Use TipTap's Tree Structure ✓
Use a **flat editor** instead of TipTap:
- No paragraph nodes
- No nested structures
- Just plain text in one big `<textarea>`
- Then raw text offsets work perfectly

**Trade-off:** Lose rich formatting, tables, lists, etc.

### Solution 2: Store Positions Differently ✓
Instead of storing `from: 5511, to: 5520`:
- Store: `{node: paragraphId_4, localOffset: 215, length: 9}`
- This references the position within a specific node
- Survives document restructuring

**Trade-off:** More complex data structure

### Solution 3: Use Smart Position Resolution ✓ (Current Plan)
Keep current architecture but add:
- `resolveRawOffsetToTreePos()` function
- Maps raw text → tree position by accounting for node structure

**Trade-off:** Moderate complexity in resolution logic

---

## Your Idea in Context

| Aspect | Markdown Approach | HTML Approach |
|--------|-------------------|---------------|
| **LanguageTool Support** | ✓ (works natively) | ✗ (no HTML support) |
| **Position Complexity** | Text → Tree (hard) | HTML → Text → Tree (harder!) |
| **Implementation Effort** | ~200 lines | ~400 lines (more edge cases) |
| **Maintainability** | Medium | Low (more conversions) |
| **Error Prone** | High | Very High |
| **Performance** | Good | Slightly slower |

---

## Conclusion

**Your idea is NOT a solution; it's a distraction.**

Here's why:
1. LanguageTool doesn't accept HTML (architecturally impossible)
2. HTML position conversion is actually **harder** than text
3. You'd just move complexity, not eliminate it
4. We'd add more encoding/decoding steps (worse performance)

**What you're intuitively sensing is correct:**
> "This position conversion is complicated and ugly"

**But the solution is NOT to switch to HTML.**
The solution is:
- **Accept that text→tree position mapping is fundamental to ProseMirror**
- **Implement it properly with `resolveRawOffsetToTreePos()`**
- **This is how ALL ProseMirror-based editors handle this**

---

## What the Real Fix Looks Like

Not "use HTML instead", but:

```javascript
// LanguageTool gives us text offsets
const matches = await checkText(rawText);

// Convert text offset → tree offset intelligently
matches.forEach(match => {
  const treePos = resolveRawOffsetToTreePos(
    match.offset,  // Text offset from LanguageTool
    match.length,
    rawText,
    editor.state.doc
  );

  // Now marks work correctly across entire document
  applyMark(treePos);
});
```

This is:
- ✓ What all major editors do
- ✓ Theoretically sound
- ✓ Only moderate complexity
- ✓ No architectural changes needed

---

## My Recommendation

**Don't pursue the HTML approach.**

Instead:
1. Implement `resolveRawOffsetToTreePos()` properly
2. Study ProseMirror's `doc.descendants()` API thoroughly
3. Test extensively with various document structures
4. Document the solution for future maintainers

This is the RIGHT solution, even if it's not as intuitive as "just use HTML".

---

**Final Verdict:** ❌ Good instinct about complexity, but ✓ Wrong direction for solution.
