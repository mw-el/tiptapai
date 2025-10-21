# Create Reproducible Installation System

**For Claude Code:** Generate installation scripts and documentation that replicate a working environment exactly on any target system.


## REQUIRED OUTPUT FILES

### Python/Conda Applications

**1. environment-VARIANT.yml** (one per platform: cuda12, cuda11, cpu)
```yaml
name: envname
channels: [pytorch, nvidia, conda-forge, defaults]
dependencies:
  - python=X.Y.Z                    # EXACT version
  - channel::package=X.Y.Z          # Pin channel + version
  - conda-forge::tk=X.Y.Z=xft*      # Build variant if critical
  - pip:
      - critical==X.Y.Z             # Comment WHY critical
      - package==X.Y.Z
variables:
  VAR_NAME: value
```

**Rules:**
- Use `==` never `>=`
- Comment critical packages
- Include environment variables in `variables:` section
- One file per variant (CUDA version, CPU-only)

**2. install.sh**

```bash
#!/bin/bash
set -e

# Setup logging
INSTALL_LOG="${INSTALL_LOG:-./install-$(date +%Y%m%d-%H%M%S).log}"
exec > >(tee -a "$INSTALL_LOG") 2>&1
echo "=== Installation started: $(date) ==="
echo "=== Log file: $INSTALL_LOG ==="

#=== BILL OF MATERIALS ===#
declare -A REQUIRED_SYSTEM_PACKAGES=(["pkg"]="purpose")
declare -A REQUIRED_PYTHON_PACKAGES=(["pkg"]="version")
declare -A REQUIRED_ENV_VARS=(["VAR"]="value")
REQUIRED_PYTHON_VERSION="X.Y"
ENV_NAME="envname"

#=== STEP 0: VALIDATE ===#
echo "Step 0: Validating system against Bill of Materials..."
# For each component: check exists + correct version
# Log: what found, what expected, status (✓/✗)
# Count CORRECT/TOTAL
# If 100% compliant: echo "Already compliant" && exit 0

#=== STEP 1: System Packages ===#
echo "Step 1: System packages..."
# Install missing apt/yum packages with sudo
# Log: which packages installed, apt output

#=== STEP 2: Conda Environment ===#
echo "Step 2: Conda environment..."
# If not exists: conda env create -f environment-VARIANT.yml
# If exists + valid: skip
# If exists + invalid: ask to recreate
# Log: environment creation output, package installation details

#=== STEP 3: Environment Variables ===#
echo "Step 3: Environment variables..."
# CRITICAL: Variables in YAML are not auto-active!
conda env config vars set VAR=value -n envname
conda deactivate && conda activate envname  # Required!
# Log: which variables set, verification

#=== STEP 4: Directories ===#
echo "Step 4: Directories..."
mkdir -p ~/APP/{data,logs}
mkdir -p ~/.config/APP
# Log: directories created

#=== STEP 5: Starter Script ===#
echo "Step 5: Starter script..."
export HOME="$HOME" SCRIPT_DIR="$(pwd)" ENV_NAME="envname"
envsubst < start.sh.template > start.sh
chmod +x start.sh
# Log: script generated, permissions set

#=== STEP 6: Desktop File ===#
echo "Step 6: Desktop integration..."
envsubst < app.desktop.template > ~/.local/share/applications/app.desktop
update-desktop-database ~/.local/share/applications/
# Log: desktop file created, database updated

#=== STEP 7: VALIDATE ===#
echo "Step 7: Final validation..."
# Re-run Step 0 validation
# Log: complete validation results
# Must get 100% or exit 1

echo "=== Installation completed: $(date) ==="
echo "=== Log saved to: $INSTALL_LOG ==="
```

**3. start_app.sh.template**
```bash
#!/bin/bash
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONDA_BASE=$(conda info --base 2>/dev/null || echo "$HOME/miniconda3")
source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate ${ENV_NAME}
python "$SCRIPT_DIR/main.py" "$@"
```

**4. app.desktop.template**
```desktop
[Desktop Entry]
Name=App Name
Exec=${HOME}/path/to/start.sh
Icon=${SCRIPT_DIR}/icon.png
Type=Application
Categories=Utility;
```

**5. INSTALL.md**
```markdown
# Installation

## Quick Install
git clone REPO && cd REPO && ./install.sh

## What Gets Installed
[Bill of Materials table: component, version, purpose]

## Requirements
- OS: Ubuntu/Debian
- Conda installed
- (Optional) NVIDIA GPU with CUDA X.x

## Installation Log
The installer creates a timestamped log file (install-YYYYMMDD-HHMMSS.log)
containing all installation steps and outputs.

**If installation fails or app doesn't work:**
```bash
# Check the log file
cat install-20251019-143022.log

# Find validation failures
grep "✗" install-*.log

# Check specific step
grep -A 20 "Step 3:" install-*.log
```

## Updating
git pull origin main && ./install.sh
```

### Electron/NPM Applications

**1. package.json**
```json
{
  "engines": {
    "node": "X.Y.Z",
    "npm": ">=X.Y.Z"
  },
  "dependencies": {
    "electron": "X.Y.Z",
    "package": "X.Y.Z"
  },
  "scripts": {
    "start": "electron .",
    "install-deps": "npm ci"
  }
}
```

**Rules:**
- Specify exact Node version in `engines`
- Use exact versions in dependencies
- Must have package-lock.json committed

**2. .nvmrc**
```
X.Y.Z
```

**3. install.sh** (Electron)
```bash
#!/bin/bash
set -e

# Setup logging
INSTALL_LOG="${INSTALL_LOG:-./install-$(date +%Y%m%d-%H%M%S).log}"
exec > >(tee -a "$INSTALL_LOG") 2>&1
echo "=== Installation started: $(date) ==="
echo "=== Log file: $INSTALL_LOG ==="

#=== BILL OF MATERIALS ===#
REQUIRED_NODE_VERSION="X.Y.Z"
declare -A REQUIRED_SYSTEM_PACKAGES=(
    ["build-essential"]="node-gyp"
    ["libgconf-2-4"]="Electron runtime"
)

#=== STEP 0: VALIDATE ===#
echo "Step 0: Validating system..."
# Check Node version, system packages, package-lock.json exists
# Log: validation results

#=== STEP 1: System Packages ===#
echo "Step 1: System packages..."
# Install missing apt packages
# Log: installed packages

#=== STEP 2: Node.js ===#
echo "Step 2: Node.js version..."
# If wrong version:
nvm install X.Y.Z
nvm use X.Y.Z
nvm alias default X.Y.Z
# Log: nvm output

#=== STEP 3: NPM Packages ===#
echo "Step 3: NPM packages..."
npm ci  # NOT npm install
# Log: npm ci output

#=== STEP 4: Native Modules ===#
echo "Step 4: Native modules..."
if [ -x node_modules/.bin/electron-rebuild ]; then
    ./node_modules/.bin/electron-rebuild
fi
# Log: rebuild output

#=== STEP 5: Desktop Integration ===#
echo "Step 5: Desktop integration..."
envsubst < app.desktop.template > ~/.local/share/applications/app.desktop
# Log: desktop file created

#=== STEP 6: Build ===#
echo "Step 6: Building application..."
npm run build
# Log: build output

#=== STEP 7: VALIDATE ===#
echo "Step 7: Final validation..."
# Re-check all components
# Log: validation results

echo "=== Installation completed: $(date) ==="
echo "=== Log saved to: $INSTALL_LOG ==="
```

**4. start.sh.template**
```bash
#!/bin/bash
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use
npm start
```


## IMPLEMENTATION STEPS

### 1. Inventory Working System

**Python/Conda:**
```bash
conda activate ENVNAME
conda env export > environment-working.yml
pip list --format=freeze > pip-packages.txt
conda env config vars list
```

**Electron/NPM:**
```bash
node --version > node-version.txt
npm list --depth=0 > npm-packages.txt
# Ensure package-lock.json exists
```

**System packages:**
```bash
dpkg -l | grep "^ii" > system-packages.txt
# Identify which packages app actually uses (ldd, strace)
```

**Code patterns:**
```bash
grep -r "CRITICAL\|FIX\|WORKAROUND" . --include="*.py"
grep -c "important_pattern" file.py  # Count occurrences
```

### 2. Create Bill of Materials

In install.sh, define at top:
```bash
# Python
declare -A REQUIRED_PYTHON_PACKAGES=(
    ["pytorch"]="2.5.1"
    ["av"]="16.0.1"  # CRITICAL: audio decoding
)

# Electron
declare -A REQUIRED_NPM_PACKAGES=(
    ["electron"]="28.0.0"
)

# Both
declare -A REQUIRED_SYSTEM_PACKAGES=(
    ["package"]="purpose"
)
```

### 3. Validation Logic

```bash
validate_component() {
    local name=$1 expected=$2
    local actual=$(get_actual_version "$name")

    if [ "$actual" == "$expected" ]; then
        echo "✓ $name"
        return 0
    else
        echo "✗ $name (have: $actual, need: $expected)"
        return 1
    fi
}

# Count successes
CORRECT=0; TOTAL=10
for component in ...; do
    validate_component "$component" && CORRECT=$((CORRECT+1))
done

echo "Validation: $CORRECT/$TOTAL"
[ $CORRECT -eq $TOTAL ] && exit 0  # Already compliant
```

### 4. Generate Dynamic Files

**Never hardcode paths:**
```bash
# WRONG
Exec=/home/username/app/start.sh

# RIGHT (template)
Exec=${HOME}/app/start.sh

# Generate
export HOME="$HOME" SCRIPT_DIR="$(pwd)"
envsubst < template > output
```

### 5. Install Logging

Every install.sh must create a detailed log file:

```bash
# At start of install.sh:
INSTALL_LOG="${INSTALL_LOG:-./install-$(date +%Y%m%d-%H%M%S).log}"
exec > >(tee -a "$INSTALL_LOG") 2>&1

echo "=== Installation started: $(date) ==="
echo "=== Log file: $INSTALL_LOG ==="
```

**Log must contain:**
- Timestamp for each step
- Bill of Materials validation (before/after)
- What was found vs. what was expected
- All command outputs (apt, conda, npm, etc.)
- Error messages with full context
- Final validation results

**Usage for troubleshooting:**
```bash
# If installation fails or app doesn't work:
# 1. Check log file
cat install-20251019-143022.log

# 2. Find where validation failed
grep "✗" install-20251019-143022.log

# 3. Check specific step output
grep -A 20 "Step 3:" install-20251019-143022.log

# 4. Use log to identify missing components
grep "Missing:" install-20251019-143022.log
```


## CRITICAL RULES

### Python/Conda

1. **Versions:** `package==X.Y.Z` not `package>=X.Y.Z`
2. **Env vars:** After setting, must `conda deactivate && conda activate`
3. **Channels:** Pin critical packages to channel: `pytorch::pytorch=X.Y.Z`
4. **Build variants:** If critical: `tk=X.Y.Z=xft*`

### Electron/NPM

1. **Lock file:** Must commit package-lock.json to git
2. **Install:** Use `npm ci` not `npm install` (production)
3. **Node version:** Exact in package.json `engines` + .nvmrc
4. **Native modules:** Run `electron-rebuild` after install
5. **System deps:** Must have build-essential + python3 for node-gyp

### Both

1. **Paths:** Use `$HOME`, `$SCRIPT_DIR`, never `/home/username/`
2. **Validation:** Before AND after installation
3. **Templates:** Use envsubst to generate files
4. **Idempotent:** Re-running install.sh should be safe
5. **Exit codes:** 0 if success, 1 if failure


## VALIDATION PATTERNS

### Check package version

**Python:**
```bash
ACTUAL=$(pip show package | grep Version | awk '{print $2}')
```

**NPM:**
```bash
ACTUAL=$(node -p "require('./node_modules/package/package.json').version")
```

**Conda package:**
```bash
conda list package | grep "^package " | awk '{print $2}'
```

### Check environment variable

```bash
conda env config vars list -n envname | grep -q "VAR = value"
```

### Check code pattern

```bash
COUNT=$(grep -c "pattern" file.py)
[ $COUNT -ge 2 ] || echo "Fix missing"
```

### Check system package

```bash
dpkg -l | grep -q "^ii  package "
```


## COMMON ERRORS & FIXES

| Error | Cause | Fix |
|-------|-------|-----|
| Environment variables not active | Only in YAML | Add explicit `conda env config vars set` + deactivate/activate |
| Wrong versions installed | Used `>=` | Change to `==` |
| Hardcoded paths fail | `/home/user/` in files | Use `$HOME`, generate with envsubst |
| Native modules fail (Electron) | Missing build tools | Install build-essential, python3 |
| package-lock.json missing | Not committed | Commit to git |
| npm install changes versions | Not using npm ci | Use `npm ci` for production |
| Validation only after install | Missing issues | Validate before AND after |
| Can't troubleshoot failures | No logging | Add `exec > >(tee -a "$INSTALL_LOG") 2>&1` at script start |
| Log file not readable | No timestamps | Add `echo "Step X: ..." && date` before each step |


## OUTPUT STRUCTURE

```
repo/
├── environment-cuda12.yml
├── environment-cpu.yml
├── package.json (Electron)
├── package-lock.json (Electron)
├── .nvmrc (Electron)
├── install.sh                      # Creates install-YYYYMMDD-HHMMSS.log
├── start_app.sh.template
├── app.desktop.template
├── INSTALL.md                      # Must explain log usage
├── install-*.log (generated)       # For troubleshooting
└── docs/
    └── BILL_OF_MATERIALS.md
```

**Note:** Install log files are generated at runtime and should be gitignored:
```gitignore
install-*.log
```


## TEMPLATE: Minimal Validation

```bash
#!/bin/bash
set -e

# Bill of Materials
declare -A REQUIRED=(
    ["component1"]="version1"
    ["component2"]="version2"
)

# Validation
CORRECT=0
TOTAL=${#REQUIRED[@]}

for comp in "${!REQUIRED[@]}"; do
    expected="${REQUIRED[$comp]}"
    actual=$(get_version "$comp")

    if [ "$actual" == "$expected" ]; then
        echo "✓ $comp==$expected"
        CORRECT=$((CORRECT+1))
    else
        echo "✗ $comp (have: $actual, need: $expected)"
    fi
done

echo ""
echo "Validation: $CORRECT/$TOTAL components correct"

if [ $CORRECT -eq $TOTAL ]; then
    echo "✓ System fully compliant"
    exit 0
else
    echo "→ Installation required"
    exit 1
fi
```



When implementing:
1. Gather working system state (conda export, pip list, etc.)
2. Define Bill of Materials at top of install.sh
3. Create validation functions (before AND after)
4. Add logging setup at start (tee to timestamped log file)
5. Generate install.sh with validation before/after
6. Create templates for dynamic files (use envsubst)
7. Log all steps with timestamps and outputs
8. Document how to use log for troubleshooting in INSTALL.md
