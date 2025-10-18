# TipTap AI - Initial Planning & Architecture

**Status:** ✅ Abgeschlossen (Planning Phase)
**Erstellt:** 2025-10-18 16:00
**Updated:** 2025-10-18 16:00

---

## Ziel

Aufsetzen eines minimalistischen Markdown-Editors mit WYSIWYG-Funktionalität (TipTap), der:
- Lokale Markdown-Dateien mit WYSIWYG bearbeitet
- Metadaten in Frontmatter speichert (keine separate DB)
- Rechtschreibprüfung via LanguageTool (self-hosted)
- Später: KI-gestützte Schreibhilfen

**Zentrale Anforderung:** WYSIWYG-Editor mit TipTap (das war der Grund für die Architektur-Wahl)

---

## Implementierungsplan

### Phase 0: Architektur & Setup

- [✅] Projekt-Requirements klären (WYSIWYG ist Kern-Requirement)
- [✅] Technologie-Stack evaluieren
  - Electron für Desktop (TipTap braucht Web-Technologie)
  - Vanilla JS statt React (minimal overhead)
  - Frontmatter statt SQLite (einfacher, Git-freundlich)
  - nvm für Node.js-Isolation
- [✅] Architektur-Entscheidung: Minimal Electron + TipTap
- [✅] Dependencies auf 5 reduzieren (statt 50+)
- [✅] Projekt-Struktur definieren
- [✅] Dokumentation erstellen:
  - [✅] ARCHITECTURE.md - Technische Architektur
  - [✅] DEVELOPMENT_PLAN.md - Sprint-basierter Plan
  - [✅] SETUP.md - Ubuntu 24.04 Setup
  - [✅] MULTI_PROJECT.md - Mehrere Node.js-Projekte
  - [✅] GUIDELINES.md - Development Best Practices
  - [✅] INSIGHTS.md - Erkenntnisse & Entscheidungen
- [✅] README.md aktualisieren
- [✅] CHANGELOG.md anlegen
- [✅] Development Document anlegen (diese Datei)
- [✅] CLAUDE.md anlegen

---

## Wichtige Architektur-Entscheidungen

### 1. Warum Electron?
**Problem:** TipTap ist Web-basiert (JavaScript), braucht aber Desktop-App
**Optionen:**
- Python + ttkbootstrap → ❌ Kein WYSIWYG möglich
- PyQt6 → ❌ Kein gutes WYSIWYG-Widget
- Electron → ✅ TipTap läuft nativ

**Entscheidung:** Electron (minimal, ohne React/Vue)

### 2. Warum Vanilla JS statt React?
**Grund:** TipTap braucht kein React-Wrapper, kann direkt genutzt werden
**Vorteil:** Weniger Dependencies, einfacher zu lernen und warten

### 3. Warum Frontmatter statt SQLite?
**Vorteile:**
- Metadaten reisen mit der Datei
- Git-freundlich (Änderungen sichtbar)
- Kein separates DB-File nötig
- Standard (Jekyll, Hugo, Obsidian nutzen das)

**Format:**
```markdown
---
lastPosition: 1245
lastEdit: 2025-10-18T14:30:00Z
bookmarks:
  - pos: 500
    label: "Kapitel 3 Review"
---

# Content hier
```

### 4. Warum nvm statt conda?
**Grund:** Node.js-Projekte sind von Natur aus isoliert (project-lokale `node_modules/`)
**Vorteil:** Nativer für Node.js, einfacheres Handling als conda

---

## Technologie-Stack (Final)

### Core Dependencies (nur 5!)
```json
{
  "electron": "^28.0.0",
  "@tiptap/core": "^2.1.0",
  "@tiptap/starter-kit": "^2.1.0",
  "@tiptap/extension-markdown": "^2.1.0",
  "js-yaml": "^4.1.0"
}
```

### System
- **OS:** Ubuntu 24.04 (X11)
- **Node.js:** v20 (via nvm)
- **Docker:** Für LanguageTool

---

## Projekt-Struktur (Minimal)

```
tiptapai/
├── package.json              # Dependencies (nur 5!)
├── .nvmrc                    # Node.js Version (20)
├── main.js                   # Electron Main Process
├── preload.js                # IPC Bridge
│
├── renderer/
│   ├── index.html            # Single HTML File
│   ├── app.js                # TipTap Setup
│   ├── file-tree.js          # File Tree (HTML/CSS/JS)
│   ├── frontmatter.js        # YAML Parser
│   ├── languagetool.js       # LT Client (Phase 1)
│   └── styles.css            # Minimales Styling
│
├── docker/
│   └── docker-compose.yml    # LanguageTool
│
└── docs/
    ├── ARCHITECTURE.md
    ├── DEVELOPMENT_PLAN.md
    ├── SETUP.md
    ├── MULTI_PROJECT.md
    ├── GUIDELINES.md
    ├── INSIGHTS.md
    ├── archive/              # Abgeschlossene Dev Docs
    └── lessons-learned/      # Schwierige Probleme
```

---

## Änderungen am Plan

### Ursprünglicher Plan (verworfen)
- React + TypeScript
- Zustand für State Management
- SQLite für Metadaten
- react-complex-tree für File Tree
- 50+ npm Dependencies

### Warum geändert?
1. **Zu komplex** für MVP
2. **WYSIWYG ist das Kern-Feature**, nicht State Management
3. **Frontmatter ist einfacher** als separate DB
4. **Vanilla JS reicht** für die Anforderungen

### Neuer Plan (minimal)
- Vanilla JavaScript
- Simple Variablen für State
- Frontmatter in Markdown
- Simple HTML/CSS File Tree
- Nur 5 npm Dependencies

**Resultat:** Viel einfacher zu entwickeln und zu warten!

---

## Nächste Schritte

### Sofort (Phase 0 - Setup)
1. [ ] Environment Setup nach SETUP.md:
   - [ ] nvm installieren
   - [ ] Node.js 20 installieren
   - [ ] System-Dependencies (Electron)
   - [ ] Projekt initialisieren (`npm init`)
   - [ ] Dependencies installieren
   - [ ] Git initialisieren

### Phase 1 (Sprint 0.2 - Minimal Electron App)
2. [ ] Basis-Dateien erstellen:
   - [ ] main.js (Electron Window)
   - [ ] preload.js (IPC Bridge)
   - [ ] renderer/index.html (Basic HTML)
   - [ ] renderer/app.js (Console.log)
   - [ ] package.json Scripts
3. [ ] `npm start` → Electron-Fenster öffnet sich

### Phase 2 (Sprint 0.3 - TipTap Integration)
4. [ ] TipTap importieren
5. [ ] Editor-Instanz erstellen
6. [ ] StarterKit + Markdown Extension
7. [ ] Kann tippen und formatieren

**Details:** Siehe `docs/DEVELOPMENT_PLAN.md`

---

## Erkenntnisse während Planning

### 1. Electron vs Python-Desktop
**Erkenntnis:** Für WYSIWYG ist Electron die einzige praktikable Option
- Python-GUI-Frameworks haben kein gutes WYSIWYG-Widget
- TipTap ist Web-basiert → braucht Browser-Engine
- Electron ist "Desktop App mit embedded Chromium" → perfekt!

### 2. Isolation bei Node.js
**Erkenntnis:** Node.js-Projekte sind automatisch isoliert
- Jedes Projekt hat eigenes `node_modules/`
- Keine "conda activate" nötig, einfach `cd projekt`
- nvm für Node-Version-Management (wie conda, aber für Node.js)

### 3. Frontmatter ist Standard
**Erkenntnis:** Viele Tools nutzen Frontmatter:
- Jekyll (Static Site Generator)
- Hugo (Static Site Generator)
- Obsidian (Note-Taking-App)
- → Bewährtes Pattern, kein neues Rad erfinden

### 4. Weniger ist mehr
**Erkenntnis:** 5 Dependencies sind besser als 50
- Weniger Maintenance-Overhead
- Einfacher zu verstehen
- Schnellere Installation
- Weniger potenzielle Sicherheitslücken

---

## Schwierigkeiten & Lösungen

### Problem 1: Conda vs nvm - Was nutzen?
**Schwierigkeit:** User bevorzugt normalerweise conda für Isolation
**Lösung:** nvm ist nativer für Node.js, conda ist für Python
**Entscheidung:** nvm nutzen, Dokumentation für User der conda-Isolation gewohnt ist

### Problem 2: SQLite vs Frontmatter
**Schwierigkeit:** Ursprünglich SQLite geplant für Metadaten
**Lösung:** Frontmatter ist einfacher und Git-freundlicher
**Entscheidung:** Frontmatter, SQLite nur wenn wirklich nötig (später)

---

## Dokumentierte Entscheidungen (für docs/INSIGHTS.md)

1. **Electron minimal** - Kein React/Vue/TypeScript im MVP
2. **Frontmatter** - Metadaten im Markdown statt separate DB
3. **nvm** - Node.js-Isolation statt conda
4. **5 Dependencies** - Nur das Nötigste
5. **WYSIWYG first** - TipTap ist der Grund für Architektur-Wahl

---

## Status

**Phase 0 - Planning:** ✅ Abgeschlossen

### Abgeschlossen
- ✅ Architektur definiert (minimal Electron + TipTap)
- ✅ Technologie-Stack entschieden (5 Dependencies)
- ✅ Dokumentation erstellt (7 Dokumente)
- ✅ Projekt-Struktur definiert
- ✅ Development Guidelines integriert
- ✅ CHANGELOG angelegt
- ✅ CLAUDE.md angelegt

### Nächster Schritt
- ⏳ **Environment Setup** nach docs/SETUP.md durchführen
- ⏳ Neues Dev Document anlegen: `TIPTAPAI_environment-setup_YYYY-MM-DD-HHMM.md`

---

## Archive-Hinweis

**Nach Abschluss der nächsten Phase:**
- Dieses Document nach `docs/archive/` verschieben
- Neues Document für nächste Phase anlegen
- CHANGELOG aktualisieren

---

**Nächstes Dev Document:** `TIPTAPAI_environment-setup_2025-10-18-HHMM.md` (wenn Setup beginnt)

**Siehe:** `docs/DEVELOPMENT_PLAN.md` für detaillierte Sprint-Planung
