# Slide-Mapping: Text → Präsentation

## Annotation-Format

Jede Folie beginnt mit einem HTML-Kommentar, der das Layout und Optionen angibt.
Dieser Kommentar steht auf der Zeile DIREKT vor dem Inhalt der Folie.

```
<!-- SLIDE layout="LAYOUTNAME" [schlüssel="wert" ...] -->
```

HTML-Kommentare sind in TipTap und im Browser unsichtbar.
Die _AA_Slides Import-Funktion liest diese Kommentare und erzeugt daraus JSON-Folien.

---

## Standard-Layouts

### 1. Cover-Folie

```markdown
<!-- SLIDE layout="kraft-cover" imagePath="" -->
# Präsentationstitel
Untertitel oder Datum
```

- `imagePath`: optionaler Pfad zu einem Hintergrundbild
- Aus dem Dokument: H1-Titel des Dokuments

---

### 2. Separator Full Page (Hauptkapitel)

```markdown
<!-- SLIDE layout="kraft-divider" backgroundToken="blue" -->
## Kapitelname
Kurzer Untertitel (optional)
```

- `backgroundToken`: `blue` | `green` | `orange` | `yellow` | `red` | `pink` | `dark`
- Aus dem Dokument: H2-Überschriften
- Farben abwechseln: blue → green → orange → blue → ...

---

### 3. Separator Half Page (Unterkapitel)

```markdown
<!-- SLIDE layout="kraft-highlight" backgroundToken="orange" quote="Kernaussage des Abschnitts" -->
### Unterkapitel
```

- `quote`: eine prägnante Kernaussage oder Zitat aus dem Abschnitt (max. 15 Wörter)
- `imagePath`: optionaler Pfad zu einem Bild (rechte Seite)
- Aus dem Dokument: H3-Überschriften, die einen neuen Unterabschnitt einleiten
- Nur verwenden wenn ein aussagekräftiges Quote vorhanden ist; sonst `kraft-content`

---

### 4. Standard-Folie (Text)

```markdown
<!-- SLIDE layout="kraft-content" -->
### Folientitel
- Bullet Point 1
- Bullet Point 2
- Bullet Point 3
```

- Aus dem Dokument: Textblöcke nach Überschriften
- Inhalt als Bullet Points komprimieren (3–6 Punkte, max. 6–8 Wörter pro Bullet)

---

### 5. Text + Bild

```markdown
<!-- SLIDE layout="kraft-content" imageMode="right" imagePath="pfad/bild.jpg" -->
### Folientitel
- Bullet Point 1
- Bullet Point 2
```

- `imageMode`: `right` (Standard) oder `right-50` (halbe Breite)
- Verwenden wenn im Originaltext ein Bild oder Diagramm referenziert wird

---

### 6. Zwei-Spalten-Layout

```markdown
<!-- SLIDE layout="kraft-two-column" leftTitle="Linke Spalte" rightTitle="Rechte Spalte" -->
### Folientitel

**Links:**
- Punkt A
- Punkt B

**Rechts:**
- Punkt C
- Punkt D
```

- Verwenden bei direkten Gegenüberstellungen (Vorher/Nachher, Richtig/Falsch, Pro/Contra)
- Im Markdown: linke Bullets nach `**Links:**`, rechte nach `**Rechts:**`
- Die Import-Funktion teilt den Body an diesem Marker auf

---

### 7. Schlussfolie

```markdown
<!-- SLIDE layout="closing" -->
# Vielen Dank
Fragen und Diskussion
```

- Immer als letzte Folie einfügen
- Titel: «Vielen Dank» oder «Fragen?» oder «Zusammenfassung»

---

## Mapping-Regeln: Quelldokument → Folientyp

| Dokumentelement | Folientyp | Bedingung |
|---|---|---|
| H1 (erster) | `kraft-cover` | Immer |
| H2 | `kraft-divider` | Immer; Farben rotieren |
| H3 (Abschnitt-Opener) | `kraft-highlight` | Wenn Quote ableitbar |
| H3 (Aufgabe/Inhalt) | `kraft-content` | Default für H3 |
| Textblock (Fliesstext) | `kraft-content` | Als Bullets komprimiert |
| Blockquote (`> ...`) | `kraft-content` | Quote als `body` übernehmen |
| Gegenüberstellung | `kraft-two-column` | Erkennbar an «Statt / Besser», «❌ / ✅» |
| Letzte Folie | `closing` | Immer als Abschluss |

---

## Bullet-Point-Regeln

**6×6-Regel:** Max. 6 Bullets, max. 6–8 Wörter pro Bullet.

**Parallelismus:** Alle Bullets einer Folie beginnen mit der gleichen Wortart:
- Regel-Listen → Verb-Start (Infinitiv): «Einschübe kürzen», «Verb früh setzen»
- Übersichts-Listen → Nomen-Start: «Doppelpunkt: fokussiert Pointen»
- Anleitungen → Imperativ: «Stellen Sie den Kern früh»

**Komprimierung:** Fliesstext destillieren — Kernaussage erhalten, Füllwörter weglassen.
Beispiel: «Es ist wichtig zu beachten, dass...» → Einleitungssatz streichen.

**Schweizer Rechtschreibung:**
- «ss» statt «ß» (Strasse, dass, muss)
- Anführungszeichen «» statt ""
- Keine anderen Abweichungen vom Standard-Duden

---

## Beispiel: Vollständige annotierte Präsentation

```markdown
<!-- SLIDE layout="kraft-cover" -->
# Klarer Satzbau
Seminar-Handout · Schreibkurs Modul 4

<!-- SLIDE layout="kraft-divider" backgroundToken="blue" -->
## Verbalstil statt Nominalstil
Warum Verben Texte stärken

<!-- SLIDE layout="kraft-content" -->
### Merkmale des Nominalstils
- Handlungen in Nomen verpackt: «die Durchführung», «die Umsetzung»
- Hilfsverben dominieren: «erfolgt», «wird vorgenommen»
- Sätze länger ohne mehr Inhalt
- Merke: viele Wörter auf «-ung», «-heit», «-keit» → Verb prüfen

<!-- SLIDE layout="kraft-divider" backgroundToken="green" -->
## Die wichtigsten Regeln
Klarer Satzbau in der Praxis

<!-- SLIDE layout="kraft-highlight" backgroundToken="orange" quote="Einer muss sich Mühe geben: der Schreiber oder der Leser." -->
### Ein Gedanke pro Satz

<!-- SLIDE layout="kraft-content" -->
### Satz-Regeln im Überblick
- Ein Gedanke pro Satz — wichtigste Regel
- Hauptsachen in Hauptsätze
- Doppelpunkt: fokussiert die Pointe
- Ausrufezeichen: nur für echte Ausrufe
- Gedankenstrich: gliedert Einschübe
- Einschübe: maximal 8–12 Wörter

<!-- SLIDE layout="kraft-two-column" leftTitle="Nominalstil" rightTitle="Verbalstil" -->
### Vorher / Nachher

**Links:**
- «Die Durchführung erfolgt bis Ende Woche»
- «Es wurde beschlossen, dass...»

**Rechts:**
- «Frau Huber erledigt das bis Freitag»
- «Das Gremium hat entschieden:»

<!-- SLIDE layout="closing" -->
# Vielen Dank
Fragen und Diskussion
```
