# TipTap AI - Recent Items Feature

**Status:** ✅ Implementiert - Tests ausstehend
**Erstellt:** 2025-10-19 09:38
**Updated:** 2025-10-19 09:47

## Ziel

History-Dropdown hinzufügen für schnellen Zugriff auf zuletzt geöffnete Dateien und Ordner.

## Anforderungen

- Icon-Button (History) in Sidebar-Header neben "Ordner wechseln"
- Dropdown mit max 15 Items (Files + Folders gemischt)
- Material Icons für Files (`description`) und Folders (`folder`)
- Tooltip mit vollem Pfad beim Hover über Items
- Persistente Speicherung in `~/.tiptapai-history.json`
- H2 "Dateien" aus Sidebar-Header entfernen

## Implementierungsplan

- [✅] **1. Backups erstellen** - 09:38
  - main.js → main_backup_before-recent-items.js
  - renderer/index.html → renderer/index_backup_before-recent-items.html
  - renderer/app.js → renderer/app_backup_before-recent-items.js
  - renderer/styles.css → renderer/styles_backup_before-recent-items.css

- [✅] **2. Backend (main.js)** - 09:40
  - History-Datei laden/speichern (~/.tiptapai-history.json)
  - IPC Handler: `get-recent-items`
  - IPC Handler: `add-recent-file`
  - IPC Handler: `add-recent-folder`
  - Max 15 Items, sortiert nach Timestamp

- [✅] **3. Preload (preload.js)** - 09:42
  - IPC Channels exponiert

- [✅] **4. UI (index.html)** - 09:43
  - History-Button in sidebar-header
  - H2 "Dateien" entfernt
  - Dropdown-Container hinzugefügt

- [✅] **5. Styling (styles.css)** - 09:44
  - Sidebar-Header Layout angepasst (.btn-icon)
  - Dropdown-Styling (.recent-dropdown)
  - Hover-Effekte

- [✅] **6. Funktionalität (app.js)** - 09:47
  - History-Button Click Handler
  - Dropdown toggle
  - Click outside → close
  - Recent Items laden und anzeigen
  - Item Click → Datei öffnen / Ordner wechseln
  - Auto-Update beim Öffnen/Wechseln (in loadFile und changeFolder integriert)

- [ ] **7. Testen**
  - History-Button funktioniert
  - Dropdown öffnet/schließt
  - Items werden gespeichert
  - Click auf File öffnet Datei
  - Click auf Folder wechselt Ordner

## Änderungen am Plan

[Keine bisher]

## Nächste Schritte

Backups erstellen und mit Backend beginnen.
