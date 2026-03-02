# Prompt-Bausteine: rechtschreibung-grosse-dokumente

## Grundauftrag
Pruefe das Dokument scheibchenweise auf Rechtschreibung, Grammatik und Interpunktion.

## Slice-Regel
Arbeite in Bloecken von ca. 900 bis 1200 Woertern und speichere nach jeder Slice den Fortschritt.

## Korrekturgrenze
Keine freie Umformulierung. Nur sprachliche Korrekturen und offensichtliche Zeichensetzung.

## Didaktik-Pruefung vor jeder Aenderung
- Entscheide fuer jeden Kandidaten zuerst: `apply` oder `keep_example`.
- `keep_example`, wenn die Stelle offensichtlich ein Lehr-/Demokontext ist (z. B. "falsch", "korrekt", "statt", "Beispiel", "verwenden Sie lieber ...").
- In Erklaertexten ueber Zeichen/Schreibweisen Demonstrationszeichen nie automatisch ersetzen:
  - `ß` als Erklaerbeispiel fuer Deutschland/Schweiz
  - `-` als gezeigtes Minuszeichen bei Typografie-Erklaerung
  - einfache Anfuehrungszeichen als gezeigtes Gegenbeispiel zu Guillemets
- Inhalte in Inline-Code, Codeblocks, Zitaten und expliziten Vorher/Nachher-Beispielen standardmaessig erhalten.

## Methodik
- Single-Agent, sequenziell.
- Keine Subagents.
- Regex nur als Hilfsmittel.
- Unsichere Faelle mit `confidence: low` markieren statt aggressiv korrigieren.

## Ergebnis
Erzeuge:
1. Einen strukturierten Korrektur-Report.
2. Eine komplett korrigierte Dokumentversion.
3. Einen checkpoint-faehigen Findings-Ledger + JSONL-Teilresultate.
