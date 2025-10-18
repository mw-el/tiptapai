# Project Maintenance Checklist
**Generic prompt for keeping any codebase production-ready**

Use this checklist every 5-10 major changes, before releases, or when preparing to deploy to a new machine.

---

## Document Overview

### What This Checklist Creates

This maintenance process will create/update **12 core documents** in your repository to make it production-ready and easy to deploy on new machines.

### Complete Document Map

#### **Root Directory** (What users see first)

| File | Purpose | Who Reads It | Update Frequency |
|------|---------|--------------|------------------|
| `README.md` | Project overview, features, quick start | Everyone | Every major release |
| `INSTALL.md` | Complete installation guide + troubleshooting | New users | When install changes |
| `CHANGELOG.md` | What changed in each version | Users upgrading | Every release |
| `LICENSE` | Legal terms (MIT, GPL, etc.) | Everyone | Rarely |
| `VERSION` | Current version number (e.g., "1.2.0") | Scripts, users | Every release |
| `requirements.txt` | Python packages with pinned versions | pip/install.sh | When deps change |
| `environment.yml` | Conda environment specification | conda users | When deps change |
| `config.example.yml` | Settings template (no secrets) | New users | When settings change |
| `.gitignore` | What NOT to commit to git | Git | Rarely |
| `install.sh` | Automated installation script | New users | When install changes |
| `uninstall.sh` | Automated removal script | Users uninstalling | Rarely |
| `smoke_test.py` | Quick "is it working?" tests | install.sh | When features change |

#### **docs/ Directory** (Detailed documentation)

| File | Purpose | Who Reads It | Update Frequency |
|------|---------|--------------|------------------|
| `docs/ARCHITECTURE.md` | How code is organized | Developers, future you | When structure changes |
| `docs/DEVELOPMENT.md` | Developer setup guide | Contributors | Rarely |
| `docs/UPGRADING.md` | Version migration guide | Users upgrading | When breaking changes |
| `docs/_AA_MAINTENANCE_CHECKLIST.md` | This guide - housekeeping steps | You (maintainer) | Rarely (generic) |

#### **NOT in Git** (Created by users, contains secrets)

| File | Purpose | Why Not in Git |
|------|---------|----------------|
| `config.yml` | Actual API keys and settings | Contains secrets! |
| `.env` | Environment variables (alternative) | Contains secrets! |

### Your Repository Structure After Maintenance

```
yourproject/
│
├── 📄 README.md              ← First thing people see
├── 📄 INSTALL.md             ← How to install
├── 📄 CHANGELOG.md           ← What changed when
├── 📄 LICENSE                ← Legal stuff
├── 📄 VERSION                ← "1.2.0"
│
├── ⚙️ requirements.txt       ← pip dependencies (pinned!)
├── ⚙️ environment.yml        ← conda environment
├── ⚙️ config.example.yml     ← Settings template
├── 🚫 .gitignore             ← Ignore secrets
│
├── 🔧 install.sh             ← Run this to install
├── 🔧 uninstall.sh           ← Run this to remove
├── 🔧 smoke_test.py          ← Quick health check
│
├── 📁 docs/                  ← Detailed documentation
│   ├── _AA_MAINTENANCE_CHECKLIST.md         ← This guide (sorts to top)
│   ├── _AA_MAINTENANCE_PROJECT_SPECIFIC.md  ← Project tasks (sorts to top)
│   ├── ARCHITECTURE.md       ← Code structure
│   ├── DEVELOPMENT.md        ← Developer guide
│   ├── UPGRADING.md          ← Migration guide
│   └── archive/              ← Old docs
│
├── 📁 modules/               ← Your Python code
│   └── __init__.py           ← Contains __version__
│
└── 📁 tests/                 ← Test files
```

### Priority Levels

**⭐⭐⭐ Must Have** (App won't work without these):
1. README.md
2. INSTALL.md
3. requirements.txt or environment.yml
4. install.sh
5. config.example.yml

**⭐⭐ Should Have** (Professional projects):
6. CHANGELOG.md
7. uninstall.sh
8. smoke_test.py
9. docs/ARCHITECTURE.md
10. VERSION file

**⭐ Nice to Have** (Mature projects):
11. docs/DEVELOPMENT.md
12. docs/UPGRADING.md
13. LICENSE

---

## How to Use This Checklist

### For Generic Projects (Default)

Simply follow sections 1-10 in order. All instructions are generic and will work for any software project.

### For Projects with Specific Needs

**Create a `_AA_MAINTENANCE_PROJECT_SPECIFIC.md` file** in your `docs/` folder with project-specific tasks that should be done during maintenance.

**When running maintenance**: Use both documents together - start with this generic checklist, then execute tasks from _AA_MAINTENANCE_PROJECT_SPECIFIC.md.

**If using an AI assistant**: Provide both documents in the prompt:
```
Please run maintenance on this project.
Reference: docs/_AA_MAINTENANCE_CHECKLIST.md (generic procedures)
Reference: docs/_AA_MAINTENANCE_PROJECT_SPECIFIC.md (project-specific tasks)

Step 1: If _AA_MAINTENANCE_PROJECT_SPECIFIC.md does not exist, create it by:
  - Reviewing the repository to identify project-specific maintenance needs
  - Following the template in the "How to Use This Checklist" section
  - Reporting what project-specific tasks you've identified

Step 2: Execute all generic tasks from the checklist (sections 1-10)

Step 3: Execute the project-specific tasks from _AA_MAINTENANCE_PROJECT_SPECIFIC.md
```

### What Goes in _AA_MAINTENANCE_PROJECT_SPECIFIC.md?

**Project-specific tasks that don't apply to other projects:**

**Example 1 - DriverSeat project**:
```markdown
# Project-Specific Maintenance Tasks

**Purpose**: Additional maintenance tasks specific to DriverSeat
**Audience**: Maintainer running _AA_MAINTENANCE_CHECKLIST.md
**When to Update**: When new project-specific maintenance needs are discovered

---

## DriverSeat-Specific Tasks

### 1. Update AI Interface Compatibility Matrix
**When**: Every time a new AI model version is released

Action:
- Test with latest Claude Sonnet version
- Test with latest Ollama models
- Update docs/AI_COMPATIBILITY.md with results
- Update version numbers in interface classes if needed

### 2. Verify German Grammar Rules
**When**: Before each release

Action:
- Review modules/ai/prompts/german_correction_prompt.txt
- Test with edge cases in tests/grammar_edge_cases.md
- Update prompt if new German grammar patterns are needed

### 3. Check Desktop Integration
**When**: After any GUI changes

Action:
- Verify .desktop file still works
- Test application launcher icon
- Test system tray integration
- Verify keyboard shortcuts don't conflict with system defaults
```

**Example 2 - Web Application**:
```markdown
# Project-Specific Maintenance Tasks

## Database Migrations

### 1. Check for Pending Migrations
**When**: Every maintenance run

Action:
- Run `python manage.py showmigrations`
- Document any pending migrations in CHANGELOG
- Test migrations on dev database before release

### 2. Update API Documentation
**When**: After any endpoint changes

Action:
- Regenerate OpenAPI/Swagger docs
- Update docs/API.md with examples
- Test all endpoints with Postman collection
- Export updated Postman collection to repo

### 3. Security Scan
**When**: Every maintenance run

Action:
- Run `npm audit` and fix vulnerabilities
- Run `safety check` for Python dependencies
- Scan for hardcoded secrets with `trufflehog`
- Document any security updates in CHANGELOG
```

**Example 3 - Hardware/IoT Project**:
```markdown
# Project-Specific Maintenance Tasks

## Hardware-Specific Checks

### 1. Update Supported Hardware List
**When**: When new devices are tested

Action:
- Update docs/HARDWARE_COMPATIBILITY.md
- Document any new GPIO pin mappings
- Add photos of new hardware setups

### 2. Calibration Data
**When**: Every release

Action:
- Verify calibration constants in config/calibration.yml
- Document calibration procedure in INSTALL.md
- Include sample calibration output in docs/
```

### Repository Structure with Project-Specific Maintenance

```
yourproject/
├── docs/
│   ├── _AA_MAINTENANCE_CHECKLIST.md         ← Generic (copy from template)
│   ├── _AA_MAINTENANCE_PROJECT_SPECIFIC.md  ← Specific to THIS project
│   ├── ARCHITECTURE.md
│   └── ...
```

**Workflow**:
1. Copy generic _AA_MAINTENANCE_CHECKLIST.md to your project (never modify it)
2. Create _AA_MAINTENANCE_PROJECT_SPECIFIC.md for your specific needs
3. When running maintenance, reference both files
4. Update _AA_MAINTENANCE_PROJECT_SPECIFIC.md as you discover new project-specific needs

### Creating Project-Specific Maintenance File (For AI Assistants)

**If `_AA_MAINTENANCE_PROJECT_SPECIFIC.md` does not exist yet**:

1. **Create the file** at `docs/_AA_MAINTENANCE_PROJECT_SPECIFIC.md`

2. **Review the repository** to identify project-specific maintenance needs:
   - User data storage locations (config files, history files, databases)
   - API integrations and external service dependencies
   - Language-specific features (grammar rules, localization)
   - Desktop integration (launcher scripts, .desktop files, system tray)
   - Data migration needs (file formats that could change between versions)
   - Performance-critical operations unique to this project
   - Testing requirements specific to the domain
   - Deployment environment specifics (conda, docker, etc.)

3. **Populate the file** with structured maintenance tasks following this template:

```markdown
# [ProjectName] Project-Specific Maintenance Tasks

**Purpose**: Additional maintenance tasks specific to [ProjectName]

**Audience**: Maintainer running _AA_MAINTENANCE_CHECKLIST.md

**When to Update**: When new project-specific maintenance needs are discovered

---

## 1. User Data Preservation
[Tasks to protect user data during upgrades]

## 2. [Domain-Specific Feature] Validation
[Tasks to verify core functionality unique to this project]

## 3. API/External Service Compatibility
[Tasks to test integrations with external services]

## 4. [Other Project-Specific Areas]
[Additional sections as needed]

## N. Release Checklist Summary
[Quick checklist of all critical items before release]

---

**Last Updated**: [Date]
**Version**: 1.0
```

4. **Report to user**: Summarize the project-specific maintenance tasks you've identified and added to the file

---

## Documentation Standard

### Header Requirement for All Documents

**Every document created as part of this maintenance process must include a header comment explaining its role.**

**Format**:
```markdown
# Document Title

**Purpose**: [One sentence describing what this document does]

**Audience**: [Who should read this - users, developers, maintainers]

**When to Update**: [When should this document be updated]

---

[Main content starts here...]
```

**Example** (README.md):
```markdown
# MyProject

**Purpose**: Main project documentation providing overview, features, and quick start guide.

**Audience**: Everyone - first document new users will see.

**When to Update**: Every major release or when features/requirements change.

---

MyProject is a German text correction tool that...
```

**Example** (install.sh):
```bash
#!/bin/bash
#
# install.sh - Automated Installation Script
#
# Purpose: Automates complete installation from zero to running application
# Audience: New users installing on Ubuntu systems
# When to Update: Whenever installation steps change or dependencies are added
#
# Usage: ./install.sh
#

set -e  # Exit on any error
...
```

**Example** (config.example.yml):
```yaml
#
# config.example.yml - Configuration Template
#
# Purpose: Shows all available settings without exposing secrets
# Audience: New users configuring the application
# When to Update: When new configuration options are added
#
# Instructions:
#   1. Copy this file: cp config.example.yml config.yml
#   2. Edit config.yml with your actual values
#   3. config.yml is git-ignored for security
#

# REQUIRED: Application won't run without these
api_key: "your-anthropic-api-key-here"  # Get from: https://console.anthropic.com
...
```

**Why This Matters**:
- Future you will know exactly what each file does
- New contributors understand the purpose immediately
- Reduces confusion about which file to edit
- Makes maintenance easier

---

## 1. Code Cleanup Phase

### 1.1 Remove Dead Code
**What**: Code that's no longer used but still in the project.

**Why**: Makes code confusing, bloats the project, and wastes time during debugging.

**How to identify**:
- Functions/classes that are never called
- Commented-out code blocks
- Old backup files (*.bak, *_old.py)
- Test files that served an intermediate goal

**Action**: Delete them. Git has your history if you need them back.

---

### 1.2 Remove Intermediate/Test Scripts
**What**: Scripts you created to test one feature or experiment with an approach.

**Examples**:
- `test_api_connection.py` (if now part of main code)
- `experiment_with_layouts.py`
- `quick_prototype.py`

**Keep vs Delete**:
- Keep: Integration tests, useful utilities
- Delete: One-off experiments, duplicate functionality

**Action**: Move to `archive/` or delete entirely.

---

### 1.3 Review Dependencies (requirements.txt / environment.yml)

#### What is "Pinning Versions"?

**Unpinned (❌ Bad)**:
```txt
requests>=2.0
ttkbootstrap
anthropic
```
This means: "Install any version 2.0 or newer." Problem: In 6 months, version 3.0 comes out with breaking changes. Your app breaks on new installs.

**Pinned (✅ Good)**:
```txt
requests==2.31.0
ttkbootstrap==1.10.1
anthropic==0.25.0
```
This means: "Install exactly these versions." Your app works the same everywhere.

**How to pin current versions**:
```bash
# If using pip
pip freeze > requirements.txt

# If using conda
conda env export > environment.yml
```

**Action Items**:
- [ ] Generate current frozen dependencies
- [ ] Review for unused packages (remove them)
- [ ] Add comments explaining WHY specific versions matter
- [ ] Separate development dependencies if needed

**Example requirements.txt with comments**:
```txt
# Core dependencies
requests==2.31.0          # Last version before 3.0 breaking changes
anthropic==0.25.0         # Pinned to stable API version
ttkbootstrap==1.10.1      # GUI theme library

# Development only (optional)
pytest==7.4.0             # Testing framework
black==23.7.0             # Code formatter
```

---

### 1.4 Remove Hardcoded Paths and Credentials

**What to look for**:
```python
# ❌ Bad - hardcoded paths
config_path = "/home/john/myproject/config.yml"
api_key = "sk-abc123..."

# ✅ Good - relative paths and config files
config_path = os.path.join(os.path.dirname(__file__), "config.yml")
api_key = os.environ.get("API_KEY")
```

**Action**: Search codebase for:
- Absolute paths (starts with `/home/` or `C:\`)
- API keys, passwords, tokens
- Usernames, email addresses

---

### 1.5 Clean TODO/FIXME Comments

**What**: Code comments like `# TODO: fix this later` or `# FIXME: this is hacky`.

**Action for each**:
- Fix it now if quick (< 30 min)
- Create a GitHub issue and link it: `# TODO: See issue #42`
- If not important, delete the comment

---

## 2. Documentation Phase

### 2.1 Update/Create CHANGELOG.md

**What**: A file that lists what changed in each version.

**Format** (Keep it simple):
```markdown
# Changelog

## [1.2.0] - 2025-10-17
### Added
- CTRL-Z undo functionality
- Background analysis of 3 segments ahead

### Changed
- Removed Raw mode button (now Ctrl+Y)

### Fixed
- 10-second delay on interface switching

## [1.1.0] - 2025-10-16
### Added
- Tier 2 UX with clean correction highlighting
...
```

**When to update**: Every time you finish a set of related changes.

**Action**: Add new section for unreleased changes, list all modifications since last version.

---

### 2.2 Update README.md

**Essential sections**:

```markdown
# Project Name

One-sentence description of what it does.

## Features
- Feature 1
- Feature 2
- Feature 3

## Screenshots
[Include 1-2 images showing the UI]

## Quick Start
```bash
./install.sh
```

## System Requirements
- OS: Ubuntu 24.04+
- RAM: 8GB minimum
- Python: 3.10+

## Documentation
- [Installation Guide](docs/INSTALL.md)
- [User Guide](docs/USAGE.md)
- [Architecture](docs/ARCHITECTURE.md)

## License
MIT (or whatever you choose)
```

**Action**:
- [ ] Update feature list to match current capabilities
- [ ] Add screenshots if GUI changed
- [ ] Update system requirements
- [ ] Check all links work

---

### 2.3 Update/Create INSTALL.md

**Complete installation guide with troubleshooting.**

**Structure**:
```markdown
# Installation Guide

## Prerequisites
- List every system requirement
- Include version numbers

## Quick Install (Automated)
```bash
curl -O https://yourrepo/install.sh
chmod +x install.sh
./install.sh
```

## Manual Installation
Step-by-step for those who want control:
1. Install Python 3.10+
2. Clone repository
3. Create virtual environment
4. Install dependencies
5. Configure application
6. Run application

## Configuration
- Where to put API keys
- How to customize settings
- What each config option does

## Verification
How to test installation worked:
```bash
your-app --version
your-app --test
```

## Troubleshooting
### Problem: GUI doesn't launch
**Symptoms**: Error message XYZ
**Solution**: Run this command...

### Problem: API connection fails
**Symptoms**: Timeout errors
**Solution**: Check your API key...

## Uninstallation
```bash
./uninstall.sh
```
```

**Action**:
- [ ] Write from perspective of someone who knows nothing about your project
- [ ] Test instructions on a friend's computer (or VM)
- [ ] Add every error you've encountered to Troubleshooting

---

### 2.4 Create/Update ARCHITECTURE.md

**What**: High-level overview of how your code is organized.

**Purpose**: So future you (or others) can understand the project quickly.

**Template**:
```markdown
# Architecture Overview

## Project Structure
```
myproject/
├── modules/
│   ├── gui/           # User interface code
│   ├── ai/            # AI interface implementations
│   ├── core/          # Business logic
│   └── utils/         # Helper functions
├── docs/              # Documentation
├── tests/             # Test files
└── install.sh         # Installation script
```

## Data Flow
1. User inputs text → GUI (main_window.py)
2. GUI calls → TextProcessor (core/text_processor.py)
3. TextProcessor calls → AI Interface (ai/claude_sonnet_interface.py)
4. AI returns corrections → TextProcessor validates
5. TextProcessor returns → GUI displays

## Key Components

### TextProcessor (core/text_processor.py)
- **Purpose**: Coordinates text analysis
- **Dependencies**: AI interfaces, correction validator
- **Key Methods**: analyze_text(), set_interface()

### InlineCorrectionsManager (utils/inline_corrections_manager.py)
- **Purpose**: Displays corrections in GUI
- **Features**: Block editing, undo stack, correction highlighting

## State Storage
- File history: ~/.driver_seat_history.json
- API keys: claude.txt in project root
- User settings: config.yml (optional)

## External Dependencies
- Anthropic API: For Claude AI analysis
- ttkbootstrap: For modern GUI theme

## Modifying the Project
- To add new AI interface: Create new file in ai/
- To change GUI layout: Modify gui/main_window.py
- To adjust correction logic: Edit core/text_processor.py
```

**Action**: Create this document explaining your project's structure.

---

### 2.5 Configuration File Strategy

#### What's the Difference Between requirements.txt and config files?

**requirements.txt / environment.yml**:
- Lists WHAT software to install (Python packages)
- Example: "Install requests library version 2.31.0"

**config.yml / .env**:
- Lists HOW to configure the installed software
- Example: "Use this API key, connect to this server"

#### Why Create config.example.yml?

**The Problem**:
```yaml
# config.yml (❌ DON'T commit this to git)
api_key: "sk-abc123secretkey456"
database_url: "postgres://admin:password@localhost/mydb"
```

If you commit this to GitHub, you've leaked your secrets!

**The Solution**:
```yaml
# config.example.yml (✅ Safe to commit)
api_key: "your-anthropic-api-key-here"
database_url: "postgresql://username:password@host/database"
```

**Then in INSTALL.md**:
```markdown
## Configuration
1. Copy the example config:
   ```bash
   cp config.example.yml config.yml
   ```
2. Edit config.yml with your actual values
3. config.yml is git-ignored for security
```

#### What's Required vs Optional?

**Document in config.example.yml**:
```yaml
# REQUIRED: Application won't run without these
api_key: "your-anthropic-api-key-here"  # Get from: https://console.anthropic.com

# OPTIONAL: Has sensible defaults
theme: "cosmo"                  # Default: "cosmo"
window_width_ratio: 6           # Default: 6 (screen width / 6)
max_undo_stack: 20             # Default: 20 undos
```

**Action**:
- [ ] Create config.example.yml with all settings
- [ ] Mark each as REQUIRED or OPTIONAL
- [ ] Add comments explaining what each does
- [ ] Add .gitignore entry for config.yml

---

### 2.6 Create LICENSE File

**Recommended: MIT License**

For most open-source projects, the MIT License is the best choice because it:
- **Protects you from liability**: "AS IS" clause means you're not responsible if something goes wrong
- **Protects your rights**: Requires attribution - your name stays with the code
- **Encourages use**: Very permissive, widely accepted by developers and companies
- **Simple**: Short, easy to understand

**How to create**:

1. Create a file named `LICENSE` (no extension) in your project root
2. Copy the MIT License text (see example below)
3. Replace `[year]` with current year and `[fullname]` with your name

**MIT License Template**:
```text
MIT License

Copyright (c) 2025 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Alternative Licenses** (if MIT doesn't fit):

**Apache 2.0** - Use if:
- You're concerned about patent trolls
- You want explicit patent protection
- Your project might be used in corporate environments
- Con: More complex license text

**GPL v3** - Use if:
- You want to force all derivatives to remain open source (copyleft)
- You want strong protection against proprietary forks
- Con: May limit commercial adoption

**Action**:
- [ ] Create LICENSE file with MIT License text
- [ ] Update your name and year in the copyright line
- [ ] Reference license in README.md (add "## License" section)

---

## 3. Automation & Scripts Phase

### 3.1 Create/Update install.sh

**What it does**: Automates complete installation from zero to running app.

**Should handle**:
1. Check system prerequisites (OS, architecture)
2. Install/verify Python (or handle via conda)
3. Install/verify conda if needed
4. Create virtual environment
5. Install dependencies
6. Create necessary directories
7. Copy example config files
8. Set up desktop integration
9. Verify installation (run smoke tests)

**Example structure**:
```bash
#!/bin/bash
set -e  # Exit on any error

echo "🚀 Installing MyProject..."

# 1. Check prerequisites
check_prerequisites() {
    echo "📋 Checking system requirements..."

    # Check OS
    if [ ! -f /etc/os-release ]; then
        echo "❌ Cannot detect OS. This installer requires Ubuntu 20.04+"
        exit 1
    fi

    source /etc/os-release
    if [ "$ID" != "ubuntu" ]; then
        echo "⚠️  Warning: Designed for Ubuntu, detected $ID"
    fi

    echo "✅ OS: $PRETTY_NAME"
}

# 2. Install Miniconda if needed
install_miniconda() {
    if command -v conda &> /dev/null; then
        echo "✅ Conda already installed"
        return
    fi

    echo "📦 Installing Miniconda..."
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
    bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3
    rm Miniconda3-latest-Linux-x86_64.sh

    # Add to PATH
    echo 'export PATH="$HOME/miniconda3/bin:$PATH"' >> ~/.bashrc
    source ~/.bashrc
}

# 3. Create environment
create_environment() {
    echo "🔧 Creating conda environment..."
    conda env create -f environment.yml
}

# 4. Install application
install_app() {
    echo "📥 Installing application..."
    conda activate myproject
    pip install -r requirements.txt
}

# 5. Setup directories
setup_directories() {
    echo "📁 Creating directories..."
    mkdir -p ~/.config/myproject
    mkdir -p ~/.local/share/myproject
}

# 6. Setup configuration
setup_config() {
    echo "⚙️  Setting up configuration..."
    if [ ! -f config.yml ]; then
        cp config.example.yml config.yml
        echo "⚠️  Created config.yml - EDIT THIS FILE with your API keys!"
    fi
}

# 7. Desktop integration
setup_desktop() {
    echo "🖥️  Setting up desktop integration..."
    mkdir -p ~/.local/share/applications

    cat > ~/.local/share/applications/myproject.desktop << EOF
[Desktop Entry]
Name=MyProject
Exec=/home/$USER/miniconda3/envs/myproject/bin/python /path/to/main.py
Icon=/path/to/icon.png
Type=Application
Categories=Utility;
EOF

    chmod +x ~/.local/share/applications/myproject.desktop
    update-desktop-database ~/.local/share/applications/
}

# 8. Verification (smoke tests)
verify_installation() {
    echo "🔍 Verifying installation..."

    conda activate myproject

    # Test Python version
    python_version=$(python --version)
    echo "✅ $python_version"

    # Test critical imports
    python -c "import anthropic" && echo "✅ anthropic library" || echo "❌ anthropic missing"
    python -c "import ttkbootstrap" && echo "✅ ttkbootstrap library" || echo "❌ ttkbootstrap missing"

    # Test that main script exists and is executable
    if [ -f main.py ]; then
        echo "✅ main.py found"
    else
        echo "❌ main.py not found"
    fi

    echo ""
    echo "🎉 Installation complete!"
    echo ""
    echo "⚠️  IMPORTANT: Edit config.yml with your API keys before running"
    echo ""
    echo "To run: conda activate myproject && python main.py"
}

# Run all steps
check_prerequisites
install_miniconda
create_environment
install_app
setup_directories
setup_config
setup_desktop
verify_installation
```

**Action**: Create comprehensive install.sh that handles everything.

---

### 3.2 What Are Smoke Tests?

**Layman's explanation**:
When firefighters enter a building, they first check for smoke - a quick test to see if it's safe. In software, smoke tests are quick checks to see if the app is basically working before doing detailed testing.

**Not smoke tests** (too detailed):
- Test every feature thoroughly
- Check edge cases
- Verify complex workflows

**Yes, smoke tests** (quick sanity checks):
- Does the app launch?
- Can it import all required libraries?
- Can it connect to the API?
- Does it crash immediately?

**Example smoke test function**:
```python
#!/usr/bin/env python3
"""
smoke_test.py - Quick verification that app is basically working
Run this after installation to verify everything is OK
"""

import sys

def test_imports():
    """Test that all required libraries can be imported"""
    print("🧪 Testing imports...")

    try:
        import tkinter
        print("  ✅ tkinter")
    except ImportError:
        print("  ❌ tkinter - GUI won't work")
        return False

    try:
        import ttkbootstrap
        print("  ✅ ttkbootstrap")
    except ImportError:
        print("  ❌ ttkbootstrap - Install with: pip install ttkbootstrap")
        return False

    try:
        import anthropic
        print("  ✅ anthropic")
    except ImportError:
        print("  ❌ anthropic - Install with: pip install anthropic")
        return False

    return True

def test_config():
    """Test that configuration files exist"""
    print("\n🧪 Testing configuration...")

    import os
    if os.path.exists("config.yml"):
        print("  ✅ config.yml found")
        return True
    else:
        print("  ❌ config.yml not found - Copy from config.example.yml")
        return False

def test_api_key():
    """Test that API key is configured"""
    print("\n🧪 Testing API key...")

    import os
    if os.path.exists("claude.txt"):
        with open("claude.txt") as f:
            key = f.read().strip()
            if key and not key.startswith("your-"):
                print("  ✅ API key configured")
                return True

    print("  ❌ API key not configured - Add to claude.txt")
    return False

def test_gui_launch():
    """Test that GUI can be initialized (without showing it)"""
    print("\n🧪 Testing GUI initialization...")

    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()  # Don't show window
        root.destroy()
        print("  ✅ GUI can initialize")
        return True
    except Exception as e:
        print(f"  ❌ GUI initialization failed: {e}")
        return False

def main():
    print("🔍 Running smoke tests...\n")

    tests = [
        test_imports(),
        test_config(),
        test_api_key(),
        test_gui_launch()
    ]

    print("\n" + "="*50)
    if all(tests):
        print("✅ All smoke tests passed!")
        print("Your installation looks good. Run main.py to start.")
        return 0
    else:
        print("❌ Some smoke tests failed")
        print("Fix the issues above before running the application")
        return 1

if __name__ == "__main__":
    sys.exit(main())
```

**Add to install.sh**:
```bash
# At end of install.sh:
echo "🧪 Running smoke tests..."
python smoke_test.py
```

**Action**:
- [ ] Create smoke_test.py
- [ ] Add smoke test call to install.sh
- [ ] Document how to run manually: `python smoke_test.py`

---

### 3.3 Create uninstall.sh

**What it does**: Removes everything install.sh created.

**Should handle**:
1. Remove conda environment
2. Remove desktop file
3. Remove config directories
4. Ask about user data (don't auto-delete!)

**Example**:
```bash
#!/bin/bash

echo "🗑️  Uninstalling MyProject..."

# Ask for confirmation
read -p "Are you sure you want to uninstall? (y/N): " confirm
if [ "$confirm" != "y" ]; then
    echo "Cancelled"
    exit 0
fi

# Remove conda environment
if conda env list | grep -q myproject; then
    echo "Removing conda environment..."
    conda env remove -n myproject -y
    echo "✅ Removed conda environment"
fi

# Remove desktop file
if [ -f ~/.local/share/applications/myproject.desktop ]; then
    rm ~/.local/share/applications/myproject.desktop
    update-desktop-database ~/.local/share/applications/
    echo "✅ Removed desktop file"
fi

# Ask about config and data
read -p "Remove configuration files? (y/N): " remove_config
if [ "$remove_config" = "y" ]; then
    rm -rf ~/.config/myproject
    echo "✅ Removed config"
fi

read -p "Remove user data? (y/N): " remove_data
if [ "$remove_data" = "y" ]; then
    rm -rf ~/.local/share/myproject
    echo "✅ Removed data"
fi

echo ""
echo "🎉 Uninstallation complete"
```

**Action**: Create uninstall.sh that reverses install.sh.

---

## 4. Version Management

### 4.1 What is a Version Number?

**The format**: MAJOR.MINOR.PATCH (e.g., 1.2.3)

- **MAJOR** (1.x.x): Breaking changes - users must update their code
- **MINOR** (x.2.x): New features - backwards compatible
- **PATCH** (x.x.3): Bug fixes - no new features

**Examples**:
- 1.0.0 → 1.0.1: Fixed a bug (patch)
- 1.0.1 → 1.1.0: Added new feature (minor)
- 1.5.0 → 2.0.0: Changed API completely (major)

---

### 4.2 How to Version Your Project

**Option 1: VERSION file** (simple)
```bash
# Create a file called VERSION
echo "1.2.0" > VERSION
```

**Option 2: In your code** (better)
```python
# In main.py or __init__.py
__version__ = "1.2.0"

# Then in CLI:
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", action="version",
                       version=f"MyProject {__version__}")
```

**Option 3: Git tags** (best - version control integrated)
```bash
# When releasing version 1.2.0:
git tag -a v1.2.0 -m "Release 1.2.0 - Added undo functionality"
git push origin v1.2.0
```

---

### 4.3 Version Strategy Workflow

**When you finish a set of changes**:

1. Update CHANGELOG.md with changes
2. Decide if it's MAJOR, MINOR, or PATCH
3. Update version in code: `__version__ = "1.2.0"`
4. Commit: `git commit -m "Bump version to 1.2.0"`
5. Tag: `git tag -a v1.2.0 -m "Release 1.2.0"`
6. Push: `git push && git push --tags`

**Action**:
- [ ] Add `__version__` to your main Python file
- [ ] Create git tag for current state
- [ ] Document version in README

---

## 5. Update & Migration Strategy

### 5.1 What is Migration?

**Migration** = Moving data from old version format to new version format.

**Example scenario**:
- Version 1.0: Stored file history as JSON with format A
- Version 2.0: Changed JSON format to format B
- **Migration needed**: Convert user's v1.0 data to v2.0 format

---

### 5.2 How to Handle Updates

**Document in INSTALL.md or UPGRADING.md**:

```markdown
# Upgrading from Previous Versions

## From 1.x to 2.0

### Breaking Changes
- Configuration file renamed: config.json → config.yml
- API key location changed: .env → claude.txt

### Migration Steps
1. Backup your data:
   ```bash
   cp ~/.config/myproject ~/.config/myproject.backup
   ```

2. Run migration script:
   ```bash
   python migrate_v1_to_v2.py
   ```

3. Update installation:
   ```bash
   git pull
   conda activate myproject
   pip install -r requirements.txt --upgrade
   ```

4. Verify:
   ```bash
   python smoke_test.py
   ```

### Rollback (if something breaks)
```bash
git checkout v1.5.0
conda activate myproject
pip install -r requirements.txt
cp ~/.config/myproject.backup ~/.config/myproject
```

## From 1.4 to 1.5
No breaking changes, simple update:
```bash
git pull
pip install -r requirements.txt --upgrade
```
```

---

### 5.3 Migration Script Example

**If data format changes**, provide a migration script:

```python
#!/usr/bin/env python3
"""
migrate_v1_to_v2.py - Migrate user data from v1.x to v2.0 format
"""

import json
import os
from pathlib import Path

def migrate_config():
    """Migrate config.json to config.yml"""
    old_config = Path.home() / ".config" / "myproject" / "config.json"
    new_config = Path.home() / ".config" / "myproject" / "config.yml"

    if not old_config.exists():
        print("No old config found, nothing to migrate")
        return

    # Read old format
    with open(old_config) as f:
        data = json.load(f)

    # Write new format
    import yaml
    with open(new_config, 'w') as f:
        yaml.dump(data, f)

    print(f"✅ Migrated config: {old_config} → {new_config}")
    print(f"⚠️  Old file kept as backup")

def migrate_file_history():
    """Migrate file history format if changed"""
    history_file = Path.home() / ".driver_seat_history.json"

    if not history_file.exists():
        return

    with open(history_file) as f:
        data = json.load(f)

    # Example: Add new field to each entry
    for entry in data.get("files", []):
        if "saved" not in entry:
            entry["saved"] = False  # Add default value

    # Write back
    with open(history_file, 'w') as f:
        json.dump(data, f, indent=2)

    print("✅ Migrated file history format")

if __name__ == "__main__":
    print("🔄 Migrating from v1.x to v2.0...")
    migrate_config()
    migrate_file_history()
    print("✅ Migration complete!")
```

**Action**:
- [ ] Document update procedure in UPGRADING.md
- [ ] Create migration scripts when data formats change
- [ ] Test migration on copy of real user data

---

## 6. Regular Maintenance Actions

### 6.1 What to Do Every 5-10 Changes

Run through sections 1-5 of this checklist:
- Clean dead code
- Update documentation
- Test install.sh on clean system
- Update version number
- Create git tag

**Time estimate**: 2-4 hours for thorough maintenance

---

### 6.2 What to Do Before Every Release

- [ ] Run full checklist (sections 1-5)
- [ ] Test on fresh Ubuntu VM
- [ ] Update all documentation
- [ ] Create release notes
- [ ] Tag git release
- [ ] Test uninstall.sh

**Time estimate**: 4-6 hours for first release, 2-3 hours after

---

### 6.3 What to Do Quarterly (Every 3 Months)

- [ ] Review and update dependencies (security updates)
- [ ] Check for deprecated APIs in your dependencies
- [ ] Review architecture - is it still optimal?
- [ ] Update screenshots if UI changed
- [ ] Review open issues/TODOs

---

## 7. Testing Installation on Fresh System

### 7.1 Why Test on Fresh System?

**The problem**: Your dev machine has everything installed. Your install.sh might have bugs you don't see.

**The solution**: Test on a completely fresh Ubuntu installation.

---

### 7.2 How to Test Without Breaking Your Machine

**Option 1: VirtualBox** (free)
```bash
# Install VirtualBox
sudo apt install virtualbox

# Download Ubuntu ISO from ubuntu.com
# Create new VM, install Ubuntu
# Run your install.sh in the VM
```

**Option 2: Multipass** (easier)
```bash
# Install Multipass
sudo snap install multipass

# Launch fresh Ubuntu instance
multipass launch --name test-install

# Copy your project to it
multipass transfer install.sh test-install:
multipass transfer requirements.txt test-install:

# Shell into it and test
multipass shell test-install
./install.sh

# Delete when done
multipass delete test-install
multipass purge
```

**Option 3: Docker** (lightest)
```bash
# Test in Ubuntu container
docker run -it ubuntu:24.04 /bin/bash

# Inside container:
apt update
apt install git
git clone your-repo
cd your-repo
./install.sh
```

**Action**: Test install.sh on fresh system before major release.

---

## 8. Performance & Resource Documentation

### 8.1 Why Document Requirements?

Users need to know if your app will run on their machine BEFORE installing.

---

### 8.2 What to Document

**In README.md, add**:

```markdown
## System Requirements

### Minimum (App will run, might be slow)
- **OS**: Ubuntu 20.04 or newer
- **RAM**: 8GB
- **Disk Space**: 2GB
- **Python**: 3.10+
- **Internet**: Required (for cloud APIs)

### Recommended (Smooth experience)
- **OS**: Ubuntu 22.04 or newer
- **RAM**: 16GB
- **Disk Space**: 5GB
- **CPU**: 4+ cores
- **Internet**: Broadband (for faster API responses)

### Notes
- GUI requires X11 or Wayland display server
- Ollama local model requires additional 4GB disk space
- API usage requires active internet connection
```

**Action**: Document actual resource usage from your testing.

---

## 9. Development Setup Documentation

### 9.1 Why Separate from User Install?

**User**: Just wants the app to work
**Developer**: Wants to modify code, run tests, use debugging tools

---

### 9.2 Create docs/DEVELOPMENT.md

```markdown
# Development Setup

For users who want to modify the code or contribute.

## Development Installation

```bash
# Clone repository
git clone https://github.com/yourname/yourproject
cd yourproject

# Create development environment
conda env create -f environment-dev.yml
conda activate yourproject-dev

# Install in editable mode
pip install -e .

# Install development tools
pip install pytest black mypy
```

## Code Style

- Format with Black: `black .`
- Type checking: `mypy modules/`
- Run tests: `pytest tests/`

## Project Structure
[Explain where things go]

## Running in Debug Mode
```bash
# Enable debug logging
export DEBUG=1
python main.py
```

## Running Tests
```bash
# Run all tests
pytest

# Run specific test
pytest tests/test_processor.py -k test_analyze_text

# Run with coverage
pytest --cov=modules tests/
```

## Making Changes

1. Create feature branch: `git checkout -b feature-name`
2. Make changes
3. Run tests: `pytest`
4. Format code: `black .`
5. Commit: `git commit -m "Add feature X"`
6. Push and create PR

## Common Development Tasks

### Adding a New AI Interface
1. Create `modules/ai/new_interface.py`
2. Implement required methods
3. Register in interface manager
4. Add tests

### Modifying the GUI
1. Edit `modules/gui/main_window.py`
2. Test with: `python main.py`
3. Update screenshots if layout changed
```

**Action**: Create development guide separate from user installation.

---

## 10. Summary: Your Maintenance Workflow

### Quick Checklist (15 minutes)
After every few changes:
- [ ] Remove dead code
- [ ] Update CHANGELOG.md
- [ ] Commit with clear message

### Regular Maintenance (2-4 hours)
Every 5-10 changes or before release:
- [ ] Full code cleanup (Section 1)
- [ ] Update all docs (Section 2)
- [ ] Test install.sh (Section 7)
- [ ] Bump version (Section 4)

### Deep Maintenance (4-6 hours)
Every 3 months or major release:
- [ ] Review dependencies for updates
- [ ] Test on fresh VM
- [ ] Update architecture docs
- [ ] Review and close old TODOs

---

## Appendix: Quick Reference

### Files This Process Creates/Updates

```
yourproject/
├── README.md                  # Main documentation
├── INSTALL.md                # Installation guide
├── CHANGELOG.md              # Version history
├── LICENSE                   # Software license
├── VERSION                   # Current version number
├── requirements.txt          # Python dependencies (pinned!)
├── environment.yml           # Conda environment
├── config.example.yml        # Configuration template
├── .gitignore               # Ignore config.yml, secrets
├── install.sh               # Automated installation
├── uninstall.sh             # Automated removal
├── smoke_test.py            # Quick verification tests
│
├── docs/
│   ├── _AA_MAINTENANCE_CHECKLIST.md         # This document
│   ├── _AA_MAINTENANCE_PROJECT_SPECIFIC.md  # Project-specific tasks
│   ├── ARCHITECTURE.md      # System design overview
│   ├── DEVELOPMENT.md       # Developer setup guide
│   ├── UPGRADING.md         # Version migration guide
│   └── archive/             # Old documentation
│
└── modules/
    └── __init__.py          # Contains __version__
```

### Key Concepts Recap

- **Pin versions**: Use `==` not `>=` in requirements.txt
- **Config files**: Store HOW to use the app, not WHAT to install
- **Smoke tests**: Quick checks that app basically works
- **Version numbers**: MAJOR.MINOR.PATCH (1.2.3)
- **Migration**: Convert user data between version formats
- **Fresh system test**: Verify install.sh on clean Ubuntu VM

---

## Questions?

Reference sections by number:
- **1.x**: Code cleanup
- **2.x**: Documentation
- **3.x**: Automation scripts
- **4.x**: Versioning
- **5.x**: Updates/migration
- **6.x**: Regular maintenance schedule
- **7.x**: Testing on fresh systems
- **8.x**: Performance docs
- **9.x**: Development setup
- **10**: Summary workflow

---

**Last Updated**: 2025-10-17
**Status**: Generic template - adapt for your project
