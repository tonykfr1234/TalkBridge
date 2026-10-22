// 設定: AI provider, key and model; translation engine, voice, theme, device support.
import { settings } from '../store.js';
import { PROVIDERS, MODELS, currentProvider, ask, hasAI, friendlyError } from '../ai.js';
import { canRecognize, canSpeak, pickMime, speak } from '../speech.js';
import { $, $$, h, toast } from '../ui.js';

let installPrompt = null;

function showProvider() {
  const id = currentProvider();
  const p = PROVIDERS[id];
  $$('[data-provider]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.provider === id)));
  $('#key-label').textContent = `${p.name} API 金鑰`;
  $('#api-key').placeholder = p.keyHint;
  $('#api-key').value = settings.get(p.keySetting) || '';
  $('#model').value = settings.get(p.modelSetting) || p.defaultModel;
  const list = $('#model-list');
  list.textContent = '';
  for (const m of p.models) {
    const label = id === 'claude' ? (MODELS.find((x) => x.id === m) || {}).label : '';
    list.append(h('option', { value: m }, label || m));
  }
  $('#key-note').textContent = `在 ${p.console} 建立金鑰，用量會計入你的 ${p.name} 帳戶。模型可從清單選，或輸入其他模型名稱。`;
  $('#key-status').textContent = '';
  updateEngineNote();
}

export function initSettings() {
  $$('[data-provider]').forEach((b) => b.addEventListener('click', () => {
    settings.set('provider', b.dataset.provider);
    showProvider();
  }));
  const key = $('#api-key');
  key.addEventListener('change', () => { settings.set(PROVIDERS[currentProvider()].keySetting, key.value.trim()); updateEngineNote(); });
  const model = $('#model');
  model.addEventListener('change', () => {
    const p = PROVIDERS[currentProvider()];
    settings.set(p.modelSetting, model.value.trim() || p.defaultModel);
  });
  $('#clear-key').addEventListener('click', () => {
    key.value = '';
    settings.set(PROVIDERS[currentProvider()].keySetting, '');
    if (settings.get('engine') === 'ai' && !hasAI()) setEngine('web');
    $('#key-status').textContent = '已清除';
    updateEngineNote();
  });
  $('#test-key').addEventListener('click', async () => {
    settings.set(PROVIDERS[currentProvider()].keySetting, key.value.trim());
    if (!hasAI()) { $('#key-status').textContent = '請先貼上金鑰'; return; }
    $('#key-status').textContent = '測試中…';
    $('#key-status').style.color = '';
    try {
      const r = await ask({ messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 2000 });
      $('#key-status').textContent = r ? '✓ 金鑰可以使用' : '已連線';
      $('#key-status').style.color = 'var(--ok)';
    } catch (e) {
      $('#key-status').textContent = friendlyError(e);
      $('#key-status').style.color = 'var(--rec)';
    }
  });
  showProvider();

  $$('input[name="engine"]').forEach((r) => {
    r.checked = r.value === settings.get('engine');
    r.addEventListener('change', () => setEngine(r.value));
  });

  const rate = $('#tts-rate');
  rate.value = settings.get('ttsRate');
  rate.addEventListener('change', () => settings.set('ttsRate', Number(rate.value)));
  $('#tts-test').addEventListener('click', () => speak('你好，這是 TalkBridge 的語音。', 'zh-TW'));

  const theme = settings.get('theme') || '';
  applyTheme(theme);
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    settings.set('theme', b.dataset.themeSet);
    applyTheme(b.dataset.themeSet);
  }));

  renderSupport();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('#install-btn').hidden = false;
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt = null;
    $('#install-btn').hidden = true;
  });
  updateEngineNote();
}

function setEngine(v) {
  if (v === 'ai' && !hasAI()) {
    toast('AI 翻譯需要先填入 AI 金鑰');
    v = 'web';
  }
  settings.set('engine', v);
  $$('input[name="engine"]').forEach((r) => { r.checked = r.value === v; });
  updateEngineNote();
}

function updateEngineNote() {
  const ai = settings.get('engine') === 'ai' && hasAI();
  $('#engine-note').textContent = ai ? `翻譯引擎：${PROVIDERS[currentProvider()].name} AI` : '翻譯引擎：免費網路翻譯';
}

function applyTheme(t) {
  if (t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
}

function renderSupport() {
  const rows = [
    ['語音辨識（口譯、字幕、會議）', canRecognize],
    ['語音朗讀', canSpeak],
    ['會議錄音', !!pickMime() && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)],
    ['分享檔案到 LINE 等 App', !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }))],
    ['離線開啟 App', 'serviceWorker' in navigator],
  ];
  const box = $('#support');
  box.textContent = '';
  for (const [name, ok] of rows) {
    box.append(h('div', {}, h('span', { class: ok ? 'yes' : 'no' }, ok ? '✓ ' : '✗ '), name));
  }
}
