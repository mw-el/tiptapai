# Desktop Integration for Python/Conda Apps

**For humans:** Technical reference for desktop launcher integration. Ask AI for details.

**For AI:** Rules and patterns for desktop file creation and conda environment integration.


## CRITICAL RULES

### Icon Display

**Use tk.Tk with className:**
```python
# CORRECT
app = tk.Tk(className='app-name')
style = tb.Style(theme='sandstone')

# WRONG
app = tb.Window(themename='sandstone')  # No className parameter!
```

**Install XFT Tk:**
```bash
conda install -c conda-forge "tk=8.6.13=xft*"
```

**Match WM_CLASS in desktop file:**
```desktop
[Desktop Entry]
StartupWMClass=app-name
```

```python
app = tk.Tk(className='app-name')  # Must match exactly
```

### Conda Environment

**Explicit Python path in desktop file:**
```desktop
# CORRECT
Exec=/home/user/miniconda3/envs/myenv/bin/python /path/to/app.py

# WRONG
Exec=python /path/to/app.py  # Uses system Python!
```

**Remove executable bit from Python script:**
```bash
chmod -x app.py  # Prevent shebang override
```

**Starter script alternative:**
```bash
#!/bin/bash
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate myenv
python /path/to/app.py
```


## DESKTOP FILE TEMPLATE

```desktop
[Desktop Entry]
Version=1.0
Type=Application
Name=App Name
Comment=Brief description
Icon=/path/to/icon.png
Exec=/home/user/miniconda3/envs/myenv/bin/python /path/to/app.py
Path=/path/to/app/directory
Terminal=false
Categories=Utility;Audio;
StartupNotify=true
StartupWMClass=app-name
```

**Install location:**
```bash
~/.local/share/applications/app-name.desktop
```

**Update database:**
```bash
update-desktop-database ~/.local/share/applications/
```


## DYNAMIC GENERATION

**Template file:**
```desktop
Exec=${CONDA_PREFIX}/bin/python ${APP_DIR}/app.py
Icon=${APP_DIR}/icon.png
StartupWMClass=${APP_NAME}
```

**Generate at install time:**
```bash
export CONDA_PREFIX="/home/user/miniconda3/envs/myenv"
export APP_DIR="/path/to/app"
export APP_NAME="app-name"

envsubst < app.desktop.template > ~/.local/share/applications/app.desktop
update-desktop-database ~/.local/share/applications/
```


## VALIDATION

**Check WM_CLASS:**
```bash
xprop WM_CLASS  # Click on app window
# Should show: "app-name", "app-name"
```

**Check desktop file:**
```bash
desktop-file-validate ~/.local/share/applications/app.desktop
```

**Check icon path:**
```bash
ls -l /path/to/icon.png
```

**Test launch:**
```bash
gtk-launch app-name.desktop
```


## TROUBLESHOOTING

| Issue | Cause | Fix |
|-------|-------|-----|
| No icon in dock | WM_CLASS mismatch | Match className with StartupWMClass |
| Wrong Python | Not using conda Python | Use full path to conda env Python |
| Icon not found | Wrong path | Use absolute path, verify exists |
| App doesn't start | Terminal=true | Set Terminal=false |
| Permission denied | Script executable with wrong shebang | chmod -x script.py |
| Font rendering bad | No XFT Tk | Install tk=8.6.13=xft* |


## TTKBOOTSTRAP INTEGRATION

**Problem:** `tb.Window()` doesn't support className

**Solution:** Use `tk.Tk()` + `tb.Style()`

```python
# Initialize
app = tk.Tk(className='app-name')  # Sets WM_CLASS
style = tb.Style(theme='sandstone')  # Apply theme

# NOT this:
# app = tb.Window(themename='sandstone')  # Can't set className!
```


## SYSTEM TRAY INTEGRATION

**AppIndicator3 (Gnome/Unity):**
```python
import gi
gi.require_version('AppIndicator3', '0.1')
from gi.repository import AppIndicator3

indicator = AppIndicator3.Indicator.new(
    "app-id",
    "icon-name",
    AppIndicator3.IndicatorCategory.APPLICATION_STATUS
)
indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
indicator.set_menu(menu)
```

**Requires:**
```bash
sudo apt-get install gir1.2-ayatanaappindicator3-0.1 python3-gi
```


## CONDA-SPECIFIC ISSUES

### Environment Not Activated

**Problem:** Desktop launcher doesn't activate conda env

**Fix 1:** Use full Python path
```desktop
Exec=/home/user/miniconda3/envs/myenv/bin/python app.py
```

**Fix 2:** Use starter script
```bash
#!/bin/bash
eval "$(conda shell.bash hook)"
conda activate myenv
python app.py
```

### Multiple Python Versions

**Problem:** System has multiple Pythons

**Fix:** Always use absolute path
```desktop
Exec=/home/user/miniconda3/envs/myenv/bin/python
```

### LD_LIBRARY_PATH Issues

**Problem:** Shared libraries not found

**Fix:** Conda environment handles this automatically if using correct Python


## VERIFICATION SCRIPT

```bash
#!/bin/bash
# verify-desktop-integration.sh

echo "Checking desktop integration..."

# 1. Desktop file exists
DESKTOP_FILE="$HOME/.local/share/applications/app.desktop"
if [ -f "$DESKTOP_FILE" ]; then
    echo "✓ Desktop file exists"
else
    echo "✗ Desktop file missing: $DESKTOP_FILE"
    exit 1
fi

# 2. Desktop file valid
if desktop-file-validate "$DESKTOP_FILE" 2>/dev/null; then
    echo "✓ Desktop file valid"
else
    echo "✗ Desktop file invalid"
    exit 1
fi

# 3. Icon exists
ICON_PATH=$(grep "^Icon=" "$DESKTOP_FILE" | cut -d'=' -f2)
if [ -f "$ICON_PATH" ]; then
    echo "✓ Icon found: $ICON_PATH"
else
    echo "✗ Icon missing: $ICON_PATH"
fi

# 4. Python exists
EXEC_LINE=$(grep "^Exec=" "$DESKTOP_FILE" | cut -d'=' -f2-)
PYTHON_PATH=$(echo "$EXEC_LINE" | awk '{print $1}')
if [ -f "$PYTHON_PATH" ]; then
    echo "✓ Python found: $PYTHON_PATH"
else
    echo "✗ Python missing: $PYTHON_PATH"
fi

# 5. WM_CLASS matches
WM_CLASS=$(grep "^StartupWMClass=" "$DESKTOP_FILE" | cut -d'=' -f2)
echo "  WM_CLASS set to: $WM_CLASS"
echo "  (Verify matches tk.Tk(className='$WM_CLASS') in code)"

echo ""
echo "✓ Desktop integration validated"
```


