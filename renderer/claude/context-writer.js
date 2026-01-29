// Claude Code Context Writer
// Generiert Kontext-Dateien für Claude Code Terminal Integration
// Phase 1: MVP mit externem Terminal + Clipboard-Workflow

import State from '../editor/editor-state.js';
import { getParagraphText } from '../languagetool/paragraph-storage.js';
import { getParagraphInfoAtPosition } from '../editor/paragraph-info.js';
import { getVisibleParagraphRange } from './viewport-calculator.js';

/**
 * Generiert alle Kontext-Dateien für Claude
 * @returns {Promise<string>} Pfad zum Kontext-Verzeichnis
 */
export async function generateAndWriteContext() {
  if (!State.currentFilePath) {
    throw new Error('Keine Datei geladen');
  }

  const appDirResult = await window.api.getAppDir();
  if (!appDirResult?.success || !appDirResult.appDir) {
    throw new Error('App-Verzeichnis nicht verfügbar');
  }
  const contextDir = `${appDirResult.appDir}/.tiptap-context`;

  // Sammle alle Informationen
  const paragraphs = getDisplayParagraphs(State.currentEditor);
  const cursorInfo = getCursorParagraphInfo(paragraphs);
  const viewportInfo = getVisibleParagraphRange(paragraphs);
  const styleGuideInfo = await loadStyleGuideInfo();

  // Generiere Datei-Inhalte
  const claudeMd = generateClaudeMd(paragraphs, cursorInfo, viewportInfo, styleGuideInfo);
  const numberedDoc = generateNumberedDocument(paragraphs);
  const viewportHtml = generateViewportHtml(paragraphs, viewportInfo);
  const sessionJson = generateSessionJson(paragraphs);
  const settingsJson = generateSettingsJson(styleGuideInfo);

  // Schreibe Dateien über IPC
  const contextFiles = {
    'CLAUDE.md': claudeMd,
    'document-numbered.txt': numberedDoc,
    'viewport.html': viewportHtml,
    'session.json': sessionJson,
    '.claude/settings.local.json': settingsJson,
  };

  await window.claude.writeContext(contextDir, contextFiles);

  return contextDir;
}

/**
 * Ermittelt in welchem Absatz der Cursor steht
 */
function getCursorParagraphInfo(paragraphs) {
  if (!State.currentEditor) return null;

  const cursorPos = State.currentEditor.state.selection.from;
  const index = paragraphs.findIndex(p => cursorPos >= p.from && cursorPos <= p.to);
  const matched = index >= 0 ? paragraphs[index] : null;

  const fallback = matched ? null : getParagraphInfoAtPosition(cursorPos);
  const base = matched || fallback;

  if (!base) return null;

  return {
    ...base,
    index: matched ? index + 1 : null,
    cursorOffset: cursorPos - base.from,
  };
}

/**
 * Generiert CLAUDE.md - Hauptkontext mit Anweisungen
 */
function generateClaudeMd(paragraphs, cursorInfo, viewportInfo, styleGuideInfo) {
  const fileName = State.currentFilePath.split('/').pop();
  const totalWords = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);

  let content = `# TipTap AI Kontext

## Dokument
- **Datei:** ${fileName}
- **Pfad:** ${State.currentFilePath}
- **Absätze:** ${paragraphs.length}
- **Wörter:** ~${totalWords}
- **Aktualisiert:** ${new Date().toISOString()}

## Berechtigungen
Du hast Lese- und Schreibzugriff auf das Dokument.

## Aktueller Kontext
`;

  if (viewportInfo.from > 0) {
    content += `- **Sichtbar:** §${viewportInfo.from} bis §${viewportInfo.to}\n`;
  }

  if (cursorInfo?.index) {
    content += `- **Cursor:** §${cursorInfo.index}, Position ${cursorInfo.cursorOffset}\n`;
  }

  content += `
## Nummeriertes Dokument
Die Datei \`document-numbered.txt\` enthält den vollständigen Text mit Absatz-Markierungen:
- [§1], [§2], ... entsprechen den sichtbaren Zeilennummern links im Editor
- Nutze diese Nummern um Absätze zu referenzieren
`;

  if (styleGuideInfo?.path) {
    content += `
## Style Guide
Der Style Guide sollte hier liegen:
- ${styleGuideInfo.path}
`;
  }

  content += `

## Arbeitsanweisungen

### Standard-Workflow (Clipboard)
1. User: "Überarbeite §13, mach es prägnanter"
2. Du zeigst den überarbeiteten Text zur Begutachtung
3. User: "Gut, in Zwischenablage" oder "In Clipboard kopieren"
4. Du kopierst **NUR den reinen Text** - keine Erklärung, kein Kommentar!

### Direkt-Edit (fortgeschritten)
Du kannst auch direkt im Dokument editieren:
\`\`\`
Edit ${State.currentFilePath}
old_string: [exakter alter Text]
new_string: [neuer Text]
\`\`\`

## Beispiel-Prompts
- "Zeige §5"
- "Lies §10 bis §15"
- "Formuliere §${cursorInfo?.index || 3} kürzer"
- "Korrigiere Grammatik in §7"
- "Füge nach §12 einen Übergang ein"
- "Ergebnis in Zwischenablage"

## Wichtig
- Beziehe dich immer auf §-Nummern aus \`document-numbered.txt\`
- Bei Clipboard-Ausgabe: **NUR der reine Text**, nichts anderes!
`;

  return content;
}

/**
 * Generiert document-numbered.txt - Volltext mit [§N] Markierungen
 */
function generateNumberedDocument(paragraphs) {
  if (paragraphs.length === 0) {
    return '(Dokument ist leer)';
  }

  return paragraphs.map((para, index) => {
    return `[§${index + 1}] ${para.text}`;
  }).join('\n\n');
}

/**
 * Generiert viewport.html - Sichtbarer Bereich mit §-Nummern als HTML
 * Das ist was der User gerade im Editor sieht
 */
function generateViewportHtml(paragraphs, viewportInfo) {
  if (paragraphs.length === 0) {
    return '<div class="viewport">(Dokument ist leer)</div>';
  }

  const visibleParagraphs = viewportInfo.paragraphs || paragraphs.slice(0, 20);

  const content = visibleParagraphs.map(para => {
    // Escape HTML
    const escapedText = para.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const tag = para.type === 'heading' ? 'h2' : 'p';

    return `<${tag} data-paragraph="${para.index}"><span class="p-num">§${para.index}</span> ${escapedText}</${tag}>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Viewport - ${State.currentFilePath.split('/').pop()}</title>
  <style>
    body { font-family: Georgia, serif; line-height: 1.6; padding: 20px; max-width: 800px; }
    .p-num { color: #888; font-size: 0.8em; margin-right: 8px; }
    h2 { margin-top: 1.5em; }
    p { margin: 0.8em 0; }
    .viewport-info { color: #666; font-size: 0.9em; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="viewport-info">
    Sichtbarer Bereich: §${viewportInfo.from || 1} bis §${viewportInfo.to || paragraphs.length}
    (von ${paragraphs.length} Absätzen)
  </div>
  <div class="viewport">
${content}
  </div>
</body>
</html>`;
}

/**
 * Generiert session.json - Persistenz für spätere Sessions
 */
function generateSessionJson(paragraphs) {
  return JSON.stringify({
    documentPath: State.currentFilePath,
    createdAt: new Date().toISOString(),
    lastContextUpdate: new Date().toISOString(),
    paragraphCount: paragraphs.length,
    totalWords: paragraphs.reduce((sum, p) => sum + p.wordCount, 0),
  }, null, 2);
}

/**
 * Generiert .claude/settings.local.json - Berechtigungen
 * Format: https://docs.anthropic.com/claude-code/settings
 */
function generateSettingsJson(styleGuideInfo) {
  // Erlaube Lesen und Bearbeiten des Dokuments und des Kontext-Ordners
  const documentDir = State.currentFilePath.substring(0, State.currentFilePath.lastIndexOf('/'));
  const allowList = [
    // Dokument lesen und bearbeiten
    `Read:${documentDir}/**`,
    `Edit:${documentDir}/**`,
    `Write:${documentDir}/**`,
    // Bash für Clipboard
    `Bash(xclip:*)`,
    `Bash(xsel:*)`,
  ];

  if (styleGuideInfo?.path) {
    allowList.push(`Read:${styleGuideInfo.path}`);
  }

  return JSON.stringify({
    permissions: {
      allow: allowList,
      deny: [],
      additionalDirectories: [
        documentDir,
      ],
      defaultMode: 'acceptEdits',
    },
  }, null, 2);
}

async function loadStyleGuideInfo() {
  try {
    if (!window.api?.getAppDir) {
      return null;
    }

    const appDirResult = await window.api.getAppDir();
    if (!appDirResult?.success || !appDirResult.appDir) {
      return null;
    }

    const styleGuidePath = `${appDirResult.appDir}/docs/Styleguide-MW.md`;
    return { path: styleGuidePath };
  } catch (error) {
    console.warn('Style guide load failed:', error);
    return null;
  }
}

/**
 * Öffnet Claude Terminal im Kontext-Verzeichnis
 */
export async function openClaudeTerminal() {
  try {
    const contextDir = await generateAndWriteContext();
    await window.claude.openTerminal(contextDir);
    return { success: true, contextDir };
  } catch (error) {
    console.error('Fehler beim Öffnen des Claude Terminals:', error);
    return { success: false, error: error.message };
  }
}

function getDisplayParagraphs(editor) {
  if (!editor) {
    return [];
  }

  const { doc } = editor.state;
  const paragraphs = [];

  const pushParagraph = (node, from, to, type, level = null) => {
    const text = getParagraphText(node, { includeProtected: true });
    if (!text || !text.trim()) {
      return;
    }

    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    paragraphs.push({
      text,
      from,
      to,
      wordCount,
      type,
      level,
    });
  };

  doc.forEach((node, offset) => {
    const from = offset;
    const to = offset + node.nodeSize;

    if (node.type.name === 'paragraph') {
      pushParagraph(node, from, to, 'paragraph');
      return;
    }

    if (node.type.name === 'heading') {
      pushParagraph(node, from, to, 'heading', node.attrs?.level || null);
      return;
    }

    if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
      node.forEach((item, itemOffset) => {
        if (item.type.name !== 'listItem' && item.type.name !== 'taskItem') {
          return;
        }

        const itemFrom = offset + 1 + itemOffset;
        const itemTo = itemFrom + item.nodeSize;
        pushParagraph(item, itemFrom, itemTo, 'listItem');
      });
    }
  });

  return paragraphs;
}
