import State from '../editor/editor-state.js';
import { stringifyFile } from '../frontmatter.js';
import { ensureMarkdownExtension, stripFrontmatterFromMarkdown } from './utils.js';

export function createFileOperations({
  showInputModal,
  showStatus,
  loadFile,
}) {
  if (!showInputModal || !showStatus || !loadFile) {
    throw new Error('createFileOperations: Missing required dependencies');
  }

  /**
   * Open a file via native system dialog
   */
  async function openFile() {
    const result = await window.api.showOpenDialog({
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'Alle Dateien', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result || !result.success || result.canceled || !result.filePath) {
      console.log('Open dialog canceled or failed');
      return;
    }

    const fileName = result.filePath.split('/').pop();
    await loadFile(result.filePath, fileName);
  }

  async function createNewFile() {
    const fileName = await showInputModal('Name der neuen Datei (inkl. .md Endung):');
    if (!fileName) return;

    const finalFileName = ensureMarkdownExtension(fileName);
    if (!finalFileName) {
      alert('Ungültiger Dateiname');
      return;
    }

    // Use last known directory or home dir as fallback
    let targetDir = State.currentFilePath
      ? State.currentFilePath.split('/').slice(0, -1).join('/')
      : null;

    if (!targetDir) {
      const homeDirResult = await window.api.getHomeDir();
      if (!homeDirResult.success) {
        alert('Konnte Heimverzeichnis nicht ermitteln');
        return;
      }
      targetDir = homeDirResult.homeDir;
    }

    const initialContent = `---\nlastEdit: ${new Date().toISOString()}\nlanguage: de-CH\n---\n\n# ${finalFileName.replace('.md', '')}\n\n`;

    const result = await window.api.createFile(targetDir, finalFileName, initialContent);

    if (!result.success) {
      alert('Fehler beim Erstellen der Datei: ' + result.error);
      return;
    }

    console.log('File created:', result.filePath);
    showStatus('Datei erstellt', 'saved');

    await loadFile(result.filePath, finalFileName);
  }

  async function saveFileAs() {
    console.log('💾 saveFileAs() aufgerufen');
    if (!State.currentFilePath) {
      alert('Keine Datei geladen');
      return;
    }

    const currentFileName = State.currentFilePath.split('/').pop();
    const dirPath = State.currentFilePath.split('/').slice(0, -1).join('/');

    const dialogResult = await window.api.showSaveDialog(dirPath, currentFileName);

    if (!dialogResult.success || dialogResult.canceled) {
      console.log('Save-As dialog canceled');
      return;
    }

    const finalFilePath = ensureMarkdownExtension(dialogResult.filePath);
    if (!finalFilePath) {
      alert('Ungültiger Dateiname');
      return;
    }

    const markdown = stripFrontmatterFromMarkdown(State.currentEditor.getMarkdown());

    const updatedMetadata = {
      ...State.currentFileMetadata,
      TT_lastEdit: new Date().toISOString(),
    };
    const fileContent = stringifyFile(updatedMetadata, markdown);

    const finalFileName = finalFilePath.split('/').pop();

    const result = await window.api.saveFile(finalFilePath, fileContent);

    if (!result.success) {
      alert('Fehler beim Speichern: ' + result.error);
      return;
    }

    console.log('File saved as:', finalFilePath);
    showStatus('Gespeichert unter neuem Namen', 'saved');

    await loadFile(finalFilePath, finalFileName);
  }

  async function renameFile() {
    console.log('✏️ renameFile() aufgerufen');
    if (!State.currentFilePath) {
      alert('Keine Datei geladen');
      return;
    }

    const currentFileName = State.currentFilePath.split('/').pop();
    const newFileName = await showInputModal('Neuer Dateiname:', currentFileName);
    if (!newFileName || newFileName === currentFileName) return;

    const finalFileName = ensureMarkdownExtension(newFileName);
    if (!finalFileName) {
      alert('Ungültiger Dateiname');
      return;
    }

    const dirPath = State.currentFilePath.split('/').slice(0, -1).join('/');
    const newFilePath = `${dirPath}/${finalFileName}`;

    const result = await window.api.renameFile(State.currentFilePath, newFilePath);

    if (!result.success) {
      alert('Fehler beim Umbenennen: ' + result.error);
      return;
    }

    console.log('File renamed:', newFilePath);
    showStatus('Datei umbenannt', 'saved');

    State.currentFilePath = newFilePath;
    State.currentFileMetadata = {
      ...State.currentFileMetadata,
      TT_lastEdit: new Date().toISOString(),
    };

    await window.api.setWindowTitle(finalFileName);

    const filenameDisplay = document.getElementById('current-filename');
    if (filenameDisplay) {
      filenameDisplay.textContent = finalFileName;
    }
  }

  async function deleteFile() {
    if (!State.currentFilePath) {
      alert('Keine Datei geladen');
      return;
    }

    const currentFileName = State.currentFilePath.split('/').pop();
    const confirmed = confirm(`Datei "${currentFileName}" wirklich löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`);
    if (!confirmed) return;

    const result = await window.api.deleteFile(State.currentFilePath);

    if (!result.success) {
      alert('Fehler beim Löschen: ' + result.error);
      return;
    }

    console.log('File deleted:', State.currentFilePath);
    showStatus('Datei gelöscht', 'saved');

    State.currentFilePath = null;
    State.currentFileMetadata = {};
    State.currentEditor.commands.setContent('<p>Datei wurde gelöscht.</p>');

    await window.api.setWindowTitle('TipTap AI');

    const filenameDisplay = document.getElementById('current-filename');
    if (filenameDisplay) {
      filenameDisplay.textContent = 'Keine Datei';
    }
  }

  return {
    openFile,
    createNewFile,
    saveFileAs,
    renameFile,
    deleteFile,
  };
}
