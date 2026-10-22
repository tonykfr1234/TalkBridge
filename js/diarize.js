// Automatic speaker separation from one microphone, in the browser.
// Each recognized phrase gets a voice fingerprint (MFCC timbre statistics
// plus pitch) computed from the audio since the previous phrase; phrases are
// grouped by fingerprint distance. No audio leaves the device.
// Pure module (no DOM): covered by tests/diarize.test.mjs.

const TARGET_RATE = 16000;
const WIN = 400;   // 25 ms at 16 kHz
const HOP = 160;   // 10 ms
const NFFT = 512;
const NMEL = 26;
const NCEP = 13;

function melFilterbank(sr) {
  const mel = (f) => 2595 * Math.log10(1 + f / 700);
  const inv = (m) => 700 * (10 ** (m / 2595) - 1);
  const lo = mel(80), hi = mel(Math.min(7600, sr / 2 - 100));
  const pts = Array.from({ length: NMEL + 2 }, (_, i) => inv(lo + ((hi - lo) * i) / (NMEL + 1)));
  const bins = pts.map((f) => Math.floor(((NFFT + 1) * f) / sr));
  const fb = [];
  for (let m = 1; m <= NMEL; m++) {
    const row = new Float32Array(NFFT / 2 + 1);
    for (let k = bins[m - 1]; k < bins[m]; k++) row[k] = (k - bins[m - 1]) / Math.max(1, bins[m] - bins[m - 1]);
    for (let k = bins[m]; k < bins[m + 1]; k++) row[k] = (bins[m + 1] - k) / Math.max(1, bins[m + 1] - bins[m]);
    fb.push(row);
  }
  return fb;
}

// In-place radix-2 FFT.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const HAMMING = Float32Array.from({ length: WIN }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1)));
const FB = melFilterbank(TARGET_RATE);
const DCT = Array.from({ length: NCEP }, (_, k) =>
  Float32Array.from({ length: NMEL }, (_, m) => Math.cos((Math.PI * k * (m + 0.5)) / NMEL)));

/**
 * Streaming feature extractor. Feed it microphone samples at any rate with
 * the time (ms, on the meeting clock) of the first sample; it emits 10 ms
 * frames { t, rms, voiced, mfcc, f0 }.
 */
export class FeatureExtractor {
  constructor(sampleRate) {
    this.ratio = Math.max(1, Math.round(sampleRate / TARGET_RATE));
    this.rate = sampleRate / this.ratio;
    this.buf = new Float32Array(0);
    this.bufStart = 0;            // ms of buf[0]
    this.noise = 0.003;           // adaptive noise floor (RMS)
    this.re = new Float32Array(NFFT);
    this.im = new Float32Array(NFFT);
  }

  push(samples, t0) {
    // Box-filter decimation to ~16 kHz.
    const n = Math.floor(samples.length / this.ratio);
    const down = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < this.ratio; k++) s += samples[i * this.ratio + k];
      down[i] = s / this.ratio;
    }
    if (!this.buf.length) this.bufStart = t0;
    const merged = new Float32Array(this.buf.length + n);
    merged.set(this.buf);
    merged.set(down, this.buf.length);
    const frames = [];
    let pos = 0;
    while (pos + WIN <= merged.length) {
      frames.push(this.frame(merged.subarray(pos, pos + WIN), this.bufStart + (pos * 1000) / this.rate));
      pos += HOP;
    }
    this.buf = merged.slice(pos);
    this.bufStart += (pos * 1000) / this.rate;
    return frames;
  }

  frame(x, t) {
    let e = 0;
    for (let i = 0; i < WIN; i++) e += x[i] * x[i];
    const rms = Math.sqrt(e / WIN);
    // Noise floor follows quiet frames quickly and loud ones slowly.
    this.noise = rms < this.noise ? this.noise * 0.9 + rms * 0.1 : this.noise * 0.999 + rms * 0.001;
    const voiced = rms > Math.max(this.noise * 3, 0.004);
    if (!voiced) return { t, rms, voiced: false, mfcc: null, f0: 0 };
    const { re, im } = this;
    re.fill(0); im.fill(0);
    for (let i = 0; i < WIN; i++) re[i] = (x[i] - (i ? 0.97 * x[i - 1] : 0)) * HAMMING[i];
    fft(re, im);
    const pow = new Float32Array(NFFT / 2 + 1);
    for (let k = 0; k <= NFFT / 2; k++) pow[k] = re[k] * re[k] + im[k] * im[k];
    const logMel = new Float32Array(NMEL);
    for (let m = 0; m < NMEL; m++) {
      let s = 0;
      const row = FB[m];
      for (let k = 0; k < row.length; k++) s += row[k] * pow[k];
      logMel[m] = Math.log(s + 1e-10);
    }
    const mfcc = new Float32Array(NCEP);
    for (let k = 0; k < NCEP; k++) {
      let s = 0;
      for (let m = 0; m < NMEL; m++) s += DCT[k][m] * logMel[m];
      mfcc[k] = s;
    }
    return { t, rms, voiced: true, mfcc, f0: pitch(x, this.rate) };
  }
}

// Autocorrelation pitch in 70–400 Hz; 0 when unvoiced.
export function pitch(x, rate) {
  const minLag = Math.floor(rate / 400), maxLag = Math.floor(rate / 70);
  let e0 = 0;
  for (let i = 0; i < x.length; i++) e0 += x[i] * x[i];
  if (e0 <= 0) return 0;
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag && lag < x.length - 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    const r = s / e0;
    if (r > best) { best = r; bestLag = lag; }
  }
  return best > 0.35 && bestLag ? rate / bestLag : 0;
}

export const EMBED_DIM = NCEP; // MFCC 1–12 means + log pitch

/**
 * Voice fingerprint of one phrase: average timbre (MFCC 1–12; c0, the
 * loudness, is left out) plus median log pitch. Returns null when there is
 * too little speech to judge (< 0.3 s).
 */
export function embed(frames) {
  const v = frames.filter((f) => f.voiced && f.mfcc);
  if (v.length < 30) return null;
  const out = new Array(EMBED_DIM).fill(0);
  for (let k = 1; k < NCEP; k++) {
    let s = 0;
    for (const f of v) s += f.mfcc[k];
    out[k - 1] = s / v.length;
  }
  const pitched = v.filter((f) => f.f0 > 0).map((f) => Math.log(f.f0)).sort((a, b) => a - b);
  out[EMBED_DIM - 1] = pitched.length >= 5 ? pitched[Math.floor(pitched.length / 2)] : 0;
  return out;
}

// Distances are measured in units of each dimension's spread across the
// meeting so far. Until enough phrases exist, the spread leans on values
// measured from four reference voices (scripts in tests/diarize.test.mjs).
const PRIOR_SD = [7.36, 6.28, 6.23, 3.87, 3.07, 1.57, 2.33, 2.01, 2.15, 1.59, 0.77, 0.82, 0.24];
const PRIOR_WEIGHT = 6;
const PITCH_WEIGHT = 6;

export function spread(vectors) {
  const d = EMBED_DIM;
  const n = vectors.length;
  const mean = new Array(d).fill(0), varr = new Array(d).fill(0), cnt = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) if (i !== d - 1 || v[i]) { mean[i] += v[i]; cnt[i]++; }
  for (let i = 0; i < d; i++) mean[i] = cnt[i] ? mean[i] / cnt[i] : 0;
  for (const v of vectors) for (let i = 0; i < d; i++) if (i !== d - 1 || v[i]) varr[i] += (v[i] - mean[i]) ** 2;
  return PRIOR_SD.map((p, i) => Math.sqrt((varr[i] + PRIOR_WEIGHT * p * p) / ((n ? cnt[i] : 0) + PRIOR_WEIGHT)));
}

export function distance(a, b, sd = PRIOR_SD) {
  let s = 0, w = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    const pitchDim = i === EMBED_DIM - 1;
    if (pitchDim && (!a[i] || !b[i])) continue; // pitch not measured
    const wi = pitchDim ? PITCH_WEIGHT : 1;
    s += wi * ((a[i] - b[i]) / sd[i]) ** 2;
    w += wi;
  }
  return Math.sqrt(s / (w || 1));
}

function centroid(list) {
  return Array.from({ length: EMBED_DIM }, (_, i) => {
    const vals = list.map((v) => v[i]).filter((x) => i !== EMBED_DIM - 1 || x);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
}

export const DEFAULT_THRESHOLD = 1.1;

/**
 * Online clustering used while the meeting runs. add() returns the speaker
 * index for a new fingerprint; teach() moves a fingerprint to the speaker
 * the user chose so later phrases follow the correction.
 */
export class OnlineDiarizer {
  constructor({ threshold = DEFAULT_THRESHOLD, maxSpeakers = 9 } = {}) {
    this.threshold = threshold;
    this.maxSpeakers = maxSpeakers;
    this.members = []; // per speaker: array of embeddings
  }

  all() { return this.members.flat(); }

  nearest(e) {
    const sd = spread([...this.all(), e]);
    let index = -1, dist = Infinity;
    this.members.forEach((m, i) => {
      if (!m.length) return;
      const d = distance(e, centroid(m.slice(-30)), sd);
      if (d < dist) { dist = d; index = i; }
    });
    return { index, dist };
  }

  add(e) {
    const { index, dist } = this.nearest(e);
    const used = this.members.filter((m) => m.length).length;
    if (index >= 0 && (dist <= this.threshold || used >= this.maxSpeakers)) {
      this.members[index].push(e);
      return index;
    }
    const empty = this.members.findIndex((m) => !m.length);
    if (empty >= 0) { this.members[empty].push(e); return empty; }
    this.members.push([e]);
    return this.members.length - 1;
  }

  teach(e, from, to) {
    if (from >= 0 && this.members[from]) {
      const k = this.members[from].indexOf(e);
      if (k >= 0) this.members[from].splice(k, 1);
    }
    while (this.members.length <= to) this.members.push([]);
    this.members[to].push(e);
  }
}

/**
 * Whole-meeting clustering (average linkage), used to re-analyse after the
 * meeting with every fingerprint known. Returns one cluster index per input
 * (-1 for null fingerprints), numbered by first appearance.
 */
export function clusterAll(embeddings, { threshold = DEFAULT_THRESHOLD, maxSpeakers = 9 } = {}) {
  const idx = embeddings.map((e, i) => (e ? i : -1)).filter((i) => i >= 0);
  const sd = spread(idx.map((i) => embeddings[i]));
  let clusters = idx.map((i) => [i]);
  const d = new Map();
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    d.set(key(idx[a], idx[b]), distance(embeddings[idx[a]], embeddings[idx[b]], sd));
  }
  const link = (A, B) => {
    let s = 0;
    for (const a of A) for (const b of B) s += d.get(key(a, b));
    return s / (A.length * B.length);
  };
  while (clusters.length > 1) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const v = link(clusters[i], clusters[j]);
      if (v < bd) { bd = v; bi = i; bj = j; }
    }
    if (bd > threshold && clusters.length <= maxSpeakers) break;
    clusters[bi] = clusters[bi].concat(clusters[bj]);
    clusters.splice(bj, 1);
  }
  const out = embeddings.map(() => -1);
  clusters
    .map((c) => c.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .forEach((c, n) => c.forEach((i) => { out[i] = n; }));
  return out;
}
