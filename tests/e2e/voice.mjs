// Voice choice and "my voice" cloning in headless Chromium. Device voices are
// faked (headless has none); OpenAI speech and ElevenLabs are mocked.
// Run: node tests/e2e/voice.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './voices.mjs';

function wav(seconds = 0.3) {
  const rate = 16000, n = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return b;
}

const { server, base } = await serve();
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ permissions: ['microphone'] });
await context.route('https://fonts.**', (r) => r.abort());
await context.route('https://translate.googleapis.com/**', (route) => {
  const u = new URL(route.request().url());
  const q = u.searchParams.get('q'), tl = u.searchParams.get('tl');
  route.fulfill({ contentType: 'application/json', body: JSON.stringify([[[`[${tl}] ${q}`, q, null]], null, 'zh-TW']) });
});
await context.addInitScript(() => {
  const V = (name, lang) => ({ name, lang, voiceURI: name, localService: true, default: false });
  const voices = [
    V('Microsoft Hanhan - Chinese (Traditional, Taiwan)', 'zh-TW'), V('Microsoft Zhiwei - Chinese (Traditional, Taiwan)', 'zh-TW'),
    V('Microsoft Zira - English (United States)', 'en-US'), V('Microsoft David - English (United States)', 'en-US'),
  ];
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const ss = window.speechSynthesis;
  ss.getVoices = () => voices;
  ss.speak = (u) => { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name }); setTimeout(() => u.onend && u.onend(), 5); };
  ss.cancel = () => {};
});

const calls = [];
await context.route('https://api.openai.com/v1/audio/speech', async (route) => {
  calls.push({ api: 'openai', auth: route.request().headers().authorization, body: JSON.parse(route.request().postData()) });
  route.fulfill({ contentType: 'audio/wav', body: wav() });
});
await context.route('https://api.elevenlabs.io/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const body = req.postDataBuffer() || Buffer.alloc(0);
  calls.push({ api: 'eleven', method: req.method(), path: url.pathname, key: req.headers()['xi-api-key'], body });
  if (url.pathname === '/v1/voices/add') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ voice_id: 'voice123' }) });
  if (url.pathname.startsWith('/v1/text-to-speech/')) return route.fulfill({ contentType: 'audio/mpeg', body: wav() });
  if (req.method() === 'DELETE') return route.fulfill({ contentType: 'application/json', body: '{"status":"ok"}' });
  route.fulfill({ status: 404, body: '{}' });
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const step = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name); throw e; } };
const spoken = () => page.evaluate(() => window.__spoken.slice(-1)[0]);

await page.goto(base + '#talk');
await page.fill('#type-input', '你好');
await page.click('#type-form button[type=submit]');
await page.waitForSelector('.bubble .dst:text("[en] 你好")');
const play = () => page.click('.bubble .meta button[title="唸出來"]');

await step('device voices follow the chosen gender', async () => {
  assert.equal(await page.getAttribute('[data-voice-me=female]', 'aria-pressed'), 'true');
  await play();
  await page.waitForFunction(() => window.__spoken.length === 1);
  assert.equal((await spoken()).voice, 'Microsoft Zira - English (United States)');
  await page.click('[data-voice-me=male]');
  await play();
  await page.waitForFunction(() => window.__spoken.length === 2);
  assert.equal((await spoken()).voice, 'Microsoft David - English (United States)');
});

await step('"my voice" without a clone leads to setup', async () => {
  await page.click('[data-voice-me=clone]');
  await page.waitForSelector('#view-settings:not([hidden])');
  assert.match(await page.textContent('#toast'), /還沒有建立你的聲音/);
  assert.equal(await page.isVisible('#clone-setup'), true);
});

await step('OpenAI voices when an OpenAI key is saved', async () => {
  await page.click('[data-provider=openai]');
  await page.fill('#api-key', 'sk-openai-test');
  await page.press('#api-key', 'Tab');
  assert.match(await page.textContent('#voice-engine-note'), /OpenAI/);
  await page.goto(base + '#talk');
  await page.fill('#type-input', '謝謝');
  await page.click('#type-form button[type=submit]');
  await page.waitForSelector('.bubble .dst:text("[en] 謝謝")');
  await page.locator('.bubble .meta button[title="唸出來"]').last().click();
  await page.waitForTimeout(800);
  const c = calls.filter((x) => x.api === 'openai').pop();
  assert.ok(c, 'OpenAI speech called');
  assert.equal(c.body.voice, 'onyx', 'male voice (chosen above)');
  assert.equal(c.body.input, '[en] 謝謝');
  assert.equal(c.auth, 'Bearer sk-openai-test');
});

await step('clone: record, consent, create, speak, delete', async () => {
  await page.goto(base + '#settings');
  await page.fill('#eleven-key', 'sk_eleven_test');
  await page.press('#eleven-key', 'Tab');
  await page.click('#clone-rec');
  await page.waitForTimeout(11500);
  await page.click('#clone-rec');
  await page.waitForSelector('#clone-preview:not([hidden])');
  assert.equal(await page.isDisabled('#clone-create'), true, 'needs consent');
  await page.check('#clone-consent');
  await page.click('#clone-create');
  await page.waitForSelector('#clone-ready:not([hidden])');
  const add = calls.find((x) => x.path === '/v1/voices/add');
  assert.equal(add.key, 'sk_eleven_test');
  assert.ok(add.body.includes(Buffer.from('name="files"')), 'sample uploaded');
  assert.ok(add.body.includes(Buffer.from('RIFF')), 'as WAV');
  assert.ok(add.body.length > 11 * 16000, 'about 11 s of audio');

  await page.goto(base + '#talk');
  assert.equal(await page.getAttribute('[data-voice-me=clone]', 'aria-pressed'), 'true', 'my voice selected after creating it');
  await page.fill('#type-input', '出貨延後兩天');
  await page.click('#type-form button[type=submit]');
  await page.waitForSelector('.bubble .dst:text("[en] 出貨延後兩天")');
  await page.locator('.bubble .meta button[title="唸出來"]').last().click();
  await page.waitForTimeout(800);
  const tts = calls.filter((x) => x.path === '/v1/text-to-speech/voice123').pop();
  assert.ok(tts, 'spoken with the cloned voice');
  const body = JSON.parse(tts.body.toString());
  assert.equal(body.text, '[en] 出貨延後兩天');
  assert.equal(body.model_id, 'eleven_multilingual_v2');

  await page.goto(base + '#settings');
  await page.click('#clone-delete');
  await page.waitForSelector('#clone-setup:not([hidden])');
  assert.ok(calls.some((x) => x.method === 'DELETE' && x.path === '/v1/voices/voice123'));
  await page.goto(base + '#talk');
  assert.equal(await page.getAttribute('[data-voice-me=female]', 'aria-pressed'), 'true', 'falls back to a standard voice');
});

assert.deepEqual(errors, []);
console.log('\nvoice checks passed');
await browser.close();
server.close();
