# Detaillierte Commit-Historie: Von 3c55b92 bis c2144a5

**Start-Commit:** `3c55b92` - feat(languagetool): Sprint 2.1 - LanguageTool Integration (18.10.2025)
**End-Commit:** `c2144a5` - feat(debug): Add comprehensive block structure offset analysis tool (26.10.2025)
**Zeitraum:** ~8 Tage Entwicklung

---

## Phase 1: Feature-Erweiterungen (19.10.2025 - 22.10.2025)

### 1. `a37d7cf` - feat: Sprint 2.2 - VSCode-style file tree + viewport optimization + desktop integration
**What:** Große Refactorierung des Layouts und File-Systems
**Changes:**
- VSCode-style hierarchical file tree
- Viewport-optimized layout
- Desktop integration improvements
- Window sizing adjustments
- File tree DOM structure changes
**Impact:** ✓ UI/UX Feature, **✗ LanguageTool nicht betroffen**

### 2. `572d521` - Fix desktop launcher to use Node.js 22 and add logging
**What:** Fix für Desktop-Starter
**Changes:**
- Node.js 22 Kompatibilität
- Logging hinzugefügt
**Impact:** ✓ Desktop Feature, **✗ LanguageTool nicht betroffen**

### 3. `7657713` - Disable Electron sandbox and add project-specific maintenance doc
**What:** Sandbox-Konfiguration
**Changes:**
- Electron sandbox disabled
- Dokumentation
**Impact:** ✓ Security/Config, **✗ LanguageTool nicht betroffen**

### 4. `ed2ac08` - Add dedicated desktop start script with --no-sandbox flag
**What:** Desktop-Launcher Script
**Changes:**
- Neues tiptapai-start.sh Script
- --no-sandbox Flag für Electron
**Impact:** ✓ Desktop Feature, **✗ LanguageTool nicht betroffen**

### 5. `ffabaa3` - feat: Add recent items history dropdown with icon buttons
**What:** History-Dropdown für zuletzt geöffnete Dateien
**Changes:**
- Recent items dropdown UI
- localStorage für History
- IPC handler für History management
**Impact:** ✓ File Management Feature, **✗ LanguageTool nicht betroffen**

### 6. `a687493` - refactor: Viewport-based layout with right control panel
**What:** Layout-Refactorierung
**Changes:**
- Control panel auf rechts
- Viewport-basiertes Layout
- CSS-Anpassungen
**Impact:** ✓ UI/UX, **✗ LanguageTool nicht betroffen**

### 7. `9db750c` - fix: Correct layout proportions and disable DevTools
**What:** Layout-Korrekturen
**Changes:**
- Proporz-Anpassungen (33%, 55%, 12%)
- DevTools disabled
- vw/vh statt Pixel
**Impact:** ✓ UI/UX, **✗ LanguageTool nicht betroffen**

### 8. `884a950` - feat: Move filename to window title and add table support
**What:** UI-Verbesserungen
**Changes:**
- Filename im Window Title
- Table Support (TipTap extensions)
- CSS für Tables
**Impact:** ✓ Editor Features, **✗ LanguageTool nicht betroffen**

### 9. `a304a3a` - feat: Light theme, UI improvements, and file tree enhancements
**What:** Theme und File Tree
**Changes:**
- Light theme (schreibszene.ch colors)
- File tree improvements
- Icon Updates
- Frontmatter Viewer updates
**Impact:** ✓ UI/Theme, **✗ LanguageTool nicht betroffen**

### 10. `fd3a436` - feat: Add bookmark feature - restore cursor position
**What:** Bookmark-Feature
**Changes:**
- lastPosition in Frontmatter speichern
- Auto-restore cursor position
- Metadata updates
**Impact:** ✓ User Features, **✗ LanguageTool nicht betroffen**

### 11. `4380a1e` - feat: Add zoom persistence fix and jump-to-error feature
**What:** Zoom + Error Navigation
**Changes:**
- Zoom persistence
- Jump-to-error Feature
- Doch erste Änderungen am LanguageTool Code!
**Impact:** ✓ Usability, **⚠️ LanguageTool-bezogen**

### 12. `b7e3aae` - feat(spell-check): Add pending verification state for corrections
**What:** Pending State für Korrektionen
**Changes:**
- UI für "pending" Zustand
- CSS für Pending-Klasse
**Impact:** ✓ UX, **⚠️ LanguageTool-bezogen**

### 13. `1530483` - feat(find-replace): Add typographic replacement options
**What:** Find & Replace mit Typografische Optionen
**Changes:**
- Find/Replace Modal
- Typography replacements (Anführungszeichen, Bindestriche, etc.)
**Impact:** ✓ Editor Feature, **✗ LanguageTool nicht betroffen**

### 14. `d20ac70` - feat: Save button visual feedback and fix quotation mark pair replacement
**What:** Save-Button Feedback
**Changes:**
- Save button state management
- Quotation mark handling
**Impact:** ✓ UX, **⚠️ LanguageTool-bezogen**

### 15. `12bac33` - feat(synonyms): Add close button and improve word extraction accuracy
**What:** Synonyms Feature
**Changes:**
- Synoym-Support
- Word extraction improvements
**Impact:** ✓ Feature, **⚠️ LanguageTool-bezogen**

---

## Phase 2: Spelling/Grammar Feature-Additions (22.10.2025 - 25.10.2025)

### 16. `d57f55a` - docs: Add Phase 5 - Voice-Driven Editing to development plan
**What:** Dokumentation
**Changes:**
- Development plan docs
**Impact:** ✓ Documentation, **✗ LanguageTool nicht betroffen**

### 17. `69856d1` - fix(spell-check): Fix correction acceptance bug - first char duplication and space removal
**What:** **ERSTE KRITISCHE LANGUAGETOOL-FIX!**
**Changes:**
- Fixed first char duplication bug
- Fixed space removal bug
- applySuggestion() Logic überarbeitet
**Impact:** ⚠️ **LanguageTool-Core betroffen!**

### 18. `45fd0a0` - docs: Mark MVP completion and update project status
**What:** MVP-Dokumentation
**Changes:**
- Status docs
**Impact:** ✓ Documentation, **✗ LanguageTool nicht betroffen**

### 19. `f79c1fd` - feat(ux): Improve save button feedback - stay green until next edit
**What:** Save-Button UX
**Changes:**
- Save button state improvements
**Impact:** ✓ UX, **✗ LanguageTool nicht betroffen**

### 20. `957a9fe` - fix(bugs): Fix multiple UI and editor issues
**What:** Multiple Bug Fixes
**Changes:**
- Verschiedene UI-Fixes
- Editor-Verbesserungen
**Impact:** ✓ Stability, **⚠️ möglicherweise LanguageTool-bezogen**

### 21. `b8c2bd6` - feat: Split LanguageTool button and improve heading formatting
**What:** **LANGUAGETOOL-BUTTON CHANGES!**
**Changes:**
- Split toggle + refresh buttons
- Heading formatting improvements
- Separate refresh button für manuellen Check
**Impact:** ⚠️ **LanguageTool UI verändert!**

### 22. `e0a4768` - fix(languagetool): Change tooltip dismiss from left-click to right-click
**What:** **LANGUAGETOOL-FIX!**
**Changes:**
- Tooltip dismiss geändert von links-Klick zu rechts-Klick
**Impact:** ⚠️ **LanguageTool-UX verändert!**

### 23. `8b5b2d1` - fix(zoom): Use transform:scale() for true proportional zoom on all elements
**What:** Zoom-Fix
**Changes:**
- transform:scale() statt font-size
- Text reflow improvements
**Impact:** ✓ Zoom Feature, **✗ LanguageTool nicht betroffen**

### 24. `a7f661e` - fix(critical): Fix LanguageTool offset bug and improve text rendering
**What:** **KRITISCHER LANGUAGETOOL-OFFSET-FIX!**
**Changes:**
- **Offset-Bug behoben** (oder gedacht dass es behoben)
- Speichert Offsets mit +1 in activeErrors
- applySuggestion() umgeschrieben
- Text rendering improvements
- Zoom mit font-size statt transform
**Impact:** ⚠️⚠️⚠️ **CRITICIAL - LanguageTool Core!**

---

## Phase 3: Error Navigator & Offset-Versuche (25.10.2025 - 26.10.2025)

### 25. `092541a` - feat(error-navigator): Add scrollable error list with context preview
**What:** **Error Navigator Feature!**
**Changes:**
- Rechte Sidebar mit Error-Liste
- Context Preview (15 chars links/rechts)
- Error Highlighting (orange, blue, red)
- Click-to-jump Funktionalität
- Auto-update bei viewport scroll
**Impact:** ⚠️ **Große UI-Addition, LanguageTool-Integration!**

### 26. `06a6882` - fix(critical): Fix LanguageTool correction position and error navigator jump
**What:** **LANGUAGETOOL-JUMP & POSITION FIX!**
**Changes:**
- Error navigator jump bug behoben
- LanguageTool correction position verbessert
- setTextSelection() + deleteSelection() statt deleteRange()
**Impact:** ⚠️⚠️ **LanguageTool Core - wieder!**

### 27. `187bd0a` - docs(offset-handling): Add comprehensive documentation to prevent regression
**What:** Dokumentation für Offset-Handling
**Changes:**
- Docs über Offset-Handling
**Impact:** ✓ Documentation, **✗ LanguageTool nicht betroffen**

### 28. `34373bc` - fix(error-navigator): Remove incorrect offset adjustment in context display
**What:** **OFFSET-ADJUSTMENT IN ERROR NAVIGATOR!**
**Changes:**
- Remove incorrect offset adjustment
- Context display fix
**Impact:** ⚠️ **LanguageTool-Offset-Related!**

### 29. `99d6f97` - refactor(simplification): Remove Error Navigator and complex offset logic
**What:** **KOMPLETTE REFACTORIERUNG - ERROR NAVIGATOR ENTFERNT!**
**Changes:**
- Error Navigator komplett entfernt
- Complex offset logic entfernt
- Simplification der Fehlerbehandlung
**Impact:** ⚠️⚠️⚠️ **Großer Refactor!**

### 30. `cf93086` - fix(simplification): Restore missing languagetool-status element
**What:** **LANGUAGETOOL-STATUS RESTORATION!**
**Changes:**
- languagetool-status element restored
- Fix nach dem großen Refactor
**Impact:** ⚠️ **LanguageTool-bezogen!**

### 31. `08b4712` - fix: Move updateLanguageToolStatus before runLanguageToolCheck
**What:** **LANGUAGETOOL-STATUS FIX!**
**Changes:**
- updateLanguageToolStatus() call order fix
- Logging improvements
**Impact:** ⚠️ **LanguageTool-bezogen!**

### 32. `e63c2ba` - feat(offset-tracking): Implement Option B - Dynamic offset adjustment for multiple corrections
**What:** **OPTION B - OFFSET-TRACKING IMPLEMENTATION!**
**Changes:**
- appliedCorrections array tracking
- Dynamic offset adjustment für mehrere Korrektionen
- calculateAdjustedOffset() function
- **Das war ein Versuch, das Offset-Problem zu lösen!**
**Impact:** ⚠️⚠️⚠️ **CRITICAL - Offset Handling!**

### 33. `1c14eec` - fix(critical): Keep appliedCorrections across auto-rechecks + add refresh animation
**What:** **APPLIEDCORRECTIONS TRACKING FIX!**
**Changes:**
- appliedCorrections nicht cleared bei auto-recheck
- Refresh animation hinzugefügt
- Flag-basierte Kontrolle
**Impact:** ⚠️ **LanguageTool Core!**

---

## Phase 4: Analyse & Debug-Versuche (26.10.2025)

### 34. `4376e55` - docs(analysis): Document real root cause of offset rendering issue
**What:** Offset-Analyse Dokumentation
**Changes:**
- Dokumentation des Problems
**Impact:** ✓ Documentation, **✗ Code nicht betroffen**

### 35. `013e1a2` - docs(analysis): Complete root cause analysis for offset rendering bug
**What:** Umfassende Analyse
**Changes:**
- Root cause analysis
**Impact:** ✓ Documentation, **✗ Code nicht betroffen**

### 36. `9a5f245` - docs(summary): Executive summary of offset bug analysis
**What:** Executive Summary
**Changes:**
- Summary documentation
**Impact:** ✓ Documentation, **✗ Code nicht betroffen**

### 37. `13d3041` - docs(analysis): Critical evaluation of HTML-based approach
**What:** Analyse des HTML-Ansatzes
**Changes:**
- Evaluation der Strategie
**Impact:** ✓ Documentation, **✗ Code nicht betroffen**

### 38. `4f99a3d` - feat(core-fix): Implement smart tree position resolution for error markers
**What:** **KOMPLEXE OFFSETLÖSUNG - resolveRawOffsetToTreePos()!**
**Changes:**
- resolveRawOffsetToTreePos() function
- Smart tree position resolution
- Complex algorithm für Position-Mapping
- **Das war der Versuch, das Problem zu lösen!**
**Impact:** ⚠️⚠️⚠️⚠️ **SUPER-CRITICAL - Das ist wahrscheinlich woher der neue Bug kommt!**

### 39. `c19659c` - fix(offset): Revert to simple +1 offset adjustment for correct error positioning
**What:** **REVERT ZU SIMPLEM +1!**
**Changes:**
- resolveRawOffsetToTreePos() entfernt/disabled
- Zurück zu einfachem +1 Adjustment
- appliedCorrections Tracking behalten
- **Der Entwickler erkannte, dass die komplexe Lösung FALSCH war!**
**Impact:** ⚠️⚠️⚠️ **Kritischer Revert!**

### 40. `c2144a5` - feat(debug): Add comprehensive block structure offset analysis tool
**What:** **DEBUG-TOOL FÜR OFFSET-ANALYSE!**
**Changes:**
- analyzeDocumentOffsets() debug function
- Umfassende Analyse-Tools
- Zur Diagnose des Offset-Problems
- **Das ist der heutige aktuelle Stand!**
**Impact:** ⚠️ **Debug-Code, nicht Production!**

---

## 📊 Zusammenfassung nach Kategorie

### LanguageTool Core Änderungen (die interessieren uns!)
- **69856d1** - Correction acceptance bug fix
- **a7f661e** - Critical offset bug fix (or attempted)
- **092541a** - Error navigator integration
- **06a6882** - Correction position fix
- **34373bc** - Error navigator offset fix
- **99d6f97** - Error navigator & offset logic removal
- **cf93086** - LanguageTool status restoration
- **08b4712** - LanguageTool status fix
- **e63c2ba** - Option B offset tracking
- **1c14eec** - appliedCorrections tracking fix
- **4f99a3d** - Complex tree position resolution (FAILED!)
- **c19659c** - Revert to simple +1
- **c2144a5** - Debug analysis tool

### UI/Feature Änderungen (können wir ignorieren/später hinzufügen)
- Alle anderen Commits

---

## 🎯 Strategie zum Nachbauen

**Start:** Commit `3c55b92`
- ✓ Funktionierendes LanguageTool
- ✓ Einfache Fehlermarkierung mit Rot
- ✓ Hover-Tooltips
- ✗ Keine komplexen Features
- ✗ Keine Error Navigator
- ✗ Keine Offset-Probleme (weil dokumentiert noch keine Listen?!)

**Dann graduell hinzufügen:**
1. UI/Feature Commits (a37d7cf bis 957a9fe) - **SAFE, keine LanguageTool-Änderungen**
2. b8c2bd6 - Split LanguageTool Button - **SAFE**
3. e0a4768 - Tooltip dismiss fix - **SAFE**
4. **STOP und TESTEN!** Funktioniert LanguageTool noch?
5. Nur wenn alles OK: Error Navigator Commits vorsichtig hinzufügen

**NICHT** hinzufügen (oder nur nach Behebung):
- e63c2ba - Option B offset tracking (komplex, fragwürdig)
- 4f99a3d - Complex tree position resolution (falsch!)
- c19659c - Revert zu +1 (das ist es jetzt ja schon!)

---

## ⚠️ Kritische Erkenntnisse

1. **Das Problem wurde mehrfach "gelöst"** - aber immer wieder war die Lösung falsch
2. **e63c2ba (Option B)** war ein komplexer Versuch - könnte Bugs einführen
3. **4f99a3d (resolveRawOffsetToTreePos)** war zu komplex und wurde revertiert
4. **Deine Idee** mit Markdown-Quelle statt getText() ist wahrscheinlich die ECHTE Lösung!

---

**Status:** Ready für nächsten Schritt: Tests mit Markdown-Ansatz durchführen!
