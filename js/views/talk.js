// 口譯: two-way conversation translation.
import { byCode, sameLang, guessPairSide } from '../langs.js';
import { translate } from '../translate.js';
import { Recognizer, recognizerErrorText, speak, stopSpeaking, canRecognize } from '../speech.js';
import { settings } from '../store.js';
import { WhisperListener, hasWhisper } from '../whisper.js';
import { friendlyError } from '../ai.js';
import { $, h, icon, fillLangSelect, toast, copyText, keepAwake } from '../ui.js';

let rec = null;
let whisper = null;            // WhisperListener in auto mode with an OpenAI key
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
  settings.onChange((k) => { if (k === 'openaiKey' || k === 'myLang' || k === 'theirLang') refreshLabels(); });
}

function setMode(m) {
  if (active) stop();
  mode = m;
  settings.set('convMode', m);
  $('#mode-auto').setAttribute('aria-pressed', String(m === 'auto'));
  $('#mode-manual').setAttribute('aria-pressed', String(m === 'manual'));
  $('#talk-auto').hidden = m !== 'auto';
  $('#talk-manual').hidden = m !== 'manual';
  $('#auto-engine').hidden = m !== 'auto';
}

function refreshLabels() {
  const a = byCode(my()), b = byCode(their());
  $('#talk-me-label').textContent = `我說 ${a.native}`;
  $('#talk-them-label').textContent = `對方說 ${b.native}`;
  $('#auto-hint').textContent = hasWhisper()
    ? `任何順序說${a.name}或${b.name}都可以，OpenAI Whisper 會自動判斷語言`
    : `聽到${a.name}就翻${b.name}，聽到${b.name}就翻${a.name}`;
  $('#auto-engine').textContent = hasWhisper()
    ? '辨識：OpenAI Whisper（每句自動判斷語言）'
    : `辨識：瀏覽器免費辨識，一直以${byCode(langOf(anchorSide())).name}收音，並依文字判斷語言。若常聽錯，到「設定」填入 OpenAI 金鑰改用 Whisper。`;
  if (rec) rec.setLang(byCode(langOf(listeningSide)).locale);
}

// The browser recognizer hears one language at a time. In free automatic
// mode it stays on one language instead of guessing turns: Chinese when the
// pair includes it, because the Chinese recognizer also writes out English
// sentences, while the English one turns Chinese into English-sounding words.
function anchorSide() {
  const zh = (code) => /^(zh|yue)/.test(code);
  if (zh(my())) return 'me';
  if (zh(their())) return 'them';
  return 'me';
}

export function refreshTalkEngine() { refreshLabels(); }

function toggle(which) {
  if (active === which) { stop(); return; }
  if (active) stop();
  if (which === 'auto' && hasWhisper()) { startWhisper(); return; }
  if (!canRecognize) { toast(recognizerErrorText('unsupported'), 5000); return; }
  active = which;
  listeningSide = which === 'auto' ? anchorSide() : which;
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

function startWhisper() {
  active = 'auto';
  const a = byCode(my()), b = byCode(their());
  whisper = new WhisperListener({
    hint: `以下是${a.name}和${b.name}的對話，中文請用繁體字。${a.native}. ${b.native}.`,
    onResult: ({ text, language }) => handlePhrase(text, 'me', { language }),
    onState: (st, detail) => {
      if (st === 'error') {
        if (detail === 'denied') { toast(recognizerErrorText('denied'), 6000); stop(); return; }
        toast(friendlyError(detail), 6000);
        if (detail && (detail.status === 401 || detail.status === 403)) stop();
        return;
      }
      if (st === 'speech') $('#talk-interim').textContent = '● 聽到說話…';
      if (st === 'busy') $('#talk-interim').textContent = '● 辨識中…';
      if (st === 'listening' && active) $('#talk-interim').textContent = listeningText();
    },
  });
  whisper.start();
  keepAwake(true);
  paintButtons();
}

function listeningText() {
  if (whisper) return `● 聆聽中：${byCode(my()).name}或${byCode(their()).name}都可以…`;
  return active === 'auto'
    ? `● 聆聽中（以${byCode(langOf(listeningSide)).name}收音，中英文都會判斷）…`
    : `● 正在聽 ${byCode(langOf(listeningSide)).name}…`;
}

function stop() {
  active = null;
  if (rec) { rec.stop(); rec = null; }
  if (whisper) { whisper.stop(); whisper = null; }
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

async function handlePhrase(text, heardSide, { typed = false, language = '' } = {}) {
  // Decide which side spoke. Whisper reports the language; otherwise, when
  // the script settles it (Chinese characters vs. Latin letters, Thai…),
  // trust it and translate from that language; only same-script pairs fall
  // back to the translator's detection.
  let guessed = guessPairSide(text, my(), their());
  if (language && sameLang(language, my()) && !sameLang(language, their())) guessed = my();
  else if (language && sameLang(language, their()) && !sameLang(language, my())) guessed = their();
  let side = guessed ? (guessed === my() ? 'me' : 'them') : (typed ? 'me' : heardSide);
  const bubble = addBubble(side, text);
  try {
    let res;
    if (guessed) {
      res = await translate(text, langOf(side), langOf(other(side)));
    } else {
      res = await translate(text, 'auto', langOf(other(side)));
      if (res.detected && sameLang(res.detected, langOf(other(side))) && !sameLang(res.detected, langOf(side))) {
        side = other(side);
        res = await translate(text, 'auto', langOf(other(side)));
      }
    }
    const to = langOf(other(side));
    fillBubble(bubble, side, res.text, to);
    log.push({ side, src: text, dst: res.text });
    if (active) $('#talk-interim').textContent = listeningText();
    if (settings.get('speakOut') && !typed) await speakPaused(res.text, to, side);
  } catch (e) {
    bubble.querySelector('.dst').textContent = e.message || '翻譯失敗';
    bubble.classList.remove('pending');
  }
}

// Pause listening while reading the translation aloud so the app does not
// translate its own voice.
async function speakPaused(text, lang, side) {
  if (speaking) return;
  speaking = true;
  const wasActive = active;
  if (rec) rec.stop();
  if (whisper) whisper.pause();
  await speak(text, byCode(lang).locale, { who: side, onError: (e) => toast(`線上語音失敗，改用內建語音：${friendlyError(e)}`, 5000) });
  speaking = false;
  if (wasActive && active === wasActive && rec) {
    rec.setLang(byCode(langOf(listeningSide)).locale);
    rec.start();
  }
  if (wasActive && active === wasActive && whisper) whisper.resume();
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
    h('button', { title: '唸出來', 'aria-label': '唸出來', onclick: () => speak(dst, l.locale, { who: side }) }, icon('i-play')),
    h('button', { title: '複製', 'aria-label': '複製', onclick: () => copyText(dst) }, icon('i-copy')),
  );
  meta.querySelectorAll('svg').forEach((s) => { s.style.width = '15px'; s.style.height = '15px'; });
  $('#thread').scrollTop = $('#thread').scrollHeight;
}

export function leaveTalk() { if (active) stop(); }
