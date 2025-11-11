import State from '../editor/editor-state.js';

export function createFileTreeManager({ loadFile }) {
  if (typeof loadFile !== 'function') {
    throw new Error('createFileTreeManager: loadFile dependency is required');
  }

  async function loadFileTree(dirPath = null) {
    if (!State.currentWorkingDir && !dirPath) {
      console.log('Loading home directory as fallback...');
      const homeDirResult = await window.api.getHomeDir();
      State.currentWorkingDir = homeDirResult.success ? homeDirResult.homeDir : '/home/matthias';
    }

    const workingDir = dirPath || State.currentWorkingDir;
    console.log('Loading file tree:', workingDir);

    const result = await window.api.getDirectoryTree(workingDir);

    if (!result.success) {
      console.error('Error loading directory tree:', result.error);
      const fileTreeEl = document.querySelector('#file-tree');
      if (fileTreeEl) {
        fileTreeEl.innerHTML = '<div class="file-tree-empty">Fehler beim Laden: ' + result.error + '</div>';
      }
      return;
    }

    State.currentWorkingDir = workingDir;
    updateCurrentFolderDisplay(workingDir);

    const fileTreeEl = document.querySelector('#file-tree');
    if (!fileTreeEl) {
      return;
    }

    fileTreeEl.innerHTML = '';

    if (workingDir !== '/' && workingDir !== '') {
      const parentNav = document.createElement('div');
      parentNav.className = 'tree-parent-nav';
      parentNav.innerHTML = `
        <span class="material-icons tree-icon">arrow_upward</span>
        <span class="tree-name">..</span>
      `;
      parentNav.title = 'Eine Ebene nach oben';
      parentNav.addEventListener('click', () => navigateUp());
      fileTreeEl.appendChild(parentNav);
    }

    if (!result.tree || !result.tree.children || result.tree.children.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'file-tree-empty';
      emptyMsg.textContent = 'Keine Markdown/Text-Dateien gefunden';
      fileTreeEl.appendChild(emptyMsg);
      console.log('No markdown/text files found in:', workingDir);
      return;
    }

    renderTreeNode(result.tree, fileTreeEl, 0);

    if (State.currentFilePath) {
      markFileAsActive(State.currentFilePath);
    }

    console.log(`Loaded directory tree for: ${workingDir}, found ${result.tree.children.length} items`);
  }

  function updateCurrentFolderDisplay(dirPath) {
    const displayElement = document.getElementById('current-folder-name');
    if (!displayElement) return;

    if (!dirPath) {
      displayElement.textContent = 'Kein Ordner ausgewählt';
      return;
    }

    const folderName = dirPath.split('/').filter(Boolean).pop() || dirPath;
    displayElement.textContent = folderName;
    displayElement.title = dirPath;
  }

  function markFileAsActive(filePath) {
    if (!filePath) return;

    document.querySelectorAll('.tree-file').forEach(item => {
      item.classList.remove('active');
    });

    const activeFile = document.querySelector(`.tree-file[data-path="${filePath}"]`);
    if (activeFile) {
      activeFile.classList.add('active');
      activeFile.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log('Marked file as active:', filePath);
    } else {
      console.log('File not found in tree (may not be visible yet):', filePath);
    }
  }

  function renderTreeNode(node, parentElement, depth = 0) {
    if (!node) return;

    if (depth === 0 && node.children) {
      node.children.forEach(child => renderTreeNode(child, parentElement, depth + 1));
      return;
    }

    const itemWrapper = document.createElement('div');
    itemWrapper.className = 'tree-item-wrapper';
    itemWrapper.style.paddingLeft = `${depth * 12}px`;

    const item = document.createElement('div');
    item.className = node.type === 'directory' ? 'tree-folder' : 'tree-file';
    item.dataset.path = node.path;
    item.dataset.type = node.type;
    item.title = node.path;

    if (node.type === 'directory') {
      const expandIcon = document.createElement('span');
      expandIcon.className = 'material-icons tree-expand-icon';
      expandIcon.textContent = 'chevron_right';
      item.appendChild(expandIcon);

      const folderIcon = document.createElement('span');
      folderIcon.className = 'material-icons tree-icon';
      folderIcon.textContent = 'folder';
      item.appendChild(folderIcon);

      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = node.name;
      item.appendChild(name);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolder(item, node, itemWrapper, depth);
      });

      item.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        console.log('Double-clicked folder, navigating to:', node.path);
        State.currentWorkingDir = node.path;
        await loadFileTree(node.path);
        await window.api.addRecentFolder(node.path);
      });
    } else {
      const fileIcon = document.createElement('span');
      fileIcon.className = 'material-icons tree-icon';
      fileIcon.textContent = 'description';
      item.appendChild(fileIcon);

      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = node.name;
      item.appendChild(name);

      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        markFileAsActive(node.path);
        await loadFile(node.path, node.name);
      });
    }

    itemWrapper.appendChild(item);
    parentElement.appendChild(itemWrapper);
  }

  async function toggleFolder(folderElement, node, itemWrapper, depth) {
    const expandIcon = folderElement.querySelector('.tree-expand-icon');
    const isExpanded = expandIcon.textContent === 'expand_more';

    if (isExpanded) {
      expandIcon.textContent = 'chevron_right';
      const childrenContainer = itemWrapper.querySelector('.tree-children');
      if (childrenContainer) {
        childrenContainer.remove();
      }
    } else {
      expandIcon.textContent = 'expand_more';

      if (node.children === null) {
        const result = await window.api.expandDirectory(node.path);
        if (result.success) {
          node.children = result.children;
        } else {
          console.error('Error expanding directory:', result.error);
          return;
        }
      }

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';

      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          renderTreeNode(child, childrenContainer, depth + 1);
        });
      }

      itemWrapper.appendChild(childrenContainer);
    }
  }

  async function changeFolder() {
    console.log('changeFolder called - opening directory dialog...');
    const result = await window.api.selectDirectory();
    console.log('Dialog result:', result);

    if (!result.success || result.canceled) {
      console.log('Directory selection canceled or failed');
      return;
    }

    console.log('Selected directory:', result.dirPath);
    State.currentWorkingDir = result.dirPath;
    await loadFileTree(result.dirPath);
    await window.api.addRecentFolder(result.dirPath);
    console.log('Folder changed successfully to:', result.dirPath);
  }

  async function navigateUp() {
    if (!State.currentWorkingDir) {
      console.warn('No current working directory');
      return;
    }

    if (State.currentWorkingDir === '/') {
      console.log('Already at root directory');
      return;
    }

    const parentDir = State.currentWorkingDir.split('/').slice(0, -1).join('/') || '/';
    console.log('Navigating up from', State.currentWorkingDir, 'to', parentDir);

    State.currentWorkingDir = parentDir;
    await loadFileTree(parentDir);
    await window.api.addRecentFolder(parentDir);
  }

  async function expandParentFolders(filePath) {
    const pathParts = filePath.split('/');
    for (let i = 1; i < pathParts.length - 1; i++) {
      const parentPath = pathParts.slice(0, i + 1).join('/');
      const folderElement = document.querySelector(`[data-path="${parentPath}"][data-type="directory"]`);

      if (folderElement && !folderElement.classList.contains('expanded')) {
        folderElement.click();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  async function ensureFileTreeShowsCurrentFile({ forceReload = false } = {}) {
    if (!State.currentFilePath) {
      console.warn('⚠️  No current file to sync tree with');
      return;
    }

    const fileDir = State.currentFilePath.split('/').slice(0, -1).join('/');

    console.log('🔄 Syncing file tree to current file directory:', fileDir);
    console.log('   Current file:', State.currentFilePath);
    console.log('   Current working dir (before):', State.currentWorkingDir);

    const shouldReload = forceReload || State.currentWorkingDir !== fileDir;

    if (shouldReload) {
      if (forceReload) {
        console.log('🔁 Forcing file tree reload for current file:', fileDir);
      } else {
        console.log('📂 Tree showing wrong directory! Reloading to:', fileDir);
      }
      State.currentWorkingDir = fileDir;
      await loadFileTree(fileDir);
    } else {
      console.log('✅ Tree already showing correct directory');
    }

    await expandParentFolders(State.currentFilePath);
    markFileAsActive(State.currentFilePath);
  }

  return {
    loadFileTree,
    changeFolder,
    navigateUp,
    ensureFileTreeShowsCurrentFile,
  };
}
