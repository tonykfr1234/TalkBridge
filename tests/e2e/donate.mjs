// The About tab and the 請 Tony 喝咖啡 page: payment details (unset and set),
// supporter numbering, the recorded thank-you clip and the LINE message.
// Run: node tests/e2e/donate.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve } from './voices.mjs';

const { server, base } = await serve();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const step = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name); throw e; } };
const errors = [];

async function open(url, { configured = false } = {}) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('https://fonts.**', (r) => r.abort());
  if (configured) {
    await context.route('https://raw.githubusercontent.com/**', (route) => {
      const f = new URL(route.request().url()).pathname.split('/').pop();
      if (f === 'donate.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ title: '請 Tony 喝一杯咖啡', note: '測試用設定', amounts: [100, 150, 300], bank: { name: '範例銀行', code: '000', account: '00012345678901', holder: 'Tony' }, linePay: { url: 'https://line.me/R/ti/p/~example', id: 'tony-example', qr: '' } }) });
      if (f === 'donors.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ count: 2, donors: [{ n: 1, name: '阿明', date: '2026-10-22' }, { n: 2, name: 'Amy', date: '2026-10-23' }] }) });
      return route.continue();
    });
  } else {
    await context.route('https://raw.githubusercontent.com/**', (r) => r.abort()); // falls back to the bundled files
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + url);
  return { context, page };
}

await step('donate page before payment details are set', async () => {
  const { context, page } = await open('donate.html');
  await page.waitForSelector('#d-next:has-text("第 1 位")');
  assert.equal(await page.textContent('#d-count'), '0');
  assert.equal(await page.isVisible('#d-bank-missing'), true);
  assert.equal(await page.isVisible('#d-line-missing'), true);
  assert.match(await page.textContent('#d-credit'), /Build by Tony · 2026 年製作/);
  await context.close();
});

await step('configured page: amounts, bank transfer, LINE Pay, donor wall', async () => {
  const { context, page } = await open('donate.html', { configured: true });
  await page.waitForSelector('#d-count:text("2")');
  assert.match(await page.textContent('#d-wall'), /#2\s*Amy[\s\S]*#1\s*阿明/);
  assert.match(await page.textContent('#d-bank-info'), /範例銀行 \(000\)[\s\S]*00012345678901[\s\S]*Tony/);
  assert.equal(await page.getAttribute('#d-line-info a', 'href'), 'https://line.me/R/ti/p/~example');
  assert.match(await page.textContent('#d-line-info'), /tony-example/);
  assert.equal(await page.isVisible('#d-bank-missing'), false);
  await page.click('.amount:has-text("自訂")');
  assert.equal(await page.isVisible('#d-custom'), true);
  await page.fill('#d-custom', '250');

  await page.fill('#d-name', '小美');
  await page.fill('#d-last5', '67890');
  await page.fill('#d-message', '口譯很好用！');
  await page.click('#d-submit');
  await page.waitForSelector('#d-thanks:not([hidden])');
  assert.equal(await page.textContent('#d-thanks-title'), '謝謝你，小美！');
  assert.match(await page.textContent('#d-thanks-text'), /第 3 位/);
  const note = await page.textContent('#d-notify');
  assert.match(note, /暱稱：小美\n金額：NT\$250\n方式：銀行轉帳（帳號末五碼 67890）\n留言：口譯很好用！/);
  assert.match(decodeURIComponent(await page.getAttribute('#d-notify-line', 'href')), /^https:\/\/line\.me\/R\/share\?text=嗨 Tony/);

  await page.waitForSelector('#d-video:not([hidden])', { timeout: 20000 });
  assert.match(await page.textContent('#d-progress'), /做好了/);
  const dl = page.waitForEvent('download');
  await page.click('#d-dl-video');
  const file = await dl;
  assert.match(file.suggestedFilename(), /^TalkBridge_\d{8}-\d{4}_thanks\.(webm|mp4)$/);
  const path = await file.path();
  const size = (await readFile(path)).length;
  assert.ok(size > 30000, `video ${size} bytes`);
  const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path], { encoding: 'utf8' });
  assert.match(streams, /video/);
  assert.match(streams, /audio/, 'clip has the chime');
  const img = page.waitForEvent('download');
  await page.click('#d-dl-image');
  assert.match((await img).suggestedFilename(), /_thanks\.png$/);
  await context.close();
});

await step('About tab: version, credit, supporters, release notes, coffee link', async () => {
  const { context, page } = await open('#about', { configured: true });
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  await page.waitForSelector('#about-notes .release');
  assert.equal(await page.textContent('#about-version'), `版本 ${pkg.version}`);
  assert.equal(await page.textContent('#about-credit'), 'Build by Tony · 2026 年製作');
  assert.match(await page.textContent('#about-donors'), /已有 2 位朋友/);
  assert.match(await page.textContent('#about-notes .release h3'), new RegExp(`v${pkg.version.replace(/\./g, '\\.')}.*目前版本`));
  assert.ok((await page.$$('#about-notes .release')).length >= 10);
  assert.equal(await page.getAttribute('#about-coffee', 'href'), 'https://tonykfr1234.github.io/TalkBridge/donate.html');
  assert.equal(await page.getAttribute('#about-links a:nth-child(2)', 'href'), 'https://github.com/tonykfr1234/TalkBridge/releases/latest/download/TalkBridge.apk');
  await context.close();
});

assert.deepEqual(errors, []);
console.log('\ndonate and about checks passed');
await browser.close();
server.close();
