// Automatic speaker separation with real voices: a conversation between
// three synthetic speakers (ffmpeg's flite voices kal, slt and rms; kal and
// rms are both American men) is played into Chromium's fake microphone while
// the meeting view records. Speech recognition is scripted; the voice
// fingerprints come from the real audio.
// Run: node tests/e2e/diarize-audio.mjs   (needs ffmpeg built with libflite)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RATE = 48000;
const GAP = 1.6; // seconds of silence between turns

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

const dir = await mkdtemp(join(tmpdir(), 'tb-voices-'));
function synth(voice, text, file) {
  execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
    `flite=text='${text.replace(/'/g, '')}':voice=${voice}`, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', file]);
}
try {
  execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).includes('flite') || (() => { throw new Error(); })();
} catch {
  console.log('skip: ffmpeg with libflite is not available');
  process.exit(0);
}

// Build the conversation and remember when each turn ends.
const pcm = [];
const ends = [];
let total = Math.round(RATE * 1.0);
pcm.push(new Int16Array(total));
for (const [i, [voice, text]] of TURNS.entries()) {
  const f = join(dir, `${i}.wav`);
  synth(voice, text, f);
  const b = await readFile(f);
  const s = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length));
  pcm.push(s);
  total += s.length;
  ends.push(total / RATE);
  const gap = new Int16Array(Math.round(RATE * GAP));
  pcm.push(gap);
  total += gap.length;
}
pcm.push(new Int16Array(RATE * 30)); // silence after the last turn (the fake device loops)
total += RATE * 30;
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + total * 2, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(total * 2, 40);
const conv = join(dir, 'conversation.wav');
await writeFile(conv, Buffer.concat([header, ...pcm.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))]));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));

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

await page.goto(`http://127.0.0.1:${server.address().port}/#meet`);
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
