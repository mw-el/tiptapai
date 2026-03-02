import { showInputModal } from '../ui/input-modal.js';
import { showStatus } from '../ui/status.js';

const PREVIEW_MAX_CHARS = 2500;

const state = {
  initialized: false,
  isOpen: false,
  loadingList: false,
  loadingDetail: false,
  skills: [],
  selectedSlug: null,
  detailCache: new Map(),
  rootDir: '',
};

function compactText(value, maxLength = 140) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function truncatePreview(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= PREVIEW_MAX_CHARS) return raw;
  return `${raw.slice(0, PREVIEW_MAX_CHARS)}\n\n...`;
}

function getSelectedSummary() {
  if (!state.selectedSlug) return null;
  return state.skills.find((skill) => skill.slug === state.selectedSlug) || null;
}

function setStatus(els, text, tone = '') {
  if (!els.status) return;
  els.status.textContent = String(text || '');
  els.status.dataset.tone = tone;
}

function openModal(els) {
  if (!els.modal) return;
  els.modal.classList.add('active');
  state.isOpen = true;
}

function closeModal(els) {
  if (!els.modal) return;
  els.modal.classList.remove('active');
  state.isOpen = false;
}

function renderSkillList(els) {
  if (!els.list) return;
  els.list.textContent = '';

  if (!state.skills.length) {
    const empty = document.createElement('div');
    empty.className = 'skills-list-empty';
    empty.textContent = 'Noch keine Skills vorhanden. Nutze "Neuer Skill".';
    els.list.appendChild(empty);
    return;
  }

  for (const skill of state.skills) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skills-list-item';
    if (skill.slug === state.selectedSlug) {
      button.classList.add('selected');
    }

    const name = document.createElement('div');
    name.className = 'skills-list-item-name';
    name.textContent = skill.name || skill.slug;

    const desc = document.createElement('div');
    desc.className = 'skills-list-item-desc';
    desc.textContent = compactText(skill.description || 'Keine Beschreibung.');

    button.appendChild(name);
    button.appendChild(desc);
    button.addEventListener('click', async () => {
      await loadSkillDetail(els, skill.slug);
    });

    els.list.appendChild(button);
  }
}

function renderSkillDetail(els, detail) {
  if (!detail) {
    els.detailName.textContent = 'Kein Skill ausgewählt';
    els.detailDescription.textContent = 'Öffne links einen Skill, um Details zu sehen.';
    els.detailPath.textContent = '-';
    els.detailPrompts.textContent = 'Noch kein Skill ausgewählt.';
    els.detailGuide.textContent = 'Noch kein Skill ausgewählt.';
    return;
  }

  els.detailName.textContent = detail.name || detail.slug || 'Skill';
  els.detailDescription.textContent = detail.description || 'Keine Beschreibung.';
  els.detailPath.textContent = detail.skillFilePath || detail.path || '-';
  els.detailPath.title = detail.skillFilePath || detail.path || '-';

  els.detailPrompts.textContent = truncatePreview(detail.promptText)
    || 'Keine Prompt-Datei gefunden (prompts/*.md).';

  els.detailGuide.textContent = truncatePreview(detail.usageGuideText)
    || 'Keine usage-guide.md gefunden.';
}

async function loadSkills(els, { force = false } = {}) {
  if (!window.skills || state.loadingList) {
    return;
  }
  if (!force && state.skills.length) {
    renderSkillList(els);
    return;
  }

  state.loadingList = true;
  setStatus(els, 'Lade Skill-Liste...');
  try {
    const result = await window.skills.list();
    if (!result?.success) {
      throw new Error(result?.error || 'Unbekannter Fehler');
    }

    state.skills = Array.isArray(result.skills) ? result.skills : [];
    state.rootDir = String(result.rootDir || '').trim();

    if (!state.skills.length) {
      state.selectedSlug = null;
      renderSkillList(els);
      renderSkillDetail(els, null);
      setStatus(els, 'Noch keine Skills vorhanden.', '');
      return;
    }

    const selectedExists = state.skills.some((skill) => skill.slug === state.selectedSlug);
    if (!selectedExists) {
      state.selectedSlug = state.skills[0].slug;
    }

    renderSkillList(els);
    await loadSkillDetail(els, state.selectedSlug);
    setStatus(els, `Skills geladen (${state.skills.length}).`, 'ok');
  } catch (error) {
    setStatus(els, `Skill-Liste fehlgeschlagen: ${error.message}`, 'error');
  } finally {
    state.loadingList = false;
  }
}

async function loadSkillDetail(els, slug) {
  if (!slug || state.loadingDetail || !window.skills) return;
  state.selectedSlug = slug;
  renderSkillList(els);

  if (state.detailCache.has(slug)) {
    renderSkillDetail(els, state.detailCache.get(slug));
    setStatus(els, `Skill geladen: ${slug}`, 'ok');
    return;
  }

  state.loadingDetail = true;
  setStatus(els, `Lade Skill: ${slug}...`);
  try {
    const result = await window.skills.get(slug);
    if (!result?.success || !result.skill) {
      throw new Error(result?.error || 'Skill nicht gefunden');
    }
    state.detailCache.set(slug, result.skill);
    renderSkillDetail(els, result.skill);
    setStatus(els, `Skill geladen: ${slug}`, 'ok');
  } catch (error) {
    renderSkillDetail(els, null);
    setStatus(els, `Skill-Details fehlgeschlagen: ${error.message}`, 'error');
  } finally {
    state.loadingDetail = false;
  }
}

async function createSkill(els) {
  if (!window.skills) return;

  const name = await showInputModal('Neuer Skill: Name (z.B. text-polish)');
  if (!name) return;
  const description = await showInputModal('Beschreibung (optional)');

  setStatus(els, 'Erstelle Skill...');
  const result = await window.skills.create({ name, description: description || '' });
  if (!result?.success) {
    setStatus(els, `Skill konnte nicht erstellt werden: ${result?.error || 'Fehler'}`, 'error');
    showStatus(`Skill konnte nicht erstellt werden: ${result?.error || 'Fehler'}`, 'error');
    return;
  }

  state.detailCache.clear();
  state.selectedSlug = result.skill?.slug || null;
  await loadSkills(els, { force: true });
  showStatus(`Skill erstellt: ${result.skill?.slug || name}`, 'saved');
}

async function openSkillsRoot(els) {
  const rootPath = state.rootDir || (await window.skills.getRoot())?.rootDir;
  if (!rootPath) {
    setStatus(els, 'Skill-Ordner nicht gefunden.', 'error');
    return;
  }

  const openResult = await window.api.openInSystem(rootPath);
  if (!openResult?.success) {
    setStatus(els, `Ordner konnte nicht geöffnet werden: ${openResult?.error || 'Fehler'}`, 'error');
    return;
  }

  setStatus(els, 'Skill-Ordner geöffnet.', 'ok');
}

async function openSelectedPath(els, mode = 'file') {
  const summary = getSelectedSummary();
  if (!summary) {
    setStatus(els, 'Bitte zuerst einen Skill auswählen.', '');
    return;
  }

  const detail = state.detailCache.get(summary.slug) || summary;
  const targetPath = mode === 'folder' ? detail.path : detail.skillFilePath;
  if (!targetPath) {
    setStatus(els, 'Pfad nicht verfügbar.', 'error');
    return;
  }

  const openResult = await window.api.openInSystem(targetPath);
  if (!openResult?.success) {
    setStatus(els, `Öffnen fehlgeschlagen: ${openResult?.error || 'Fehler'}`, 'error');
    return;
  }

  setStatus(els, mode === 'folder' ? 'Skill-Ordner geöffnet.' : 'SKILL.md geöffnet.', 'ok');
}

async function notifyClaudeAutoDelegation(filePath, applyResult) {
  const fileName = String(filePath || '').split('/').pop() || 'aktuelle Datei';
  const detailLines = [
    `Die Prüfung für "${fileName}" wurde an ClaudeAuto übergeben.`,
    '',
    'Wichtig: Schliesse die Datei in TipTap AI, damit keine parallelen Schreibzugriffe entstehen.',
    '',
    applyResult?.taskFilePath ? `Task-Datei: ${applyResult.taskFilePath}` : '',
    applyResult?.artifactRoot ? `Artefakte: ${applyResult.artifactRoot}` : '',
    applyResult?.reportPath ? `Report: ${applyResult.reportPath}` : '',
    applyResult?.correctedPath ? `Korrigierte Datei: ${applyResult.correctedPath}` : '',
    applyResult?.launchedClaudeAuto
      ? 'ClaudeAuto wurde im Hintergrund gestartet.'
      : 'ClaudeAuto war bereits aktiv oder wird beim nächsten Start die Task-Datei einlesen.',
  ].filter(Boolean);

  const dialogResult = await window.api.showChoiceDialog({
    type: 'warning',
    title: 'ClaudeAuto-Prüfung gestartet',
    message: 'Bitte Datei in TipTap AI schliessen, bevor die automatische Prüfung läuft.',
    detail: detailLines.join('\n'),
    buttons: ['Verstanden', 'Datei jetzt speichern'],
    defaultId: 0,
    cancelId: 0,
  });

  if (dialogResult?.success && dialogResult.response === 1) {
    await window.saveCurrentFile?.();
  }
}

async function applySelectedSkill(els) {
  const summary = getSelectedSummary();
  if (!summary) {
    setStatus(els, 'Bitte zuerst einen Skill auswählen.', '');
    return;
  }

  const activeFilePath = String(window.editorState?.currentFilePath || '').trim();
  setStatus(els, `Wende Skill an: ${summary.slug}...`);

  const applyResult = await window.skills.apply({
    skillName: summary.slug,
    filePath: activeFilePath,
    workDir: String(window.editorState?.currentWorkingDir || '').trim(),
  });

  if (!applyResult?.success) {
    const errorMessage = applyResult?.error || 'Unbekannter Fehler';
    setStatus(els, `Skill-Anwendung fehlgeschlagen: ${errorMessage}`, 'error');
    showStatus(`Skill-Anwendung fehlgeschlagen: ${errorMessage}`, 'error');
    return;
  }

  if (applyResult.mode === 'terminal-hint') {
    const message = String(applyResult.terminalHint || '').trim();
    const result = await window.pty.write(`${message}\r`);
    if (!result?.success) {
      const err = result?.error || 'Terminal nicht aktiv';
      setStatus(els, `Skill-Hinweis konnte nicht gesendet werden: ${err}`, 'error');
      showStatus(`Skill-Hinweis konnte nicht gesendet werden: ${err}`, 'error');
      return;
    }

    setStatus(els, `Skill im Terminal aktiviert: ${summary.slug}`, 'ok');
    showStatus(`Skill aktiviert: ${summary.slug}`, 'saved');
    return;
  }

  if (applyResult.mode === 'claudeauto-delegated') {
    setStatus(els, `Skill an ClaudeAuto delegiert: ${summary.slug}`, 'ok');
    showStatus(`Skill an ClaudeAuto übergeben: ${summary.slug}`, 'saved');
    await notifyClaudeAutoDelegation(activeFilePath, applyResult);
    return;
  }

  setStatus(els, `Skill angewendet: ${summary.slug}`, 'ok');
  showStatus(`Skill angewendet: ${summary.slug}`, 'saved');
}

export function initSkillsModal() {
  if (state.initialized) return;
  state.initialized = true;

  const els = {
    openButton: document.getElementById('terminal-skills-btn'),
    modal: document.getElementById('skills-modal'),
    closeButton: document.getElementById('skills-close-btn'),
    refreshButton: document.getElementById('skills-refresh-btn'),
    newButton: document.getElementById('skills-new-btn'),
    openRootButton: document.getElementById('skills-open-root-btn'),
    list: document.getElementById('skills-list'),
    detailName: document.getElementById('skills-detail-name'),
    detailDescription: document.getElementById('skills-detail-description'),
    detailPath: document.getElementById('skills-detail-path'),
    detailPrompts: document.getElementById('skills-detail-prompts'),
    detailGuide: document.getElementById('skills-detail-guide'),
    openFileButton: document.getElementById('skills-open-file-btn'),
    openFolderButton: document.getElementById('skills-open-folder-btn'),
    applyButton: document.getElementById('skills-apply-btn'),
    status: document.getElementById('skills-status'),
  };

  if (!els.openButton || !els.modal) {
    return;
  }

  if (!window.skills) {
    els.openButton.disabled = true;
    return;
  }

  els.openButton.addEventListener('click', async () => {
    openModal(els);
    await loadSkills(els, { force: false });
  });

  els.closeButton?.addEventListener('click', () => closeModal(els));
  els.modal.addEventListener('click', (event) => {
    if (event.target === els.modal) {
      closeModal(els);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.isOpen) {
      closeModal(els);
    }
  });

  els.refreshButton?.addEventListener('click', async () => {
    state.detailCache.clear();
    await loadSkills(els, { force: true });
  });

  els.newButton?.addEventListener('click', async () => {
    await createSkill(els);
  });

  els.openRootButton?.addEventListener('click', async () => {
    await openSkillsRoot(els);
  });

  els.openFileButton?.addEventListener('click', async () => {
    await openSelectedPath(els, 'file');
  });

  els.openFolderButton?.addEventListener('click', async () => {
    await openSelectedPath(els, 'folder');
  });

  els.applyButton?.addEventListener('click', async () => {
    await applySelectedSkill(els);
  });
}
