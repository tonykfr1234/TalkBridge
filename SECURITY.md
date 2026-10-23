# Security Policy

## Never commit secrets

This repository must never contain real credentials or private data, including:

- DeepSeek, OpenAI, Anthropic or ElevenLabs API keys (`sk-…`, `sk-ant-…`) or any other API keys;
- GitHub personal access tokens;
- cookies, browser/session exports, authentication headers;
- `.env` files or credential JSON files;
- meeting recordings, transcripts or exported minutes.

The app stores each AI key only in the viewer's own browser (`localStorage`) and sends it only to that provider (`api.deepseek.com`, `api.openai.com` or `api.anthropic.com`). No key is ever part of the repository or of the deployed site: the site is public, so any key in its code could be copied and used by anyone.

`scripts/security_scan.py` runs in CI on every push and pull request and fails if it finds key-shaped strings or private file types.

## Data handled by the app

| Data | Where it goes |
| --- | --- |
| Microphone audio for recognition | The browser's speech service (Chrome: Google; Safari: Apple) |
| Recognized text | The translation service (Google Translate endpoint, MyMemory) or the chosen AI provider |
| Voice fingerprints for speaker separation | Computed and kept on the device (stored with the meeting) |
| Meeting audio, transcripts, notes | IndexedDB on the device; leaves only when the user exports or shares |
| Voice sample for "my voice" | ElevenLabs, with the user's own key, only after the user confirms it is their own voice; deletable from the app |
| Text read aloud | OpenAI text-to-speech or ElevenLabs when chosen, otherwise the device's own voices |
| Transcript sent for AI minutes | The chosen AI provider (DeepSeek, OpenAI or Anthropic), with the user's own key |

## Donation details

`donate.json` holds the bank account and LINE Pay details shown on the public donation page; they are public by design. `donors.json` lists only supporters' chosen nicknames and messages, never amounts or account numbers. The thank-you clip is made in the supporter's browser; nothing is uploaded.

## Reporting a vulnerability

Open a GitHub issue without sensitive details and ask for a private contact, or use GitHub's private vulnerability reporting if enabled. Do not include real keys, recordings or transcripts in reports.
