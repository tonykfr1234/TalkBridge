// Deadlines, action items, provider JSON repair and voice grouping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDue, formatDue, cnNumber, meetingDayLabel } from '../js/duedate.js';
import { dueLabel, ownerLabel, sortActions, groupByOwner, upgradeActions, guessOwner, toMarkdown, toShareText, localNotes } from '../js/textkit.js';
import { FeatureExtractor, embed, distance, spread, OnlineDiarizer, clusterAll, pitch } from '../js/diarize.js';
import { conform, MINUTES_SCHEMA, PROVIDERS } from '../js/ai.js';

const THU = new Date(2026, 9, 22); // Thursday 2026-10-22
const due = (t) => (parseDue(t, THU) || {}).date || null;

test('Chinese numerals', () => {
  assert.equal(cnNumber('二十四'), 24);
  assert.equal(cnNumber('十'), 10);
  assert.equal(cnNumber('十二'), 12);
  assert.equal(cnNumber('三十一'), 31);
  assert.equal(cnNumber('7'), 7);
});

test('relative Chinese deadlines', () => {
  assert.equal(due('明天給我'), '2026-10-23');
  assert.equal(due('後天再說'), '2026-10-24');
  assert.equal(due('今天下班前'), '2026-10-22');
  assert.equal(due('下週五前寄出'), '2026-10-30');
  assert.equal(due('下禮拜一開會'), '2026-10-26');
  assert.equal(due('這週五要交'), '2026-10-23');
  assert.equal(due('週五前完成'), '2026-10-23');
  assert.equal(due('星期二'), '2026-10-27');
  assert.equal(due('這週內處理'), '2026-10-23');
  assert.equal(due('月底前'), '2026-10-31');
  assert.equal(due('下個月底'), '2026-11-30');
  assert.equal(due('11月5日交貨'), '2026-11-05');
  assert.equal(due('十一月二十四號'), '2026-11-24');
  assert.equal(due('30號前'), '2026-10-30');
  assert.equal(due('5號'), '2026-11-05');
  assert.equal(due('12/3 前'), '2026-12-03');
  assert.equal(due('1月10日'), '2027-01-10');
  assert.equal(due('再看看'), null);
});

test('English deadlines', () => {
  assert.equal(due('by Friday'), '2026-10-23');
  assert.equal(due('next Monday'), '2026-10-26');
  assert.equal(due('send it tomorrow'), '2026-10-23');
  assert.equal(due('end of month'), '2026-10-31');
  assert.equal(due('by Nov 3'), '2026-11-03');
  assert.equal(due('ship by EOD'), '2026-10-22');
});

test('date labels', () => {
  assert.equal(formatDue('2026-10-30'), '10/30（五）');
  assert.equal(formatDue(''), '');
  assert.equal(meetingDayLabel(THU), '2026-10-22（星期四）');
});

test('action item labels, sorting and grouping', () => {
  const items = upgradeActions([
    { task: 'B', owner: '', dueDate: '', dueText: '', priority: 'low' },
    { task: 'A', owner: '小王', dueDate: '2026-10-30', dueText: '下週五', priority: 'high' },
    { task: 'C', owner: '小王', dueDate: '2026-10-23', dueText: '明天', priority: 'medium' },
    { task: 'D', owner: 'Amy', dueDate: '', dueText: '盡快', priority: 'high' },
  ]);
  assert.deepEqual(sortActions(items).map((a) => a.task), ['C', 'A', 'D', 'B']);
  assert.equal(dueLabel(items[1]), '10/30（五）・下週五');
  assert.equal(dueLabel(items[0]), '未指定期限');
  assert.equal(dueLabel(items[3]), '盡快（日期待確認）');
  assert.equal(ownerLabel(items[0]), '未指定負責人');
  const groups = groupByOwner(sortActions(items));
  assert.deepEqual(groups.map((g) => g.owner), ['小王', 'Amy', '未指定負責人']);
  // Older saves used { task, owner, due }.
  assert.deepEqual(upgradeActions([{ task: 'x', owner: 'A', due: '週五' }])[0],
    { task: 'x', owner: 'A', ownerSource: 'inferred', dueDate: '', dueText: '週五', priority: 'medium', quote: '' });
});

test('owners named in requests', () => {
  assert.deepEqual(guessOwner('請小王下週五前把報價單寄給客戶', '發言人 A'), { owner: '小王', ownerSource: 'stated' });
  assert.deepEqual(guessOwner('麻煩 Amy 明天確認', '發言人 A'), { owner: 'Amy', ownerSource: 'stated' });
  assert.deepEqual(guessOwner('小李負責聯絡物流', '發言人 A'), { owner: '小李', ownerSource: 'stated' });
  assert.deepEqual(guessOwner('我明天會確認庫存', '發言人 B'), { owner: '發言人 B', ownerSource: 'inferred' });
});

test('offline notes fill owners and dates; exports show them', () => {
  const segs = [
    { t: 0, end: 1, speaker: '發言人 A', text: '請小王下週五前把報價單寄給客戶' },
    { t: 1, end: 2, speaker: '發言人 B', text: '我明天會確認庫存' },
  ];
  const notes = localNotes(segs, { meetingDate: THU });
  assert.deepEqual(notes.actionItems.map((a) => [a.owner, a.dueDate]), [['小王', '2026-10-30'], ['發言人 B', '2026-10-23']]);
  const m = { title: '週會', createdAt: THU.getTime(), durationMs: 2000, segments: segs, notes };
  const md = toMarkdown(m);
  assert.match(md, /\| 小王 \| 請小王下週五前把報價單寄給客戶 \| 10\/30（五）・下週五 \| 高 \|/);
  assert.match(md, /### 依負責人/);
  const share = toShareText(m);
  assert.match(share, /▸ 發言人 B\n  ・我明天會確認庫存｜10\/23（五）・明天/);
});

test('conform repairs JSON from providers without schema enforcement', () => {
  const v = conform(MINUTES_SCHEMA, { title: 'T', actionItems: [{ task: 'x', priority: 'urgent', dueDate: null }], speakers: 'nope' });
  assert.equal(v.title, 'T');
  assert.deepEqual(v.keyPoints, []);
  assert.deepEqual(v.speakers, []);
  assert.deepEqual(v.actionItems[0], { task: 'x', owner: '', ownerSource: 'inferred', dueDate: '', dueText: '', priority: 'medium', quote: '' });
  assert.equal(PROVIDERS.deepseek.defaultModel, 'deepseek-chat');
});

// ---- voice grouping with synthetic voices ----
// A voice = glottal pulse train at f0 through two formant resonators.
function voice(f0, f1, f2, seconds, seed) {
  const rate = 48000, n = Math.floor(rate * seconds), out = new Float32Array(n);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const res = (f, bw) => { const r = Math.exp(-Math.PI * bw / rate), c = 2 * r * Math.cos(2 * Math.PI * f / rate); return { a1: c, a2: -r * r, y1: 0, y2: 0 }; };
  const r1 = res(f1, 90), r2 = res(f2, 120);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const vib = 1 + 0.03 * Math.sin(2 * Math.PI * 5 * i / rate) + 0.02 * Math.sin(2 * Math.PI * 0.7 * i / rate + seed);
    phase += (f0 * vib) / rate;
    const src = phase >= 1 ? (phase -= 1, 1) : 0;
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * i / rate + seed); // syllable rhythm
    let x = src * env;
    const y1 = x + r1.a1 * r1.y1 + r1.a2 * r1.y2; r1.y2 = r1.y1; r1.y1 = y1;
    const y2 = y1 + r2.a1 * r2.y1 + r2.a2 * r2.y2; r2.y2 = r2.y1; r2.y1 = y2;
    out[i] = y2 * 0.002 + (rnd() * 2 - 1) * 0.002;
  }
  return out;
}
const fingerprint = (sig) => embed(new FeatureExtractor(48000).push(sig, 0));

test('pitch tracker finds the fundamental', () => {
  const rate = 16000, x = new Float32Array(400);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin(2 * Math.PI * 140 * i / rate) + 0.5 * Math.sin(2 * Math.PI * 280 * i / rate);
  assert.ok(Math.abs(pitch(x, rate) - 140) < 6, `pitch ${pitch(x, rate)}`);
});

test('silence has no fingerprint', () => {
  assert.equal(fingerprint(new Float32Array(48000)), null);
});

test('different synthetic voices separate, the same voice stays together', () => {
  const low = [1, 2, 3, 4].map((k) => fingerprint(voice(105, 500, 1500, 1.5, k * 7)));
  const high = [1, 2, 3, 4].map((k) => fingerprint(voice(210, 800, 2200, 1.5, k * 11)));
  const sd = spread([...low, ...high]);
  const within = Math.max(distance(low[0], low[1], sd), distance(high[0], high[1], sd));
  const between = Math.min(distance(low[0], high[0], sd), distance(low[2], high[3], sd));
  assert.ok(between > within * 2, `between ${between.toFixed(2)} within ${within.toFixed(2)}`);
  const order = [low[0], high[0], low[1], high[1], low[2], high[2], low[3], high[3]];
  const batch = clusterAll(order);
  assert.deepEqual(batch, [0, 1, 0, 1, 0, 1, 0, 1]);
  const online = new OnlineDiarizer();
  assert.deepEqual(order.map((e) => online.add(e)), [0, 1, 0, 1, 0, 1, 0, 1]);
  assert.deepEqual(clusterAll([null, low[0], null]), [-1, 0, -1]);
});

test('teach moves a fingerprint to the corrected speaker', () => {
  const d = new OnlineDiarizer();
  const a = fingerprint(voice(105, 500, 1500, 1.5, 3));
  const b = fingerprint(voice(210, 800, 2200, 1.5, 5));
  assert.equal(d.add(a), 0);
  assert.equal(d.add(b), 1);
  d.teach(b, 1, 2); // the user says this line was a third person
  assert.deepEqual(d.members.map((m) => m.length), [1, 0, 1]);
  assert.equal(d.add(fingerprint(voice(210, 800, 2200, 1.5, 9))), 2);
});
