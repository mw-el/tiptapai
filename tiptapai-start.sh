#!/bin/bash

# TipTap AI - Desktop Launcher Script
# This ensures correct node/npm paths are used

# Change to project directory
cd /home/matthias/_AA_TipTapAi

# Load nvm and use Node.js 20
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node.js 20 (will use latest v20.x installed)
nvm use 20 2>/dev/null || true

# Start the app
npm start
