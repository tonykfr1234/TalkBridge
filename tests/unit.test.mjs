// Unit tests for the pure modules. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAttempt, units, clock, srtTime, toSRT, toTXT, toMarkdown, toShareText, speakerStats, localNotes } from '../js/textkit.js';
import { detectScript, guessPairSide, sameLang, translateCode, LANGS } from '../js/langs.js';
import { parseGoogle, parseMyMemory } from '../js/translate.js';
import { PHRASES, SCENARIOS, thaiFor, PRACTICE_LANGS, GUIDES } from '../js/practice-data.js';
import { nextStreak } from '../js/store.js';
import { MINUTES_SCHEMA, TUTOR_SCHEMA, SPEAKER_SCHEMA } from '../js/ai.js';

test('units splits spaced and unspaced scripts', () => {
  assert.deepEqual(units('Hello, nice to meet you.'), ['hello', 'nice', 'to', 'meet', 'you']);
  assert.deepEqual(units('你好，世界'), ['你', '好', '世', '界']);
  assert.equal(units('สวัสดีครับ').length, 10);
  assert.deepEqual(units('Xin chào'), ['xin', 'chào']);
});

test('scoreAttempt rewards exact matches and marks missing words', () => {
  assert.equal(scoreAttempt('Can you hear me?', 'can you hear me').score, 100);
  const r = scoreAttempt('Please send me the report by Friday.', 'please send the report Friday');
  assert.ok(r.score > 60 && r.score < 100, `score ${r.score}`);
  assert.deepEqual(r.parts.filter((p) => !p.ok).map((p) => p.text), ['me', 'by']);
  assert.equal(scoreAttempt('Cái này bao nhiêu tiền?', 'cái này bao nhiêu tiền').score, 100);
  assert.ok(scoreAttempt('Cái này bao nhiêu tiền?', 'cai nay bao nhieu tien').score < 50, 'tones matter');
  assert.equal(scoreAttempt('anything', '').score, 0);
});

test('time formatting', () => {
  assert.equal(clock(0), '00:00');
  assert.equal(clock(65_000), '01:05');
  assert.equal(clock(3_725_000), '1:02:05');
  assert.equal(srtTime(3_725_042), '01:02:05,042');
});

const meeting = {
  title: '週會',
  createdAt: Date.UTC(2026, 9, 21, 2, 0),
  durationMs: 90_000,
  segments: [
    { t: 0, end: 2500, speaker: '發言人 A', text: '我們開始今天的週會，先看出貨進度。', tr: "Let's start today's weekly meeting." },
    { t: 3000, end: 9000, speaker: '發言人 B', text: '越南工廠的出貨進度落後兩天，需要在週五前完成補貨。', tr: '' },
    { t: 9500, end: 12000, speaker: '發言人 A', text: '好，那我們決定先空運一批，出貨進度每天追蹤。', tr: '' },
    { t: 12500, end: 14000, speaker: '發言人 B', text: '預算要誰確認？', tr: '' },
  ],
};

test('SRT export numbers cues and keeps timing ordered', () => {
  const srt = toSRT(meeting);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\n發言人 A: 我們開始/);
  assert.match(srt, /\n4\n00:00:12,500 --> 00:00:14,000\n/);
  assert.match(srt, /Let's start today's weekly meeting\./);
});

test('TXT and Markdown exports include speakers and translations', () => {
  const txt = toTXT(meeting);
  assert.match(txt, /\[00:03\] 發言人 B：越南工廠/);
  assert.match(txt, /Let's start/);
  const md = toMarkdown({ ...meeting, notes: { summary: '出貨延誤', keyPoints: ['空運'], decisions: [], actionItems: [{ task: '補貨', owner: 'B', due: '週五' }], openQuestions: [], englishSummary: 'Shipping delay' } });
  assert.match(md, /## 待辦事項/);
  assert.match(md, /\| B \| 補貨 \| 週五（日期待確認） \| 中 \|/);
  assert.match(md, /## English summary/);
});

test('share text is bounded for LINE', () => {
  const t = toShareText({ ...meeting, notes: { summary: 'x'.repeat(2000), keyPoints: [], actionItems: [] } }, 300);
  assert.ok(t.length <= 300);
  assert.ok(t.startsWith('【週會】'));
  assert.match(toShareText(meeting), /發言人 A：我們開始/);
});

test('speaker statistics sum to one', () => {
  const s = speakerStats(meeting.segments);
  assert.equal(s.length, 2);
  assert.ok(Math.abs(s.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
  assert.equal(s[0].speaker, '發言人 A');
});

test('offline notes find actions, decisions and questions', () => {
  const n = localNotes(meeting.segments);
  assert.ok(n.actionItems.some((a) => a.task.includes('週五前')));
  assert.ok(n.decisions.some((d) => d.includes('決定')));
  assert.deepEqual(n.openQuestions, ['預算要誰確認？']);
  assert.ok(n.keyPoints.length > 0);
  assert.match(n.summary, /出貨/);
});

test('script detection', () => {
  assert.equal(detectScript('你好嗎'), 'zh');
  assert.equal(detectScript('Hello there'), 'latin');
  assert.equal(detectScript('Xin chào, rất vui được gặp anh'), 'vi');
  assert.equal(detectScript('สวัสดีครับ'), 'th');
  assert.equal(detectScript('こんにちは'), 'ja');
  assert.equal(detectScript('안녕하세요'), 'ko');
});

test('guessPairSide picks the speaker language from the script', () => {
  assert.equal(guessPairSide('我想訂兩張票', 'zh-TW', 'en'), 'zh-TW');
  assert.equal(guessPairSide('I would like two tickets', 'zh-TW', 'en'), 'en');
  assert.equal(guessPairSide('Tôi muốn hai vé', 'zh-TW', 'vi'), 'vi');
  assert.equal(guessPairSide('Tôi muốn hai vé', 'en', 'vi'), 'vi');
  assert.equal(guessPairSide('I want two tickets', 'en', 'vi'), 'en');
  assert.equal(guessPairSide('ราคาเท่าไหร่', 'zh-TW', 'th'), 'th');
  assert.equal(guessPairSide('Hola amigo', 'en', 'es'), null);
});

test('language helpers', () => {
  assert.ok(sameLang('zh-CN', 'zh-TW'));
  assert.ok(sameLang('en', 'en'));
  assert.ok(!sameLang('vi', 'en'));
  assert.equal(translateCode('yue'), 'zh-TW');
  assert.equal(new Set(LANGS.map((l) => l.code)).size, LANGS.length);
});

test('translation response parsers', () => {
  assert.deepEqual(parseGoogle([[['Hello ', '你好', null], ['world', '世界', null]], null, 'zh-TW']), { text: 'Hello world', detected: 'zh-TW' });
  assert.throws(() => parseGoogle('<html>'));
  assert.deepEqual(parseMyMemory({ responseData: { translatedText: '你好' }, responseStatus: 200 }), { text: '你好', detected: null });
  assert.throws(() => parseMyMemory({ responseData: {}, responseStatus: 403 }));
});

test('practice data is complete', () => {
  assert.equal(SCENARIOS.length, 8);
  for (const s of SCENARIOS) assert.ok(PHRASES.filter((p) => p.scenario === s.id).length >= 6, s.id);
  for (const p of PHRASES) {
    for (const k of ['zh', 'en', 'vi', 'th', 'thr']) assert.ok(p[k] && p[k].trim(), `${p.id}.${k}`);
  }
  assert.equal(new Set(PHRASES.map((p) => p.id)).size, PHRASES.length);
  for (const l of PRACTICE_LANGS) assert.ok(GUIDES[l], l);
});

test('Thai female forms', () => {
  const q = PHRASES.find((p) => p.th === 'อันนี้เท่าไหร่ครับ');
  assert.deepEqual(thaiFor(q, true), { text: 'อันนี้เท่าไหร่คะ', roman: 'an níi thâo-rài khá' });
  const s = PHRASES.find((p) => p.th === 'ผมกินเผ็ดไม่ได้ครับ');
  assert.equal(thaiFor(s, true).text, 'ดิฉันกินเผ็ดไม่ได้ค่ะ');
  assert.equal(thaiFor(s, false).text, s.th);
});

test('streak counts consecutive days', () => {
  assert.deepEqual(nextStreak(null, '2026-10-21'), { last: '2026-10-21', count: 1 });
  assert.deepEqual(nextStreak({ last: '2026-10-20', count: 4 }, '2026-10-21'), { last: '2026-10-21', count: 5 });
  assert.deepEqual(nextStreak({ last: '2026-10-21', count: 5 }, '2026-10-21'), { last: '2026-10-21', count: 5 });
  assert.deepEqual(nextStreak({ last: '2026-10-18', count: 5 }, '2026-10-21'), { last: '2026-10-21', count: 1 });
  assert.deepEqual(nextStreak({ last: '2026-10-31', count: 2 }, '2026-11-01'), { last: '2026-11-01', count: 3 });
});

function checkStrict(schema, path = 'root') {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${path} additionalProperties`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path} required`);
    for (const [k, v] of Object.entries(schema.properties)) checkStrict(v, `${path}.${k}`);
  } else if (schema.type === 'array') {
    checkStrict(schema.items, `${path}[]`);
  }
}

test('structured-output schemas are strict', () => {
  checkStrict(MINUTES_SCHEMA);
  checkStrict(TUTOR_SCHEMA);
  checkStrict(SPEAKER_SCHEMA);
});
