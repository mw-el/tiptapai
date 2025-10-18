# Desktop Integration for Python Applications with Conda Environments

## Quick Setup

**For developers**: This document explains the underlying concepts and troubleshooting steps for desktop integration with conda environments.

---

## Critical Summary - What You MUST Do

### For Icon Display to Work:

1. **Use `tk.Tk(className='your-app-name')` NOT `tb.Window()`**
   - ttkbootstrap's `tb.Window()` does NOT support the `className` parameter
   - Attempting to set WM_CLASS after creation with `tk.call('wm', 'class', ...)` DOES NOT WORK
   - ✅ CORRECT: `app = tk.Tk(className='dictate')` then `style = tb.Style(theme='sandstone')`
   - ❌ WRONG: `app = tb.Window(themename='sandstone')` then trying to set WM_CLASS
   - 📖 For detailed explanation of this issue, see [ttkbootstrap Window Integration](ttkbootstrap-window-integration.md)

2. **Install tk with XFT support: `conda install -c conda-forge "tk=8.6.13=xft*"`**
   - The `noxft` build lacks proper X11 desktop integration
   - Without XFT, icons won't display correctly in dock/taskbar even if WM_CLASS is correct
   - XFT also provides better font rendering on Linux

3. **Match StartupWMClass in .desktop file with tk.Tk className parameter**
   - Desktop file: `StartupWMClass=dictate`
   - Python code: `tk.Tk(className='dictate')`
   - These MUST match exactly (case-sensitive)

### For Conda Environment to Work:

1. **Use explicit conda Python path in startup script**
   - ❌ WRONG: `python app.py` (may use wrong Python)
   - ✅ CORRECT: `/home/user/miniconda3/envs/myenv/bin/python app.py`

2. **Remove executable permission from Python script**
   - ❌ If script is executable with shebang, OS ignores your explicit Python
   - ✅ Use: `chmod -x app.py`

## Problem Overview

When creating desktop launcher icons (`.desktop` files) for Python applications that require conda environments, a common issue arises: **the desktop launcher doesn't properly activate the conda environment**, causing the application to run with the system Python instead of the conda Python with its specific dependencies.

### Symptoms
- Application runs from terminal with `python script.py` ✅
- Application runs from bash script with conda activation ✅
- Application fails or has missing features when launched from desktop icon ❌
- Process inspection shows `/usr/bin/python3` instead of `/path/to/conda/envs/ENV/bin/python` ❌

## Root Causes

### Primary Issue: Executable Python Scripts with Shebangs

**THIS IS THE MOST COMMON AND HARDEST-TO-DEBUG ISSUE:**

When a Python script is executable (`chmod +x script.py`) and has a shebang line (e.g., `#!/usr/bin/env python3`), the operating system will **completely ignore** any Python interpreter you specify when calling it.

**Example of the problem:**
```bash
# In your startup script:
/home/username/miniconda3/envs/myenv/bin/python my_script.py

# BUT if my_script.py is executable and has #!/usr/bin/env python3,
# the system actually runs:
/usr/bin/python3 my_script.py  # WRONG PYTHON!
```

**How to verify this is your issue:**
```bash
# Launch your app from desktop icon, then check:
ps aux | grep "my_script.py" | grep -v grep

# If you see /usr/bin/python3 instead of your conda python, this is your problem!
```

**The fix:**
```bash
# Remove executable permission from Python script
chmod -x ~/project/my_script.py

# Now it MUST be called with explicit interpreter
/home/username/miniconda3/envs/myenv/bin/python my_script.py  # This now works!
```

**Why this happens:**
- When a file is executable and has a shebang, the kernel uses the shebang to determine the interpreter
- Your explicit Python path in the command line is ignored
- `#!/usr/bin/env python3` resolves to system Python, not conda Python
- This issue is **silent** - no errors, just wrong environment

**Critical lesson from debugging:**
Even when your startup script correctly:
- ✅ Activates conda environment
- ✅ Sets LD_LIBRARY_PATH for CUDA
- ✅ Uses explicit conda Python path

The app will **still use system Python** if the script file is executable with a shebang!

### Secondary Issue: Desktop Launcher Environment

Desktop launchers (`.desktop` files) run in a **minimal shell environment** that:
1. Does not source user shell configuration files (`.bashrc`, `.bash_profile`, etc.)
2. Has a minimal `PATH` that doesn't include conda binaries
3. Cannot rely on shell functions like `conda activate` being available
4. Doesn't inherit environment variables from the user's terminal session

## Solution Strategy

### 1. Create a Startup Script

Create a bash script that explicitly handles conda activation:

```bash
#!/bin/bash
# app_startup.sh

# Activate miniconda base
source ~/miniconda3/bin/activate

# Activate specific environment
conda activate your_env_name

# Verify activation (optional but recommended)
if [ "$CONDA_DEFAULT_ENV" != "your_env_name" ]; then
    echo "❌ Error: your_env_name environment could not be activated"
    exit 1
fi

# Set any required environment variables
export LD_LIBRARY_PATH=/usr/local/cuda-12.5/lib64:$LD_LIBRARY_PATH

# Change to project directory
cd ~/your_project_directory

# CRITICAL: Use explicit conda Python path
/home/username/miniconda3/envs/your_env_name/bin/python your_script.py
```

**Key Points:**
- Use absolute paths throughout
- Source the conda activation script explicitly
- Use the **explicit path to conda Python** instead of just `python`
- The last point is crucial: even after `conda activate`, the desktop environment may not update `PATH` correctly

### 2. Create the Desktop Entry File

Location: `~/.local/share/applications/your_app.desktop`

```ini
[Desktop Entry]
Type=Application
Name=Your App Name
Comment=Your app description
Exec=/home/username/your_project/app_startup.sh
Icon=/home/username/your_project/app_icon.png
Terminal=false
Categories=Utility;Development;
Keywords=keyword1;keyword2;
StartupNotify=true
StartupWMClass=your-app-class
```

**Key Points:**
- Use absolute paths for `Exec` and `Icon`
- `Terminal=false` for GUI apps
- Set appropriate categories for app menu placement
- `StartupWMClass` helps with window management

### 3. Set Correct File Permissions

**CRITICAL:** DO NOT make your Python script executable!

```bash
# Make startup script executable
chmod +x ~/your_project/app_startup.sh

# DO NOT make Python script executable - remove x permission if it exists
chmod -x ~/your_project/your_script.py

# Verify permissions
ls -la ~/your_project/
# app_startup.sh should be: -rwxr-xr-x
# your_script.py should be:  -rw-r--r-- (NO x!)
```

**Why this is critical:**
- If the Python script is executable, the OS will use its shebang instead of your explicit interpreter
- This is the #1 cause of "works in terminal but not from desktop icon" issues
- Even with perfect conda activation, an executable script with shebang will use wrong Python

### 4. Update Desktop Database

```bash
update-desktop-database ~/.local/share/applications/
```

## Debugging Desktop Launch Issues

### Create a Debug Launch Script

```bash
#!/bin/bash
# debug_launch.sh

LOG_FILE="/tmp/app_desktop_launch.log"

{
    echo "===Desktop Launch Trace==="
    echo "Date: $(date)"
    echo "User: $(whoami)"
    echo "PATH: $PATH"
    echo ""

    # Show conda activation
    echo "Activating conda..."
    source ~/miniconda3/bin/activate
    echo "Base conda activated, PATH now: $PATH"

    conda activate your_env
    echo "Env activated, PATH now: $PATH"
    echo "CONDA_DEFAULT_ENV: $CONDA_DEFAULT_ENV"
    echo "Python: $(which python)"
    echo "Python version: $(python --version)"

    # Show environment variables
    env | grep -E "CONDA|LD_LIBRARY|CUDA" | sort

    echo ""
    echo "Starting application..."
    cd ~/your_project
    /home/username/miniconda3/envs/your_env/bin/python your_script.py

} > "$LOG_FILE" 2>&1
```

Temporarily set `Exec=/tmp/debug_launch.sh` in the `.desktop` file, launch the app, then check `/tmp/app_desktop_launch.log`.

### Process Inspection

Check which Python is actually running:

```bash
# Find the process
ps aux | grep "your_script.py" | grep -v grep

# Check environment of running process
cat /proc/PID/environ | tr '\0' '\n' | grep -E "CONDA|PATH|LD_LIBRARY"
```

## Common Pitfalls and Solutions

### ❌ Problem #1: Executable Python script with shebang (THE MOST COMMON ISSUE!)

**Symptom:**
```bash
# Everything seems perfect in your startup script
/home/matthias/miniconda3/envs/atrain/bin/python atrain-transcribe.py

# But process inspection shows:
ps aux | grep atrain
# matthias  12345  0.3  0.1  /usr/bin/python3 /home/matthias/atrain-transcribe.py
#                             ^^^^^^^^^^^^^^^^  WRONG PYTHON!

# App says "No GPU available" even though CUDA works in terminal
```

**Root cause:**
```bash
# Check if your Python script is executable
ls -la atrain-transcribe.py
# -rwxr-xr-x ... atrain-transcribe.py  # The 'x' means executable!

# Check first line of the script
head -1 atrain-transcribe.py
# #!/usr/bin/env python3  # This shebang is taking over!
```

**What's happening:**
1. Your startup script correctly activates conda environment ✅
2. Your startup script correctly sets CUDA paths ✅
3. Your startup script correctly calls conda Python with explicit path ✅
4. **BUT** the OS sees the script is executable with a shebang
5. The kernel **ignores your explicit Python** and uses the shebang instead ❌
6. `#!/usr/bin/env python3` resolves to `/usr/bin/python3` (system Python) ❌
7. System Python doesn't have CUDA/torch/your dependencies ❌

**The fix:**
```bash
# Remove executable permission from Python script
chmod -x atrain-transcribe.py

# Verify
ls -la atrain-transcribe.py
# -rw-r--r-- ... atrain-transcribe.py  # Good! No 'x'

# Now your explicit Python interpreter WILL be used
/home/matthias/miniconda3/envs/atrain/bin/python atrain-transcribe.py
# This now actually uses the conda Python!
```

**Real debugging session from aTrain project:**

```bash
# We spent hours debugging, thinking it was:
# - conda activation issue? No, CONDA_DEFAULT_ENV was correct
# - PATH issue? No, PATH had conda bin first
# - LD_LIBRARY_PATH issue? No, it was set correctly
# - Desktop file format issue? No, worked for other apps

# The smoking gun was comparing processes:
ps aux | grep python | grep sprich
# python sprich_pyqt6.py  # Sprich worked - no shebang execution!

ps aux | grep python | grep atrain
# /usr/bin/python3 /home/.../atrain-transcribe.py  # Wrong Python!

# The difference: atrain-transcribe.py was executable, sprich_pyqt6.py was not!
ls -la */*.py
# -rwxr-xr-x atrain-transcribe.py  # Executable = shebang takes over
# -rw-r--r-- sprich_pyqt6.py       # Not executable = explicit python works

# Solution: chmod -x atrain-transcribe.py
# Result: GPU detected! Problem solved!
```

**Prevention:**
- Never use `chmod +x` on Python scripts that need conda environments
- If script has shebang, either remove it OR remove execute permission
- Always verify with `ps aux` that correct Python is running
- Compare with working apps to spot differences

### ❌ Problem #2: Using relative paths
```bash
Exec=./start_app.sh  # WRONG
```
✅ Solution: Always use absolute paths
```bash
Exec=/home/username/project/start_app.sh  # CORRECT
```

### ❌ Problem #3: Relying on conda activate to set PATH correctly
```bash
conda activate myenv
python script.py  # May still use system Python!
```
✅ Solution: Use explicit Python path
```bash
conda activate myenv
/home/username/miniconda3/envs/myenv/bin/python script.py  # Guaranteed correct Python
```

### ❌ Problem #4: Assuming environment variables are set
```bash
# Desktop launcher doesn't have LD_LIBRARY_PATH
python script.py  # May fail to find CUDA libraries
```
✅ Solution: Explicitly set required variables
```bash
export LD_LIBRARY_PATH=/usr/local/cuda-12.5/lib64:$LD_LIBRARY_PATH
/path/to/conda/python script.py
```

### ❌ Problem #5: Not handling conda initialization failures
```bash
conda activate myenv
python script.py  # Proceeds even if activation failed
```
✅ Solution: Verify activation
```bash
conda activate myenv
if [ "$CONDA_DEFAULT_ENV" != "myenv" ]; then
    echo "Error: Environment activation failed"
    exit 1
fi
/path/to/conda/python script.py
```

## Comprehensive Debugging Workflow

When desktop launcher doesn't work, follow this systematic approach:

### Step 1: Verify the Python Interpreter

```bash
# Launch app from desktop icon, then immediately check:
ps aux | grep "your_script.py" | grep -v grep

# Look at the FIRST field - which Python is running?
# ✅ GOOD: /home/username/miniconda3/envs/myenv/bin/python
# ❌ BAD:  /usr/bin/python3  or  python  or  /usr/bin/python
```

**If you see the wrong Python:** Check if script is executable with shebang (Problem #1)

### Step 2: Verify Conda Environment

```bash
# Get the process ID from step 1
PID=12345  # Replace with actual PID

# Check environment variables
cat /proc/$PID/environ | tr '\0' '\n' | grep CONDA

# You should see:
# CONDA_DEFAULT_ENV=myenv
# CONDA_PREFIX=/home/username/miniconda3/envs/myenv
```

**If CONDA variables are missing or wrong:** Check conda activation in startup script

### Step 3: Verify CUDA/Library Paths

```bash
# Check LD_LIBRARY_PATH
cat /proc/$PID/environ | tr '\0' '\n' | grep LD_LIBRARY_PATH

# You should see your CUDA path:
# LD_LIBRARY_PATH=/usr/local/cuda-12.5/lib64:...
```

**If LD_LIBRARY_PATH is missing:** Check export statement in startup script

### Step 4: Compare with Working App

```bash
# Find a similar app that works (e.g., Sprich)
ps aux | grep "working_app.py" | grep -v grep
cat /proc/WORKING_PID/environ | tr '\0' '\n' | grep -E "CONDA|LD_LIBRARY|PATH"

# Compare side-by-side with your broken app
cat /proc/BROKEN_PID/environ | tr '\0' '\n' | grep -E "CONDA|LD_LIBRARY|PATH"

# Look for differences!
```

### Step 5: Check File Permissions

```bash
# Check both scripts
ls -la ~/project/start_app.sh
ls -la ~/project/app.py

# Expected:
# -rwxr-xr-x start_app.sh   # Executable bash script ✅
# -rw-r--r-- app.py          # NOT executable Python script ✅

# Problem:
# -rwxr-xr-x app.py          # Executable = shebang will override! ❌
```

### Step 6: Test Startup Script Directly

```bash
# Run startup script manually
bash ~/project/start_app.sh

# Does it work?
# - YES: Desktop file configuration issue
# - NO: Startup script issue
```

### Step 7: Enable Debug Logging

```bash
# Add to top of startup script (after #!/bin/bash):
exec > /tmp/app_startup_debug.log 2>&1
set -x  # Enable bash debugging

# Launch from desktop, then check:
cat /tmp/app_startup_debug.log
```

## Testing Checklist

1. ✅ Script runs from terminal with `bash start_script.sh`
2. ✅ Desktop icon appears in application menu
3. ✅ App launches when clicking desktop icon
4. ✅ Process uses correct conda Python: `ps aux | grep python | grep app_name`
5. ✅ Required libraries/GPU are available in launched app
6. ✅ Environment variables are correctly set: `cat /proc/PID/environ | tr '\0' '\n'`

## System-Specific Notes

### Ubuntu/GNOME
- Desktop files location: `~/.local/share/applications/`
- Update command: `update-desktop-database ~/.local/share/applications/`
- Icon cache: `gtk-update-icon-cache ~/.local/share/icons/hicolor/`

### File Permissions
- Desktop file: `chmod 644 ~/.local/share/applications/app.desktop`
- Startup script: `chmod +x ~/project/start_script.sh`
- Python script: `chmod +x ~/project/script.py` (if using shebang)

## Complete Working Example

**Project structure:**
```
~/my_gpu_app/
├── app.py
├── start_app.sh
├── app_icon.png
└── docs/
```

**start_app.sh:**
```bash
#!/bin/bash
source ~/miniconda3/bin/activate
conda activate ml_env
export LD_LIBRARY_PATH=/usr/local/cuda-12.5/lib64:$LD_LIBRARY_PATH
cd ~/my_gpu_app
/home/username/miniconda3/envs/ml_env/bin/python app.py
```

**~/.local/share/applications/my-gpu-app.desktop:**
```ini
[Desktop Entry]
Type=Application
Name=My GPU App
Comment=Machine Learning Application
Exec=/home/username/my_gpu_app/start_app.sh
Icon=/home/username/my_gpu_app/app_icon.png
Terminal=false
Categories=Development;Science;
StartupNotify=true
```

**Installation:**
```bash
chmod +x ~/my_gpu_app/start_app.sh
chmod +x ~/my_gpu_app/app.py
update-desktop-database ~/.local/share/applications/
```

## References

- [Desktop Entry Specification](https://specifications.freedesktop.org/desktop-entry-spec/latest/)
- [Conda Environment Management](https://docs.conda.io/projects/conda/en/latest/user-guide/tasks/manage-environments.html)
