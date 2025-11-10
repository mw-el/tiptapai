import State from '../editor/editor-state.js';
import { stringifyFile } from '../frontmatter.js';
import { ensureMarkdownExtension, stripFrontmatterFromMarkdown } from './utils.js';

export function createFileOperations({
  showInputModal,
  showStatus,
  loadFile,
  loadFileTree,
  ensureFileTreeShowsCurrentFile,
}) {
  if (!showInputModal || !showStatus || !loadFile) {
    throw new Error('createFileOperations: Missing required dependencies');
  }

  async function createNewFile() {
    if (!State.currentWorkingDir) {
      alert('Kein Arbeitsverzeichnis ausgewählt');
      return;
    }

    const fileName = await showInputModal('Name der neuen Datei (inkl. .md Endung):');
    if (!fileName) return;

    const finalFileName = ensureMarkdownExtension(fileName);
    if (!finalFileName) {
      alert('Ungültiger Dateiname');
      return;
    }

    const initialContent = `---
lastEdit: ${new Date().toISOString()}
language: de-CH
---

# ${finalFileName.replace('.md', '')}

`;

    const result = await window.api.createFile(State.currentWorkingDir, finalFileName, initialContent);

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

    const finalDirPath = finalFilePath.split('/').slice(0, -1).join('/');
    const finalFileName = finalFilePath.split('/').pop();

    const result = await window.api.createFile(finalDirPath, finalFileName, fileContent);

    if (!result.success) {
      alert('Fehler beim Speichern: ' + result.error);
      return;
    }

    console.log('File saved as:', result.filePath);
    showStatus('Gespeichert unter neuem Namen', 'saved');

    await loadFile(result.filePath, finalFileName);
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

    if (ensureFileTreeShowsCurrentFile) {
      await ensureFileTreeShowsCurrentFile({ forceReload: true });
    } else if (loadFileTree) {
      await loadFileTree(State.currentWorkingDir);
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

    if (loadFileTree) {
      await loadFileTree(State.currentWorkingDir);
    }
  }

  return {
    createNewFile,
    saveFileAs,
    renameFile,
    deleteFile,
  };
}
