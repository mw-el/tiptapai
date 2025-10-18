# TipTap AI - Frontmatter Parsing

**Status:** ✅ Abgeschlossen
**Erstellt:** 2025-10-18 18:22
**Updated:** 2025-10-18 18:35

---

## Ziel

**Sprint 1.2: Frontmatter-Parsing**

YAML Frontmatter in Markdown-Dateien parsen und schreiben:
- Metadaten extrahieren (lastPosition, lastEdit, bookmarks)
- Metadaten zurückschreiben
- Integration in Load/Save Workflow
- Git-freundliche Persistenz

---

## Implementierungsplan

### Sprint 1.2 Schritte

- [⏳] Dev Document erstellen (diese Datei)
- [ ] frontmatter.js Modul erstellen
- [ ] parseFile() Funktion (YAML → Object)
- [ ] stringifyFile() Funktion (Object → YAML)
- [ ] Integration in loadFile()
- [ ] Integration in saveFile()
- [ ] Metadaten im Editor-State speichern
- [ ] Testen mit Beispiel-Datei

---

## Durchführung

### Schritt 1: frontmatter.js Modul erstellen

**Datei:** renderer/frontmatter.js

**Funktionen:**
- `parseFile(content)` - Extrahiert Frontmatter und Content
- `stringifyFile(metadata, content)` - Kombiniert beides zurück

**Code:**
```javascript
// renderer/frontmatter.js
import yaml from 'js-yaml';

export function parseFile(fileContent) {
  const match = fileContent.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);

  if (!match) {
    // Keine Frontmatter vorhanden
    return {
      metadata: {},
      content: fileContent
    };
  }

  return {
    metadata: yaml.load(match[1]),
    content: match[2].trim()
  };
}

export function stringifyFile(metadata, content) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return content;
  }

  const yamlStr = yaml.dump(metadata);
  return `---\n${yamlStr}---\n\n${content}`;
}
```

---

### Schritt 2: Integration in app.js

**Load:**
```javascript
const result = await window.api.loadFile(filePath);
const { metadata, content } = parseFile(result.content);

// Metadaten speichern für später
currentFileMetadata = metadata;

// Nur Content in Editor laden
const html = markdownToHTML(content);
currentEditor.commands.setContent(html);
```

**Save:**
```javascript
const htmlContent = currentEditor.getHTML();
const markdown = htmlToMarkdown(htmlContent);

// Metadaten updaten
const updatedMetadata = {
  ...currentFileMetadata,
  lastEdit: new Date().toISOString(),
  // später: lastPosition
};

// Frontmatter + Content kombinieren
const fileContent = stringifyFile(updatedMetadata, markdown);
await window.api.saveFile(currentFilePath, fileContent);
```

---

## Acceptance Criteria (Sprint 1.2)

- [ ] Frontmatter wird beim Laden korrekt extrahiert
- [ ] Content wird ohne Frontmatter in Editor geladen
- [ ] Beim Speichern wird Frontmatter wieder hinzugefügt
- [ ] lastEdit wird automatisch gesetzt
- [ ] Dateien ohne Frontmatter funktionieren auch
- [ ] Git-Diff zeigt nur geänderte Metadaten

---

## Beispiel

**Input-Datei:**
```markdown
---
lastEdit: 2025-10-18T16:00:00Z
lastPosition: 1245
bookmarks:
  - pos: 500
    label: "Kapitel 3 Review"
---

# Mein Dokument

Content beginnt hier...
```

**Nach parseFile():**
```javascript
{
  metadata: {
    lastEdit: "2025-10-18T16:00:00Z",
    lastPosition: 1245,
    bookmarks: [...]
  },
  content: "# Mein Dokument\n\nContent beginnt hier..."
}
```

---

## Features in diesem Sprint

### 1. Timestamps beim Speichern
- `lastEdit`: Wird bei jedem Speichern aktualisiert
- ISO 8601 Format: `2025-10-18T18:22:00Z`
- Überschreibt vorhandenen Timestamp automatisch

### 2. "Wo aufgehört"-Feature (Cursor-Position)
**KERNFEATURE für Buchkorrektur!**

- `lastPosition`: Speichert Cursor-Position beim Speichern
- Beim Öffnen: Dialog "Wo du aufgehört hast: Zeile X. Dorthin springen?"
- Perfekt für lange Dokumente (Buchkorrektur)

**Frontmatter-Beispiel:**
```yaml
---
lastEdit: 2025-10-18T18:22:00Z
lastPosition: 1245
---
```

**UI-Flow:**
1. Datei öffnen
2. Frontmatter checken: `lastPosition` vorhanden?
3. Wenn ja: Dialog zeigen mit "Zu Position springen?"
4. Beim Speichern: Aktuelle Cursor-Position speichern

---

## Nächste Schritte

Nach Sprint 1.2:
- Sprint 1.3: Auto-Save (automatisches Speichern nach X Sekunden)
- Sprint 1.4: Cursor-Position-Dialog implementieren

---

**Siehe:** `docs/DEVELOPMENT_PLAN.md` für vollständigen Sprint-Plan
