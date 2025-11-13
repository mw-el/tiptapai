import State from '../editor/editor-state.js';

export function registerCLIFileOpen(loadFile) {
  let cliFileHandled = false;

  if (window.api && window.api.onOpenFileFromCLI) {
    window.api.onOpenFileFromCLI(async (filePath) => {
      console.log('📂 RECEIVED CLI FILE EVENT:', filePath);
      cliFileHandled = true;

      const fileName = filePath.split('/').pop();
      await loadFile(filePath, fileName);

      console.log('✅ File opened from command line successfully');
    });
    console.log('✅ Command-line file opening registered');
  } else {
    console.warn('⚠️  Command-line file opening not available (API missing)');
  }

  return () => cliFileHandled;
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
