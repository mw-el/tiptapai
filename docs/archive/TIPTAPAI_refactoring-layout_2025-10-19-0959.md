# TipTap AI - Layout Refactoring (Viewport-basiert)

**Status:** 🔄 In Arbeit
**Erstellt:** 2025-10-19 09:59
**Updated:** 2025-10-19 09:59

## Ziel

Layout auf Viewport-Prozente umstellen für bessere Lesbarkeit und konsistente Darstellung.

## Anforderungen

### Layout-Struktur:
- App-Fenster: 66vw × 100vh (zentriert mit 17vw Margin links/rechts)
- Sidebar (links): 22vw
- Editor (Mitte): 36vw
- Control Panel (rechts): 8vw
- Alle Höhen: 100vh
- KEINE Pixel-Werte mehr

### Control Panel:
- Buttons vertikal rechts anordnen
- Sprache-Dropdown, LanguageTool, Metadata, Raw, Save
- Aus Header entfernen

### Letzter Zustand:
- Zuletzt geöffnete Datei beim Start laden
- Zuletzt geöffneten Ordner merken
- In ~/.tiptapai-history.json speichern

## Implementierungsplan

- [ ] **1. Backups erstellen**
  - main.js
  - renderer/index.html
  - renderer/app.js
  - renderer/styles.css

- [ ] **2. main.js - Fenster-Größe**
  - Window auf 66vw × 100vh setzen
  - Zentriert positionieren

- [ ] **3. index.html - Control Panel**
  - Neue rechte Sidebar für Controls
  - Buttons aus editor-header verschieben
  - Struktur: sidebar | editor-area | control-panel

- [ ] **4. styles.css - Viewport-Layout**
  - App-Layout auf vw/vh umstellen
  - Sidebar: 22vw
  - Editor: 36vw
  - Control Panel: 8vw
  - Alle Pixel-Werte durch vw/vh ersetzen

- [ ] **5. app.js - Letzter Zustand**
  - lastOpenedFile in History speichern
  - lastOpenedFolder in History speichern
  - Beim Start automatisch laden

- [ ] **6. Testen**
  - Layout korrekt (22vw + 36vw + 8vw = 66vw)
  - App zentriert
  - Control Panel funktioniert
  - Letzter Zustand wird geladen

## Änderungen am Plan

[Keine bisher]

## Nächste Schritte

Backups erstellen und mit main.js beginnen.
