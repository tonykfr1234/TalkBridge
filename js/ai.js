// Claude features: AI translation, meeting minutes, speaker analysis and the
// role-play language tutor. Uses the official Anthropic TypeScript SDK
// (bundled in js/vendor) with the viewer's own API key, which stays in this
// browser's localStorage and is sent only to api.anthropic.com.
import { settings } from './store.js';

let sdkPromise = null;
function loadSDK() {
  if (!sdkPromise) sdkPromise = import('./vendor/anthropic-sdk.js').then((m) => m.Anthropic);
  return sdkPromise;
}

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5（預設，最準確）' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（較快、較省）' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（最快、最省）' },
];

export const hasAI = () => !!(settings.get('apiKey') || '').trim();

async function client() {
  const Anthropic = await loadSDK();
  return new Anthropic({ apiKey: settings.get('apiKey').trim(), dangerouslyAllowBrowser: true, maxRetries: 1 });
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
  if (status === 401) return 'API 金鑰無效，請到「設定」重新貼上。';
  if (status === 403) return '這把 API 金鑰沒有使用此模型的權限。';
  if (status === 429) return '請求太頻繁或額度不足，請稍後再試。';
  if (status === 529 || (status >= 500 && status < 600)) return 'Claude 服務暫時忙碌，請稍後再試。';
  if (e && e.name === 'AbortError') return '已取消。';
  if (e && /fetch|network/i.test(e.message || '')) return '連不上 Claude，請檢查網路。';
  return (e && e.message) || 'AI 呼叫失敗。';
}

function textOf(msg) {
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

/**
 * One Messages API call. With `schema`, Claude's reply is constrained to that
 * JSON schema and returned parsed.
 */
export async function ask({ system, messages, schema, effort = 'low', maxTokens = 8000, signal }) {
  if (!hasAI()) throw new Error('尚未設定 Claude API 金鑰（設定 → AI）。');
  const c = await client();
  const model = settings.get('model') || 'claude-opus-5-5';
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
  const text = textOf(msg);
  if (!schema) return text;
  try { return JSON.parse(text); } catch { throw new Error('AI 回覆格式錯誤，請再試一次。'); }
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
        type: 'object', additionalProperties: false, required: ['task', 'owner', 'due'],
        properties: { task: str, owner: str, due: str },
      },
    },
    openQuestions: strArr,
    speakers: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['speaker', 'role', 'mainPoints', 'stance'],
        properties: { speaker: str, role: str, mainPoints: strArr, stance: str },
      },
    },
    englishSummary: str,
  },
};

const LANG_NAMES = { 'zh-TW': 'Traditional Chinese (Taiwan)', en: 'English', vi: 'Vietnamese', th: 'Thai', ja: 'Japanese', ko: 'Korean' };

export async function aiMinutes(transcript, { outLang = 'zh-TW', signal } = {}) {
  return ask({
    system: 'You write accurate meeting minutes from speech-to-text transcripts. Transcripts contain '
      + 'recognition errors; infer the intended words from context but never invent facts, owners or dates. '
      + 'When something is not stated, write an empty string. Speaker labels may be imperfect: in `speakers`, '
      + 'describe each labelled speaker from what they said.',
    messages: [{
      role: 'user',
      content: `Write the minutes in ${LANG_NAMES[outLang] || outLang}. `
        + '`englishSummary` is a concise English version of the summary and key points for international colleagues.\n\n'
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
