import State from '../editor/editor-state.js';

export function registerCLIFileOpen(loadFile) {
  let cliFileHandled = false;
  let lastHandledRequestKey = null;
  let firstEventResolve = null;
  const firstEventPromise = new Promise((resolve) => {
    firstEventResolve = resolve;
  });

  const markCLIEventSeen = () => {
    if (firstEventResolve) {
      firstEventResolve(true);
      firstEventResolve = null;
    }
  };

  const openRequest = async (payload, sourceLabel = 'event') => {
    const req = normalizeCLIRequest(payload);
    if (!req || !req.filePath) {
      console.warn('⚠️  CLI payload without usable file path:', payload);
      return false;
    }

    const requestKey = createRequestKey(req);
    if (requestKey && requestKey === lastHandledRequestKey) {
      console.log('ℹ️  Duplicate CLI open request ignored:', req.filePath);
      cliFileHandled = true;
      return true;
    }

    cliFileHandled = true;
    if (requestKey) {
      lastHandledRequestKey = requestKey;
    }

    const fileName = req.filePath.split('/').pop();
    await loadFile(req.filePath, fileName);

    if (window.jumpToMarkdownLocation) {
      setTimeout(() => {
        window.jumpToMarkdownLocation(req);
      }, 160);
    }

    console.log(`✅ File opened from ${sourceLabel} request successfully`);
    return true;
  };

  if (window.api && window.api.onOpenFileFromCLI) {
    window.api.onOpenFileFromCLI(async (payload) => {
      console.log('📂 RECEIVED CLI FILE EVENT:', payload);
      markCLIEventSeen();
      await openRequest(payload, 'CLI event');
    });
    console.log('✅ Command-line file opening registered');
  } else {
    console.warn('⚠️  Command-line file opening not available (API missing)');
  }

  async function consumeStartupOpenRequest() {
    if (!window.api || !window.api.getStartupOpenRequest) {
      return false;
    }

    try {
      const result = await window.api.getStartupOpenRequest();
      if (!result?.success || !result.request) {
        return false;
      }

      console.log('📂 STARTUP OPEN REQUEST:', result.request);
      return await openRequest(result.request, 'startup');
    } catch (error) {
      console.warn('Could not consume startup open request:', error);
      return false;
    }
  }

  async function waitForCLIEvent(timeoutMs = 350) {
    if (cliFileHandled) {
      return true;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(cliFileHandled);
      }, timeoutMs);

      firstEventPromise.then(() => {
        clearTimeout(timer);
        resolve(cliFileHandled);
      });
    });
  }

  return {
    wasHandled: () => cliFileHandled,
    consumeStartupOpenRequest,
    waitForCLIEvent,
  };
}

function createRequestKey(req) {
  if (!req || !req.filePath) {
    return '';
  }
  return `${req.filePath}::${req.line || 0}::${req.query || ''}`;
}

function normalizeCLIRequest(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') {
    return { filePath: payload, line: null, query: '' };
  }
  if (typeof payload !== 'object') return null;
  const filePath = String(payload.filePath || '').trim();
  if (!filePath) return null;

  const lineNum = Number(payload.line || 0);
  const query = String(payload.query || '').trim();
  return {
    filePath,
    line: Number.isFinite(lineNum) && lineNum > 0 ? lineNum : null,
    query,
    source: payload.source || 'cli',
  };
}

export async function loadInitialState({ loadFileTree, loadFile }) {
  const homeDirResult = await window.api.getHomeDir();
  const homeDir = homeDirResult.success ? homeDirResult.homeDir : '/home/matthias';

  const result = await window.api.getRecentItems();

  if (result.success) {
    const history = result.items || [];

    const lastFolder = history.find(item => item.type === 'folder');
    let folderLoaded = false;

    if (lastFolder) {
      const folderCheckResult = await window.api.getDirectoryTree(lastFolder.path);
      if (
        folderCheckResult.success &&
        folderCheckResult.tree &&
        folderCheckResult.tree.children &&
        folderCheckResult.tree.children.length > 0
      ) {
        State.currentWorkingDir = lastFolder.path;
        folderLoaded = true;
      } else {
        console.warn('Last folder not available or empty (maybe network drive offline):', lastFolder.path);
      }
    }

    if (!folderLoaded) {
      console.log('Using home directory as fallback:', homeDir);
      State.currentWorkingDir = homeDir;
    }

    await loadFileTree(State.currentWorkingDir);

    const lastFile = history.find(item => item.type === 'file');
    if (lastFile) {
      const fileName = lastFile.path.split('/').pop();
      await loadFile(lastFile.path, fileName);
    }
  } else {
    State.currentWorkingDir = homeDir;
    await loadFileTree(State.currentWorkingDir);
  }
}
