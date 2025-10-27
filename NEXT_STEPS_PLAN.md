# Plan: LanguageTool Offset-Problem RICHTIG lösen

**Status:** Planning Phase
**Approach:** Kleine Tests → Design → Implementierung

---

## Phase 1: Editor APIs Verstehen

### Was zu testen:
1. Welche APIs hat der TipTap Editor wirklich?
   - `editor.getHTML()` ✓ (wissen wir)
   - `editor.getText()` ✓ (ist kaputt)
   - `editor.getMarkdown()` ? (existiert das?)
   - `editor.storage.markdown` ? (existiert das?)

2. Was liefert htmlToMarkdown() zurück?
   - Ist es korrekt?
   - Verliert es auch Struktur?

### Test-Datei:
- `DEBUG_EDITOR_API.js` wurde erstellt
- Kopieren in Browser-Console und ausführen
- Ergebnisse notieren

### Erwartete Ergebnisse:
```
Szenario A: Ideal
  ✓ editor.getMarkdown() existiert
  → Verwenden wir direkt!
  → Offsets sind 100% korrekt

Szenario B: Nicht ideal
  ✗ editor.getMarkdown() existiert nicht
  → getHTML() → htmlToMarkdown() Weg verwenden
  → Aber müssen htmlToMarkdown() debuggen!

Szenario C: Worst case
  ✗ Beides nicht vorhanden
  → Müssen own Markdown-Generator schreiben
```

---

## Phase 2: htmlToMarkdown() Überprüfung

### Aktueller Code (Zeile ~791):
```javascript
function htmlToMarkdown(html) {
  let markdown = html;

  // Einfache Regex-Replacements
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/g, '# $1\n');
  markdown = markdown.replace(/<h2>(.*?)<\/h2>/g, '## $1\n');
  // ... etc

  return markdown;
}
```

### Test-Plan:
1. Erstelle ein HTML mit **komplexer Struktur**:
   ```html
   <h1>Title</h1>
   <p>Paragraph 1</p>
   <ul>
     <li>Item 1</li>
     <li>Item 2</li>
   </ul>
   <p>Paragraph 2</p>
   ```

2. Laufe `htmlToMarkdown()` drauf
3. Vergleiche mit erwartetes Markdown:
   ```markdown
   # Title
   Paragraph 1
   - Item 1
   - Item 2
   Paragraph 2
   ```

4. **Frage:** Sind die Offsets gleich?
   - Markdown-Position von "Item 1" sollte gleich sein wie Position in HTML-zu-Markdown Result

### Vermutung:
htmlToMarkdown() könnte auch Struktur-Infos verlieren (ähnlich wie getText())!

---

## Phase 3: Konkretes Offset-Beispiel

### Test-Dokument für LanguageTool:
```markdown
# Überschrift

Das ist der erste Absatz mit einem Fehler.

- Punkt 1
- Punkt 2

Das ist der zweite Absatz.
```

### Szenario:
1. Lade dieses in Editor
2. Rufe `getText()` auf → **BEOBACHTE:** Was kommt zurück?
3. Rufe `getHTML()` auf → **BEOBACHTE:** Was kommt zurück?
4. Konvertiere HTML zu Markdown → **BEOBACHTE:** Was kommt zurück?
5. Starte LanguageTool auf allen drei Versionen

### Frage:
Wo findet LanguageTool den Fehler bei jedem?
- getText() Version: Offset X?
- getHTML() → Markdown: Offset Y?
- Original Markdown: Offset Z?

**Sind X, Y, Z gleich oder verschieden?**

---

## Phase 4: Design der Lösung

### Option A: Direkt Markdown verwenden
```javascript
// WENN editor.getMarkdown() existiert:
async function runLanguageToolCheck() {
  const markdown = editor.getMarkdown();  // ← Direkt!
  const matches = await checkText(markdown);

  // Offsets sind direkt in Markdown gültig!
  for (const match of matches) {
    const offset = match.offset;
    const errorPos = markdown.indexOf(match.text, offset);
    // ... weiter
  }
}
```

**Vorteil:** Einfach, direkt, korrekt
**Nachteil:** Funktioniert nur wenn TipTap das anbietet

---

### Option B: HTML → Markdown mit Offset-Tracking
```javascript
// Wenn getMarkdown() nicht existiert:
async function runLanguageToolCheck() {
  const html = editor.getHTML();
  const markdown = htmlToMarkdown(html);

  // WICHTIG: Während Konvertierung Offsets tracken!
  // Nicht nur String-Replacement, sondern
  // "Bei Position X in HTML → Position Y in Markdown"

  const matches = await checkText(markdown);

  // Dann reverse-mapping: Markdown-Offset → HTML-Position
}
```

**Vorteil:** Fallback wenn getMarkdown() nicht da
**Nachteil:** Komplexer, braucht Offset-Mapping

---

### Option C: getText() FIX (aktueller Ansatz - FALSCH!)
```javascript
// Das ist was wir aktuell versuchen - NICHT EMPFOHLEN
const text = editor.getText();  // Struktur weg!
const matches = await checkText(text);
// → Offsets sind falsch!
```

**Vorteil:** Keine
**Nachteil:** Offsets sind immer falsch!

---

## Phase 5: Implementierungs-Schritte

**NUR wenn Phase 1-4 Tests erfolgreich sind!**

### Schritt 1: Neue Funktion getMarkdownSource()
```javascript
function getMarkdownSource() {
  // Implementierung abhängig von Phase 1 Tests
  // Option A: return editor.getMarkdown()
  // Option B: return htmlToMarkdown(editor.getHTML())
}
```

### Schritt 2: runLanguageToolCheck() umschreiben
- Statt getText() → getMarkdownSource() verwenden
- Offsets bleiben korrekt

### Schritt 3: Error-Marking umschreiben
- Offsets sind jetzt in Markdown-Quelle
- Muss Markdown-Offset → Tree-Position konvertieren
- Aber das ist EINFACHER weil Markdown strukturiert!

### Schritt 4: Korrektionen anwenden
- applySuggestion() kann direkt im Markdown arbeiten
- String replacement
- Dann Markdown zurück in Editor laden

### Schritt 5: Testen
- Einfache Dokumente
- Komplexe Dokumente mit Listen
- Nested Strukturen

---

## 📝 Zusammenfassung

**Aktuelles Problem:**
- getText() verliert Struktur
- Offsets werden falsch gemappt
- Error-Marker erscheinen an falschen Stellen

**Deine Lösung:**
- Arbeite mit Markdown-Quelle statt getText()
- Struktur bleibt erhalten
- Offsets bleiben korrekt
- Simple String-Replacement für Korrektionen

**Nächste Konkrete Schritte:**
1. **Du**: Führe `DEBUG_EDITOR_API.js` aus und zeige Ergebnisse
2. **Ich**: Basierend auf Ergebnissen, implementieren wir Phase 2-3 Tests
3. **Zusammen**: Entscheiden welche Option (A, B, oder hybrid)
4. **Ich**: Implementiere die Lösung schrittweise mit kleinen Tests

---

## ❓ Fragen für Dich:

1. Können Sie die `DEBUG_EDITOR_API.js` in der Browser-Console ausführen?
2. Zeigen Sie mir die Ergebnisse?
3. Dann wissen wir genau, welche APIs verfügbar sind!

**Bereit?** 🚀
