#!/bin/bash

# TipTap AI - macOS App Launcher
# Startet die Electron-App aus dem Quellverzeichnis

APP_DIR="/Users/erlkoenig/Documents/AA/_AA_TipTapAi"

# Homebrew PATH (Apple Silicon + Intel)
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

# Homebrew Java (openjdk) – wird von LanguageTool benötigt
BREW_JAVA="/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home/bin"
if [ -d "$BREW_JAVA" ]; then
    export PATH="$BREW_JAVA:$PATH"
fi

# nvm: aktive Node-Version automatisch ermitteln
NVM_DIR="$HOME/.nvm"
if [ -d "$NVM_DIR/versions/node" ]; then
    NODE_VERSION=$(basename "$(ls -d "$NVM_DIR/versions/node/"v* 2>/dev/null | sort -V | tail -1)" 2>/dev/null)
    if [ -n "$NODE_VERSION" ]; then
        export PATH="$NVM_DIR/versions/node/$NODE_VERSION/bin:$PATH"
    fi
fi

cd "$APP_DIR" || exit 1

# Build zuerst
npm run build

# Electron direkt aufrufen (nicht über npx) – so bleibt das Dock-Icon beim .app-Bundle
ELECTRON_BIN="$APP_DIR/node_modules/.bin/electron"
unset ELECTRON_RUN_AS_NODE
NODE_ENV=production exec "$ELECTRON_BIN" .
