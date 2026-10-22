// Text translation. The free Google endpoint is tried first, MyMemory second.
// When the viewer has saved a Claude API key and picked the AI engine,
// Claude translates instead (better for business tone, slower).
import { translateCode } from './langs.js';
import { aiTranslate, hasAI } from './ai.js';
import { settings } from './store.js';

const cache = new Map();
const CACHE_MAX = 500;

export function parseGoogle(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('bad google response');
  const text = data[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
  return { text, detected: typeof data[2] === 'string' ? data[2] : null };
}

export function parseMyMemory(data) {
  const t = data && data.responseData && data.responseData.translatedText;
  if (!t || data.responseStatus >= 400) throw new Error('bad mymemory response');
  return { text: t, detected: null };
}

async function viaGoogle(text, from, to, signal) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
    + `&sl=${encodeURIComponent(from || 'auto')}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('google ' + res.status);
  return parseGoogle(await res.json());
}

async function viaMyMemory(text, from, to, signal) {
  const src = from && from !== 'auto' ? from : 'zh-TW';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}`
    + `&langpair=${encodeURIComponent(src)}|${encodeURIComponent(to)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('mymemory ' + res.status);
  return parseMyMemory(await res.json());
}

/**
 * Translate `text` into `to`. `from` may be 'auto'.
 * Resolves { text, detected } where `detected` is the source language the
 * service reported (Google only), or null.
 */
export async function translate(text, from, to, { signal, engine } = {}) {
  const clean = (text || '').trim();
  if (!clean) return { text: '', detected: null };
  const f = from === 'auto' ? 'auto' : translateCode(from);
  const t = translateCode(to);
  if (f !== 'auto' && f === t) return { text: clean, detected: f };
  const useAI = (engine || settings.get('engine')) === 'ai' && hasAI();
  const key = `${useAI ? 'ai' : 'web'}|${f}|${t}|${clean}`;
  if (cache.has(key)) return cache.get(key);

  let out;
  if (useAI) {
    out = { text: await aiTranslate(clean, f, t, { signal }), detected: null };
  } else {
    try {
      out = await viaGoogle(clean, f, t, signal);
    } catch (e) {
      if (signal && signal.aborted) throw e;
      try {
        out = await viaMyMemory(clean, f, t, signal);
      } catch (e2) {
        if (signal && signal.aborted) throw e2;
        if (hasAI()) out = { text: await aiTranslate(clean, f, t, { signal }), detected: null };
        else throw new Error('翻譯服務連不上，請檢查網路，或在「設定」填入 AI 金鑰改用 AI 翻譯。');
      }
    }
  }
  cache.set(key, out);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return out;
}
