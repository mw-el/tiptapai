import State from '../editor/editor-state.js';

export function initRecentItems({ loadFile, loadFileTree }) {
  const recentItemsBtn = document.getElementById('recent-items-btn');
  const recentItemsDropdown = document.getElementById('recent-items-dropdown');

  if (!recentItemsBtn || !recentItemsDropdown) {
    return;
  }

  recentItemsBtn.addEventListener('click', async (event) => {
    event.stopPropagation();

    if (recentItemsDropdown.classList.contains('hidden')) {
      await loadRecentItems({ loadFile, loadFileTree, recentItemsDropdown });
      recentItemsDropdown.classList.remove('hidden');
    } else {
      recentItemsDropdown.classList.add('hidden');
    }
  });

  document.addEventListener('click', (event) => {
    if (!recentItemsDropdown.contains(event.target) && event.target !== recentItemsBtn) {
      recentItemsDropdown.classList.add('hidden');
    }
  });
}

async function loadRecentItems({ loadFile, loadFileTree, recentItemsDropdown }) {
  if (!recentItemsDropdown) {
    return;
  }

  const result = await window.api.getRecentItems();

  if (!result.success) {
    console.error('Error loading recent items:', result.error);
    recentItemsDropdown.innerHTML = '<div class="recent-dropdown-empty">Fehler beim Laden</div>';
    return;
  }

  const items = result.items || [];

  if (items.length === 0) {
    recentItemsDropdown.innerHTML = '<div class="recent-dropdown-empty">Noch keine kürzlich verwendeten Elemente</div>';
    return;
  }

  recentItemsDropdown.innerHTML = items.map(item => {
    const icon = item.type === 'file' ? 'description' : 'folder';
    return `
      <div class="dropdown-item" data-type="${item.type}" data-path="${item.path}" title="${item.path}">
        <span class="material-icons">${icon}</span>
        <span class="item-name">${item.name}</span>
      </div>
    `;
  }).join('');

  recentItemsDropdown.querySelectorAll('.dropdown-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const type = item.dataset.type;
      const path = item.dataset.path;

      recentItemsDropdown.classList.add('hidden');

      if (type === 'file') {
        const fileName = path.split('/').pop();
        await loadFile(path, fileName);
      } else if (type === 'folder') {
        State.currentWorkingDir = path;
        await loadFileTree(State.currentWorkingDir);
        await window.api.addRecentFolder(path);
      }
    });
  });
}
