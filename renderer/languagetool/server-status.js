// LanguageTool Server Status Checker
// Prüft periodisch ob der LanguageTool-Server erreichbar ist

const LANGUAGETOOL_API = 'http://localhost:8081/v2/languages';
const CHECK_INTERVAL = 10000; // 10 Sekunden zwischen Checks
const INITIAL_CHECK_INTERVAL = 1000; // 1 Sekunde bei initialem Check

let serverReady = false;
let checkInterval = null;
let statusElement = null;
let onReadyCallbacks = [];

/**
 * Prüft ob der LanguageTool-Server erreichbar ist
 * @returns {Promise<boolean>}
 */
async function checkServerStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s Timeout

    const response = await fetch(LANGUAGETOOL_API, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return true;
    }
    return false;
  } catch (error) {
    // Server nicht erreichbar oder Timeout
    return false;
  }
}

/**
 * Aktualisiert die Status-Anzeige in der UI
 * @param {boolean} ready
 */
function updateStatusDisplay(ready) {
  if (!statusElement) {
    statusElement = document.getElementById('languagetool-server-status');
  }

  if (!statusElement) {
    return;
  }

  const iconEl = statusElement.querySelector('.status-icon');
  const textEl = statusElement.querySelector('.status-text');

  if (ready) {
    statusElement.classList.remove('offline');
    statusElement.classList.add('online');
    if (iconEl) iconEl.textContent = 'check_circle';
    if (textEl) textEl.textContent = 'LanguageTool: Bereit';
  } else {
    statusElement.classList.remove('online');
    statusElement.classList.add('offline');
    if (iconEl) iconEl.textContent = 'error_outline';
    if (textEl) textEl.textContent = 'LanguageTool: Server nicht erreichbar';
  }
}

/**
 * Führt einen Status-Check durch und aktualisiert die UI
 */
async function performCheck() {
  const wasReady = serverReady;
  serverReady = await checkServerStatus();

  updateStatusDisplay(serverReady);

  // Wenn Server gerade bereit wurde, Callbacks ausführen
  if (!wasReady && serverReady) {
    console.log('✅ LanguageTool Server ist jetzt bereit');
    onReadyCallbacks.forEach(callback => {
      try {
        callback();
      } catch (e) {
        console.error('Error in onReady callback:', e);
      }
    });
  } else if (wasReady && !serverReady) {
    console.warn('⚠️ LanguageTool Server nicht mehr erreichbar');
  }

  return serverReady;
}

/**
 * Startet die periodische Server-Prüfung
 */
export async function initServerStatusCheck() {
  console.log('🔍 Starte LanguageTool Server-Status-Check...');

  // Initialer Check
  await performCheck();

  // Wenn noch nicht bereit, häufiger prüfen
  if (!serverReady) {
    const initialCheck = setInterval(async () => {
      const ready = await performCheck();
      if (ready) {
        clearInterval(initialCheck);
        // Wechsle zu normalem Intervall
        startPeriodicCheck();
      }
    }, INITIAL_CHECK_INTERVAL);

    // Nach 30 Sekunden aufgeben und zu normalem Intervall wechseln
    setTimeout(() => {
      clearInterval(initialCheck);
      startPeriodicCheck();
    }, 30000);
  } else {
    startPeriodicCheck();
  }
}

/**
 * Startet die normale periodische Prüfung
 */
function startPeriodicCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  checkInterval = setInterval(performCheck, CHECK_INTERVAL);
}

/**
 * Stoppt die periodische Prüfung
 */
export function stopServerStatusCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

/**
 * Gibt zurück ob der Server bereit ist
 * @returns {boolean}
 */
export function isServerReady() {
  return serverReady;
}

/**
 * Registriert einen Callback der ausgeführt wird wenn der Server bereit wird
 * @param {Function} callback
 */
export function onServerReady(callback) {
  if (serverReady) {
    // Server ist bereits bereit, sofort ausführen
    callback();
  } else {
    onReadyCallbacks.push(callback);
  }
}

/**
 * Zeigt eine Fehlermeldung wenn der Server nicht bereit ist
 * @param {string} action - Die Aktion die versucht wurde (z.B. "Absatz prüfen")
 * @returns {boolean} - true wenn Server bereit, false wenn nicht
 */
export function requireServer(action = 'Diese Aktion') {
  if (serverReady) {
    return true;
  }

  // Import showStatus dynamisch um zirkuläre Dependencies zu vermeiden
  import('../ui/status.js').then(({ showStatus }) => {
    showStatus(`${action} nicht möglich: LanguageTool-Server nicht erreichbar`, 'error');
  });

  return false;
}

/**
 * Führt sofort einen Server-Check durch (z.B. nach manuellem Server-Start)
 * @returns {Promise<boolean>}
 */
export async function recheckServer() {
  return await performCheck();
}
