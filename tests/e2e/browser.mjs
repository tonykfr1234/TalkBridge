// End-to-end check in headless Chromium with simulated speech, a fake
// microphone, a mocked translation service and a mocked Claude API.
// Run: node tests/e2e/browser.mjs [--shots]   (needs the `playwright` package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path || 'index.html'));
    res.writeHead(200, { 'content-type': TYPES[extname(path || 'index.html')] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// Sample translations so screenshots read naturally; anything else comes
// back tagged with the target language.
const DICT = {
  '你好，很高興認識你': { en: 'Hello, nice to meet you.' },
  '聽中文': { en: 'Listen to Chinese', 'zh-TW': '聽中文' },
  'Nice to meet you too': { 'zh-TW': '我也很高興認識你。' },
  '請問洗手間在哪裡': { en: 'Excuse me, where is the restroom?' },
  'Welcome everyone to the quarterly review': { 'zh-TW': '歡迎大家參加本季業績檢討會' },
  'Revenue grew twelve percent this quarter': { 'zh-TW': '本季營收成長了百分之十二' },
  '好，那我們決定先空運一批。': { en: "OK, then we've decided to air-ship one batch first." },
  '我們開始今天的週會，先看越南工廠的出貨進度。': { en: "Let's start today's weekly meeting with shipments from the Vietnam plant." },
  '出貨進度落後兩天，需要在週五前完成補貨。': { en: 'Shipments are two days behind; restocking must be done by Friday.' },
};
const tr = (q, tl) => (DICT[q] && DICT[q][tl]) || `[${tl}] ${q}`;
const sel = (s) => s.replace(/"/g, '\\"');

// Fake Web Speech API: window.__say(text) delivers a final result to the
// running recognizer.
const FAKE_SPEECH = () => {
  let active = null;
  class FakeRecognition {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; }
    start() {
      if (active && active !== this) active.stop();
      active = this;
      window.__recLang = this.lang;
      setTimeout(() => this.onstart && this.onstart(), 0);
    }
    stop() { if (active === this) active = null; setTimeout(() => this.onend && this.onend(), 0); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  window.__say = (text) => {
    if (!active) return false;
    const r = active;
    const alt = { transcript: text, confidence: 0.9 };
    const result = Object.assign([alt], { isFinal: true });
    r.onresult({ resultIndex: 0, results: [result] });
    return true;
  };
  window.__spoken = [];
  window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 10); };
};

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ permissions: ['microphone'], acceptDownloads: true, viewport: { width: 1280, height: 860 } });
await context.addInitScript(FAKE_SPEECH);

const anthropicRequests = [];
await context.route('https://fonts.googleapis.com/**', (r) => r.abort());
await context.route('https://fonts.gstatic.com/**', (r) => r.abort());
await context.route('https://translate.googleapis.com/**', (route) => {
  const u = new URL(route.request().url());
  const q = u.searchParams.get('q');
  const tl = u.searchParams.get('tl');
  // '聽中文' simulates the translator misdetecting a short Chinese phrase.
  const detected = q === '聽中文' ? 'en' : (/[\u4e00-\u9fff]/.test(q) ? 'zh-TW' : 'en');
  route.fulfill({ contentType: 'application/json', body: JSON.stringify([[[tr(q, tl), q, null]], null, detected]) });
});
const MINUTES = {
  title: '越南工廠出貨週會', summary: '越南工廠出貨落後兩天，決定先空運補貨。',
  keyPoints: ['出貨落後兩天', '先空運一批'], decisions: ['先空運一批'],
  actionItems: [
    { task: '完成越南工廠補貨', owner: '發言人 2', ownerSource: 'stated', dueDate: '2026-10-30', dueText: '週五前', priority: 'high', quote: '出貨進度落後兩天，需要在週五前完成補貨。' },
    { task: '確認空運預算', owner: '', ownerSource: 'none', dueDate: '', dueText: '', priority: 'medium', quote: '' },
  ],
  openQuestions: ['預算由誰確認'],
  speakers: [
    { speaker: '發言人 1', name: '', role: '主持人', mainPoints: ['主持會議'], stance: '主導決策' },
    { speaker: '發言人 2', name: '阿明', role: '工廠窗口', mainPoints: ['回報出貨延誤'], stance: '說明原因' },
  ],
  englishSummary: 'Shipments from the Vietnam plant are two days late; an air shipment was approved.',
};

// DeepSeek and OpenAI share the Chat Completions format.
const chatRequests = [];
for (const host of ['https://api.deepseek.com/**', 'https://api.openai.com/**']) {
  await context.route(host, async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    // Speech requests (read-aloud with an OpenAI key) fail here; the app falls back to device voices.
    if (!body.messages) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"unavailable in test"}}' });
    chatRequests.push({ url: req.url(), headers: req.headers(), body });
    const sys = body.messages.find((m) => m.role === 'system')?.content || '';
    // JSON mode without a schema: leave fields out to exercise the shape repair.
    const { openQuestions, ...partial } = MINUTES;
    const content = /actionItems/.test(sys) || body.response_format?.json_schema?.schema?.properties?.actionItems
      ? JSON.stringify(partial) : 'OK';
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'c1', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }) });
  });
}

await context.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  const body = JSON.parse(req.postData() || '{}');
  anthropicRequests.push({ url: req.url(), headers: req.headers(), body });
  const schemaKeys = Object.keys(body.output_config?.format?.schema?.properties || {});
  let text = 'OK';
  if (schemaKeys.includes('actionItems')) {
    text = JSON.stringify(MINUTES);
  } else if (schemaKeys.includes('labels')) {
    text = JSON.stringify({ labels: [{ i: 0, speaker: '發言人 1' }, { i: 1, speaker: '發言人 2' }, { i: 2, speaker: '發言人 1' }], note: '依問答內容判斷，信心中等。' });
  } else if (schemaKeys.includes('reply')) {
    text = JSON.stringify({ reply: 'Hello! Welcome to our office.', replyZh: '你好！歡迎來到我們辦公室。', romanization: '', feedback: '', better: '' });
  }
  route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }),
  });
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|net::ERR_FAILED|status of 503/.test(m.text())) errors.push(m.text()); });

async function step(name, fn) {
  try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name); throw e; }
}
async function shot(opts) {
  await page.evaluate(() => { document.querySelector('#toast').hidden = true; });
  await page.screenshot(opts);
}
const say = (t) => page.evaluate((x) => window.__say(x), t);

await page.goto(BASE);
await step('loads without errors', async () => {
  assert.equal(await page.title(), 'TalkBridge 語橋');
  await page.waitForSelector('#view-talk:not([hidden])');
});

await step('free auto interpreter: any order, recognizer stays on Chinese', async () => {
  assert.match(await page.textContent('#auto-engine'), /瀏覽器免費辨識/);
  await page.click('#talk-auto-btn');
  await page.waitForFunction(() => window.__recLang === 'zh-TW');
  assert.ok(await say('你好，很高興認識你'));
  await page.waitForSelector(`.bubble:not(.them) .dst:text("${sel(tr('你好，很高興認識你', 'en'))}")`);
  await page.waitForFunction((t) => window.__spoken.includes(t), tr('你好，很高興認識你', 'en'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__recLang), 'zh-TW', 'no switching between turns');
  // Two English lines in a row, then Chinese again.
  assert.ok(await say('Nice to meet you too'));
  await page.waitForSelector(`.bubble.them .dst:text("${sel(tr('Nice to meet you too', 'zh-TW'))}")`);
  await page.waitForTimeout(300);
  assert.ok(await say('How was your trip'));
  await page.waitForSelector('.bubble.them .dst:text("[zh-TW] How was your trip")');
  await page.waitForTimeout(300);
  assert.ok(await say('請問洗手間在哪裡'));
  await page.waitForSelector(`.bubble:not(.them) .dst:text("${sel(tr('請問洗手間在哪裡', 'en'))}")`);
  assert.equal(await page.evaluate(() => window.__recLang), 'zh-TW');
  await page.click('#talk-auto-btn');
});

await step('short Chinese phrase is translated to English even if detection is wrong', async () => {
  await page.click('#talk-auto-btn');
  await page.waitForFunction(() => window.__recLang === 'zh-TW');
  assert.ok(await say('聽中文'));
  await page.waitForSelector('.bubble:not(.them) .dst:text("Listen to Chinese")');
  await page.waitForFunction(() => window.__spoken.includes('Listen to Chinese'));
  await page.click('#talk-auto-btn');
});

await step('typed translation', async () => {
  await page.fill('#type-input', '請問洗手間在哪裡');
  await page.click('#type-form button[type=submit]');
  await page.waitForSelector(`.dst:text("${sel(tr('請問洗手間在哪裡', 'en'))}")`);
});
if (SHOTS) await shot({ path: join(ROOT, 'docs/media/talk.png') });

await step('subtitle mode captions and exports SRT', async () => {
  await page.click('.tab[data-view=subs]');
  await page.click('#sub-start');
  await page.waitForFunction(() => window.__recLang === 'en-US');
  await say('Welcome everyone to the quarterly review');
  await page.waitForSelector(`#sub-current .t:text("${sel(tr('Welcome everyone to the quarterly review', 'zh-TW'))}")`);
  await say('Revenue grew twelve percent this quarter');
  await page.waitForSelector(`#sub-current .t:text("${sel(tr('Revenue grew twelve percent this quarter', 'zh-TW'))}")`);
  const dl = page.waitForEvent('download');
  await page.click('#sub-save');
  const file = await dl;
  const srt = await readFile(await file.path(), 'utf8');
  assert.match(srt, /^1\n\d\d:\d\d:\d\d,\d{3} --> /);
  assert.match(srt, /Revenue grew/);
});
if (SHOTS) await shot({ path: join(ROOT, 'docs/media/subtitles.png') });
await page.click('#sub-start');

await step('meeting: transcript, speakers, recording, save', async () => {
  await page.click('.tab[data-view=meet]');
  await page.selectOption('#meet-tr', 'en');
  // Manual labelling; automatic separation is covered by tests/e2e/diarize-audio.mjs.
  await page.uncheck('#meet-auto-spk');
  await page.click('#meet-start');
  await page.waitForSelector('#meet-stop:not([hidden])');
  await page.waitForFunction(() => window.__recLang === 'zh-TW');
  await say('我們開始今天的週會，先看越南工廠的出貨進度。');
  await page.keyboard.press('2');
  await say('出貨進度落後兩天，需要在週五前完成補貨。');
  await page.keyboard.press('1');
  await say('好，那我們決定先空運一批。');
  await page.waitForFunction(() => document.querySelectorAll('#meet-transcript .seg:not(.interim)').length === 3);
  await page.waitForSelector(`#meet-transcript .tr:text("${sel(tr('好，那我們決定先空運一批。', 'en'))}")`);
  const speakers = await page.$$eval('#meet-transcript .seg select', (s) => s.map((x) => x.value));
  assert.deepEqual(speakers, ['發言人 1', '發言人 2', '發言人 1']);
  await page.waitForTimeout(1200);
  await page.click('#meet-stop');
  await page.waitForSelector('#meet-history button');
  assert.match(await page.textContent('#meet-history'), /3 句 · 有錄音/);
});

await step('meeting: offline notes and exports', async () => {
  await page.click('#meet-local-sum');
  await page.waitForSelector('#meet-notes h3');
  assert.match(await page.textContent('#meet-notes'), /週五前/);
  await page.click('[data-mtab=export]');
  assert.equal(await page.$eval('#meet-audio', (a) => a.hidden), false);
  const dl = page.waitForEvent('download');
  await page.click('[data-export=txt]');
  const dlt = await dl;
  assert.match(dlt.suggestedFilename(), /^TalkBridge_\d{8}-\d{4}_transcript\.txt$/);
  const txt = await readFile(await dlt.path(), 'utf8');
  assert.match(txt, /發言人 2：出貨進度落後兩天/);
  assert.ok(txt.includes(tr('好，那我們決定先空運一批。', 'en')));
  const dla = page.waitForEvent('download');
  await page.click('[data-export=audio]');
  const audio = await dla;
  assert.match(audio.suggestedFilename(), /_audio\.(webm|m4a|ogg)$/);
  const href = await page.getAttribute('#share-line', 'href');
  assert.ok(href.startsWith('https://line.me/R/share?text='));
  assert.match(decodeURIComponent(href), /待辦/);
});

await step('meeting: DeepSeek minutes with owners, due dates and speaker names', async () => {
  await page.click('.tab[data-view=settings]');
  assert.equal(await page.getAttribute('[data-provider=deepseek]', 'aria-pressed'), 'true');
  await page.fill('#api-key', 'sk-deepseek-test');
  await page.press('#api-key', 'Tab');
  await page.click('#test-key');
  await page.waitForSelector('#key-status:text("✓ 金鑰可以使用")');
  await page.click('.tab[data-view=meet]');
  await page.click('[data-mtab=notes]');
  await page.click('#meet-summarize');
  await page.waitForFunction(() => document.querySelector('#sum-status').textContent.startsWith('完成'));
  const rows = await page.$$eval('#meet-notes table.actions tbody tr', (trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
  assert.deepEqual(rows[0].slice(0, 1), ['阿明']);
  assert.match(rows[0][2], /^10\/30（五）・週五前$/);
  assert.equal(rows[0][3], '高');
  assert.equal(rows[1][0], '未指定負責人');
  assert.equal(rows[1][2], '未指定期限');
  assert.match(await page.textContent('#sum-status'), /發言人 2 改名為 阿明/);
  const speakers = await page.$$eval('#meet-transcript .seg select', (s) => s.map((x) => x.value));
  assert.deepEqual(speakers, ['發言人 1', '阿明', '發言人 1']);
  const req = chatRequests.find((r) => r.body.response_format);
  assert.equal(req.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(req.body.model, 'deepseek-chat');
  assert.deepEqual(req.body.response_format, { type: 'json_object' });
  assert.equal(req.headers.authorization, 'Bearer sk-deepseek-test');
  assert.match(req.body.messages[1].content, /Meeting date: \d{4}-\d{2}-\d{2}（星期/);
  const md = page.waitForEvent('download');
  await page.click('[data-mtab=export]');
  await page.click('[data-export=md]');
  const minutes = await readFile(await (await md).path(), 'utf8');
  assert.match(minutes, /\| 阿明 \| 完成越南工廠補貨 \| 10\/30（五）・週五前 \| 高 \|/);
  assert.match(minutes, /\*\*未指定負責人\*\*/);
});

await step('settings: OpenAI uses strict JSON schema output', async () => {
  await page.click('.tab[data-view=settings]');
  await page.click('[data-provider=openai]');
  await page.fill('#api-key', 'sk-openai-test');
  await page.press('#api-key', 'Tab');
  await page.click('.tab[data-view=meet]');
  await page.click('[data-mtab=notes]');
  await page.click('#meet-summarize');
  await page.waitForFunction(() => document.querySelector('#sum-status').textContent.startsWith('完成'));
  const req = chatRequests.filter((r) => r.url.startsWith('https://api.openai.com')).pop();
  assert.equal(req.body.response_format.type, 'json_schema');
  assert.equal(req.body.response_format.json_schema.strict, true);
  assert.equal(req.headers.authorization, 'Bearer sk-openai-test');
});

await step('meeting: Claude minutes and speaker suggestions via the SDK', async () => {
  await page.click('.tab[data-view=settings]');
  await page.click('[data-provider=claude]');
  await page.fill('#api-key', 'sk-ant-test-key');
  await page.press('#api-key', 'Tab');
  await page.click('#test-key');
  await page.waitForSelector('#key-status:text("✓ 金鑰可以使用")');
  await page.click('.tab[data-view=meet]');
  await page.click('[data-mtab=notes]');
  await page.click('#meet-summarize');
  await page.waitForSelector('#meet-notes:has-text("越南工廠出貨落後兩天")');
  assert.match(await page.textContent('#meet-notes'), /Shipments from the Vietnam plant/);
  assert.equal(await page.textContent('#meet-notes table.actions tbody tr td'), '阿明', 'owners follow names given earlier');
  assert.equal(await page.inputValue('#meet-title'), '越南工廠出貨週會');
  await page.click('[data-mtab=speakers]');
  await page.click('#meet-diarize');
  await page.waitForSelector('#diarize-status:has-text("信心中等")');
  const req = anthropicRequests.find((r) => r.body.output_config?.format);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.deepEqual(req.body.thinking, { type: 'adaptive' });
  assert.equal(req.body.fallbacks, 'default');
  assert.match(req.headers['anthropic-beta'] || '', /server-side-fallback-2026-07-01/);
  assert.equal(req.headers['x-api-key'], 'sk-ant-test-key');
  assert.equal(req.headers['anthropic-dangerous-direct-browser-access'], 'true');
});
if (SHOTS) {
  await page.click('[data-mtab=notes]');
  await shot({ path: join(ROOT, 'docs/media/meeting.png') });
  await page.evaluate(() => { document.querySelector('#toast').hidden = true; });
  await (await page.$('#meet-notes')).screenshot({ path: join(ROOT, 'docs/media/action-items.png') });
}

await step('practice: pronunciation scoring and progress', async () => {
  await page.click('.tab[data-view=learn]');
  await page.click('#learn-langs [data-lang=vi]');
  await page.click('.scen:has-text("談判與報價")');
  const first = page.locator('.phrase').first();
  const target = await first.locator('.target').textContent();
  assert.equal(target, 'Giá này có thể giảm thêm một chút không?');
  await first.locator('[data-mic]').click();
  await page.waitForFunction(() => window.__recLang === 'vi-VN');
  await say('giá này có thể giảm thêm một chút không');
  await first.locator('.score').waitFor();
  assert.equal(await first.locator('.score').textContent(), '100');
  assert.equal(await page.textContent('#learned-count'), '1');
  assert.equal(await page.textContent('#streak'), '1');
  await page.click('#learn-langs [data-lang=th]');
  await page.click('#th-female');
  await page.click('.scen:has-text("購物與殺價")');
  assert.equal(await page.locator('.phrase .target').first().textContent(), 'อันนี้เท่าไหร่คะ');
});
if (SHOTS) {
  await page.click('#learn-langs [data-lang=en]');
  await page.click('.scen:has-text("商務會議")');
  await shot({ path: join(ROOT, 'docs/media/practice.png') });
}

await step('practice: AI role-play', async () => {
  await page.click('[data-ltab=chat]');
  await page.waitForSelector('.msg:has-text("Welcome to our office")');
  await page.fill('#chat-input', 'Thank you, nice to meet you.');
  await page.click('#chat-form button[type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('.msg:not(.me)').length === 2);
  const tutor = anthropicRequests.filter((r) => r.body.output_config?.format?.schema?.properties?.reply).pop();
  assert.deepEqual(tutor.body.messages.map((m) => m.role), ['user', 'assistant', 'user']);
});

await step('meeting persists across reload', async () => {
  await page.reload();
  await page.click('.tab[data-view=meet]');
  await page.waitForSelector('#meet-history button');
  await page.click('#meet-history button');
  await page.waitForFunction(() => document.querySelector('#meet-title').value === '越南工廠出貨週會');
  assert.equal(await page.locator('#meet-transcript .seg').count(), 3);
});

await step('phone layout has no horizontal scroll (light and dark)', async () => {
  for (const scheme of ['light', 'dark']) {
    const m = await context.newPage();
    await m.emulateMedia({ colorScheme: scheme });
    await m.setViewportSize({ width: 390, height: 844 });
    for (const v of ['talk', 'subs', 'meet', 'learn', 'settings']) {
      await m.goto(BASE + '#' + v);
      await m.waitForSelector(`#view-${v}:not([hidden])`);
      const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth
        + document.querySelector('main').scrollWidth - document.querySelector('main').clientWidth);
      assert.ok(over <= 0, `${scheme} ${v} overflows by ${over}px`);
      if (SHOTS && scheme === 'dark' && v === 'talk') await m.screenshot({ path: join(ROOT, 'docs/media/phone-dark.png') });
    }
    await m.close();
  }
});

assert.deepEqual(errors, [], 'console errors');
console.log(`\nall browser checks passed (${anthropicRequests.length} mocked Claude calls)`);
await browser.close();
server.close();
