function msgActiveTab(payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, payload, () => void 0);
  });
}

const PREF_KEY = 'boomHighlightPrefs';
const prefBorder = document.getElementById('prefBorder');
const prefBg = document.getElementById('prefBg');

function loadPrefs() {
  chrome.storage.local.get([PREF_KEY], (res) => {
    const prefs = res?.[PREF_KEY] || { border: true, background: true };
    prefBorder.checked = prefs.border !== false;
    prefBg.checked = prefs.background !== false;
  });
}

function savePrefs() {
  const prefs = { border: prefBorder.checked, background: prefBg.checked };
  chrome.storage.local.set({ [PREF_KEY]: prefs });
  msgActiveTab({ action: 'boom:set-highlight-prefs', prefs });
}

prefBorder.addEventListener('change', savePrefs);
prefBg.addEventListener('change', savePrefs);
loadPrefs();

document.getElementById('undo').addEventListener('click', () => {
  msgActiveTab({ action: 'boom:undo-last' });
});

document.getElementById('clearPage').addEventListener('click', () => {
  msgActiveTab({ action: 'boom:clear-page' });
});

document.getElementById('clearAll').addEventListener('click', () => {
  msgActiveTab({ action: 'boom:clear-all' });
});
