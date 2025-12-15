# Enhanced Logging for Terminal Errors (2025-12-15-155746)

## What changed
- Added a lightweight debug logger in `main.js` (PTY section) that writes to `~/.tiptap-ai/terminal-debug.log`.
- The logger records:
  - When `node-pty-prebuilt-multiarch` loads (or fails).
  - Every `pty-create` request (cwd, cols/rows, shell) before spawning.
  - PTY spawn success (PID, cwd, dimensions) and exit codes/signals.
  - Resizes, kill requests, and attempts to write/kill without an active PTY.
  - Any errors thrown during PTY creation, with stack/message.
- Session logs remain per-context in `<contextDir>/.terminal-logs/session-*.log`, but the new home-level debug log captures failures even before a session log exists.

## How to use it
1. Trigger the integrated terminal once (open the Claude terminal view) so `pty-create` runs.
2. Check the persistent debug log:
   - `tail -n 120 ~/.tiptap-ai/terminal-debug.log`
3. If a PTY did start, also inspect the session transcript:
   - `ls <your-doc-dir>/.tiptap-context/.terminal-logs/`
   - `tail -n 120 <your-doc-dir>/.tiptap-context/.terminal-logs/session-*.log`

## What to look for
- **node-pty load failed**: Missing/broken native module or deps.
- **pty-create requested** with no follow-up **PTY spawned**: spawn likely failed; error details should be in the debug log.
- **PTY exited** with nonzero code/signal shortly after spawn: investigate environment/shell issues in the session log.
- **Input/kill attempted without active PTY**: renderer sending commands after the PTY died.

## Next steps if it hangs again
1. Reproduce once, then grab the latest `~/.tiptap-ai/terminal-debug.log`.
2. If a session log exists, capture its tail.
3. Share both snippets; we can pinpoint whether it’s a spawn failure, early crash, or renderer-side issue. 
