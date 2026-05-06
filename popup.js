// dokieli popup script (MV3)
// Handles activation of dokieli on the current tab.
// scripts/dokieli.js (~5 MB) is injected lazily here, only when the user activates.

const WebExtension = (typeof globalThis.browser !== 'undefined') ? globalThis.browser : globalThis.chrome;

const ui = {
  dot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  activateBtn: document.getElementById('activate-btn'),
  userRow: document.getElementById('user-row'),
  userIri: document.getElementById('user-iri'),
  errorMsg: document.getElementById('error-msg'),
};

function setStatus(state, text) {
  ui.dot.className = 'status-dot ' + state;
  ui.statusText.textContent = text;
}

function showError(msg) {
  ui.errorMsg.textContent = msg;
  ui.errorMsg.classList.add('visible');
}

function clearError() {
  ui.errorMsg.classList.remove('visible');
}

function renderStatus(status) {
  clearError();

  if (status.loaded) {
    setStatus('active', 'Active on this page');
    ui.activateBtn.textContent = 'Show menu';
    ui.activateBtn.disabled = false;
  } else {
    setStatus('inactive', 'Not active on this page');
    ui.activateBtn.textContent = 'Activate';
    ui.activateBtn.disabled = false;
  }

  if (status.user?.iri) {
    ui.userIri.textContent = status.user.iri;
    ui.userRow.classList.add('visible');
  } else {
    ui.userRow.classList.remove('visible');
  }
}

async function getActiveTab() {
  const tabs = await WebExtension.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function queryStatus(tabId) {
  try {
    return await WebExtension.tabs.sendMessage(tabId, { action: 'dokieli.status' });
  } catch {
    // Content script not reachable (chrome:// page, pdf, etc.)
    return null;
  }
}

// Returns the updated status on success, null on failure.
async function activate(tab) {
  clearError();
  setStatus('loading', 'Activating…');
  ui.activateBtn.disabled = true;

  try {
    await WebExtension.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['media/css/dokieli.css'],
    });

    await WebExtension.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/dokieli.js'],
    });

    // scripts/dokieli.js is now executed and window.DO is set.
    // The content script will call DO.U.load() when it receives showDocumentMenu.
    await WebExtension.tabs.sendMessage(tab.id, { action: 'dokieli.showDocumentMenu' });

    const updated = (await queryStatus(tab.id)) || { loaded: true, editMode: false, user: null };
    renderStatus(updated);
    return updated;
  } catch (e) {
    setStatus('inactive', 'Not active on this page');
    ui.activateBtn.disabled = false;
    showError('Could not activate dokieli on this page.');
    console.error('dokieli popup: activate failed', e);
    return null;
  }
}

async function showMenu(tab) {
  clearError();
  try {
    await WebExtension.tabs.sendMessage(tab.id, { action: 'dokieli.showDocumentMenu' });
    window.close();
  } catch (e) {
    showError('Could not reach dokieli on this page.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getActiveTab();

  if (!tab) {
    setStatus('inactive', 'No active tab');
    return;
  }

  // Restricted pages (chrome://, about:, file:// without permissions, etc.)
  const restricted = !tab.url || /^(chrome|about|edge|brave):\/\//.test(tab.url);
  if (restricted) {
    setStatus('inactive', 'Not available on this page');
    return;
  }

  const status = await queryStatus(tab.id);

  if (!status) {
    // Content script not running (extension was just installed, page predates install).
    setStatus('inactive', 'Reload the page to enable dokieli');
    ui.activateBtn.textContent = 'Activate';
    ui.activateBtn.disabled = true;
    return;
  }

  renderStatus(status);

  // Use a mutable ref so the click handler always reads the current state,
  // not the value captured when the popup first opened. Without this, a second
  // click after activation still sees loaded=false and re-injects dokieli.js.
  let currentStatus = status;

  ui.activateBtn.addEventListener('click', async () => {
    if (currentStatus.loaded) {
      await showMenu(tab);
    } else {
      const updated = await activate(tab);
      if (updated) currentStatus = updated;
    }
  });
});
