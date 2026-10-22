// Inside the Android app (WebView), the browser lacks speech recognition,
// speech synthesis, file downloads and the share sheet. The app exposes a
// `TalkBridgeAndroid` object; this module puts web-standard shims on top of
// it so the rest of the app runs unchanged. Imported first by app.js, so the
// shims exist before any module reads window.SpeechRecognition.

const bridge = typeof window !== 'undefined' ? window.TalkBridgeAndroid : null;
export const isAndroidApp = !!bridge;

const handlers = new Map(); // id -> object receiving native events
let nextId = 1;

// Native code calls window.__tbAndroid.event(id, type, json).
const native = {
  event(id, type, json) {
    const target = handlers.get(id);
    if (!target) return;
    let data = {};
    try { data = json ? JSON.parse(json) : {}; } catch { data = {}; }
    target.__event(type, data);
  },
  // Back button: returns true when the page handled it.
  back() {
    if (location.hash && location.hash !== '#talk') { location.hash = 'talk'; return true; }
    return false;
  },
};

class AndroidSpeechRecognition {
  constructor() {
    this.lang = 'zh-TW';
    this.continuous = false;
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.id = nextId++;
    this.running = false;
  }

  start() {
    if (this.running) throw new DOMException('already started', 'InvalidStateError');
    this.running = true;
    handlers.set(this.id, this);
    bridge.startRecognition(this.id, this.lang, !!this.interimResults);
  }

  stop() { if (this.running) bridge.stopRecognition(this.id); }
  abort() { if (this.running) bridge.cancelRecognition(this.id); }

  __event(type, d) {
    if (type === 'start' && this.onstart) this.onstart();
    if (type === 'result' && this.onresult) {
      const alt = { transcript: d.text || '', confidence: d.confidence ?? 0.8 };
      const result = Object.assign([alt], { isFinal: !!d.final, length: 1 });
      this.onresult({ resultIndex: 0, results: [result] });
    }
    if (type === 'error' && this.onerror) this.onerror({ error: d.error || 'aborted' });
    if (type === 'end') {
      this.running = false;
      handlers.delete(this.id);
      if (this.onend) this.onend();
    }
  }
}

class AndroidUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.voice = null;
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
  }
}

function makeSynthesis() {
  let voices = [];
  const load = () => {
    try { voices = JSON.parse(bridge.voices() || '[]').map((v) => ({ ...v, voiceURI: v.name, localService: true, default: false })); } catch { voices = []; }
    return voices;
  };
  const synth = {
    speaking: false,
    getVoices() { return voices.length ? voices : load(); },
    speak(u) {
      const id = nextId++;
      handlers.set(id, {
        __event(type) {
          if (type === 'end' || type === 'error') {
            handlers.delete(id);
            synth.speaking = false;
            const fn = type === 'end' ? u.onend : u.onerror;
            if (fn) fn({ type });
          }
        },
      });
      synth.speaking = true;
      bridge.speak(id, u.text || '', u.lang || '', (u.voice && u.voice.name) || '', Number(u.rate) || 1);
    },
    cancel() { synth.speaking = false; bridge.stopSpeaking(); },
    pause() {},
    resume() {},
    onvoiceschanged: null,
  };
  // The TTS engine loads its voices asynchronously.
  setTimeout(() => { load(); if (synth.onvoiceschanged) synth.onvoiceschanged(); }, 1500);
  return synth;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Save a file to the phone's Downloads folder. Resolves the native message. */
export async function saveFile(blob, filename) {
  return bridge.saveFile(filename, blob.type || 'application/octet-stream', await blobToBase64(blob));
}

async function shareNative({ title = '', text = '', files = [] }) {
  const list = await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type || 'application/octet-stream', data: await blobToBase64(f) })));
  bridge.share(title, text, JSON.stringify(list));
}

function install() {
  window.__tbAndroid = native;
  window.SpeechRecognition = AndroidSpeechRecognition;
  window.webkitSpeechRecognition = AndroidSpeechRecognition;
  window.SpeechSynthesisUtterance = AndroidUtterance;
  try {
    Object.defineProperty(window, 'speechSynthesis', { value: makeSynthesis(), configurable: true });
  } catch { /* leave the WebView's own */ }
  navigator.share = (data) => shareNative(data || {});
  navigator.canShare = () => true;
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: async () => { bridge.keepAwake(true); return { release: async () => bridge.keepAwake(false) }; } },
  });
  document.documentElement.classList.add('android-app');
}

if (bridge) install();

// Newer APK on GitHub Releases? Compares "1.3.1" style versions.
export function newerVersion(latest, current) {
  const a = String(latest || '').replace(/^[^\d]*/, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const b = String(current || '').replace(/^[^\d]*/, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

export const RELEASES_API = 'https://api.github.com/repos/tonykfr1234/TalkBridge/releases/latest';

/** Resolves { version, url } when GitHub has a newer APK than this app, else null. */
export async function checkForUpdate() {
  if (!bridge) return null;
  try {
    const res = await fetch(RELEASES_API, { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const rel = await res.json();
    const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
    if (!apk || !newerVersion(rel.tag_name, bridge.versionName())) return null;
    return { version: rel.tag_name.replace(/^v/, ''), url: apk.browser_download_url };
  } catch {
    return null;
  }
}

export function openExternal(url) { if (bridge) bridge.openExternal(url); else window.open(url, '_blank', 'noopener'); }
