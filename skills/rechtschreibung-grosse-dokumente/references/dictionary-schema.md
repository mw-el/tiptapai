# False-Positive Dictionary Schema: rechtschreibung-grosse-dokumente

## Zweck
Wiederkehrende False Positives nachvollziehbar unterdruecken, ohne echte Fehler zu verstecken.

## Standarddatei
- `aa-claudeauto/spell-audit/<dateiname>/dictionary.json`

## JSON-Schema (empfohlen)
```json
{
  "schema_version": 1,
  "dictionary_type": "large_document_spell_audit_false_positives",
  "updated_at": "2026-03-02T08:30:00Z",
  "entries": [
    {
      "id": "fp_001",
      "status": "active",
      "match": {
        "type": "exact",
        "text": "AA_ClaudeAuto"
      },
      "scope": {
        "paths": ["**"],
        "categories": ["typo", "orthography", "consistency"]
      },
      "action": "suppress",
      "note": "Projektname",
      "provenance": {
        "added_at": "2026-03-02T08:30:00Z",
        "added_from_report": "<report_path>",
        "added_from_finding_ids": ["011", "027"],
        "added_from_finding_keys": ["sha1:...", "sha1:..."]
      }
    }
  ],
  "didactic_keep_rules": [
    {
      "id": "dk_001",
      "status": "active",
      "match": {
        "type": "exact",
        "text": "ß"
      },
      "scope": {
        "paths": ["**"],
        "contexts": ["metasprachliche_erklaerung_zeichen"]
      },
      "action": "keep_example",
      "note": "Zeichen wird im Ratgeber erklaert, daher nicht ersetzen"
    }
  ]
}
```

## Sicherheitsregeln
- Zuerst `match.type = exact` verwenden.
- Kurze Begriffe nur eng scopen.
- Eintraege deaktivieren statt loeschen (`status: disabled`).
- Immer IDs und `finding_key` als Provenance speichern.
- Didaktik-Regeln (`didactic_keep_rules`) nur fuer eindeutig erklaerte Beispielkontexte aktivieren.
