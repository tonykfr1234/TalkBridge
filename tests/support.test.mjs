// About page data and the supporter flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChangelog, normalizeDonors, nextDonorNumber, normalizeDonate, notifyText, CREDIT } from '../js/support.js';

test('changelog sections parse into versions with Chinese and English notes', () => {
  const md = '# Changelog\n\n## 2026-10-23 · 1.5.0\n\n- New about tab.\n- 新增關於分頁。\n\n- Fix `x`.\n- 修正 x。\n\n## 2026-10-22 · 1.4.1\n\n- Older.\n- 較舊。\n';
  const r = parseChangelog(md);
  assert.deepEqual(r.map((x) => x.version), ['1.5.0', '1.4.1']);
  assert.deepEqual(r[0].zh, ['新增關於分頁。', '修正 x。']);
  assert.deepEqual(r[0].en, ['New about tab.', 'Fix `x`.']);
  assert.equal(r[1].date, '2026-10-22');
});

test('mixed-language lines go to the right list', () => {
  const md = '## 2026-10-23 · 1.5.0\n\n- 請 Tony 喝咖啡 page (donate.html): choose an amount and pay.\n- 新增「請 Tony 喝咖啡」頁：選金額。\n- 透過 Anthropic SDK 呼叫 Claude，預設 Claude Opus 5.5。\n';
  const [r] = parseChangelog(md);
  assert.deepEqual(r.en, ['請 Tony 喝咖啡 page (donate.html): choose an amount and pay.']);
  assert.equal(r.zh.length, 2);
});

test('the real CHANGELOG has notes in both languages for every version', () => {
  const r = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  assert.ok(r.length >= 10);
  for (const v of r) {
    assert.match(v.version, /^\d+\.\d+\.\d+$/);
    assert.ok(v.zh.length > 0, `${v.version} zh`);
    assert.ok(v.en.length > 0, `${v.version} en`);
  }
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(r[0].version, pkg.version, 'package.json version matches the newest changelog entry');
});

test('donors are numbered by confirmed order', () => {
  const d = normalizeDonors({ donors: [{ n: 2, name: 'B' }, { n: 1, name: 'A', message: 'hi' }, { name: '' }] });
  assert.equal(d.count, 2);
  assert.deepEqual(d.donors.map((x) => x.name), ['A', 'B']);
  assert.equal(nextDonorNumber({ donors: [{ name: 'A' }, { name: 'B' }] }), 3);
  assert.equal(nextDonorNumber(null), 1);
  const real = JSON.parse(readFileSync(new URL('../donors.json', import.meta.url), 'utf8'));
  assert.equal(real.count, real.donors.length, 'donors.json count matches the list');
});

test('payment settings report what is still missing', () => {
  const empty = normalizeDonate({ bank: { name: '', code: '', account: '' }, linePay: {} });
  assert.equal(empty.bankReady, false);
  assert.equal(empty.lineReady, false);
  assert.deepEqual(empty.amounts, [100, 150, 300]);
  const full = normalizeDonate({ bank: { name: '範例銀行', code: '000', account: '1234567890' }, linePay: { url: 'https://line.me/x' } });
  assert.equal(full.bankReady, true);
  assert.equal(full.lineReady, true);
  const shipped = normalizeDonate(JSON.parse(readFileSync(new URL('../donate.json', import.meta.url), 'utf8')));
  assert.equal(typeof shipped.bankReady, 'boolean');
});

test('message to Tony carries what he needs to confirm the payment', () => {
  const t = notifyText({ name: '小美', amount: 150, method: 'bank', last5: '12345', message: '加油', number: 3 });
  assert.match(t, /暱稱：小美/);
  assert.match(t, /金額：NT\$150/);
  assert.match(t, /銀行轉帳（帳號末五碼 12345）/);
  assert.match(t, /第 3 位/);
  assert.doesNotMatch(notifyText({ name: 'A', method: 'line', number: 1 }), /金額|末五碼|留言/);
  assert.equal(CREDIT, 'Build by Tony · 2026 年製作');
});
