# Dictate App - Project-Specific Maintenance

**For humans:** Additional maintenance checks specific to this voice transcription app. Run alongside generic maintenance checklist.

**For AI:** Execute these Dictate-specific validation tasks during maintenance.


## VALIDATION TASKS

### 1. Audio & Transcription

**Test models:**
```bash
python dictate.py
# Test: large-v3-turbo, small, base
# Languages: DE-CH (Swiss German), DE-DE, EN
# Record 10s sample, verify quality
```

**Check:**
- [ ] Model downloads work
- [ ] Swiss German transcription quality acceptable
- [ ] PyAudio detects microphone
- [ ] No audio buffer underruns

### 2. Desktop Integration

**Test tray icon:**
```bash
./start_dictate.sh
# Verify: Icon appears in system tray
# Test: All menu items work
# Test: Hotkey (right Ctrl) triggers recording
```

**Check:**
- [ ] Tray icon visible (Gnome/KDE/Unity)
- [ ] Menu items functional
- [ ] Hotkey detection works
- [ ] Auto-paste works (xdotool)

### 3. GUI State Management

**Test withdrawn-window bug fix:**
```bash
# Test A: GUI open
python dictate.py
# Click Record, speak, verify <2s delay

# Test B: GUI minimized (hotkey mode)
# Minimize to tray
# Press right Ctrl, speak, release
# Verify <2s delay (not 5-10s!)
```

**Check:**
- [ ] Both modes equally fast
- [ ] No multi-second blocking
- [ ] Fix active: `grep -c "if app.state() != 'withdrawn'" dictate.py` ≥ 2

### 4. Dependencies

**Critical packages:**
```bash
conda activate fasterwhisper
python -c "import av; print('PyAV:', av.__version__)"  # Must be 16.0.1
python -c "import faster_whisper; print('faster-whisper:', faster_whisper.__version__)"  # 1.2.0
python -c "import torch; print('PyTorch:', torch.__version__)"  # 2.5.1
```

**Check:**
- [ ] PyAV==16.0.1 (CRITICAL for audio)
- [ ] faster-whisper==1.2.0
- [ ] PyTorch==2.5.1
- [ ] TTKBOOTSTRAP_FONT_MANAGER=tk (env var)

### 5. File System

**Verify directories:**
```bash
ls -ld ~/Music/dictate/{transcripts,logs}
```

**Check:**
- [ ] ~/Music/dictate/transcripts/ exists
- [ ] ~/Music/dictate/logs/ exists
- [ ] Permissions allow write

### 6. Configuration

**Test config loading:**
```bash
# Verify config.yml or uses defaults
# Test: Language selection persists
# Test: Model selection persists
```


## PROJECT-SPECIFIC FILES

### dictate.py

**Critical sections:**
- `initialize_model()` - Line ~257: withdrawn-window fix
- `toggle_recording()` - Line ~384: withdrawn-window fix
- Hotkey detection: pynput listener

**Validation:**
```bash
grep -n "if app.state() != 'withdrawn'" dictate.py
# Should show 2+ locations
```

### tray_icon.py / tray_icon_appindicator.py

**Test both backends:**
- AppIndicator3 (Gnome/Unity)
- Fallback (KDE/other)

### install.sh

**Verify matches:**
- Bill of Materials section up-to-date
- PyAV check present
- Environment variable activation present
- Withdrawn-window fix validation present


## RELEASE CHECKLIST

**Before release:**
- [ ] All models tested (large-v3-turbo, small, base)
- [ ] Swiss German quality verified
- [ ] Tray icon works on Gnome
- [ ] Hotkey mode fast (withdrawn-window fix verified)
- [ ] PyAV 16.0.1 in environment.yml
- [ ] install.sh validates all critical components
- [ ] smoke_test.py covers audio + transcription
- [ ] README.md shows correct model sizes
- [ ] CHANGELOG.md documents model/quality changes


## SMOKE TEST

**Quick validation:**
```python
# smoke_test.py additions for Dictate
def test_audio_backend():
    import pyaudio
    p = pyaudio.PyAudio()
    assert p.get_device_count() > 0
    p.terminate()

def test_whisper_model():
    from faster_whisper import WhisperModel
    model = WhisperModel("tiny", device="cpu")
    assert model is not None

def test_pyav():
    import av
    assert av.__version__ == "16.0.1"

def test_withdrawn_fix():
    with open("dictate.py") as f:
        count = f.read().count("if app.state() != 'withdrawn'")
    assert count >= 2
```


## KNOWN ISSUES

| Issue | System | Fix |
|-------|--------|-----|
| Slow hotkey mode | Unity desktop | Apply withdrawn-window fix |
| No tray icon | Wayland | Use XWayland or fallback |
| Audio glitches | Some USB mics | Adjust buffer size in config |
| Missing PyAV | Fresh install | install.sh checks and installs |


## EXECUTION

1. Run generic maintenance checklist first
2. Execute validation tasks above
3. Run project-specific smoke tests
4. Fix any failures
5. Update project-specific docs if needed

**Frequency:** Before each release, after major code changes.


