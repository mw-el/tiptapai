---
TT_checkedRanges: []
TT_CleanParagraphs:
  - p1bvyl
  - 17qfkmq
  - 1nrwlou
  - 1vs88j7
  - 12hqbd5
  - b3yfzu
  - 1urfti8
  - 1734nhu
TT_lastEdit: '2025-12-31T14:27:20.817Z'
TT_lastPosition: 5932
TT_zoomLevel: 100
TT_scrollPosition: 0
TT_totalWords: 919
TT_totalCharacters: 5964
---

# Claude Code Integration Principles (Anthropic Claude Code)

This document captures how to embed Anthropic Claude Code into a desktop editor app, based on the Ripple integration in this repository. It focuses only on Claude Code (not generic cloud coding tools) and highlights how the same principles map to Electron or Tauri.

## 1) Architecture Overview

Use a three-layer split so UI, terminal processes, and OS access are isolated and testable:

- UI layer (renderer): owns layout, toggles, and terminal presentation.
- Bridge layer (preload/IPC): exposes a narrow, typed API to the UI.
- Backend layer (main process or service): spawns shells/PTYs, manages logs, and writes context files.

This separation keeps the terminal process isolated from the renderer while allowing the UI to stay responsive.

For Electron, this maps cleanly to renderer/preload/main. For Tauri, the "backend layer" is a Rust command module that spawns the PTY or sidecar process, while the "bridge layer" is the `tauri::command` surface exposed to the webview.

## 2) Tools and Building Blocks (Claude Code Only)

Typical components for an Electron implementation:

- Terminal UI: xterm.js for display, sizing, and input handling.
- PTY backend: node-pty (or a platform equivalent) to spawn a shell with a real TTY.
- IPC bridge: contextBridge + ipcMain/renderer to avoid direct Node access in the UI.
- CLI runtime: the Anthropic Claude Code CLI (`claude`).

For Tauri, the conceptual pieces stay the same:

- Terminal UI: still xterm.js (or a Rust-native terminal view if preferred).
- PTY backend: a Rust PTY library (or a platform-native PTY service).
- IPC bridge: `tauri::command` APIs or a plugin instead of Electron preload.
- CLI runtime: the same `claude` CLI, launched as a sidecar or child process.

## 3) UI Embedding Pattern (In-App Terminal Area)

Embed the terminal in a dedicated view panel rather than a separate window:

- Place a terminal panel inside an existing layout region (sidebar or split pane).
- Use a view toggle to switch between file/navigation view and terminal view.
- Provide terminal-specific header buttons (refresh context, help) that appear only when the terminal view is active.
- Keep the terminal hidden (CSS class toggle) until requested to avoid startup cost.

This keeps the terminal “in context” without disrupting the editing surface.

## 4) Context Packaging Pipeline (Claude Code Context)

Claude Code should start with a ready-to-use context directory. The pattern:

1. Compute context from the current document and editor state:
  - Document metadata (name, path, word count)
  - Cursor location and visible range
  - Numbered paragraphs or stable anchors
2. Write a context folder next to the document (example: `.tiptap-context/`).
3. Generate a small set of well-known files:
  - `CLAUDE.md`: instructions + metadata
  - `document-numbered.txt`: full text with stable paragraph IDs
  - `viewport.html`: the visible portion for quick reading
  - `session.json`: session timestamps + document stats
  - `.claude/settings.local.json`: permissions for Claude Code

Key principle: context files are static, readable, and re-generatable at any time.

## 5) Startup Instructions and Immediate Context

Seed the terminal session with a short, deterministic startup script:

- Print a concise banner, document path, and how to reference content.
- Explain the primary workflow (e.g., “edit paragraph X, copy result to clipboard”).
- Point to the context files and how to refresh them.
- Launch the Claude Code CLI automatically after the banner.

This makes the CLI useful immediately without the user needing to discover commands.

## 6) Launch Flow (Integrated PTY)

Recommended sequence on “Open Terminal”:

1. Validate there is an active document.
2. Generate and write the context directory.
3. Spawn a PTY with `cwd` set to the context directory.
4. Stream PTY output to the UI; stream UI input back to the PTY.
5. Inject the startup script and execute the Claude Code CLI.

The context directory being the working directory makes `CLAUDE.md` the first visible file and keeps logs nearby.

## 7) Refresh and Lifecycle

- Refresh: regenerate context in place and tell the user to reload context inside the CLI.
- Hide/show: do not destroy the terminal when switching views unless needed.
- Dispose: on app shutdown or explicit close, kill the PTY and release resources.

This preserves session continuity while still allowing a clean shutdown.

## 8) Permissions and Safety (Claude Code)

Use an explicit allowlist so Claude Code can read/edit only what it needs:

- Read/Edit the current document.
- Read the context directory.
- Allow specific clipboard commands (e.g., `xclip`, `pbcopy`) if required.

Keep the permissions file under the context directory so it stays scoped and portable.

## 9) Logging and Diagnostics

Two layers of logging are useful:

- Per-session transcript in the context directory (for reproducibility).
- A fixed debug log in the user home directory (for early startup failures).

This helps diagnose missing dependencies, shell failures, and CLI startup issues.

## 10) Fallback: External Terminal

Provide a fallback if the Claude Code CLI is missing or PTY creation fails:

- Detect CLI availability (`which claude` or equivalent).
- If unavailable, open a normal system terminal in the context directory.
- Print the same startup banner to keep user guidance consistent.

This avoids a hard failure while still giving a usable workflow.

## 11) Implementation Mapping (Ripple Source Pointers)

For reference, the Ripple integration maps to:

- UI panel + toggle: `renderer/index.html`
- View control + handlers: `renderer/app.js`
- Terminal UI + PTY wiring: `renderer/claude/terminal-panel.js`
- Context generation: `renderer/claude/context-writer.js`
- IPC bridge: `preload.js`
- PTY + CLI spawning: `main.js`

These files show how the Claude Code principles above are applied in one concrete app.