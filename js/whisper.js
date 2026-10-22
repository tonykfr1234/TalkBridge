// Any-language speech recognition for the interpreter: cut the microphone
// stream into utterances (by voice activity) and transcribe each with
// OpenAI's Whisper, which detects the spoken language per utterance. Used
// when the viewer has saved an OpenAI key; the browser recognizer handles
// one language at a time.
import { settings } from './store.js';

export const hasWhisper = () => !!(settings.get('openaiKey') || '').trim();

const RATE = 16000;

// Whisper reports language names; map them to our codes.
const NAMES = {
  chinese: 'zh-TW', mandarin: 'zh-TW', cantonese: 'yue', english: 'en', vietnamese: 'vi', thai: 'th',
  japanese: 'ja', korean: 'ko', indonesian: 'id', malay: 'ms', tagalog: 'tl', filipino: 'tl', khmer: 'km',
  burmese: 'my', myanmar: 'my', hindi: 'hi', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', russian: 'ru', arabic: 'ar', turkish: 'tr',
};
export const languageCode = (name) => NAMES[(name || '').toLowerCase()] || (name || '').toLowerCase();

// Phrases Whisper is known to invent for silence or noise.
const HALLUCINATIONS = /^(thank you( for watching)?[.!]?|thanks for watching[.!]?|you|bye[.!]?|字幕由.*提供|請不吝點贊.*|謝謝觀看|謝謝大家)$/i;
export const isHallucination = (text) => HALLUCINATIONS.test((text || '').trim());

/** 16-bit mono WAV from Float32 samples. */
export function encodeWav(samples, rate = RATE) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Voice-activity segmenter. push() takes 16 kHz samples; when a stretch of
 * speech ends (0.7 s of quiet, or 20 s of speech) it calls onUtterance with
 * the samples, including a little lead-in before the first loud frame.
 */
export class Segmenter {
  constructor({ onUtterance, onSpeech, minSpeechMs = 450, endSilenceMs = 700, maxMs = 20000 } = {}) {
    this.onUtterance = onUtterance || (() => {});
    this.onSpeech = onSpeech || (() => {});
    this.minSpeech = (minSpeechMs / 1000) * RATE;
    this.endSilence = (endSilenceMs / 1000) * RATE;
    this.max = (maxMs / 1000) * RATE;
    this.noise = 0.004;
    this.frame = 320; // 20 ms
    this.pending = new Float32Array(0);
    this.pre = [];          // recent quiet frames kept as lead-in
    this.chunks = [];
    this.inSpeech = false;
    this.voiced = 0;
    this.quiet = 0;
    this.length = 0;
  }

  push(samples) {
    const all = new Float32Array(this.pending.length + samples.length);
    all.set(this.pending);
    all.set(samples, this.pending.length);
    let pos = 0;
    for (; pos + this.frame <= all.length; pos += this.frame) this.step(all.slice(pos, pos + this.frame));
    this.pending = all.slice(pos);
  }

  step(f) {
    let e = 0;
    for (const x of f) e += x * x;
    const rms = Math.sqrt(e / f.length);
    this.noise = rms < this.noise ? this.noise * 0.9 + rms * 0.1 : this.noise * 0.999 + rms * 0.001;
    const loud = rms > Math.max(this.noise * 3, 0.006);
    if (!this.inSpeech) {
      this.pre.push(f);
      if (this.pre.length > 15) this.pre.shift(); // 300 ms lead-in
      if (loud) {
        this.inSpeech = true;
        this.chunks = [...this.pre];
        this.length = this.chunks.length * this.frame;
        this.voiced = f.length;
        this.quiet = 0;
        this.pre = [];
        this.onSpeech(true);
      }
      return;
    }
    this.chunks.push(f);
    this.length += f.length;
    if (loud) { this.voiced += f.length; this.quiet = 0; } else this.quiet += f.length;
    if (this.quiet >= this.endSilence || this.length >= this.max) this.flush();
  }

  flush() {
    if (!this.inSpeech) return;
    const enough = this.voiced >= this.minSpeech;
    const out = new Float32Array(this.length);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    this.inSpeech = false;
    this.chunks = [];
    this.length = 0;
    this.onSpeech(false);
    if (enough) this.onUtterance(out);
  }

  reset() { this.inSpeech = false; this.chunks = []; this.length = 0; this.pre = []; this.pending = new Float32Array(0); }
}

/** Downsample by averaging to ~16 kHz. */
export function toRate16k(x, rate) {
  const ratio = rate / RATE;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = a; k < b; k++) s += x[k];
    out[i] = s / (b - a);
  }
  return out;
}

/**
 * Transcribe one utterance. Resolves { text, language } (our language code).
 * `hint` names the expected languages so Whisper writes Traditional Chinese.
 */
export async function transcribe(wavBlob, { hint = '', signal } = {}) {
  const form = new FormData();
  form.append('file', wavBlob, 'speech.wav');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (hint) form.append('prompt', hint);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${settings.get('openaiKey').trim()}` },
    body: form,
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* not JSON */ }
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.provider = 'OpenAI';
    throw err;
  }
  const data = await res.json();
  return { text: (data.text || '').trim(), language: languageCode(data.language) };
}

/**
 * Microphone listener that emits transcribed utterances in any language.
 * onResult({ text, language }), onState('listening'|'speech'|'busy'|'stopped'|'error', detail)
 */
export class WhisperListener {
  constructor({ hint, onResult, onState }) {
    this.hint = hint;
    this.onResult = onResult || (() => {});
    this.onState = onState || (() => {});
    this.paused = false;
    this.queue = Promise.resolve();
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.onState('error', 'denied');
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.seg = new Segmenter({
      onSpeech: (on) => this.onState(on ? 'speech' : 'listening'),
      onUtterance: (samples) => this.enqueue(samples),
    });
    this.node.onaudioprocess = (ev) => {
      if (this.paused) return;
      this.seg.push(toRate16k(ev.inputBuffer.getChannelData(0), this.ctx.sampleRate));
    };
    src.connect(this.node);
    this.node.connect(this.ctx.destination);
    this.onState('listening');
  }

  // Transcribe in order so results arrive in the order people spoke.
  enqueue(samples) {
    const blob = encodeWav(samples);
    this.queue = this.queue.then(async () => {
      if (!this.ctx) return;
      this.onState('busy');
      try {
        const r = await transcribe(blob, { hint: this.hint });
        if (r.text && !isHallucination(r.text)) this.onResult(r);
      } catch (e) {
        this.onState('error', e);
      }
      if (this.ctx) this.onState('listening');
    });
  }

  pause() { this.paused = true; if (this.seg) this.seg.reset(); }
  resume() { this.paused = false; }

  stop() {
    this.paused = true;
    try { this.node.disconnect(); this.ctx.close(); } catch { /* already closed */ }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.ctx = null;
    this.onState('stopped');
  }
}
