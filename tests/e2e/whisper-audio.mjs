// Interpreter in any order with OpenAI Whisper: real audio of six turns is
// played into Chromium's fake microphone; the app must cut it into six
// utterances, send each as WAV to the transcription API (mocked here with
// the language each turn was spoken in) and translate each to the other
// language, whatever the order.
// Run: node tests/e2e/whisper-audio.mjs   (needs ffmpeg built with libflite)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { hasFlite, conversation, serve } from './voices.mjs';

if (!hasFlite()) { console.log('skip: ffmpeg with libflite is not available'); process.exit(0); }

// Spoken text is English audio; the mock answers as if each turn were in the
// listed language, in an order with repeats (zh, zh, en, zh, en, en).
const TURNS = [
  ['slt', 'Good morning, the weather is nice today', 'zh', '今天天氣不錯'],
  ['slt', 'I do not know what you said', 'zh', '我不知道你說什麼'],
  ['kal', 'The shipment from the plant is late', 'en', 'The shipment from the plant is late'],
  ['slt', 'Please send the price list by Friday', 'zh', '請在週五前寄報價單'],
  ['kal', 'I will check the inventory tomorrow', 'en', 'I will check the inventory tomorrow'],
  ['kal', 'We also need a new supplier', 'en', 'We also need a new supplier'],
];
const { path } = await conversation(TURNS.map(([v, t]) => [v, t]));
const { server, base } = await serve();

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path}`],
});
const context = await browser.newContext({ permissions: ['microphone'] });
await context.route('https://fonts.**', (r) => r.abort());
await context.addInitScript(() => { window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 5); });
const uploads = [];
await context.route('https://api.openai.com/v1/audio/transcriptions', async (route) => {
  const req = route.request();
  const body = req.postDataBuffer() || Buffer.alloc(0);
  uploads.push({ auth: req.headers().authorization, size: body.length, wav: body.includes(Buffer.from('WAVE')), model: body.includes(Buffer.from('whisper-1')) });
  const turn = TURNS[uploads.length - 1] || TURNS[TURNS.length - 1];
  const language = turn[2] === 'zh' ? 'chinese' : 'english';
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: turn[3], language }) });
});
await context.route('https://translate.googleapis.com/**', (route) => {
  const u = new URL(route.request().url());
  const q = u.searchParams.get('q'), tl = u.searchParams.get('tl');
  route.fulfill({ contentType: 'application/json', body: JSON.stringify([[[`[${tl}] ${q}`, q, null]], null, /[一-鿿]/.test(q) ? 'zh-TW' : 'en']) });
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '#settings');
await page.click('[data-provider=openai]');
await page.fill('#api-key', 'sk-openai-test');
await page.press('#api-key', 'Tab');
await page.goto(base + '#talk');
assert.match(await page.textContent('#auto-engine'), /OpenAI Whisper/);
await page.click('#talk-auto-btn');
await page.waitForFunction((n) => document.querySelectorAll('.bubble:not(.pending)').length >= n, TURNS.length, { timeout: 90000 });
const bubbles = await page.$$eval('.bubble', (bs) => bs.map((b) => ({ them: b.classList.contains('them'), src: b.querySelector('.src').textContent, dst: b.querySelector('.dst').textContent })));
await page.click('#talk-auto-btn');

console.log(bubbles.map((b) => `${b.them ? '對方' : '我  '} ${b.src} → ${b.dst}`).join('\n'));
assert.equal(uploads.length, TURNS.length, `one upload per spoken turn (got ${uploads.length})`);
assert.ok(uploads.every((u) => u.wav && u.model && u.auth === 'Bearer sk-openai-test' && u.size > 20000));
TURNS.forEach(([, , lang, text], i) => {
  assert.equal(bubbles[i].src, text);
  assert.equal(bubbles[i].them, lang === 'en', `turn ${i + 1} side`);
  assert.equal(bubbles[i].dst, lang === 'zh' ? `[en] ${text}` : `[zh-TW] ${text}`, `turn ${i + 1} direction`);
});
assert.deepEqual(errors, []);
console.log('\nany-order interpretation with Whisper passed');
await browser.close();
server.close();
