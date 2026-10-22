// Reading text aloud in a chosen voice: female, male, or the viewer's own
// cloned voice.
// - Female / male: OpenAI text-to-speech when an OpenAI key is saved (natural,
//   multilingual), otherwise the device's built-in voices of that gender.
// - Own voice: ElevenLabs instant voice cloning with the viewer's own key and
//   recording. Only the viewer's own voice, with their consent.
import { settings } from './store.js';

export const VOICE_LABEL = { female: '女聲', male: '男聲', clone: '我的聲音' };
const OPENAI_VOICE = { female: 'nova', male: 'onyx' };

// ---- device voices ----
const FEMALE = /female|woman|xiaoxiao|xiaoyi|xiaohan|xiaomo|xiaoxuan|hsiaochen|hsiaoyu|hanhan|yating|huihui|yaoyao|tingting|ting-ting|mei-jia|meijia|sin-ji|hiumaan|hoaimy|premwadee|achara|kanya|nanami|ayumi|haruka|sunhi|heami|yuna|zira|jenny|aria|samantha|victoria|karen|moira|tessa|susan|hazel|libby|sonia|natasha|gadis|amira|swara|elena|denise|katja|google (國語|普通话|粤語|español|français|deutsch)|google us english|google uk english female/i;
const MALE = /\bmale\b|\bman\b|yunxi|yunjian|yunyang|yunze|kangkang|zhiwei|yunjhe|wanlung|namminh|niwat|keita|ichiro|injoon|david|mark|guy|ryan|daniel|alex\b|fred|thomas|aaron|christopher|eric|roger|steffan|liam|george|james|william|google uk english male|ardi|osman|madhur|alvaro|henri|conrad|diego/i;

export function guessGender(voice) {
  const n = `${voice.name} ${voice.voiceURI || ''}`;
  if (/\bmale\b/i.test(n) && !/female/i.test(n)) return 'male';
  if (FEMALE.test(n)) return 'female';
  if (MALE.test(n)) return 'male';
  return null;
}

/** Best device voice for a locale, preferring the asked gender. */
export function pickVoice(voices, locale, gender) {
  const lc = locale.toLowerCase();
  const base = lc.split('-')[0];
  const norm = (v) => v.lang.toLowerCase().replace('_', '-');
  const exact = voices.filter((v) => norm(v) === lc);
  const near = voices.filter((v) => norm(v).startsWith(base));
  for (const pool of [exact, near]) {
    const g = pool.filter((v) => guessGender(v) === gender);
    if (g.length) return g.find((v) => /natural|neural|online/i.test(v.name)) || g[0];
  }
  return exact[0] || near[0] || null;
}

// ---- playback ----
let current = null;          // HTMLAudioElement playing
const cache = new Map();     // `${engine}|${voice}|${text}` -> object URL (saves repeat charges)

function remember(key, blob) {
  const url = URL.createObjectURL(blob);
  cache.set(key, url);
  if (cache.size > 40) {
    const [k, u] = cache.entries().next().value;
    URL.revokeObjectURL(u);
    cache.delete(k);
  }
  return url;
}

function playUrl(url, rate) {
  return new Promise((resolve) => {
    stopAudio();
    const a = new Audio(url);
    a.playbackRate = rate || 1;
    current = a;
    a.onended = () => { if (current === a) current = null; resolve(true); };
    a.onerror = () => { if (current === a) current = null; resolve(false); };
    a.play().catch(() => resolve(false));
  });
}

export function stopAudio() {
  if (current) { current.pause(); current = null; }
}

function apiError(res, provider, detail) {
  const e = new Error(detail || `HTTP ${res.status}`);
  e.status = res.status;
  e.provider = provider;
  return e;
}

async function errorDetail(res) {
  try {
    const j = await res.json();
    return (j.error && j.error.message) || (j.detail && (j.detail.message || j.detail)) || '';
  } catch { return ''; }
}

async function openaiSpeech(text, gender) {
  const key = `openai|${gender}|${text}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.get('openaiKey').trim()}` },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: OPENAI_VOICE[gender], input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw apiError(res, 'OpenAI', await errorDetail(res));
  return remember(key, await res.blob());
}

const ELEVEN = 'https://api.elevenlabs.io/v1';
const elevenKey = () => (settings.get('elevenKey') || '').trim();
export const hasClone = () => !!(elevenKey() && settings.get('cloneVoiceId'));

async function elevenSpeech(text) {
  const id = settings.get('cloneVoiceId');
  const key = `eleven|${id}|${text}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`${ELEVEN}/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': elevenKey(), accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!res.ok) throw apiError(res, 'ElevenLabs', await errorDetail(res));
  return remember(key, await res.blob());
}

/** Create the viewer's cloned voice from recordings (Blobs). Resolves the voice id. */
export async function createClone(samples, name) {
  const form = new FormData();
  form.append('name', name || 'TalkBridge 我的聲音');
  form.append('description', 'Created in TalkBridge by the voice owner, with consent.');
  samples.forEach((b, i) => form.append('files', b, `sample-${i + 1}.wav`));
  const res = await fetch(`${ELEVEN}/voices/add`, { method: 'POST', headers: { 'xi-api-key': elevenKey() }, body: form });
  if (!res.ok) throw apiError(res, 'ElevenLabs', await errorDetail(res));
  const data = await res.json();
  if (!data.voice_id) throw new Error('ElevenLabs 沒有回傳聲音編號。');
  return data.voice_id;
}

export async function deleteClone(id) {
  const res = await fetch(`${ELEVEN}/voices/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'xi-api-key': elevenKey() } });
  if (!res.ok && res.status !== 404) throw apiError(res, 'ElevenLabs', await errorDetail(res));
}

/**
 * Which engine reads a given voice choice right now:
 * 'eleven' | 'openai' | 'device'.
 */
export function engineFor(voice) {
  if (voice === 'clone' && hasClone()) return 'eleven';
  if ((settings.get('openaiKey') || '').trim()) return 'openai';
  return 'device';
}

let warned = false;
/**
 * Read `text` in `voice` ('female' | 'male' | 'clone'). Falls back to the
 * device voice if the online voice fails. Resolves true when it played.
 * `device(text, locale, gender)` reads with a built-in voice.
 */
export async function speakIn(text, locale, voice, { rate, device, onError } = {}) {
  const engine = engineFor(voice);
  const gender = voice === 'male' ? 'male' : 'female';
  if (engine === 'device') return device(text, locale, gender);
  try {
    const url = engine === 'eleven' ? await elevenSpeech(text) : await openaiSpeech(text, gender);
    const ok = await playUrl(url, rate);
    if (ok) return true;
  } catch (e) {
    if (!warned && onError) { warned = true; onError(e); }
  }
  return device(text, locale, gender);
}
