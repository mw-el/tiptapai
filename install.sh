#!/bin/bash

# TipTap AI - Cross-Platform Installation Script
# Supports macOS and Ubuntu/Linux
# Checks dependencies, installs npm packages, downloads LanguageTool,
# and sets up desktop/app integration

set -e

echo "======================================"
echo "TipTap AI - Installation Script"
echo "======================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Detect platform
case "$(uname -s)" in
  Darwin)  PLATFORM=macos ;;
  Linux)   PLATFORM=linux ;;
  *)       echo "Unsupported OS: $(uname -s)"; exit 1 ;;
esac

echo "Detected platform: $PLATFORM"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
echo "Installation directory: $SCRIPT_DIR"
echo ""

command_exists() { command -v "$1" >/dev/null 2>&1; }
print_status()   { echo -e "${GREEN}[✓]${NC} $1"; }
print_error()    { echo -e "${RED}[✗]${NC} $1"; }
print_warning()  { echo -e "${YELLOW}[!]${NC} $1"; }

BREW_OPENJDK_PREFIX=""
if [ "$PLATFORM" = "macos" ] && command_exists brew; then
    BREW_OPENJDK_PREFIX="$(brew --prefix openjdk 2>/dev/null || true)"
fi

# Load nvm into current shell session if available
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
}

# Install nvm + Node.js 20 if node is missing or too old
ensure_node() {
    load_nvm
    if command_exists node; then
        local major
        major=$(node --version | sed 's/v\([0-9]*\).*/\1/')
        if [ "$major" -ge 20 ]; then
            return 0
        fi
        print_warning "Node.js $(node --version) is older than v20 – upgrading via nvm..."
    else
        print_warning "Node.js not found – installing via nvm..."
    fi

    if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
        echo "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        load_nvm
    fi
    nvm install 20
    nvm use 20
    print_status "Node.js installed: $(node --version)"
}

# ── Step 0: Package manager ──────────────────────────────────────────────────
if [ "$PLATFORM" = "macos" ]; then
    if ! command_exists brew; then
        print_error "Homebrew is not installed!"
        echo ""
        echo "Install Homebrew first:"
        echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi
    print_status "Homebrew is installed"
fi

echo ""
echo "Checking dependencies..."
echo ""

# ── Step 1: Node.js ──────────────────────────────────────────────────────────
ensure_node
print_status "Node.js is ready: $(node --version)"

# ── Step 2: npm ──────────────────────────────────────────────────────────────
if command_exists npm; then
    print_status "npm is installed: $(npm --version)"
else
    print_error "npm not found (should come with Node.js)"
    exit 1
fi

# ── Step 2b: Build tools (Linux – required for node-pty native addon) ────────
if [ "$PLATFORM" = "linux" ]; then
    echo "Checking build tools..."
    MISSING_BUILD=()
    for pkg in build-essential python3 make; do
        dpkg -l "$pkg" 2>/dev/null | grep -q "^ii" || MISSING_BUILD+=("$pkg")
    done
    if [ ${#MISSING_BUILD[@]} -eq 0 ]; then
        print_status "Build tools already installed"
    else
        echo "Installing build tools: ${MISSING_BUILD[*]}"
        sudo apt install -y "${MISSING_BUILD[@]}"
        print_status "Build tools installed"
    fi
fi

# ── Step 3: Java (for LanguageTool) ─────────────────────────────────────────
if command_exists java && java -version >/dev/null 2>&1; then
    print_status "Java is installed: $(java -version 2>&1 | head -n 1)"
elif [ "$PLATFORM" = "macos" ] && [ -n "$BREW_OPENJDK_PREFIX" ] && [ -f "$BREW_OPENJDK_PREFIX/libexec/openjdk.jdk/Contents/Home/bin/java" ]; then
    print_warning "Java (Homebrew) found but not linked – creating symlink..."
    sudo ln -sfn "$BREW_OPENJDK_PREFIX/libexec/openjdk.jdk" \
        /Library/Java/JavaVirtualMachines/openjdk.jdk
    print_status "Java linked – LanguageTool can start"
else
    echo "Java not found – installing..."
    if [ "$PLATFORM" = "macos" ]; then
        brew install openjdk
        BREW_OPENJDK_PREFIX="$(brew --prefix openjdk)"
        sudo ln -sfn "$BREW_OPENJDK_PREFIX/libexec/openjdk.jdk" \
            /Library/Java/JavaVirtualMachines/openjdk.jdk
    else
        sudo apt install -y default-jre
    fi
    print_status "Java installed"
fi

# ── Step 4: ImageMagick ──────────────────────────────────────────────────────
if [ "$PLATFORM" = "linux" ]; then
    if command_exists convert; then
        print_status "ImageMagick is installed"
    else
        echo "Installing ImageMagick (needed for icon generation)..."
        sudo apt install -y imagemagick
        print_status "ImageMagick installed"
    fi
fi

# ── Step 4b: Claude Code ─────────────────────────────────────────────────────
echo ""
echo "Checking Claude Code..."
LATEST_CLAUDE=$(npm show @anthropic-ai/claude-code version 2>/dev/null || echo "")
if command_exists claude; then
    INSTALLED_CLAUDE=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ "$INSTALLED_CLAUDE" = "$LATEST_CLAUDE" ]; then
        print_status "Claude Code is up to date: $INSTALLED_CLAUDE"
    else
        echo "Updating Claude Code $INSTALLED_CLAUDE → $LATEST_CLAUDE..."
        npm install -g @anthropic-ai/claude-code
        print_status "Claude Code updated to $LATEST_CLAUDE"
    fi
else
    echo "Installing Claude Code $LATEST_CLAUDE..."
    npm install -g @anthropic-ai/claude-code
    print_status "Claude Code installed: $LATEST_CLAUDE"
fi

# Ensure 'claude' is available system-wide (nvm path may not be in all terminals)
CLAUDE_BIN=$(which claude 2>/dev/null || find ~/.nvm/versions -name claude -type f 2>/dev/null | head -1 || echo "")
if [ -n "$CLAUDE_BIN" ]; then
    sudo ln -sf "$CLAUDE_BIN" /usr/local/bin/claude
    print_status "Claude Code available system-wide: /usr/local/bin/claude"
fi

echo ""
echo "All required dependencies are installed!"
echo ""

# macOS: Xcode Command Line Tools are required before npm install because
# node-pty builds a native addon during dependency installation.
if [ "$PLATFORM" = "macos" ] && ! xcode-select -p >/dev/null 2>&1; then
    print_warning "Xcode Command Line Tools not found – required for node-pty."
    echo "  Installing now (a dialog may appear)..."
    xcode-select --install 2>/dev/null || true
    echo "  Re-run install.sh after Xcode CLT installation completes."
    exit 1
fi

# ── Step 5: npm packages ─────────────────────────────────────────────────────
echo "======================================"
echo "Installing npm packages..."
echo "======================================"
echo ""

npm install --fund=false --no-audit
print_status "npm packages installed"

echo ""
echo "Preparing book export fonts..."
if bash "$SCRIPT_DIR/install-book-fonts.sh"; then
    print_status "Book export fonts prepared"
else
    print_warning "Book export fonts could not be provisioned automatically."
    print_warning "Retry manually with: ./install-book-fonts.sh"
fi

echo "Checking for security vulnerabilities..."
NPM_CONFIG_FUND=false npm audit fix --audit-level=high 2>/dev/null || true
print_status "Security audit done"

echo "Building native addon node-pty..."
if npx node-gyp rebuild --directory node_modules/node-pty 2>/dev/null; then
    print_status "node-pty native addon built"
else
    print_warning "node-pty build failed – Terminal function may not be available"
    if [ "$PLATFORM" = "macos" ]; then
        echo "  Ensure Xcode CLT are installed: xcode-select --install"
        echo "  Then retry: npx node-gyp rebuild --directory node_modules/node-pty"
    else
        echo "  Retry manually: sudo apt install build-essential python3 && npx node-gyp rebuild --directory node_modules/node-pty"
    fi
fi

echo ""

# ── Step 6: WeasyPrint (optional) ────────────────────────────────────────────
echo "======================================"
echo "WeasyPrint (PDF Engine – optional)"
echo "======================================"
echo ""

if command_exists weasyprint; then
    print_status "WeasyPrint is already installed"
else
    echo "WeasyPrint enables advanced PDF layouts (two-column, page numbers, CSS typography)."
    echo -n "Install WeasyPrint? [y/N]: "
    read -r INSTALL_WEASY
    if [ "$INSTALL_WEASY" = "y" ] || [ "$INSTALL_WEASY" = "Y" ]; then
        if [ "$PLATFORM" = "macos" ]; then
            brew install weasyprint
        else
            sudo apt install -y python3-pip libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libffi-dev
            pip3 install --user weasyprint
        fi
        print_status "WeasyPrint installed"
    else
        print_warning "Skipping WeasyPrint (install later)"
        if [ "$PLATFORM" = "macos" ]; then
            echo "  brew install weasyprint"
        else
            echo "  pip3 install weasyprint"
        fi
    fi
fi

echo ""

# ── Step 6b: Pandoc (optional) ───────────────────────────────────────────────
echo "======================================"
echo "Pandoc (Export Engine – optional)"
echo "======================================"
echo ""

if command_exists pandoc; then
    print_status "Pandoc is already installed: $(pandoc --version | head -1)"
else
    echo "Pandoc enables export to PDF, DOCX, HTML, LaTeX, EPUB..."
    echo -n "Install Pandoc? [y/N]: "
    read -r INSTALL_PANDOC
    if [ "$INSTALL_PANDOC" = "y" ] || [ "$INSTALL_PANDOC" = "Y" ]; then
        if [ "$PLATFORM" = "macos" ]; then
            brew install pandoc
        else
            sudo apt install -y pandoc
        fi
        print_status "Pandoc installed"
        echo ""
        print_warning "For PDF export a LaTeX engine is also needed:"
        if [ "$PLATFORM" = "macos" ]; then
            echo "  brew install --cask basictex    (minimal)"
            echo "  brew install --cask mactex-no-gui  (full)"
        else
            echo "  sudo apt install texlive-xetex texlive-fonts-recommended texlive-latex-extra"
        fi
    else
        print_warning "Skipping Pandoc (install later)"
        if [ "$PLATFORM" = "macos" ]; then
            echo "  brew install pandoc"
        else
            echo "  sudo apt install pandoc"
        fi
    fi
fi

echo ""

# ── Step 7: LanguageTool ─────────────────────────────────────────────────────
echo "======================================"
echo "Checking LanguageTool..."
echo "======================================"
echo ""

# Ensure unzip is available (Linux)
if [ "$PLATFORM" = "linux" ] && ! command_exists unzip; then
    echo "Installing unzip..."
    sudo apt install -y unzip
    print_status "unzip installed"
fi

# Detect any already-installed LanguageTool version
LT_EXISTING=$(ls -d "$SCRIPT_DIR"/LanguageTool-*/ 2>/dev/null | head -1 | sed 's|.*/\(LanguageTool-[^/]*\)/$|\1|')
if [ -n "$LT_EXISTING" ]; then
    print_status "LanguageTool is already installed ($LT_EXISTING)"
else
    echo "Downloading LanguageTool..."
    if command_exists curl; then
        curl -L -o LanguageTool-stable.zip https://languagetool.org/download/LanguageTool-stable.zip
    else
        wget -O LanguageTool-stable.zip https://languagetool.org/download/LanguageTool-stable.zip
    fi
    print_status "Downloaded LanguageTool"

    echo "Extracting LanguageTool..."
    unzip -q LanguageTool-stable.zip
    rm LanguageTool-stable.zip
    LT_DIR=$(ls -d "$SCRIPT_DIR"/LanguageTool-*/ 2>/dev/null | head -1 | sed 's|/$||')
    if [ -n "$LT_DIR" ]; then
        LT_EXISTING=$(basename "$LT_DIR")
    else
        LT_EXISTING="LanguageTool"
    fi
    print_status "LanguageTool extracted: $LT_EXISTING"
fi

echo ""

# ── Step 8: Build renderer bundle ────────────────────────────────────────────
echo "======================================"
echo "Building application bundle..."
echo "======================================"
echo ""

npx esbuild renderer/app.js --bundle --outfile=renderer/app.bundle.js --loader:.js=js
print_status "Application bundle built"

echo ""

# ── Step 9: Platform-specific desktop integration ────────────────────────────
echo "======================================"
echo "Setting up desktop integration..."
echo "======================================"
echo ""

if [ "$PLATFORM" = "macos" ]; then
    APP_BUNDLE="/Applications/TipTap AI.app"
    ELECTRON_DIST="$SCRIPT_DIR/node_modules/electron/dist/Electron.app"

    if [ ! -d "$ELECTRON_DIST" ]; then
        print_error "Electron dist not found: $ELECTRON_DIST"
        print_error "Please run 'npm install' first"
        exit 1
    fi

    echo "Building macOS app bundle → /Applications/TipTap AI.app ..."
    rm -rf "$APP_BUNDLE"
    ditto "$ELECTRON_DIST" "$APP_BUNDLE"
    print_status "Electron.app copied ($(du -sh "$APP_BUNDLE" | cut -f1))"

    mv "$APP_BUNDLE/Contents/MacOS/Electron" "$APP_BUNDLE/Contents/MacOS/TipTapAI"
    print_status "Binary renamed → TipTapAI"

    cat > "$APP_BUNDLE/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>TipTap AI</string>
    <key>CFBundleDisplayName</key><string>TipTap AI</string>
    <key>CFBundleIdentifier</key><string>com.tiptapai.editor</string>
    <key>CFBundleVersion</key><string>0.1.0</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleExecutable</key><string>TipTapAI</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSRequiresAquaSystemAppearance</key><false/>
    <key>LSMinimumSystemVersion</key><string>12.0</string>
    <key>CFBundleDocumentTypes</key>
    <array><dict>
        <key>CFBundleTypeName</key><string>Markdown Document</string>
        <key>CFBundleTypeExtensions</key><array><string>md</string><string>markdown</string></array>
        <key>CFBundleTypeRole</key><string>Editor</string>
    </dict></array>
</dict>
</plist>
PLIST
    print_status "Info.plist written"

    ln -sf "$SCRIPT_DIR" "$APP_BUNDLE/Contents/Resources/app"
    print_status "Source directory linked (Resources/app → $SCRIPT_DIR)"

    # Icon: macOS uses the optically padded variant; Linux keeps tiptapai.png.
    ICON_SRC="$SCRIPT_DIR/tiptapai-macos.png"
    if [ ! -f "$ICON_SRC" ]; then
        print_error "Required macOS icon missing: $ICON_SRC"
        exit 1
    fi
    if ! command_exists sips || ! command_exists iconutil; then
        print_error "sips/iconutil missing – cannot create AppIcon.icns"
        exit 1
    fi

    ICONSET=$(mktemp -d)/AppIcon.iconset
    mkdir -p "$ICONSET"
    sips -z 16   16   "$ICON_SRC" --out "$ICONSET/icon_16x16.png"      2>/dev/null
    sips -z 32   32   "$ICON_SRC" --out "$ICONSET/icon_16x16@2x.png"   2>/dev/null
    sips -z 32   32   "$ICON_SRC" --out "$ICONSET/icon_32x32.png"      2>/dev/null
    sips -z 64   64   "$ICON_SRC" --out "$ICONSET/icon_32x32@2x.png"   2>/dev/null
    sips -z 128  128  "$ICON_SRC" --out "$ICONSET/icon_128x128.png"    2>/dev/null
    sips -z 256  256  "$ICON_SRC" --out "$ICONSET/icon_128x128@2x.png" 2>/dev/null
    sips -z 256  256  "$ICON_SRC" --out "$ICONSET/icon_256x256.png"    2>/dev/null
    sips -z 512  512  "$ICON_SRC" --out "$ICONSET/icon_256x256@2x.png" 2>/dev/null
    sips -z 512  512  "$ICON_SRC" --out "$ICONSET/icon_512x512.png"    2>/dev/null
    iconutil -c icns "$(dirname "$ICONSET")/AppIcon.iconset" \
        -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns" 2>/dev/null \
        && print_status "App icon created (ICNS)" \
        || { rm -rf "$(dirname "$ICONSET")"; print_error "Icon conversion failed"; exit 1; }
    rm -rf "$(dirname "$ICONSET")"

    # Ad-hoc code signing
    xattr -cr "$APP_BUNDLE" 2>/dev/null || true
    if command_exists codesign; then
        codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null \
            && print_status "App signed (ad-hoc)" \
            || print_warning "Code signing failed"
    fi

    # Register with LaunchServices and refresh Dock
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
        -f "$APP_BUNDLE" 2>/dev/null || true
    killall Dock 2>/dev/null || true
    print_status "LaunchServices updated, Dock restarted"

else
    # Linux: generate icon and install .desktop file

    if command_exists convert && [ ! -f "tiptapai-icon.png" ]; then
        echo "Generating application icon..."
        convert -size 256x256 xc:none \
            -fill '#3498db' -draw 'roundrectangle 20,20 236,236 20,20' \
            -fill white -font DejaVu-Sans-Bold -pointsize 80 -gravity center -annotate +0-10 'T' \
            -fill white -pointsize 60 -annotate +0+50 'AI' \
            tiptapai-icon.png 2>/dev/null || print_warning "Icon generation failed (not critical)"
        [ -f "tiptapai-icon.png" ] && print_status "Application icon generated"
    elif [ -f "tiptapai-icon.png" ]; then
        print_status "Application icon already exists"
    fi

    # Generate start script with correct path for this machine
    START_SCRIPT="tiptapai-start.sh"
    cat > "$START_SCRIPT" << STARTSCRIPT
#!/bin/bash

# TipTap AI - Desktop Launcher Script
# Generated by install.sh – do not edit manually, re-run install.sh instead

# Change to project directory
cd "$SCRIPT_DIR"

# Load nvm if available
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"

# Use latest installed Node.js version (22, 20, or default)
nvm use 22 2>/dev/null || nvm use 20 2>/dev/null || nvm use default 2>/dev/null || true

# VSCode/Electron Terminal sets ELECTRON_RUN_AS_NODE=1, which breaks Electron
unset ELECTRON_RUN_AS_NODE

# Start the app with output redirected to a log file for debugging
# Use start:desktop script which includes --no-sandbox flag for desktop launcher
# IMPORTANT: "\$@" passes all command-line arguments (file paths) to the app
npm run start:desktop -- "\$@" > /tmp/tiptapai.log 2>&1
STARTSCRIPT
    chmod +x "$START_SCRIPT"
    print_status "Start script generated: $START_SCRIPT"

    # Create desktop file
    DESKTOP_FILE="tiptapai.desktop"
    DESKTOP_TEMPLATE="tiptapai.desktop.template"

    echo "Creating desktop launcher..."
    if [ -f "$DESKTOP_TEMPLATE" ]; then
        sed "s|INSTALL_DIR|$SCRIPT_DIR|g" "$DESKTOP_TEMPLATE" > "$DESKTOP_FILE"
        print_status "Desktop file created from template"
    else
        cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=TipTap AI
Comment=Intelligent Markdown Editor with LanguageTool Integration
Exec=$SCRIPT_DIR/tiptapai-start.sh %F
Icon=$SCRIPT_DIR/tiptapai.png
Path=$SCRIPT_DIR
Terminal=false
Categories=Office;TextEditor;
Keywords=markdown;editor;languagetool;tiptap;writing;
MimeType=text/markdown;text/x-markdown;
StartupNotify=true
StartupWMClass=TipTap AI
EOF
        print_status "Desktop file created"
    fi

    chmod +x "$DESKTOP_FILE"
    mkdir -p ~/.local/share/applications/
    cp "$DESKTOP_FILE" ~/.local/share/applications/
    print_status "Desktop file installed to ~/.local/share/applications/"

    command_exists update-desktop-database \
        && update-desktop-database ~/.local/share/applications/ 2>/dev/null || true
    command_exists gtk-update-icon-cache \
        && gtk-update-icon-cache ~/.local/share/icons/ 2>/dev/null || true
fi

# ── Step 10: Claude Code login ───────────────────────────────────────────────
echo ""
echo "======================================"
echo "Claude Code – Login"
echo "======================================"
echo ""

if command_exists claude; then
    if claude auth status >/dev/null 2>&1; then
        print_status "Claude Code is already logged in"
    else
        print_warning "Claude Code is not yet authenticated."
        echo ""
        echo "  TipTap AI requires a Claude.ai account (Pro or Max subscription)."
        echo "  Authentication opens a browser window – no API key needed."
        echo ""
        echo -n "  Log in now? [Y/n]: "
        read -r DO_LOGIN
        if [ "$DO_LOGIN" != "n" ] && [ "$DO_LOGIN" != "N" ]; then
            claude login || print_warning "Login failed – run 'claude login' manually before first use"
        else
            print_warning "Skipping login – run 'claude login' before first use"
        fi
    fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "Installation completed successfully!"
echo "======================================"
echo ""

if [ "$PLATFORM" = "macos" ]; then
    echo "  Start: Spotlight (Cmd+Space → 'TipTap AI') or Launchpad"
    echo "  First launch: right-click → Open (Gatekeeper, one-time only)"
    echo "  Terminal: cd $SCRIPT_DIR && npm start"
    echo ""
    echo "  Note: After 'npm install' (Electron update) re-run install.sh to rebuild the app bundle."
else
    echo "  Start: Application menu or run: cd $SCRIPT_DIR && npm start"
fi

echo ""
echo "LanguageTool starts automatically when TipTap AI opens."
echo "To start it manually:"
echo "  java -cp ${LT_EXISTING:-LanguageTool-6.6}/languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin \"*\""
echo ""
