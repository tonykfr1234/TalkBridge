// Generate the documentation media in docs/media: one PNG per screen, a
// silent MP4 walkthrough and a GIF preview, with Traditional Chinese/English
// captions. Runs the real app in Chromium with scripted speech recognition,
// sample translations and a mocked AI provider; the meeting scene plays three
// synthetic voices (ffmpeg flite) into the fake microphone so speaker
// separation runs on real audio. No account, key or network service is used.
// Run: npm run demo   (needs playwright and ffmpeg with libx264 and libflite)
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, hasFlite, conversation, serve } from '../tests/e2e/voices.mjs';
import { parseDue } from '../js/duedate.js';

if (!hasFlite()) { console.error('ffmpeg with libflite is required'); process.exit(1); }
const OUT = join(ROOT, 'docs/media');
const W = 1280, H = 800;

// Sample translations shown in the demo.
const DICT = {
  '你好，很高興認識你。': { en: 'Hello, nice to meet you.' },
  'Nice to meet you too. How was your flight?': { 'zh-TW': '我也很高興認識你。你的航班還順利嗎？' },
  '很順利，謝謝。我們今天先確認報價。': { en: "It went well, thanks. Let's confirm the quotation first today." },
  'Welcome everyone to the quarterly review.': { 'zh-TW': '歡迎大家參加本季業績檢討會。' },
  'Revenue grew twelve percent this quarter.': { 'zh-TW': '本季營收成長了百分之十二。' },
  'Our new plant in Vietnam starts production in March.': { 'zh-TW': '我們越南的新工廠將在三月開始生產。' },
};
const tr = (q, tl) => (DICT[q] && DICT[q][tl]) || q;

// Meeting: three voices (kal and rms are both men). Text is what the
// scripted recognizer reports; the audio gives each line its voice.
const MEETING = [
  ['kal', 'Good morning everyone, let us confirm the shipments from the Vietnam plant.', '大家好，我是王經理，今天確認越南工廠的出貨。'],
  ['slt', 'The shipment is two days late, I will check with logistics tomorrow.', '我是 Amy，出貨落後兩天，我明天會跟物流確認。'],
  ['kal', 'Amy, please send the new quotation to the customer by next Friday.', '請 Amy 下週五前把新的報價單寄給客戶。'],
  ['rms', 'This is Ming from quality control, the report will be ready at the end of the month.', '我是品管的阿明，品質報告我月底前完成。'],
  ['slt', 'Sure, I will send the quotation before next Friday.', '好的，報價單我下週五前寄出。'],
  ['kal', 'Then we decide to air ship one batch first, and I will confirm the budget.', '那我們決定先空運一批，預算我來確認。'],
];

const today = new Date();
const due = (t) => (parseDue(t, today) || {}).date || '';
const MINUTES = {
  title: '越南工廠出貨週會',
  summary: '越南工廠出貨落後兩天。決定先空運一批，Amy 負責物流與報價，阿明月底前交品質報告。',
  keyPoints: ['出貨進度落後兩天', '先空運一批補貨', '客戶需要新的報價單'],
  decisions: ['先空運一批，預算由王經理確認'],
  actionItems: [
    { task: '跟物流確認出貨時間', owner: '發言人 2', ownerSource: 'stated', dueDate: due('明天'), dueText: '明天', priority: 'high', quote: MEETING[1][2] },
    { task: '把新的報價單寄給客戶', owner: '發言人 2', ownerSource: 'stated', dueDate: due('下週五'), dueText: '下週五', priority: 'high', quote: MEETING[2][2] },
    { task: '完成品質報告', owner: '發言人 3', ownerSource: 'stated', dueDate: due('月底'), dueText: '月底前', priority: 'medium', quote: MEETING[3][2] },
    { task: '確認空運預算', owner: '發言人 1', ownerSource: 'stated', dueDate: '', dueText: '', priority: 'medium', quote: MEETING[5][2] },
  ],
  openQuestions: ['空運費用是否由客戶分攤'],
  speakers: [
    { speaker: '發言人 1', name: '王經理', role: '主持人', mainPoints: ['確認出貨', '決定空運'], stance: '主導決策' },
    { speaker: '發言人 2', name: 'Amy', role: '業務', mainPoints: ['回報延誤', '寄報價單'], stance: '負責對客戶' },
    { speaker: '發言人 3', name: '阿明', role: '品管', mainPoints: ['品質報告'], stance: '提供品質資料' },
  ],
  englishSummary: 'Shipments from the Vietnam plant are two days late. One batch will go by air; Amy handles logistics and the new quotation, and Ming delivers the quality report by month end.',
};

const work = await mkdtemp(join(tmpdir(), 'tb-demo-'));
const { path: audio, ends } = await conversation(MEETING.map(([v, en]) => [v, en]), { lead: 0.5, gap: 1.4 });
const { server, base } = await serve();

const FAKE_SPEECH = () => {
  let active = null;
  class FakeRecognition {
    start() { if (active && active !== this) active.stop(); active = this; window.__recLang = this.lang; setTimeout(() => this.onstart && this.onstart(), 0); }
    stop() { if (active === this) active = null; setTimeout(() => this.onend && this.onend(), 0); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  window.__interim = (text) => { if (active) active.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: false })] }); };
  window.__say = (text) => {
    if (!active) return false;
    active.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true })] });
    return true;
  };
  window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 400);
  try {
    localStorage.setItem('talkbridge.deepseekKey', JSON.stringify('sk-demo'));
    localStorage.setItem('talkbridge.provider', JSON.stringify('deepseek'));
  } catch { /* fresh profile */ }
};

const CAPTION_CSS = `#demo-cap{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:99;max-width:min(92vw,980px);
background:rgba(10,18,26,.88);color:#fff;border-radius:14px;padding:10px 20px;text-align:center;font:600 20px/1.45 "Noto Sans TC","WenQuanYi Zen Hei",sans-serif;
box-shadow:0 6px 24px rgba(0,0,0,.3)}#demo-cap small{display:block;font-weight:400;font-size:15px;color:#c9d6de}`;

async function routes(context) {
  await context.route('https://fonts.**', (r) => r.abort());
  await context.route('https://translate.googleapis.com/**', (route) => {
    const u = new URL(route.request().url());
    const q = u.searchParams.get('q'), tl = u.searchParams.get('tl');
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([[[tr(q, tl), q, null]], null, /[一-鿿]/.test(q) ? 'zh-TW' : 'en']) });
  });
  await context.route('https://api.deepseek.com/**', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(MINUTES) }, finish_reason: 'stop' }] }) });
  });
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audio}`, '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1, permissions: ['microphone'],
  recordVideo: { dir: work, size: { width: W, height: H } },
});
await context.addInitScript(FAKE_SPEECH);
await routes(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const wait = (ms) => page.waitForTimeout(ms);
const say = (t) => page.evaluate((x) => window.__say(x), t);
async function caption(zh, en) {
  await page.evaluate(([z, e, css]) => {
    let c = document.getElementById('demo-cap');
    if (!c) {
      const s = document.createElement('style'); s.textContent = css; document.head.append(s);
      c = document.createElement('div'); c.id = 'demo-cap'; document.body.append(c);
    }
    c.innerHTML = '';
    c.append(z, Object.assign(document.createElement('small'), { textContent: e }));
  }, [zh, en, CAPTION_CSS]);
}
// selector: one element; [first, last]: the region from the top of one to the bottom of the other.
async function still(name, selector, { top = false } = {}) {
  await page.evaluate((t) => {
    const toast = document.querySelector('#toast'); if (toast) toast.hidden = true;
    const c = document.getElementById('demo-cap'); if (c) c.style.visibility = 'hidden';
    if (t) document.querySelector('#main').scrollTop = 0;
  }, top);
  await wait(150);
  if (Array.isArray(selector)) {
    const [a, b] = selector;
    await page.evaluate((x) => document.querySelector(x).scrollIntoView({ block: 'start' }), a);
    await wait(150);
    const ra = await (await page.$(a)).boundingBox(), rb = await (await page.$(b)).boundingBox();
    const y = Math.max(0, ra.y - 8), x = Math.max(0, Math.min(ra.x, rb.x) - 8);
    await page.screenshot({ path: join(OUT, `${name}.png`), clip: { x, y, width: Math.max(ra.x + ra.width, rb.x + rb.width) - x + 8, height: Math.min(H, rb.y + rb.height + 8) - y } });
  } else if (selector) await (await page.$(selector)).screenshot({ path: join(OUT, `${name}.png`) });
  else await page.screenshot({ path: join(OUT, `${name}.png`) });
  await page.evaluate(() => { const c = document.getElementById('demo-cap'); if (c) c.style.visibility = ''; });
}
async function typeSlow(text) { for (const part of text.match(/.{1,3}/gu)) { await page.evaluate((p) => window.__interim(p), part); await wait(90); } }

const t0 = Date.now();
await page.goto(base + '#talk');
await page.waitForSelector('#view-talk:not([hidden])');

// 1. Interpreter
await caption('口譯：說中文出英文，說英文出中文，不限順序', 'Interpreter: speak either language in any order');
await wait(1800);
await page.click('#talk-auto-btn');
await wait(600);
await typeSlow('你好，很高興認識你');
await say('你好，很高興認識你。');
await wait(1800);
await caption('對方說英文，自動翻成中文並唸出來', 'The other person answers in English; it is translated to Chinese and read aloud');
await typeSlow('Nice to meet you too');
await say('Nice to meet you too. How was your flight?');
await wait(1800);
await say('很順利，謝謝。我們今天先確認報價。');
await wait(1600);
await caption('朗讀聲音可選：女聲、男聲，或克隆你自己的聲音', 'Voices: female, male, or your own cloned voice');
await page.hover('[data-voice-me=clone]');
await wait(2200);
await still('talk', null, { top: true });
await page.click('#talk-auto-btn');

// 2. Subtitles
await page.click('.tab[data-view=subs]');
await caption('字幕：放在喇叭旁，影片和線上會議即時上翻譯字幕', 'Subtitles: live translated captions for videos and online meetings');
await page.click('#sub-start');
await wait(800);
for (const line of ['Welcome everyone to the quarterly review.', 'Revenue grew twelve percent this quarter.', 'Our new plant in Vietnam starts production in March.']) {
  await typeSlow(line.slice(0, 18));
  await say(line);
  await wait(1700);
}
await still('subtitles');
await page.click('#sub-start');

// 3. Meeting with automatic speakers (real audio from three voices)
await page.click('.tab[data-view=meet]');
await caption('會議：開始記錄後，App 依聲音自動分辨發言人 1、2、3', 'Meetings: speakers are told apart by voice automatically');
await page.selectOption('#meet-tr', '');
await wait(1500);
await page.click('#meet-start');
await page.waitForSelector('#meet-stop:not([hidden])');
const m0 = Date.now();
for (const [i, [, , zh]] of MEETING.entries()) {
  const at = m0 + (ends[i] + 0.6) * 1000 - Date.now();
  if (at > 0) await wait(at);
  await say(zh);
}
await wait(900);
await still('speakers', '#meet-live');
await caption('結束後用整場聲音再分析一次，並自動存在手機或電腦', 'When it ends, the whole meeting is re-grouped and saved on the device');
await page.click('#meet-stop');
await wait(1600);
await page.click('[data-mtab=transcript]');
await wait(1200);
await still('meeting');

// 4. AI minutes with owners and due dates
await page.click('[data-mtab=notes]');
await caption('AI 整理重點：待辦寫清楚誰負責、哪天到期，並換上真名', 'AI minutes: every task has an owner and a calendar due date; real names replace labels');
await page.click('#meet-summarize');
await page.waitForFunction(() => document.querySelector('#sum-status').textContent.startsWith('完成'));
await wait(800);
await page.evaluate(() => document.querySelector('#meet-notes table.actions').scrollIntoView({ behavior: 'smooth', block: 'center' }));
await wait(3500);
await still('action-items', ['#meet-notes .actions-title', '#meet-notes .owners']);
await caption('匯出逐字稿、會議記錄、字幕與錄音，或直接分享到 LINE', 'Export transcript, minutes, subtitles and audio, or share to LINE');
await page.click('[data-mtab=export]');
await wait(2500);

// 5. Practice
await page.click('.tab[data-view=learn]');
await caption('練習：商務與生活情境，跟讀並為發音評分', 'Practice: business and travel phrases with pronunciation scoring');
await page.click('#learn-langs [data-lang=vi]');
await page.click('.scen:has-text("談判與報價")');
await wait(1500);
const first = page.locator('.phrase').first();
await first.locator('[data-mic]').click();
await wait(600);
await typeSlow('giá này có thể');
await say('giá này có thể giảm thêm một chút không');
await wait(2200);
await still('practice');

// 6. Settings
await page.click('.tab[data-view=settings]');
await caption('設定：DeepSeek、OpenAI 或 Claude，以及「我的聲音」', 'Settings: DeepSeek, OpenAI or Claude, and your own voice');
await wait(2000);
await page.evaluate(() => document.querySelector('#clone-card').scrollIntoView({ behavior: 'smooth', block: 'start' }));
await wait(2500);
await still('settings', null, { top: true });
await still('voice', '#clone-card');
await caption('網頁版與 Android App 共用同一套程式，推送到 GitHub 自動更新', 'The website and the Android app share one codebase and update from GitHub');
await wait(2500);

const seconds = (Date.now() - t0) / 1000;
await page.close();
await context.close();

// Phone stills: dark theme in the browser, and the Android app (bridge shim).
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await phone.addInitScript(FAKE_SPEECH);
await routes(phone);
const p2 = await phone.newPage();
await p2.goto(base + '#talk');
await p2.waitForSelector('#view-talk:not([hidden])');
await p2.screenshot({ path: join(OUT, 'phone-dark.png') });
await phone.close();

const android = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await routes(android);
await android.route('https://api.github.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ tag_name: 'v9.9.9', assets: [{ name: 'TalkBridge.apk', browser_download_url: 'https://example.invalid/TalkBridge.apk' }] }) }));
await android.addInitScript(() => {
  const emit = (id, type, data) => setTimeout(() => window.__tbAndroid.event(id, type, JSON.stringify(data || {})), 5);
  let rec = null;
  window.TalkBridgeAndroid = {
    versionName: () => '1.4.0', startRecognition(id) { rec = id; emit(id, 'start'); }, stopRecognition(id) { emit(id, 'end'); },
    cancelRecognition(id) { emit(id, 'end'); }, voices: () => '[]', speak(id) { emit(id, 'end'); }, stopSpeaking() {},
    saveFile: () => '', share() {}, keepAwake() {}, openExternal() {},
  };
  window.__nativeSay = (text) => { window.__tbAndroid.event(rec, 'result', JSON.stringify({ text, final: true })); window.__tbAndroid.event(rec, 'end', '{}'); };
});
const p3 = await android.newPage();
await p3.goto(base + '#talk');
await p3.waitForSelector('#update-btn');
await p3.click('#talk-auto-btn');
await p3.waitForTimeout(300);
await p3.evaluate(() => window.__nativeSay('你好，很高興認識你。'));
await p3.waitForSelector('.bubble:not(.pending)');
await p3.waitForTimeout(500);
await p3.evaluate(() => { document.querySelector('#main').scrollTop = 0; });
await p3.screenshot({ path: join(OUT, 'android.png') });
await android.close();
await browser.close();
server.close();
if (errors.length) { console.error(errors); process.exit(1); }

// Video: Playwright's WebM to H.264 MP4 and a GIF preview.
const webm = (await readdir(work)).filter((f) => f.endsWith('.webm')).map((f) => join(work, f));
let longest = webm[0];
for (const f of webm) if ((await stat(f)).size > (await stat(longest)).size) longest = f;
const ff = (args) => execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...args]);
const mp4 = join(OUT, 'talkbridge-demo.mp4');
ff(['-ss', '0.6', '-i', longest, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-r', '20', '-movflags', '+faststart', mp4]);
const palette = join(work, 'palette.png');
const gifFilter = 'fps=6,scale=800:-1:flags=lanczos';
ff(['-i', mp4, '-vf', `${gifFilter},palettegen=max_colors=96:stats_mode=diff`, palette]);
ff(['-i', mp4, '-i', palette, '-lavfi', `${gifFilter} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, join(OUT, 'talkbridge-demo.gif')]);
await rm(work, { recursive: true, force: true });

for (const f of (await readdir(OUT)).sort()) {
  const s = await stat(join(OUT, f));
  console.log(`${f.padEnd(28)} ${(s.size / 1024).toFixed(0).padStart(6)} KB`);
}
console.log(`walkthrough ${seconds.toFixed(0)} s`);
