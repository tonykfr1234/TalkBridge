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
  $('#clone-test').addEventListener('click', () => speak('Hello, this is my own voice, translated by TalkBridge.', 'en-US', { who: 'me', onError: (e) => toast(friendlyError(e), 6000) }));
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
  const engine = engineFor('female');
  $('#voice-engine-note').textContent = engine === 'openai'
    ? '女聲、男聲使用 OpenAI 線上語音（較自然，依字數計費）。'
    : '女聲、男聲使用這台裝置內建的語音；在「AI 服務」填入 OpenAI 金鑰可改用更自然的線上語音。';
  updateCreate();
}

function updateCreate() {
  const ok = !!sample && $('#clone-consent').checked && !!(settings.get('elevenKey') || '').trim();
  $('#clone-create').disabled = !ok;
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

async function create() {
  $('#clone-create').disabled = true;
  $('#clone-status').textContent = '正在建立你的聲音（約 10–30 秒）…';
  try {
    const id = await createClone([sample], 'TalkBridge 我的聲音');
    settings.set('cloneVoiceId', id);
    settings.set('voiceMe', 'clone');
    sample = null;
    $('#clone-consent').checked = false;
    $('#clone-preview').hidden = true;
    paint();
    toast(`已建立你的聲音，口譯時「我的話」會用${VOICE_LABEL.clone}唸。`, 5000);
  } catch (e) {
    $('#clone-status').textContent = friendlyError(e);
    updateCreate();
  }
}

async function remove() {
  const id = settings.get('cloneVoiceId');
  $('#clone-delete').disabled = true;
  try {
    if (id) await deleteClone(id);
    settings.set('cloneVoiceId', '');
    paint();
    toast('已從 ElevenLabs 刪除你的聲音。');
  } catch (e) {
    toast(friendlyError(e), 6000);
  } finally {
    $('#clone-delete').disabled = false;
  }
}
