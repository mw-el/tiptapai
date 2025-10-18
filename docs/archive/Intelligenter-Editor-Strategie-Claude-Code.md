# 🚀 Intelligenter Markdown-Editor: Vollständige Projekt-Strategie

## 📋 Executive Summary

**Projektziel**: Entwicklung eines vollwertigen Markdown-Notiz-Managers für Autoren mit:
- **Datei-Management**: File-Explorer, Verzeichnisbaum, Multi-Dokument-Verwaltung
- **WYSIWYG-Editor**: TipTap-basiert mit Markdown-Unterstützung
- **Phase 1**: LanguageTool-Integration (Rechtschreibung/Grammatik)
- **Phase 2**: KI-gestützte Stil-, Konsistenz- und Content-Prüfungen
- **Workflow-Features**: Lesezeichen, Überarbeitungs-Tracking, Prompt-Bibliothek

**Vergleichbare Produkte**: Obsidian + Grammarly + Custom AI Features

**Technologie-Stack**:
- Frontend: TipTap (Editor), React/Vue, File-Tree-Component
- Backend: LanguageTool (Phase 1), Node.js/Electron für File-System
- Speicherung: Lokale Markdown-Dateien + SQLite für Metadaten
- Architektur: Plugin-basiert, modular erweiterbar

---

## 🎯 Vollständige Projekt-Vision

### Kern-Komponenten

```
┌─────────────────────────────────────────────────────────────┐
│                    Haupt-Fenster                            │
├──────────────┬──────────────────────────────────────────────┤
│              │  ┌──────────────────────────────────────┐    │
│  File Tree   │  │   Editor-Toolbar                     │    │
│  (Sidebar)   │  │   [B][I][H1][</>] | [🔖 Bookmark]   │    │
│              │  ├──────────────────────────────────────┤    │
│ 📁 Projekte  │  │                                      │    │
│  └─📁 Buch1 │  │   TipTap WYSIWYG Editor             │    │
│    ├─📄 K1  │  │   - Rechtschreibprüfung aktiv       │    │
│    ├─📄 K2  │  │   - Fehler rot unterstrichen        │    │
│    └─📁 Not │  │   - Charakterkonsistenz-Check       │    │
│  └─📁 Blog   │  │                                      │    │
│              │  └──────────────────────────────────────┘    │
│              │  ┌──────────────────────────────────────┐    │
│ [+ Neu]      │  │   Fehler/Vorschläge Panel           │    │
│ [Aufklappen] │  │   ✓ Akzeptieren | ✗ Ablehnen       │    │
│              │  └──────────────────────────────────────┘    │
└──────────────┴──────────────────────────────────────────────┘
```

---

## 🗂️ Feature-Liste (Priorisiert)

### 🎯 Phase 0: MVP - Basis-Funktionalität (Woche 1-2)

#### Feature 0.1: File-Explorer (Linke Sidebar)
**Beschreibung**: Verzeichnisbaum für lokale Markdown-Dateien

**Funktionalität**:
- ✅ Anzeige von Verzeichnisstruktur (rekursiv)
- ✅ Aufklappen/Zuklappen von Ordnern (Toggle)
- ✅ Click auf Datei → Öffnen im Editor
- ✅ Datei-Icons (📄 .md, 📁 Folder)
- ✅ Aktuelle Datei hervorheben
- ✅ Schnelles Durchscrollen/Navigieren

**Technische Details**:
```javascript
// File Tree Komponente
<FileTree
  rootPath="/path/to/notes"
  onFileSelect={(filePath) => loadFileInEditor(filePath)}
  currentFile={currentFilePath}
  fileTypes={['.md', '.txt', '.markdown']}
/>
```

**Libraries**:
- `react-complex-tree` (empfohlen) - MIT Lizenz
- `react-folder-tree` - Alternative
- Oder Custom-Implementation mit Rekursion

**Persistenz**:
- Expanded/Collapsed State im LocalStorage
- Zuletzt geöffnete Dateien merken

#### Feature 0.2: Basis-Editor (TipTap)
**Beschreibung**: Minimaler WYSIWYG Markdown-Editor

**Funktionalität**:
- ✅ Markdown anzeigen (formatiert)
- ✅ Markdown editieren (WYSIWYG)
- ✅ Keyboard Shortcuts (Ctrl+B, Ctrl+I, etc.)
- ✅ Raw-Mode Toggle (Optional)
- ✅ Auto-Save (Debounced nach 2 Sekunden)

**Extensions**:
- StarterKit (Basic Formatting)
- Markdown (Bidirektional)
- Document (für Multi-File)

#### Feature 0.3: Datei-Operationen
**Beschreibung**: Laden, Speichern, Erstellen von Dateien

**Funktionalität**:
- ✅ Datei öffnen aus File Tree
- ✅ Datei speichern (Auto-Save + Manuell)
- ✅ Neue Datei erstellen
- ✅ Datei umbenennen
- ✅ Datei löschen (mit Bestätigung)
- ✅ Ordner erstellen

**Backend**:
- Node.js File System API (wenn Electron/Desktop)
- Oder: File System Access API (Browser, limitiert)
- Oder: Lokaler Server (Express.js)

**Empfehlung**: 
- **Desktop App (Electron)**: Volle File-System-Kontrolle
- **Web App + Backend**: Node.js Server für File-Operationen

---

### 🎯 Phase 1: LanguageTool-Integration (Woche 3-4)

#### Feature 1.1: LanguageTool Server Setup
**Beschreibung**: Self-hosted Rechtschreibprüfung

**Setup**:
```bash
# Docker Compose
docker-compose up -d languagetool
```

**API-Client**:
```javascript
class LanguageToolClient {
  async check(text, language = 'de-DE') {
    const response = await fetch('http://localhost:8010/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language })
    })
    return await response.json()
  }
}
```

#### Feature 1.2: Fehler-Highlighting im Editor
**Beschreibung**: Rechtschreibfehler visuell markieren

**TipTap Extension**:
```javascript
const SpellingError = Mark.create({
  name: 'spellingError',
  addAttributes() {
    return {
      errorId: { default: null },
      message: { default: null },
      replacements: { default: [] },
      offset: { default: null },
      length: { default: null },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-spelling-error]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', {
      ...HTMLAttributes,
      'data-spelling-error': '',
      class: 'spelling-error', // CSS: text-decoration: wavy underline red
    }, 0]
  },
})
```

**Workflow**:
1. User tippt → Text wird debounced (1 Sekunde Pause)
2. Text an LanguageTool senden
3. Fehler zurück → Im Editor markieren
4. Hover/Click auf Fehler → Vorschläge anzeigen

#### Feature 1.3: Korrektur-UI (Bubble Menu)
**Beschreibung**: Vorschläge bei Fehler-Click anzeigen

**UI-Komponente**:
```javascript
<BubbleMenu editor={editor}>
  {currentError && (
    <div className="correction-bubble">
      <div className="error-message">{currentError.message}</div>
      <div className="suggestions">
        {currentError.replacements.map(r => (
          <button onClick={() => acceptCorrection(r.value)}>
            {r.value}
          </button>
        ))}
      </div>
      <button onClick={ignoreError}>Ignorieren</button>
    </div>
  )}
</BubbleMenu>
```

#### Feature 1.4: Mini-Toolbar
**Beschreibung**: Formatierungs-Buttons (optional, minimal)

**Buttons**:
- Bold, Italic, Strikethrough
- Heading 1, 2, 3
- Blockquote, List
- Raw-Mode Toggle

---

### 🎯 Phase 1.5: Workflow-Features (Woche 5)

#### Feature 1.5.1: Lesezeichen / Überarbeitungs-Tracking ⭐ NEU
**Beschreibung**: Merken, wo User mit Überarbeitung aufgehört hat

**Datenstruktur**:
```javascript
// Metadaten pro Datei in SQLite oder JSON
{
  filePath: "/path/to/document.md",
  lastEditPosition: 1245,  // Character offset im Dokument
  lastEditTimestamp: "2025-10-18T14:30:00Z",
  bookmarks: [
    { position: 1245, label: "Überarbeitung hier fortsetzen", created: "..." },
    { position: 3421, label: "Kapitel 3 Review", created: "..." }
  ],
  reviewStatus: {
    totalCharacters: 15000,
    reviewedCharacters: 8500,
    percentComplete: 57
  }
}
```

**UI-Features**:
- ✅ Button: "Zu letzter Position springen"
- ✅ Beim Öffnen der Datei: Dialog "Wo weitermachen? [Anfang] [Letzte Position]"
- ✅ Manuell Lesezeichen setzen: Ctrl+Shift+B
- ✅ Lesezeichen-Liste in Sidebar (optional)
- ✅ Visueller Fortschrittsbalken (optional)

**Implementation**:
```javascript
// Beim Datei-Öffnen
const openFile = async (filePath) => {
  const content = await loadFile(filePath)
  const metadata = await loadMetadata(filePath)
  
  if (metadata.lastEditPosition) {
    const shouldJump = await confirm(
      'Möchten Sie zur letzten Überarbeitungs-Position springen?'
    )
    if (shouldJump) {
      editor.commands.setTextSelection(metadata.lastEditPosition)
      editor.commands.scrollIntoView()
    }
  }
  
  editor.commands.setContent(content)
}

// Auto-Save Last Position
editor.on('update', debounce(() => {
  const position = editor.state.selection.from
  saveMetadata(currentFile, { lastEditPosition: position })
}, 2000))
```

**Persistenz**:
- SQLite: `file_metadata` Tabelle
- Oder: JSON-Dateien pro Dokument (`.metadata.json`)

#### Feature 1.5.2: Datei-Metadaten anzeigen
**Beschreibung**: Zusätzliche Infos im File-Tree

**Anzeige**:
```
📄 kapitel-1.md  [✓ 85%]  ← Überarbeitungs-Fortschritt
📄 kapitel-2.md  [○ 23%]
📄 notizen.md    [🔖]      ← Hat Lesezeichen
```

---

### 🎯 Phase 2: KI-gestützte Prüfungen (Woche 6-10)

#### Feature 2.1: Prompt-Bibliothek
**Beschreibung**: Vordefinierte und Custom-Prompts für verschiedene Prüfungen

**Prompt-Kategorien**:

##### 2.1.1: Stilistische Prüfungen
```javascript
const stylePrompts = {
  characterConsistency: {
    name: "Charakter-Konsistenz",
    description: "Prüft, ob Charaktere konsistent sprechen/handeln",
    prompt: `
      Analysiere folgenden Text auf Charakter-Konsistenz:
      
      Charakter-Profile:
      {{characterProfiles}}
      
      Text:
      {{text}}
      
      Prüfe:
      1. Spricht jeder Charakter seinem Profil entsprechend?
      2. Sind Handlungen konsistent mit Charakter-Eigenschaften?
      3. Gibt es Widersprüche?
      
      Gib konkrete Textstellen mit Problemen an (Zeile/Absatz).
    `,
    variables: ['characterProfiles', 'text'],
    outputFormat: 'structured' // JSON mit Fehlerpositionen
  },
  
  toneConsistency: {
    name: "Ton-Konsistenz",
    description: "Prüft einheitlichen Schreibstil",
    prompt: `
      Analysiere den Text auf Ton-Konsistenz:
      
      Ziel-Ton: {{targetTone}}  // z.B. "formell", "locker", "akademisch"
      
      Text:
      {{text}}
      
      Markiere Absätze, die vom Ziel-Ton abweichen.
    `
  }
}
```

##### 2.1.2: Konsistenz-Prüfungen
```javascript
const consistencyPrompts = {
  nameConsistency: {
    name: "Namen-Konsistenz",
    description: "Findet inkonsistente Schreibweisen von Namen/Orten",
    prompt: `
      Finde alle Varianten von Namen/Orten im Text:
      
      Bekannte Entitäten:
      {{knownEntities}}  // z.B. "Protagonist: Max Müller"
      
      Text:
      {{text}}
      
      Liste alle Erwähnungen und Varianten.
      Markiere mögliche Inkonsistenzen (z.B. "Max" vs "Maximilian").
    `
  },
  
  fuzzyFindReplace: {
    name: "Fuzzy Suchen & Ersetzen",
    description: "Intelligentes Suchen mit Kontext-Verständnis",
    prompt: `
      Suche im Text nach semantisch ähnlichen Stellen zu:
      
      Suchbegriff: {{searchTerm}}
      Ersetzen durch: {{replacement}}
      
      Text:
      {{text}}
      
      Finde alle Stellen, die inhaltlich zu "{{searchTerm}}" passen,
      auch wenn die exakte Formulierung abweicht.
      
      Schlage für jede Stelle eine angepasste Ersetzung vor.
    `
  },
  
  timelineConsistency: {
    name: "Zeitlinien-Konsistenz",
    description: "Prüft zeitliche Konsistenz in Geschichten",
    prompt: `
      Analysiere die Zeitlinie im Text:
      
      Text:
      {{text}}
      
      Finde:
      1. Alle Zeitangaben (Daten, Uhrzeiten, Zeitspannen)
      2. Chronologische Reihenfolge von Ereignissen
      3. Widersprüche in der Zeitlinie
    `
  }
}
```

##### 2.1.3: Content-Analyse
```javascript
const contentPrompts = {
  keywordExtraction: {
    name: "Stichwortverzeichnis erstellen",
    description: "Findet wichtige Begriffe für Index",
    prompt: `
      Analysiere den Text und extrahiere Index-würdige Begriffe:
      
      Text:
      {{text}}
      
      Kriterien für Index-Begriffe:
      - Fachbegriffe
      - Eigennamen (Personen, Orte)
      - Konzepte, die mehrfach vorkommen
      - Wichtige Themen
      
      Gib für jeden Begriff:
      1. Den Begriff selbst
      2. Alle Textstellen (mit Kontext)
      3. Häufigkeit
      4. Wichtigkeit (1-10)
    `,
    outputFormat: 'index' // Spezialformat für Stichwortverzeichnis
  },
  
  crossReferenceSuggestions: {
    name: "Querverweis-Vorschläge",
    description: "Schlägt sinnvolle interne Links vor",
    prompt: `
      Analysiere Querverweismöglichkeiten:
      
      Aktueller Text:
      {{currentText}}
      
      Andere Dokumente im Projekt:
      {{otherDocuments}}
      
      Schlage vor:
      1. Wo könnten Links zu anderen Kapiteln sinnvoll sein?
      2. Welche Begriffe sollten verlinkt werden?
      3. Welches Ziel-Dokument passt am besten?
      
      Format: [Begriff](link-zu-dokument#anker)
    `
  },
  
  summaryGeneration: {
    name: "Zusammenfassung generieren",
    description: "Erstellt Kapitel-Zusammenfassungen",
    prompt: `
      Erstelle eine Zusammenfassung des Textes:
      
      Text:
      {{text}}
      
      Länge: {{summaryLength}}  // "kurz", "mittel", "ausführlich"
      Stil: {{summaryStyle}}    // "sachlich", "spannend", "akademisch"
      
      Fokussiere auf Hauptaussagen und wichtige Details.
    `
  }
}
```

##### 2.1.4: Spezial-Prüfungen
```javascript
const specialPrompts = {
  dialectCheck: {
    name: "Dialekt/Soziolekt-Prüfung",
    description: "Prüft sprachliche Charakterisierung",
    prompt: `
      Prüfe Dialekt/Soziolekt-Konsistenz:
      
      Charakter: {{characterName}}
      Sprachmuster: {{speechPattern}}  // z.B. "Bayrischer Bauer", "Adliger", etc.
      
      Text (Dialog):
      {{dialogText}}
      
      Bewerte:
      1. Ist der Dialekt/Soziolekt konsistent umgesetzt?
      2. Gibt es unpassende Formulierungen?
      3. Verbesserungsvorschläge für authentischere Sprache
    `
  },
  
  plotHoleDetection: {
    name: "Logik-Löcher finden",
    description: "Findet Widersprüche und Plot-Holes",
    prompt: `
      Analysiere den Text auf logische Inkonsistenzen:
      
      Bisherige Handlung:
      {{previousPlot}}
      
      Aktueller Text:
      {{currentText}}
      
      Finde Widersprüche zu:
      - Etablierten Fakten
      - Charakter-Motivationen
      - Physikalischen Möglichkeiten
      - Zeitlicher Logik
    `
  },
  
  sensitivityCheck: {
    name: "Sensitivitäts-Prüfung",
    description: "Findet potenziell problematische Formulierungen",
    prompt: `
      Prüfe den Text auf sensible Inhalte:
      
      Text:
      {{text}}
      
      Kontext: {{contentContext}}  // Genre, Zielgruppe, etc.
      
      Markiere:
      - Stereotype
      - Diskriminierende Sprache
      - Kulturell sensible Darstellungen
      
      Schlage sensiblere Alternativen vor.
    `
  }
}
```

#### Feature 2.2: Prompt-Manager UI
**Beschreibung**: Verwaltung und Ausführung von Prompts

**UI-Komponenten**:
```javascript
<PromptLibrary>
  <PromptCategories>
    <Category name="Stil">
      <Prompt id="characterConsistency" />
      <Prompt id="toneConsistency" />
    </Category>
    <Category name="Konsistenz">
      <Prompt id="nameConsistency" />
      <Prompt id="fuzzyFindReplace" />
    </Category>
    <Category name="Content">
      <Prompt id="keywordExtraction" />
      <Prompt id="crossReference" />
    </Category>
  </PromptCategories>
  
  <CustomPrompts>
    {/* User-defined Prompts */}
  </CustomPrompts>
</PromptLibrary>

<PromptExecutor>
  <PromptSelector />
  <VariableInputs />  {/* Für {{variables}} im Prompt */}
  <ScopeSelector>    {/* Ganzes Dokument / Auswahl / Kapitel */}
    <option>Aktuelles Dokument</option>
    <option>Markierter Text</option>
    <option>Alle Kapitel</option>
  </ScopeSelector>
  <ExecuteButton />
</PromptExecutor>
```

**Workflow**:
1. User wählt Prompt aus Bibliothek
2. Füllt benötigte Variablen aus (z.B. Charakter-Profile)
3. Wählt Scope (ganzes Dokument/Auswahl)
4. Klickt "Prüfung starten"
5. → Text wird an KI geschickt mit Prompt
6. ← Ergebnisse werden im Editor markiert
7. User kann Vorschläge durchgehen (Akzeptieren/Ablehnen)

#### Feature 2.3: KI-Provider-Abstraction
**Beschreibung**: Flexible KI-Backend-Anbindung

**Supported Providers**:
- OpenAI (GPT-4)
- Anthropic (Claude)
- Lokale Models (Ollama, LM Studio)
- Azure OpenAI
- Custom API

**Provider-Interface**:
```javascript
interface AIProvider {
  name: string
  async check(prompt: string, text: string, options: object): Promise<AIResponse>
}

class OpenAIProvider implements AIProvider {
  async check(prompt, text, options) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text }
        ],
        temperature: options.temperature || 0.3
      })
    })
    return this.parseResponse(await response.json())
  }
}
```

**Config-UI**:
```javascript
<AISettings>
  <ProviderSelector value={currentProvider} onChange={setProvider}>
    <option>OpenAI</option>
    <option>Anthropic</option>
    <option>Ollama (Lokal)</option>
  </ProviderSelector>
  
  <APIKeyInput />
  <ModelSelector />
  <AdvancedOptions>
    <TemperatureSlider />
    <MaxTokensInput />
  </AdvancedOptions>
</AISettings>
```

#### Feature 2.4: Ergebnis-Visualisierung
**Beschreibung**: Wie KI-Findings im Editor angezeigt werden

**Visualisierungs-Typen**:

1. **Inline-Markierungen** (wie Rechtschreibfehler):
   ```
   Der Bauer sprach in hochtrabenden Worten.
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ [!]
   ```
   Tooltip: "Stil-Inkonsistenz: Charakter sollte rustikaler sprechen"

2. **Sidebar-Panel**:
   ```
   ┌─────────────────────────┐
   │ KI-Prüfung: Charakter   │
   ├─────────────────────────┤
   │ ⚠️ 3 Inkonsistenzen     │
   │                         │
   │ 1. Zeile 45:            │
   │    [Zur Stelle]         │
   │    "hochtrabend..."     │
   │    → Vorschlag:         │
   │    "Da schau her..."    │
   │    [✓][✗]               │
   │                         │
   │ 2. Zeile 89:            │
   │    ...                  │
   └─────────────────────────┘
   ```

3. **Diff-View** (für Umformulierungen):
   ```
   Alt:  Der Bauer sprach in hochtrabenden Worten.
   Neu:  "Da schau her", sagte der Bauer im breiten Dialekt.
   
   [Übernehmen] [Ablehnen] [Bearbeiten]
   ```

#### Feature 2.5: Batch-Processing
**Beschreibung**: KI-Prüfung über mehrere Dateien

**UI**:
```javascript
<BatchProcessor>
  <FileSelector>
    <CheckAll />
    <FileList>
      {files.map(f => (
        <FileItem>
          <Checkbox checked={f.selected} />
          <FileName>{f.name}</FileName>
          <FileSize>{f.size}</FileSize>
        </FileItem>
      ))}
    </FileList>
  </FileSelector>
  
  <PromptSelector />
  
  <ProgressView>
    <OverallProgress value={50} max={100} />
    <CurrentFile>Verarbeite: kapitel-3.md</CurrentFile>
    <EstimatedTime>Verbleibende Zeit: ~5 Min</EstimatedTime>
  </ProgressView>
  
  <ResultsSummary>
    <StatCard title="Geprüfte Dateien" value={8} />
    <StatCard title="Gefundene Issues" value={24} />
    <StatCard title="Auto-Fixed" value={12} />
    <StatCard title="Manuelle Review" value={12} />
  </ResultsSummary>
</BatchProcessor>
```

---

### 🎯 Phase 3: Erweiterte Features (Woche 11+)

#### Feature 3.1: Stichwortverzeichnis-Generator
**Beschreibung**: Automatisches Index-Verzeichnis erstellen

**Workflow**:
1. User wählt "Index erstellen" aus Menü
2. KI analysiert alle Dokumente
3. Extrahiert relevante Begriffe
4. User reviewed Vorschläge (Begriffe hinzufügen/entfernen/gruppieren)
5. System erstellt `index.md` mit Links zu allen Vorkommen

**Output-Format**:
```markdown
# Stichwortverzeichnis

## A
- **Alchemie**: [Kapitel 1](kapitel-1.md#alchemie), [Kapitel 5](kapitel-5.md#alchemie-ritual)
- **Antagonist, Beschreibung**: [Kapitel 2](kapitel-2.md#antagonist-intro)

## B
- **Bauerndialekt**: [Kapitel 3](kapitel-3.md#bauer-dialog-1), [Kapitel 7](kapitel-7.md#bauer-dialog-2)
```

#### Feature 3.2: Automatische Querverweis-Einfügung
**Beschreibung**: Wikipedia-Style interne Links

**Features**:
- KI schlägt Linkstellen vor
- User kann Links annehmen/ablehnen
- Automatisches Anchor-Management
- Bidirektionale Links (Backlinks)

**Beispiel**:
```markdown
<!-- Vorher -->
Der Protagonist traf den alten Weisen im Wald.

<!-- KI schlägt vor -->
Der [Protagonist](#charakter-protagonist) traf den 
[alten Weisen](#charakter-weiser) im [Wald von Eloria](#ort-wald).

<!-- Nach Annahme -->
Interne Links sind eingefügt, Anchors automatisch erstellt
```

#### Feature 3.3: Multi-Dokument-Suche
**Beschreibung**: Projektweite Suche mit Kontext

**Features**:
- Volltextsuche über alle Dateien
- Fuzzy Search
- Regex-Support
- Filter nach Datei-Typ, Ordner
- Vorschau mit Kontext

#### Feature 3.4: Versions-Kontrolle (Git-Integration)
**Beschreibung**: Änderungen nachverfolgen

**Features**:
- Auto-Commit bei größeren Änderungen
- Diff-View
- Rollback-Möglichkeit
- Branch-Support für alternative Versionen

#### Feature 3.5: Export-Optionen
**Beschreibung**: Dokumente in andere Formate exportieren

**Formate**:
- PDF (mit Stichwortverzeichnis, Inhaltsverzeichnis)
- DOCX (Microsoft Word)
- EPUB (E-Book)
- HTML (Website)
- LaTeX (für akademische Texte)

---

## 🏗️ Technische Architektur

### System-Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Electron/Web)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  File Tree   │  │   Editor View    │  │  Side Panel  │ │
│  │  Component   │  │   (TipTap)       │  │  (Errors)    │ │
│  │              │  │                  │  │              │ │
│  │  - Navigate  │  │  - WYSIWYG Edit  │  │  - Review    │ │
│  │  - Expand    │  │  - Markdown I/O  │  │  - Accept/   │ │
│  │  - Create    │  │  - Highlighting  │  │    Reject    │ │
│  └──────────────┘  └──────────────────┘  └──────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     State Management                        │
│   - Current File, Editor Content, File Tree State          │
│   - Errors/Suggestions, Bookmarks, Metadata                │
│   - User Preferences, Prompt Library                       │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ↓                    ↓                    ↓
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│ File System  │    │  LanguageTool    │    │  KI APIs     │
│  (Local)     │    │  Server          │    │  (Optional)  │
│              │    │  (Docker)        │    │              │
│  - Read/     │    │                  │    │  - OpenAI    │
│    Write     │    │  - Grammar       │    │  - Claude    │
│  - Watch     │    │  - Spelling      │    │  - Ollama    │
│  - Metadata  │    │                  │    │              │
└──────────────┘    └──────────────────┘    └──────────────┘
         │                    │                    │
         ↓                    ↓                    ↓
┌─────────────────────────────────────────────────────────────┐
│                    Persistenz Layer                         │
│                                                             │
│  ┌──────────────┐         ┌──────────────────────────┐    │
│  │  Markdown    │         │  SQLite Database         │    │
│  │  Files       │         │  (Metadaten)             │    │
│  │              │         │                          │    │
│  │  /notes/     │         │  - file_metadata         │    │
│  │    ├─ doc1   │         │  - bookmarks             │    │
│  │    ├─ doc2   │         │  - review_progress       │    │
│  │    └─ ...    │         │  - custom_prompts        │    │
│  └──────────────┘         │  - error_history         │    │
│                           └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Datenbank-Schema (SQLite)

```sql
-- Datei-Metadaten
CREATE TABLE file_metadata (
  id INTEGER PRIMARY KEY,
  file_path TEXT UNIQUE NOT NULL,
  last_edit_position INTEGER,
  last_edit_timestamp DATETIME,
  total_characters INTEGER,
  reviewed_characters INTEGER,
  review_percentage REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lesezeichen
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_path) REFERENCES file_metadata(file_path)
);

-- Custom Prompts
CREATE TABLE custom_prompts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  prompt_template TEXT NOT NULL,
  variables TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Fehler-Historie (für Statistiken)
CREATE TABLE error_history (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  error_type TEXT, -- 'spelling', 'grammar', 'style', 'consistency'
  error_position INTEGER,
  error_text TEXT,
  suggestion TEXT,
  action TEXT, -- 'accepted', 'rejected', 'ignored'
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Projekt-Einstellungen
CREATE TABLE project_settings (
  id INTEGER PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Technologie-Entscheidungen

#### Desktop vs. Web App

**Empfehlung: Electron Desktop App** (zumindest für MVP)

**Begründung**:
- ✅ Voller File-System-Zugriff (kein Browser-Sandbox)
- ✅ Kann LanguageTool lokal bundlen
- ✅ Bessere Performance für große Dateien
- ✅ Native Menüs und Keyboard Shortcuts
- ✅ Kein Backend-Server nötig
- ✅ Offline-First

**Alternative: Web App + Node.js Backend**
- Wenn Multi-User oder Cloud-Sync gewünscht
- Dann: Tauri (leichtgewichtiger als Electron)

#### Frontend-Framework

**Empfehlung: React** (mit TypeScript)

**Alternativen**:
- Vue.js (leichter zu lernen, aber kleineres Ökosystem für unsere Use-Cases)
- Svelte (beste Performance, aber weniger Libraries)

**Stack**:
```
- React 18+
- TypeScript
- TipTap 3.x
- Electron
- SQLite (better-sqlite3)
- Zustand (State Management, leichtgewichtig)
```

#### File Tree Component

**Empfehlung: `react-complex-tree`**
- GitHub: https://github.com/lukasbach/react-complex-tree
- MIT Lizenz
- Features: Drag&Drop, Virtualisierung, Keyboard-Navigation
- Gut dokumentiert

**Alternative**: Eigene Implementation (für volle Kontrolle)

---

## 📦 Projektstruktur

```
intelligent-markdown-editor/
├── package.json
├── electron.js                    # Electron Main Process
├── src/
│   ├── main/                      # Electron Main (Node.js)
│   │   ├── file-system.ts         # File Operations
│   │   ├── database.ts            # SQLite Wrapper
│   │   ├── languagetool.ts        # LanguageTool Client
│   │   └── ipc-handlers.ts        # IPC Communication
│   │
│   ├── renderer/                  # React App (Browser)
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── FileTree/
│   │   │   │   ├── FileTree.tsx
│   │   │   │   ├── FileTreeNode.tsx
│   │   │   │   └── useFileTree.ts
│   │   │   │
│   │   │   ├── Editor/
│   │   │   │   ├── Editor.tsx
│   │   │   │   ├── EditorToolbar.tsx
│   │   │   │   ├── BubbleMenu.tsx
│   │   │   │   └── extensions/
│   │   │   │       ├── SpellingError.ts
│   │   │   │       ├── StyleSuggestion.ts
│   │   │   │       └── Bookmark.ts
│   │   │   │
│   │   │   ├── SidePanel/
│   │   │   │   ├── ErrorPanel.tsx
│   │   │   │   ├── BookmarkPanel.tsx
│   │   │   │   └── PromptLibrary.tsx
│   │   │   │
│   │   │   └── Layout/
│   │   │       ├── MainLayout.tsx
│   │   │       ├── Toolbar.tsx
│   │   │       └── StatusBar.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useEditor.ts
│   │   │   ├── useFileSystem.ts
│   │   │   ├── useLanguageTool.ts
│   │   │   ├── useBookmarks.ts
│   │   │   └── usePromptLibrary.ts
│   │   │
│   │   ├── store/                 # Zustand State
│   │   │   ├── editorStore.ts
│   │   │   ├── fileStore.ts
│   │   │   ├── errorStore.ts
│   │   │   └── settingsStore.ts
│   │   │
│   │   ├── services/
│   │   │   ├── LanguageToolService.ts
│   │   │   ├── AIService.ts
│   │   │   ├── PromptEngine.ts
│   │   │   └── ExportService.ts
│   │   │
│   │   └── utils/
│   │       ├── markdown.ts
│   │       ├── offsetMapper.ts    # Text-Position-Mapping
│   │       └── debounce.ts
│   │
│   ├── types/
│   │   ├── editor.d.ts
│   │   ├── fileTree.d.ts
│   │   └── prompts.d.ts
│   │
│   └── assets/
│       ├── styles/
│       └── icons/
│
├── prompts/                        # Prompt-Bibliothek (JSON/YAML)
│   ├── style/
│   │   ├── character-consistency.yaml
│   │   └── tone-consistency.yaml
│   ├── consistency/
│   │   ├── name-consistency.yaml
│   │   └── timeline-check.yaml
│   └── content/
│       ├── keyword-extraction.yaml
│       └── cross-reference.yaml
│
├── docker/                         # LanguageTool Docker
│   └── docker-compose.yml
│
└── README.md
```

---

## 🎯 Claude Code: Implementierungs-Anleitung

### Schritt 0: Projekt-Setup

```bash
# Neues Electron + React + TypeScript Projekt
npm create @quick-start/electron -- intelligent-markdown-editor
cd intelligent-markdown-editor

# Dependencies
npm install \
  @tiptap/core \
  @tiptap/starter-kit \
  @tiptap/markdown \
  @tiptap/react \
  @tiptap/extension-bubble-menu \
  react-complex-tree \
  better-sqlite3 \
  zustand \
  axios

npm install -D @types/better-sqlite3
```

### Schritt 1: File Tree (Linke Sidebar) - PRIORITÄT 1

**Aufgabe**: Implementiere funktionierenden File-Explorer

**Anforderungen**:
1. Zeige Verzeichnisbaum rekursiv an
2. Nur .md und .txt Dateien anzeigen
3. Aufklappen/Zuklappen von Ordnern
4. Click auf Datei → Event mit filePath
5. Aktuelle Datei hervorheben
6. Speichere Expanded-State in LocalStorage

**Code-Struktur**:
```typescript
// src/renderer/components/FileTree/FileTree.tsx

interface FileTreeNode {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  expanded?: boolean
}

interface FileTreeProps {
  rootPath: string
  onFileSelect: (filePath: string) => void
  currentFile: string | null
}

export function FileTree({ rootPath, onFileSelect, currentFile }: FileTreeProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  
  useEffect(() => {
    loadFileTree(rootPath)
  }, [rootPath])
  
  const loadFileTree = async (path: string) => {
    // IPC call zu Electron Main Process
    const treeData = await window.electronAPI.loadFileTree(path)
    setTree(treeData)
  }
  
  // ... Implementation
}
```

**Electron IPC Handler**:
```typescript
// src/main/ipc-handlers.ts
import fs from 'fs'
import path from 'path'

ipcMain.handle('loadFileTree', async (event, rootPath) => {
  const buildTree = (dirPath: string): FileTreeNode[] => {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
    
    return items
      .filter(item => {
        if (item.isDirectory()) return true
        return ['.md', '.txt', '.markdown'].some(ext => 
          item.name.endsWith(ext)
        )
      })
      .map(item => {
        const fullPath = path.join(dirPath, item.name)
        if (item.isDirectory()) {
          return {
            id: fullPath,
            name: item.name,
            path: fullPath,
            type: 'folder',
            children: buildTree(fullPath),
            expanded: false
          }
        } else {
          return {
            id: fullPath,
            name: item.name,
            path: fullPath,
            type: 'file'
          }
        }
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }
  
  return buildTree(rootPath)
})
```

**Test-Kriterien**:
- [ ] File Tree wird angezeigt
- [ ] Ordner können auf-/zugeklappt werden
- [ ] Click auf Datei feuert Event
- [ ] Expanded-State bleibt bei Reload erhalten
- [ ] Performance OK bei >100 Dateien

### Schritt 2: Basis-Editor - PRIORITÄT 1

**Aufgabe**: TipTap Editor mit Markdown I/O

**Code**:
```typescript
// src/renderer/components/Editor/Editor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'

interface EditorProps {
  initialContent: string
  onUpdate: (markdown: string) => void
}

export function Editor({ initialContent, onUpdate }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Markdown,
    ],
    content: initialContent,
    contentType: 'markdown',
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown()
      onUpdate(markdown)
    },
  })

  return (
    <div className="editor-container">
      <EditorContent editor={editor} />
    </div>
  )
}
```

**Styling**:
```css
/* src/renderer/assets/styles/editor.css */
.editor-container {
  height: 100%;
  overflow-y: auto;
  padding: 2rem;
}

.ProseMirror {
  outline: none;
  min-height: 100%;
}

.ProseMirror h1 {
  font-size: 2em;
  font-weight: bold;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.ProseMirror h2 {
  font-size: 1.5em;
  font-weight: bold;
  margin-top: 0.8em;
  margin-bottom: 0.4em;
}

/* ... weitere Styles */
```

**Test-Kriterien**:
- [ ] Markdown wird formatiert angezeigt
- [ ] User kann editieren
- [ ] Keyboard Shortcuts funktionieren (Ctrl+B, etc.)
- [ ] onUpdate wird debounced aufgerufen

### Schritt 3: File Operations - PRIORITÄT 1

**Aufgabe**: Dateien laden/speichern

**IPC Handlers**:
```typescript
// src/main/file-system.ts

ipcMain.handle('loadFile', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('saveFile', async (event, filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

**Integration**:
```typescript
// src/renderer/hooks/useFileSystem.ts

export function useFileSystem() {
  const loadFile = async (filePath: string) => {
    const result = await window.electronAPI.loadFile(filePath)
    if (!result.success) {
      console.error('Failed to load file:', result.error)
      return null
    }
    return result.content
  }

  const saveFile = async (filePath: string, content: string) => {
    const result = await window.electronAPI.saveFile(filePath, content)
    return result.success
  }

  return { loadFile, saveFile }
}
```

### Schritt 4: Main Layout - PRIORITÄT 1

**Aufgabe**: Verbinde File Tree + Editor

```typescript
// src/renderer/App.tsx

export function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  
  const { loadFile, saveFile } = useFileSystem()

  const handleFileSelect = async (filePath: string) => {
    // Auto-save vorherige Datei
    if (currentFile && content) {
      await saveFile(currentFile, content)
    }
    
    // Neue Datei laden
    const newContent = await loadFile(filePath)
    if (newContent) {
      setCurrentFile(filePath)
      setContent(newContent)
    }
  }

  const handleContentUpdate = (newContent: string) => {
    setContent(newContent)
    // Debounced auto-save
    debouncedSave(currentFile, newContent)
  }

  return (
    <div className="app-layout">
      <FileTree
        rootPath="/path/to/notes"
        onFileSelect={handleFileSelect}
        currentFile={currentFile}
      />
      
      <div className="editor-pane">
        {currentFile ? (
          <Editor
            key={currentFile}
            initialContent={content}
            onUpdate={handleContentUpdate}
          />
        ) : (
          <div className="no-file-selected">
            Wähle eine Datei aus dem File Tree
          </div>
        )}
      </div>
    </div>
  )
}
```

**Layout CSS**:
```css
.app-layout {
  display: grid;
  grid-template-columns: 250px 1fr;
  height: 100vh;
  overflow: hidden;
}

.editor-pane {
  overflow-y: auto;
}
```

**Test-Kriterien**:
- [ ] File Tree und Editor sind nebeneinander
- [ ] Click auf Datei → Inhalt wird im Editor geladen
- [ ] Änderungen werden automatisch gespeichert
- [ ] Wechsel zwischen Dateien funktioniert

### Schritt 5: Lesezeichen/Bookmarks - PRIORITÄT 2

**Aufgabe**: Implementiere Bookmark-System

**Datenbank-Setup**:
```typescript
// src/main/database.ts
import Database from 'better-sqlite3'

export class MetadataDB {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.initTables()
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_metadata (
        id INTEGER PRIMARY KEY,
        file_path TEXT UNIQUE NOT NULL,
        last_edit_position INTEGER,
        last_edit_timestamp DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        position INTEGER NOT NULL,
        label TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_path) REFERENCES file_metadata(file_path)
      );
    `)
  }

  saveLastPosition(filePath: string, position: number) {
    const stmt = this.db.prepare(`
      INSERT INTO file_metadata (file_path, last_edit_position, last_edit_timestamp)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(file_path) DO UPDATE SET
        last_edit_position = excluded.last_edit_position,
        last_edit_timestamp = excluded.last_edit_timestamp
    `)
    stmt.run(filePath, position)
  }

  getLastPosition(filePath: string): number | null {
    const stmt = this.db.prepare(`
      SELECT last_edit_position FROM file_metadata WHERE file_path = ?
    `)
    const row = stmt.get(filePath) as any
    return row?.last_edit_position || null
  }

  addBookmark(filePath: string, position: number, label: string) {
    const stmt = this.db.prepare(`
      INSERT INTO bookmarks (file_path, position, label)
      VALUES (?, ?, ?)
    `)
    stmt.run(filePath, position, label)
  }

  getBookmarks(filePath: string) {
    const stmt = this.db.prepare(`
      SELECT * FROM bookmarks WHERE file_path = ? ORDER BY position
    `)
    return stmt.all(filePath)
  }
}
```

**UI-Integration**:
```typescript
// src/renderer/hooks/useBookmarks.ts

export function useBookmarks(editor, currentFile) {
  const [lastPosition, setLastPosition] = useState<number | null>(null)

  useEffect(() => {
    if (currentFile && editor) {
      // Letzte Position abrufen
      window.electronAPI.getLastPosition(currentFile).then(pos => {
        if (pos !== null) {
          setLastPosition(pos)
          // Dialog anzeigen
          const shouldJump = confirm(
            'Zur letzten Bearbeitungsposition springen?'
          )
          if (shouldJump) {
            editor.commands.setTextSelection(pos)
            editor.commands.scrollIntoView()
          }
        }
      })
    }
  }, [currentFile, editor])

  // Auto-save position
  useEffect(() => {
    if (!editor || !currentFile) return

    const updatePosition = debounce(() => {
      const pos = editor.state.selection.from
      window.electronAPI.saveLastPosition(currentFile, pos)
    }, 2000)

    editor.on('selectionUpdate', updatePosition)
    return () => editor.off('selectionUpdate', updatePosition)
  }, [editor, currentFile])

  const addBookmark = (label: string) => {
    if (!editor || !currentFile) return
    const pos = editor.state.selection.from
    window.electronAPI.addBookmark(currentFile, pos, label)
  }

  return { lastPosition, addBookmark }
}
```

**Button-Integration**:
```typescript
<button
  onClick={() => {
    const label = prompt('Lesezeichen-Bezeichnung:')
    if (label) addBookmark(label)
  }}
  title="Lesezeichen setzen (Ctrl+Shift+B)"
>
  🔖
</button>
```

### Schritt 6: LanguageTool-Integration - PRIORITÄT 2

**Aufgabe**: Rechtschreibprüfung einbinden

**LanguageTool Service**:
```typescript
// src/renderer/services/LanguageToolService.ts

export class LanguageToolService {
  private baseUrl: string

  constructor(baseUrl = 'http://localhost:8010') {
    this.baseUrl = baseUrl
  }

  async check(text: string, language = 'de-DE') {
    const response = await fetch(`${this.baseUrl}/v2/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text,
        language,
      })
    })

    const data = await response.json()
    return this.parseResponse(data)
  }

  private parseResponse(data: any) {
    return data.matches.map(match => ({
      message: match.message,
      offset: match.offset,
      length: match.length,
      replacements: match.replacements.map(r => r.value),
      ruleId: match.rule.id,
      category: match.rule.category.name
    }))
  }
}
```

**Editor Extension**:
```typescript
// src/renderer/components/Editor/extensions/SpellingError.ts
import { Mark } from '@tiptap/core'

export const SpellingError = Mark.create({
  name: 'spellingError',

  addAttributes() {
    return {
      errorId: { default: null },
      message: { default: null },
      replacements: { default: [] },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-spelling-error]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', {
      ...HTMLAttributes,
      'data-spelling-error': '',
      class: 'spelling-error',
    }, 0]
  },
})
```

**CSS für Fehler**:
```css
.spelling-error {
  text-decoration: wavy underline red;
  cursor: pointer;
}
```

**Integration in Editor**:
```typescript
const proofread = async () => {
  if (!editor) return
  
  const text = editor.getText()
  const errors = await languageToolService.check(text)
  
  // Alte Marks entfernen
  editor.chain().unsetMark('spellingError').run()
  
  // Neue Marks setzen
  errors.forEach(error => {
    // Position-Mapping beachten!
    const from = error.offset
    const to = error.offset + error.length
    
    editor.chain()
      .setTextSelection({ from, to })
      .setMark('spellingError', {
        errorId: error.ruleId,
        message: error.message,
        replacements: error.replacements
      })
      .run()
  })
}
```

### Schritt 7-10: Phase 2 Features

*(Detaillierte Anweisungen für KI-Features, Prompt-Bibliothek, etc. werden nach MVP implementiert)*

---

## 🎯 Priorisierte Roadmap für Claude Code

### Sprint 1 (Woche 1-2): MVP - Funktionierender Editor
1. ✅ Projekt-Setup (Electron + React + TypeScript)
2. ✅ File Tree Component
3. ✅ Basis-Editor (TipTap + Markdown)
4. ✅ File Operations (Load/Save)
5. ✅ Main Layout (Tree + Editor)
6. ✅ Auto-Save

**Deliverable**: Funktionierender Markdown-Editor mit File-Browser

### Sprint 2 (Woche 3): LanguageTool
7. ✅ LanguageTool Docker Setup
8. ✅ LanguageTool Service
9. ✅ SpellingError Extension
10. ✅ Error Highlighting
11. ✅ Bubble Menu für Korrekturen

**Deliverable**: Rechtschreibprüfung funktioniert

### Sprint 3 (Woche 4): Workflow-Features
12. ✅ SQLite Integration
13. ✅ Lesezeichen-System
14. ✅ "Letzte Position"-Feature
15. ✅ Bookmark-Panel (Sidebar)
16. ✅ Mini-Toolbar

**Deliverable**: Komfortables Arbeiten an langen Dokumenten

### Sprint 4 (Woche 5-6): Polish & Testing
17. ✅ Performance-Optimierung
18. ✅ Error Handling
19. ✅ User Testing
20. ✅ Bug Fixes
21. ✅ Dokumentation

**Deliverable**: Stabile Version 1.0

### Sprint 5+ (Woche 7+): Phase 2 - KI-Features
22. ⏳ KI-Provider-Abstraction
23. ⏳ Prompt-Bibliothek UI
24. ⏳ Erste Prompts (Charakter, Stil, Konsistenz)
25. ⏳ KI-Error-Highlighting
26. ⏳ Batch-Processing
27. ⏳ Erweiterte Features (Index, Cross-Reference, etc.)

**Deliverable**: Intelligenter Schreib-Assistent

---

## 📝 Claude Code: Konkrete Arbeitsanweisungen

### Anweisung 1: Projekt initialisieren

```bash
# Claude Code soll ausführen:

# 1. Electron-React-Projekt erstellen
npx create-electron-app intelligent-markdown-editor --template=webpack-typescript
cd intelligent-markdown-editor

# 2. Dependencies installieren
npm install \
  react react-dom \
  @tiptap/core @tiptap/starter-kit @tiptap/markdown @tiptap/react \
  @tiptap/extension-bubble-menu \
  react-complex-tree \
  better-sqlite3 \
  zustand \
  axios

npm install -D \
  @types/react @types/react-dom \
  @types/better-sqlite3

# 3. Projektstruktur erstellen
mkdir -p src/main src/renderer/{components,hooks,store,services,utils}
mkdir -p src/renderer/components/{FileTree,Editor,SidePanel,Layout}
mkdir -p prompts/{style,consistency,content}
mkdir -p docker

# 4. Docker Compose für LanguageTool
cat > docker/docker-compose.yml << 'EOF'
version: '3'
services:
  languagetool:
    image: erikvl87/languagetool
    ports:
      - "8010:8010"
    environment:
      - Java_Xms=512m
      - Java_Xmx=2g
EOF
```

### Anweisung 2: File Tree implementieren

**Datei**: `src/renderer/components/FileTree/FileTree.tsx`

```typescript
// Claude Code soll folgendes implementieren:

1. FileTree Component mit react-complex-tree
2. IPC Handler in Electron Main für loadFileTree
3. Rekursive Verzeichnis-Traversierung
4. Filter für .md, .txt, .markdown Dateien
5. Click-Handler für onFileSelect
6. LocalStorage für Expanded-State
7. Styling (minimalistisch, funktional)
8. Tests (optional)

// Anforderungen:
- Performance: Soll mit 1000+ Dateien umgehen können
- UX: Smooth expand/collapse animations
- Icons: 📁 für Ordner, 📄 für Dateien
- Highlight: Aktuelle Datei visuell hervorheben
```

### Anweisung 3: Editor implementieren

**Datei**: `src/renderer/components/Editor/Editor.tsx`

```typescript
// Claude Code soll folgendes implementieren:

1. TipTap Editor Component
2. StarterKit + Markdown Extension
3. onUpdate Handler (debounced)
4. Keyboard Shortcuts (native)
5. Basic Styling (lesbare Schrift, Abstände)
6. Raw-Mode Toggle (Optional für MVP)

// Styling-Anforderungen:
- Font: System-Font oder Inter/Roboto
- Line-Height: 1.6
- Max-Width: 800px (zentriert)
- Padding: 2rem
- Heading-Styles: Klar differenziert
```

### Anweisung 4: Integration & Layout

**Datei**: `src/renderer/App.tsx`

```typescript
// Claude Code soll folgendes implementieren:

1. Main Layout (Grid: File Tree + Editor)
2. State Management (Zustand oder Context)
3. File Load/Save Integration
4. Auto-Save (debounced 2 Sekunden)
5. Current File Tracking
6. Error Boundaries

// Layout:
- File Tree: 250px fixed width, links
- Editor: Rest, rechts
- Resizable Splitter (optional für MVP)
```

### Anweisung 5: LanguageTool

**Dateien**: 
- `src/renderer/services/LanguageToolService.ts`
- `src/renderer/components/Editor/extensions/SpellingError.ts`

```typescript
// Claude Code soll folgendes implementieren:

1. LanguageToolService class mit check() method
2. SpellingError TipTap Mark Extension
3. proofread() Funktion im Editor
4. Debounced Auto-Proofread (3 Sekunden nach Tipp-Pause)
5. Bubble Menu für Korrektur-Vorschläge
6. Accept/Reject Funktionalität

// Workflow:
User tippt → Pause 3s → Text an LanguageTool → 
Fehler markieren → User click Fehler → Bubble Menu → 
User wählt Korrektur → Text wird ersetzt
```

### Anweisung 6: Bookmarks

**Dateien**:
- `src/main/database.ts`
- `src/renderer/hooks/useBookmarks.ts`

```typescript
// Claude Code soll folgendes implementieren:

1. SQLite Database Setup (better-sqlite3)
2. file_metadata und bookmarks Tabellen
3. IPC Handlers für DB-Operationen
4. useBookmarks Hook
5. "Zur letzten Position"-Dialog beim File-Öffnen
6. Auto-Save der aktuellen Position
7. Manuelles Bookmark-Setzen (Button + Shortcut)

// UX:
- Dialog beim Öffnen: "Fortsetzen bei Position X?" [Ja] [Nein]
- Bookmark-Button in Toolbar
- Keyboard Shortcut: Ctrl+Shift+B
```

---

## 🚀 Zusammenfassung für Claude Code

### Deine Aufgabe:

Baue einen **Desktop Markdown-Editor (Electron)** mit:

1. **File Tree** (links) - Navigation durch Markdown-Dateien
2. **WYSIWYG Editor** (rechts) - TipTap-basiert
3. **LanguageTool** - Rechtschreibprüfung mit Fehler-Highlighting
4. **Lesezeichen** - "Wo aufgehört"-Tracking
5. **Auto-Save** - Keine Datenverluste

### Technologie:
- Electron + React + TypeScript
- TipTap 3.x für Editor
- LanguageTool (Docker) für Spell-Check
- SQLite für Metadaten
- react-complex-tree für File Tree

### Prioritäten:
1. **Woche 1-2**: MVP (Tree + Editor + File Ops)
2. **Woche 3**: LanguageTool Integration
3. **Woche 4**: Bookmarks & Polish
4. **Woche 5+**: KI-Features (Phase 2)

### Erfolgs-Kriterien:
- ✅ User kann durch Dateien navigieren
- ✅ Markdown wird WYSIWYG editiert
- ✅ Rechtschreibfehler werden markiert
- ✅ Beim Öffnen kann zur letzten Position gesprungen werden
- ✅ Alles ist performant (auch bei 1000+ Dateien)

---

**Start: Implementiere zuerst den File Tree + Basis-Editor (Sprint 1)!**

*Dieses Dokument dient als vollständige Spezifikation und Arbeitsanleitung für Claude Code zur Implementierung des Projekts.*