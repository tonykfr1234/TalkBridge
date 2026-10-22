// Speech recognition (Web Speech API), text-to-speech and audio recording.
import { settings } from './store.js';
import { speakIn, pickVoice, stopAudio } from './tts.js';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const canRecognize = !!SR;
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Continuous recognizer that restarts itself after the browser's automatic
 * stops (silence, ~60 s limits) until stop() is called.
 *
 * onInterim(text)  – words still being recognized
 * onFinal(text, confidence) – a finished phrase
 * onState('listening' | 'stopped' | 'error', detail)
 */
export class Recognizer {
  constructor({ lang, onInterim, onFinal, onState }) {
    this.lang = lang;
    this.onInterim = onInterim || (() => {});
    this.onFinal = onFinal || (() => {});
    this.onState = onState || (() => {});
    this.wanted = false;
    this.rec = null;
    this.restartTimer = null;
    this.failures = 0;
  }

  start() {
    if (!SR) { this.onState('error', 'unsupported'); return; }
    this.wanted = true;
    this._spawn();
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.restartTimer);
    if (this.rec) { try { this.rec.stop(); } catch { /* already stopped */ } }
    this.onState('stopped');
  }

  setLang(lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    if (this.wanted && this.rec) { try { this.rec.abort(); } catch { /* restart below */ } }
  }

  _spawn() {
    const rec = new SR();
    this.rec = rec;
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => { this.onState('listening'); };
    rec.onresult = (ev) => {
      this.failures = 0;
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) this.onFinal(text, r[0].confidence);
        } else {
          interim += r[0].transcript;
        }
      }
      this.onInterim(interim.trim());
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        this.wanted = false;
        this.onState('error', 'denied');
      } else if (ev.error === 'language-not-supported') {
        this.wanted = false;
        this.onState('error', 'language');
      } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        this.failures++;
        if (this.failures > 5) { this.wanted = false; this.onState('error', ev.error); }
      }
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.onInterim('');
      if (this.wanted) {
        this.restartTimer = setTimeout(() => { if (this.wanted) this._spawn(); }, this.failures ? 600 : 120);
      } else {
        this.onState('stopped');
      }
    };
    try { rec.start(); } catch { /* start() throws if already running; onend will respawn */ }
  }
}

export function recognizerErrorText(detail) {
  switch (detail) {
    case 'unsupported': return '這個瀏覽器不支援語音辨識，請用 Chrome、Edge 或 Android 版 Chrome 開啟。';
    case 'denied': return '麥克風權限被拒絕。請在網址列左側的鎖頭圖示允許麥克風，再按一次開始。';
    case 'language': return '這個瀏覽器不支援此語言的語音辨識，請換一種語言或改用 Chrome。';
    case 'network': return '語音辨識需要網路連線（Chrome 會把語音送到 Google 辨識）。';
    case 'audio-capture': return '找不到麥克風，請確認裝置已連接。';
    default: return '語音辨識中斷了，請再按一次開始。';
  }
}

// ---- Text-to-speech ----
let voices = [];
function loadVoices() { voices = canSpeak ? speechSynthesis.getVoices() : []; }
if (canSpeak) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

export function voiceFor(locale) {
  if (!voices.length) loadVoices();
  const lc = locale.toLowerCase();
  const base = lc.split('-')[0];
  return voices.find((v) => v.lang.toLowerCase().replace('_', '-') === lc)
    || voices.find((v) => v.lang.toLowerCase().startsWith(base))
    || null;
}

export function hasVoice(locale) { return !!voiceFor(locale); }

function deviceSpeak(text, locale, gender, rate) {
  return new Promise((resolve) => {
    if (!canSpeak || !text) { resolve(false); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    if (!voices.length) loadVoices();
    const v = pickVoice(voices, locale, gender) || voiceFor(locale);
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    speechSynthesis.speak(u);
  });
}

/**
 * Read text aloud. `who` picks the voice setting: 'me' (my words, may be my
 * cloned voice) or 'them' (everything else).
 */
export function speak(text, locale, { rate, who = 'them', onError } = {}) {
  if (!text) return Promise.resolve(false);
  const r = rate || settings.get('ttsRate') || 1;
  const voice = who === 'me' ? settings.get('voiceMe') : settings.get('voiceThem');
  return speakIn(text, locale, voice, { rate: r, onError, device: (t, l, g) => deviceSpeak(t, l, g, r) });
}

export function stopSpeaking() {
  stopAudio();
  if (canSpeak) speechSynthesis.cancel();
}

// ---- Audio recording ----
export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function extForMime(mime) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export class AudioRecorder {
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.mime = pickMime();
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start(1000);
    return this.stream;
  }
  pause() { if (this.rec && this.rec.state === 'recording') this.rec.pause(); }
  resume() { if (this.rec && this.rec.state === 'paused') this.rec.resume(); }
  stop() {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === 'inactive') { resolve(null); return; }
      this.rec.onstop = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.rec.mimeType || this.mime || 'audio/webm' }));
      };
      this.rec.stop();
    });
  }
}

// Live input level 0..1 for the meter.
export function levelMeter(stream, onLevel) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let raf = 0;
  const tick = () => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => { cancelAnimationFrame(raf); ctx.close(); };
}
