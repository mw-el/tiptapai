---
name: rechtschreibung-grosse-dokumente
description: "Delegiert einen robusten Slice-Spellcheck grosser Dokumente an ClaudeAuto (checkpoint/resume-faehig)."
---

# rechtschreibung-grosse-dokumente

## Ziel
Ein grosses aktives Dokument in Slices pruefen, robust ueber lange Laufzeiten und Continue-Resets.

## Trigger
- Dokument ist gross und soll vollstaendig rechtschreib-/grammatikgeprueft werden.
- Task soll unbeaufsichtigt in ClaudeAuto laufen.

## Harte Regeln
- Single-Agent, keine Subagents, keine Parallel-Batches.
- Keine Methodenwechsel ohne echten Blocker.
- Keine freie Stil-Umarbeitung, nur sprachliche Korrekturen.
- Dateinamen/Pfade in Links nicht als Rechtschreibfehler behandeln.
- Didaktische Beispiele in Schreib-Ratgebertexten nicht "wegkorrigieren".

## Didaktik-Schutz (wichtig)
- Pruefe vor jeder Korrektur, ob die Stelle ein erklaertes Beispiel ist.
- Wenn ein Ausdruck als Fehler demonstriert wird (z. B. "falsch", "statt", "besser", "Beispiel"), Originalform beibehalten.
- Wenn Zeichen selbst Thema sind (`ß`, Minus vs Gedankenstrich, einfache Anfuehrungszeichen vs Guillemets), Demonstrationszeichen unveraendert lassen.
- In didaktischen Kontexten lieber im Report markieren als im Text ersetzen.

## Ausfuehrung in TipTap AI
1. Skill im Skill Repository waehlen.
2. `Skill anwenden` klicken.
3. TipTap AI zeigt Hinweisfenster, die Datei fuer die Laufzeit zu schliessen.

## Technischer Ablauf
- TipTap AI schreibt eine `.task`-Datei in `~/.config/aa-claudeauto/refinement-drop`.
- ClaudeAuto uebernimmt den Task aus der Queue und arbeitet slice-basiert weiter.
- Artefakte landen neben dem Quelldokument unter `aa-claudeauto/spell-audit/<dateiname>/`.

## Ressourcen
- Prompts: `prompts/default-prompts.md`
- Vorgehensweise: `references/usage-guide.md`
- Report-Schema: `references/report-schema.md`
- Dictionary-Schema: `references/dictionary-schema.md`
- Skript: `scripts/run.sh`
