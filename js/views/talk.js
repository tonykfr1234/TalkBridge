// 口譯: two-way conversation translation.
import { byCode, sameLang, guessPairSide } from '../langs.js';
import { translate } from '../translate.js';
import { Recognizer, recognizerErrorText, speak, stopSpeaking, canRecognize } from '../speech.js';
import { settings } from '../store.js';
import { $, h, icon, fillLangSelect, toast, copyText, keepAwake } from '../ui.js';

let rec = null;
let mode = settings.get('convMode');
let listeningSide = 'me';      // which language the recognizer is set to
let active = null;             // 'auto' | 'me' | 'them' | null
let speaking = false;
const log = [];                // { side, src, dst, fromLang, toLang }

const my = () => settings.get('myLang');
const their = () => settings.get('theirLang');
const langOf = (side) => (side === 'me' ? my() : their());
const other = (side) => (side === 'me' ? 'them' : 'me');

export function initTalk() {
  fillLangSelect($('#my-lang'), my());
  fillLangSelect($('#their-lang'), their());
  $('#my-lang').addEventListener('change', (e) => { settings.set('myLang', e.target.value); refreshLabels(); });
  $('#their-lang').addEventListener('change', (e) => { settings.set('theirLang', e.target.value); refreshLabels(); });
  $('#swap-lang').addEventListener('click', () => {
    const a = my(), b = their();
    settings.set('myLang', b); settings.set('theirLang', a);
    $('#my-lang').value = b; $('#their-lang').value = a;
    refreshLabels();
  });
  $('#speak-out').checked = settings.get('speakOut');
  $('#speak-out').addEventListener('change', (e) => settings.set('speakOut', e.target.checked));

  $('#mode-auto').addEventListener('click', () => setMode('auto'));
  $('#mode-manual').addEventListener('click', () => setMode('manual'));
  $('#talk-auto-btn').addEventListener('click', () => toggle('auto'));
  $('#talk-me').addEventListener('click', () => toggle('me'));
  $('#talk-them').addEventListener('click', () => toggle('them'));

  $('#type-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#type-input').value.trim();
    if (!v) return;
    $('#type-input').value = '';
    handlePhrase(v, 'me', { typed: true });
  });
  $('#talk-clear').addEventListener('click', () => {
    log.length = 0;
    $('#thread').textContent = '';
    $('#thread').append(h('p', { class: 'empty', id: 'thread-empty' }, '對話已清除。'));
  });
  $('#talk-copy').addEventListener('click', () => {
    if (!log.length) { toast('還沒有對話'); return; }
    copyText(log.map((x) => `${x.src}\n→ ${x.dst}`).join('\n\n'));
  });
  setMode(mode);
  refreshLabels();
}

function setMode(m) {
  if (active) stop();
  mode = m;
  settings.set('convMode', m);
  $('#mode-auto').setAttribute('aria-pressed', String(m === 'auto'));
  $('#mode-manual').setAttribute('aria-pressed', String(m === 'manual'));
  $('#talk-auto').hidden = m !== 'auto';
  $('#talk-manual').hidden = m !== 'manual';
}

function refreshLabels() {
  const a = byCode(my()), b = byCode(their());
  $('#talk-me-label').textContent = `我說 ${a.native}`;
  $('#talk-them-label').textContent = `對方說 ${b.native}`;
  $('#auto-hint').textContent = `聽到${a.name}就翻${b.name}，聽到${b.name}就翻${a.name}`;
  if (rec) rec.setLang(byCode(langOf(listeningSide)).locale);
}

function toggle(which) {
  if (!canRecognize) { toast(recognizerErrorText('unsupported'), 5000); return; }
  if (active === which) { stop(); return; }
  if (active) stop();
  active = which;
  listeningSide = which === 'them' ? 'them' : 'me';
  rec = new Recognizer({
    lang: byCode(langOf(listeningSide)).locale,
    onInterim: (t) => { $('#talk-interim').textContent = t ? `「${t}」` : (active ? listeningText() : ''); },
    onFinal: (t) => handlePhrase(t, listeningSide),
    onState: (s, detail) => {
      if (s === 'error') { toast(recognizerErrorText(detail), 6000); stop(); }
    },
  });
  rec.start();
  keepAwake(true);
  paintButtons();
}

function listeningText() {
  return `● 正在聽 ${byCode(langOf(listeningSide)).name}…`;
}

function stop() {
  active = null;
  if (rec) { rec.stop(); rec = null; }
  stopSpeaking();
  keepAwake(false);
  $('#talk-interim').textContent = '';
  paintButtons();
}

function paintButtons() {
  $('#talk-auto-btn').classList.toggle('live', active === 'auto');
  $('#talk-auto-btn').querySelector('span').textContent = active === 'auto' ? '停止口譯' : '開始自動口譯';
  $('#talk-me').classList.toggle('live', active === 'me');
  $('#talk-them').classList.toggle('live', active === 'them');
  if (active) $('#talk-interim').textContent = listeningText();
}

async function handlePhrase(text, heardSide, { typed = false } = {}) {
  // Decide which side spoke: script first, then the translator's detection.
  const guessed = guessPairSide(text, my(), their());
  let side = guessed ? (guessed === my() ? 'me' : 'them') : (typed ? 'me' : heardSide);
  const bubble = addBubble(side, text);
  try {
    let res = await translate(text, 'auto', langOf(other(side)));
    if (res.detected) {
      if (sameLang(res.detected, langOf(other(side))) && !sameLang(res.detected, langOf(side))) {
        side = other(side);
        res = await translate(text, 'auto', langOf(other(side)));
      }
    }
    const to = langOf(other(side));
    fillBubble(bubble, side, res.text, to);
    log.push({ side, src: text, dst: res.text });
    if (active === 'auto') {
      // Conversations alternate: expect the other person next.
      listeningSide = other(side);
      if (rec) rec.setLang(byCode(langOf(listeningSide)).locale);
      $('#talk-interim').textContent = listeningText();
    }
    if (settings.get('speakOut') && !typed) await speakPaused(res.text, to);
  } catch (e) {
    bubble.querySelector('.dst').textContent = e.message || '翻譯失敗';
    bubble.classList.remove('pending');
  }
}

// Pause listening while reading the translation aloud so the app does not
// translate its own voice.
async function speakPaused(text, lang) {
  if (speaking) return;
  speaking = true;
  const wasActive = active;
  if (rec) rec.stop();
  await speak(text, byCode(lang).locale);
  speaking = false;
  if (wasActive && active === wasActive && rec) {
    rec.setLang(byCode(langOf(listeningSide)).locale);
    rec.start();
  }
}

function addBubble(side, src) {
  const empty = $('#thread-empty');
  if (empty) empty.remove();
  const b = h('div', { class: `bubble pending ${side === 'them' ? 'them' : ''}` },
    h('div', { class: 'src' }, src),
    h('div', { class: 'dst' }, '翻譯中…'),
    h('div', { class: 'meta' }));
  $('#thread').append(b);
  $('#thread').scrollTop = $('#thread').scrollHeight;
  return b;
}

function fillBubble(b, side, dst, to) {
  b.className = `bubble ${side === 'them' ? 'them' : ''}`;
  b.querySelector('.dst').textContent = dst;
  b.querySelector('.dst').lang = to;
  const meta = b.querySelector('.meta');
  meta.textContent = '';
  const l = byCode(to);
  meta.append(
    h('span', {}, `${side === 'me' ? '我' : '對方'} → ${l.name}`),
    h('button', { title: '唸出來', 'aria-label': '唸出來', onclick: () => speak(dst, l.locale) }, icon('i-play')),
    h('button', { title: '複製', 'aria-label': '複製', onclick: () => copyText(dst) }, icon('i-copy')),
  );
  meta.querySelectorAll('svg').forEach((s) => { s.style.width = '15px'; s.style.height = '15px'; });
  $('#thread').scrollTop = $('#thread').scrollHeight;
}

export function leaveTalk() { if (active) stop(); }
