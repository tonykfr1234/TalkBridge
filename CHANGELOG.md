# Changelog

## 2026-10-22 · 1.0.1

- Rewrite the system-audio instructions for Windows 11: open the Sound dialog with `mmsys.cpl` (or Settings → System → Sound → More sound settings), show disabled devices, enable Stereo Mix and pick it in Chrome's microphone settings; step-by-step VB-Audio Virtual Cable setup, including "Listen to this device", for PCs without Stereo Mix.
- 系統聲音說明改為 Windows 11 找得到的路徑：`mmsys.cpl`（或 設定 → 系統 → 音效 → 更多音效設定）、顯示已停用的裝置、啟用立體聲混音，並在 Chrome 麥克風設定中選取；沒有立體聲混音時的 VB-Cable 完整步驟（含「接聽此裝置」）。

- Interpreter: when the script decides the language (Chinese characters vs. Latin letters, Thai…), trust it and translate from that language. A short Chinese phrase misdetected by the translation service was treated as the other person's speech and "translated" into Chinese, so no English was produced or read aloud.
- 口譯修正：能從文字判斷語言時（中文字、拉丁字母、泰文…）以文字為準，並明確指定來源語言翻譯。之前短句中文若被翻譯服務誤判，會被當成對方說的話、翻回中文，導致沒有英文、也沒有唸出來。

## 2026-10-21 · 1.0.0

- First release of TalkBridge 語橋 as an installable web app (PWA).
- 第一版：可安裝的網頁 App。

- Two-way interpreter with automatic speaker-language detection (script first, then the translator's detected language) and push-to-talk mode; translations are read aloud while listening pauses so the app does not translate its own voice. 22 languages.
- 雙向口譯：自動判斷說話語言或按鍵輪流；朗讀翻譯時暫停收音，避免翻到自己的聲音。支援 22 種語言。

- Subtitle mode for audio from a nearby speaker or a virtual audio device: interim words translated every 0.7 s, full-screen captions, adjustable size and position, `.srt` export.
- 字幕模式：放在喇叭旁或用虛擬音效線，說話中每 0.7 秒更新翻譯；全螢幕、字級、置頂、匯出 `.srt`。

- Meeting minutes: live transcript with timestamps, parallel translation, audio recording with level meter, pause/resume, speaker labels with keys 1–9 and renaming, inline editing, autosave to IndexedDB, history.
- 會議記錄：即時逐字稿、同步翻譯、錄音、暫停、數字鍵切換發言人、逐句修改、自動存檔與歷史清單。

- Notes: Claude minutes (summary, key points, decisions, action items, open questions, speaker roles, English summary) through structured output; offline extraction without AI; AI speaker-label suggestions; talk-share bars.
- 重點備忘：Claude 結構化會議記錄與英文摘要、離線整理、AI 發言人建議、發言比例。

- Export `.txt`, `.md`, `.srt`, `.json` and the original audio with ASCII file names; share files through the system share sheet (LINE on phones) or send the summary with LINE's share URL.
- 匯出 `.txt`／`.md`／`.srt`／`.json`／錄音檔；手機系統分享到 LINE，或用 LINE 分享網址傳送重點。

- Practice: 8 business and travel scenarios × 6 phrases in English, Vietnamese and Thai (romanization, male/female Thai forms), Japanese/Korean/Indonesian generated on demand; pronunciation scoring with word alignment, learned phrases and daily streak; Claude role-play tutor with corrections; per-language study guides.
- 語言練習：8 個情境 × 6 句、發音評分與錯字標示、熟練度與連續天數、AI 情境對話、各語言學習方法。

- Claude via the official Anthropic TypeScript SDK (bundled), default model Claude Opus 5.5 with adaptive thinking and server-side refusal fallback; Sonnet 5.5 and Haiku 5.5 selectable.
- 透過官方 Anthropic SDK 呼叫 Claude，預設 Claude Opus 5.5，可選 Sonnet 5.5／Haiku 5.5。

- Unit tests (node:test) and an end-to-end Chromium test with simulated speech, fake microphone and mocked translation/Claude; GitHub Pages deployment and secret scan in CI.
- 單元測試與端對端瀏覽器測試；GitHub Pages 自動部署與機密掃描。
