# TipTap AI Project-Specific Maintenance Tasks

**Purpose**: Additional maintenance tasks specific to TipTap AI

**Audience**: Maintainer running _AA_MAINTENANCE_CHECKLIST.md

**When to Update**: When new project-specific maintenance needs are discovered

---

## 1. User Data Preservation

### 1.1 Autosave File Migration
**When**: Before any file format changes

**Action**:
- Check for autosave files matching pattern `TIPTAPAI_*_YYYY-MM-DD-HHMM.md`
- Document autosave format in ARCHITECTURE.md
- Create migration script if autosave format changes
- Test migration with real user autosave files

### 1.2 File History Management
**When**: Every release

**Action**:
- Verify file history is being preserved correctly
- Check that recent files list works after update
- Document file history location (if stored)

---

## 2. LanguageTool Integration Validation

### 2.1 LanguageTool Version Compatibility
**When**: Before each release

**Action**:
- Test with current LanguageTool version (currently 6.6)
- Verify Java integration still works
- Test grammar checking for German language
- Update INSTALL.md if LanguageTool version changes
- Document any Java version requirements

### 2.2 LanguageTool Server Integration
**When**: After any main.js changes

**Action**:
- Test that LanguageTool server starts automatically (main.js:XX)
- Verify port 8081 is not hardcoded elsewhere
- Test grammar checking highlights in editor
- Check languagetool.js and languagetool-mark.js functionality

---

## 3. Desktop Integration

### 3.1 Desktop Launcher Validation
**When**: After any changes to tiptapai-start.sh or tiptapai.desktop

**Action**:
- Test desktop launcher starts application
- Verify icon displays correctly
- Test that Node.js version detection works (nvm use 22)
- Check log file at /tmp/tiptapai.log after desktop launch
- Verify application appears in system menu

### 3.2 System Integration
**When**: Before each release

**Action**:
- Test on fresh Ubuntu installation if possible
- Verify .desktop file validity with `desktop-file-validate`
- Test keyboard shortcuts don't conflict with system
- Verify application can be pinned to dock/taskbar

---

## 4. Electron & Node.js Compatibility

### 4.1 Electron Version Updates
**When**: When updating Electron (currently ^38.3.0)

**Action**:
- Test all main.js IPC handlers still work
- Test preload.js bridge still functions
- Verify window management (creation, positioning, saving)
- Test file dialog integration
- Check for deprecated Electron APIs

### 4.2 Node.js Version Compatibility
**When**: When updating .nvmrc (currently Node.js 22)

**Action**:
- Update tiptapai-start.sh with correct version
- Test all dependencies still work
- Update README.md with new Node.js requirement
- Test install.sh with new Node.js version

---

## 5. TipTap Editor Functionality

### 5.1 TipTap Extension Compatibility
**When**: When updating @tiptap/* packages

**Action**:
- Test all editor features (bold, italic, lists, headings)
- Test markdown serialization/deserialization
- Verify frontmatter handling (frontmatter.js)
- Test undo/redo functionality
- Check that all toolbar buttons work

### 5.2 Markdown Compatibility
**When**: After @tiptap/markdown updates

**Action**:
- Test markdown import/export with real documents
- Verify frontmatter preservation
- Test special characters and edge cases
- Check list formatting (ordered/unordered)
- Verify code blocks work correctly

---

## 6. Build Process & Dependencies

### 6.1 esbuild Bundle Validation
**When**: After esbuild updates or renderer/app.js changes

**Action**:
- Verify `npm run build` succeeds
- Check renderer/app.bundle.js size (should be reasonable)
- Test that bundled app runs correctly
- Check for console errors in dev tools

### 6.2 Dependency Security Audit
**When**: Every maintenance run

**Action**:
- Run `npm audit` and address vulnerabilities
- Update dependencies if security issues found
- Document any dependency changes in CHANGELOG
- Test application after dependency updates

---

## 7. Installation Script Maintenance

### 7.1 install.sh Verification
**When**: After any installation process changes

**Action**:
- Test install.sh on clean Ubuntu system (VM/container)
- Verify all dependencies are installed correctly
- Check that LanguageTool downloads successfully
- Verify desktop integration is created
- Test that application launches after installation

### 7.2 Uninstallation Testing
**When**: Before each release

**Action**:
- Create test installation
- Run uninstall process (if exists)
- Verify all files are removed
- Check that user data handling is correct
- Document uninstallation procedure

---

## 8. Documentation Accuracy

### 8.1 README.md Accuracy
**When**: After any feature changes

**Action**:
- Update feature list to match current capabilities
- Verify installation instructions still work
- Update screenshots if UI changed
- Check that all links work
- Update system requirements if changed

### 8.2 INSTALL.md Validation
**When**: After install.sh changes

**Action**:
- Walk through installation steps manually
- Update troubleshooting section with new issues
- Verify LanguageTool installation steps
- Document Node.js version requirements
- Test manual installation procedure

---

## 9. Development Workflow Compliance

### 9.1 Development Guidelines Adherence
**When**: Every maintenance run

**Action**:
- Verify all active development documents have timestamps
- Check that CHANGELOG has timestamps (CHANGELOG_YYYY-MM-DD-HHMM.md)
- Ensure no operational filenames were changed without backups
- Verify Git commit messages follow format
- Check that CLAUDE.md is up to date

### 9.2 File Backup Verification
**When**: Before any file refactoring

**Action**:
- Create backups with format: `filename_backup_before-<description>.ext`
- Never rename operational files
- Document backup strategy in CLAUDE.md
- Archive old backups after successful changes

---

## 10. Release Checklist Summary

**Critical items before each release:**

- [ ] Code cleanup completed (remove dead code, TODOs)
- [ ] All tests pass (if test suite exists)
- [ ] LanguageTool integration tested
- [ ] Desktop launcher tested
- [ ] install.sh tested on clean system
- [ ] README.md and INSTALL.md updated
- [ ] CHANGELOG updated with timestamp
- [ ] Version number bumped in package.json
- [ ] Git tag created for release
- [ ] Dependency security audit passed
- [ ] Development documents archived to docs/archive/
- [ ] CLAUDE.md updated with any new project rules

---

**Last Updated**: 2025-10-18
**Version**: 1.0
