#!/bin/bash

# TipTap AI - Desktop Launcher Script
# This ensures correct node/npm paths are used

# Change to project directory
cd /home/matthias/_AA_TipTapAi

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node.js 22 (current version) or whatever is available
nvm use 22 2>/dev/null || nvm use default 2>/dev/null || true

# VSCode/Electron Terminal sets ELECTRON_RUN_AS_NODE=1, which breaks Electron
unset ELECTRON_RUN_AS_NODE

# Start the app with output redirected to a log file for debugging
# Use start:desktop script which includes --no-sandbox flag for desktop launcher
# IMPORTANT: "$@" passes all command-line arguments (file paths) to the app
npm run start:desktop -- "$@" > /tmp/tiptapai.log 2>&1
