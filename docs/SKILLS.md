# Skill Repository in TipTap AI

## Ziel
Das Skill Repository speichert wiederverwendbare KI-Arbeitsbausteine direkt im Projekt unter `skills/`.

## Struktur pro Skill
Jeder Skill ist ein eigener Ordner:

```text
skills/<skill-slug>/
├── SKILL.md
├── prompts/
│   └── default-prompts.md
├── references/
│   └── usage-guide.md
└── scripts/
    └── run.sh
```

## UI-Workflow
1. Terminalansicht oeffnen.
2. Auf `Skill Repository` (Psychology-Icon) klicken.
3. `Neuer Skill` anlegen oder bestehenden Skill waehlen.
4. `Skill anwenden` klicken.

### Skill anwenden
- Standard-Skills: TipTap AI schreibt den Skill-Hinweis direkt in das laufende Terminal.
- `rechtschreibung-grosse-dokumente`: TipTap AI delegiert den Task an ClaudeAuto ueber die Drop-Queue.
  - Queue-Datei: `~/.config/aa-claudeauto/refinement-drop/*.task`
  - ClaudeAuto verarbeitet den Lauf robust ueber Continue/Reset-Fenster.
  - TipTap AI zeigt danach ein Warnfenster, dass die Datei waehrend des Laufs geschlossen werden soll.

## Skill entwickeln
1. Ziel und Trigger in `SKILL.md` klar definieren.
2. Prompt-Bausteine in `prompts/default-prompts.md` halten.
3. Konkretes Vorgehen in `references/usage-guide.md` dokumentieren.
4. Wiederkehrende, deterministische Schritte in `scripts/run.sh` automatisieren.
5. Skill im echten Dokument-Workflow testen und Dateien nachschaerfen.

### Delegierte Skills (ClaudeAuto)
- Wenn ein Skill ueber ClaudeAuto laufen soll (Drop-Queue, unattended), verwende verbindlich:
  - `docs/CLAUDEAUTO_SKILL_INTEGRATION.md`
- Diese Referenz beschreibt Standard-Pattern fuer:
  - `skills-apply` Routing (`terminal-hint` vs `claudeauto-delegated`)
  - Task-Prompt-Aufbau
  - Checkpoint-/Artefaktstruktur
  - UI-Warnhinweis fuer Dateischliessen waehrend Lauf
  - konfliktarme Cross-Repo-Zusammenarbeit

## Namenskonvention
- Skill-Namen werden als Slug gespeichert: Kleinbuchstaben, Zahlen, Bindestriche.
- Beispiele: `text-polish-basic`, `consistency-pass-basic`.

## Hinweise
- Das Repository kann im Dateimanager ueber den Button `Ordner öffnen` geoeffnet werden.
- Neue Skills koennen via UI oder direkt im Dateisystem angelegt werden.
- Der delegierte Spellcheck-Skill legt Ergebnisdateien neben dem Original ab:
  - `<datei>.spellcheck-report.md`
  - `<datei>.spellchecked.md`
