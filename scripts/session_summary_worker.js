#!/usr/bin/env node

/**
 * Session Summary Worker
 *
 * Separater Prozess für KI-basierte Session-Zusammenfassungen aus Terminal-Logs.
 * - mode=final: schreibt Summary-Block an den Anfang der Session-Logdatei.
 * - mode=checkpoint: schreibt Sidecar-JSON ohne die aktive Logdatei zu verändern.
 */

const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

const SUMMARY_START_MARKER = '########## SESSION_SUMMARY_START ##########';
const SUMMARY_TITLE_MARKER = '########## This is a brief summary of this session ##########';
const SUMMARY_END_MARKER = '########## SESSION_SUMMARY_END ##########';

const DEFAULT_MODEL = 'haiku';
const DEFAULT_FALLBACK_MODEL = 'sonnet';
const DEFAULT_TIMEOUT_MS = 180000;
const PROMPT_LOG_SLICE_CHARS = 14000;
const CHUNK_MAX_CHARS = 90000;
const MAX_USER_REQUESTS = 25;
const MAX_COMMANDS = 40;
const MAX_DIRS = 40;
const MAX_FILES = 60;
const MAX_TOOLS = 25;
const MAX_SIGNALS = 20;
const SEGMENT_LINE_SPAN = 400;
const MAX_FILE_TOUCH_ENTRIES = 40;
const MAX_DIR_TOUCH_ENTRIES = 25;
const MAX_TOUCH_POINTS_PER_FILE = 8;
const MAX_TOUCH_POINTS_PER_DIR = 6;
const MAX_LINE_NUMBERS_PER_PATH = 20;
const MAX_SEGMENTS_PER_PATH = 12;
const MAX_CONTEXT_CHARS = 160;
const MAX_AI_LOG_CHARS = 700000;

const COMMON_COMMANDS = new Set([
  'bash', 'sh', 'zsh', 'fish',
  'ls', 'cd', 'pwd', 'cat', 'less', 'head', 'tail', 'find', 'rg', 'grep', 'awk', 'sed', 'cut', 'sort', 'uniq',
  'cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod', 'chown',
  'git', 'gh',
  'node', 'npm', 'npx', 'pnpm', 'yarn',
  'python', 'python3', 'pip', 'pip3', 'conda',
  'ffmpeg', 'ffprobe',
  'curl', 'wget', 'jq',
  'docker', 'docker-compose', 'make',
  'claude',
]);

const STOPWORDS = new Set([
  'und', 'oder', 'aber', 'dass', 'weil', 'wurde', 'werden', 'haben', 'hatte', 'noch', 'auch', 'hier',
  'dies', 'diese', 'dieser', 'einer', 'einem', 'einen', 'nicht', 'kein', 'keine', 'mit', 'ohne', 'über',
  'from', 'with', 'that', 'this', 'have', 'has', 'had', 'will', 'would', 'into', 'your', 'you', 'for', 'the',
  'was', 'are', 'can', 'cant', 'dont', 'und', 'ein', 'eine', 'eines', 'einer', 'einem',
]);

function parseArgs(argv) {
  const args = {
    mode: 'final',
    model: DEFAULT_MODEL,
    fallbackModel: DEFAULT_FALLBACK_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--log-file' && next) {
      args.logFile = next;
      i += 1;
    } else if (token === '--mode' && next) {
      args.mode = next;
      i += 1;
    } else if (token === '--model' && next) {
      args.model = next;
      i += 1;
    } else if (token === '--fallback-model' && next) {
      args.fallbackModel = next;
      i += 1;
    } else if (token === '--status-file' && next) {
      args.statusFile = next;
      i += 1;
    } else if (token === '--timeout-ms' && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) args.timeoutMs = parsed;
      i += 1;
    }
  }

  return args;
}

function assertArgs(args) {
  if (!args.logFile) {
    throw new Error('Missing required argument: --log-file');
  }
  if (!['final', 'checkpoint'].includes(args.mode)) {
    throw new Error('Invalid --mode. Expected: final|checkpoint');
  }
}

function stripExistingSummaryBlock(logContent) {
  if (!logContent.startsWith(SUMMARY_START_MARKER)) return logContent;
  const endIdx = logContent.indexOf(SUMMARY_END_MARKER);
  if (endIdx === -1) return logContent;
  const afterEnd = endIdx + SUMMARY_END_MARKER.length;
  return logContent.slice(afterEnd).replace(/^\r?\n+/, '');
}

function normalizeLogForAnalysis(logContent) {
  return logContent
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n');
}

function splitIntoChunks(text, maxChars = CHUNK_MAX_CHARS) {
  if (text.length <= maxChars) return [text];
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = line;
    } else if (candidate.length > maxChars) {
      // Einzelne sehr lange Zeile hart splitten.
      for (let idx = 0; idx < line.length; idx += maxChars) {
        chunks.push(line.slice(idx, idx + maxChars));
      }
      current = '';
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function uniqueTrimmed(values, maxItems = 80) {
  const out = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function truncateText(value, maxChars = MAX_CONTEXT_CHARS) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
}

function normalizePathToken(rawToken) {
  return String(rawToken || '')
    .trim()
    .replace(/^[("'`]+/, '')
    .replace(/[)"'`,;:.!?]+$/, '');
}

function looksLikeCommand(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  const firstToken = value.split(/\s+/)[0];
  if (COMMON_COMMANDS.has(firstToken)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(firstToken)) return true;
  if (value.startsWith('./') || value.startsWith('/') || value.startsWith('../')) return true;
  if (/[|&;><`$()]/.test(value) && /\s/.test(value)) return true;

  return false;
}

function looksLikeUserIntentLine(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (looksLikeCommand(value)) return false;
  if (!/\s/.test(value)) return false;
  if (!/[A-Za-zÄÖÜäöüß]/.test(value)) return false;
  return true;
}

function isNoiseLine(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  if (/^[\u2500-\u257f\s]+$/.test(value)) return true;
  if (/^(Perusing|Thinking|Analyzing|Loading|Processing)\b/i.test(value)) return true;
  if (/^(✻|✽|⏵⏵|❯)\s*(Perusing|Thinking|Analyzing|Loading|Processing)/i.test(value)) return true;
  if (/accepteditson/i.test(value)) return true;
  return false;
}

function isErrorSignalLine(text) {
  return /\b(error|failed|exception|traceback|not found|no such file|permission denied|invalid|fatal)\b/i.test(text);
}

function isResultSignalLine(text) {
  return /\b(done|success|generated|saved|written|created|fixed|resolved|updated|completed)\b/i.test(text);
}

function extractPathsFromLine(line) {
  const absPathRegex = /\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\/?/g;
  const relPathRegex = /(?:^|[\s"'`(])((?:\.\.?\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?:\/)?(?:\.[A-Za-z0-9._-]+)?)/g;
  const files = [];
  const dirs = [];

  const processToken = (token) => {
    const cleaned = normalizePathToken(token);
    if (!cleaned || cleaned.length < 2) return;
    const lastSegment = cleaned.split('/').filter(Boolean).pop() || '';
    const isFileLike = /\.[A-Za-z0-9_-]{1,10}$/.test(lastSegment);
    if (isFileLike) files.push(cleaned);
    else dirs.push(cleaned.endsWith('/') ? cleaned.slice(0, -1) : cleaned);
  };

  let match;
  while ((match = absPathRegex.exec(line)) !== null) {
    processToken(match[0]);
  }
  while ((match = relPathRegex.exec(line)) !== null) {
    processToken(match[1]);
  }

  return {
    files: uniqueTrimmed(files, MAX_FILES),
    dirs: uniqueTrimmed(dirs, MAX_DIRS),
  };
}

function lineKindFromContext(line) {
  if (line.startsWith('>>> ')) {
    const payload = line.slice(4).trim();
    return looksLikeCommand(payload) ? 'input_command' : 'user_request';
  }
  if (/^❯\s+/.test(line)) return 'user_request';
  if (isErrorSignalLine(line)) return 'error_output';
  if (isResultSignalLine(line)) return 'result_output';
  if (/\$\s+.+$/.test(line)) return 'shell_prompt';
  return 'output';
}

function recordPathTouch(map, key, lineNo, lineKind, contextLine, options = {}) {
  if (!key) return;
  const {
    maxTouches = MAX_TOUCH_POINTS_PER_FILE,
    segmentLineSpan = SEGMENT_LINE_SPAN,
  } = options;

  const normalizedKey = String(key).trim();
  if (!normalizedKey) return;

  const segment = Math.floor((lineNo - 1) / segmentLineSpan) + 1;
  if (!map.has(normalizedKey)) {
    map.set(normalizedKey, {
      path: normalizedKey,
      total_mentions: 0,
      line_numbers: [],
      segments: [],
      touches: [],
    });
  }

  const entry = map.get(normalizedKey);
  entry.total_mentions += 1;

  if (!entry.line_numbers.includes(lineNo) && entry.line_numbers.length < MAX_LINE_NUMBERS_PER_PATH) {
    entry.line_numbers.push(lineNo);
  }
  if (!entry.segments.includes(segment) && entry.segments.length < MAX_SEGMENTS_PER_PATH) {
    entry.segments.push(segment);
  }
  if (entry.touches.length < maxTouches) {
    entry.touches.push({
      line: lineNo,
      segment,
      kind: lineKind,
      context: truncateText(contextLine),
    });
  }
}

function mapToTouchPointArray(map, maxEntries) {
  return Array.from(map.values())
    .sort((a, b) => b.total_mentions - a.total_mentions || a.path.localeCompare(b.path))
    .slice(0, maxEntries)
    .map((entry) => {
      const lineNumbers = [...entry.line_numbers].sort((a, b) => a - b);
      const segments = [...entry.segments].sort((a, b) => a - b);
      return {
        path: entry.path,
        total_mentions: entry.total_mentions,
        first_line: lineNumbers[0] || null,
        last_line: lineNumbers[lineNumbers.length - 1] || null,
        line_numbers: lineNumbers,
        segments,
        touches: entry.touches,
      };
    });
}

function extractTopKeywords(texts, maxItems = 30) {
  const freq = new Map();
  for (const text of texts) {
    const tokens = String(text || '').toLowerCase().match(/[a-zA-Zäöüß0-9._+-]{3,}/g) || [];
    for (const token of tokens) {
      if (STOPWORDS.has(token)) continue;
      if (/^\d+$/.test(token)) continue;
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([token]) => token);
}

function extractHeuristicEvidence(analysisText) {
  const lines = analysisText.split('\n');
  const userRequests = [];
  const commands = [];
  const files = [];
  const dirs = [];
  const fileMentions = new Map();
  const dirMentions = new Map();
  const tools = [];
  const errorSignals = [];
  const resultSignals = [];
  const interactions = [];

  let currentInteraction = null;

  const addToolFromCommand = (commandText) => {
    const first = String(commandText || '').trim().split(/\s+/)[0];
    if (!first) return;
    const normalized = first.replace(/[^A-Za-z0-9._-]/g, '');
    if (!normalized) return;
    tools.push(normalized);
  };

  const addUserRequest = (requestText, lineNo) => {
    if (!looksLikeUserIntentLine(requestText)) return;
    const value = requestText.trim();
    userRequests.push(value);
    currentInteraction = {
      request: value,
      line: lineNo,
      response_hints: [],
    };
    interactions.push(currentInteraction);
  };

  const addCommand = (commandText) => {
    const value = commandText.trim();
    if (!value) return;
    commands.push(value);
    addToolFromCommand(value);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    const lineNo = i + 1;
    const lineKind = lineKindFromContext(line);

    const extracted = extractPathsFromLine(line);
    for (const filePath of extracted.files) {
      files.push(filePath);
      recordPathTouch(fileMentions, filePath, lineNo, lineKind, line, {
        maxTouches: MAX_TOUCH_POINTS_PER_FILE,
        segmentLineSpan: SEGMENT_LINE_SPAN,
      });
    }
    for (const dirPath of extracted.dirs) {
      dirs.push(dirPath);
      recordPathTouch(dirMentions, dirPath, lineNo, lineKind, line, {
        maxTouches: MAX_TOUCH_POINTS_PER_DIR,
        segmentLineSpan: SEGMENT_LINE_SPAN,
      });
    }

    if (!isNoiseLine(line)) {
      if (isErrorSignalLine(line)) {
        errorSignals.push(line);
        if (currentInteraction && lineNo - currentInteraction.line <= 260 && currentInteraction.response_hints.length < 5) {
          currentInteraction.response_hints.push(`error: ${line}`);
        }
      } else if (isResultSignalLine(line)) {
        resultSignals.push(line);
        if (currentInteraction && lineNo - currentInteraction.line <= 260 && currentInteraction.response_hints.length < 5) {
          currentInteraction.response_hints.push(`result: ${line}`);
        }
      }
    }

    if (line.startsWith('>>> ')) {
      const payload = line.slice(4).trim();
      if (!payload) continue;
      if (looksLikeCommand(payload)) addCommand(payload);
      else addUserRequest(payload, lineNo);
      continue;
    }

    const claudePromptMatch = line.match(/^❯\s*(.+)$/);
    if (claudePromptMatch && claudePromptMatch[1]) {
      const candidate = claudePromptMatch[1].trim();
      if (looksLikeUserIntentLine(candidate)) {
        addUserRequest(candidate, lineNo);
      }
      continue;
    }

    const shellPromptMatch = line.match(/\$\s+(.+)$/);
    if (shellPromptMatch && shellPromptMatch[1]) {
      const commandText = shellPromptMatch[1].trim();
      if (looksLikeCommand(commandText)) {
        addCommand(commandText);
      }
    }
  }

  const compactInteractions = interactions
    .filter((entry) => entry.request)
    .slice(-20)
    .map((entry) => ({
      request: entry.request,
      response_hints: uniqueTrimmed(entry.response_hints, 4),
    }));

  const allKeywordSources = [
    ...userRequests,
    ...commands,
    ...errorSignals,
    ...resultSignals,
  ];

  const totalSegments = Math.max(1, Math.ceil(lines.length / SEGMENT_LINE_SPAN));

  return {
    scan_mode: 'heuristic_fullscan',
    total_lines: lines.length,
    total_chars: analysisText.length,
    segment_line_span: SEGMENT_LINE_SPAN,
    total_segments: totalSegments,
    user_request_count: userRequests.length,
    command_count: commands.length,
    user_requests: uniqueTrimmed(userRequests, MAX_USER_REQUESTS),
    command_samples: uniqueTrimmed(commands, MAX_COMMANDS),
    directories_mentioned: uniqueTrimmed(dirs, MAX_DIRS),
    files_mentioned: uniqueTrimmed(files, MAX_FILES),
    file_touch_points: mapToTouchPointArray(fileMentions, MAX_FILE_TOUCH_ENTRIES),
    directory_touch_points: mapToTouchPointArray(dirMentions, MAX_DIR_TOUCH_ENTRIES),
    tools_detected: uniqueTrimmed(tools, MAX_TOOLS),
    error_signals: uniqueTrimmed(errorSignals, MAX_SIGNALS),
    result_signals: uniqueTrimmed(resultSignals, MAX_SIGNALS),
    request_response_windows: compactInteractions,
    inferred_intent_keywords: extractTopKeywords(allKeywordSources, 35),
  };
}

function filterByLogEvidence(values, analysisText, maxItems = 80) {
  const normalizedLog = analysisText.toLowerCase();
  const filtered = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const lower = value.toLowerCase();
    const basename = path.basename(value).toLowerCase();
    const hasEvidence = normalizedLog.includes(lower) || (basename && basename.length >= 3 && normalizedLog.includes(basename));
    if (!hasEvidence) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    filtered.push(value);
    if (filtered.length >= maxItems) break;
  }
  return filtered;
}

function pickStatus(values) {
  const ranked = ['blocked', 'partial', 'done', 'unknown'];
  for (const status of ranked) {
    if (values.includes(status)) return status;
  }
  return 'unknown';
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function writeStatus(statusFile, payload) {
  if (!statusFile) return;
  const content = {
    ...payload,
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(statusFile, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function buildSummaryBlock(summaryObject) {
  return `${SUMMARY_START_MARKER}
${SUMMARY_TITLE_MARKER}
${JSON.stringify(summaryObject, null, 2)}
${SUMMARY_END_MARKER}

`;
}

async function writeFileAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

function buildChunkSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'problem_points',
      'solution_points',
      'directories',
      'files_modified',
      'files_created',
      'artifacts',
      'tools_and_commands',
      'topic_tags',
      'semantic_keywords',
      'open_points',
      'status_hint',
    ],
    properties: {
      problem_points: { type: 'array', items: { type: 'string' } },
      solution_points: { type: 'array', items: { type: 'string' } },
      directories: { type: 'array', items: { type: 'string' } },
      files_modified: { type: 'array', items: { type: 'string' } },
      files_created: { type: 'array', items: { type: 'string' } },
      artifacts: { type: 'array', items: { type: 'string' } },
      tools_and_commands: { type: 'array', items: { type: 'string' } },
      topic_tags: { type: 'array', items: { type: 'string' } },
      semantic_keywords: { type: 'array', items: { type: 'string' } },
      open_points: { type: 'array', items: { type: 'string' } },
      status_hint: {
        type: 'string',
        enum: ['done', 'partial', 'blocked', 'unknown'],
      },
    },
  };
}

function buildFinalSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'problem_context',
      'solution_approach',
      'status',
      'user_requests',
      'inferred_questions',
      'outcomes_by_question',
      'directories_worked',
      'files_modified_likely',
      'files_created_likely',
      'artifacts_created_likely',
      'tools_and_commands',
      'topic_tags',
      'semantic_keywords',
      'open_points',
      'resume_hint',
    ],
    properties: {
      problem_context: { type: 'string' },
      solution_approach: { type: 'string' },
      status: { type: 'string', enum: ['done', 'partial', 'blocked', 'unknown'] },
      user_requests: { type: 'array', items: { type: 'string' } },
      inferred_questions: { type: 'array', items: { type: 'string' } },
      outcomes_by_question: { type: 'array', items: { type: 'string' } },
      directories_worked: { type: 'array', items: { type: 'string' } },
      files_modified_likely: { type: 'array', items: { type: 'string' } },
      files_created_likely: { type: 'array', items: { type: 'string' } },
      artifacts_created_likely: { type: 'array', items: { type: 'string' } },
      tools_and_commands: { type: 'array', items: { type: 'string' } },
      topic_tags: { type: 'array', items: { type: 'string' } },
      semantic_keywords: { type: 'array', items: { type: 'string' } },
      open_points: { type: 'array', items: { type: 'string' } },
      resume_hint: { type: 'string' },
    },
  };
}

function buildChunkPrompt(chunkText, chunkIndex, chunkTotal) {
  return `Du extrahierst strukturierte Fakten aus einem Terminal-Session-Log.

Regeln:
- Nutze nur belegbare Inhalte aus dem Chunk.
- Keine Halluzinationen.
- Pfade/Dateien exakt aus dem Text übernehmen, falls vorhanden.
- Fokus auf Suchbarkeit (Themen, Keywords, Tools, Verzeichnisse, Dateien).
- Kurze, präzise String-Einträge.

Kontext:
- Chunk ${chunkIndex + 1} von ${chunkTotal}

Log-Chunk:
<<<SESSION_CHUNK
${chunkText}
SESSION_CHUNK>>>
`;
}

function buildFinalPrompt(evidence, logHead, logTail, mode) {
  return `Erzeuge eine knappe, suchbare Session-Zusammenfassung als JSON.

Regeln:
1) Nur belegte Fakten aus den Evidenzen verwenden.
2) User-Anfragen sind der wichtigste Intent-Kanal. Priorisiere sie klar.
3) Interne Agent-Artefakte (Perusing/Thinking/Spinner) ignorieren.
4) Wenn unklar, eher allgemein und vorsichtig formulieren; keine Halluzinationen.
5) Fokus: spätere Wiederauffindung von Themen wie Dateiformate, Transcoding, Verzeichnisse, Dateien, Tools.
6) Felder topic_tags (5-12) und semantic_keywords (12-25) befüllen.
7) problem_context und solution_approach jeweils max. 2 Sätze.
8) mode=${mode}.
9) Fülle user_requests mit den wichtigsten expliziten Anfragen.
10) Fülle inferred_questions als abstrahierte Fragestellungen (suchfreundlich).
11) Fülle outcomes_by_question als kurze Frage→Ergebnis-Punkte (falls unbekannt: "offen").

Aggregierte Evidenz (aus vollständigem Log, heuristisch gescannt):
${JSON.stringify(evidence, null, 2)}

Log-Anfang (Ausschnitt):
<<<LOG_HEAD
${logHead}
LOG_HEAD>>>

Log-Ende (Ausschnitt):
<<<LOG_TAIL
${logTail}
LOG_TAIL>>>
`;
}

async function runClaudeStructured({ model, schema, prompt, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--model',
      model,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
    ];

    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`claude timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed && typeof parsed === 'object' && parsed.structured_output) {
          resolve(parsed.structured_output);
          return;
        }
        resolve(parsed);
      } catch (parseError) {
        reject(new Error(`Failed to parse claude JSON output: ${parseError.message}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function collectEvidenceFromChunks(logText, model, timeoutMs) {
  const schema = buildChunkSchema();
  const chunks = splitIntoChunks(logText, CHUNK_MAX_CHARS);
  const collected = {
    problem_points: [],
    solution_points: [],
    directories: [],
    files_modified: [],
    files_created: [],
    artifacts: [],
    tools_and_commands: [],
    topic_tags: [],
    semantic_keywords: [],
    open_points: [],
    status_hints: [],
    chunks_processed: chunks.length,
  };

  for (let i = 0; i < chunks.length; i += 1) {
    const prompt = buildChunkPrompt(chunks[i], i, chunks.length);
    const out = await runClaudeStructured({
      model,
      schema,
      prompt,
      timeoutMs,
    });

    collected.problem_points.push(...(out.problem_points || []));
    collected.solution_points.push(...(out.solution_points || []));
    collected.directories.push(...(out.directories || []));
    collected.files_modified.push(...(out.files_modified || []));
    collected.files_created.push(...(out.files_created || []));
    collected.artifacts.push(...(out.artifacts || []));
    collected.tools_and_commands.push(...(out.tools_and_commands || []));
    collected.topic_tags.push(...(out.topic_tags || []));
    collected.semantic_keywords.push(...(out.semantic_keywords || []));
    collected.open_points.push(...(out.open_points || []));
    if (out.status_hint) collected.status_hints.push(out.status_hint);
  }

  return {
    problem_points: uniqueTrimmed(collected.problem_points, 24),
    solution_points: uniqueTrimmed(collected.solution_points, 24),
    directories: uniqueTrimmed(collected.directories, 40),
    files_modified: uniqueTrimmed(collected.files_modified, 50),
    files_created: uniqueTrimmed(collected.files_created, 50),
    artifacts: uniqueTrimmed(collected.artifacts, 50),
    tools_and_commands: uniqueTrimmed(collected.tools_and_commands, 40),
    topic_tags: uniqueTrimmed(collected.topic_tags, 20),
    semantic_keywords: uniqueTrimmed(collected.semantic_keywords, 40),
    open_points: uniqueTrimmed(collected.open_points, 30),
    status_hint: pickStatus(collected.status_hints),
    chunks_processed: collected.chunks_processed,
  };
}

async function buildSummaryCore({ logText, mode, model, timeoutMs }) {
  const schema = buildFinalSchema();
  const heuristicEvidence = extractHeuristicEvidence(logText);
  const head = logText.slice(0, PROMPT_LOG_SLICE_CHARS);
  const tail = logText.slice(Math.max(0, logText.length - PROMPT_LOG_SLICE_CHARS));
  const finalPrompt = buildFinalPrompt(heuristicEvidence, head, tail, mode);
  const finalCore = await runClaudeStructured({
    model,
    schema,
    prompt: finalPrompt,
    timeoutMs,
  });
  return {
    finalCore,
    evidence: {
      ...heuristicEvidence,
      chunks_processed: 1,
      single_pass: true,
    },
  };
}

function needsFallback(summaryCore) {
  const keywordCount = (summaryCore.semantic_keywords || []).length;
  const tagCount = (summaryCore.topic_tags || []).length;
  const signalCount = (summaryCore.directories_worked || []).length
    + (summaryCore.files_modified_likely || []).length
    + (summaryCore.files_created_likely || []).length
    + (summaryCore.tools_and_commands || []).length;
  return keywordCount < 8 || tagCount < 4 || signalCount < 3;
}

function sanitizeFinalCore(finalCore, analysisText) {
  const directories = filterByLogEvidence(finalCore.directories_worked, analysisText, 30);
  const filesModified = filterByLogEvidence(finalCore.files_modified_likely, analysisText, 40);
  const filesCreated = filterByLogEvidence(finalCore.files_created_likely, analysisText, 40);
  const artifacts = filterByLogEvidence(finalCore.artifacts_created_likely, analysisText, 30);

  return {
    problem_context: String(finalCore.problem_context || '').trim(),
    solution_approach: String(finalCore.solution_approach || '').trim(),
    status: ['done', 'partial', 'blocked', 'unknown'].includes(finalCore.status) ? finalCore.status : 'unknown',
    user_requests: uniqueTrimmed(finalCore.user_requests, 20),
    inferred_questions: uniqueTrimmed(finalCore.inferred_questions, 15),
    outcomes_by_question: uniqueTrimmed(finalCore.outcomes_by_question, 15),
    directories_worked: uniqueTrimmed(directories, 30),
    files_modified_likely: uniqueTrimmed(filesModified, 40),
    files_created_likely: uniqueTrimmed(filesCreated, 40),
    artifacts_created_likely: uniqueTrimmed(artifacts, 30),
    tools_and_commands: uniqueTrimmed(finalCore.tools_and_commands, 25),
    topic_tags: uniqueTrimmed(finalCore.topic_tags, 12),
    semantic_keywords: uniqueTrimmed(finalCore.semantic_keywords, 25),
    open_points: uniqueTrimmed(finalCore.open_points, 12),
    resume_hint: String(finalCore.resume_hint || '').trim(),
  };
}

async function summarizeLog({ analysisText, mode, model, fallbackModel, timeoutMs }) {
  const attemptModels = [model];
  if (fallbackModel && fallbackModel !== model) attemptModels.push(fallbackModel);

  let lastError = null;
  for (let i = 0; i < attemptModels.length; i += 1) {
    const attemptModel = attemptModels[i];
    try {
      const { finalCore, evidence } = await buildSummaryCore({
        logText: analysisText,
        mode,
        model: attemptModel,
        timeoutMs,
      });

      const sanitized = sanitizeFinalCore(finalCore, analysisText);
      if (i < attemptModels.length - 1 && needsFallback(sanitized)) {
        continue;
      }

      return {
        modelUsed: attemptModel,
        summaryCore: sanitized,
        evidenceMeta: {
          scan_mode: evidence.scan_mode || 'heuristic_fullscan',
          chunks_processed: evidence.chunks_processed || 1,
          single_pass: Boolean(evidence.single_pass),
          segment_line_span: evidence.segment_line_span || SEGMENT_LINE_SPAN,
          total_segments: evidence.total_segments || null,
          file_touch_points: evidence.file_touch_points || [],
          directory_touch_points: evidence.directory_touch_points || [],
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unknown summarize failure');
}

function buildHeuristicFallbackSummary({ analysisText, failureReason }) {
  const evidence = extractHeuristicEvidence(analysisText);
  const status = evidence.error_signals.length > 0
    ? (evidence.result_signals.length > 0 ? 'partial' : 'blocked')
    : (evidence.result_signals.length > 0 ? 'done' : 'unknown');

  const inferredQuestions = (evidence.request_response_windows || [])
    .map((entry) => entry.request)
    .filter(Boolean)
    .slice(0, 15);

  const outcomes = (evidence.request_response_windows || [])
    .slice(0, 15)
    .map((entry) => {
      const hints = (entry.response_hints || []).slice(0, 2).join(' | ');
      if (!hints) return `${entry.request} -> offen`;
      return `${entry.request} -> ${hints}`;
    });

  const problemContext = evidence.user_requests.length > 0
    ? `User-Anfragen fokussierten auf: ${evidence.user_requests.slice(0, 3).join(' | ')}`
    : 'Session-Log ohne klar extrahierbare User-Anfragen.';
  const solutionApproach = evidence.command_samples.length > 0
    ? `Arbeit erfolgte ueber Terminal-Kommandos/Tools: ${evidence.command_samples.slice(0, 4).join(' | ')}`
    : 'Kein stabiler Command-Flow extrahierbar; heuristische Zusammenfassung aus Logsignalen.';
  const resumeHint = evidence.directories_mentioned[0]
    ? `Mit Verzeichnis ${evidence.directories_mentioned[0]} starten und bei Segment ${evidence.file_touch_points?.[0]?.touches?.[0]?.segment || 1} ansetzen.`
    : 'Mit den letzten user_requests/inferred_questions starten und bei Bedarf Voll-Log pruefen.';

  return {
    modelUsed: 'heuristic_fallback',
    summaryCore: {
      problem_context: truncateText(problemContext, 260),
      solution_approach: truncateText(solutionApproach, 260),
      status,
      user_requests: uniqueTrimmed(evidence.user_requests, 20),
      inferred_questions: uniqueTrimmed(inferredQuestions, 15),
      outcomes_by_question: uniqueTrimmed(outcomes, 15),
      directories_worked: uniqueTrimmed(evidence.directories_mentioned, 30),
      files_modified_likely: uniqueTrimmed(evidence.files_mentioned, 40),
      files_created_likely: [],
      artifacts_created_likely: [],
      tools_and_commands: uniqueTrimmed([
        ...(evidence.tools_detected || []),
        ...(evidence.command_samples || []),
      ], 25),
      topic_tags: uniqueTrimmed(evidence.inferred_intent_keywords, 12),
      semantic_keywords: uniqueTrimmed(evidence.inferred_intent_keywords, 25),
      open_points: uniqueTrimmed([
        ...(evidence.error_signals || []),
        failureReason ? `summary_fallback_reason: ${failureReason}` : '',
      ], 12),
      resume_hint: truncateText(resumeHint, 260),
    },
    evidenceMeta: {
      scan_mode: 'heuristic_fallback',
      chunks_processed: 0,
      single_pass: true,
      segment_line_span: evidence.segment_line_span || SEGMENT_LINE_SPAN,
      total_segments: evidence.total_segments || null,
      file_touch_points: evidence.file_touch_points || [],
      directory_touch_points: evidence.directory_touch_points || [],
    },
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  assertArgs(args);

  const logFile = path.resolve(args.logFile);
  const statusFile = args.statusFile ? path.resolve(args.statusFile) : null;

  await writeStatus(statusFile, {
    state: 'running',
    mode: args.mode,
    log_file: logFile,
    model: args.model,
    fallback_model: args.fallbackModel,
  });

  const originalLog = await fs.readFile(logFile, 'utf8');
  const logWithoutSummary = stripExistingSummaryBlock(originalLog);
  const analysisText = normalizeLogForAnalysis(logWithoutSummary);
  const sourceBytes = Buffer.byteLength(logWithoutSummary, 'utf8');
  const sourceHash = sha256(logWithoutSummary);

  let modelUsed;
  let summaryCore;
  let evidenceMeta;
  if (analysisText.length > MAX_AI_LOG_CHARS) {
    const fallback = buildHeuristicFallbackSummary({
      analysisText,
      failureReason: `analysis_text_too_large:${analysisText.length}`,
    });
    modelUsed = fallback.modelUsed;
    summaryCore = fallback.summaryCore;
    evidenceMeta = fallback.evidenceMeta;
  } else {
    try {
      const result = await summarizeLog({
        analysisText,
        mode: args.mode,
        model: args.model,
        fallbackModel: args.fallbackModel,
        timeoutMs: args.timeoutMs,
      });
      modelUsed = result.modelUsed;
      summaryCore = result.summaryCore;
      evidenceMeta = result.evidenceMeta;
    } catch (error) {
      const fallback = buildHeuristicFallbackSummary({
        analysisText,
        failureReason: error?.message || 'unknown',
      });
      modelUsed = fallback.modelUsed;
      summaryCore = fallback.summaryCore;
      evidenceMeta = fallback.evidenceMeta;
    }
  }

  const summaryObject = {
    summary_version: '1.0',
    summary_kind: args.mode,
    generated_at: new Date().toISOString(),
    source_log_path: logFile,
    source_hash_sha256: sourceHash,
    source_bytes: sourceBytes,
    model_used: modelUsed,
    scan_mode: evidenceMeta.scan_mode || 'heuristic_fullscan',
    chunks_processed: evidenceMeta.chunks_processed,
    segment_line_span: evidenceMeta.segment_line_span || SEGMENT_LINE_SPAN,
    total_segments: evidenceMeta.total_segments || null,
    file_touch_points: evidenceMeta.file_touch_points || [],
    directory_touch_points: evidenceMeta.directory_touch_points || [],
    ...summaryCore,
  };

  let outputPath;
  if (args.mode === 'checkpoint') {
    outputPath = `${logFile}.summary.checkpoint.json`;
    await fs.writeFile(outputPath, `${JSON.stringify(summaryObject, null, 2)}\n`, 'utf8');
  } else {
    outputPath = logFile;
    const summaryBlock = buildSummaryBlock(summaryObject);
    const finalContent = `${summaryBlock}${logWithoutSummary}`;
    await writeFileAtomic(logFile, finalContent);
  }

  await writeStatus(statusFile, {
    state: 'done',
    mode: args.mode,
    log_file: logFile,
    output_path: outputPath,
    source_hash_sha256: sourceHash,
    source_bytes: sourceBytes,
    model_used: modelUsed,
    chunks_processed: evidenceMeta.chunks_processed,
  });

  process.stdout.write(`${JSON.stringify({ success: true, mode: args.mode, output_path: outputPath })}\n`);
}

run().catch(async (error) => {
  const args = parseArgs(process.argv.slice(2));
  const statusFile = args.statusFile ? path.resolve(args.statusFile) : null;
  try {
    await writeStatus(statusFile, {
      state: 'failed',
      mode: args.mode || 'unknown',
      log_file: args.logFile ? path.resolve(args.logFile) : null,
      error: error.message,
    });
  } catch {
    // ignore status write failure
  }
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
