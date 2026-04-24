# Frontmatter Hypothesis - Debugging Analysis

**Date:** 2025-10-26
**Status:** Investigation

---

## The Observation

**User's Perfect Insight:**
> "Vorher war es nur eine kleine Verschiebung (wenige Zeichen). Das kann nicht vom Frontmatter kommen, weil Frontmatter Hunderte von Zeichen ist. ABER: Jetzt könnte es sein, dass wir das Frontmatter durch die neue Funktion miteinberechnen."

This is **exactly right**! Let me verify this hypothesis.

---

## Theory: resolveRawOffsetToTreePos() Includes Frontmatter

### What Changed:

**Before (Simple +1):**
```javascript
const treePos = from + 1;  // Just add 1, don't care about structure
```

**After (Tree Resolution):**
```javascript
const treePos = resolveRawOffsetToTreePos(from, ...);
// Iterates through doc.descendants()
// This includes ALL nodes, including frontmatter!
```

### The Problem:

If `currentEditor.getText()` returns text WITHOUT frontmatter, but the document tree INCLUDES frontmatter nodes, then:

```
Raw Text (from LanguageTool): "Können lassen sich... erklären..."
                               Position 5511 = "erklären"

Editor Tree:                  Doc > Paragraph(frontmatter) > Paragraph(main)
                               When we iterate descendants:
                               - Frontmatter nodes add offset
                               - Then main text nodes

resolveRawOffsetToTreePos thinks:
"Position 5511 must be in node X"
But node X is actually LATER in the tree due to frontmatter!
```

### Why This Explains The Behavior:

**Before:** Simple +1 ignored structure → partially worked by accident
**After:** Tree iteration sees frontmatter → calculates wrong position

---

## Verification Steps

### Step 1: What does currentEditor.getText() actually return?

```javascript
const text = currentEditor.getText();
console.log("Text length:", text.length);
console.log("First 500 chars:", text.substring(0, 500));
console.log("Contains '---'?", text.includes("---"));
```

### Step 2: What does the editor tree actually contain?

```javascript
currentEditor.state.doc.descendants((node, nodePos) => {
  if (node.type.name === 'paragraph' || node.type.name === 'code_block') {
    console.log(`Node: ${node.type.name}, pos=${nodePos}, text="${node.textContent?.substring(0, 30)}"`);
  }
});
```

### Step 3: Compare positions

If getText() excludes frontmatter but the tree includes it:
- Frontmatter might add 200-500 characters of offset
- When we look for "raw position 5511", we'd be in wrong place
- Error markers would be massively off

---

## The Real Fix (If This Is True)

### Option 1: Make getText() exclude frontmatter
```javascript
// Get text without frontmatter
const textWithoutFrontmatter = currentEditor.state.doc.textContent
  .split('\n---\n')
  .slice(1)  // Remove frontmatter
  .join('\n---\n');
```

Then send THAT to LanguageTool.

### Option 2: Adjust resolveRawOffsetToTreePos() to skip frontmatter
```javascript
function resolveRawOffsetToTreePos(rawOffset, rawLength, editor) {
  // First, figure out what the frontmatter offset is
  const fullText = editor.state.doc.textContent;
  const frontmatterEnd = fullText.indexOf('\n\n');

  // Adjust the raw offset to account for frontmatter
  const adjustedRawOffset = rawOffset + frontmatterEnd;

  // Then do tree resolution with adjusted offset
  // ...
}
```

### Option 3: Don't include frontmatter in tree at all
This would require architectural changes.

---

## How To Test This Theory Right Now

1. Open app
2. Load document
3. Open DevTools (F12)
4. Run in console:
```javascript
// Check if text includes frontmatter
const text = currentEditor.getText();
console.log("Full text length:", text.length);
console.log("Includes '---'?", text.includes("---"));
console.log("First 200 chars:", text.substring(0, 200));

// Check tree structure
let nodeCount = 0;
currentEditor.state.doc.descendants((node) => {
  if (node.type.name === 'paragraph') nodeCount++;
});
console.log("Number of paragraph nodes:", nodeCount);
```

5. Compare output with what you'd expect

---

## If This Hypothesis Is Correct

The fix is simple:
1. Revert resolveRawOffsetToTreePos() changes
2. Go back to simple `from + 1, to + 1`
3. BUT: Strip frontmatter from text BEFORE sending to LanguageTool
4. Adjust returned offsets by frontmatter length

---

## Why This Makes Sense

- **Before:** Frontmatter wasn't a problem because simple +1 didn't care about structure
- **After:** Tree iteration reveals the frontmatter, which throws off calculations
- **Observed:** Markers suddenly wrong by many characters (not just off-by-one)

This is a **regression caused by the fix attempt**, not a fundamental architecture problem!

---

**Next Steps:** Test the hypothesis above, then implement appropriate fix.
