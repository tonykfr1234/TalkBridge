// Supported languages. `code` is the translation code, `locale` is used for
// speech recognition and text-to-speech.
export const LANGS = [
  { code: 'zh-TW', name: '中文（台灣）', native: '中文', locale: 'zh-TW', flag: 'TW' },
  { code: 'en', name: '英文', native: 'English', locale: 'en-US', flag: 'US' },
  { code: 'vi', name: '越南文', native: 'Tiếng Việt', locale: 'vi-VN', flag: 'VN' },
  { code: 'th', name: '泰文', native: 'ภาษาไทย', locale: 'th-TH', flag: 'TH' },
  { code: 'ja', name: '日文', native: '日本語', locale: 'ja-JP', flag: 'JP' },
  { code: 'ko', name: '韓文', native: '한국어', locale: 'ko-KR', flag: 'KR' },
  { code: 'id', name: '印尼文', native: 'Bahasa Indonesia', locale: 'id-ID', flag: 'ID' },
  { code: 'ms', name: '馬來文', native: 'Bahasa Melayu', locale: 'ms-MY', flag: 'MY' },
  { code: 'tl', name: '菲律賓文', native: 'Filipino', locale: 'fil-PH', flag: 'PH' },
  { code: 'km', name: '高棉文', native: 'ភាសាខ្មែរ', locale: 'km-KH', flag: 'KH' },
  { code: 'my', name: '緬甸文', native: 'မြန်မာ', locale: 'my-MM', flag: 'MM' },
  { code: 'hi', name: '印地文', native: 'हिन्दी', locale: 'hi-IN', flag: 'IN' },
  { code: 'zh-CN', name: '簡體中文', native: '简体中文', locale: 'zh-CN', flag: 'CN' },
  { code: 'yue', name: '粵語（廣東話）', native: '粵語', locale: 'yue-Hant-HK', flag: 'HK', translateAs: 'zh-TW' },
  { code: 'es', name: '西班牙文', native: 'Español', locale: 'es-ES', flag: 'ES' },
  { code: 'fr', name: '法文', native: 'Français', locale: 'fr-FR', flag: 'FR' },
  { code: 'de', name: '德文', native: 'Deutsch', locale: 'de-DE', flag: 'DE' },
  { code: 'it', name: '義大利文', native: 'Italiano', locale: 'it-IT', flag: 'IT' },
  { code: 'pt', name: '葡萄牙文', native: 'Português', locale: 'pt-BR', flag: 'BR' },
  { code: 'ru', name: '俄文', native: 'Русский', locale: 'ru-RU', flag: 'RU' },
  { code: 'ar', name: '阿拉伯文', native: 'العربية', locale: 'ar-SA', flag: 'SA', rtl: true },
  { code: 'tr', name: '土耳其文', native: 'Türkçe', locale: 'tr-TR', flag: 'TR' },
];

export const byCode = (code) => LANGS.find((l) => l.code === code) || LANGS[0];

// Translation-service code for a language (Cantonese recognition is
// translated as Traditional Chinese).
export const translateCode = (code) => byCode(code).translateAs || code;

// Compare a detected language code ("zh-TW", "zh", "en", "vi") with one of ours.
export function sameLang(detected, code) {
  if (!detected || !code) return false;
  const a = detected.toLowerCase();
  const b = translateCode(code).toLowerCase();
  if (a === b) return true;
  const base = (s) => s.split('-')[0];
  if (base(a) === 'zh' && base(b) === 'zh') return true;
  if ((a === 'fil' || a === 'tl') && (b === 'fil' || b === 'tl')) return true;
  return base(a) === base(b);
}

// Guess the writing system of a piece of text. Used when the recognizer for
// one language transcribes speech in another (Chrome's Mandarin recognizer
// often writes English words in Latin letters, for example).
export function detectScript(text) {
  const counts = { han: 0, latin: 0, thai: 0, hangul: 0, kana: 0, vietnamese: 0, other: 0 };
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0x4e00 && c <= 0x9fff) counts.han++;
    else if ((c >= 0x3040 && c <= 0x30ff)) counts.kana++;
    else if (c >= 0xac00 && c <= 0xd7af) counts.hangul++;
    else if (c >= 0x0e00 && c <= 0x0e7f) counts.thai++;
    else if (/[ăâđêôơưàảãạằẳẵặầẩẫậèẻẽẹềểễệìỉĩịòỏõọồổỗộờởỡợùủũụừửữựỳỷỹỵ]/i.test(ch)) { counts.vietnamese++; counts.latin++; }
    else if (/[a-z]/i.test(ch)) counts.latin++;
    else if (/\S/.test(ch) && !/[\d\p{P}\p{S}]/u.test(ch)) counts.other++;
  }
  if (counts.kana > 0) return 'ja';
  if (counts.hangul > counts.han) return 'ko';
  if (counts.thai > 0 && counts.thai >= counts.latin) return 'th';
  if (counts.han > 0 && counts.han >= counts.latin / 3) return 'zh';
  if (counts.vietnamese >= 2 || (counts.vietnamese > 0 && counts.latin < 12)) return 'vi';
  if (counts.latin > 0) return 'latin';
  return 'unknown';
}

// Which language of a pair the text most likely belongs to, from its script
// alone. Returns the code, or null when the script cannot decide.
export function guessPairSide(text, a, b) {
  const s = detectScript(text);
  const scriptOf = (code) => {
    const base = translateCode(code).split('-')[0];
    if (base === 'zh' || code === 'yue') return 'zh';
    if (['ja', 'ko', 'th', 'vi'].includes(base)) return base;
    if (['km', 'my', 'hi', 'ar', 'ru'].includes(base)) return 'other';
    return 'latin';
  };
  const sa = scriptOf(a), sb = scriptOf(b);
  if (sa === sb) return null;
  if (s === sa || (s === 'latin' && sa === 'vi' && sb !== 'latin')) return a;
  if (s === sb || (s === 'latin' && sb === 'vi' && sa !== 'latin')) return b;
  if (s === 'vi' && sa === 'latin') return a;
  if (s === 'vi' && sb === 'latin') return b;
  return null;
}
