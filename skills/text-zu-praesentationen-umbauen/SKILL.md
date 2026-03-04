---
name: text-zu-praesentationen-umbauen
description: "Dieser Skill wandelt einen Markdown-Text in ein annotiertes Präsentations-Markdown um, das von der _AA_Slides App importiert werden kann. Verwende ihn wenn der User sagt: 'mach eine Präsentation daraus', 'in Folien umwandeln', 'als Präsentation', 'Slides erstellen' oder ähnliches."
---

# Text zu Präsentation

Wandelt einen Markdown-Text in eine annotierte Präsentations-Datei um.

## Ziel

Aus einem Fliesstext (Seminar-Handout, Artikel, Dokument) eine strukturierte Präsentation erstellen:
- Überschriften → Folientrennseiten
- Textblöcke → Bullet-Point-Folien
- Blockquotes → hervorgehobene Inhaltsfolien
- Ausgabe: `<Dateiname>_Presentation.md` im selben Ordner

## Trigger

- «mach eine Präsentation daraus»
- «in Folien umwandeln»
- «als Präsentation aufbereiten»
- «Slides erstellen»
- «Präsentations-Markdown erzeugen»

## Workflow

1. Lade den Prompt aus `prompts/default-prompts.md`.
2. Folge der Vorgehensweise in `references/usage-guide.md`.
3. Nutze die Mapping-Regeln in `references/slide-mapping.md`.

## Ressourcen

- Prompt: `prompts/default-prompts.md`
- Vorgehensweise: `references/usage-guide.md`
- Folie-Mapping: `references/slide-mapping.md`
