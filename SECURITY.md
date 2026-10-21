# Security Policy

## Never commit secrets

This repository must never contain real credentials or private data, including:

- Anthropic API keys (`sk-ant-…`) or any other API keys;
- GitHub personal access tokens;
- cookies, browser/session exports, authentication headers;
- `.env` files or credential JSON files;
- meeting recordings, transcripts or exported minutes.

The app stores an Anthropic API key only in the viewer's own browser (`localStorage`) and sends it only to `api.anthropic.com`. It is never part of the repository or of the deployed site.

`scripts/security_scan.py` runs in CI on every push and pull request and fails if it finds key-shaped strings or private file types.

## Data handled by the app

| Data | Where it goes |
| --- | --- |
| Microphone audio for recognition | The browser's speech service (Chrome: Google; Safari: Apple) |
| Recognized text | The translation service (Google Translate endpoint, MyMemory) or Claude when chosen |
| Meeting audio, transcripts, notes | IndexedDB on the device; leaves only when the user exports or shares |
| Transcript sent for AI minutes | Anthropic API, with the user's own key |

## Reporting a vulnerability

Open a GitHub issue without sensitive details and ask for a private contact, or use GitHub's private vulnerability reporting if enabled. Do not include real keys, recordings or transcripts in reports.
