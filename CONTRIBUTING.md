# Contributing

Contributions are welcome. Keep changes focused and testable.

Before opening a pull request:

1. Do not commit credentials, recordings or real meeting transcripts.
2. Run `python3 scripts/security_scan.py .`.
3. Run `npm test` (unit tests) and `npm run test:e2e` (headless Chromium; needs `npm install`).
4. If the interface changed, run `npm run demo` to regenerate `docs/media/` (screenshots, MP4 and GIF), look at every image, and check the phone layout in light and dark themes.
5. Run `python3 scripts/update_checksums.py` so `SHA256SUMS.txt` matches the committed files.

The browser test needs no microphone, network or API key: it replaces the Web Speech API with a scripted recognizer, uses Chromium's fake audio device for recording, and mocks the translation service and the Anthropic API. It checks the request shape sent to Claude (model, adaptive thinking, structured output, refusal fallback, browser-access header).

## Practice content

Phrases live in `js/practice-data.js`. Every row needs Chinese, English, Vietnamese, Thai and Thai romanization; mark questions so the Thai female form uses คะ. Have a native speaker check new Vietnamese or Thai lines. Keep the scenario count and the per-language guides aligned with the README.

## Documentation

Keep the English and Traditional Chinese READMEs and the user guide aligned when behavior changes; the other README languages summarize them. The app interface is Traditional Chinese.

## Vendored SDK

`js/vendor/anthropic-sdk.js` is a browser bundle of the official `@anthropic-ai/sdk`. Rebuild it with `scripts/build_vendor.sh` (set `SDK_VERSION` to change version) rather than editing it.

## Generated demo media

Run `npm run demo` with Playwright's Chromium and ffmpeg built with libx264 and libflite. It regenerates every file in `docs/media/`: ten PNG screenshots (interpreter, subtitles, meeting transcript, speakers, action items, practice, settings, my-voice card, Android app, phone in dark theme), a silent H.264 MP4 walkthrough of about 90 seconds and a GIF preview made from it.

The script runs the real app with scripted speech recognition, sample translations and a mocked AI provider; no key, account or network service is used. The meeting scene plays three synthetic flite voices into Chromium's fake microphone so speaker separation runs on real audio. Captions are Traditional Chinese/English. Keep the README note that this is a simulated walkthrough, not a recording of a real meeting or an accuracy benchmark.
