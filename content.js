let highlightingEnabled = false;
let currentEl = null;
const HIGHLIGHT_PREFS_KEY = 'boomHighlightPrefs';
const EXPLOSION_PREFS_KEY = 'boomExplosionPrefs';
let highlightPrefs = { border: true, background: true };
let explosionPrefs = { hue: 0, randomHue: false };
let highlightOverlay = null;
let highlightOverlayRaf = null;
let escListenerActive = false;
let cursorOverlay = null;
let cursorOverlayRaf = null;
let cursorImgSize = { w: 32, h: 32 };
let lastMouse = { x: 0, y: 0 };
let lastMouseValid = false;
const CURSOR_HOTSPOT = { x: 16, y: 16 };

/* const boomStage = document.createElement('div');
boomStage.id = 'boom-stage';
Object.assign(boomStage.style, {
  position: 'fixed', 
  inset: 0,
  pointerEvents: 'none',
  zIndex: 0
});
document.documentElement.insertBefore(boomStage, document.body);
document.body.style.position  = 'relative';
document.body.style.zIndex    = 1;
document.body.style.mixBlendMode = 'screen';   
*/
const explosionAudio = document.createElement('audio');
explosionAudio.src = chrome.runtime.getURL('sounds/explosion.mp3');
explosionAudio.preload = 'auto'; 
document.documentElement.appendChild(explosionAudio);   

// Use extension-absolute URL for the crosshair cursor
const crosshairUrl = chrome.runtime.getURL('crosshair2.png');
function ensureCursorStyle() {
  if (document.getElementById('target-cursor-style')) return;
  const style = document.createElement('style');
  style.id = 'target-cursor-style';
  style.textContent = `
.target-cursor, .target-cursor *, .target-cursor a {
  cursor: none !important;
}`;
  document.documentElement.appendChild(style);
}

function ensureCursorOverlay() {
  if (cursorOverlay) return;
  cursorOverlay = document.createElement('div');
  cursorOverlay.id = 'cursor-overlay';
  cursorOverlay.style.webkitMaskImage = `url("${crosshairUrl}")`;
  cursorOverlay.style.maskImage = `url("${crosshairUrl}")`;
  cursorOverlay.style.width = `${cursorImgSize.w}px`;
  cursorOverlay.style.height = `${cursorImgSize.h}px`;
  document.documentElement.appendChild(cursorOverlay);
}

function updateCursorOverlayPosition() {
  if (!cursorOverlay) return;
  const x = lastMouse.x - CURSOR_HOTSPOT.x;
  const y = lastMouse.y - CURSOR_HOTSPOT.y;
  cursorOverlay.style.transform = `translate(${x}px, ${y}px)`;
}

function enableCursorOverlayIfReady() {
  if (!highlightingEnabled) return;
  if (!lastMouseValid) return;
  if (!document.body) return;
  document.body.classList.add('target-cursor');
  startCursorOverlayLoop();
}

function startCursorOverlayLoop() {
  if (cursorOverlayRaf) return;
  const tick = () => {
    cursorOverlayRaf = null;
    if (!highlightingEnabled) {
      if (cursorOverlay) cursorOverlay.classList.remove('active');
      return;
    }
    ensureCursorOverlay();
    document.documentElement.classList.add('highlight-cursor-enabled');
    cursorOverlay.classList.add('active');
    updateCursorOverlayPosition();
    cursorOverlayRaf = requestAnimationFrame(tick);
  };
  cursorOverlayRaf = requestAnimationFrame(tick);
}

function stopCursorOverlayLoop() {
  if (cursorOverlayRaf) {
    cancelAnimationFrame(cursorOverlayRaf);
    cursorOverlayRaf = null;
  }
  if (cursorOverlay) cursorOverlay.classList.remove('active');
  document.documentElement.classList.remove('highlight-cursor-enabled');
}

(function preloadCursorImage() {
  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth && img.naturalHeight) {
      cursorImgSize = { w: img.naturalWidth, h: img.naturalHeight };
      if (cursorOverlay) {
        cursorOverlay.style.width = `${cursorImgSize.w}px`;
        cursorOverlay.style.height = `${cursorImgSize.h}px`;
      }
    }
  };
  img.src = crosshairUrl;
})();
function ensureHighlightOverlay() {
  if (highlightOverlay) return;
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = 'highlight-overlay';
  document.documentElement.appendChild(highlightOverlay);
}

function updateHighlightOverlay() {
  if (!highlightOverlay || !currentEl) return;
  const rect = currentEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    highlightOverlay.classList.remove('active');
    return;
  }
  highlightOverlay.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  highlightOverlay.style.width = `${rect.width}px`;
  highlightOverlay.style.height = `${rect.height}px`;
}

function startHighlightOverlayLoop() {
  if (highlightOverlayRaf) return;
  const tick = () => {
    highlightOverlayRaf = null;
    if (!highlightingEnabled || !currentEl || !highlightPrefs.border) {
      if (highlightOverlay) highlightOverlay.classList.remove('active');
      return;
    }
    ensureHighlightOverlay();
    highlightOverlay.classList.add('active');
    updateHighlightOverlay();
    highlightOverlayRaf = requestAnimationFrame(tick);
  };
  highlightOverlayRaf = requestAnimationFrame(tick);
}

function stopHighlightOverlayLoop() {
  if (highlightOverlayRaf) {
    cancelAnimationFrame(highlightOverlayRaf);
    highlightOverlayRaf = null;
  }
  if (highlightOverlay) highlightOverlay.classList.remove('active');
}

function applyHighlightPrefs(prefs) {
  const border = prefs?.border !== false;
  const background = prefs?.background !== false;
  highlightPrefs = { border, background };
  const root = document.documentElement;
  if (!root) return;
  root.classList.toggle('highlight-border-enabled', border);
  root.classList.toggle('highlight-bg-enabled', background);
  if (!border) stopHighlightOverlayLoop();
}

(function loadHighlightPrefs() {
  // Default on so highlight works even if prefs fail to load
  applyHighlightPrefs({ border: true, background: true });
  try {
    chrome.storage.local.get([HIGHLIGHT_PREFS_KEY], (res) => {
      applyHighlightPrefs(res?.[HIGHLIGHT_PREFS_KEY] || { border: true, background: true });
    });
  } catch {
    // Ignore storage errors; defaults already applied
  }
})();

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

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function applyExplosionPrefs(prefs) {
  const fromColor = hexToHsl(prefs?.color);
  const hue = clampNumber(prefs?.hue, 0, 359, fromColor.hue);
  const randomHue = prefs?.randomHue === true;
  explosionPrefs = { hue, randomHue };
}

function getExplosionFilter() {
  const hue = explosionPrefs.randomHue ? Math.floor(Math.random() * 360) : explosionPrefs.hue;
  return `contrast(1.5) hue-rotate(${hue}deg)`;
}

(function loadExplosionPrefs() {
  applyExplosionPrefs({ hue: 0, randomHue: false });
  try {
    chrome.storage.local.get([EXPLOSION_PREFS_KEY], (res) => {
      applyExplosionPrefs(res?.[EXPLOSION_PREFS_KEY] || { hue: 0, randomHue: false });
    });
  } catch {
    // Ignore storage errors; defaults already applied
  }
})();


// ===================== PERSISTENCE (selectors) =====================
const STORAGE_KEY = 'boomDeletedMap';
const RECORDS_KEY = 'boomDeletedRecordsMap';

// Per-page scope; normalize trailing slashes (switch to location.origin for site-wide)
const PAGE_KEY = location.origin + new URL(location.href).pathname.replace(/\/+$/, '') || '/';

let deletedSelectors = [];
let deletedRecords = [];

// ---- Shadow DOM support (open roots only) ----
const shadowRoots = new Set();

function registerShadowRoot(root) {
  if (!root || shadowRoots.has(root)) return;
  shadowRoots.add(root);
  observeRoot(root);
  // Apply current deletions inside this shadow root immediately
  applySelectorDeletions(root);
  applyRecordsDeletions(root);
}

// Patch attachShadow so future open roots are observed too
(function patchAttachShadow(){
  const orig = Element.prototype.attachShadow;
  if (!orig) return;
  Element.prototype.attachShadow = function(init) {
    const root = orig.call(this, init);
    try { if (init && init.mode === 'open') registerShadowRoot(root); } catch {}
    return root;
  };
})();

// Find existing open shadow roots on load
(function scanExistingShadowRoots() {
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
  let n = walker.currentNode;
  while(n){
    if (n.shadowRoot) registerShadowRoot(n.shadowRoot);
    n = walker.nextNode();
  }
})();

// ---- Load selectors & records, apply immediately, then observe ----
(function loadSaved() {
  chrome.storage.local.get([STORAGE_KEY, RECORDS_KEY], (res) => {
    const map  = res && res[STORAGE_KEY]  ? res[STORAGE_KEY]  : {};
    const rmap = res && res[RECORDS_KEY] ? res[RECORDS_KEY] : {};
    deletedSelectors = Array.isArray(map[PAGE_KEY])  ? map[PAGE_KEY]  : [];
    deletedRecords   = Array.isArray(rmap[PAGE_KEY]) ? rmap[PAGE_KEY] : [];

    // Pre-hide any saved selectors to avoid flash before removal
    let prehide;
    if (deletedSelectors.length) {
      prehide = document.createElement('style');
      prehide.id = 'prehide-deleted';
      prehide.textContent = deletedSelectors.map(sel => `${sel}{visibility:hidden !important;}`).join('\n');
      document.documentElement.appendChild(prehide);
    }

    // Apply now in light DOM
    applySelectorDeletions(document);
    applyRecordsDeletions(document);

    // Apply now in already-open shadow roots
    shadowRoots.forEach(root => {
      applySelectorDeletions(root);
      applyRecordsDeletions(root);
    });

    // Done with prehide once removals ran
    prehide?.remove();

    // Start observers
    startGlobalObserver();
    shadowRoots.forEach(root => observeRoot(root));

    // Gentle periodic sweep for late async DOM (stops after ~30s)
    startPeriodicSweep();
  });
})();

function persistSelectors() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const map = res && res[STORAGE_KEY] ? res[STORAGE_KEY] : {};
    map[PAGE_KEY] = deletedSelectors;
    chrome.storage.local.set({ [STORAGE_KEY]: map });
  });
}
function persistRecords() {
  chrome.storage.local.get([RECORDS_KEY], (res) => {
    const map = res && res[RECORDS_KEY] ? res[RECORDS_KEY] : {};
    map[PAGE_KEY] = deletedRecords;
    chrome.storage.local.set({ [RECORDS_KEY]: map });
  });
}

function applySelectorDeletions(root) {
  if (!deletedSelectors.length) return;
  for (const sel of deletedSelectors) {
    try { root.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
  }
}

// ================== Fallback persistence (records) =================

// keep “stable-ish” classes (avoid huge hash-like tokens)
function isStableClass(cls) {
  return cls && cls.length <= 30 && !/[A-Z]/.test(cls) && !/\d{3,}/.test(cls);
}
function normUrlMaybe(u) {
  try { const url = new URL(u, location.href); return url.origin + url.pathname; }
  catch { return u; }
}
function buildRecord(el) {
  const r = el.getBoundingClientRect();
  const parentWithId = el.closest && el.closest('[id]');
  const keepAttrs = ['id','name','href','src','alt','title','role','aria-label','data-testid','data-test','data-qa','data-id'];
  const attrs = {};
  keepAttrs.forEach(k => {
    let v = el.getAttribute && el.getAttribute(k);
    if (!v) return;
    if (k === 'href' || k === 'src') v = normUrlMaybe(v);
    attrs[k] = v;
  });
  return {
    tag: (el.tagName || '').toLowerCase(),
    classes: Array.from(el.classList || []).filter(isStableClass).slice(0, 6),
    attrs,
    text: (el.innerText || '').trim().replace(/\s+/g,' ').slice(0, 100),
    parentId: parentWithId ? parentWithId.id : null,
    bbox: { w: Math.round(r.width), h: Math.round(r.height) }
  };
}

function applyRecordsDeletions(root) {
  if (!deletedRecords.length) return;
  deletedRecords.forEach(rec => { try { removeByRecord(rec, root); } catch {} });
}

// Find & remove by record (tries to be conservative to avoid over-deleting)
function removeByRecord(record, root = document) {
  let scope = root;
  if (record.parentId) {
    const host = (root.getElementById ? root : document).getElementById(record.parentId);
    if (host) scope = host;
  }

  let candidates = Array.from(scope.getElementsByTagName(record.tag || '*'));

  const a = record.attrs || {};
  if (a.id) {
    const byId = (root.getElementById ? root : document).getElementById(a.id);
    if (byId) candidates = [byId];
  }
  if (a.href) candidates = candidates.filter(n => n.getAttribute && normUrlMaybe(n.getAttribute('href')) === a.href);
  if (a.src)  candidates = candidates.filter(n => n.getAttribute && normUrlMaybe(n.getAttribute('src'))  === a.src);

  if (record.classes && record.classes.length) {
    const want = new Set(record.classes);
    candidates = candidates.filter(n => {
      const cls = n.classList || [];
      let overlap = 0;
      want.forEach(c => { if (cls.contains && cls.contains(c)) overlap++; });
      return overlap >= Math.min(2, want.size); // >=2 (or all if <2)
    });
  }

  if (record.text) {
    const t = record.text;
    candidates = candidates.filter(n => {
      const txt = (n.innerText || '').trim().replace(/\s+/g,' ');
      return txt && (txt === t || txt.includes(t.slice(0, Math.min(20, t.length))));
    });
  }

  if (record.bbox && (record.bbox.w || record.bbox.h)) {
    candidates = candidates.filter(n => {
      const r = n.getBoundingClientRect();
      const wSim = Math.min(record.bbox.w, r.width)  / Math.max(record.bbox.w || 1, r.width  || 1);
      const hSim = Math.min(record.bbox.h, r.height) / Math.max(record.bbox.h || 1, r.height || 1);
      return (wSim + hSim) / 2 >= 0.6;
    });
  }

  // Remove candidates (usually one). If you want ultra-safe: pick top-1 by score.
  let removed = false;
  candidates.forEach(n => { try { n.remove(); removed = true; } catch {} });
  return removed;
}

// ============ Observers (light DOM + shadow roots) =============

let globalObserver = null;
function startGlobalObserver() {
  if (globalObserver) return;
  globalObserver = new MutationObserver(handleMutations);
  globalObserver.observe(document.documentElement, { childList: true, subtree: true });
}

const rootObservers = new WeakMap();
function observeRoot(root) {
  if (!root || rootObservers.has(root)) return;
  const mo = new MutationObserver(handleMutations);
  mo.observe(root, { childList: true, subtree: true });
  rootObservers.set(root, mo);
}

function handleMutations(muts) {
  if (!deletedSelectors.length && !deletedRecords.length) return;

  for (const m of muts) {
    for (const node of m.addedNodes) {
      if (!(node instanceof Element)) continue;

      // If the added node is a shadow host with open root, register it
      if (node.shadowRoot) registerShadowRoot(node.shadowRoot);

      // selectors first
      if (deletedSelectors.length) {
        for (const sel of deletedSelectors) {
          try { if (node.matches?.(sel)) { node.remove(); break; } } catch {}
        }
        for (const sel of deletedSelectors) {
          try { node.querySelectorAll?.(sel).forEach(el => el.remove()); } catch {}
        }
      }

      // record fallback
      if (deletedRecords.length) {
        try { removeByRecordArrayInto(node); } catch {}
      }
    }
  }
}

function removeByRecordArrayInto(node) {
  for (const rec of deletedRecords) {
    if (removeByRecord(rec, node)) continue;
    if (node.querySelectorAll) removeByRecord(rec, node);
    // also try inside open shadow roots under this node
    if (node.shadowRoot) removeByRecord(rec, node.shadowRoot);
    const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let cur = treeWalker.currentNode;
    while (cur) {
      if (cur.shadowRoot) removeByRecord(rec, cur.shadowRoot);
      cur = treeWalker.nextNode();
    }
  }
}

// Gentle periodic sweep (covers late async content without heavy cost)
function startPeriodicSweep() {
  let runs = 0;
  const maxRuns = 15; // ~30s at 2s interval
  const timer = setInterval(() => {
    runs++;
    applySelectorDeletions(document);
    applyRecordsDeletions(document);
    shadowRoots.forEach(root => {
      applySelectorDeletions(root);
      applyRecordsDeletions(root);
    });
    if (runs >= maxRuns) clearInterval(timer);
  }, 2000);
}

// =================== Your original behavior ======================

chrome.runtime.onMessage.addListener((message) => {
  console.log('Message received:', message);
  if (message.action === "toggleHighlight") {
    highlightingEnabled = !highlightingEnabled;
    if (highlightingEnabled) {
      ensureCursorStyle();

      // Add event listeners
      document.addEventListener('mouseover', highlightElement);
      document.addEventListener('mouseout', removeHighlight);
      document.addEventListener('click', explodeElement, true); // Ensure explosions still work
      document.addEventListener('click', blockClicks, true); // Block all other clicks
      enableCursorOverlayIfReady();
      if (!escListenerActive) {
        document.addEventListener('keydown', handleEscKey, true);
        escListenerActive = true;
      }

    } else {
      if (currentEl) currentEl.classList.remove('highlighted');
      document.body.classList.remove('target-cursor');
      currentEl = null;
      stopHighlightOverlayLoop();
      stopCursorOverlayLoop();

      // Remove event listeners
      document.removeEventListener('mouseover', highlightElement);
      document.removeEventListener('mouseout', removeHighlight);
      document.removeEventListener('click', explodeElement, true);
      document.removeEventListener('click', blockClicks, true);
      document.removeEventListener('keydown', handleEscKey, true);
      escListenerActive = false;
    }
  }

  if (message.action === 'boom:set-highlight-prefs') {
    applyHighlightPrefs(message.prefs || {});
  }

  if (message.action === 'boom:set-explosion-prefs') {
    applyExplosionPrefs(message.prefs || {});
  }

  // Popup actions (optional)
  if (message.action === 'boom:undo-last') {
    if (deletedSelectors.length) deletedSelectors.pop();
    if (deletedRecords.length)   deletedRecords.pop();
    persistSelectors(); persistRecords();
    location.reload();
  }
  if (message.action === 'boom:clear-page') {
    chrome.storage.local.get([STORAGE_KEY, RECORDS_KEY], res => {
      const map  = res?.[STORAGE_KEY]  || {};
      const rmap = res?.[RECORDS_KEY] || {};
      delete map[PAGE_KEY];
      delete rmap[PAGE_KEY];
      chrome.storage.local.set({ [STORAGE_KEY]: map, [RECORDS_KEY]: rmap }, () => location.reload());
    });
  }
  if (message.action === 'boom:clear-all') {
    chrome.storage.local.remove([STORAGE_KEY, RECORDS_KEY], () => location.reload());
  }
});

// Helper: build a stable-enough CSS selector for the clicked element
function uniqueSelector(el) {
  if (!(el instanceof Element)) return null;

  // Prefer unique id when available
  if (el.id) {
    const idSel = `#${CSS.escape(el.id)}`;
    try { if (document.querySelectorAll(idSel).length === 1) return idSel; } catch {}
  }

  const parts = [];
  let node = el;

  // Build a path of tag names with :nth-of-type when needed
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    let seg = node.tagName.toLowerCase();

    const parent = node.parentElement;
    if (parent) {
      const siblingsSameTag = Array.from(parent.children).filter(n => n.tagName === node.tagName);
      if (siblingsSameTag.length > 1) {
        seg += `:nth-of-type(${siblingsSameTag.indexOf(node) + 1})`;
      }

      // Stop early if parent has a unique id
      if (parent.id) {
        const pid = `#${CSS.escape(parent.id)}`;
        try {
          if (document.querySelectorAll(pid).length === 1) {
            parts.unshift(seg);
            parts.unshift(pid);
            return parts.join(' > ');
          }
        } catch {}
      }
    }

    parts.unshift(seg);
    node = parent;
  }

  return parts.join(' > ') || null;
}

function highlightElement(event) {
  if (highlightingEnabled && event.target.id !== 'click-explosion') {
    currentEl = event.target;
    currentEl.classList.add('highlighted');
    startHighlightOverlayLoop();
  }
}

function handleMouseMove(event) {
  lastMouse.x = event.clientX;
  lastMouse.y = event.clientY;
  lastMouseValid = true;
  if (highlightingEnabled) enableCursorOverlayIfReady();
}

function removeHighlight(event) {
  if (highlightingEnabled) {
    event.target.classList.remove('highlighted');
    if (event.target === currentEl) {
      currentEl = null;
      stopHighlightOverlayLoop();
    }
  }
}

// Track mouse position continuously so the cursor overlay can appear immediately on toggle.
document.addEventListener('mousemove', handleMouseMove, true);

function handleEscKey(event) {
  if (event.key !== 'Escape') return;
  if (!highlightingEnabled) return;
  highlightingEnabled = false;
  if (currentEl) currentEl.classList.remove('highlighted');
  document.body.classList.remove('target-cursor');
  currentEl = null;
  stopHighlightOverlayLoop();
  document.removeEventListener('mouseover', highlightElement);
  document.removeEventListener('mouseout', removeHighlight);
  document.removeEventListener('click', explodeElement, true);
  document.removeEventListener('click', blockClicks, true);
  document.removeEventListener('keydown', handleEscKey, true);
  escListenerActive = false;
  stopCursorOverlayLoop();
}

function explodeElement(event) {
  if (!highlightingEnabled) return;

  // Ignore clicks on the explosion element itself (or its children)
  const explosionHost = event.target.closest && event.target.closest('#click-explosion');
  if (explosionHost) return;

  console.log("Explosion on:", event.target);

  // ---- save selector BEFORE removing ----
  const sel = uniqueSelector(event.target);
  if (sel && !deletedSelectors.includes(sel)) {
    deletedSelectors.push(sel);
    persistSelectors();
  }

  // ---- also save a robust record for fallback ----
  try {
    const rec = buildRecord(event.target);
    deletedRecords.push(rec);
    persistRecords();
  } catch {}

  // Create explosion element
  const explosion = document.createElement('div');
  explosion.id = 'click-explosion';
  explosion.style.position = 'absolute';
  explosion.style.width = '200px';
  explosion.style.height = '200px';
  explosion.style.margin = '-115px 0 0 -85px';
  explosion.style.zIndex = '10000';
  explosion.style.filter = getExplosionFilter();
  explosion.style.backgroundImage = `url(${chrome.runtime.getURL(`explosion2.gif?${new Date().getTime()}`)})`;
  explosion.style.backgroundSize = 'cover';
  explosion.style.top = `${event.pageY - explosion.offsetHeight / 2}px`;
  explosion.style.left = `${event.pageX - explosion.offsetWidth / 2}px`;

  // Prevent the explosion from ever being targeted/removed
  explosion.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
  }, true);

  document.body.append(explosion);

  try {
    explosionAudio.currentTime = 0;
    explosionAudio.play();
  } catch (err) {
    console.warn('Explosion sound failed:', err);
  }

  setTimeout(() => {
    explosion.remove();
  }, 1800);

  // Remove clicked element
  event.target.remove();
}

function blockClicks(event) {
  if (highlightingEnabled) {
    // Allow clicks on explosions but block everything else
    if (event.target.id !== 'click-explosion') {
      event.stopPropagation();
      event.preventDefault();
      console.log("Blocked click on:", event.target);
    }
  }
}

console.log('Content script loaded');
