# TipTap AI - Development Insights

**Projekt**: Intelligenter Markdown-Editor
**Erstellt**: 2025-10-18

Dieses Dokument sammelt wichtige Erkenntnisse, Lessons Learned und technische Entscheidungen während der Entwicklung.

---

## Planungsphase (2025-10-18)

### Projekt-Setup

#### Entscheidung: Electron vs. Tauri vs. Web-App
**Kontext**: Auswahl der Desktop-App-Plattform

**Optionen**:
1. **Electron**: Etabliert, großes Ökosystem, Chromium + Node.js
2. **Tauri**: Leichtgewichtig, Rust-basiert, kleiner Binary
3. **Web-App + Backend**: Browser-basiert, Node.js Server für File-Ops

**Entscheidung**: Electron

**Begründung**:
- Voller Dateisystem-Zugriff ohne Browser-Sandbox
- Bewährtes Ökosystem für Desktop-Apps
- Einfaches Bundling von LanguageTool möglich
- Native Menüs und Keyboard Shortcuts
- Offline-First Architektur
- Team-Erfahrung mit Electron vorhanden

**Trade-offs**:
- Größerer Binary als Tauri (~100 MB vs ~10 MB)
- Höherer Memory-Verbrauch durch Chromium
- Akzeptiert für Desktop-App dieser Komplexität

---

#### Entscheidung: State Management - Zustand vs. Redux
**Kontext**: Zentrale Zustandsverwaltung für App

**Optionen**:
1. **Zustand**: Leichtgewichtig, minimale API, hook-basiert
2. **Redux Toolkit**: Etabliert, DevTools, größere Community
3. **React Context**: Built-in, aber Performance-Probleme bei häufigen Updates

**Entscheidung**: Zustand

**Begründung**:
- Einfache API, weniger Boilerplate als Redux
- Ausreichend für App-Größe (nicht Millionen LOC)
- Gute TypeScript-Unterstützung
- Performant durch Subscription-basiertes System
- Kleinere Bundle-Size

**Trade-offs**:
- Weniger DevTools-Features als Redux
- Kleinere Community (aber gut dokumentiert)
- Akzeptiert, da App-Komplexität überschaubar

---

#### Entscheidung: File Tree Library - react-complex-tree
**Kontext**: Darstellung der Verzeichnisstruktur

**Optionen**:
1. **react-complex-tree**: Feature-reich, Virtualisierung, Drag&Drop
2. **react-folder-tree**: Einfacher, weniger Features
3. **Custom Implementation**: Volle Kontrolle, mehr Arbeit

**Entscheidung**: react-complex-tree

**Begründung**:
- Virtualisierung out-of-the-box (wichtig für >1000 Dateien)
- Drag&Drop für spätere File-Reorganisation
- Keyboard-Navigation
- MIT-Lizenz
- Aktiv maintained

**Trade-offs**:
- Zusätzliche Dependency (~100 KB)
- Eigene API lernen
- Akzeptiert, da Features > Custom-Aufwand

---

### Architektur-Entscheidungen

#### Insight: Text-Position-Mapping ist komplex
**Problem**: LanguageTool gibt Character-Offsets zurück, TipTap arbeitet mit Node-Positionen

**Herausforderung**:
```
Plain Text:      "Hello **world**"
Markdown Node:   Text("Hello ") → Bold(Text("world"))
Offset 6 in Text → Position ? in ProseMirror Doc
```

**Lösung** (geplant):
- Markdown → Plain Text Konvertierung für LanguageTool
- Offset-Mapping zwischen Plain Text und Editor
- Utility: `offsetMapper.ts` wird benötigt

**Lesson Learned**:
- Frühzeitig Prototyp bauen für Position-Mapping
- Tests mit verschiedenen Markdown-Strukturen (Listen, Code-Blocks, etc.)

---

#### Insight: Debouncing ist kritisch für Performance
**Problem**: Zu viele Requests/Saves können App verlangsamen

**Szenarien**:
1. **Auto-Save**: Bei jedem Tastendruck → SSD-Verschleiß
2. **Proofread**: Bei jedem Tastendruck → API-Spam
3. **Position-Tracking**: Bei jeder Cursor-Bewegung → DB-Spam

**Lösung**:
- Auto-Save: 2 Sekunden Debounce
- Proofread: 3 Sekunden Debounce
- Position-Tracking: 2 Sekunden Debounce + nur bei tatsächlicher Bewegung

**Lesson Learned**:
- Debounce-Delays müssen getestet werden (UX-Balance)
- Zu kurz: Performance-Problem
- Zu lang: Schlechtes UX ("Wo ist meine Änderung?")

---

#### Insight: SQLite für Metadaten ist richtige Wahl
**Kontext**: Speicherung von Lesezeichen, Positionen, Statistiken

**Alternativen**:
1. **JSON-Dateien**: Einfach, aber keine Queries
2. **IndexedDB**: Browser-API, aber komplex
3. **SQLite**: Strukturiert, performant, SQL

**Warum SQLite**:
- Relationale Daten (file_metadata ↔ bookmarks)
- Transaktionen für Konsistenz
- Indizes für schnelle Queries
- Backup/Restore einfach (eine Datei)
- Keine externe Datenbank nötig

**Caveat**:
- Migration-System wird benötigt (Schema-Änderungen)
- better-sqlite3 ist synchron → nicht im Renderer verwenden!
- Alle DB-Ops müssen über IPC im Main Process

---

### UI/UX Insights

#### Insight: "Letzte Position"-Dialog muss nicht-blockierend sein
**Problem**: User will schnell weiterarbeiten, Dialog nervt

**Design-Optionen**:
1. **Modal**: User MUSS wählen (nervig)
2. **Toast mit Buttons**: Non-intrusive, aber buttons schwer zu treffen
3. **StatusBar-Hinweis + Shortcut**: "Drücke F5 für letzte Position"

**Entscheidung** (vorläufig): Toast mit Button + Timeout

**Begründung**:
- User kann ignorieren → Dialog verschwindet nach 5s
- Oder klicken → Sprung zur Position
- Oder ESC drücken → Dialog schließen

**TODO**: User-Testing, ggf. anpassen

---

#### Insight: Fehler-Highlighting muss subtil sein
**Problem**: Zu viele rote Unterstreichungen = overwhelming

**Strategie**:
1. **Fehler-Kategorien visuell unterscheiden**:
   - Rechtschreibung: Rot gewellt
   - Grammatik: Gelb gewellt
   - Stil-Vorschläge: Blau gepunktet (nur bei Hover)
   - Schwere Fehler: Rot solid

2. **"Quiet Mode"**:
   - User kann Rechtschreibprüfung temporär deaktivieren
   - Oder nur schwere Fehler anzeigen

3. **Progressive Enhancement**:
   - Zuerst nur Rechtschreibung
   - Grammatik bei manuellem Trigger
   - KI-Prüfungen nur auf Anfrage

**Lesson Learned**:
- Weniger ist mehr bei Visual Feedback
- User-Kontrolle > Automatik

---

## Offene Fragen (zu klären während Entwicklung)

### Frage 1: File Watching - Externe Änderungen erkennen?
**Kontext**: Was passiert, wenn Datei extern (z.B. Git) geändert wird?

**Optionen**:
1. File Watcher (chokidar) → Dialog "Datei wurde geändert, neu laden?"
2. Ignorieren → User verliert externe Änderungen
3. Auto-Merge (komplex, fehleranfällig)

**Status**: Offen
**Entscheidung**: Nach MVP, erst mal ignorieren

---

### Frage 2: Multi-Tab vs. Single-File?
**Kontext**: Sollen mehrere Dateien gleichzeitig offen sein?

**Optionen**:
1. Single-File: Einfacher, fokussiert
2. Multi-Tab: Flexibler, aber komplexer State

**Status**: Offen
**Vorläufige Entscheidung**: Single-File für MVP, Multi-Tab in Phase 3

---

### Frage 3: Export-Optionen - Pandoc verwenden?
**Kontext**: Markdown → PDF/DOCX/EPUB Export

**Optionen**:
1. Pandoc: Mächtig, aber externe Dependency
2. JavaScript-Libraries: Eingebaut, aber limitiert
3. Cloud-Service: Einfach, aber Privacy-Problem

**Status**: Offen, erst in Phase 4 relevant

---

## Technische Notizen

### Node-Position vs. Character-Offset
**Problem**: TipTap/ProseMirror verwendet Node-basierte Positionen, LanguageTool verwendet Character-Offsets.

**Beispiel**:
```markdown
# Heading
Hello world

ProseMirror Struktur:
- Node 0: Heading (Inhalt: "Heading")
- Node 1: Paragraph (Inhalt: "Hello world")

Position in PM: Node-basiert (0 = vor Heading, 1 = in Heading, etc.)
Offset in Plain: Character-basiert (0 = 'H', 10 = 'H' von Hello)
```

**Lösung-Ansatz**:
```typescript
function offsetToPosition(editor: Editor, offset: number): number {
  // Plain Text aus Editor extrahieren
  const plainText = editor.getText()

  // Mapping Plain-Offset → ProseMirror-Position
  // (komplex, da Formatierung berücksichtigt werden muss)
}
```

**Status**: Muss in Sprint 2.2 implementiert werden

---

### LanguageTool Caching
**Problem**: Wiederholte Prüfung desselben Texts = unnötige API-Calls

**Lösung**:
```typescript
class LanguageToolService {
  private cache = new Map<string, LanguageError[]>()

  async check(text: string): Promise<LanguageError[]> {
    const hash = this.hash(text)
    if (this.cache.has(hash)) {
      return this.cache.get(hash)!
    }

    const errors = await this.apiCheck(text)
    this.cache.set(hash, errors)
    return errors
  }

  private hash(text: string): string {
    // Simple hash, z.B. MD5 oder Text selbst (für kurze Texte)
  }
}
```

**Caveat**: Cache muss gelöscht werden bei:
- Sprache wechselt
- LanguageTool-Settings ändern
- App-Neustart (optional)

---

### Performance-Monitoring
**Ansatz**: Eingebautes Profiling für kritische Pfade

```typescript
function measure(label: string, fn: () => void) {
  const start = performance.now()
  fn()
  const duration = performance.now() - start
  if (duration > 100) {
    log.warn(`Slow operation: ${label} took ${duration}ms`)
  }
}

// Verwendung
measure('File Tree Rendering', () => {
  renderFileTree(nodes)
})
```

**Ziel**: Performance-Budgets einhalten (siehe GUIDELINES.md)

---

## Fehlerhafte Ansätze (vermeiden!)

### ❌ Marks nur im Viewport setzen
**Versuch**: Performance-Optimierung durch Viewport-basierte Marks

**Problem**: TipTap's Document-Model erfordert globale Marks. Partielle Marks führen zu inkonsistentem State.

**Alternative**: Marks nur für erste 10000 Zeichen setzen, Rest bei Scroll nachladen

**Status**: Nicht weiter verfolgt

---

### ❌ Markdown-Parsing selbst implementieren
**Versuch**: Custom Markdown-Parser für bessere Kontrolle

**Problem**: Markdown ist komplexer als gedacht (Spec-Varianten, Edge Cases)

**Alternative**: TipTap's Markdown-Extension verwenden (basiert auf remark)

**Status**: Nicht weiter verfolgt

---

## Best Practices (entdeckt während Entwicklung)

### Testen von Electron IPC
```typescript
// ✅ IPC-Handler testen durch Mock
describe('File System IPC', () => {
  it('should load file', async () => {
    const mockFile = '/test.md'
    const mockContent = '# Test'

    fs.promises.readFile = vi.fn().resolvedValue(mockContent)

    const result = await ipcHandler.loadFile(mockFile)

    expect(result.success).toBe(true)
    expect(result.content).toBe(mockContent)
  })
})
```

---

### TipTap Editor initialisierung
```typescript
// ✅ Editor sollte in useEffect initialisiert werden
function Editor() {
  const editor = useEditor({
    extensions: [...],
    content: initialContent,
  })

  // ❌ NICHT direkt in Component body
  // const editor = new Editor(...) // Führt zu Re-Renders!

  return <EditorContent editor={editor} />
}
```

---

## Zukünftige Erweiterungen (Ideen)

### Plugin-System
**Vision**: User können eigene TipTap-Extensions laden

**Konzept**:
```typescript
// plugins/my-extension.js
export default {
  name: 'MyExtension',
  extension: Mark.create({
    name: 'highlight',
    // ...
  })
}

// App lädt Plugins aus plugins/ Verzeichnis
```

**Herausforderung**: Security (Code Execution), Sandboxing

**Status**: Phase 4, optional

---

### Cloud-Sync (optional)
**Vision**: Markdown-Dateien über Geräte synchronisieren

**Optionen**:
1. Git-basiert (automatischer Commit/Push)
2. Custom Cloud (Firebase, Supabase)
3. WebDAV/NextCloud-Integration

**Herausforderung**: Merge-Konflikte, Privacy

**Status**: Nach Version 1.0, wenn Bedarf besteht

---

### Voice-to-Text
**Vision**: Diktier-Modus für Autoren

**Technologie**: Web Speech API oder Whisper (lokal)

**Status**: Nice-to-have, niedrige Priorität

---

## Maintenance-Notizen

### Dependencies-Update-Strategie
- Major Updates: Manuell prüfen, Breaking Changes dokumentieren
- Minor/Patch: Monatlich automatisch (Dependabot)
- Security-Updates: Sofort

### Backup-Strategie für User
- Empfehlung: Git-Repository für Markdown-Dateien
- Export-Funktion: Alle Metadaten als JSON
- Import-Funktion: Wiederherstellen von Backups

---

## Nächstes Update

Dieses Dokument wird fortlaufend aktualisiert während der Entwicklung. Nächste Einträge nach:
- Sprint 1 (File Tree + Editor Implementation)
- Sprint 2 (LanguageTool Integration)
- Sprint 3 (Bookmarks Implementation)

---

**Letztes Update**: 2025-10-18 (Planungsphase)
