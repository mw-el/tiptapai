#!/bin/bash

# TipTap AI - Installation Script
# Checks dependencies, installs npm packages, downloads LanguageTool, and sets up desktop integration

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

# Step 1: Check Node.js
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
    echo "  - Ubuntu: sudo apt install nodejs npm"
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

# Step 3: Check Java (for LanguageTool)
if command_exists java; then
    JAVA_VERSION=$(java -version 2>&1 | head -n 1)
    print_status "Java is installed: $JAVA_VERSION"
else
    print_error "Java is not installed!"
    echo ""
    echo "LanguageTool requires Java. Install with:"
    echo "  sudo apt install default-jre"
    exit 1
fi

# Step 4: Check ImageMagick (for icon generation)
if command_exists convert; then
    print_status "ImageMagick is installed"
else
    print_warning "ImageMagick not found - icon may not be generated"
    echo "  Install with: sudo apt install imagemagick"
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

echo ""

# Step 6: Download LanguageTool (if not already present)
echo "======================================"
echo "Checking LanguageTool..."
echo "======================================"
echo ""

if [ -d "LanguageTool-6.6" ]; then
    print_status "LanguageTool is already installed"
else
    echo "Downloading LanguageTool 6.6..."
    if command_exists wget; then
        wget https://languagetool.org/download/LanguageTool-stable.zip
        print_status "Downloaded LanguageTool"

        echo "Extracting LanguageTool..."
        unzip -q LanguageTool-stable.zip
        rm LanguageTool-stable.zip
        print_status "LanguageTool extracted"
    else
        print_error "wget is not installed. Cannot download LanguageTool."
        echo "  Install with: sudo apt install wget"
        echo "  Then run this script again."
        exit 1
    fi
fi

echo ""

# Step 7: Build renderer bundle
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

# Step 8: Generate icon (if ImageMagick is available)
echo "======================================"
echo "Setting up desktop integration..."
echo "======================================"
echo ""

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

# Step 9: Create start script (ensures nvm is loaded)
START_SCRIPT="tiptapai-start.sh"

if [ ! -f "$START_SCRIPT" ]; then
    echo "Creating start script..."
    cat > "$START_SCRIPT" << 'EOF'
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
EOF
    # Update path in script to current directory
    sed -i "s|/home/matthias/_AA_TipTapAi|$SCRIPT_DIR|g" "$START_SCRIPT"
    chmod +x "$START_SCRIPT"
    print_status "Start script created: $START_SCRIPT"
else
    print_status "Start script already exists: $START_SCRIPT"
fi

# Step 10: Create desktop file
DESKTOP_FILE="tiptapai.desktop"

echo "Creating desktop launcher..."
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=TipTap AI
Comment=Intelligent Markdown Editor with LanguageTool Integration
Exec=$SCRIPT_DIR/tiptapai-start.sh
Icon=$SCRIPT_DIR/tiptapai-icon.png
Path=$SCRIPT_DIR
Terminal=false
Categories=Office;TextEditor;
Keywords=markdown;editor;languagetool;tiptap;writing;
StartupNotify=true
StartupWMClass=TipTap AI
EOF

chmod +x "$DESKTOP_FILE"
print_status "Desktop file created: $DESKTOP_FILE"

# Step 11: Install desktop file
mkdir -p ~/.local/share/applications/
cp "$DESKTOP_FILE" ~/.local/share/applications/
print_status "Desktop file installed to ~/.local/share/applications/"

# Step 12: Update desktop database
if command_exists update-desktop-database; then
    update-desktop-database ~/.local/share/applications/ 2>/dev/null || true
    print_status "Desktop database updated"
fi

# Step 13: Refresh icon cache (if available)
if command_exists gtk-update-icon-cache; then
    gtk-update-icon-cache ~/.local/share/icons/ 2>/dev/null || true
fi

echo ""
echo "======================================"
echo "Installation completed successfully!"
echo "======================================"
echo ""
echo "You can now:"
echo "  1. Start TipTap AI from your application menu"
echo "  2. Or run: cd $SCRIPT_DIR && npm start"
echo ""
echo "To start LanguageTool server separately:"
echo "  cd $SCRIPT_DIR"
echo "  java -cp LanguageTool-6.6/languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin \"*\""
echo ""
echo "Note: LanguageTool will be started automatically when you open TipTap AI"
echo ""
