# TipTap AI - Development Guidelines

**Projekt**: Intelligenter Markdown-Editor
**Erstellt**: 2025-10-18

---

## Allgemeine Prinzipien

### 1. Separation of Concerns
- Jede Komponente/Modul hat eine klare, fokussierte Verantwortlichkeit
- UI-Logik getrennt von Business-Logik
- Services sind unabhängig von UI-Komponenten
- State Management zentralisiert in Zustand Stores

**Beispiel**:
```typescript
// ❌ Schlecht: Editor kennt File System Details
function Editor() {
  const saveFile = () => {
    fs.writeFileSync('/path/to/file', content)
  }
}

// ✅ Gut: Editor nutzt abstrakten Service
function Editor() {
  const { saveFile } = useFileSystem()
  const handleSave = () => saveFile(currentPath, content)
}
```

### 2. Fail Fast
- Fehler sofort werfen, nicht verstecken
- Keine stillen Fallbacks ohne explizite Autorisierung
- Validierung am Eingang (Input Validation)
- Klare Fehlermeldungen

**Beispiel**:
```typescript
// ❌ Schlecht: Fehler verschleiern
async function loadFile(path: string) {
  try {
    return await fs.readFile(path)
  } catch {
    return '' // Stiller Fehler!
  }
}

// ✅ Gut: Fehler transparent machen
async function loadFile(path: string) {
  if (!path) {
    throw new Error('File path is required')
  }
  if (!path.endsWith('.md')) {
    throw new Error('Only .md files are supported')
  }
  return await fs.readFile(path) // Error propagiert
}
```

### 3. Minimale Code-Änderungen
- Pro Task nur die notwendigen Änderungen
- Kein "While we're here"-Refactoring ohne Grund
- Fokus auf das aktuelle Problem
- Separate Commits für separate Concerns

### 4. Code-Qualität vor Schnelligkeit
- Lesbarer Code > Cleverer Code
- Typensicherheit nutzen (TypeScript strict mode)
- Konsistente Namenskonventionen
- Self-documenting Code bevorzugen

---

## TypeScript Guidelines

### Strict Mode aktivieren
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Type Definitions
```typescript
// ✅ Explizite Interfaces
interface FileTreeNode {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
}

// ✅ Return Types explizit
function loadFile(path: string): Promise<string> {
  // ...
}

// ❌ Vermeiden
function loadFile(path) {
  // ...
}
```

### Null Safety
```typescript
// ✅ Explizite Null-Checks
function processFile(file: string | null) {
  if (!file) {
    throw new Error('File is required')
  }
  // file ist jetzt definitiv string
}

// ✅ Optional Chaining
const lastPosition = metadata?.lastEditPosition ?? 0

// ❌ Unsichere Annahmen
function processFile(file) {
  // Annahme: file existiert immer (gefährlich!)
  return file.content
}
```

---

## React/Component Guidelines

### Functional Components
```typescript
// ✅ Typed Props
interface EditorProps {
  initialContent: string
  onUpdate: (content: string) => void
  readOnly?: boolean
}

export function Editor({ initialContent, onUpdate, readOnly = false }: EditorProps) {
  // ...
}
```

### Hooks Best Practices
```typescript
// ✅ Custom Hooks für Logik-Wiederverwendung
function useAutoSave(content: string, filePath: string) {
  useEffect(() => {
    const timer = setTimeout(() => {
      saveFile(filePath, content)
    }, 2000)
    return () => clearTimeout(timer)
  }, [content, filePath])
}

// ✅ Dependencies vollständig
useEffect(() => {
  loadFile(currentPath)
}, [currentPath]) // Explizite Dependency

// ❌ Fehlende Dependencies
useEffect(() => {
  loadFile(currentPath)
}, []) // currentPath fehlt!
```

### State Management
```typescript
// ✅ Zustand Store
interface FileStore {
  currentFile: string | null
  content: string
  isDirty: boolean

  setCurrentFile: (path: string) => void
  setContent: (content: string) => void
}

const useFileStore = create<FileStore>((set) => ({
  currentFile: null,
  content: '',
  isDirty: false,

  setCurrentFile: (path) => set({ currentFile: path }),
  setContent: (content) => set({ content, isDirty: true }),
}))

// ✅ Verwendung
function Editor() {
  const { content, setContent } = useFileStore()
  // ...
}
```

---

## Error Handling

### Async Error Handling
```typescript
// ✅ Try-Catch mit spezifischen Errors
async function loadFile(path: string): Promise<FileResult> {
  try {
    const content = await fs.readFile(path, 'utf-8')
    return { success: true, content }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: false, error: 'File not found' }
    }
    if (error.code === 'EACCES') {
      return { success: false, error: 'Permission denied' }
    }
    return { success: false, error: 'Unknown error' }
  }
}
```

### Error Boundaries
```typescript
// ✅ React Error Boundary für UI
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('React Error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />
    }
    return this.props.children
  }
}
```

### User-Facing Errors
```typescript
// ✅ Benutzerfreundliche Fehlermeldungen
function showError(error: Error) {
  const userMessage = {
    'ENOENT': 'Datei konnte nicht gefunden werden.',
    'EACCES': 'Keine Berechtigung zum Zugriff auf die Datei.',
    'NETWORK_ERROR': 'Keine Verbindung zum LanguageTool-Server.',
  }[error.code] || 'Ein unbekannter Fehler ist aufgetreten.'

  toast.error(userMessage)
  log.error('Technical error:', error) // Für Debugging
}
```

---

## Performance Guidelines

### Debouncing & Throttling
```typescript
// ✅ Debounce für Textänderungen
const debouncedSave = debounce((content: string) => {
  saveFile(currentPath, content)
}, 2000)

// ✅ Throttle für Scroll-Events
const throttledScroll = throttle((position: number) => {
  updateScrollPosition(position)
}, 100)
```

### Memoization
```typescript
// ✅ useMemo für teure Berechnungen
const sortedFiles = useMemo(() => {
  return files.sort((a, b) => a.name.localeCompare(b.name))
}, [files])

// ✅ useCallback für Callbacks
const handleFileSelect = useCallback((path: string) => {
  loadFile(path)
}, [loadFile])
```

### Lazy Loading
```typescript
// ✅ Code-Splitting für Phase 2 Features
const PromptLibrary = lazy(() => import('./components/PromptLibrary'))

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <PromptLibrary />
    </Suspense>
  )
}
```

---

## Testing Guidelines

### Unit Tests
```typescript
// ✅ Test für Service-Logik
describe('LanguageToolService', () => {
  it('should detect spelling errors', async () => {
    const service = new LanguageToolService()
    const errors = await service.check('Tihs is a tesst')

    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain('Tihs')
    expect(errors[1].message).toContain('tesst')
  })

  it('should handle server errors gracefully', async () => {
    const service = new LanguageToolService('http://invalid-url')

    await expect(service.check('text')).rejects.toThrow()
  })
})
```

### Component Tests
```typescript
// ✅ Test für React Component
import { render, fireEvent } from '@testing-library/react'

describe('FileTree', () => {
  it('should call onFileSelect when file is clicked', () => {
    const onFileSelect = vi.fn()
    const { getByText } = render(
      <FileTree
        rootPath="/test"
        onFileSelect={onFileSelect}
        currentFile={null}
      />
    )

    fireEvent.click(getByText('test.md'))
    expect(onFileSelect).toHaveBeenCalledWith('/test/test.md')
  })
})
```

---

## Git Workflow

### Commit Messages
```
Format: <type>: <subject>

Types:
- feat: Neue Funktionalität
- fix: Bugfix
- refactor: Code-Refactoring (keine Funktionsänderung)
- docs: Dokumentation
- test: Tests hinzufügen/ändern
- chore: Build/Dependencies

Beispiele:
✅ feat: implement file tree component
✅ fix: prevent auto-save during file switch
✅ refactor: extract database logic to service
✅ docs: update architecture diagram
```

### Branch-Strategie
```
main          → Stabile Releases
develop       → Aktive Entwicklung
feature/*     → Feature-Branches
bugfix/*      → Bugfix-Branches

Beispiel:
feature/file-tree
feature/languagetool-integration
bugfix/autosave-race-condition
```

### Commits
- Kleine, atomare Commits
- Ein Commit = Eine logische Änderung
- Commits kompilieren und Tests laufen durch
- Keine "WIP" Commits im main/develop

---

## Code-Review Checklist

### Before Opening PR
- [ ] Code kompiliert ohne Fehler
- [ ] Tests laufen durch
- [ ] TypeScript strict mode erfüllt
- [ ] Keine console.logs (außer debug-zwecke mit log.debug)
- [ ] Dokumentation aktualisiert (falls API-Änderung)

### Review Focus
- [ ] **Logik**: Macht der Code was er soll?
- [ ] **Fehlerbehandlung**: Sind Edge Cases abgedeckt?
- [ ] **Performance**: Keine offensichtlichen Bottlenecks?
- [ ] **Security**: Keine Sicherheitslücken? (Path Traversal, XSS, etc.)
- [ ] **Lesbarkeit**: Ist der Code verständlich?
- [ ] **Tests**: Sind kritische Pfade getestet?

---

## Sicherheit

### Input Validation
```typescript
// ✅ Pfad-Validierung
function validateFilePath(path: string): void {
  if (!path) throw new Error('Path required')
  if (path.includes('..')) throw new Error('Path traversal not allowed')
  if (!path.match(/^[a-zA-Z0-9/_\-\.]+$/)) {
    throw new Error('Invalid characters in path')
  }
}
```

### API Keys
```typescript
// ✅ API Keys aus Environment oder Keychain
const apiKey = process.env.OPENAI_API_KEY || await keychain.getPassword('openai')

// ❌ NIEMALS im Code
const apiKey = 'sk-...' // NIEMALS!
```

### Electron Security
```typescript
// ✅ Context Isolation aktivieren
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: path.join(__dirname, 'preload.js')
  }
})

// ✅ IPC Whitelist
const allowedChannels = ['loadFile', 'saveFile', 'loadFileTree']

contextBridge.exposeInMainWorld('electronAPI', {
  loadFile: (path: string) => {
    // Validierung!
    return ipcRenderer.invoke('loadFile', path)
  }
})
```

---

## Dokumentation

### Code-Dokumentation
```typescript
// ✅ JSDoc für komplexe Funktionen
/**
 * Ersetzt Text an der angegebenen Position im Editor.
 *
 * @param editor - TipTap Editor Instanz
 * @param offset - Character-Offset (nicht Node-Position!)
 * @param length - Länge des zu ersetzenden Texts
 * @param replacement - Neuer Text
 * @throws {Error} Wenn Editor nicht initialisiert ist
 */
function replaceTextAtOffset(
  editor: Editor,
  offset: number,
  length: number,
  replacement: string
): void {
  if (!editor) throw new Error('Editor not initialized')
  // ...
}
```

### README/Docs aktualisieren
- Bei neuen Features: DEVELOPMENT_PLAN.md aktualisieren
- Bei Architektur-Änderungen: ARCHITECTURE.md aktualisieren
- Bei wichtigen Erkenntnissen: INSIGHTS.md ergänzen

---

## Dependency Management

### Dependencies hinzufügen
```bash
# Nur notwendige Dependencies
npm install --save exact-package-name

# Dev-Dependencies
npm install --save-dev @types/package-name
```

### Abhängigkeiten minimieren
- Keine "Swiss-Army-Knife" Libraries (z.B. lodash komplett)
- Bevorzuge spezifische, fokussierte Packages
- Prüfe Bundle-Size (z.B. mit bundlephobia.com)

### Versioning
```json
// ✅ Exakte Versionen für kritische Dependencies
{
  "dependencies": {
    "@tiptap/core": "3.0.0",
    "better-sqlite3": "9.2.0"
  }
}

// ❌ Wildcards vermeiden
{
  "dependencies": {
    "@tiptap/core": "^3.0.0" // Kann breaking changes einführen
  }
}
```

---

## Environment Setup

### System-Anforderungen
- Node.js >= 18
- npm >= 9
- Git
- Docker (für LanguageTool)
- Miniconda (falls Python-Tools benötigt)

### Lokale Entwicklung
```bash
# Setup
git clone <repo>
cd intelligent-markdown-editor
npm install

# Development
npm run dev

# LanguageTool starten
cd docker
docker-compose up -d

# Tests
npm test
npm run test:watch

# Build
npm run build
```

---

## Debugging

### Logging
```typescript
import log from 'electron-log'

// ✅ Strukturiertes Logging
log.info('File loaded', { path: filePath, size: content.length })
log.warn('Auto-save skipped', { reason: 'File not dirty' })
log.error('Failed to load file', { path: filePath, error: error.message })

// Log Levels:
// error > warn > info > verbose > debug > silly
```

### Chrome DevTools
```typescript
// Main Process Debugging
electron --inspect=5858 .

// Renderer Process
// Rechtsklick → "Inspect Element"
```

### React DevTools
```bash
npm install --save-dev react-devtools
```

---

## Fehlgeschlagene Experimente

Wenn ein Ansatz nicht funktioniert:
1. **Code entfernen**: Kein auskommentierter "Dead Code"
2. **Docs aufräumen**: Keine veralteten Beschreibungen
3. **Caveat dokumentieren**: In README.md notieren, was NICHT funktioniert

**Beispiel**:
```markdown
## Known Issues

### Virtualisierung für Editor-Marks
**Versuch**: Nur Marks im Viewport setzen für bessere Performance.
**Problem**: TipTap's Document-Model erfordert globale Marks.
**Status**: Nicht implementiert.
**Alternative**: Marks nur für erste 10000 Zeichen setzen.
```

---

## Performance Budgets

### Bundle Size
- Main Bundle: < 5 MB
- Lazy-Loaded Chunks: < 500 KB each

### Runtime Performance
- File Tree Rendering: < 100ms (1000 Dateien)
- Editor Initial Load: < 500ms
- Auto-Save Latency: < 100ms
- Proofread Request: < 2s (für 10k Zeichen)

### Memory
- Idle: < 200 MB
- Mit großem Dokument (100k Zeichen): < 500 MB

---

## Nächste Schritte beim Entwickeln

1. **Task verstehen**: Was soll implementiert werden?
2. **Plan machen**: Welche Komponenten/Services sind betroffen?
3. **Test überlegen**: Wie wird man wissen, dass es funktioniert?
4. **Implementieren**: Fokussiert, minimal, sauber
5. **Testen**: Manuell + automatisiert
6. **Dokumentieren**: DEVELOPMENT_PLAN.md + INSIGHTS.md aktualisieren
7. **Commit**: Atomare, beschreibende Commit-Message

---

## Kontakt & Hilfe

Bei Fragen oder Unklarheiten:
1. README.md lesen
2. docs/ Verzeichnis durchsuchen
3. Issue erstellen mit Label "question"

---

## Checkliste für neue Features

- [ ] Feature in DEVELOPMENT_PLAN.md dokumentiert
- [ ] TypeScript Interfaces definiert
- [ ] Implementation abgeschlossen
- [ ] Tests geschrieben (mindestens Happy Path)
- [ ] Error Handling implementiert
- [ ] Performance geprüft (keine offensichtlichen Bottlenecks)
- [ ] Security geprüft (Input Validation, etc.)
- [ ] Dokumentation aktualisiert
- [ ] Commit mit sinnvoller Message
- [ ] Manuell getestet in Dev-Environment

---

Diese Guidelines sind ein lebendiges Dokument und werden bei Bedarf aktualisiert.
