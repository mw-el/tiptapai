# TipTap AI - Changelog

**Created:** 2025-10-18 16:00
**Last Updated:** 2025-10-21 14:30

---

## [Unreleased]

### Recent Changes - 2025-10-21

#### Added
- **Bookmark Feature (Sprint 1.5.2)**: Cursor position is now automatically restored when reopening files
- **Zoom Persistence**: Zoom level is saved in frontmatter and restored on file load
- **Scroll Position Restore**: Editor scroll position is saved and restored
- **Jump to First Error**: Click on LanguageTool error counter to jump to first error in document with smooth scroll and highlight effect
- **Table Support**: Added TipTap table extensions for proper Markdown table rendering
- **Light Theme**: Default light theme using schreibszene.ch color palette (#fffdf9 paper, #1c1816 text)
- **File Tree Navigation**: Auto-expand parent folders when loading files from history
- **Desktop Integration**: Ubuntu/Linux system tray icon and .desktop file
- **LanguageTool Integration (Sprint 2.1)**: Real-time grammar and spell checking
  - Personal dictionary support
  - Ignore errors functionality
  - Category-based error highlighting (typos, grammar, punctuation, etc.)
  - Swiss German (de-CH) support
- **File Management**: Create, rename, delete files directly from UI
- **Find & Replace**: Search and replace functionality in editor
- **Keyboard Shortcuts**: Comprehensive shortcuts for all major functions
- **Recent Items**: History dropdown with recently opened files and folders
- **Auto-Save**: Automatic saving after 2 seconds of inactivity

#### Changed
- Moved filename from editor header to window title bar for more vertical space
- Removed black folder-path bar from sidebar for cleaner UI
- Fixed layout proportions to use percentage of app window instead of viewport
- Disabled DevTools auto-open (only manually with F12/Ctrl+Shift+I)
- LanguageTool server now auto-starts with application

#### Fixed
- **Zoom Reset Bug**: Zoom level is now preserved when changing heading levels (Ctrl+Alt+0-6)
- Layout proportions corrected for all screen sizes
- File tree focus: auto-scroll and highlight current file
- Null reference errors in showStatus and loadFileTree
- LanguageTool error position tracking improved

### Planning Phase - 2025-10-18

#### Added
- Initial project documentation structure
- Development Guidelines (Quick + Full versions in docs/)
- Architecture documentation (minimal Electron + TipTap + Frontmatter approach)
- Setup guide for Ubuntu 24.04 (nvm + Node.js 20)
- Multi-project documentation (working with multiple Node.js projects)
- Development Plan with sprint-based approach

#### Changed
- **Major Architecture Decision**: Switched from complex setup (React + TypeScript + SQLite) to minimal approach (Vanilla JS + Frontmatter)
- **Dependencies**: Reduced from 50+ packages to only 5 core dependencies
- **State Management**: Removed Zustand, using simple variables instead
- **Persistence**: Changed from SQLite database to YAML frontmatter in Markdown files

#### Technical Decisions
- **Desktop Framework**: Electron (minimal setup, no frameworks)
- **Editor**: TipTap 3.x (WYSIWYG requirement)
- **Language**: Vanilla JavaScript (no TypeScript in MVP)
- **Node.js**: v20 via nvm (isolated environment)
- **Metadata**: YAML Frontmatter (no separate database)

#### Documentation Created
- `docs/ARCHITECTURE.md` - Technical architecture with minimal dependencies
- `docs/DEVELOPMENT_PLAN.md` - Sprint-based implementation plan
- `docs/SETUP.md` - Ubuntu 24.04 specific setup instructions
- `docs/MULTI_PROJECT.md` - Guide for managing multiple Node.js projects
- `docs/GUIDELINES.md` - Full development guidelines
- `docs/INSIGHTS.md` - Technical decisions and learnings
- `README.md` - Project overview

#### Project Structure Established
```
tiptapai/
├── CHANGELOG_2025-10-18-1600.md         # This file
├── TIPTAPAI_initial-planning_2025-10-18-1600.md  # Active dev doc
├── CLAUDE.md                             # Project rules for Claude
├── README.md
├── .gitignore (to be created)
├── docs/
│   ├── DEVELOPMENT-GUIDELINES-QUICK.md
│   ├── DEVELOPMENT-GUIDELINES-FULL.md (reference)
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT_PLAN.md
│   ├── SETUP.md
│   ├── MULTI_PROJECT.md
│   ├── GUIDELINES.md
│   ├── INSIGHTS.md
│   ├── archive/              # For completed dev docs
│   └── lessons-learned/      # For difficult issues
└── (src files to be created)
```

---

## Format Guidelines

This changelog follows these principles:
- **Keep a Changelog** format
- Entries grouped by: Added, Changed, Removed, Fixed, Security
- Dates in ISO format (YYYY-MM-DD)
- Timestamp in filename for version tracking
- Clear, concise descriptions
- Links to issues/PRs when relevant (future)

---

## Next Steps

1. Create initial development document in root
2. Setup environment (nvm, Node.js 20)
3. Initialize npm project
4. Create minimal Electron app (Sprint 0.2)
5. Integrate TipTap (Sprint 0.3)

---

**Note**: This changelog will be updated with each significant change. New timestamp will be added to filename when updated.
