// "About" and "buy Tony a coffee": release notes from CHANGELOG.md, the
// donation settings (donate.json) and the confirmed donor list
// (donors.json). The latest copies come from GitHub so every app, including
// an older installed APK, shows current progress and donor numbers; the
// copies bundled with the app are the offline fallback.

export const MAKER = 'Tony';
export const MADE_YEAR = 2026;
export const CREDIT = `Build by ${MAKER} · ${MADE_YEAR} 年製作`;
export const REPO = 'https://github.com/tonykfr1234/TalkBridge';
export const RAW = 'https://raw.githubusercontent.com/tonykfr1234/TalkBridge/main/';
export const SITE = 'https://tonykfr1234.github.io/TalkBridge/';
export const DONATE_URL = `${SITE}donate.html`;
export const APK_URL = `${REPO}/releases/latest/download/TalkBridge.apk`;

/**
 * CHANGELOG.md → [{ version, date, zh: [...], en: [...] }], newest first.
 * Headings look like "## 2026-10-22 · 1.4.1"; each change is an English
 * bullet followed by its Traditional Chinese bullet.
 */
export function parseChangelog(md) {
  const out = [];
  let cur = null;
  for (const raw of (md || '').split('\n')) {
    const line = raw.trim();
    const head = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*[·•-]\s*v?([\d.]+)/);
    if (head) { cur = { date: head[1], version: head[2], zh: [], en: [] }; out.push(cur); continue; }
    if (!cur || !line.startsWith('- ')) continue;
    const text = line.slice(2).trim();
    // Bilingual entries: Chinese lines use full-width punctuation, or Han characters outweigh Latin letters.
    const han = (text.match(/[一-鿿]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    (/[，。、；：！？]/.test(text) || han * 3 > latin ? cur.zh : cur.en).push(text);
  }
  return out;
}

/** donors.json → { count, donors: [{ n, name, date, message }] } with numbering checked. */
export function normalizeDonors(data) {
  const list = Array.isArray(data && data.donors) ? data.donors : [];
  const donors = list
    .filter((d) => d && d.name)
    .map((d, i) => ({ n: Number(d.n) || i + 1, name: String(d.name).slice(0, 40), date: d.date || '', message: String(d.message || '').slice(0, 200) }))
    .sort((a, b) => a.n - b.n);
  return { count: donors.length, donors };
}

/** Number a new supporter would get once Tony confirms the payment. */
export const nextDonorNumber = (donors) => normalizeDonors(donors).count + 1;

/** donate.json → settings with "not set yet" flags for missing payment details. */
export function normalizeDonate(cfg) {
  const c = cfg || {};
  const bank = c.bank || {};
  const line = c.linePay || {};
  return {
    title: c.title || `請 ${MAKER} 喝一杯咖啡`,
    note: c.note || '',
    amounts: Array.isArray(c.amounts) && c.amounts.length ? c.amounts : [100, 150, 300],
    currency: c.currency || 'TWD',
    bank: { name: bank.name || '', code: bank.code || '', account: bank.account || '', holder: bank.holder || '' },
    bankReady: !!(bank.code && bank.account),
    linePay: { url: line.url || '', id: line.id || '', qr: line.qr || '' },
    lineReady: !!(line.url || line.id || line.qr),
  };
}

/** Message the supporter sends Tony (through LINE) so he can confirm the payment. */
export function notifyText({ name, amount, method, last5, message, number }) {
  return [
    `嗨 ${MAKER}，我剛剛請你喝了一杯咖啡 ☕`,
    `暱稱：${name}`,
    amount ? `金額：NT$${amount}` : '',
    `方式：${method === 'line' ? 'LINE Pay' : '銀行轉帳'}${last5 ? `（帳號末五碼 ${last5}）` : ''}`,
    message ? `留言：${message}` : '',
    `（頁面顯示我預計是第 ${number} 位贊助者）`,
  ].filter(Boolean).join('\n');
}

async function getText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

/** Latest copy from GitHub, falling back to the copy shipped with the app. */
export async function loadShared(file) {
  try { return await getText(RAW + file); } catch { /* offline or blocked */ }
  try { return await getText(new URL(file, document.baseURI).href); } catch { return ''; }
}

export async function loadJSON(file, fallback) {
  try { return JSON.parse(await loadShared(file)); } catch { return fallback; }
}
