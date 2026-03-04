# Prompt: text-zu-praesentationen-umbauen

Du wandelst einen deutschen Fliesstext (Seminar-Handout, Artikel, Dokument) in
ein annotiertes Präsentations-Markdown um. Die Ausgabe kann von der _AA_Slides
App direkt importiert werden.

---

## Kontext: Slide-Layouts

Folgende Layouts stehen zur Verfügung. Wähle für jede Folie das passende Layout.

### kraft-cover — Cover-Folie
Titelfolie der Präsentation. Immer die erste Folie.
```
<!-- SLIDE layout="kraft-cover" imagePath="" -->
# Titel
Untertitel
```

### kraft-divider — Separator Full Page (Hauptkapitel)
Farbige Vollseite, kündigt ein Hauptkapitel an.
backgroundToken: blue | green | orange | yellow | red | pink | dark
Farben bei mehreren H2 rotieren: blue → green → orange → blue ...
```
<!-- SLIDE layout="kraft-divider" backgroundToken="blue" -->
## Kapitelname
Kurzer Untertitel
```

### kraft-highlight — Separator Half Page (Unterkapitel)
Halbe farbige Seite links, rechts optional ein Bild. Hat ein Quote-Feld für
eine Kernaussage. Nur verwenden wenn ein gutes Quote aus dem Text ableitbar ist.
```
<!-- SLIDE layout="kraft-highlight" backgroundToken="orange" quote="Kernaussage max. 15 Wörter" -->
### Unterkapitel
```

### kraft-content — Standard-Folie (Text)
Standard-Inhaltsfolie mit Titel und Bullet Points.
```
<!-- SLIDE layout="kraft-content" -->
### Folientitel
- Bullet 1
- Bullet 2
```

### kraft-content + Bild — Text und Bild
Wie kraft-content, aber mit Bild rechts. Nur wenn im Originaltext ein Bild
referenziert wird oder ein Bild sinnvoll wäre.
```
<!-- SLIDE layout="kraft-content" imageMode="right" imagePath="" -->
### Folientitel
- Bullet 1
```

### kraft-two-column — Zwei-Spalten-Layout
Für direkte Gegenüberstellungen (Vorher/Nachher, Richtig/Falsch, Pro/Contra).
Erkennbar an «Statt / Besser», «❌ / ✅», «Variante A / Variante B».
leftTitle und rightTitle als Attribute im Kommentar angeben.
Im Body: linke Bullets nach `**Links:**`, rechte nach `**Rechts:**`
```
<!-- SLIDE layout="kraft-two-column" leftTitle="Statt" rightTitle="Besser" -->
### Folientitel

**Links:**
- Schlechtes Beispiel

**Rechts:**
- Gutes Beispiel
```

### closing — Schlussfolie
Immer als letzte Folie. Kein Inhalt ausser Titel und optionalem Untertitel.
```
<!-- SLIDE layout="closing" -->
# Vielen Dank
Fragen und Diskussion
```

---

## Aufgabe

Du erhältst einen deutschen Markdown-Text. Führe diese Schritte aus:

**SCHRITT 1 — STRUKTUR ANALYSIEREN**

Lies den Text vollständig. Identifiziere:
- Den H1-Titel → wird zur Cover-Folie
- Alle H2-Abschnitte → werden zu kraft-divider-Folien
- Alle H3-Abschnitte und Textblöcke → werden zu Inhaltsfolien
- Gegenüberstellungen (❌/✅, Statt/Besser) → zwei-Spalten-Layout
- Blockquotes mit starken Aussagen → kraft-highlight-Quote oder kraft-content

**SCHRITT 2 — BULLET POINTS FORMULIEREN**

Fasse Textblöcke als Bullet Points zusammen. Regeln:
- **6×6-Regel:** max. 6 Bullets pro Folie, max. 6–8 Wörter pro Bullet
- **Parallelismus:** Alle Bullets einer Folie mit gleicher Wortart beginnen
  - Regel-/Anweisungslisten: Infinitiv-Start («Einschübe kürzen», «Verb früh setzen»)
  - Übersichtslisten: Nomen-Start («Doppelpunkt: fokussiert Pointen»)
- **Komprimierung:** Kernaussage behalten, Füllwörter entfernen
  - «Es ist wichtig zu beachten, dass...» → Einleitungssatz streichen
  - «Die Hauptsache ist, dass...» → direkt zur Aussage
- **Ein Gedanke:** Kein Komma-verbundener Doppelgedanke
- **Schweizer Rechtschreibung:** «ss» statt «ß», Anführungszeichen «»

**SCHRITT 3 — PRÄSENTATIONS-MARKDOWN AUSGEBEN**

Gib den vollständigen annotierten Text aus. Format:

```markdown
<!-- PRESENTATION source="[Originaldateiname]" date="[Datum]" -->

<!-- SLIDE layout="kraft-cover" imagePath="" -->
# [H1-Titel aus Dokument]
[Untertitel oder Kontext, falls vorhanden]

<!-- SLIDE layout="kraft-divider" backgroundToken="blue" -->
## [H2-Text]
[Erste Zeile des folgenden Abschnitts als Untertitel, max. 8 Wörter]

<!-- SLIDE layout="kraft-content" -->
### [Folientitel]
- [Bullet 1]
- [Bullet 2]
...

<!-- SLIDE layout="closing" -->
# Vielen Dank
Fragen und Diskussion
```

**SCHRITT 4 — DATEI SPEICHERN**

Speichere die Ausgabe als `[Originaldateiname]_Presentation.md` im gleichen
Ordner wie die Quelldatei. Verwende dazu das Write-Tool.

---

## Constraints

- Keine Informationen aus dem Original weglassen — alle Kernaussagen müssen
  als Bullets erscheinen
- Keine neuen Inhalte erfinden, die nicht im Originaltext stehen
- Eigennamen, Zitate und Beispiele wörtlich übernehmen
- Aufgaben-Blöcke (Aufgabe A1, A2 etc.) als eigene Inhaltsfolien behandeln
- Blockquotes aus dem Original können direkt als Bullet-Inhalt oder als
  kraft-highlight-Quote verwendet werden
- Wenn ein Abschnitt zu viel Inhalt für eine Folie enthält (>6 Bullets),
  auf mehrere Folien aufteilen mit nummerierten Titeln (1/2, 2/2)
