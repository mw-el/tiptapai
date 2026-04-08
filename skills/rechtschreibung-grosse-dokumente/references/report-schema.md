# Report Schema: rechtschreibung-grosse-dokumente

## Ziel
Der Report muss fuer Menschen schnell pruefbar und fuer Skripte stabil parsebar sein.

## Dateiname
- `spell-audit/<dateiname>/<dateiname>__spell-audit-report.md`

## Pflichtstruktur (eine Datei)
```md
# Spell Audit Report

- generated_at: <ISO>
- source_file: <absolute_path>
- model: <haiku|sonnet|opus|...>
- slices_total: <int>
- slices_completed: <int>
- findings_count: <int>

## Summary
Kurz, was geprueft wurde und welche Fehlerarten dominieren.

## Progress Index (Slice Status)
| slice_id | status | last_checked_at | notes |
|---|---|---|---|
| 001 | checked | 2026-03-02T08:00:00Z | clean |
| 002 | pending | null | next |

## Findings (Human Review Table)
| # | Slice | Decision | Error Context | Proposed Revision | Error Type & Explanation |
|---|---|---|---|---|---|
| 001 | 001 | apply | `...` | `...` | Missing comma |
| 002 | 001 | keep_example | `...` | `...` | Didaktisches Beispiel, absichtlich so gesetzt |

**Kontext-Regel:** `Error Context` und `Proposed Revision` zeigen jeweils ca. 15 Wörter vor und nach der Fehlerstelle (kein Zeilenumbruch, kein Rohzeilen-Zähler sichtbar).

## Findings (Machine Readable JSON)
```json
{
  "schema_version": 1,
  "report_type": "large_document_spell_audit",
  "source_file": "<absolute_path>",
  "summary": {
    "slices_total": 10,
    "slices_completed": 10,
    "findings_count": 12
  },
  "findings": [
    {
      "id": "001",
      "finding_key": "sha1:...",
      "status": "open",
      "category": "orthography",
      "confidence": "high",
      "decision": "apply",
      "didactic_context": false,
      "didactic_reason": null,
      "slice_id": "001",
      "file": "<absolute_path>",
      "line": 42,
      "excerpt": "...",
      "original": "...",
      "suggestion": "...",
      "rationale": "...",
      "human_error_explanation": "Missing comma",
      "csv_row_source": "findings-ledger.csv#row:2"
    }
  ]
}
```
```

## Feldregeln
- `id`: nullgepolstert (`001`, `002`, ...).
- `status`: Startwert `open`.
- `category`: `typo`, `orthography`, `consistency`, `punctuation`.
- `confidence`: `high`, `medium`, `low`.
- `decision`: `apply` oder `keep_example`.
- `didactic_context`: `true`/`false`.
- `didactic_reason`: kurzer Grund, warum ein Beispiel unberuehrt bleibt.
- `finding_key`: deterministisch aus Kernfeldern (Datei, Zeile, original, suggestion, category).

## CSV-Ledger (kanonisch)
Header (stabil halten):
```csv
nr,pfad,gelesene_zeilen,zeile_mit_fehler,zeile_korrigiert,kurze_begruendung,confidence,finding_key,last_updated_at,status
```

Optionale Erweiterung fuer Didaktik-Tracking:
```csv
...,decision,didactic_context,didactic_reason
```

## Determinismus
- Sortierung: Datei, Zeile, original.
- IDs erst nach Sortierung vergeben.
- Human-Tabelle und JSON muessen die gleichen IDs verwenden.
- Report gilt erst als final, wenn keine Slice mehr `pending` ist.
