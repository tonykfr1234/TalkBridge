// The web app inside the Android app: a fake `TalkBridgeAndroid` bridge stands
// in for the native code (speech recognizer, TTS, Downloads, share sheet) and
// the page must work through the shims in js/android.js.
// Run: node tests/e2e/android-shim.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './voices.mjs';

const { server, base } = await serve();
const browser = await chromium.launch();
const context = await browser.newContext();
await context.route('https://fonts.**', (r) => r.abort());
await context.route('https://translate.googleapis.com/**', (route) => {
  const u = new URL(route.request().url());
  const q = u.searchParams.get('q'), tl = u.searchParams.get('tl');
  route.fulfill({ contentType: 'application/json', body: JSON.stringify([[[`[${tl}] ${q}`, q, null]], null, /[一-鿿]/.test(q) ? 'zh-TW' : 'en']) });
});
await context.route('https://api.github.com/repos/tonykfr1234/TalkBridge/releases/latest', (route) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ tag_name: 'v9.9.9', assets: [{ name: 'TalkBridge.apk', browser_download_url: 'https://github.com/tonykfr1234/TalkBridge/releases/download/v9.9.9/TalkBridge.apk' }] }),
}));
await context.addInitScript(() => {
  const log = (window.__native = { calls: [], recog: null });
  const emit = (id, type, data) => setTimeout(() => window.__tbAndroid.event(id, type, JSON.stringify(data || {})), 5);
  window.TalkBridgeAndroid = {
    versionName: () => '1.0.0',
    startRecognition(id, lang, interim) { log.calls.push(['start', lang, interim]); log.recog = id; emit(id, 'start'); },
    stopRecognition(id) { log.calls.push(['stop']); emit(id, 'end'); },
    cancelRecognition(id) { log.calls.push(['cancel']); emit(id, 'end'); },
    voices: () => JSON.stringify([{ name: 'cmn-tw-x-ctc-local', lang: 'zh-TW' }, { name: 'en-us-x-sfg-local', lang: 'en-US' }]),
    speak(id, text, lang, voice, rate) { log.calls.push(['speak', text, lang, voice, rate]); emit(id, 'end'); },
    stopSpeaking() { log.calls.push(['stopSpeaking']); },
    saveFile(name, mime, b64) { log.calls.push(['save', name, mime, atob(b64).length]); return `已存到「下載／TalkBridge」：${name}`; },
    share(title, text, files) { log.calls.push(['share', title, text, JSON.parse(files).map((f) => f.name)]); },
    keepAwake(on) { log.calls.push(['keepAwake', on]); },
    openExternal(url) { log.calls.push(['open', url]); },
  };
  // Native recognizer hears a phrase: final result, then the session ends.
  window.__nativeSay = (text) => {
    const id = log.recog;
    window.__tbAndroid.event(id, 'result', JSON.stringify({ text, final: true, confidence: 0.9 }));
    window.__tbAndroid.event(id, 'end', '{}');
  };
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const calls = () => page.evaluate(() => window.__native.calls);
const step = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name); throw e; } };

await page.goto(base + '#talk');

await step('shims installed; no "unsupported browser" banner', async () => {
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('android-app')), true);
  assert.equal(await page.evaluate(() => typeof window.SpeechRecognition), 'function');
});

await step('update banner from GitHub Releases opens the APK link', async () => {
  await page.waitForSelector('#update-btn');
  assert.match(await page.textContent('#support-banner'), /有新版本 9\.9\.9/);
  await page.click('#update-btn');
  assert.deepEqual((await calls()).find((c) => c[0] === 'open'), ['open', 'https://github.com/tonykfr1234/TalkBridge/releases/download/v9.9.9/TalkBridge.apk']);
});

await step('interpreter runs on the native recognizer and speaks with native TTS', async () => {
  await page.click('#talk-auto-btn');
  await page.waitForFunction(() => window.__native.calls.some((c) => c[0] === 'start'));
  assert.deepEqual((await calls()).find((c) => c[0] === 'start'), ['start', 'zh-TW', true]);
  await page.evaluate(() => window.__nativeSay('你好，很高興認識你'));
  await page.waitForSelector('.bubble .dst:text("[en] 你好，很高興認識你")');
  await page.waitForFunction(() => window.__native.calls.some((c) => c[0] === 'speak'));
  const sp = (await calls()).find((c) => c[0] === 'speak');
  assert.equal(sp[1], '[en] 你好，很高興認識你');
  assert.equal(sp[2], 'en-US');
  assert.equal(sp[3], 'en-us-x-sfg-local', 'picks the engine voice for the language');
  // The page restarts the recognizer after the session ends (continuous listening).
  await page.waitForFunction(() => window.__native.calls.filter((c) => c[0] === 'start').length >= 2);
  assert.ok((await calls()).some((c) => c[0] === 'keepAwake' && c[1] === true));
  await page.click('#talk-auto-btn');
});

await step('exports save to Downloads through the bridge', async () => {
  await page.goto(base + '#meet');
  await page.uncheck('#meet-auto-spk');
  await page.uncheck('#meet-record');
  await page.click('#meet-start');
  await page.waitForFunction(() => window.__native.recog !== null);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__nativeSay('請小王下週五前把報價單寄給客戶'));
  await page.waitForSelector('#meet-transcript .seg');
  await page.click('#meet-stop');
  await page.click('[data-mtab=export]');
  await page.click('[data-export=txt]');
  await page.waitForFunction(() => window.__native.calls.some((c) => c[0] === 'save'));
  const save = (await calls()).find((c) => c[0] === 'save');
  assert.match(save[1], /^TalkBridge_\d{8}-\d{4}_transcript\.txt$/);
  assert.match(save[2], /^text\/plain/);
  assert.ok(save[3] > 20);
  await page.waitForFunction(() => /已存到「下載／TalkBridge」/.test(document.querySelector('#toast').textContent));
});

await step('share opens the native share sheet with the files', async () => {
  await page.click('#share-files');
  await page.waitForFunction(() => window.__native.calls.some((c) => c[0] === 'share'));
  const sh = (await calls()).find((c) => c[0] === 'share');
  assert.equal(sh[3].length, 2);
  assert.match(sh[3][0], /_transcript\.txt$/);
  assert.match(sh[3][1], /_minutes\.md$/);
  assert.match(sh[2], /請小王/);
});

await step('back button returns to the interpreter, then exits', async () => {
  assert.equal(await page.evaluate(() => window.__tbAndroid.back()), true);
  await page.waitForSelector('#view-talk:not([hidden])');
  assert.equal(await page.evaluate(() => window.__tbAndroid.back()), false);
});

assert.deepEqual(errors, []);
console.log('\nandroid shim checks passed');
await browser.close();
server.close();
