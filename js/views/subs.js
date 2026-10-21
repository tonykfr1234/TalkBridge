// 字幕: live translated captions for whatever the microphone hears.
import { byCode } from '../langs.js';
import { translate } from '../translate.js';
import { Recognizer, recognizerErrorText, canRecognize } from '../speech.js';
import { settings } from '../store.js';
import { toSRT } from '../textkit.js';
import { $, h, fillLangSelect, toast, download, keepAwake, fileStamp } from '../ui.js';

let rec = null;
let startedAt = 0;
let lineStart = 0;
let interimCtl = null;
let interimTimer = 0;
const lines = [];   // { t, end, text, tr }

export function initSubs() {
  fillLangSelect($('#sub-src'), settings.get('subSource'));
  fillLangSelect($('#sub-dst'), settings.get('subTarget'));
  $('#sub-src').addEventListener('change', (e) => {
    settings.set('subSource', e.target.value);
    if (rec) rec.setLang(byCode(e.target.value).locale);
  });
  $('#sub-dst').addEventListener('change', (e) => settings.set('subTarget', e.target.value));
  const size = $('#sub-size');
  size.value = settings.get('subSize');
  applySize();
  size.addEventListener('input', () => { settings.set('subSize', Number(size.value)); applySize(); });
  $('#sub-orig').checked = settings.get('subShowOriginal');
  $('#sub-orig').addEventListener('change', (e) => { settings.set('subShowOriginal', e.target.checked); render(); });
  $('#sub-top').addEventListener('change', (e) => $('#sub-stage').classList.toggle('top', e.target.checked));
  $('#sub-start').addEventListener('click', () => (rec ? stop() : start()));
  $('#sub-full').addEventListener('click', fullscreen);
  $('#sub-save').addEventListener('click', () => {
    download(new Blob([toSRT({ segments: lines }, { useTranslation: false })], { type: 'text/plain' }), `${fileStamp()}_subtitles.srt`);
  });
  $('#sub-clear').addEventListener('click', () => { lines.length = 0; render(); });
}

function applySize() { $('#sub-stage').style.fontSize = settings.get('subSize') + 'px'; }

function start() {
  if (!canRecognize) { toast(recognizerErrorText('unsupported'), 5000); return; }
  startedAt = Date.now();
  lineStart = 0;
  rec = new Recognizer({
    lang: byCode(settings.get('subSource')).locale,
    onInterim: onInterim,
    onFinal: onFinal,
    onState: (s, d) => { if (s === 'error') { toast(recognizerErrorText(d), 6000); stop(); } },
  });
  rec.start();
  keepAwake(true);
  $('#sub-start').textContent = '停止字幕';
  $('#sub-start').classList.replace('primary', 'danger');
  $('#sub-badge').hidden = false;
  $('#sub-badge-text').textContent = `聆聽 ${byCode(settings.get('subSource')).name} → ${byCode(settings.get('subTarget')).name}`;
  const ph = $('#sub-placeholder');
  if (ph) ph.textContent = '聆聽中…';
}

function stop() {
  if (rec) { rec.stop(); rec = null; }
  keepAwake(false);
  $('#sub-start').textContent = '開始字幕';
  $('#sub-start').classList.replace('danger', 'primary');
  $('#sub-badge').hidden = true;
}

const now = () => Date.now() - startedAt;

// Translate the words still being spoken, at most every 700 ms, so the
// caption keeps up without flooding the translation service.
function onInterim(text) {
  if (!text) return;
  if (!lineStart) lineStart = now();
  showCurrent(text, null);
  clearTimeout(interimTimer);
  interimTimer = setTimeout(async () => {
    if (interimCtl) interimCtl.abort();
    interimCtl = new AbortController();
    try {
      const r = await translate(text, settings.get('subSource'), settings.get('subTarget'), { signal: interimCtl.signal });
      showCurrent(text, r.text);
    } catch { /* superseded or offline: keep the original visible */ }
  }, 700);
}

async function onFinal(text) {
  clearTimeout(interimTimer);
  if (interimCtl) interimCtl.abort();
  const line = { t: lineStart || now(), end: now(), text, tr: '' };
  lineStart = 0;
  lines.push(line);
  showCurrent(text, null);
  try {
    const r = await translate(text, settings.get('subSource'), settings.get('subTarget'));
    line.tr = r.text;
  } catch (e) {
    line.tr = '';
    toast(e.message, 4000);
  }
  render();
}

function lineEl(o, t) {
  const showO = settings.get('subShowOriginal');
  return [showO && o ? h('span', { class: 'o' }, o) : null, h('span', { class: 't' }, t || o)];
}

function showCurrent(orig, tr) {
  const cur = $('#sub-current');
  cur.textContent = '';
  cur.append(...lineEl(orig, tr || orig));
}

function render() {
  const hist = $('#sub-history');
  hist.textContent = '';
  const prev = lines.slice(-3, -1);
  for (const l of prev) hist.append(h('div', { class: 'sub-line' }, ...lineEl(l.text, l.tr)));
  const last = lines[lines.length - 1];
  const cur = $('#sub-current');
  cur.textContent = '';
  if (last) cur.append(...lineEl(last.text, last.tr));
  else cur.append(h('p', { class: 'sub-placeholder', id: 'sub-placeholder' }, '按「開始字幕」後，聽到的話會在這裡變成翻譯字幕。'));
  $('#sub-save').disabled = !lines.length;
  $('#sub-count').textContent = lines.length ? `已記錄 ${lines.length} 句` : '';
}

async function fullscreen() {
  const st = $('#sub-stage');
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await st.requestFullscreen();
  } catch { toast('這個瀏覽器不支援全螢幕，可以把手機橫放使用。'); }
}

// Browsers run one speech recognizer at a time, so leaving the view stops it.
export function leaveSubs() { if (rec) stop(); }
