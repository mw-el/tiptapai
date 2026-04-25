# TipTap AI - LanguageTool Annotation System Migration

**Status:** ⏳ Planning
**Created:** 2025-10-29 17:30
**Ziel:** Umstellung von Plain-Text auf LanguageTool Annotation System

---

## Problem-Analyse

### Aktuelle Implementierung (Plain Text)
```javascript
// Problem: Plain Text → Offsets passen nicht auf ProseMirror-Struktur
const text = editor.getText();  // "Ein Satz. Ein Zitat. Noch ein Satz."
const matches = await checkText(text);
// ❌ Offsets beziehen sich auf Plain Text, nicht auf Doc-Struktur
// ❌ Blockquotes, Listen verschieben Offsets
// ❌ Manuelle Konvertierung mit resolveRawOffsetToTreePos() fehleranfällig
```

### Neue Implementierung (Annotation System)
```javascript
// Lösung: Annotation mit Markup → Offsets korrekt für Struktur
const annotation = proseMirrorToAnnotation(editor.state.doc);
// [{text: "Ein Satz. "}, {markup: "<blockquote>"}, {text: "Ein Zitat."}, {markup: "</blockquote>"}, ...]
const matches = await checkTextWithAnnotation(annotation);
// ✅ Offsets beziehen sich auf komplettes Annotation (inkl. Markup)
// ✅ Keine manuelle Konvertierung nötig
// ✅ Funktioniert automatisch für alle Node-Typen
```

---

## Implementierungs-Plan

### Phase 1: Neue Annotation-API (Separate Datei) ✅ Separation of Concerns

**Datei:** `renderer/languagetool-annotation.js`

**Funktionen:**
1. `proseMirrorToAnnotation(doc)` - Converter
2. `checkTextWithAnnotation(annotation, language)` - API Call
3. `matchOffsetToDocPos(match, annotation, doc)` - Position Mapping

**Vorteile:**
- Keine Änderung an bestehendem Code
- Alte Implementierung bleibt als Fallback
- Schrittweise Migration möglich
- Einfaches Rollback

### Phase 2: Integration in checkParagraphsProgressively

**Strategie:**
1. Feature-Flag: `USE_ANNOTATION_SYSTEM = true`
2. If-Else: `if (USE_ANNOTATION_SYSTEM) { ... } else { ... }`
3. Tests durchführen
4. Wenn stabil: Old Code entfernen

### Phase 3: Cleanup

**Entfernen:**
- `resolveRawOffsetToTreePos()` (~50 Zeilen)
- Alle Offset-Korrekturen (~100 Zeilen)
- Blockquote/Listen-Workarounds (~50 Zeilen)
- **Gesamt: ~200 Zeilen weniger Code**

---

## Technische Details

### Annotation Format (LanguageTool-API)

```json
{
  "annotation": [
    {"text": "Ein normaler Satz. "},
    {"markup": "<blockquote>"},
    {"text": "Ein Zitat mit fehler."},
    {"markup": "</blockquote>"},
    {"text": " Noch ein Satz."}
  ]
}
```

### ProseMirror → Annotation Converter

**Herausforderungen:**
1. **Nested Nodes:** ProseMirror hat verschachtelte Nodes (paragraph → text nodes)
2. **Text Nodes:** Nur `textContent` extrahieren, nicht die Node-Wrapper
3. **Marks:** Formatierungen (bold, italic) müssen **ignoriert** werden (nur strukturelle Nodes)

**Ansatz:**
```javascript
function proseMirrorToAnnotation(doc) {
  const annotation = [];
  let textBuffer = '';

  doc.descendants((node, pos) => {
    // Text Node: Nur Text sammeln
    if (node.isText) {
      textBuffer += node.text;
      return false; // Nicht tiefer traversieren
    }

    // Block Node: Markup hinzufügen
    if (node.isBlock) {
      // Flush text buffer
      if (textBuffer) {
        annotation.push({text: textBuffer});
        textBuffer = '';
      }

      // Opening tag
      annotation.push({markup: `<${node.type.name}>`});

      // Closing tag wird später hinzugefügt (nach Kindern)
      // ...
    }
  });

  // Flush remaining text
  if (textBuffer) {
    annotation.push({text: textBuffer});
  }

  return annotation;
}
```

**Problem:** `descendants()` gibt keine Close-Tags!

**Lösung:** Eigene Rekursion mit Stack:
```javascript
function proseMirrorToAnnotation(doc) {
  const annotation = [];

  function traverse(node) {
    // Opening tag
    if (node.isBlock) {
      annotation.push({markup: `<${node.type.name}>`});
    }

    // Text content
    if (node.isText) {
      annotation.push({text: node.text});
    } else if (node.content) {
      node.content.forEach(child => traverse(child));
    }

    // Closing tag
    if (node.isBlock) {
      annotation.push({markup: `</${node.type.name}>`});
    }
  }

  traverse(doc);
  return annotation;
}
```

### API Call mit 'data' Parameter

**LanguageTool HTTP API:**
```javascript
const response = await fetch(LANGUAGETOOL_API, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    data: JSON.stringify({annotation}),  // ← Statt 'text' Parameter
    language: 'de-CH',
    enabledOnly: 'false',
  }),
});
```

**Response:**
```json
{
  "matches": [
    {
      "offset": 45,  // ← Offset bezieht sich auf GESAMTE Annotation (Text+Markup)
      "length": 6,
      "message": "...",
      "replacements": [...]
    }
  ]
}
```

### Offset Mapping (Annotation → ProseMirror Position)

**Problem:** LanguageTool gibt Offset in Annotation zurück (inkl. Markup).
Wir brauchen: ProseMirror-Position im Doc.

**Lösung:**
```javascript
function matchOffsetToDocPos(match, annotation, doc) {
  let annotationOffset = 0;
  let docPos = 1; // ProseMirror startet bei 1

  for (const item of annotation) {
    if (item.text) {
      const textLength = item.text.length;

      // Match liegt in diesem Text-Segment?
      if (match.offset >= annotationOffset && match.offset < annotationOffset + textLength) {
        const relativeOffset = match.offset - annotationOffset;
        return docPos + relativeOffset;
      }

      annotationOffset += textLength;
      docPos += textLength;
    } else if (item.markup) {
      // Markup-Länge zur Annotation hinzufügen (für Offset-Tracking)
      annotationOffset += item.markup.length;

      // Aber NICHT zu docPos (Markup ist nicht im Doc)
      // Stattdessen: docPos += Länge des entsprechenden Nodes
      // → Kompliziert! Brauchen wir Node-Mapping
    }
  }

  return null; // Not found
}
```

**ACHTUNG:** Das ist immer noch kompliziert!

**Alternative:** Annotation ohne Markup-Tags erstellen?
```javascript
// Statt: {markup: "<blockquote>"}
// Nutze: {markup: "\n\n"}  // LanguageTool interpretiert als Whitespace
```

**Vorteil:**
- Annotation-Offsets = Doc-Offsets (fast)
- Einfacheres Mapping

**Nachteil:**
- Verlieren strukturelle Information
- Immer noch Offset-Shift durch Node-Boundaries

---

## Alternative: Simplified Annotation

**Idee:** Nutze Markup nur für "Interpretiere als Whitespace":

```javascript
function proseMirrorToSimplifiedAnnotation(doc) {
  const annotation = [];
  let currentText = '';

  doc.descendants((node, pos) => {
    if (node.isText) {
      currentText += node.text;
    } else if (node.isBlock && currentText) {
      // Flush text
      annotation.push({text: currentText});
      currentText = '';

      // Block-Boundary als Whitespace
      annotation.push({markup: '\n\n', interpretAs: '\n\n'});
    }
  });

  if (currentText) {
    annotation.push({text: currentText});
  }

  return annotation;
}
```

**Vorteil:**
- Annotation-Offsets ≈ Plain-Text-Offsets
- Aber: LanguageTool weiß über Struktur Bescheid
- Bessere Fehler-Erkennung (Kontext-basiert)

**Test:** Muss evaluiert werden, ob das ausreicht.

---

## Migration Strategy

### Option A: Full Annotation (strukturell korrekt)
✅ **Pro:** LanguageTool sieht komplette Struktur
❌ **Con:** Komplexes Offset-Mapping nötig

### Option B: Simplified Annotation (Whitespace-basiert)
✅ **Pro:** Einfaches Offset-Mapping
✅ **Pro:** Immer noch besser als Plain Text
⚠️ **Con:** Weniger strukturelle Information

**Empfehlung:** **Option B zuerst testen!**

Wenn Offset-Probleme bleiben: Option A implementieren.

---

## Implementierungs-Schritte

### Step 1: `languagetool-annotation.js` erstellen ✅
- [ ] `proseMirrorToSimplifiedAnnotation(doc)` implementieren
- [ ] `checkTextWithAnnotation(annotation, language)` implementieren
- [ ] `annotationOffsetToDocPos(offset, annotation, doc)` implementieren
- [ ] Unit Tests (manuell, in Console)

### Step 2: Integration in `app.js`
- [ ] Feature-Flag: `USE_ANNOTATION_SYSTEM = true`
- [ ] If-Else in `checkParagraphsProgressively()`
- [ ] Funktionstest: Blockquotes, Listen
- [ ] Vergleich: Old vs. New (Offsets korrekt?)

### Step 3: Bugfixes
- [ ] Multi-Paragraph-Selektion fixen
- [ ] Graue Markierungen entfernen beim Re-Check
- [ ] Modal-Positionierung am Bildschirmrand

### Step 4: Cleanup (wenn stabil)
- [ ] `resolveRawOffsetToTreePos()` entfernen
- [ ] Alte Offset-Korrekturen entfernen
- [ ] Code-Review + Commit

---

## Risiken & Mitigation

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Offsets immer noch falsch | Mittel | Hoch | Fallback auf Old Code (Feature-Flag) |
| Performance-Regression | Niedrig | Mittel | Annotation ist schneller (weniger Konvertierung) |
| API-Kompatibilität | Niedrig | Hoch | Testen mit LanguageTool 6.6 |
| Breaking Changes | Niedrig | Niedrig | Separate Datei + Feature-Flag |

---

## Testing-Plan

### Test Cases
1. **Einfacher Text:** "Das ist ein fehler."
   - ✅ Offset korrekt?
   - ✅ Ersetzung funktioniert?

2. **Mit Blockquote:**
   ```markdown
   Ein Satz.

   > Ein Zitat mit fehler.

   Noch ein Satz.
   ```
   - ✅ Offset im Blockquote korrekt?
   - ✅ Ersetzung funktioniert?

3. **Mit Liste:**
   ```markdown
   - Punkt eins
   - Punkt zwei mit fehler
   - Punkt drei
   ```
   - ✅ Offset im zweiten Listenpunkt korrekt?

4. **Multi-Paragraph-Selektion:**
   - Selektiere 5 Paragraphen
   - Klick "Absatz prüfen"
   - ✅ ALLE 5 werden geprüft?

5. **Re-Check (graue Markierungen):**
   - Paragraph prüfen → Fehler angezeigt
   - Fehler korrigieren
   - Paragraph erneut prüfen
   - ✅ Alte Markierung verschwindet?

6. **Modal am Bildschirmrand:**
   - Fehler am Ende des Dokuments
   - ✅ Modal vollständig sichtbar?

---

## Code-Größe Vergleich

**Vorher:**
- `languagetool.js`: 180 Zeilen
- `app.js`: ~1500 Zeilen (mit Offset-Workarounds)

**Nachher:**
- `languagetool-annotation.js`: ~150 Zeilen (neue Implementierung)
- `app.js`: ~1300 Zeilen (ohne Offset-Workarounds)
- **Gesamt: -230 Zeilen**

---

## Zeitplan

| Phase | Dauer | Status |
|-------|-------|--------|
| Planning | 30 min | ✅ Done |
| Implementation Step 1 | 1-2h | ⏳ Next |
| Integration Step 2 | 1h | ⏳ Pending |
| Testing | 1-2h | ⏳ Pending |
| Bugfixes Step 3 | 1h | ⏳ Pending |
| Cleanup Step 4 | 30min | ⏳ Pending |
| **Total** | **4-6h** | |

---

## Referenzen

- LanguageTool API Docs: https://languagetool.org/http-api/
- AnnotatedText Javadoc: https://languagetool.org/development/api/org/languagetool/markup/AnnotatedTextBuilder.html
- ProseMirror Document Model: https://prosemirror.net/docs/guide/#doc
- Existing Analysis: `docs/OFFSET_BUG_ANALYSIS.md`
- Alternative Approach: `docs/ALTERNATIVE_APPROACH_HTML.md`

---

**Next Steps:**
1. Create `renderer/languagetool-annotation.js`
2. Implement `proseMirrorToSimplifiedAnnotation()`
3. Test with simple examples in Browser Console

---

**Version:** 1.0
**Last Updated:** 2025-10-29 17:30
