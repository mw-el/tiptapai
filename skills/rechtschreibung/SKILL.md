---
name: rechtschreibung
description: "Single-pass Swiss German proofreader for normal-length texts. Runs directly in TipTap AI terminal."
---

# Rechtschreibung (Schweizer Schriftdeutsch)

## Ziel

Einen normalen Text in einem Durchlauf auf Rechtschreibung, Grammatik und Interpunktion prüfen nach
den Regeln des Schweizer Schriftdeutschs. Kein Slicing, kein Checkpoint, kein Report-Artefakt.

## Trigger

- Text ist normal lang (bis ca. 3000 Wörter).
- Schnelle Prüfung direkt im Terminal gewünscht.
- Kein unbeaufsichtigter Langzeitlauf nötig.

## Harte Regeln

- Keine stilistische Umformulierung — nur sprachliche Korrekturen.
- Dateinamen/Pfade in Links niemals als Fehler behandeln.
- Didaktische Beispiele in Ratgebertexten nicht wegkorrigieren.
- Inhalte in Code-Blöcken und Inline-Code nicht prüfen.
- Normale Anführungszeichen ("...") und deutsche Gänsefüsschen („...") durch Guillemets («») ersetzen – ausser in Code und bei semantisch notwendigen ASCII-Quotes.
- Bullet-Point-Einträge, die vollständige Sätze sind (Subjekt + finites Verb oder Imperativsatz): erster Buchstabe gross, Eintrag mit Punkt abschliessen.

## Ausführung

1. Nutze den Prompt in `prompts/default-prompts.md` als Prüf-Regelwerk.
2. Prüfe den gesamten Text in einem Durchlauf.
3. Gib die Fehler-Tabelle und den korrigierten Text direkt aus.

## Ressourcen

- Regeln: `prompts/default-prompts.md`
- Vorgehensweise: `references/usage-guide.md`
