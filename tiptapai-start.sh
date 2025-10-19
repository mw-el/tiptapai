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

# Start the app with output redirected to a log file for debugging
# Use --no-sandbox to avoid SUID sandbox issues when launched from desktop
ELECTRON_NO_SANDBOX=1 npm start > /tmp/tiptapai.log 2>&1
