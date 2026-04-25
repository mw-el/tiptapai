---
name: schweizer-typografie
description: Konvertiert Dokumente zu Schweizer Rechtschreibung und Typografie (Guillemets, ß→ss, Gedankenstriche)
version: 1.0.0
trigger_patterns:
  - schweizer typografie
  - swiss typography
  - schweizer rechtschreibung
  - guillemets
  - anführungszeichen schweiz
---

# Schweizer Rechtschreibung und Typografie

Dieser Skill konvertiert Dokumente zur Schweizer Rechtschreibung und Typografie.

## Funktionen

1. **Anführungszeichen → Schweizer Guillemets**
   - Alle doppelten Anführungszeichen → «...»
   - Alle einfachen Anführungszeichen → ‹...›
   - Erkennt automatisch: deutsche ("..."), französische (« ... »), amerikanische ("..."), und typografische ("...") Quotes

2. **ß → ss**
   - Alle Eszett werden zu Doppel-S konvertiert

3. **Gedankenstriche normalisieren**
   - Bindestriche/Minuszeichen als Gedankenstriche → Em-Dash (—)
   - Mdashes → typografisch korrekte Em-Dashes (—)
   - Erkennt Kontext (Gedankenstrich vs. Bindestrich)

## Verwendung

```
/schweizer-typografie
```

oder natürlichsprachig:
- "Wende Schweizer Typografie an"
- "Konvertiere zu Schweizer Rechtschreibung"
- "Guillemets verwenden"

## Beispiele

**Vorher:**
```
"Das ist ein Test", sagte er. 'Wirklich?'
Er dachte - vielleicht war es richtig.
Die Straße war groß.
```

**Nachher:**
```
«Das ist ein Test», sagte er. ‹Wirklich?›
Er dachte — vielleicht war es richtig.
Die Strasse war gross.
```
