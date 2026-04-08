#!/bin/bash

# TipTap AI - Cross-Platform Installation Script
# Supports macOS and Ubuntu/Linux
# Checks dependencies, installs npm packages, downloads LanguageTool, and sets up desktop/app integration

set -e  # Exit on error

echo "======================================"
echo "TipTap AI - Installation Script"
echo "======================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect platform
case "$(uname -s)" in
  Darwin)  PLATFORM=macos ;;
  Linux)   PLATFORM=linux ;;
  *)       echo "Unsupported OS: $(uname -s)"; exit 1 ;;
esac

echo "Detected platform: $PLATFORM"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installation directory: $SCRIPT_DIR"
echo ""

# Function: Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function: Print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Function: Install a package via brew (macOS) or apt (Linux)
install_package() {
    local name="$1"
    local brew_pkg="${2:-$1}"
    local apt_pkg="${3:-$1}"

    if command_exists "$name"; then
        print_status "$name is already installed"
        return 0
    fi

    echo "Installing $name..."
    if [ "$PLATFORM" = "macos" ]; then
        brew install "$brew_pkg"
    else
        sudo apt install -y "$apt_pkg"
    fi
    print_status "$name installed"
}

# Step 0: Check package manager (macOS needs Homebrew)
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

# Step 1: Check Node.js
echo ""
echo "Checking dependencies..."
echo ""

if command_exists node; then
    NODE_VERSION=$(node --version)
    print_status "Node.js is installed: $NODE_VERSION"
else
    print_error "Node.js is not installed!"
    echo ""
    echo "Please install Node.js v20+ using one of these methods:"
    echo "  - nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "         then: nvm install 20"
    if [ "$PLATFORM" = "macos" ]; then
        echo "  - Homebrew: brew install node@20"
    else
        echo "  - Ubuntu: sudo apt install nodejs npm"
    fi
    exit 1
fi

# Check Node.js version (should be v20+)
NODE_MAJOR_VERSION=$(node --version | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR_VERSION" -lt 20 ]; then
    print_warning "Node.js version $NODE_VERSION is older than v20. Recommended: v20+"
fi

# Step 2: Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_status "npm is installed: $NPM_VERSION"
else
    print_error "npm is not installed!"
    exit 1
fi

# Step 3: Java (for LanguageTool) - install automatically
JAVA_OK=false
if command_exists java && java -version >/dev/null 2>&1; then
    JAVA_VERSION=$(java -version 2>&1 | head -n 1)
    print_status "Java is installed: $JAVA_VERSION"
    JAVA_OK=true
elif [ "$PLATFORM" = "macos" ] && [ -f "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home/bin/java" ]; then
    # Homebrew openjdk vorhanden, aber noch nicht verlinkt
    print_warning "Java (Homebrew) ist installiert, aber noch nicht systemweit verlinkt."
    echo "  Setze Symlink nach /Library/Java/JavaVirtualMachines/..."
    sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk \
        /Library/Java/JavaVirtualMachines/openjdk.jdk
    print_status "Java verlinkt – LanguageTool kann starten"
    JAVA_OK=true
else
    echo "Java nicht gefunden – wird jetzt installiert..."
    if [ "$PLATFORM" = "macos" ]; then
        brew install openjdk
        sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk \
            /Library/Java/JavaVirtualMachines/openjdk.jdk
        print_status "Java installiert und verlinkt"
    else
        sudo apt install -y default-jre
        print_status "Java installiert"
    fi
    JAVA_OK=true
fi

# Step 4: Check ImageMagick (for icon generation)
if command_exists convert; then
    print_status "ImageMagick is installed"
else
    print_warning "ImageMagick not found - icon may not be generated"
    if [ "$PLATFORM" = "macos" ]; then
        echo "  Install with: brew install imagemagick"
    else
        echo "  Install with: sudo apt install imagemagick"
    fi
fi

# Step 4b: Install/update Claude Code (required - core component of TipTap AI)
echo ""
echo "Checking Claude Code..."
LATEST_CLAUDE=$(npm show @anthropic-ai/claude-code version 2>/dev/null || echo "")
if command_exists claude; then
    INSTALLED_CLAUDE=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ "$INSTALLED_CLAUDE" = "$LATEST_CLAUDE" ]; then
        print_status "Claude Code is up to date: $INSTALLED_CLAUDE"
    else
        echo "Updating Claude Code from $INSTALLED_CLAUDE to $LATEST_CLAUDE..."
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
if [ -n "$CLAUDE_BIN" ] && [ ! -f /usr/local/bin/claude ]; then
    echo "Creating system-wide symlink for claude..."
    sudo ln -sf "$CLAUDE_BIN" /usr/local/bin/claude
    print_status "Claude Code available system-wide via /usr/local/bin/claude"
elif [ -n "$CLAUDE_BIN" ]; then
    sudo ln -sf "$CLAUDE_BIN" /usr/local/bin/claude
    print_status "Claude Code symlink updated at /usr/local/bin/claude"
fi

echo ""
echo "All required dependencies are installed!"
echo ""

# Step 5: Install npm packages
echo "======================================"
echo "Installing npm packages..."
echo "======================================"
echo ""

if [ -f "package.json" ]; then
    npm install
    print_status "npm packages installed"
else
    print_error "package.json not found in $SCRIPT_DIR"
    exit 1
fi

# node-pty ist ein natives Addon und muss plattformspezifisch kompiliert werden.
# Nach einem npm install von einem anderen OS (z.B. Linux-Build auf macOS gestartet)
# muss es neu gebaut werden.
echo "Building native addon node-pty..."
if npx node-gyp rebuild --directory node_modules/node-pty 2>/dev/null; then
    print_status "node-pty native addon built"
else
    print_warning "node-pty build failed – Terminal-Funktion möglicherweise nicht verfügbar"
fi

echo ""

# Step 6: WeasyPrint installation (for advanced PDF export)
echo "======================================"
echo "WeasyPrint (PDF Engine)"
echo "======================================"
echo ""

if command_exists weasyprint; then
    print_status "WeasyPrint is already installed"
else
    echo "WeasyPrint enables professional PDF layouts with:"
    echo "  - Two-column layouts"
    echo "  - Custom page numbers and headers"
    echo "  - Advanced CSS typography"
    echo ""
    echo -n "Install WeasyPrint? [y/N]: "
    read -r INSTALL_WEASY

    if [ "$INSTALL_WEASY" = "y" ] || [ "$INSTALL_WEASY" = "Y" ]; then
        if [ "$PLATFORM" = "macos" ]; then
            brew install weasyprint
        else
            # Install system dependencies first, then pip
            sudo apt install -y python3-pip libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libffi-dev
            pip3 install --user weasyprint
        fi
        print_status "WeasyPrint installed"
    else
        print_warning "Skipping WeasyPrint installation (can install later)"
        if [ "$PLATFORM" = "macos" ]; then
            echo "  Install later with: brew install weasyprint"
        else
            echo "  Install later with: pip3 install weasyprint"
        fi
    fi
fi

echo ""

# Step 7: Download LanguageTool (if not already present)
echo "======================================"
echo "Checking LanguageTool..."
echo "======================================"
echo ""

if [ -d "LanguageTool-6.6" ]; then
    print_status "LanguageTool is already installed"
else
    echo "Downloading LanguageTool 6.6..."
    if command_exists curl; then
        curl -L -o LanguageTool-stable.zip https://languagetool.org/download/LanguageTool-stable.zip
    elif command_exists wget; then
        wget https://languagetool.org/download/LanguageTool-stable.zip
    else
        print_error "Neither curl nor wget found. Cannot download LanguageTool."
        exit 1
    fi
    print_status "Downloaded LanguageTool"

    echo "Extracting LanguageTool..."
    unzip -q LanguageTool-stable.zip
    rm LanguageTool-stable.zip
    print_status "LanguageTool extracted"
fi

echo ""

# Step 8: Build renderer bundle
echo "======================================"
echo "Building application bundle..."
echo "======================================"
echo ""

if [ -f "renderer/app.js" ]; then
    npx esbuild renderer/app.js --bundle --outfile=renderer/app.bundle.js --loader:.js=js
    print_status "Application bundle built"
else
    print_error "renderer/app.js not found"
    exit 1
fi

echo ""

# Step 9: Platform-specific desktop integration
echo "======================================"
echo "Setting up desktop integration..."
echo "======================================"
echo ""

if [ "$PLATFORM" = "macos" ]; then
    # macOS: .app-Bundle erstellen und in /Applications verlinken

    APP_BUNDLE="$SCRIPT_DIR/TipTap AI.app"
    APP_MACOS="$APP_BUNDLE/Contents/MacOS"
    APP_RESOURCES="$APP_BUNDLE/Contents/Resources"

    echo "Creating macOS app bundle..."
    mkdir -p "$APP_MACOS" "$APP_RESOURCES"

    # Info.plist
    cat > "$APP_BUNDLE/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>TipTap AI</string>
    <key>CFBundleDisplayName</key>
    <string>TipTap AI</string>
    <key>CFBundleIdentifier</key>
    <string>com.tiptapai.editor</string>
    <key>CFBundleVersion</key>
    <string>0.1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleExecutable</key>
    <string>TipTapAI</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>CFBundleDocumentTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeName</key>
            <string>Markdown Document</string>
            <key>CFBundleTypeExtensions</key>
            <array>
                <string>md</string>
                <string>markdown</string>
            </array>
            <key>CFBundleTypeRole</key>
            <string>Editor</string>
        </dict>
    </array>
</dict>
</plist>
EOF

    # Launcher-Script (findet nvm-Node automatisch)
    cat > "$APP_MACOS/TipTapAI" << LAUNCHER
#!/bin/bash
# TipTap AI - macOS Launcher

APP_DIR="$SCRIPT_DIR"

# Robuster PATH: Homebrew (Apple Silicon + Intel) + nvm
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"

NVM_DIR="\$HOME/.nvm"
if [ -d "\$NVM_DIR/versions/node" ]; then
    NODE_VERSION=\$(basename "\$(ls -d "\$NVM_DIR/versions/node/"v* 2>/dev/null | sort -V | tail -1)" 2>/dev/null)
    if [ -n "\$NODE_VERSION" ]; then
        export PATH="\$NVM_DIR/versions/node/\$NODE_VERSION/bin:\$PATH"
    fi
fi

cd "\$APP_DIR" || exit 1
exec npm run start
LAUNCHER
    chmod +x "$APP_MACOS/TipTapAI"
    print_status "Launcher script created"

    # Icon: PNG → ICNS (sips + iconutil sind macOS-built-in)
    ICON_SRC=""
    for candidate in "$SCRIPT_DIR/tiptapai.png" "$SCRIPT_DIR/tiptapai-icon.png"; do
        if [ -f "$candidate" ]; then
            ICON_SRC="$candidate"
            break
        fi
    done

    if [ -n "$ICON_SRC" ] && command_exists sips && command_exists iconutil; then
        ICONSET=/tmp/tiptapai_install.iconset
        mkdir -p "$ICONSET"
        sips -z 16   16   "$ICON_SRC" --out "$ICONSET/icon_16x16.png"    2>/dev/null
        sips -z 32   32   "$ICON_SRC" --out "$ICONSET/icon_16x16@2x.png" 2>/dev/null
        sips -z 32   32   "$ICON_SRC" --out "$ICONSET/icon_32x32.png"    2>/dev/null
        sips -z 64   64   "$ICON_SRC" --out "$ICONSET/icon_32x32@2x.png" 2>/dev/null
        sips -z 128  128  "$ICON_SRC" --out "$ICONSET/icon_128x128.png"  2>/dev/null
        sips -z 256  256  "$ICON_SRC" --out "$ICONSET/icon_128x128@2x.png" 2>/dev/null
        sips -z 256  256  "$ICON_SRC" --out "$ICONSET/icon_256x256.png"  2>/dev/null
        sips -z 512  512  "$ICON_SRC" --out "$ICONSET/icon_256x256@2x.png" 2>/dev/null
        sips -z 512  512  "$ICON_SRC" --out "$ICONSET/icon_512x512.png"  2>/dev/null
        iconutil -c icns "$ICONSET" -o "$APP_RESOURCES/AppIcon.icns" 2>/dev/null \
            && print_status "App icon created" \
            || print_warning "Icon conversion failed (not critical)"
        rm -rf "$ICONSET"
    else
        print_warning "Skipping icon conversion (sips/iconutil not found or no PNG found)"
    fi

    # In /Applications verlinken
    APPS_LINK="/Applications/TipTap AI.app"
    if [ -L "$APPS_LINK" ]; then
        rm "$APPS_LINK"
    fi
    ln -sf "$APP_BUNDLE" "$APPS_LINK"
    print_status "App linked to /Applications"

    # Launch Services aktualisieren (Spotlight, Dock)
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
        -f "$APPS_LINK" 2>/dev/null || true
    print_status "App registered with Launch Services (Spotlight, Dock)"

    echo ""
    echo "  App ist bereit. Beim ersten Start: Rechtsklick → Öffnen (Gatekeeper-Bypass)."
    echo "  Danach: Doppelklick oder Spotlight (Cmd+Space → 'TipTap AI')"

else
    # Linux: Generate icon and install .desktop file

    # Generate icon (if ImageMagick is available)
    if command_exists convert && [ ! -f "tiptapai-icon.png" ]; then
        echo "Generating application icon..."
        convert -size 256x256 xc:none \
            -fill '#3498db' -draw 'roundrectangle 20,20 236,236 20,20' \
            -fill white -font DejaVu-Sans-Bold -pointsize 80 -gravity center -annotate +0-10 'T' \
            -fill white -pointsize 60 -annotate +0+50 'AI' \
            tiptapai-icon.png 2>/dev/null || print_warning "Icon generation failed (not critical)"

        if [ -f "tiptapai-icon.png" ]; then
            print_status "Application icon generated"
        fi
    elif [ -f "tiptapai-icon.png" ]; then
        print_status "Application icon already exists"
    fi

    # Check start script
    START_SCRIPT="tiptapai-start.sh"
    if [ -f "$START_SCRIPT" ]; then
        print_status "Start script already exists: $START_SCRIPT"
    else
        print_error "Start script not found: $START_SCRIPT"
        echo "  This should be in the repository. Check your git clone."
        exit 1
    fi

    # Create desktop file from template
    DESKTOP_FILE="tiptapai.desktop"
    DESKTOP_TEMPLATE="tiptapai.desktop.template"

    echo "Creating desktop launcher..."

    if [ -f "$DESKTOP_TEMPLATE" ]; then
        sed "s|INSTALL_DIR|$SCRIPT_DIR|g" "$DESKTOP_TEMPLATE" > "$DESKTOP_FILE"
        print_status "Desktop file created from template: $DESKTOP_FILE"
    else
        print_warning "Template not found, creating desktop file manually..."
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
        print_status "Desktop file created manually: $DESKTOP_FILE"
    fi

    chmod +x "$DESKTOP_FILE"

    # Install desktop file
    mkdir -p ~/.local/share/applications/
    cp "$DESKTOP_FILE" ~/.local/share/applications/
    print_status "Desktop file installed to ~/.local/share/applications/"

    # Update desktop database
    if command_exists update-desktop-database; then
        update-desktop-database ~/.local/share/applications/ 2>/dev/null || true
        print_status "Desktop database updated"
    fi

    # Refresh icon cache
    if command_exists gtk-update-icon-cache; then
        gtk-update-icon-cache ~/.local/share/icons/ 2>/dev/null || true
    fi
fi

echo ""
echo "======================================"
echo "Installation completed successfully!"
echo "======================================"
echo ""
echo "You can now:"
if [ "$PLATFORM" = "macos" ]; then
    echo "  1. TipTap AI per Spotlight starten: Cmd+Space → 'TipTap AI'"
    echo "  2. Oder aus dem Applications-Ordner öffnen"
    echo "  3. Beim ersten Start: Rechtsklick → Öffnen (einmalig, wegen Gatekeeper)"
    echo "  4. Terminal-Start: cd $SCRIPT_DIR && npm start"
else
    echo "  1. Start TipTap AI from your application menu"
    echo "  2. Or run: cd $SCRIPT_DIR && npm start"
fi
echo ""
echo "To start LanguageTool server separately:"
echo "  cd $SCRIPT_DIR"
echo "  java -cp LanguageTool-6.6/languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin \"*\""
echo ""
echo "Note: LanguageTool will be started automatically when you open TipTap AI"
echo ""
