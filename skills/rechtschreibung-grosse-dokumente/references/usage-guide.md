# Usage Guide: rechtschreibung-grosse-dokumente

## Zweck
Ein grosses aktives Dokument robust und scheibchenweise pruefen (Rechtschreibung, Grammatik, Interpunktion), inklusive Checkpoint/Resume fuer lange Laeufe.

## Betriebsmodus
- Single-Agent, sequenziell.
- Keine Subagents, keine Parallel-Batches.
- Kein Methodenwechsel ohne echten Blocker.
- Regex/Pattern nur als Helfer; Entscheidungen aus dem gelesenen Text.
- Dateinamen/Pfade in Markdown-/HTML-Links nicht als Fehler melden.

## Didaktik-/Illustrations-Schutz
- Vor jeder Aenderung immer zuerst Kontextklassifikation ausfuehren:
  - `normal_prosa`
  - `didaktisches_beispiel`
  - `metasprachliche_erklaerung_zeichen`
- Bei `didaktisches_beispiel` und `metasprachliche_erklaerung_zeichen` Standardentscheidung: nicht ersetzen (`decision = keep_example`).
- Typische Marker fuer Didaktik:
  - Formulierungen wie `falsch`, `richtig`, `korrekt`, `statt`, `besser`, `Beispiel`, `so nicht`, `so ist es korrekt`
  - direkte Gegenueberstellung (Vorher/Nachher)
  - Erklaerungen zu konkreten Zeichen (z. B. `ß`, `-`, Gedankenstrich, Anfuehrungszeichen, Guillemets)
  - Inhalte in Inline-Code, Codeblocks, Tabellen mit Vergleichsspalten oder explizit zitierten Tokens
- In diesen Faellen Aenderung nur, wenn eindeutig kein Demonstrationszweck vorliegt.

## Laufzeit-Artefakte
Empfohlener Ordner neben der Quelldatei:
- `aa-claudeauto/spell-audit/<dateiname>/`

Pflichtartefakte:
- `rescan-index.json`
- `findings-rescan.partial.jsonl`
- `findings-ledger.csv`
- `<dateiname>__spell-audit-report.md`
- `<dateiname>__spellchecked.md`
- `dictionary.json` (optional, fuer False-Positive-Unterdrueckung)

## Ablauf
1. Quelldatei in Slices von ca. 900 bis 1200 Woertern unterteilen.
2. Jede Slice manuell und sequenziell pruefen.
3. Pro Kandidat die Didaktik-Klassifikation und Entscheidung (`apply`/`keep_example`) festhalten.
4. Nach jeder Slice Korrekturen und Checkpoint-Dateien persistieren.
5. Findings-Ledger CSV als kanonische Quelle pflegen.
6. Report und JSON-Block fortlaufend mit dem Ledger synchronisieren.

## Continue/Reset-Regeln
- Bei Unterbruch immer vom letzten validen Checkpoint weitermachen.
- Keine bereits abgeschlossenen Slices doppelt zaehlen.
- Vor Fortsetzung Invarianten pruefen:
  - `completed_count == len(completed_slices)`
  - `findings_count` entspricht CSV-Zeilenzahl (ohne Header)
  - naechste Slice stimmt mit Index-Status ueberein

## Qualitaetsgrenzen
- Keine freie Stil-Umarbeitung.
- Unsichere Faelle als `confidence: low` markieren statt aggressiv zu korrigieren.
- Schweizer Schreibweise bevorzugen (ss statt scharfem s), sofern deutschsprachig.
- `ß` nicht ersetzen, wenn das Zeichen selbst erklaert oder verglichen wird.
- Minuszeichen, Gedankenstriche und Anfuehrungszeichen nur dann typografisch normalisieren, wenn sie nicht als Beispielgegenstand erklaert werden.

## Verweise
- Report-Struktur: `references/report-schema.md`
- False-Positive-Dictionary: `references/dictionary-schema.md`
