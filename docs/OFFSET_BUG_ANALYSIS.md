# LanguageTool Offset Bug - Root Cause Analysis

**Date:** 2025-10-26
**Status:** Analysis Complete - Awaiting Validation
**Author:** Claude Code

---

## Problem Statement

When user applies multiple corrections in sequence, later corrections (especially towards the end of document) are placed at **wrong positions**.

**Observed Behavior:**
- Early corrections: Work correctly ✅
- Later corrections: Positioned incorrectly ❌
- Pattern: Gets worse the further into document

**Example from Console Logs:**
```
Match 2: offset=5511, length=9, text="erklären,"
Error 1: "erklären," at 5511-5520

Match 3: offset=5526, length=14, text="rechtfertigen"
Error 2: "rechtfertigen" at 5526-5540
```

Visual result: Wrong words are underlined in red.

---

## Initial Hypotheses (Tested)

### ❌ Hypothesis 1: LanguageTool Offsets Are Wrong
**Tested:** Yes
**Result:** FALSE

Evidence:
- `currentEditor.getText()` returns raw markdown text
- LanguageTool offsets match exactly when verified against raw text
- "erklären," = 9 characters (e-r-k-l-ä-r-e-n-,) ✓
- "rechtfertigen" = 14 characters ✓
- Offsets are mathematically correct

### ❌ Hypothesis 2: appliedCorrections Array Gets Cleared
**Tested:** Yes
**Result:** PARTIALLY - This was a bug, but NOT the root cause of offset rendering

Evidence:
- Found that `appliedCorrections = []` was in `runLanguageToolCheck()`
- This caused loss of offset adjustments between corrections
- **FIXED:** Now appliedCorrections only cleared on file load, not on every check
- But marking still appears wrong even after this fix

### ❌ Hypothesis 3: Offset Calculation Math Is Wrong
**Tested:** Yes
**Result:** FALSE

The `calculateAdjustedOffset()` function logic is mathematically sound:
```javascript
if (originalFrom >= correction.to) {
  adjustment += correction.delta;
}
```

This correctly accumulates deltas from previous corrections.

---

## Root Cause Analysis - THE REAL ISSUE ⚠️

### The Problem: TipTap/ProseMirror Position System

**Critical Discovery:** There are **TWO different position systems** that are being mixed:

#### System 1: Raw Text Offsets
- Used by: LanguageTool API
- How it works: Character positions in plain text string
- Example: "Hallo Welt" → position 6 = "W"
- Nature: Linear, simple

#### System 2: TipTap/ProseMirror Document Tree Positions
- Used by: TipTap Editor
- How it works: Positions in a **tree of nodes**, not linear text
- Example: `Doc(pos=1) > Paragraph > Text "Hallo Welt"(pos=1-11)`
- Nature: **Non-linear, structure-aware**

### The Mismatch

```
Raw Text Position System (LanguageTool):
"Hallo Welt noch ein Test"
 012345678901234567890

TipTap Position System (Document Tree):
Doc(1)
  └─ Paragraph(2-25)
     └─ Text "Hallo Welt noch ein Test"(2-25)
```

**Key Difference:** TipTap adds +1 for Document-Start-Node, BUT this +1 is not sufficient when document has complex structure (lists, blockquotes, tables, multiple paragraphs).

### Why This Breaks Correction Positions

In code (app.js lines 829-833):
```javascript
currentEditor
  .chain()
  .setTextSelection({ from: from + 1, to: to + 1 })  // ← Simple +1 adjustment
  .setLanguageToolError({ ... })
  .run();
```

**The Problem:**
- `from` and `to` are **raw text offsets** (0-based, linear)
- `from + 1` assumes TipTap position = raw position + 1
- This works for simple text at document start
- This **FAILS** when:
  - Text has paragraph boundaries
  - Text has list items
  - Text has different block nesting
  - Offset is in middle/end of document

**Example of Failure:**

Document structure:
```
Para 1: "Fluch oder Segen..."
Para 2: "Marie Curie widmete..."
Para 3: "Können lassen sich..."
Para 4: "Ihr Handeln beruht..." [contains "erklären" at raw offset 5511]
```

When we do:
```javascript
setTextSelection({ from: 5511+1, to: 5520+1 })
```

We're setting position 5512-5521, but because of the paragraph boundaries and tree structure above it, the actual rendered position is **different in the visual document**!

---

## Proposed Solution

### Core Fix: Map Raw Offsets to TipTap Tree Positions

Instead of blindly using `from+1`:

```javascript
function resolvePositionInTree(rawOffset, editor) {
  // Strategy: Find the actual node position by:
  // 1. Iterate through editor's document tree
  // 2. Calculate cumulative text positions accounting for node structure
  // 3. Map raw text offset to actual tree position

  let nodePos = 1; // Start after Doc node
  let textPos = 0;

  editor.state.doc.descendants((node, nodeOffset) => {
    if (node.isText) {
      // For text nodes, track text position
      const nodeTextEnd = textPos + node.text.length;
      if (rawOffset >= textPos && rawOffset <= nodeTextEnd) {
        // Found the containing node
        return nodeOffset + (rawOffset - textPos);
      }
      textPos = nodeTextEnd;
    }
  });

  // Fallback for edge cases
  return rawOffset + 1;
}
```

### Implementation Strategy

1. **Create `resolveRawOffsetToTreePos(rawOffset, editor)`**
   - Takes raw text offset from LanguageTool
   - Returns correct TipTap tree position
   - Accounts for paragraph boundaries, nesting, etc.

2. **Use in Mark Setting**
   ```javascript
   const tiptapPos = resolveRawOffsetToTreePos(from, currentEditor);
   const tiptapEndPos = resolveRawOffsetToTreePos(to, currentEditor);

   currentEditor
     .chain()
     .setTextSelection({ from: tiptapPos, to: tiptapEndPos })
     .setLanguageToolError({ ... })
     .run();
   ```

3. **Also Use in Correction Application** (applySuggestion)
   - When applying correction, resolve position again
   - This ensures even after text changes, positions are correct

---

## Why This Hasn't Been Obvious

1. **Simple documents work fine** - If document is just one paragraph, the +1 adjustment happens to work
2. **TipTap abstracts complexity** - The tree structure isn't immediately visible
3. **Off-by-one errors are subtle** - They compound with each mark, becoming noticeable only towards end
4. **No clear error messages** - TipTap silently places marks at slightly wrong positions

---

## Validation Checklist

Before implementing, verify:

- [ ] Is TipTap really using tree-based positions? (Not linear text positions?)
- [ ] Does `editor.state.doc.descendants()` actually iterate in correct order?
- [ ] Are there built-in TipTap utilities for raw→tree position conversion?
- [ ] Has anyone solved this problem in TipTap/ProseMirror community?

---

## Alternative Approaches

### A1: Use ProseMirror's Built-in Resolution
```javascript
const $pos = editor.state.doc.resolve(treePosition);
```
Check if TipTap exposes position resolution utilities.

### A2: Don't Use setTextSelection, Use Direct Node Manipulation
Directly manipulate the node tree to add marks, bypassing text selection altogether.

### A3: Disable Complex Structure in Editor
Remove support for lists/blockquotes to keep document flat - but this defeats purpose of rich editor.

---

## Files to Change

1. **renderer/app.js**
   - Add `resolveRawOffsetToTreePos()` function
   - Use it when setting marks (line ~833)
   - Use it when applying corrections (line ~1570)

2. **renderer/languagetool.js** (optional)
   - Add verification that offsets are reasonable

---

## Risk Assessment

**Low Risk** - This is a core logic fix, not a hack
- Solution is theoretically sound (based on how ProseMirror works)
- Changes are localized to mark setting/correction logic
- No breaking changes to API

**Implementation Complexity** - Medium
- Need deep understanding of TipTap/ProseMirror tree structure
- Need to test with various document structures
- Edge cases: empty lines, special characters, unicode

---

## References

- TipTap Documentation: https://tiptap.dev
- ProseMirror Guide: https://prosemirror.net/docs/guide/
- ProseMirror Position System: https://prosemirror.net/docs/ref/#model.Node

---

**Status:** Ready for Second Opinion
**Next Steps:** Validate hypothesis with another AI model or ProseMirror expert
