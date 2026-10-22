// Automatic speaker separation with real voices: a conversation between
// three synthetic speakers (ffmpeg's flite voices kal, slt and rms; kal and
// rms are both American men) is played into Chromium's fake microphone while
// the meeting view records. Speech recognition is scripted; the voice
// fingerprints come from the real audio.
// Run: node tests/e2e/diarize-audio.mjs   (needs ffmpeg built with libflite)
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, hasFlite, conversation, serve } from './voices.mjs';

if (!hasFlite()) { console.log('skip: ffmpeg with libflite is not available'); process.exit(0); }

const TURNS = [
  ['kal', 'Good morning everyone, thanks for joining the weekly meeting'],
  ['slt', 'The shipment from the Vietnam plant is two days late'],
  ['kal', 'Could you send me the updated price list by Friday'],
  ['rms', 'I think we need another supplier for the plastic parts'],
  ['slt', 'Let us review the quality report from last month'],
  ['kal', 'The customer asked for a discount on the large order'],
  ['rms', 'Please check the inventory before we confirm the date'],
  ['slt', 'I will follow up with the logistics team tomorrow'],
  ['rms', 'We should also update the safety training schedule'],
];

const { path: conv, ends } = await conversation(TURNS);
const { server, base } = await serve();

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${conv}`],
});
const context = await browser.newContext({ permissions: ['microphone'] });
await context.route('https://fonts.**', (r) => r.abort());
await context.route('https://translate.googleapis.com/**', (r) => r.abort());
await context.addInitScript(() => {
  let active = null;
  class FakeRecognition {
    start() { active = this; setTimeout(() => this.onstart && this.onstart(), 0); }
    stop() { if (active === this) active = null; setTimeout(() => this.onend && this.onend(), 0); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  window.__say = (text) => {
    if (!active) return false;
    active.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true })] });
    return true;
  };
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(base + '#meet');
await page.selectOption('#meet-lang', 'en');
await page.selectOption('#meet-tr', '');
assert.equal(await page.isChecked('#meet-auto-spk'), true, 'automatic speakers on by default');
assert.match(await page.textContent('#meet-speakers'), /自動標出「發言人 1、2、3…」/);
await page.click('#meet-start');
await page.waitForSelector('#meet-stop:not([hidden])');
const t0 = Date.now();
for (const [i, [, text]] of TURNS.entries()) {
  const wait = t0 + (ends[i] + 0.7) * 1000 - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  assert.ok(await page.evaluate((x) => window.__say(x), text));
}
await page.waitForFunction((n) => document.querySelectorAll('#meet-transcript .seg:not(.interim)').length === n, TURNS.length);
const live = await page.$$eval('#meet-transcript .seg select', (s) => s.map((x) => x.value));
await page.click('#meet-stop');
await page.waitForSelector('#meet-start:not([hidden])');
await page.waitForTimeout(500);
const final = await page.$$eval('#meet-transcript .seg select', (s) => s.map((x) => x.value));

function check(labels) {
  const byVoice = new Map();
  TURNS.forEach(([v], i) => { if (!byVoice.has(v)) byVoice.set(v, new Set()); byVoice.get(v).add(labels[i]); });
  const consistent = [...byVoice.values()].every((s) => s.size === 1);
  const distinct = new Set([...byVoice.values()].map((s) => [...s][0])).size === byVoice.size;
  return consistent && distinct;
}
console.log('voices:', TURNS.map(([v]) => v).join(' '));
console.log('live  :', live.join(' | '));
console.log('final :', final.join(' | '));
assert.ok(check(final), 'after the meeting each voice has its own label');
assert.deepEqual([...new Set(final)].sort(), ['發言人 1', '發言人 2', '發言人 3']);

// Rename speaker 1 with its ✎ button, speaker 2 from the 發言分析 list.
const first = final[0];
await page.click(`.chip-edit[aria-label="把${first}改名"]`);
await page.fill('#meet-speakers input', '王經理');
await page.press('#meet-speakers input', 'Enter');
await page.click('[data-mtab=speakers]');
const second = final[1];
const idx = await page.$$eval('#meet-rename input', (xs, n) => xs.findIndex((x) => x.value === n), second);
await page.fill(`#rename-${idx}`, 'Amy');
await page.press(`#rename-${idx}`, 'Tab');
await page.click('[data-mtab=transcript]');
const renamed = await page.$$eval('#meet-transcript .seg select', (s) => s.map((x) => x.value));
assert.deepEqual(renamed, final.map((x) => (x === first ? '王經理' : x === second ? 'Amy' : x)));
assert.match(await page.textContent('#meet-speakers'), /王經理.*Amy/);
if (process.argv.includes('--shots')) {
  await page.evaluate(() => { document.querySelector('#toast').hidden = true; });
  await (await page.$('#meet-live')).screenshot({ path: join(ROOT, 'docs/media/speakers.png') });
  await page.click('[data-mtab=speakers]');
  await (await page.$('#meet-doc')).screenshot({ path: join(ROOT, 'docs/media/speaker-rename.png') });
}
assert.deepEqual(errors, []);
console.log(`\nspeaker separation passed (live labels ${check(live) ? 'already correct' : 'corrected after the meeting'})`);
await browser.close();
server.close();
