# TipTap AI - Future Features & Roadmap

**Status:** 📝 Notizen
**Erstellt:** 2025-10-18 18:20
**Updated:** 2025-11-09 22:30

---

## Ziel

Sammlung von geplanten Features für zukünftige Sprints.

---

## Geplante Features

### Phase 2: Publishing & Export

#### Pandoc Integration für professionelle Buchproduktion

**Ziel:** Druckfertige Buchblöcke aus Markdown erstellen

**Workflow:**
1. Markdown in TipTap AI bearbeiten
2. Export via Pandoc
3. Über LaTeX zu professionellem PDF

**Technische Details:**
- Pandoc als externes Tool (nicht als npm-Dependency)
- Export-Button in UI: "Export to PDF (via Pandoc)"
- LaTeX-Templates für Buchformatierung
- Konfigurierbare Vorlagen (Roman, Sachbuch, etc.)

**Vorteile:**
- Professionelle Typografie via LaTeX
- Druckfertige PDFs
- Volle Kontrolle über Layout
- Standard-Workflow in Publishing-Industrie

**Beispiel-Command:**
```bash
pandoc input.md -o output.pdf \
  --pdf-engine=xelatex \
  --template=book-template.tex \
  --variable mainfont="EB Garamond"
```

**Dependencies (später):**
- Pandoc (System-Installation, nicht npm)
- LaTeX Distribution (z.B. TeX Live)
- Custom LaTeX-Templates (im Projekt ablegen)

**Sprint:** Noch nicht geplant (nach MVP)

---

### Phase 2: Styling & Themes

#### Buch-Layout Theme

**Features:**
- EB Garamond Schriftart
- Blocksatz (text-align: justify)
- Buchbreite (~650px)
- Professionelle Typografie
- Kapitel-Nummerierung
- Seitenzahlen (für Print-Preview)

**Implementation:**
- CSS-Theme-System
- Auswählbare Themes im UI
- Separate CSS-Files pro Theme

**Sprint:** Nach Phase 1 (nach MVP)

---

---

### Phase 2: Spracheinstellungen & Rechtschreibung

#### Multi-Language Support

**Priorität:** Hoch (nach LanguageTool-Integration)

**Sprachen:**
- Deutsch (Schweizer Rechtschreibung) - Primär
- Englisch (US/UK)
- Weitere Sprachen später erweiterbar

**Implementation:**
- Sprach-Auswahl im UI (Dropdown oder Settings)
- Browser-Spellcheck mit korrekter `lang`-Attribute
- LanguageTool mit Sprach-Parameter
- Sprache pro Dokument im Frontmatter speichern

**Frontmatter Beispiel:**
```yaml
---
language: de-CH
lastEdit: 2025-10-18T18:45:00.000Z
---
```

**Sprint:** Nach Sprint 2.1 (LanguageTool)

---

#### Absätze von Auto-Check ausschließen

**Priorität:** Mittel (Quality-of-Life für spezielle Textabschnitte)

**Problem:**
- Absätze in Mundart/Dialekt zeigen immer Fehler
- Fremdsprachige Zitate werden als Fehler markiert
- Code-Snippets oder spezielle Formatierungen triggern False Positives
- Diese Absätze werden bei jedem Auto-Check wieder als "neue Fehler" gemeldet

**Lösung:**
- Bestimmte Absätze von **automatischer** Rechtschreibprüfung ausnehmen
- **Manuelle Prüfung** (über "Absatz prüfen" im Kontextmenü) bleibt möglich
- Liste ausgeschlossener Absätze im Frontmatter speichern

**Frontmatter Beispiel:**
```yaml
---
language: de-CH
TT_checkedRanges:
  - paragraphId: abc123
    checkedAt: 2025-10-18T18:45:00.000Z
TT_excludedFromAutoCheck:
  - abc456  # Mundart-Absatz
  - def789  # Englisches Zitat
---
```

**Implementation:**
- Analog zu `TT_checkedRanges` → `TT_excludedFromAutoCheck`
- Paragraph-Hash-basiertes Tracking (wie bei checked ranges)
- UI: Kontextmenü-Option "Von Auto-Check ausschließen" / "Auto-Check aktivieren"
- Visueller Indikator (z.B. graues Icon) für ausgeschlossene Absätze
- Bei Auto-Check: Diese Absätze überspringen
- Bei manueller Prüfung: Normal prüfen (User weiß was er tut)

**Use Cases:**
- Mundart-Absätze in ansonsten hochdeutschen Texten
- Fremdsprachige Zitate (z.B. englische Dialoge)
- Technische Code-Beispiele inline im Text
- Absichtlich "falsche" Schreibweisen (historische Texte, etc.)

**Sprint:** Phase 2 oder 3 (nach Auto-Check-Feature etabliert)

---

### Phase 2: Erweiterte Raw-Markdown-Ansicht

#### Editierbarer Raw-Markdown-Modus mit Scroll-Sync

**Features:**
- Raw Markdown editierbar machen
- Scroll-Sync zwischen Rendered und Raw View
- Cursor-Position synchronisieren
- Live-Preview beim Raw-Editing

**Use Cases:**
- Komplexe Markdown-Strukturen direkt bearbeiten
- YAML-Frontmatter direkt editieren
- Debugging von Rendering-Problemen

**Implementation:**
- Split-View: Rendered (links) + Raw (rechts)
- Oder: Toggle-Modus (umschalten zwischen Rendered/Raw)
- Scroll-Position synchronisieren
- Cursor-Position beim Umschalten behalten

**Möglicher Verzicht:**
- Falls GUI-Editing ausreichend ist
- Entscheidung nach mehr Praxis-Erfahrung

**Sprint:** Später (nicht prioritär)

---

### Phase 2: UI Improvements

#### Shortcuts Info-Button

**Feature:**
- Info-Button (Material Icon: `help` oder `keyboard`)
- Modal mit wichtigsten Tastenkombinationen
- Shortcuts für Formatting (Fett, Kursiv, etc.)

**Shortcuts:**
- `Ctrl+B` / `Cmd+B` - Fett
- `Ctrl+I` / `Cmd+I` - Kursiv
- `Ctrl+S` / `Cmd+S` - Speichern
- Weitere TipTap-Shortcuts

**Implementation:**
- Button im Header neben Metadata/Raw
- Modal mit Shortcuts-Tabelle
- Evtl. auch in-app Hints/Tooltips

**Sprint:** Phase 2 (nach MVP)

---

## Backlog

Features, die noch nicht priorisiert sind:

- [ ] Pandoc Integration (Phase 2)
- [ ] Buch-Layout Theme (Phase 2)
- [ ] LaTeX-Template-Bibliothek
- [ ] Print-Preview-Modus
- [ ] Cover-Generator
- [ ] Kapitel-Navigation (Table of Contents)
- [ ] Sprach-Einstellungen (Deutsch-CH, Englisch) - Nach LanguageTool
- [ ] Raw-Markdown editierbar + Scroll-Sync - Später
- [ ] Shortcuts Info-Button - Phase 2

---

**Siehe:** `docs/DEVELOPMENT_PLAN.md` für aktuelle Sprints
