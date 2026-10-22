// Voice choice for reading translations aloud, and the "my voice" clone setup.
import { settings } from '../store.js';
import { AudioRecorder, speak } from '../speech.js';
import { createClone, deleteClone, hasClone, engineFor, VOICE_LABEL } from '../tts.js';
import { encodeWav } from '../whisper.js';
import { friendlyError } from '../ai.js';
import { clock } from '../textkit.js';
import { $, $$, toast } from '../ui.js';

let recorder = null;
let recStart = 0;
let recTick = 0;
let sample = null;     // WAV Blob of the recording
let previewUrl = '';
let creating = false;
const SAMPLE_LINE = 'Hello, this is my own voice. TalkBridge will use it to read my translations.';

export function initVoice() {
  $$('[data-voice-me]').forEach((b) => b.addEventListener('click', () => chooseMine(b.dataset.voiceMe)));
  $$('[data-voice-them]').forEach((b) => b.addEventListener('click', () => {
    settings.set('voiceThem', b.dataset.voiceThem);
    paint();
  }));

  const key = $('#eleven-key');
  key.value = settings.get('elevenKey');
  key.addEventListener('change', () => { settings.set('elevenKey', key.value.trim()); paint(); });
  $('#clone-rec').addEventListener('click', () => (recorder ? stopRecording() : startRecording()));
  $('#clone-consent').addEventListener('change', updateCreate);
  $('#clone-create').addEventListener('click', create);
  $('#clone-test').addEventListener('click', () => speak(SAMPLE_LINE, 'en-US', { who: 'me', onError: (e) => toast(friendlyError(e), 6000) }));
  $('#clone-retry').addEventListener('click', create);
  $('#clone-delete').addEventListener('click', remove);
  settings.onChange((k) => { if (k === 'openaiKey' || k === 'provider') paint(); });
  paint();
}

function chooseMine(v) {
  if (v === 'clone' && !hasClone()) {
    toast('還沒有建立你的聲音。請到「設定 → 我的聲音」錄一段聲音（約 1 分鐘）。', 6000);
    location.hash = 'settings';
    setTimeout(() => $('#clone-card').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    return;
  }
  settings.set('voiceMe', v);
  paint();
}

function paint() {
  if (settings.get('voiceMe') === 'clone' && !hasClone()) settings.set('voiceMe', 'female');
  $$('[data-voice-me]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.voiceMe === settings.get('voiceMe'))));
  $$('[data-voice-them]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.voiceThem === settings.get('voiceThem'))));
  $('#clone-ready').hidden = !hasClone();
  $('#clone-setup').hidden = hasClone();
  const badge = $('#clone-badge');
  badge.className = `badge ${creating ? 'busy' : hasClone() ? 'ready' : ''}`;
  badge.textContent = creating ? '建立中…' : hasClone() ? '✓ 已建立' : '尚未建立';
  const at = settings.get('cloneCreatedAt');
  $('#clone-when').textContent = at ? `建立時間：${new Date(at).toLocaleString('zh-TW')}` : '';
  const mine = $('[data-voice-me=clone]');
  if (mine) mine.textContent = hasClone() ? '我的聲音 ✓' : '我的聲音';
  const engine = engineFor('female');
  $('#voice-engine-note').textContent = engine === 'openai'
    ? '女聲、男聲使用 OpenAI 線上語音（較自然，依字數計費）。'
    : '女聲、男聲使用這台裝置內建的語音；在「AI 服務」填入 OpenAI 金鑰可改用更自然的線上語音。';
  updateCreate();
}

function updateCreate() {
  const ok = !!sample && $('#clone-consent').checked && !!(settings.get('elevenKey') || '').trim();
  $('#clone-create').disabled = !ok || creating;
  if (!sample) $('#clone-status').textContent = '';
  else if (!(settings.get('elevenKey') || '').trim()) $('#clone-status').textContent = '請先填入 ElevenLabs API 金鑰。';
  else if (!$('#clone-consent').checked) $('#clone-status').textContent = '請勾選同意。';
  else $('#clone-status').textContent = '';
}

async function startRecording() {
  recorder = new AudioRecorder();
  try {
    await recorder.start();
  } catch {
    recorder = null;
    toast('無法使用麥克風，請允許麥克風權限。', 5000);
    return;
  }
  recStart = Date.now();
  $('#clone-rec').lastChild.textContent = '停止錄音';
  $('#clone-rec').classList.replace('primary', 'danger');
  recTick = setInterval(() => {
    const ms = Date.now() - recStart;
    $('#clone-timer').textContent = clock(ms);
    $('#clone-rec-note').textContent = ms < 30000 ? '繼續唸…（至少 30 秒）' : ms < 60000 ? '很好，唸到 60 秒效果更好。' : '可以停止了。';
  }, 250);
}

async function stopRecording() {
  clearInterval(recTick);
  const ms = Date.now() - recStart;
  const blob = await recorder.stop();
  recorder = null;
  $('#clone-rec').lastChild.textContent = '重新錄音';
  $('#clone-rec').classList.replace('danger', 'primary');
  if (!blob || ms < 10000) {
    $('#clone-rec-note').textContent = '錄音太短，請至少錄 30 秒。';
    sample = null;
    updateCreate();
    return;
  }
  sample = await toWav(blob);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(sample);
  $('#clone-preview').src = previewUrl;
  $('#clone-preview').hidden = false;
  $('#clone-rec-note').textContent = ms < 30000 ? '錄音偏短，聲音可能不夠像；建議重錄到 60 秒。' : '錄好了，可以先播放確認。';
  updateCreate();
}

// Convert the browser recording (webm/mp4) to WAV, which every voice service accepts.
async function toWav(blob) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    return encodeWav(buf.getChannelData(0), buf.sampleRate);
  } catch {
    return blob;
  }
}

function step(n, state) {
  const li = $(`#clone-step-${n}`);
  li.className = state;
}

async function create() {
  if (creating || !sample) return;
  creating = true;
  const started = Date.now();
  $('#clone-create').disabled = true;
  $('#clone-status').textContent = '';
  $('#clone-error').hidden = true;
  $('#clone-progress').hidden = false;
  [1, 2, 3].forEach((n) => step(n, ''));
  step(1, 'done');
  step(2, 'doing');
  const tick = setInterval(() => { $('#clone-elapsed').textContent = `${Math.round((Date.now() - started) / 1000)} 秒`; }, 500);
  paint();
  try {
    const id = await createClone([sample], 'TalkBridge 我的聲音');
    step(2, 'done');
    settings.set('cloneVoiceId', id);
    settings.set('cloneCreatedAt', Date.now());
    settings.set('voiceMe', 'clone');
    step(3, 'doing');
    creating = false;
    sample = null;
    $('#clone-consent').checked = false;
    $('#clone-preview').hidden = true;
    $('#clone-progress').hidden = true;
    paint();
    $('#clone-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('✓ 你的聲音已建立好，正在用你的聲音試唸一句。', 6000);
    speak(SAMPLE_LINE, 'en-US', { who: 'me', onError: (e) => toast(`聲音已建立，但試唸失敗：${friendlyError(e)}`, 6000) });
  } catch (e) {
    creating = false;
    $('#clone-progress').hidden = true;
    $('#clone-error').hidden = false;
    const why = friendlyError(e);
    const raw = e && e.message && !why.includes(e.message) && !/^HTTP \d+$/.test(e.message) ? `\nElevenLabs 回覆：${e.message}` : '';
    $('#clone-error-text').textContent = why + raw;
    paint();
  } finally {
    clearInterval(tick);
  }
}

async function remove() {
  const id = settings.get('cloneVoiceId');
  $('#clone-delete').disabled = true;
  try {
    if (id) await deleteClone(id);
    settings.set('cloneVoiceId', '');
    settings.set('cloneCreatedAt', 0);
    paint();
    toast('已從 ElevenLabs 刪除你的聲音。');
  } catch (e) {
    toast(friendlyError(e), 6000);
  } finally {
    $('#clone-delete').disabled = false;
  }
}
