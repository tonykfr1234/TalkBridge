// Pure text helpers (no DOM): pronunciation scoring, transcript exports,
// offline meeting summary and speaker statistics. Covered by tests/textkit.test.mjs.

const PUNCT = /[\s\p{P}\p{S}]+/gu;

export function normalize(s) {
  return (s || '').normalize('NFC').toLowerCase().replace(PUNCT, ' ').trim();
}

// Split into comparison units: words for spaced scripts, characters for
// Chinese, Japanese and Thai (which do not separate words with spaces).
export function units(s) {
  const n = normalize(s);
  if (!n) return [];
  if (/[一-鿿぀-ヿ฀-๿]/.test(n)) return [...n.replace(/\s+/g, '')];
  return n.split(/\s+/);
}

function lcsTable(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

/**
 * Compare what the learner said with the target sentence.
 * Returns { score 0-100, parts: [{ text, ok }] } where parts follow the
 * target sentence and mark which units were heard.
 */
export function scoreAttempt(target, heard) {
  const a = units(target);
  const b = units(heard);
  if (!a.length) return { score: 0, parts: [] };
  const t = lcsTable(a, b);
  const parts = [];
  let i = 0, j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) { parts.push({ text: a[i], ok: true }); i++; j++; }
    else if (j < b.length && t[i][j + 1] >= t[i + 1][j]) j++;
    else { parts.push({ text: a[i], ok: false }); i++; }
  }
  const matched = t[0][0];
  // Penalize extra words a little so rambling does not score 100.
  const precision = b.length ? matched / b.length : 0;
  const recall = matched / a.length;
  const score = Math.round(100 * (recall * 0.8 + precision * 0.2));
  return { score, parts };
}

export function scoreLabel(score) {
  if (score >= 90) return '非常好';
  if (score >= 75) return '不錯';
  if (score >= 50) return '再練一下';
  return '再試一次';
}

// ---- time ----
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function srtTime(ms) {
  const v = Math.max(0, Math.round(ms));
  const h = Math.floor(v / 3600000), m = Math.floor((v % 3600000) / 60000);
  const s = Math.floor((v % 60000) / 1000), x = v % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(x, 3)}`;
}

// ---- exports ----
// A meeting: { title, createdAt, durationMs, segments: [{ t, end, speaker, text, tr }] }

export function toTXT(m, { withTranslation = true } = {}) {
  const head = [`${m.title}`, `${new Date(m.createdAt).toLocaleString('zh-TW')} · 長度 ${clock(m.durationMs || 0)}`, ''];
  const body = m.segments.map((s) => {
    const line = `[${clock(s.t)}] ${s.speaker ? s.speaker + '：' : ''}${s.text}`;
    return withTranslation && s.tr ? `${line}\n          ${s.tr}` : line;
  });
  return head.concat(body).join('\n') + '\n';
}

export function toSRT(m, { useTranslation = false } = {}) {
  return m.segments.map((s, i) => {
    const end = s.end && s.end > s.t ? s.end : s.t + 3000;
    const next = m.segments[i + 1];
    const stop = next && next.t < end ? Math.max(s.t + 500, next.t - 50) : end;
    const text = useTranslation ? (s.tr || s.text) : (s.tr ? `${s.text}\n${s.tr}` : s.text);
    return `${i + 1}\n${srtTime(s.t)} --> ${srtTime(stop)}\n${s.speaker ? s.speaker + ': ' : ''}${text}\n`;
  }).join('\n');
}

export function toMarkdown(m) {
  const out = [`# ${m.title}`, '', `- 日期：${new Date(m.createdAt).toLocaleString('zh-TW')}`, `- 長度：${clock(m.durationMs || 0)}`];
  const sp = speakerStats(m.segments);
  if (sp.length) out.push(`- 發言人：${sp.map((x) => x.speaker).join('、')}`);
  const n = m.notes;
  if (n) {
    out.push('', '## 摘要', '', n.summary || '');
    if (n.keyPoints && n.keyPoints.length) out.push('', '## 重點', '', ...n.keyPoints.map((k) => `- ${k}`));
    if (n.decisions && n.decisions.length) out.push('', '## 決議', '', ...n.decisions.map((k) => `- ${k}`));
    if (n.actionItems && n.actionItems.length) {
      out.push('', '## 待辦事項', '', '| 事項 | 負責人 | 期限 |', '| --- | --- | --- |',
        ...n.actionItems.map((a) => `| ${a.task} | ${a.owner || '—'} | ${a.due || '—'} |`));
    }
    if (n.openQuestions && n.openQuestions.length) out.push('', '## 待確認', '', ...n.openQuestions.map((k) => `- ${k}`));
    if (n.englishSummary) out.push('', '## English summary', '', n.englishSummary);
  }
  out.push('', '## 逐字稿', '');
  for (const s of m.segments) {
    out.push(`**[${clock(s.t)}] ${s.speaker || ''}** ${s.text}${s.tr ? `  \n> ${s.tr}` : ''}`, '');
  }
  return out.join('\n');
}

// Short plain-text version for LINE / chat apps.
export function toShareText(m, limit = 900) {
  const lines = [`【${m.title}】`, new Date(m.createdAt).toLocaleString('zh-TW')];
  const n = m.notes;
  if (n) {
    if (n.summary) lines.push('', n.summary);
    if (n.keyPoints && n.keyPoints.length) lines.push('', '重點：', ...n.keyPoints.slice(0, 6).map((k) => `・${k}`));
    if (n.actionItems && n.actionItems.length) {
      lines.push('', '待辦：', ...n.actionItems.slice(0, 6).map((a) => `・${a.task}${a.owner ? `（${a.owner}）` : ''}${a.due ? ` ${a.due}` : ''}`));
    }
  } else {
    lines.push('', ...m.segments.slice(0, 12).map((s) => `${s.speaker ? s.speaker + '：' : ''}${s.text}`));
  }
  let text = lines.join('\n');
  if (text.length > limit) text = text.slice(0, limit - 1) + '…';
  return text;
}

// ---- speaker statistics ----
export function speakerStats(segments) {
  const map = new Map();
  for (const s of segments) {
    const k = s.speaker || '未標記';
    const cur = map.get(k) || { speaker: k, turns: 0, chars: 0, ms: 0 };
    cur.turns++;
    cur.chars += units(s.text).length;
    cur.ms += Math.max(0, (s.end || s.t) - s.t);
    map.set(k, cur);
  }
  const list = [...map.values()];
  const total = list.reduce((a, x) => a + x.chars, 0) || 1;
  list.forEach((x) => { x.share = x.chars / total; });
  return list.sort((a, b) => b.chars - a.chars);
}

// ---- offline summary (no AI) ----
const ACTION_RE = /(需要|要求|負責|請.{0,6}(在|於|把|幫)|截止|期限|下週|下周|明天|月底|之前|前完成|會後|待辦|跟進|追蹤|確認|deadline|by (mon|tues|wednes|thurs|fri|satur|sun)day|by next|will send|need to|follow up|action item|let's|we should|assign|due)/i;
const DECISION_RE = /(決定|決議|確定|同意|通過|就這樣|定案|agreed|decided|approve|go with|final)/i;
const STOP = new Set('的 了 是 我 你 他 她 們 這 那 就 都 也 在 有 和 跟 要 會 不 很 個 嗎 吧 啊 呢 喔 嗯 欸 一 個 然後 所以 就是 那個 這個 the a an to of and or is are was were be it that this i you we they he she in on for with as at by from so but just like yeah okay ok um uh'.split(' '));

function keyTerms(text) {
  const n = normalize(text);
  if (/[一-鿿]/.test(n)) {
    const chars = [...n.replace(/[^一-鿿]/g, '')];
    const grams = [];
    for (let i = 0; i < chars.length - 1; i++) {
      const g = chars[i] + chars[i + 1];
      if (!STOP.has(chars[i]) && !STOP.has(chars[i + 1])) grams.push(g);
    }
    return grams;
  }
  return n.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

export function localNotes(segments, { maxPoints = 6 } = {}) {
  const freq = new Map();
  segments.forEach((s) => keyTerms(s.text).forEach((g) => freq.set(g, (freq.get(g) || 0) + 1)));
  const scored = segments.map((s, i) => {
    const terms = keyTerms(s.text);
    const score = terms.reduce((a, g) => a + (freq.get(g) > 1 ? freq.get(g) : 0), 0) / Math.sqrt(terms.length + 4);
    return { i, s, score };
  }).filter((x) => units(x.s.text).length >= 6);
  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxPoints).sort((a, b) => a.i - b.i);
  const keywords = [...freq.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g);
  const actionItems = segments.filter((s) => ACTION_RE.test(s.text)).slice(0, 10)
    .map((s) => ({ task: s.text, owner: s.speaker || '', due: '' }));
  const decisions = segments.filter((s) => DECISION_RE.test(s.text)).slice(0, 8).map((s) => s.text);
  return {
    title: '',
    summary: keywords.length ? `本次討論的關鍵詞：${keywords.join('、')}。` : '',
    keyPoints: top.map((x) => (x.s.speaker ? `${x.s.speaker}：` : '') + x.s.text),
    decisions,
    actionItems,
    openQuestions: segments.filter((s) => /[?？]|嗎$|呢$/.test(s.text.trim())).slice(0, 5).map((s) => s.text),
    speakers: [],
    englishSummary: '',
    offline: true,
  };
}
