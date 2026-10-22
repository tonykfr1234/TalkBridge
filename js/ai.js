// AI features: AI translation, meeting minutes, speaker analysis and the
// role-play language tutor. Three providers, each with the viewer's own key,
// which stays in this browser's localStorage and is sent only to that
// provider: DeepSeek (default) and OpenAI through their Chat Completions
// APIs, Claude through the official Anthropic TypeScript SDK (bundled in
// js/vendor).
import { settings } from './store.js';

export const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek', keySetting: 'deepseekKey', modelSetting: 'deepseekModel', defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'], keyHint: 'sk-…', console: 'platform.deepseek.com',
    url: 'https://api.deepseek.com/chat/completions', maxTokens: 8000,
  },
  openai: {
    name: 'OpenAI', keySetting: 'openaiKey', modelSetting: 'openaiModel', defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'], keyHint: 'sk-…', console: 'platform.openai.com',
    url: 'https://api.openai.com/v1/chat/completions', maxTokens: 16000,
  },
  claude: {
    name: 'Claude', keySetting: 'apiKey', modelSetting: 'model', defaultModel: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], keyHint: 'sk-ant-…', console: 'console.anthropic.com',
    maxTokens: 16000,
  },
};

// Claude model labels for the model picker.
export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5（最準確）' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（較快、較省）' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（最快、最省）' },
];

// Viewers who saved a Claude key before providers existed keep using Claude.
export function currentProvider() {
  const p = settings.get('provider');
  if (p && PROVIDERS[p]) return p;
  return (settings.get('apiKey') || '').trim() ? 'claude' : 'deepseek';
}

export const providerInfo = (id = currentProvider()) => PROVIDERS[id];
const keyOf = (id) => (settings.get(PROVIDERS[id].keySetting) || '').trim();
const modelOf = (id) => (settings.get(PROVIDERS[id].modelSetting) || '').trim() || PROVIDERS[id].defaultModel;

export const hasAI = () => !!keyOf(currentProvider());

let sdkPromise = null;
function loadSDK() {
  if (!sdkPromise) sdkPromise = import('./vendor/anthropic-sdk.js').then((m) => m.Anthropic);
  return sdkPromise;
}

// Server-side refusal fallback is available on Opus 5.5 and Sonnet 5.5.
function fallbackParams(model) {
  if (model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5') {
    return { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
  }
  return { betas: [] };
}

export function friendlyError(e) {
  const status = e && e.status;
  const name = (e && e.provider) || providerInfo().name;
  if (status === 401) return `${name} API 金鑰無效，請到「設定」重新貼上。`;
  if (status === 402) return `${name} 帳戶餘額不足或方案不支援這個功能，請到 ${name} 網站確認。`;
  if (status === 403) return `這把 ${name} API 金鑰沒有使用此模型的權限。`;
  if (status === 404) return `${name} 找不到這個模型，請到「設定」換一個模型名稱。`;
  if (status === 429) return '請求太頻繁或額度不足，請稍後再試。';
  if (status === 529 || (status >= 500 && status < 600)) return `${name} 服務暫時忙碌，請稍後再試。`;
  if (e && e.name === 'AbortError') return '已取消。';
  if (e && /failed to fetch|network|load failed/i.test(e.message || '')) {
    return `連不上 ${name}。請檢查網路；若網路正常，可能是 ${name} 不接受從瀏覽器直接呼叫，請在「設定」改用其他 AI 服務。`;
  }
  return (e && e.message) || 'AI 呼叫失敗。';
}

function httpError(status, provider, detail) {
  const err = new Error(detail || `HTTP ${status}`);
  err.status = status;
  err.provider = provider;
  return err;
}

// Fill gaps in a model's JSON so the page can rely on the schema's shape
// (DeepSeek's JSON mode does not enforce a schema).
export function conform(schema, value) {
  if (schema.type === 'object') {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const [k, sub] of Object.entries(schema.properties)) out[k] = conform(sub, v[k]);
    return out;
  }
  if (schema.type === 'array') return Array.isArray(value) ? value.map((x) => conform(schema.items, x)) : [];
  if (schema.type === 'integer' || schema.type === 'number') return Number.isFinite(Number(value)) ? Number(value) : 0;
  if (schema.enum) return schema.enum.includes(value) ? value : schema.enum[schema.enum.length > 1 ? 1 : 0];
  return value === null || value === undefined ? '' : String(value);
}

function parseJSON(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error('AI 回覆格式錯誤，請再試一次。');
}

async function askClaude({ system, messages, schema, effort, maxTokens, signal }) {
  const Anthropic = await loadSDK();
  const c = new Anthropic({ apiKey: keyOf('claude'), dangerouslyAllowBrowser: true, maxRetries: 1 });
  const model = modelOf('claude');
  const params = {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
    messages,
    ...fallbackParams(model),
  };
  if (system) params.system = system;
  const msg = await c.beta.messages.create(params, { signal });
  if (msg.stop_reason === 'refusal') throw new Error('Claude 無法處理這段內容。');
  if (msg.stop_reason === 'max_tokens') throw new Error('內容太長，回覆被截斷，請縮短後再試。');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// DeepSeek and OpenAI share the Chat Completions format.
async function askChat(id, { system, messages, schema, maxTokens, signal }) {
  const p = PROVIDERS[id];
  const model = modelOf(id);
  let sys = system || '';
  const body = { model, messages: [], max_tokens: Math.min(maxTokens, p.maxTokens) };
  if (schema) {
    if (id === 'openai') {
      body.response_format = { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } };
    } else {
      // DeepSeek JSON mode: the prompt must ask for JSON and describe the shape.
      body.response_format = { type: 'json_object' };
      sys += `\n\nReply with one JSON object only, no other text. It must follow this JSON schema exactly:\n${JSON.stringify(schema)}`;
    }
  }
  if (sys.trim()) body.messages.push({ role: 'system', content: sys.trim() });
  body.messages.push(...messages.map((m) => ({ role: m.role, content: m.content })));
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${keyOf(id)}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* not JSON */ }
    throw httpError(res.status, p.name, detail);
  }
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (!choice) throw new Error(`${p.name} 沒有回覆內容。`);
  if (choice.finish_reason === 'length') throw new Error('內容太長，回覆被截斷，請縮短後再試。');
  if (choice.finish_reason === 'content_filter') throw new Error(`${p.name} 無法處理這段內容。`);
  return (choice.message && choice.message.content || '').trim();
}

/**
 * One AI call with the provider chosen in Settings. With `schema`, the reply
 * is JSON in that shape and returned parsed.
 */
export async function ask({ system, messages, schema, effort = 'low', maxTokens = 8000, signal }) {
  const id = currentProvider();
  if (!hasAI()) throw new Error(`尚未設定 ${PROVIDERS[id].name} API 金鑰（設定 → AI）。`);
  const text = id === 'claude'
    ? await askClaude({ system, messages, schema, effort, maxTokens, signal })
    : await askChat(id, { system, messages, schema, maxTokens, signal });
  if (!schema) return text;
  const value = parseJSON(text);
  return id === 'deepseek' ? conform(schema, value) : value;
}

export async function aiTranslate(text, from, to, { signal } = {}) {
  return ask({
    system: 'You are a professional interpreter. Translate the user text faithfully and naturally, '
      + 'keeping names, numbers and business terms exact. Reply with the translation only.',
    messages: [{ role: 'user', content: `Source language: ${from === 'auto' ? 'detect it' : from}\nTarget language: ${to}\n\n${text}` }],
    effort: 'low',
    maxTokens: 4000,
    signal,
  });
}

const str = { type: 'string' };
const strArr = { type: 'array', items: str };

const enumOf = (...values) => ({ type: 'string', enum: values });

export const MINUTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'keyPoints', 'decisions', 'actionItems', 'openQuestions', 'speakers', 'englishSummary'],
  properties: {
    title: str,
    summary: str,
    keyPoints: strArr,
    decisions: strArr,
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['task', 'owner', 'ownerSource', 'dueDate', 'dueText', 'priority', 'quote'],
        properties: {
          task: str,
          owner: str,
          ownerSource: enumOf('stated', 'inferred', 'none'),
          dueDate: str,
          dueText: str,
          priority: enumOf('high', 'medium', 'low'),
          quote: str,
        },
      },
    },
    openQuestions: strArr,
    speakers: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['speaker', 'name', 'role', 'mainPoints', 'stance'],
        properties: { speaker: str, name: str, role: str, mainPoints: strArr, stance: str },
      },
    },
    englishSummary: str,
  },
};

const LANG_NAMES = { 'zh-TW': 'Traditional Chinese (Taiwan)', en: 'English', vi: 'Vietnamese', th: 'Thai', ja: 'Japanese', ko: 'Korean' };

export async function aiMinutes(transcript, { outLang = 'zh-TW', meetingDay = '', signal } = {}) {
  return ask({
    system: 'You write accurate meeting minutes from speech-to-text transcripts. Transcripts contain '
      + 'recognition errors; infer the intended words from context but never invent facts, owners or dates. '
      + 'Speaker labels such as "發言人 1" come from automatic voice grouping and may be imperfect.',
    messages: [{
      role: 'user',
      content: `Meeting date: ${meetingDay}. Write the minutes in ${LANG_NAMES[outLang] || outLang}.\n\n`
        + 'Action items are the most important part. List every commitment or request, one deliverable per item:\n'
        + '- task: what will be delivered, starting with a verb, specific enough to check later.\n'
        + '- owner: the person responsible. Use their real name when the transcript gives it; otherwise the speaker label '
        + 'of whoever committed ("我來處理", "I will") or was asked ("請 A 負責"). ownerSource = "stated" when the owner was '
        + 'said explicitly, "inferred" when you deduced it from who spoke, "none" when nobody can be identified (owner = "").\n'
        + '- dueDate: resolve relative deadlines against the meeting date (明天, 下週五, 月底, by Friday) to YYYY-MM-DD; '
        + 'empty string when no deadline was given. dueText: the original words, or "".\n'
        + '- priority: high when blocking, urgent or customer-facing; otherwise medium or low.\n'
        + '- quote: the transcript line the item comes from.\n'
        + 'In `speakers`, give one entry per speaker label; `name` is the real name or title if anyone said it '
        + '(e.g. a self-introduction or being addressed by name), else "". '
        + '`englishSummary` is a concise English version of the summary, decisions and action items.\n\n'
        + `<transcript>\n${transcript}\n</transcript>`,
    }],
    schema: MINUTES_SCHEMA,
    effort: 'medium',
    maxTokens: 16000,
    signal,
  });
}

export const SPEAKER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['labels', 'note'],
  properties: {
    labels: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'speaker'], properties: { i: { type: 'integer' }, speaker: str } } },
    note: str,
  },
};

// Suggest who said each line from content and turn-taking cues.
export async function aiDiarize(lines, speakerNames, { signal } = {}) {
  const numbered = lines.map((l, i) => `${i}\t${l.speaker || '?'}\t${l.text}`).join('\n');
  return ask({
    system: 'You assign speaker labels to transcript lines of a meeting recorded by one microphone. '
      + 'Use content cues: questions and answers, self-references, names, roles and topic hand-offs. '
      + 'Keep an existing label unless the content clearly contradicts it.',
    messages: [{
      role: 'user',
      content: `Allowed speaker labels: ${speakerNames.join(', ')}.\nLines (index, current label, text):\n${numbered}\n\n`
        + 'Return a label for every line index, plus a one-sentence note in Traditional Chinese on how confident the assignment is.',
    }],
    schema: SPEAKER_SCHEMA,
    effort: 'medium',
    maxTokens: 16000,
    signal,
  });
}

export const TUTOR_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reply', 'replyZh', 'romanization', 'feedback', 'better'],
  properties: { reply: str, replyZh: str, romanization: str, feedback: str, better: str },
};

// Role-play tutor: plays the counterpart in a scenario and corrects the learner.
export async function aiTutor({ lang, langName, scenario, turns, signal }) {
  const roman = lang === 'th' ? 'Thai romanization (RTGS with tone marks where useful)'
    : lang === 'ja' ? 'romaji' : lang === 'ko' ? 'Revised Romanization' : 'an empty string';
  const history = turns.map((t) => ({ role: t.role, content: t.content }));
  return ask({
    system: `You are a friendly ${langName} conversation partner for a Taiwanese learner. Scenario: ${scenario}. `
      + `Stay in role and reply in ${langName} with 1-3 short, natural sentences a native speaker would say, `
      + 'then keep the conversation going with a question. '
      + 'Fields: reply = your in-role line; replyZh = its Traditional Chinese translation; '
      + `romanization = ${roman} for reply; feedback = brief Traditional Chinese feedback on the learner's LAST message `
      + '(grammar, word choice, politeness for business; say what was good if it was correct); '
      + `better = a more natural ${langName} version of the learner's last message (empty string at the start).`,
    messages: history.length ? history : [{ role: 'user', content: '(start the conversation)' }],
    schema: TUTOR_SCHEMA,
    effort: 'low',
    maxTokens: 4000,
    signal,
  });
}
