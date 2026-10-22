<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a><br>
  <a href="README.de.md">Deutsch</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.vi.md">Tiếng Việt</a> · <a href="README.id.md">Bahasa Indonesia</a> · <a href="README.it.md">Italiano</a>
</p>

<p align="center"><img src="assets/icon-192.png" width="112" alt="TalkBridge icon"></p>
<h1 align="center">Live Interpreter, Translated Subtitles, Meeting Minutes and Language Practice</h1>
<p align="center">TalkBridge 語橋 · Installable web app (PWA) for Chrome, Edge, Android and iPhone</p>
<p align="center">
  <img src="https://img.shields.io/badge/platform-Web%20%7C%20Android%20%7C%20iOS%20%7C%20Windows%20%7C%20macOS-0b7480" alt="Platforms">
  <img src="https://img.shields.io/badge/languages-22-7a4b9a" alt="22 languages">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
</p>
<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#features">Features</a> · <a href="#screenshots">Screenshots</a> · <a href="#how-it-works">How it works</a> · <a href="#faq">FAQ</a> · <a href="#documentation">Documentation</a>
</p>

```text
Open https://tonykfr1234.github.io/TalkBridge/ in Chrome or Edge → allow the microphone → start talking
```

---

TalkBridge turns a phone or laptop into a pocket interpreter. Speak Chinese and it says it in English; the other person answers in English and it says it in Chinese. Put the device next to a computer speaker and it captions videos and online meetings in your language. In meetings it records audio, writes a live transcript with speaker labels and a parallel translation, then produces minutes, action items and an English summary you can export or send through LINE. A practice mode drills business and travel phrases in English, Vietnamese and Thai with pronunciation scoring, and an AI role-play partner corrects you as you talk.

Everything runs in the browser. Meetings and progress stay on the device. AI features are optional and use your own API key for DeepSeek (default), OpenAI or Claude.

The 12 README languages translate the documentation. The application interface currently uses Traditional Chinese.

<a id="quick-start"></a>
## Quick start

1. Open the hosted app (link above) in **Chrome or Edge** on Windows, macOS or Android, or **Safari** on iPhone.
2. Allow the microphone when asked. Choose your language and the other person's language on the **口譯 (Interpreter)** tab.
3. Press **開始自動口譯 (Start)** and speak. Translations appear as chat bubbles and are read aloud.
4. Optional: install it (**Settings → 安裝到主畫面**, or the browser's *Install app* menu) so it opens full-screen like a native app.
5. Optional: in **設定 (Settings)** choose DeepSeek, OpenAI or Claude and paste your API key to enable AI minutes, real names for speakers, AI translation and the role-play tutor.

**Run your own copy:** clone the repository and serve the folder over HTTPS or `localhost` (microphone access requires a secure origin):

```bash
git clone https://github.com/tonykfr1234/TalkBridge.git
cd TalkBridge
python3 -m http.server 8080      # then open http://localhost:8080
```

The included GitHub Actions workflow publishes the app to GitHub Pages on every push to `main`.

<a id="features"></a>
## Features

| Feature | Behavior |
| --- | --- |
| Two-way interpreter | **Auto** mode detects which side is speaking (by script, then by the translator's language detection), translates to the other language, reads it aloud, then listens for the other person. **Push-to-talk** mode gives each person a button. Typing also works. |
| 22 languages | Chinese (Taiwan / Simplified / Cantonese), English, Vietnamese, Thai, Japanese, Korean, Indonesian, Malay, Filipino, Khmer, Burmese, Hindi, Spanish, French, German, Italian, Portuguese, Russian, Arabic, Turkish |
| Subtitle mode | Large broadcast-style captions with the original line above. Interim words are translated every 0.7 s so captions keep up with the speaker. Full-screen, font size, top/bottom position, `.srt` export |
| Meeting minutes | Live transcript with timestamps, optional parallel translation (e.g. Chinese → English), audio recording with a level meter, pause/resume, autosave to the device |
| Automatic speakers | Each recognized phrase gets a voice fingerprint (timbre and pitch) from the microphone audio and is grouped with similar phrases, so lines are labelled 發言人 1, 2, 3… without tapping anything; tap ✎ next to a speaker (or use the list on the speaker tab) to give them a real name. When the meeting ends the whole meeting is grouped again. Tap a speaker to correct the newest line; corrections teach the grouping and are never overwritten. Manual mode (keys **1–9**) is still available |
| Minutes and action items | AI minutes: summary, key points, decisions, open questions, per-speaker roles and an English summary. Every action item has an owner, a due date resolved to the calendar ("下週五" → 10/30 Fri) with the original words, a priority and the source line; missing owners or dates are flagged in red. A second list groups tasks by owner. Real names said in the meeting ("我是王經理") replace the automatic labels. Offline mode finds likely tasks, owners and dates without AI |
| AI providers | DeepSeek (default, `deepseek-chat`), OpenAI (`gpt-4.1-mini` by default, strict JSON schema) or Claude (Opus 5.5 by default through the official SDK). Each key is stored only in this browser |
| Export and share | `.txt` transcript, `.md` minutes, `.srt` subtitles, `.json`, original audio. **Share** opens the phone's share sheet so LINE receives the files; **LINE** button sends the summary text |
| Language practice | 8 scenarios × 6 phrases (meetings, negotiation, calls, factory, business dinner, travel, shopping, introductions) in English, Vietnamese and Thai with Thai romanization and male/female polite forms; Japanese, Korean and Indonesian generated on demand |
| Pronunciation scoring | Play, slow play, then speak: the recognizer's transcript is aligned with the target sentence, scored 0–100 and missing words are marked. ≥ 85 marks the phrase as learned; a daily streak tracks practice |
| AI role-play | The AI plays the counterpart in the chosen scenario, replies in the target language with a Chinese translation and romanization, and corrects your last sentence |
| Study guides | Tone charts and practical tips per language (Vietnamese six tones and pronouns, Thai tones and polite particles, English linking sounds, Japanese/Korean politeness) |

A single microphone cannot tell voices apart, so speaker labels come from you. The AI suggestion is based on what was said, not on voiceprints.

<a id="screenshots"></a>
## Screenshots

| Interpreter | Subtitles |
| --- | --- |
| <img src="docs/media/talk.png" alt="Two-way interpreter" width="420"> | <img src="docs/media/subtitles.png" alt="Translated subtitles" width="420"> |
| **Meeting minutes** | **Practice** |
| <img src="docs/media/meeting.png" alt="Meeting minutes" width="420"> | <img src="docs/media/practice.png" alt="Phrase practice" width="420"> |

<p align="center"><img src="docs/media/speakers.png" alt="Speakers detected by voice, renamed with ✎" width="640"></p>

<p align="center"><img src="docs/media/action-items.png" alt="Action items: owner, due date, priority, missing items flagged" width="640"></p>

<p align="center"><img src="docs/media/phone-dark.png" alt="Phone, dark theme" width="220"></p>

Screenshots come from the automated browser test with simulated speech and sample translations (`npm run shots`).

<a id="how-it-works"></a>
## How it works

```text
microphone ─► Web Speech API (browser) ─► text ─► translation ─► bubble / caption / transcript
                                                    │                 │
                                   Google (free) → MyMemory → Claude  └─► speechSynthesis (read aloud)
meeting audio ─► MediaRecorder ─► IndexedDB (this device) ─► export / share sheet / LINE
transcript ─► DeepSeek / OpenAI / Claude (your key, JSON) ─► minutes, owners, due dates, speaker names
```

- **Recognition** uses the browser's built-in speech service. Chrome sends audio to Google's recognizer, so it needs a connection. The recognizer restarts automatically after browser timeouts.
- **Translation** tries the free Google endpoint, falls back to MyMemory, then to Claude if a key is set. Choose **Claude AI translation** in Settings for more natural business wording.
- **AI** calls go to the provider chosen in Settings. DeepSeek and OpenAI use their Chat Completions APIs (DeepSeek in JSON mode with the schema in the prompt, repaired to shape; OpenAI with a strict JSON schema). Claude uses the official Anthropic TypeScript SDK, bundled in `js/vendor/`, with structured outputs, adaptive thinking and server-side refusal fallback.
- **Speakers** are separated on the device: MFCC timbre averages and median pitch per phrase, compared in units of the meeting's own spread, grouped online during the meeting and by average-linkage clustering at the end. Audio never leaves the browser for this.
- **Storage**: settings and practice progress in `localStorage`, meetings and audio in IndexedDB. Nothing is uploaded except the text sent for translation and, if you enable it, to Claude.

<a id="faq"></a>
## FAQ

**Which browsers work?** Chrome and Edge on Windows, macOS and Android have the best recognition. iPhone and iPad need Safari with Dictation enabled. Firefox has no speech recognition; typing and practice playback still work.

**How do I caption computer audio without a second device?** On Windows 11/10 press Win+R, run `mmsys.cpl`, open the Recording tab, right-click the list, choose *Show Disabled Devices* and enable *Stereo Mix*; then pick it as the microphone at `chrome://settings/content/microphone`. Many laptops have no Stereo Mix: install VB-Audio Virtual Cable instead. On macOS use BlackHole. Step-by-step instructions are in the [user guide](docs/USER_GUIDE.zh-TW.md).

**Why does a voice not play?** The device lacks a voice for that language. Add one in Windows Settings → Time & language → Speech, or Android Settings → Text-to-speech.

**Does auto mode always pick the right speaker?** It decides by script first (Chinese characters vs. Latin vs. Thai), then by the translator's detected language, and expects turns to alternate. Two languages in the same script (e.g. English and Spanish) rely on detection alone; use push-to-talk for those.

**Is my API key safe?** It stays in this browser's storage and is sent only to the provider you chose (`api.deepseek.com`, `api.openai.com` or `api.anthropic.com`). The app never ships with a key built in: anything in a public site's code can be copied by anyone. Use a key with a spending limit and clear it on shared computers.

**How accurate is automatic speaker separation?** In the test conversation (three synthetic voices, two of them similar men) every line was assigned correctly, live and after the meeting. Real rooms are harder: similar voices, people talking over each other, or one person far from the microphone can merge or split speakers. Correct a line once and later lines follow.

<a id="documentation"></a>
## Documentation

- [User guide (Traditional Chinese)](docs/USER_GUIDE.zh-TW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Development

```bash
npm install             # Playwright, used only by the browser test
npm test                # unit tests (node:test)
npm run test:e2e        # headless Chromium with simulated speech, mocked translation and AI providers
npm run test:voices     # automatic speaker separation on real synthetic voices (needs ffmpeg with flite)
npm run shots           # same test, also refreshes docs/media screenshots
python3 scripts/security_scan.py .
python3 scripts/generate_icon.py
scripts/build_vendor.sh # rebuild the bundled Anthropic SDK
```

No build step: the app is plain ES modules.

## Security

Never commit API keys. See [SECURITY.md](SECURITY.md).

## License

MIT © 2026 Tony Hsu and contributors. The bundled Anthropic SDK is MIT-licensed by Anthropic, PBC (`js/vendor/anthropic-sdk.LICENSE.txt`).
