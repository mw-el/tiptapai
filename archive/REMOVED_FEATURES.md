# Removed Features - Simplification to LanguageTool Defaults

**Date:** 2025-10-26
**Reason:** Radical simplification to fix offset bugs by removing custom complexity
**Status:** 🚨 IN PROGRESS

---

## Features Removed (To Re-evaluate Later)

### 1. Error Navigator Sidebar (RIGHT PANEL)
**What was removed:**
- Entire right sidebar with scrollable error list
- Error context display (15 chars left/right + error word)
- Click-to-jump-to-error functionality
- Auto-scroll to center viewport errors in list
- Viewport error highlighting (in-viewport class)

**Why removed:**
- Requires complex offset tracking and viewport detection
- Offset conversions kept causing positioning bugs
- Not essential for core spell-checking functionality

**UI Elements removed:**
- `#error-navigator` div
- `.error-navigator`, `.error-list-container`, `.error-item` CSS
- `updateErrorNavigator()` function
- `jumpToError()` function
- `updateViewportErrors()` function
- Scroll event listener for viewport tracking

**Could be re-added as:** Simpler error list with basic navigation

---

### 2. Advanced Tooltip Features
**What was removed:**
- Drag-to-select suggestions
- Hover tooltip "fixed" state (right-click to dismiss)
- Context menu with Copy/Paste
- Multiple suggestion preview boxes
- Tooltip positioning logic

**Why removed:**
- Adds complexity without fixing core bug
- Not essential for applying corrections
- Can be simplified significantly

**Simplified tooltip now shows:**
- Error message
- List of suggestions (click to apply)
- "Ignore" button
- That's it!

---

### 3. Viewport-based Error Checking
**What was removed:**
- Viewport boundary detection
- Partial document checking (only viewport)
- Viewport error state management
- Scroll position synchronization

**Why removed:**
- All the offset conversion code needed here was buggy
- Check entire document instead (simpler, works fine)

**Now:** Always check entire document at once

---

### 4. Complex Offset Conversions
**What was removed:**
- All the math converting between:
  - LanguageTool offsets (raw text)
  - TipTap offsets (with +1 for Document-Start-Node)
  - Error Navigator context positions

**Why removed:**
- This was the SOURCE OF ALL BUGS
- Too many places to convert = too many places to mess up

**Now:** Single rule: Store raw, add +1 ONLY when using with TipTap

---

## Features Kept (Core Functionality)

✅ Error highlighting (underlines)
✅ Popup with error message and suggestions
✅ Click to apply suggestion
✅ "Ignore" button (per-session)
✅ Personal dictionary (localStorage)
✅ Language selection
✅ Auto-check on edit (debounced)
✅ Save/Load with frontmatter

---

## Metrics

| Aspect | Before | After | Change |
|--------|--------|-------|--------|
| Error handling code | ~500 lines | ~200 lines | -60% |
| Offset conversion points | 5+ locations | 1 location | Centralized |
| CSS for error UI | ~150 lines | ~50 lines | Simpler |
| Potential bug locations | Many | Few | Much safer |

---

## Re-evaluation Checklist

When re-adding features, check:

- [ ] Corrections work at 100% correct position?
- [ ] No offset bugs reappear?
- [ ] Code stays simple and maintainable?
- [ ] Performance still good?
- [ ] No new bugs introduced?

Only re-add feature if ALL boxes checked.

---

## Files Modified

- `renderer/index.html` - Remove error-navigator div
- `renderer/app.js` - Remove complex functions, simplify tooltip
- `renderer/styles.css` - Remove error-navigator CSS, simplify tooltip styles

---

## Next Steps

1. ✅ Create this document
2. ⏳ Remove Error Navigator HTML/CSS
3. ⏳ Remove complex tracking functions
4. ⏳ Simplify tooltip to basic version
5. ⏳ Build and test
6. ⏳ Let user experiment and give feedback
