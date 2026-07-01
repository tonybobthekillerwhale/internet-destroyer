function msgActiveTab(payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, payload, () => void 0);
  });
}

const PREF_KEY = 'boomHighlightPrefs';
const EXPLOSION_PREF_KEY = 'boomExplosionPrefs';
const prefBorder = document.getElementById('prefBorder');
const prefBg = document.getElementById('prefBg');
const explosionHue = document.getElementById('explosionHue');
const explosionSwatch = document.getElementById('explosionSwatch');
const hueValue = document.getElementById('hueValue');
const randomHue = document.getElementById('randomHue');

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function hexToHsl(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!match) return { hue: 0 };

  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }

  return {
    hue: Math.round((hue * 60 + 360) % 360)
  };
}

function normalizeExplosionPrefs(prefs = {}) {
  const fromColor = hexToHsl(prefs.color);
  return {
    hue: clampNumber(prefs.hue, 0, 359, fromColor.hue),
    randomHue: prefs.randomHue === true
  };
}

function updateExplosionControls(prefs) {
  const normalized = normalizeExplosionPrefs(prefs);
  explosionHue.value = String(normalized.hue);
  randomHue.checked = normalized.randomHue;
  updateExplosionPreview();
}

function updateExplosionPreview() {
  const hue = clampNumber(explosionHue.value, 0, 359, 0);
  hueValue.textContent = `${hue} deg`;
  explosionSwatch.style.background = `hsl(${hue}deg 100% 50%)`;
}

function loadPrefs() {
  chrome.storage.local.get([PREF_KEY, EXPLOSION_PREF_KEY], (res) => {
    const prefs = res?.[PREF_KEY] || { border: true, background: true };
    prefBorder.checked = prefs.border !== false;
    prefBg.checked = prefs.background !== false;

    updateExplosionControls(res?.[EXPLOSION_PREF_KEY] || { hue: 0, randomHue: false });
  });
}

function savePrefs() {
  const prefs = { border: prefBorder.checked, background: prefBg.checked };
  chrome.storage.local.set({ [PREF_KEY]: prefs });
  msgActiveTab({ action: 'boom:set-highlight-prefs', prefs });
}

function saveExplosionPrefs() {
  const prefs = {
    hue: clampNumber(explosionHue.value, 0, 359, 0),
    randomHue: randomHue.checked
  };
  updateExplosionPreview();
  chrome.storage.local.set({ [EXPLOSION_PREF_KEY]: prefs });
  msgActiveTab({ action: 'boom:set-explosion-prefs', prefs });
}

prefBorder.addEventListener('change', savePrefs);
prefBg.addEventListener('change', savePrefs);
explosionHue.addEventListener('input', saveExplosionPrefs);
randomHue.addEventListener('change', saveExplosionPrefs);
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
