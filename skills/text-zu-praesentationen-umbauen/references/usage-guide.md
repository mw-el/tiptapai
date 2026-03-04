# Usage Guide: text-zu-praesentationen-umbauen

## Vorbereitung

1. Öffne das Quelldokument in TipTap AI.
2. Starte den Skill — Claude liest den aktuell geöffneten Datei-Pfad.

Alternativ: Nenne den Dateinamen explizit:
> «Wandle `/pfad/zur/datei.md` in eine Präsentation um»

---

## Ablauf

1. Claude liest den Prompt aus `prompts/default-prompts.md`.
2. Claude analysiert das Dokument und wandelt es in annotiertes Markdown um.
3. Die Ausgabedatei wird unter `[Originaldatei]_Presentation.md` gespeichert.

---

## Output-Datei bearbeiten

Die `_Presentation.md` Datei enthält:
- `<!-- SLIDE layout="..." -->` Kommentare (unsichtbar in TipTap)
- Normale Markdown-Überschriften und Bullet Points

Du kannst die Datei in TipTap öffnen und:
- Bullet Points umformulieren oder ergänzen
- Layout-Kommentare anpassen (z.B. `backgroundToken` ändern)
- Folien hinzufügen oder löschen

---

## Import in _AA_Slides

Nach der Bearbeitung:
1. Öffne _AA_Slides
2. Klicke «Import» → «Markdown importieren»
3. Wähle die `_Presentation.md` Datei
4. Die Folien werden automatisch aus den Kommentaren erzeugt

---

## Folie-Layout manuell ändern

Ändere den Kommentar direkt im Markdown:

```markdown
<!-- SLIDE layout="kraft-two-column" leftTitle="Vorher" rightTitle="Nachher" -->
```

Verfügbare Layouts und ihre Parameter: `references/slide-mapping.md`

---

## Tipps

- Zu lange Abschnitte werden automatisch auf mehrere Folien aufgeteilt (1/2, 2/2)
- Aufgaben-Blöcke (Aufgabe A1 etc.) werden als eigene Folien behandelt
- Bilder können nachträglich durch Einfügen von `imagePath=""` in den Kommentar ergänzt werden
