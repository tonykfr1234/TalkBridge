# Architecture

TalkBridge is a static web app: plain ES modules, no build step, no server of its own. Any static host that serves HTTPS works (GitHub Pages is configured in `.github/workflows/pages.yml`).

```text
index.html ── css/app.css
   └─ js/app.js            view switching, service worker, support banner
        ├─ views/talk.js     two-way interpreter
        ├─ views/subs.js     translated captions
        ├─ views/meet.js     recording, transcript, speakers, notes, export/share
        ├─ views/learn.js    phrase drills, scoring, AI role-play, guides
        └─ views/settings.js key/model, engine, voice, theme, support matrix
   shared modules
        ├─ speech.js         Recognizer (Web Speech API, auto-restart), speak(), AudioRecorder, level meter
        ├─ translate.js      Google endpoint → MyMemory → Claude, with an in-memory cache
        ├─ ai.js             Claude calls through the bundled Anthropic SDK
        ├─ textkit.js        pure: scoring, exports (TXT/SRT/MD/share text), stats, offline notes
        ├─ langs.js          language table, script detection, pair-side guess
        ├─ practice-data.js  scenarios, phrases, Thai female forms, study guides
        ├─ store.js          localStorage settings/progress, IndexedDB meetings
        └─ ui.js             DOM helpers, download, LINE share URL, Web Share, wake lock
sw.js                       offline cache of the app shell
js/vendor/anthropic-sdk.js  esbuild bundle of @anthropic-ai/sdk (scripts/build_vendor.sh)
```

## Speech

`Recognizer` wraps `SpeechRecognition` with `continuous` and `interimResults`, restarts after the browser's automatic stops, and gives up after repeated errors. Only one recognizer can run at a time in a browser, so leaving a view stops its recognizer; a running meeting keeps recording and the app warns when another view is opened.

While a translation is read aloud the interpreter stops recognition and restarts it afterwards, so the app does not hear and translate its own voice.

## Deciding who spoke (auto interpreter)

1. `guessPairSide()` compares the transcript's script (Han, Latin, Thai, Hangul, Kana, Vietnamese diacritics) with the two chosen languages.
2. If the script cannot decide, the translator's detected source language decides.
3. Otherwise the side the recognizer was listening for wins.

After each phrase the recognizer switches to the other person's language, because conversations alternate.

## Meetings

Segments are `{ t, end, speaker, text, tr }` with times relative to the recording clock, which excludes paused time. The meeting object (with the audio `Blob`) is saved to IndexedDB 0.8 s after each change and on stop. Exports are generated from the same object by `textkit.js`.

Speaker labels are manual: one microphone gives no reliable voice separation in the browser. `aiDiarize()` asks Claude to relabel lines from content cues and only applies labels from the meeting's own speaker list.

## Claude

`ai.js` loads the bundled SDK lazily and creates a client with the viewer's key (`dangerouslyAllowBrowser: true`, which sends the browser-access header). Every call uses:

- `model` from Settings (default `claude-opus-5-5`);
- `thinking: { type: 'adaptive' }` and `output_config.effort` (low for translation and tutoring, medium for minutes and speaker labels);
- `output_config.format` with a strict JSON schema for minutes, speaker labels and the tutor;
- the server-side refusal fallback (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`) on Opus 5.5 and Sonnet 5.5;
- checks for `stop_reason` `refusal` and `max_tokens` before reading the text.

The role-play history is kept by the page and always alternates user/assistant.

## Testing

- `tests/unit.test.mjs` covers the pure modules, the translation parsers, practice data integrity, the Thai female forms, the streak logic and schema strictness.
- `tests/e2e/browser.mjs` runs the real app in headless Chromium with a scripted `SpeechRecognition`, Chromium's fake microphone for `MediaRecorder`, and mocked translation and Anthropic endpoints. It walks through every view, checks downloads and the Claude request shape, reloads to confirm persistence, and checks phone layouts in light and dark themes for horizontal overflow.
