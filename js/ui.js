// Small DOM helpers shared by the views.
import { LANGS } from './langs.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + id);
  svg.append(use);
  return svg;
}

export function fillLangSelect(select, value, codes) {
  select.textContent = '';
  for (const l of LANGS) {
    if (codes && !codes.includes(l.code)) continue;
    select.append(h('option', { value: l.code }, `${l.name}${l.native !== l.name ? '・' + l.native : ''}`));
  }
  select.value = value;
}

let toastTimer = 0;
export function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製');
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    toast(ok ? '已複製' : '無法自動複製，請手動選取文字');
    return ok;
  }
}

// LINE's official share URL: opens the LINE app on phones, or the LINE web
// share page on computers.
export const lineShareUrl = (text) => 'https://line.me/R/share?text=' + encodeURIComponent(text);

// Native share sheet with files (LINE, Messages, Mail…). Resolves
// 'shared' | 'cancelled' | 'unsupported'.
export async function shareFiles({ title, text, files }) {
  if (!navigator.share) return 'unsupported';
  const data = { title, text };
  if (files && files.length && navigator.canShare && navigator.canShare({ files })) data.files = files;
  else if (files && files.length) return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return e && e.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not granted; harmless */ }
}

// ASCII file names: some browsers replace non-ASCII download names with
// "download", and chat apps handle plain names more reliably.
export function fileStamp(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `TalkBridge_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
