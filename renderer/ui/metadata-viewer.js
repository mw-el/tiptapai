import State from '../editor/editor-state.js';

function formatMetadataValue(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    const day = date.getDate();
    const months = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}. ${month} ${year}, ${hours}:${minutes}`;
  }

  return JSON.stringify(value, null, 2);
}

export function showMetadata() {
  if (!State.currentFilePath) {
    alert('Keine Datei geladen!');
    return;
  }

  const metadataEl = document.getElementById('metadata-content');

  if (Object.keys(State.currentFileMetadata).length === 0) {
    metadataEl.innerHTML = '<p style="color: #7f8c8d;">Keine Frontmatter-Metadaten vorhanden</p>';
  } else {
    let html = '';
    for (const [key, value] of Object.entries(State.currentFileMetadata)) {
      const formattedValue = formatMetadataValue(value);
      html += `<div class="meta-item">
        <span class="meta-key">${key}:</span>
        <span class="meta-value">${formattedValue}</span>
      </div>`;
    }
    metadataEl.innerHTML = html;
  }

  document.getElementById('metadata-modal').classList.add('active');
}
