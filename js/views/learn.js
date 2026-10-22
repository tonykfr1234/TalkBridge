// 練習: scenario phrase drills with pronunciation scoring, AI role-play and study tips.
import { byCode } from '../langs.js';
import { translate } from '../translate.js';
import { Recognizer, recognizerErrorText, canRecognize, speak, hasVoice } from '../speech.js';
import { settings, progress } from '../store.js';
import { scoreAttempt, scoreLabel } from '../textkit.js';
import { SCENARIOS, PHRASES, PRACTICE_LANGS, GUIDES, thaiFor } from '../practice-data.js';
import { aiTutor, hasAI, friendlyError } from '../ai.js';
import { $, $$, h, icon, toast } from '../ui.js';

let lang = settings.get('practiceLang');
let scenario = 'intro';
let female = !!settings.get('thaiFemale');
let listening = null;      // { rec, id }
const generated = new Map(); // `${lang}|${zh}` -> translated sentence
let chatTurns = [];
let chatRec = null;
let chatPending = false;

export function initLearn() {
  const tabs = $('#learn-langs');
  for (const code of PRACTICE_LANGS) {
    const l = byCode(code);
    const b = h('button', { class: 'chip', 'data-lang': code, 'aria-pressed': String(code === lang) }, `${l.name} ${l.native}`);
    b.addEventListener('click', () => { lang = code; settings.set('practiceLang', code); stopListening(); renderAll(); });
    tabs.append(b);
  }
  $$('[data-ltab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-ltab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-lpanel]').forEach((p) => { p.hidden = p.dataset.lpanel !== b.dataset.ltab; });
    stopListening();
    if (b.dataset.ltab === 'chat' && !chatTurns.length) startChat();
  }));
  $('#th-male').addEventListener('click', () => setFemale(false));
  $('#th-female').addEventListener('click', () => setFemale(true));

  const sel = $('#chat-scenario');
  for (const s of SCENARIOS) sel.append(h('option', { value: s.id }, s.name));
  sel.addEventListener('change', startChat);
  $('#chat-reset').addEventListener('click', startChat);
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#chat-input').value.trim();
    if (v) { $('#chat-input').value = ''; sendChat(v); }
  });
  $('#chat-mic').addEventListener('click', chatMic);
  renderAll();
}

function setFemale(v) {
  female = v;
  settings.set('thaiFemale', v);
  $('#th-male').setAttribute('aria-pressed', String(!v));
  $('#th-female').setAttribute('aria-pressed', String(v));
  renderPhrases();
}

function renderAll() {
  $$('#learn-langs .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('#thai-gender-row').hidden = lang !== 'th';
  setFemale(female);
  renderStats();
  renderScenarios();
  renderPhrases();
  renderGuide();
  chatTurns = [];
  $('#chat').textContent = '';
  if (!$('[data-lpanel="chat"]').hidden) startChat();
  const loc = byCode(lang).locale;
  $('#voice-note').textContent = hasVoice(loc) ? '' : `這台裝置沒有安裝${byCode(lang).name}語音，可能無法播放發音。Windows：設定 → 時間與語言 → 語音，新增語音；Android：設定 → 文字轉語音。`;
}

function renderStats() {
  const s = settings.get('streak');
  $('#streak').textContent = s ? s.count : 0;
  const mine = progress.all()[lang] || {};
  $('#learned-count').textContent = Object.values(mine).filter((x) => x.learned).length;
}

function renderScenarios() {
  const box = $('#scenarios');
  box.textContent = '';
  const mine = progress.all()[lang] || {};
  for (const s of SCENARIOS) {
    const items = PHRASES.filter((p) => p.scenario === s.id);
    const done = items.filter((p) => mine[p.id] && mine[p.id].learned).length;
    const b = h('button', { class: 'scen', 'aria-pressed': String(s.id === scenario) },
      h('b', {}, s.name), h('span', {}, s.desc),
      h('span', {}, `${done} / ${items.length} 句熟練`),
      h('span', { class: 'prog' }, h('i', { style: `width:${Math.round((done / items.length) * 100)}%` })));
    b.addEventListener('click', () => { scenario = s.id; stopListening(); renderScenarios(); renderPhrases(); });
    box.append(b);
  }
}

function sentence(p) {
  if (lang === 'th') return thaiFor(p, female);
  if (p[lang]) return { text: p[lang], roman: '' };
  return { text: generated.get(`${lang}|${p.zh}`) || '', roman: '' };
}

async function renderPhrases() {
  const box = $('#phrases');
  box.textContent = '';
  const items = PHRASES.filter((p) => p.scenario === scenario);
  const missing = items.filter((p) => !sentence(p).text);
  if (missing.length) {
    box.append(h('p', { class: 'muted' }, '正在產生句子…'));
    await Promise.all(missing.map(async (p) => {
      try { generated.set(`${lang}|${p.zh}`, (await translate(p.zh, 'zh-TW', lang)).text); } catch { /* shown as unavailable */ }
    }));
    box.textContent = '';
  }
  for (const p of items) box.append(phraseCard(p));
}

function phraseCard(p) {
  const { text, roman } = sentence(p);
  const loc = byCode(lang).locale;
  const rec = progress.get(lang, p.id);
  const result = h('div', { class: 'result' });
  if (rec && rec.best) result.append(h('span', { class: 'muted small' }, `最佳分數 ${rec.best}`), rec.learned ? h('span', { class: 'learned' }, '　✓ 已熟練') : null);
  const card = h('div', { class: 'card phrase' },
    h('div', {},
      h('div', { class: 'target', lang: lang }, text || '（需要網路才能產生這句）'),
      roman ? h('div', { class: 'roman' }, roman) : null,
      h('div', { class: 'zh' }, p.zh)),
    h('div', { class: 'acts' },
      h('button', { class: 'btn icon-btn', title: '播放', 'aria-label': '播放', onclick: () => speak(text, loc) }, icon('i-play')),
      h('button', { class: 'btn icon-btn', title: '慢速播放', 'aria-label': '慢速播放', onclick: () => speak(text, loc, { rate: 0.6 }) }, icon('i-slow')),
      h('button', { class: 'btn icon-btn primary', title: '跟著說', 'aria-label': '跟著說', 'data-mic': p.id, onclick: () => tryIt(p, text, result) }, icon('i-mic'))),
    result);
  return card;
}

function stopListening() {
  if (listening) { listening.rec.stop(); listening = null; }
  $$('[data-mic]').forEach((b) => b.classList.remove('danger'));
}

function tryIt(p, text, result) {
  if (!text) return;
  if (!canRecognize) { toast(recognizerErrorText('unsupported'), 5000); return; }
  if (listening && listening.id === p.id) { stopListening(); return; }
  stopListening();
  const btn = $(`[data-mic="${p.id}"]`);
  btn.classList.add('danger');
  result.textContent = '請說…';
  let got = false;
  const rec = new Recognizer({
    lang: byCode(lang).locale,
    onInterim: (t) => { if (t) result.textContent = `「${t}」`; },
    onFinal: (heard) => {
      got = true;
      stopListening();
      showScore(p, text, heard, result);
    },
    onState: (s, d) => {
      if (s === 'error') { stopListening(); result.textContent = recognizerErrorText(d); }
      if (s === 'stopped' && !got && result.textContent === '請說…') result.textContent = '沒有聽到聲音，再按一次麥克風。';
    },
  });
  listening = { rec, id: p.id };
  rec.start();
  setTimeout(() => { if (listening && listening.rec === rec && !got) stopListening(); }, 12000);
}

function showScore(p, target, heard, result) {
  const { score, parts } = scoreAttempt(target, heard);
  const cls = score >= 85 ? 'hi' : score >= 60 ? 'mid' : 'lo';
  const prev = progress.get(lang, p.id) || { best: 0, tries: 0, learned: false };
  const learned = prev.learned || score >= 85;
  progress.record(lang, p.id, { best: Math.max(prev.best, score), tries: prev.tries + 1, learned });
  const spaced = !/[一-鿿぀-ヿ฀-๿]/.test(target);
  result.textContent = '';
  result.append(
    h('div', { class: 'row' }, h('span', { class: `score ${cls}` }, `${score}`), h('b', {}, scoreLabel(score)),
      learned && !prev.learned ? h('span', { class: 'learned' }, '✓ 已熟練') : null),
    h('div', { style: 'margin-top:4px' }, h('span', { class: 'muted small' }, '系統聽到：'), heard),
    h('div', {}, h('span', { class: 'muted small' }, '比對：'),
      ...parts.map((x) => h('span', { class: x.ok ? 'good' : 'bad' }, x.text + (spaced ? ' ' : '')))));
  renderStats();
  renderScenarios();
}

function renderGuide() {
  const g = GUIDES[lang] || GUIDES.en;
  const box = $('#guide');
  box.textContent = '';
  box.append(
    h('h2', {}, g.title),
    h('ul', {}, ...g.points.map((x) => h('li', {}, x))),
    h('h2', { style: 'margin-top:16px' }, '每天 15 分鐘的練法'),
    h('ol', {},
      h('li', {}, '先聽：每句按播放兩次、慢速一次，注意聲調和重音。'),
      h('li', {}, '跟讀：按麥克風說一次，分數低於 85 就看紅色標記的字再練。'),
      h('li', {}, '實戰：到「AI 情境對話」用同一個情境對話 5 回合，看 AI 給的修正。'),
      h('li', {}, '應用：開會或出差時用「口譯」模式，把聽到的好句子記下來，隔天再練。')),
    h('p', { class: 'small muted' }, '評分比對的是語音辨識聽到的文字與目標句子，聲調或發音不準時，辨識結果會變成別的字，就會被標成紅色。'));
}

// ---------- AI role-play ----------
function scenarioName() {
  const s = SCENARIOS.find((x) => x.id === $('#chat-scenario').value) || SCENARIOS[0];
  return `${s.name}（${s.desc}）`;
}

function startChat() {
  chatTurns = [{ role: 'user', content: `Start the role-play now. I am the learner. Scenario: ${scenarioName()}.` }];
  $('#chat').textContent = '';
  if (!hasAI()) {
    $('#chat-status').textContent = 'AI 情境對話需要 AI 金鑰（DeepSeek、OpenAI 或 Claude），請到「設定」填入。沒有金鑰時可先用「情境跟讀」練習。';
    return;
  }
  ask();
}

async function ask() {
  chatPending = true;
  $('#chat-status').textContent = 'AI 正在回覆…';
  try {
    const r = await aiTutor({ lang, langName: byCode(lang).native, scenario: scenarioName(), turns: chatTurns });
    chatTurns.push({ role: 'assistant', content: r.reply });
    const last = [...$('#chat').querySelectorAll('.msg.me')].pop();
    if (last && (r.feedback || r.better)) {
      last.append(h('div', { class: 'fb' }, r.feedback, r.better ? h('div', {}, h('b', {}, '更自然的說法：'), h('span', { lang }, r.better)) : null));
    }
    const loc = byCode(lang).locale;
    $('#chat').append(h('div', { class: 'msg' },
      h('div', { lang }, r.reply),
      r.romanization ? h('div', { class: 'rm' }, r.romanization) : null,
      h('div', { class: 'zh' }, r.replyZh),
      h('button', { class: 'btn ghost small', onclick: () => speak(r.reply, loc) }, icon('i-play'), '播放')));
    $('#chat').scrollTop = $('#chat').scrollHeight;
    $('#chat-status').textContent = '';
    speak(r.reply, loc);
  } catch (e) {
    $('#chat-status').textContent = friendlyError(e);
  } finally {
    chatPending = false;
  }
}

function sendChat(text) {
  if (!hasAI()) { toast('請先到「設定」填入 AI 金鑰'); return; }
  if (chatPending) { toast('請等 AI 回覆後再送出'); return; }
  const last = chatTurns[chatTurns.length - 1];
  // After a failed request the last turn is still the learner's: add to it so
  // turns keep alternating user/assistant.
  if (last && last.role === 'user') last.content += '\n' + text;
  else chatTurns.push({ role: 'user', content: text });
  $('#chat').append(h('div', { class: 'msg me', lang }, text));
  $('#chat').scrollTop = $('#chat').scrollHeight;
  ask();
}

function chatMic() {
  if (!canRecognize) { toast(recognizerErrorText('unsupported'), 5000); return; }
  if (chatRec) { chatRec.stop(); chatRec = null; $('#chat-mic').classList.remove('danger'); return; }
  $('#chat-mic').classList.add('danger');
  chatRec = new Recognizer({
    lang: byCode(lang).locale,
    onInterim: (t) => { if (t) $('#chat-input').value = t; },
    onFinal: (t) => {
      $('#chat-input').value = '';
      chatRec.stop(); chatRec = null;
      $('#chat-mic').classList.remove('danger');
      sendChat(t);
    },
    onState: (s, d) => { if (s === 'error') { toast(recognizerErrorText(d)); $('#chat-mic').classList.remove('danger'); chatRec = null; } },
  });
  chatRec.start();
}

export function leaveLearn() {
  stopListening();
  if (chatRec) { chatRec.stop(); chatRec = null; }
}
