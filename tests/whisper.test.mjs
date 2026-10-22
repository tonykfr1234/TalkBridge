// Utterance cutting and WAV encoding for the Whisper interpreter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Segmenter, encodeWav, toRate16k, languageCode, isHallucination } from '../js/whisper.js';

const RATE = 16000;
function burst(seconds, amp = 0.2, f = 180) {
  return Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / RATE));
}
const silence = (s) => new Float32Array(Math.round(RATE * s)).map(() => (Math.random() * 2 - 1) * 0.001);

test('segmenter cuts speech at pauses and drops clicks', () => {
  const got = [];
  const seg = new Segmenter({ onUtterance: (x) => got.push(x.length / RATE) });
  const feed = (x) => { for (let i = 0; i < x.length; i += 4096) seg.push(x.subarray(i, i + 4096)); };
  feed(silence(1));
  feed(burst(1.2)); feed(silence(1));
  feed(burst(0.1)); feed(silence(1)); // a click, too short
  feed(burst(0.6)); feed(silence(0.3)); feed(burst(0.6)); feed(silence(1)); // short pause stays inside one utterance
  assert.equal(got.length, 2);
  assert.ok(got[0] > 1.2 && got[0] < 2.4, `first ${got[0]}`);
  assert.ok(got[1] > 1.5 && got[1] < 2.8, `second ${got[1]}`);
});

test('segmenter splits very long speech', () => {
  const got = [];
  const seg = new Segmenter({ onUtterance: (x) => got.push(x.length), maxMs: 3000 });
  const x = burst(7);
  for (let i = 0; i < x.length; i += 4096) seg.push(x.subarray(i, i + 4096));
  assert.ok(got.length >= 2);
  assert.ok(got.every((n) => n <= RATE * 3.4));
});

test('WAV header and downsampling', async () => {
  const blob = encodeWav(new Float32Array([0, 1, -1, 0.5]));
  const b = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(b.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(b.slice(8, 12)), 'WAVE');
  const v = new DataView(b.buffer);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getInt16(46, true), 32767);
  assert.equal(v.getInt16(48, true), -32768);
  assert.equal(b.length, 44 + 8);
  assert.equal(toRate16k(new Float32Array(48000), 48000).length, 16000);
});

test('Whisper language names and invented phrases', () => {
  assert.equal(languageCode('chinese'), 'zh-TW');
  assert.equal(languageCode('English'), 'en');
  assert.equal(languageCode('vietnamese'), 'vi');
  assert.ok(isHallucination('Thank you for watching!'));
  assert.ok(!isHallucination('Thank you for the report'));
});
