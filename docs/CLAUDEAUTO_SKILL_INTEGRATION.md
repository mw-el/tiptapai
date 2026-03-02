# ClaudeAuto Skill Integration (TipTap AI)

## Ziel
Dieses Dokument beschreibt den Standardweg, um einen TipTap-Skill als ClaudeAuto-Delegation zu integrieren (Drop-Queue + unattended run).

## Wann delegieren?
- Delegieren, wenn der Skill lange/unbeaufsichtigt laufen soll (z. B. grosse Dokumente, checkpoint/resume).
- Nicht delegieren, wenn ein kurzer interaktiver Terminal-Hinweis ausreicht.

## Integrationsmuster

### 1. Skill in TipTap anlegen (Source of Truth)
Lege den Skill unter `skills/<slug>/` an:
- `SKILL.md`
- `prompts/default-prompts.md`
- `references/usage-guide.md`
- weitere Referenzen (z. B. report/dictionary schema)
- `scripts/run.sh`

### 2. Delegationspfad in `main.js` ergaenzen
Typische Bausteine:
- Prompt-Builder fuer ClaudeAuto-Task
- Funktion zum Erzeugen/Pruefen der Skill-Dateien fuer ClaudeAuto
- Queue-Dispatch (`.task` nach `~/.config/aa-claudeauto/refinement-drop`)
- Rueckgabe von Artefaktpfaden fuer UI-Anzeige

Bestehende Referenzimplementierung:
- `buildClaudeAutoSpellcheckTaskPrompt(...)`
- `ensureClaudeAutoSpellcheckSkillFiles(...)`
- `enqueueSpellcheckTaskForClaudeAuto(...)`
- `ipcMain.handle('skills-apply', ...)` mit Delegationszweig

### 3. `skills-apply` Routing
Im IPC-Handler:
- normaler Skill: `mode: terminal-hint`
- delegierter Skill: `mode: claudeauto-delegated`

### 4. UI-Hinweis nach Delegation
In `renderer/claude/skills-modal.js`:
- Task-Datei und Artefakte anzeigen
- klares Warnfenster, wenn Datei waehrend Lauf geschlossen werden soll

## Pflichtregeln fuer delegierte Skills
- Single-Agent, keine Subagents, keine Parallel-Batches.
- Kein Method-/Scope-Drift ohne klaren Blocker.
- Checkpoint/resume-faehige Artefakte nach jedem Schritt aktualisieren.
- Stabiler, parsebarer Report (Human + Machine-Readable Teil).
- Bei didaktischen/erklaerenden Texten: absichtliche Beispielstellen nicht automatisch korrigieren (falls fachlich relevant).

## Artefakt-Checkliste
Empfohlen je Lauf:
- `rescan-index.json`
- `findings-rescan.partial.jsonl`
- `findings-ledger.csv`
- `<name>__spell-audit-report.md` (oder entsprechender Skill-Report)
- `<name>__<result>.md` (korrigierte/erzeugte Ausgabe)
- optional `dictionary.json`

## Konfliktarme Zusammenarbeit (wichtig)
- Skill-Entwicklung zuerst nur in `_AA_TipTapAi`.
- Direkte Edits in `_AA_ClaudeAuto` nur nach expliziter Freigabe oder in abgestimmten Sync-Schritten.
- Wenn parallel andere Agenten an `_AA_ClaudeAuto` arbeiten, Cross-Repo-Sync minimieren.

## Test-Checkliste
- `node -c main.js && node -c preload.js`
- `npm run build`
- Delegationspfad einmal mit Testdatei ausloesen und `.task`-Datei + Artefaktordner pruefen.
