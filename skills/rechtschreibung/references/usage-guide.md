# Usage Guide: rechtschreibung

## Zweck

Einen normal langen Text (bis ca. 3000 Woerter) direkt im TipTap AI Terminal in
einem einzigen Durchlauf auf Rechtschreibung, Grammatik und Interpunktion pruefen.
Kein Slicing, kein Checkpoint, keine Artefakt-Dateien.

## Betriebsmodus

- Laeuft direkt im aktiven Claude-Terminal von TipTap AI.
- Single-pass: Der gesamte Text wird auf einmal geprueft.
- Keine Subagents, keine parallelen Batches.
- Keine Stil-Umarbeitung – nur sprachliche Korrekturen.

## Wann diesen Skill verwenden

- Text bis ca. 3000 Woerter.
- Schnelle Prüfung gewünscht, Ergebnis sofort im Terminal sichtbar.
- Kein unbeaufsichtigter Langzeitlauf noetig.

## Wann stattdessen `rechtschreibung-grosse-dokumente` verwenden

- Text laenger als ca. 3000 Woerter.
- Pruefung soll unbeaufsichtigt laufen (ClaudeAuto-Delegation).
- Checkpoint/Resume bei Unterbrechung gewünscht.
- Strukturierter Report mit CSV-Ledger gewünscht.

## Ablauf

1. Skill im Skills-Modal auswaehlen und "Skill anwenden" klicken.
2. TipTap AI sendet einen Hinweis an das Terminal mit den Pfaden zu den Skill-Dateien.
3. Claude liest SKILL.md und prompts/default-prompts.md.
4. Den zu pruefenden Text in das Terminal eingeben oder einfuegen.
5. Claude gibt Fehler-Tabelle + korrigierten Text direkt aus.

## Qualitaetsgrenzen

- Keine freie Stil-Umarbeitung.
- Unsichere Faelle als confidence: low markieren – nicht automatisch korrigieren.
- Schweizer Schreibweise bevorzugen (ss statt scharfem s).
- Didaktische Beispiele und Erklaer-Kontexte nicht normalisieren.
- Dateinamen/Pfade in Markdown-Links niemals als Fehler melden.

## Verweise

- Regelwerk: `prompts/default-prompts.md`
- Skill-Beschreibung: `SKILL.md`
