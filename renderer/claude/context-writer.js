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
  const skillsRootResult = window.skills ? await window.skills.getRoot() : null;
  const skillsRoot = skillsRootResult?.rootDir || null;

  // Generiere Datei-Inhalte
  const claudeMd = generateClaudeMd(paragraphs, cursorInfo, viewportInfo, styleGuideInfo, contextDir);
  const numberedDoc = generateNumberedDocument(paragraphs);
  const viewportHtml = generateViewportHtml(paragraphs, viewportInfo);
  const sessionJson = generateSessionJson(paragraphs);
  const settingsJson = generateSettingsJson(styleGuideInfo, contextDir, skillsRoot);
  const applyEditorEditScript = generateApplyEditorEditScript();

  // Schreibe Dateien über IPC
  const contextFiles = {
    'CLAUDE.md': claudeMd,
    'document-numbered.txt': numberedDoc,
    'viewport.html': viewportHtml,
    'session.json': sessionJson,
    'apply-editor-edit.js': applyEditorEditScript,
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
function generateClaudeMd(paragraphs, cursorInfo, viewportInfo, styleGuideInfo, contextDir) {
  const fileName = State.currentFilePath.split('/').pop();
  const totalWords = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);
  const terminalLogsDir = `${contextDir}/.terminal-logs`;

  let content = `# TipTap AI Kontext

## Dokument
- **Datei:** ${fileName}
- **Pfad:** ${State.currentFilePath}
- **Absätze:** ${paragraphs.length}
- **Wörter:** ~${totalWords}
- **Aktualisiert:** ${new Date().toISOString()}

## Berechtigungen
Direktes Schreiben in die Markdown-Datei ist deaktiviert.
Nutze fuer Textaenderungen die Editor-Bridge.

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

## Terminal Session-Logs
- Terminal-Sessions werden als Logdateien gespeichert.
- Typischer Speicherort: \`${terminalLogsDir}\`
- Namensschema: \`session-YYYY-MM-DDTHH-mm-ss-SSSZ.log\`
- Debug-Log: \`~/.tiptap-ai/terminal-debug.log\`
- Jede Session-Logdatei soll am Anfang einen Summary-Block mit Markern enthalten:
  - \`########## SESSION_SUMMARY_START ##########\`
  - \`########## This is a brief summary of this session ##########\`
  - \`########## SESSION_SUMMARY_END ##########\`
- Checkpoint-Summary (waehrend laufender Session): \`session-....log.summary.checkpoint.json\`
- Status-Dateien fuer Summary-Jobs:
  - \`session-....log.summary.checkpoint.status.json\`
  - \`session-....log.summary.final.status.json\`
- Die Summary enthaelt Navigationsfelder fuer den Voll-Log:
  - \`segment_line_span\` und \`total_segments\`
  - \`file_touch_points\` (pro Datei: \`line_numbers\`, \`segments\`, \`touches\`)
  - \`directory_touch_points\` (analog fuer Verzeichnisse)

Wenn der User nach Session-Logs fragt (z.B. "Welche Session siehst du da?"), dann:
1. Liste zuerst die Dateien in \`${terminalLogsDir}\`
2. Nenne die gefundenen Session-Dateien (neueste zuerst)
3. Lies bei jeder Session zuerst nur den Block zwischen \`SESSION_SUMMARY_START\` und \`SESSION_SUMMARY_END\`
4. Nutze \`file_touch_points\`/\`directory_touch_points\`, um gezielt im Voll-Log zu den relevanten Zeilen/Segmenten zu springen
5. Nutze den Voll-Log nur bei Bedarf fuer Details
`;

  content += `

## Arbeitsanweisungen

### Standard-Workflow (Clipboard)
1. User: "Überarbeite §13, mach es prägnanter"
2. Du zeigst den überarbeiteten Text zur Begutachtung
3. User: "Gut, in Zwischenablage" oder "In Clipboard kopieren"
4. Du kopierst **NUR den reinen Text** - keine Erklärung, kein Kommentar!

### Vor jeder Schreibaktion: Kontext synchronisieren
**PFLICHT vor jedem** \`node apply-editor-edit.js\` oder Clipboard-Ausgabe:
1. \`document-numbered.txt\` neu einlesen (könnte seit letztem Lesen geändert worden sein)
2. Sicherstellen, dass \`old_string\` exakt im aktuellen Stand vorkommt
Erst dann schreiben.

### Direkt-Edit im Editor (ohne Datei-Schreiben)
Nutze immer die Bridge-Datei im Kontext-Ordner:
\`\`\`bash
node apply-editor-edit.js <<'JSON'
{
  "old_string": "exakter alter Text",
  "new_string": "neuer Text"
}
JSON
\`\`\`
Regeln:
- \`old_string\` muss exakt und eindeutig im aktuellen Editorinhalt vorkommen.
- Kein \`Edit ${State.currentFilePath}\` verwenden.
- Nicht direkt in Dateien schreiben.

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
- Fuer Direkt-Edit immer \`node apply-editor-edit.js\` verwenden.
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
function generateSettingsJson(styleGuideInfo, contextDir, skillsRoot = null) {
  // Erlaube Lesen im Dokumentordner und Schreiben nur im Kontext-Ordner
  const documentDir = State.currentFilePath.substring(0, State.currentFilePath.lastIndexOf('/'));
  // Absolute Pfade erfordern //-Prefix im Claude Code Permissions-Format: Read(//abs/path/**)
  const abs = (absPath) => `/${absPath}`;
  const allowList = [
    // Dokument nur lesen
    `Read(${abs(documentDir)}/**)`,
    // Kontextdateien fuer Editor-Bridge
    `Read(${abs(contextDir)}/**)`,
    `Edit(${abs(contextDir)}/**)`,
    `Write(${abs(contextDir)}/**)`,
    // Bash fuer Clipboard + Bridge-Script
    `Bash(node:*)`,
    `Bash(xclip:*)`,
    `Bash(xsel:*)`,
  ];

  if (skillsRoot) {
    allowList.push(`Read(${abs(skillsRoot)}/**)`);
  }

  if (styleGuideInfo?.path) {
    allowList.push(`Read(${abs(styleGuideInfo.path)})`);
  }

  return JSON.stringify({
    permissions: {
      allow: allowList,
      deny: [
        `Edit(${abs(documentDir)}/**)`,
        `Write(${abs(documentDir)}/**)`,
      ],
      additionalDirectories: [
        documentDir,
        contextDir,
      ],
      defaultMode: 'acceptEdits',
    },
  }, null, 2);
}

function generateApplyEditorEditScript() {
  return `#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();
  const requestPath = path.join(cwd, 'editor-edit-request.json');
  const responsePath = path.join(cwd, 'editor-edit-response.json');
  const waitMsArg = args.find(arg => arg.startsWith('--wait-ms='));
  const waitMs = waitMsArg ? Number(waitMsArg.split('=')[1]) : 20000;

  let payloadRaw = '';
  if (args[0] === '--file' && args[1]) {
    payloadRaw = await fs.readFile(args[1], 'utf-8');
  } else {
    payloadRaw = await readStdin();
  }

  if (!payloadRaw || !payloadRaw.trim()) {
    console.error('Usage: node apply-editor-edit.js <<\\'JSON\\' ... JSON');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch (error) {
    console.error('Invalid JSON payload:', error.message);
    process.exit(1);
  }

  if (typeof payload.old_string !== 'string' || typeof payload.new_string !== 'string') {
    console.error('Payload requires string fields: old_string, new_string');
    process.exit(1);
  }

  const id = \`\${Date.now()}-\${Math.random().toString(16).slice(2, 10)}\`;
  const request = {
    id,
    operation: 'replace_once',
    old_string: payload.old_string,
    new_string: payload.new_string,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(requestPath, JSON.stringify(request, null, 2), 'utf-8');
  console.log(\`[TipTap AI] edit request written: \${id}\`);

  const maxWaitMs = Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 20000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const response = await readJsonIfExists(responsePath);
    if (response && response.id === id) {
      if (response.success) {
        if (response.fileSaved) {
          console.log('[TipTap AI] editor update applied and saved to disk');
        } else {
          console.log('[TipTap AI] editor update applied (not yet saved to disk)');
        }
        process.exit(0);
      }

      console.error('[TipTap AI] editor update failed:', response.error || 'unknown error');
      process.exit(2);
    }

    await sleep(250);
  }

  console.log('[TipTap AI] request submitted; response pending');
}

main().catch((error) => {
  console.error('Failed to submit editor edit request:', error);
  process.exit(1);
});
`;
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
