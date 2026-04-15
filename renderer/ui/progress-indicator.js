// Progress Indicator - Shows check progress in sidebar
// Displays "Prüfe 45/150 Absätze..." during background checking

let progressElement = null;
let progressBar = null;
let progressText = null;

/**
 * Show progress indicator in sidebar
 * Creates overlay if it doesn't exist
 */
export function showProgress() {
  // Check if already exists
  if (progressElement) {
    progressElement.style.display = 'flex';
    return;
  }

  // Create progress overlay
  progressElement = document.createElement('div');
  progressElement.id = 'check-progress-indicator';
  progressElement.style.cssText = `
    width: 80%;
    margin: 12px auto 0 auto;
    background: rgba(255, 255, 255, 0.95);
    border: 2px solid #4a90e2;
    border-radius: 4px;
    padding: 15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  // Title
  const title = document.createElement('div');
  title.textContent = 'Prüfe Dokument...';
  title.style.cssText = `
    font-weight: 600;
    color: #333;
    font-size: 14px;
  `;

  // Progress text
  progressText = document.createElement('div');
  progressText.textContent = '0/0 Absätze';
  progressText.style.cssText = `
    color: #666;
    font-size: 13px;
  `;

  // Progress bar container
  const barContainer = document.createElement('div');
  barContainer.style.cssText = `
    width: 100%;
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
  `;

  // Progress bar fill
  progressBar = document.createElement('div');
  progressBar.style.cssText = `
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #4a90e2, #357abd);
    border-radius: 4px;
    transition: width 0.3s ease;
  `;

  barContainer.appendChild(progressBar);

  progressElement.appendChild(title);
  progressElement.appendChild(progressText);
  progressElement.appendChild(barContainer);

  document.body.appendChild(progressElement);
}

/**
 * Update progress
 * @param {number} current - Current paragraph index
 * @param {number} total - Total paragraphs to check
 */
export function updateProgress(current, total) {
  if (!progressElement || !progressBar || !progressText) {
    return;
  }

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  progressText.textContent = `${current}/${total} Absätze`;
  progressBar.style.width = `${percentage}%`;

  console.log(`📊 Progress: ${current}/${total} (${percentage}%)`);
}

/**
 * Hide and remove progress indicator
 */
export function hideProgress() {
  if (progressElement) {
    progressElement.style.display = 'none';
    console.log('✓ Progress indicator hidden');
  }
}

/**
 * Remove progress indicator completely from DOM
 */
export function removeProgress() {
  if (progressElement && progressElement.parentNode) {
    progressElement.parentNode.removeChild(progressElement);
    progressElement = null;
    progressBar = null;
    progressText = null;
    console.log('✓ Progress indicator removed');
  }
}

/**
 * Show completion message briefly, then hide
 * @param {number} checkedCount - Number of paragraphs checked
 */
export function showCompletion(checkedCount) {
  if (!progressElement || !progressText) {
    return;
  }

  // Show completion
  progressText.textContent = `✓ ${checkedCount} Absätze geprüft`;
  progressBar.style.width = '100%';
  progressBar.style.background = 'linear-gradient(90deg, #4caf50, #45a049)';

  console.log(`✅ Check completed: ${checkedCount} paragraphs`);

  // Auto-hide after 2 seconds
  setTimeout(() => {
    hideProgress();

    // Remove after fade out
    setTimeout(() => {
      removeProgress();
    }, 300);
  }, 2000);
}
