// Local persistence: small settings in localStorage, meetings (with audio)
// in IndexedDB. Nothing leaves the device unless the viewer exports or shares.

const DEFAULTS = {
  myLang: 'zh-TW',
  theirLang: 'en',
  convMode: 'auto',          // auto | manual
  speakOut: true,            // read translations aloud in conversation mode
  ttsRate: 1,
  engine: 'web',             // web | ai
  provider: '',              // deepseek | openai | claude ('' = pick from saved keys)
  deepseekKey: '',
  deepseekModel: 'deepseek-chat',
  openaiKey: '',
  openaiModel: 'gpt-4.1-mini',
  apiKey: '',                // Claude
  model: 'claude-opus-5-5',
  subSource: 'en',
  subTarget: 'zh-TW',
  subSize: 44,
  subShowOriginal: true,
  meetLang: 'zh-TW',
  meetTranslate: 'en',
  meetRecord: true,
  practiceLang: 'en',
  summaryLang: 'zh-TW',
};

function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* storage blocked */ }
}

const PREFIX = 'talkbridge.';
const listeners = new Set();

export const settings = {
  get(k) {
    const raw = safeGet(PREFIX + k);
    if (raw === null) return DEFAULTS[k];
    try { return JSON.parse(raw); } catch { return DEFAULTS[k]; }
  },
  set(k, v) {
    safeSet(PREFIX + k, JSON.stringify(v));
    listeners.forEach((fn) => fn(k, v));
  },
  onChange(fn) { listeners.add(fn); },
};

// Practice progress: { [lang]: { [phraseId]: { best, learned, tries } }, streak: {...} }
export const progress = {
  all() { return settings.get('progress') || {}; },
  get(lang, id) { return (this.all()[lang] || {})[id] || null; },
  record(lang, id, patch) {
    const all = this.all();
    all[lang] = all[lang] || {};
    const prev = all[lang][id] || { best: 0, learned: false, tries: 0 };
    all[lang][id] = { ...prev, ...patch };
    settings.set('progress', all);
    touchStreak();
  },
};

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Consecutive-day practice streak.
export function nextStreak(prev, today) {
  if (!prev || !prev.last) return { last: today, count: 1 };
  if (prev.last === today) return prev;
  const y = new Date(today + 'T00:00:00');
  y.setDate(y.getDate() - 1);
  return { last: today, count: prev.last === todayKey(y) ? prev.count + 1 : 1 };
}

function touchStreak() {
  settings.set('streak', nextStreak(settings.get('streak'), todayKey()));
}

// ---- IndexedDB: meetings ----
const DB_NAME = 'talkbridge';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meetings')) db.createObjectStore('meetings', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction('meetings', mode);
    const store = t.objectStore('meetings');
    const req = fn(store);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

export const meetings = {
  save(m) { return tx('readwrite', (s) => s.put(m)); },
  get(id) { return tx('readonly', (s) => s.get(id)); },
  remove(id) { return tx('readwrite', (s) => s.delete(id)); },
  async list() {
    const all = (await tx('readonly', (s) => s.getAll())) || [];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },
};
