export function showInputModal(title, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('input-modal');
    const titleEl = document.getElementById('input-modal-title');
    const inputField = document.getElementById('input-modal-field');
    const okBtn = document.getElementById('input-modal-ok');
    const cancelBtn = document.getElementById('input-modal-cancel');

    titleEl.textContent = title;
    inputField.value = defaultValue;
    modal.classList.add('active');

    setTimeout(() => inputField.focus(), 100);

    const handleEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        okBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    };
    inputField.addEventListener('keydown', handleEnter);

    const cleanup = () => {
      modal.classList.remove('active');
      inputField.removeEventListener('keydown', handleEnter);
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    const handleOk = () => {
      const value = inputField.value.trim();
      cleanup();
      resolve(value || null);
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
  });
}
