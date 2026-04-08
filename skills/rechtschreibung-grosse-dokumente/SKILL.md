---
name: rechtschreibung-grosse-dokumente
description: "Slice-basierte Rechtschreibpruefung grosser Markdown-Dokumente mit Checkpoint/Resume, direkt im Terminal."
---

# rechtschreibung-grosse-dokumente

## Ziel
Ein grosses aktives Dokument in Slices pruefen, robust ueber lange Laufzeiten und Continue-Resets.

## Trigger
- Dokument ist gross und soll vollstaendig rechtschreib-/grammatikgeprueft werden.
- User waehlt diesen Skill im Skill-Repository und klickt "Skill anwenden".

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
1. Skill im Skill-Repository waehlen.
2. "Skill anwenden" klicken.
3. Claude Code im eingebetteten Terminal arbeitet das Dokument scheibchenweise ab.
4. Artefakte landen neben dem Quelldokument unter `spell-audit/<dateiname>/`.

## Technischer Ablauf
- Claude Code liest die Skill-Dateien (Prompt, Rules, Usage Guide).
- Das Dokument wird in Slices von ca. 900-1200 Woertern verarbeitet.
- Nach jeder Slice werden Checkpoint-Dateien geschrieben.
- Bei Unterbrechung (Terminal-Neustart, Context-Compact) wird ab dem letzten Checkpoint fortgesetzt.

## Ressourcen
- Prompts: `prompts/default-prompts.md`
- Regeln: `prompts/rules-de-ch.md`
- Vorgehensweise: `references/usage-guide.md`
- Report-Schema: `references/report-schema.md`
- Dictionary-Schema: `references/dictionary-schema.md`
