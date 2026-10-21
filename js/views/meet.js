// 會議: live transcript + audio recording, speaker tags, minutes, export and share.
import { byCode } from '../langs.js';
import { translate } from '../translate.js';
import { Recognizer, recognizerErrorText, canRecognize, AudioRecorder, levelMeter, extForMime } from '../speech.js';
import { settings, meetings } from '../store.js';
import { clock, toTXT, toSRT, toMarkdown, toShareText, speakerStats, localNotes } from '../textkit.js';
import { aiMinutes, aiDiarize, hasAI, friendlyError } from '../ai.js';
import { $, $$, h, fillLangSelect, toast, download, copyText, lineShareUrl, shareFiles, keepAwake, fileStamp } from '../ui.js';

const COLORS = ['#0b7480', '#7a4b9a', '#c4632b', '#2f6db3', '#b8336a', '#4f7d2c', '#8a6d1c', '#5b5f97', '#a33c3c'];

let cur = null;          // the meeting on screen
let rec = null;          // Recognizer while recording
let recorder = null;     // AudioRecorder
let stopMeter = null;
let running = false;
let paused = false;
let accumulated = 0;
let resumedAt = 0;
let tick = 0;
let speakerIdx = 0;
let interimText = '';
let saveTimer = 0;
let audioUrl = '';

export const meetingBusy = () => running;

function blank() {
  const d = new Date();
  return {
    id: 'm' + d.getTime(),
    title: `會議 ${d.toLocaleDateString('zh-TW')} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`,
    createdAt: d.getTime(),
    durationMs: 0,
    lang: settings.get('meetLang'),
    trLang: settings.get('meetTranslate'),
    speakers: ['發言人 A', '發言人 B', '發言人 C'],
    segments: [],
    notes: null,
    audio: null,
    audioMime: '',
  };
}

export function initMeet() {
  fillLangSelect($('#meet-lang'), settings.get('meetLang'));
  fillLangSelect($('#meet-tr'), settings.get('meetTranslate'));
  $('#meet-tr').prepend(h('option', { value: '' }, '不翻譯'));
  $('#meet-tr').value = settings.get('meetTranslate') || '';
  fillLangSelect($('#sum-lang'), settings.get('summaryLang'), ['zh-TW', 'en', 'vi', 'th', 'ja', 'ko', 'zh-CN']);
  $('#meet-lang').addEventListener('change', (e) => {
    settings.set('meetLang', e.target.value);
    if (rec) rec.setLang(byCode(e.target.value).locale);
  });
  $('#meet-tr').addEventListener('change', (e) => settings.set('meetTranslate', e.target.value));
  $('#sum-lang').addEventListener('change', (e) => settings.set('summaryLang', e.target.value));
  $('#meet-record').checked = settings.get('meetRecord');
  $('#meet-record').addEventListener('change', (e) => settings.set('meetRecord', e.target.checked));

  $('#meet-start').addEventListener('click', start);
  $('#meet-pause').addEventListener('click', togglePause);
  $('#meet-stop').addEventListener('click', finish);
  $('#meet-add-speaker').addEventListener('click', addSpeaker);
  $('#meet-title').addEventListener('change', (e) => { cur.title = e.target.value.trim() || cur.title; queueSave(); renderHistory(); });

  $$('[data-mtab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.mtab)));
  $('#meet-summarize').addEventListener('click', summarize);
  $('#meet-local-sum').addEventListener('click', () => {
    if (!cur.segments.length) { toast('還沒有逐字稿'); return; }
    cur.notes = localNotes(cur.segments);
    queueSave();
    renderNotes();
    $('#sum-status').textContent = '離線整理只挑出關鍵句和可能的待辦，設定 Claude 金鑰後可產生完整摘要。';
  });
  $('#meet-diarize').addEventListener('click', diarize);
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.export)));
  $('#share-files').addEventListener('click', shareAll);
  $('#share-copy').addEventListener('click', () => copyText(toShareText(cur, 4000)));
  $('#meet-delete').addEventListener('click', () => { $('#meet-delete-confirm').hidden = false; });
  $('#meet-delete-no').addEventListener('click', () => { $('#meet-delete-confirm').hidden = true; });
  $('#meet-delete-yes').addEventListener('click', removeCurrent);

  document.addEventListener('keydown', (e) => {
    if ($('#view-meet').hidden || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= cur.speakers.length) { speakerIdx = n - 1; renderSpeakers(); }
  });

  cur = blank();
  renderAll();
  renderHistory();
}

// ---------- recording ----------
const elapsed = () => accumulated + (running && !paused ? Date.now() - resumedAt : 0);

async function start() {
  if (running) return;
  if (!canRecognize) { toast(recognizerErrorText('unsupported'), 5000); return; }
  if (cur.segments.length) cur = blank();
  cur.lang = settings.get('meetLang');
  cur.trLang = settings.get('meetTranslate');
  if (settings.get('meetRecord') && typeof MediaRecorder !== 'undefined') {
    recorder = new AudioRecorder();
    try {
      const stream = await recorder.start();
      stopMeter = levelMeter(stream, (v) => { $('#meet-level').style.width = Math.round(v * 100) + '%'; });
    } catch {
      recorder = null;
      toast('無法錄音（麥克風權限被拒絕）。逐字稿仍會繼續。', 5000);
    }
  }
  running = true;
  paused = false;
  accumulated = 0;
  resumedAt = Date.now();
  rec = new Recognizer({
    lang: byCode(cur.lang).locale,
    onInterim: (t) => { interimText = t; renderInterim(); },
    onFinal: onFinal,
    onState: (s, d) => {
      if (s === 'error') { toast(recognizerErrorText(d), 6000); $('#meet-status').textContent = '語音辨識停止了'; }
    },
  });
  rec.start();
  keepAwake(true);
  tick = setInterval(() => { $('#meet-timer').textContent = clock(elapsed()); }, 500);
  $('#meet-start').hidden = true;
  $('#meet-pause').hidden = false;
  $('#meet-stop').hidden = false;
  $('#meet-status').textContent = '記錄中';
  $('#meet-lang').disabled = false;
  renderAll();
  renderHistory();
}

function togglePause() {
  if (!running) return;
  if (!paused) {
    accumulated = elapsed();
    paused = true;
    rec.stop();
    if (recorder) recorder.pause();
    $('#meet-pause').lastChild.textContent = '繼續';
    $('#meet-status').textContent = '已暫停';
  } else {
    paused = false;
    resumedAt = Date.now();
    rec.start();
    if (recorder) recorder.resume();
    $('#meet-pause').lastChild.textContent = '暫停';
    $('#meet-status').textContent = '記錄中';
  }
}

async function finish() {
  if (!running) return;
  cur.durationMs = elapsed();
  running = false;
  rec.stop();
  rec = null;
  clearInterval(tick);
  keepAwake(false);
  if (stopMeter) { stopMeter(); stopMeter = null; }
  $('#meet-level').style.width = '0';
  if (recorder) {
    const blob = await recorder.stop();
    if (blob && blob.size) { cur.audio = blob; cur.audioMime = blob.type; }
    recorder = null;
  }
  interimText = '';
  $('#meet-start').hidden = false;
  $('#meet-pause').hidden = true;
  $('#meet-stop').hidden = true;
  $('#meet-pause').lastChild.textContent = '暫停';
  $('#meet-status').textContent = '';
  await saveNow();
  toast('已儲存在這台裝置');
  renderAll();
  renderHistory();
  showTab(cur.segments.length ? 'notes' : 'transcript');
}

async function onFinal(text) {
  const t = elapsed();
  const seg = { t: Math.max(0, t - Math.min(6000, text.length * 180)), end: t, speaker: cur.speakers[speakerIdx] || '', text, tr: '' };
  cur.segments.push(seg);
  interimText = '';
  renderTranscript();
  queueSave();
  if (cur.trLang && cur.trLang !== cur.lang) {
    try {
      seg.tr = (await translate(text, cur.lang, cur.trLang)).text;
      renderTranscript();
      queueSave();
    } catch { /* keep transcript even if translation fails */ }
  }
}

function addSpeaker() {
  const letter = String.fromCharCode(65 + cur.speakers.length);
  cur.speakers.push(`發言人 ${letter}`);
  speakerIdx = cur.speakers.length - 1;
  renderSpeakers();
  queueSave();
}

// ---------- persistence ----------
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

async function saveNow() {
  clearTimeout(saveTimer);
  if (!cur.segments.length && !cur.audio) return;
  if (running) cur.durationMs = elapsed();
  try {
    await meetings.save(cur);
    $('#meet-saved').textContent = `已自動儲存 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    $('#meet-saved').textContent = '無法儲存到瀏覽器（可能是無痕模式），請記得匯出。';
  }
}

async function renderHistory() {
  const box = $('#meet-history');
  let list = [];
  try { list = await meetings.list(); } catch { list = []; }
  box.textContent = '';
  for (const m of list) {
    box.append(h('button', { onclick: () => open(m.id), 'aria-current': m.id === cur.id ? 'true' : null },
      h('span', { class: 't' }, m.title),
      h('span', { class: 'd' }, `${new Date(m.createdAt).toLocaleDateString('zh-TW')} · ${clock(m.durationMs || 0)} · ${m.segments.length} 句${m.audio ? ' · 有錄音' : ''}`)));
  }
  $('#history-empty').textContent = list.length ? '儲存的會議只放在這台裝置的瀏覽器裡。' : '還沒有儲存的會議。結束記錄後會出現在這裡。';
}

async function open(id) {
  if (running) { toast('請先結束目前的記錄'); return; }
  const m = await meetings.get(id);
  if (!m) return;
  cur = m;
  speakerIdx = 0;
  renderAll();
  renderHistory();
  showTab(cur.notes ? 'notes' : 'transcript');
}

async function removeCurrent() {
  $('#meet-delete-confirm').hidden = true;
  try { await meetings.remove(cur.id); } catch { /* already gone */ }
  cur = blank();
  renderAll();
  renderHistory();
  toast('已刪除');
}

// ---------- rendering ----------
function showTab(name) {
  $$('[data-mtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mtab === name)));
  $$('[data-mpanel]').forEach((p) => { p.hidden = p.dataset.mpanel !== name; });
  if (name === 'speakers') renderBars();
  if (name === 'export') renderExport();
}

function renderAll() {
  $('#meet-title').value = cur.title;
  $('#meet-timer').textContent = clock(running ? elapsed() : cur.durationMs);
  $('#meet-saved').textContent = '';
  $('#meet-delete').hidden = !cur.segments.length && !cur.audio;
  renderSpeakers();
  renderTranscript();
  renderNotes();
  renderBars();
  renderExport();
}

function colorOf(name) {
  const i = cur.speakers.indexOf(name);
  return COLORS[(i < 0 ? 8 : i) % COLORS.length];
}

function renderSpeakers() {
  const box = $('#meet-speakers');
  box.textContent = '';
  cur.speakers.forEach((name, i) => {
    const chip = h('button', { class: 'chip', 'aria-pressed': String(i === speakerIdx), title: '點兩下可改名' },
      h('span', { class: 'dot', style: `background:${COLORS[i % COLORS.length]}` }), name, i < 9 ? h('kbd', {}, String(i + 1)) : null);
    chip.addEventListener('click', () => { speakerIdx = i; renderSpeakers(); });
    chip.addEventListener('dblclick', () => renameSpeaker(i));
    box.append(chip);
  });
}

function renameSpeaker(i) {
  const old = cur.speakers[i];
  const chip = $('#meet-speakers').children[i];
  const input = h('input', { type: 'text', value: old, 'aria-label': '發言人名稱', style: 'width:110px;padding:4px 8px' });
  chip.replaceWith(input);
  input.focus();
  input.select();
  const done = () => {
    const v = input.value.trim();
    if (v && v !== old && !cur.speakers.includes(v)) {
      cur.speakers[i] = v;
      cur.segments.forEach((s) => { if (s.speaker === old) s.speaker = v; });
      queueSave();
    }
    renderSpeakers();
    renderTranscript();
  };
  input.addEventListener('blur', done);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = old; input.blur(); } });
}

function renderTranscript() {
  const box = $('#meet-transcript');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.textContent = '';
  cur.segments.forEach((s, i) => {
    const sel = h('select', { 'aria-label': '發言人', style: `color:${colorOf(s.speaker)}` },
      ...cur.speakers.map((n) => h('option', { value: n, selected: n === s.speaker }, n)));
    sel.addEventListener('change', () => { s.speaker = sel.value; sel.style.color = colorOf(s.speaker); queueSave(); });
    const txt = h('span', { contenteditable: 'true', spellcheck: 'false' }, s.text);
    txt.addEventListener('blur', () => { const v = txt.textContent.trim(); if (v && v !== s.text) { s.text = v; queueSave(); } });
    const time = h('time', { title: '從這裡播放錄音' }, clock(s.t));
    time.addEventListener('click', () => seek(s.t));
    box.append(h('div', { class: 'seg', 'data-i': i }, time, h('div', { class: 'who' }, sel),
      h('div', { class: 'txt' }, txt, s.tr ? h('div', { class: 'tr' }, s.tr) : null)));
  });
  renderInterim();
  $('#meet-empty').hidden = !!cur.segments.length || running;
  if (atBottom || running) box.scrollTop = box.scrollHeight;
}

function renderInterim() {
  const box = $('#meet-transcript');
  let el = box.querySelector('.interim');
  if (!interimText) { if (el) el.remove(); return; }
  if (!el) {
    el = h('div', { class: 'seg interim' }, h('time', {}, clock(elapsed())), h('div', { class: 'who small muted' }, cur.speakers[speakerIdx] || ''), h('div', { class: 'txt' }));
    box.append(el);
  }
  el.querySelector('.txt').textContent = interimText;
  box.scrollTop = box.scrollHeight;
}

function seek(ms) {
  const a = $('#meet-audio');
  if (!cur.audio) { toast('這場會議沒有錄音'); return; }
  showTab('export');
  a.currentTime = ms / 1000;
  a.play().catch(() => {});
}

function list(title, items) {
  if (!items || !items.length) return null;
  return [h('h3', {}, title), h('ul', {}, ...items.map((x) => h('li', {}, x)))];
}

function renderNotes() {
  const box = $('#meet-notes');
  box.textContent = '';
  const n = cur.notes;
  if (!n) {
    box.append(h('p', { class: 'muted' }, cur.segments.length
      ? (hasAI() ? '按「AI 整理重點」產生摘要、決議、待辦事項和英文版摘要。' : '按「離線快速整理」挑出關鍵句；在「設定」填入 Claude 金鑰可產生完整會議記錄與英文摘要。')
      : '會議結束後可在這裡整理重點。'));
    return;
  }
  if (n.title && n.title !== cur.title && !n.offline) box.append(h('p', { class: 'eyebrow' }, n.title));
  if (n.summary) box.append(h('p', {}, n.summary));
  [list('重點', n.keyPoints), list('決議', n.decisions)].forEach((x) => x && box.append(...x));
  if (n.actionItems && n.actionItems.length) {
    box.append(h('h3', {}, '待辦事項'), h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, '事項'), h('th', {}, '負責人'), h('th', {}, '期限'))),
      h('tbody', {}, ...n.actionItems.map((a) => h('tr', {}, h('td', {}, a.task), h('td', {}, a.owner || '—'), h('td', {}, a.due || '—')))))));
  }
  const q = list('待確認問題', n.openQuestions);
  if (q) box.append(...q);
  if (n.englishSummary) box.append(h('h3', {}, 'English summary'), h('p', { lang: 'en' }, n.englishSummary));
}

function renderBars() {
  const box = $('#meet-bars');
  box.textContent = '';
  const stats = speakerStats(cur.segments);
  if (!stats.length) { box.append(h('p', { class: 'muted' }, '有逐字稿後會顯示每位發言人的發言比例。')); }
  for (const s of stats) {
    box.append(h('div', { class: 'bar' },
      h('span', { style: `color:${colorOf(s.speaker)};font-weight:700` }, s.speaker),
      h('span', { class: 'track' }, h('i', { style: `width:${Math.round(s.share * 100)}%;background:${colorOf(s.speaker)}` })),
      h('span', { class: 'pct' }, `${Math.round(s.share * 100)}%`)));
  }
  const notes = $('#meet-speaker-notes');
  notes.textContent = '';
  const sp = cur.notes && cur.notes.speakers;
  if (sp && sp.length) {
    for (const s of sp) {
      notes.append(h('div', { class: 'card', style: 'box-shadow:none;margin-bottom:8px' },
        h('b', {}, s.speaker), s.role ? h('span', { class: 'muted small' }, `　${s.role}`) : null,
        s.stance ? h('p', { class: 'small', style: 'margin:4px 0' }, s.stance) : null,
        s.mainPoints && s.mainPoints.length ? h('ul', { class: 'small' }, ...s.mainPoints.map((p) => h('li', {}, p))) : null));
    }
  }
}

function renderExport() {
  const a = $('#meet-audio');
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = ''; }
  if (cur.audio) {
    audioUrl = URL.createObjectURL(cur.audio);
    a.src = audioUrl;
    a.hidden = false;
  } else {
    a.removeAttribute('src');
    a.hidden = true;
  }
  $('#export-audio').disabled = !cur.audio;
  $('#share-line').href = lineShareUrl(toShareText(cur));
}

// ---------- AI ----------
function transcriptForAI() {
  return cur.segments.map((s) => `[${clock(s.t)}] ${s.speaker}: ${s.text}`).join('\n');
}

async function summarize() {
  if (!cur.segments.length) { toast('還沒有逐字稿'); return; }
  if (!hasAI()) { toast('請先到「設定」填入 Claude API 金鑰，或使用離線快速整理。', 5000); return; }
  const btn = $('#meet-summarize');
  btn.disabled = true;
  $('#sum-status').textContent = 'Claude 正在整理會議重點，長會議約需 30–90 秒…';
  try {
    const notes = await aiMinutes(transcriptForAI(), { outLang: settings.get('summaryLang') });
    cur.notes = notes;
    if (notes.title && /^會議 \d/.test(cur.title)) cur.title = notes.title;
    await saveNow();
    renderAll();
    renderHistory();
    $('#sum-status').textContent = '完成。AI 摘要可能有誤，重要內容請對照逐字稿或錄音。';
  } catch (e) {
    $('#sum-status').textContent = friendlyError(e);
  } finally {
    btn.disabled = false;
  }
}

async function diarize() {
  if (!cur.segments.length) { toast('還沒有逐字稿'); return; }
  if (!hasAI()) { toast('這個功能需要 Claude API 金鑰（設定 → AI）。', 5000); return; }
  const btn = $('#meet-diarize');
  btn.disabled = true;
  $('#diarize-status').textContent = '分析中…';
  try {
    const res = await aiDiarize(cur.segments.slice(0, 600), cur.speakers);
    let changed = 0;
    for (const l of res.labels) {
      const s = cur.segments[l.i];
      if (s && cur.speakers.includes(l.speaker) && s.speaker !== l.speaker) { s.speaker = l.speaker; changed++; }
    }
    await saveNow();
    renderTranscript();
    renderBars();
    $('#diarize-status').textContent = `已調整 ${changed} 句。${res.note || ''}`;
  } catch (e) {
    $('#diarize-status').textContent = friendlyError(e);
  } finally {
    btn.disabled = false;
  }
}

// ---------- export / share ----------
function files() {
  const base = fileStamp(cur.createdAt);
  const out = [
    new File([toTXT(cur)], `${base}_transcript.txt`, { type: 'text/plain' }),
    new File([toMarkdown(cur)], `${base}_minutes.md`, { type: 'text/markdown' }),
  ];
  if (cur.audio) out.push(new File([cur.audio], `${base}_audio.${extForMime(cur.audioMime || cur.audio.type)}`, { type: cur.audio.type }));
  return out;
}

function exportAs(kind) {
  if (!cur.segments.length && kind !== 'audio') { toast('還沒有逐字稿可以匯出'); return; }
  const base = fileStamp(cur.createdAt);
  if (kind === 'txt') download(new Blob([toTXT(cur)], { type: 'text/plain;charset=utf-8' }), `${base}_transcript.txt`);
  if (kind === 'md') download(new Blob([toMarkdown(cur)], { type: 'text/markdown;charset=utf-8' }), `${base}_minutes.md`);
  if (kind === 'srt') download(new Blob([toSRT(cur)], { type: 'text/plain;charset=utf-8' }), `${base}.srt`);
  if (kind === 'json') {
    const { audio, ...rest } = cur;
    download(new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' }), `${base}.json`);
  }
  if (kind === 'audio' && cur.audio) download(cur.audio, `${base}_audio.${extForMime(cur.audioMime || cur.audio.type)}`);
}

async function shareAll() {
  if (!cur.segments.length) { toast('還沒有內容可以分享'); return; }
  const result = await shareFiles({ title: cur.title, text: toShareText(cur), files: files() });
  if (result === 'unsupported') {
    const textOnly = await shareFiles({ title: cur.title, text: toShareText(cur, 4000) });
    if (textOnly === 'unsupported') toast('這個瀏覽器不支援直接分享檔案，請改用下載，或按「用 LINE 傳送重點」。', 6000);
  }
}
