#!/bin/bash

# TipTap AI - Desktop Launcher Script

# Change to project directory (resolves own location, works on macOS and Linux)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use latest installed Node.js version (22, 20, or default)
nvm use 22 2>/dev/null || nvm use 20 2>/dev/null || nvm use default 2>/dev/null || true

# VSCode/Electron Terminal sets ELECTRON_RUN_AS_NODE=1, which breaks Electron
unset ELECTRON_RUN_AS_NODE

# Start the app with output redirected to a log file for debugging
# Use start:desktop script which includes --no-sandbox flag for desktop launcher
# IMPORTANT: "$@" passes all command-line arguments (file paths) to the app
npm run start:desktop -- "$@" > /tmp/tiptapai.log 2>&1
