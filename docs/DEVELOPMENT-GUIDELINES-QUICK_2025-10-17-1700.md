# Development Guidelines – Quick Reference

**Version:** 1.1 | **Updated:** 2025-10-17 17:00

---

## Kernprinzipien

### KISS (Keep It Simple, Stupid)
- Einfachste Lösung wählen
- Keine "cleveren" Abstraktionen ohne Bedarf
- Keine Optimierungen auf Vorrat
- **Keine ungefragten Features**

### Separation of Concerns
- Ein Modul = eine Verantwortung
- Keine Business-Logik in Views/Routes
- Keine DB-Queries außerhalb von Models/Repositories
- Services für komplexe Logik

### Fail-Fast – KRITISCH!
- **KEINE ungefragten Fallbacks**
- **KEINE stillen Fehler** (keine leeren try-except-Blöcke)
- **KEINE Default-Werte ohne explizite Anforderung**
- Fehler müssen sofort sichtbar sein, nicht verschleiern

```python
# ❌ VERBOTEN
try:
    result = api_call()
except:
    result = default  # Versteckt Fehler!

# ✅ RICHTIG
result = api_call()  # Exception schlägt durch
```

---

## Arbeitsweise mit Claude Code

### NICHT überschreiten
- Nur exakt das tun, was gefordert wurde
- Keine "Verbesserungen" ohne Rücksprache
- Kein Refactoring von funktionierendem Code ohne Auftrag
- Keine Format-Änderungen ohne Anfrage

### Workflow bei größeren Änderungen
1. **Analyse** → Betroffene Dateien identifizieren
2. **Plan erstellen** → Schritt-für-Schritt-Plan vorlegen
3. **Freigabe abwarten**
4. **Implementieren** → Plan systematisch abarbeiten
5. **Verifizieren** → Tests laufen

### Konzept-Pflicht bei:
- Architektur-Änderungen
- Neuen Dependencies
- Refactoring >2-3 Dateien
- DB-Schema-Änderungen
- Public API-Änderungen

---

## Dokumentations-System – PFLICHT!

### Development Document im Root
**Format:** `PROJECT-NAME_<type>_YYYY-MM-DD-HHMM.md`

**Types:**
- `initial-development` – Erste Projektentwicklung
- `feature-<name>` – Neues Feature
- `refactoring-<area>` – Refactoring
- `bugfix-<issue>` – Bug-Fix

### Struktur (Minimum)
```markdown
# PROJECT - Feature/Task

**Status:** 🔄 In Arbeit / ✅ Abgeschlossen
**Erstellt:** YYYY-MM-DD HH:MM
**Updated:** YYYY-MM-DD HH:MM

## Ziel
[Was soll erreicht werden?]

## Implementierungsplan
- [✅] Schritt 1 - Notiz/Zeitstempel
- [⏳] Schritt 2 - In Progress
- [ ] Schritt 3

## Änderungen am Plan
[Wenn Plan geändert wurde - warum?]

## Nächste Schritte
[Was kommt als nächstes?]
```

### Workflow
1. **Start:** Document im Root anlegen mit Timestamp
2. **Während:** Nach JEDEM Schritt updaten + neuer Timestamp im Dateinamen
3. **Probleme:** Schwierige Issues → `docs/lessons-learned/problem-name.md`
4. **Fertig:** Status ✅ → verschieben nach `docs/archive/`
5. **Nächstes:** Neues Document für nächste Aufgabe

**⚠️ Update BEVOR committet wird!**

---

## Projekt-Struktur

```
project-root/
├── PROJECT-NAME_initial-development_YYYY-MM-DD-HHMM.md  # AKTIV
├── FEATURE-NAME_development_YYYY-MM-DD-HHMM.md          # AKTIV
├── CHANGELOG_YYYY-MM-DD-HHMM.md                         # Mit Timestamp!
├── CLAUDE.md
├── README.md
├── .gitignore
│
├── src/
├── tests/
│
└── docs/
    ├── DEVELOPMENT-GUIDELINES-QUICK.md          # Diese Datei
    ├── DEVELOPMENT-GUIDELINES-FULL.md           # Vollständige Doku
    ├── archive/                                 # Abgeschlossene Dev Docs
    └── lessons-learned/                         # Schwierige Probleme
```

---

## Datei-Backup bei Überarbeitung – KRITISCH!

### Regel: Operative Dateinamen NIEMALS ändern

**Wenn bestehende Datei überarbeitet wird:**

```bash
# ❌ FALSCH: Datei umbenennen
mv correction.py correction-voice.py

# ✅ RICHTIG: Backup mit beschreibendem Namen
cp correction.py correction_backup_before-voice-feature.py
# Dann correction.py bearbeiten (Name bleibt!)
```

**Format:** `filename_backup_before-<description>.ext`

**Warum?**
- Imports bleiben funktionsfähig
- Keine Pfad-Änderungen nötig
- Keine Merge-Konflikte
- Git-History bleibt sauber

**Workflow:**
1. Backup erstellen mit `_backup_before-<feature>`
2. Original-Datei bearbeiten (Name unverändert!)
3. Backup committen zusammen mit Änderungen

---

## Git-Workflow

### Commits
- Klein und atomar
- Jeder Commit = eine logische Änderung
- Format: `type(scope): description`
  - `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Branches
- `main` – Production-ready
- `develop` – Integration
- `feature/*` – Neue Features
- `bugfix/*` – Bug-Fixes

### Vor jedem Commit
- [ ] Tests laufen durch
- [ ] Development Document aktualisiert
- [ ] Timestamp erneuert
- [ ] Nur gewollte Änderungen

---

## Testing

### Test-Pyramide
- 70% Unit Tests
- 20% Integration Tests
- 10% E2E Tests

### TDD mit Claude Code
1. Tests schreiben (müssen fehlschlagen)
2. **Explizit sagen:** "Dies ist TDD - keine Mock-Implementation!"
3. Code implementieren
4. Tests laufen
5. Refactoring (Tests bleiben grün)

---

## Context Management

### `/clear` verwenden
- Nach jedem abgeschlossenen Feature
- Spätestens alle 30-45 Minuten
- Wenn Claude gegen Guidelines verstößt

### CLAUDE.md aktuell halten
- Projektregeln dokumentieren
- Häufige Fehler als "Don'ts"
- Bash-Befehle
- Code-Style

---

## Checkliste pro Session

**Start:**
- [ ] Development Document angelegt mit Timestamp
- [ ] Tests laufen
- [ ] Letzter Stand committet

**Während:**
- [ ] Nach jedem Schritt: Document updaten + neuer Timestamp
- [ ] **Bei Datei-Überarbeitung: Backup erstellen (Name bleibt gleich!)**
- [ ] Claude bleibt beim Auftrag
- [ ] Fail-Fast beachtet (keine stillen Fallbacks)
- [ ] Tests nach jeder Änderung

**Ende:**
- [ ] Alle Tests grün
- [ ] Document Status auf ✅
- [ ] Document nach `docs/archive/`
- [ ] Schwierige Probleme in `docs/lessons-learned/`
- [ ] CHANGELOG aktualisiert

---

## Die 13 Gebote

1. **KISS** – Einfachste Lösung
2. **Separation of Concerns** – Eine Verantwortung pro Modul
3. **Fail-Fast** – KEINE stillen Fallbacks
4. **Nicht überschreiten** – Nur was gefragt wurde
5. **Erst planen** – Plan → Freigabe → Umsetzen
6. **Konzept vorlegen** – Architektur-Änderungen brauchen OK
7. **Dateinamen bleiben stabil** – Backup vor Änderung, Name bleibt gleich
8. **Development Document PFLICHT** – Jede Entwicklung braucht Live-Doc
9. **Timestamp aktuell** – Bei jedem Update neuer Timestamp
10. **Kleine Commits** – Atomar und getestet
11. **Tests Pflicht** – Keine Änderung ohne Test
12. **CLAUDE.md nutzen** – Projektregeln dokumentieren
13. **Context Management** – `/clear` oft verwenden

---

## Bei Regelverstoß

1. **Stoppen** – Änderungen nicht übernehmen
2. **CLAUDE.md updaten** – Regel explizit aufnehmen
3. **`/clear`** – Neu starten
4. **Expliziter Prompt** – Regel im Prompt erwähnen

---

**Details, Templates und Beispiele:** Siehe `docs/DEVELOPMENT-GUIDELINES-FULL.md`
