// Turn spoken deadlines ("下週五", "明天", "10月24號", "月底", "by Friday")
// into calendar dates relative to the meeting day. Pure module, covered by
// tests/unit.test.mjs.

const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const EN_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WD_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

// "二十四" → 24, "十" → 10, "12" → 12
export function cnNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (!s || [...s].some((c) => !(c in CN))) return NaN;
  if (!s.includes('十')) return Number([...s].map((c) => CN[c]).join(''));
  const [a, b] = s.split('十');
  return (a ? CN[a] : 1) * 10 + (b ? CN[b] : 0);
}

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = day0(d); x.setDate(x.getDate() + n); return x; };

// Monday-based week: the given weekday (0 = Sunday) in the week `offset`
// weeks from the reference week.
function weekday(ref, wd, offset) {
  const mondayIdx = (ref.getDay() + 6) % 7;
  const monday = addDays(ref, -mondayIdx);
  return addDays(monday, offset * 7 + ((wd + 6) % 7));
}

// The next time this weekday comes (today counts).
function upcoming(ref, wd) {
  return addDays(ref, (wd - ref.getDay() + 7) % 7);
}

function monthDay(ref, m, d) {
  let x = new Date(ref.getFullYear(), m - 1, d);
  if (x.getMonth() !== m - 1) return null;
  if (x < addDays(ref, -60)) x = new Date(ref.getFullYear() + 1, m - 1, d);
  return x;
}

/**
 * Find a deadline in `text`. Returns { date: 'YYYY-MM-DD', text: matched words }
 * or null. `ref` is the meeting date.
 */
export function parseDue(text, ref = new Date()) {
  const t = text || '';
  const lower = t.toLowerCase();
  let m;
  const hit = (date, words) => (date ? { date: iso(date), text: words } : null);

  if ((m = t.match(/大後天/))) return hit(addDays(ref, 3), m[0]);
  if ((m = t.match(/後天/))) return hit(addDays(ref, 2), m[0]);
  if ((m = t.match(/明天|明日/))) return hit(addDays(ref, 1), m[0]);
  if ((m = t.match(/今天|今日|今晚|下班前/))) return hit(day0(ref), m[0]);

  if ((m = t.match(/(下下|下|這|这|本)個?(?:週|周|禮拜|礼拜|星期)([一二三四五六日天])/))) {
    const off = m[1] === '下下' ? 2 : m[1] === '下' ? 1 : 0;
    return hit(weekday(ref, WEEKDAY[m[2]], off), m[0]);
  }
  if ((m = t.match(/(?:週|周|禮拜|礼拜|星期)([一二三四五六日天])/))) return hit(upcoming(ref, WEEKDAY[m[1]]), m[0]);
  if ((m = t.match(/(這|这|本)(?:週|周|禮拜|星期)(?:內|内|之內|結束前)?/))) return hit(weekday(ref, 5, 0), m[0]);

  if ((m = t.match(/(\d{1,2}|[一二三四五六七八九十]{1,3})\s*月\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[日號号]?/))) {
    return hit(monthDay(ref, cnNumber(m[1]), cnNumber(m[2])), m[0]);
  }
  if ((m = t.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/))) return hit(monthDay(ref, Number(m[1]), Number(m[2])), m[0]);
  if ((m = t.match(/下(?:個)?月底/))) return hit(new Date(ref.getFullYear(), ref.getMonth() + 2, 0), m[0]);
  if ((m = t.match(/月底|這個月底|本月底/))) return hit(new Date(ref.getFullYear(), ref.getMonth() + 1, 0), m[0]);
  if ((m = t.match(/(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[號号]/))) {
    const d = cnNumber(m[1]);
    let x = new Date(ref.getFullYear(), ref.getMonth(), d);
    if (x < day0(ref)) x = new Date(ref.getFullYear(), ref.getMonth() + 1, d);
    return d >= 1 && d <= 31 ? hit(x, m[0]) : null;
  }

  if ((m = lower.match(/\b(today|tonight|end of (the )?day|eod)\b/))) return hit(day0(ref), m[0]);
  if ((m = lower.match(/\btomorrow\b/))) return hit(addDays(ref, 1), m[0]);
  if ((m = lower.match(/\bnext (sun|mon|tues|wednes|thurs|fri|satur)day\b/))) {
    return hit(weekday(ref, EN_DAYS.findIndex((d) => d.startsWith(m[1])), 1), m[0]);
  }
  if ((m = lower.match(/\b(?:by |on |this )?(sun|mon|tues|wednes|thurs|fri|satur)day\b/))) {
    return hit(upcoming(ref, EN_DAYS.findIndex((d) => d.startsWith(m[1]))), m[0]);
  }
  if ((m = lower.match(/\bend of (the )?week\b/))) return hit(weekday(ref, 5, 0), m[0]);
  if ((m = lower.match(/\bend of (the )?month\b/))) return hit(new Date(ref.getFullYear(), ref.getMonth() + 1, 0), m[0]);
  if ((m = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})\b/))) {
    return hit(monthDay(ref, EN_MONTHS.indexOf(m[1]) + 1, Number(m[2])), m[0]);
  }
  return null;
}

// '2026-10-30' → '10/30（五）'
export function formatDue(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || '')) return '';
  const [y, mo, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return `${mo}/${d}（${WD_LABEL[dt.getDay()]}）`;
}

// For prompts: '2026-10-22（星期四）'
export function meetingDayLabel(ref = new Date()) {
  return `${iso(ref)}（星期${WD_LABEL[ref.getDay()]}）`;
}
