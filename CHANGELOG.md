# Changelog

## 2026-10-22 · 1.3.1

- Creating "my voice" shows its progress: a status badge (not created / creating / created), a progress box with steps and elapsed seconds, a green confirmation with the creation time that plays a sample in the new voice, and a red error box with ElevenLabs' own reason and a retry button. The create button stays disabled while creating, and the interpreter's button reads 「我的聲音 ✓」 once ready.
- 建立「我的聲音」時會顯示狀態、進度與秒數；完成時綠色提示並用新聲音試唸，失敗時紅色框寫出原因並可再試一次。

## 2026-10-22 · 1.3.0

- Voice choice for read-aloud translations: female, male or my own voice for my words, female or male for the other person's. OpenAI text-to-speech when an OpenAI key is saved, otherwise device voices picked by gender (from voice names). Online voices fall back to device voices on failure, and repeated lines are replayed from a cache.
- 朗讀聲音可選：我的話用女聲、男聲或我的聲音，對方的話用女聲或男聲。有 OpenAI 金鑰用線上語音，否則依性別挑裝置語音。

- "My voice": instant voice cloning with ElevenLabs. Record about a minute of the on-screen script, confirm it is your own voice, create, use, and delete it from Settings. Recordings are converted to WAV and sent only to ElevenLabs.
- 「我的聲音」：用 ElevenLabs 即時克隆自己的聲音；錄約 1 分鐘、勾選同意後建立，可隨時刪除。

## 2026-10-22 · 1.2.0

- Interpreter auto mode no longer assumes people take turns. With an OpenAI key, utterances are cut from the microphone by voice activity and transcribed by Whisper, which detects the language of each one, so either language works in any order. Without a key, the free browser recognizer stays on Chinese (which also writes English sentences in English) and the text decides the language, instead of switching to English after every Chinese line and mishearing the next Chinese line.
- 口譯自動模式不再假設輪流說話：有 OpenAI 金鑰時，每句交給 Whisper 自動判斷語言，中英文不限順序；沒有金鑰時一直以中文收音並依文字判斷，不會再說完中文就切成英文、把下一句中文聽錯。

## 2026-10-22 · 1.1.1

- Automatic speakers are numbered 發言人 1, 2, 3…; each has a visible ✎ rename button, and the speaker tab lists every speaker with a sample line for renaming after the meeting. Before recording, the speaker area explains what will appear.
- 自動辨識的發言人改為「發言人 1、2、3…」；每位旁邊有「✎ 改名」，「發言分析」頁可一次改名並附例句。開始前顯示說明。

## 2026-10-22 · 1.1.0

- Automatic speaker separation: each recognized phrase gets a voice fingerprint (MFCC timbre averages and median pitch) from the microphone audio, grouped online during the meeting and re-grouped for the whole meeting when it ends. Tapping a speaker corrects the newest line and teaches the grouping; hand-corrected lines are never overwritten. Manual labelling stays available. Tested with a real-audio browser test of three synthetic voices.
- 自動分辨發言人：每句話依音色與音高自動分組，開會中即時判斷，結束時用整場資料重新分析；點發言人可更正最新一句，手動改過的句子不會被覆蓋。仍可切回手動標記。

- Action items now carry owner (stated / inferred / none), a calendar due date resolved from the meeting date ("下週五" → 10/30（五）) with the original words, priority and the source line. Missing owners or dates are flagged; tasks are also grouped by owner in the app, Markdown and LINE text. Real names said in the meeting replace the automatic speaker labels.
- 待辦事項列出負責人、換算成實際日期的期限（保留原話）、優先順序與出處；缺負責人或期限以紅字提示，並依負責人整理。會議中說出的真名會自動取代「發言人 1」。

- Offline notes parse deadlines (今天/明天/下週X/月底/X月X日/X號/by Friday…) and named owners ("請小王…", "Amy 負責…").
- 離線整理也能抓出日期與負責人。

- AI providers: DeepSeek (default) and OpenAI join Claude, each with its own key and model in Settings. DeepSeek uses JSON mode with the schema in the prompt and repairs the shape; OpenAI uses a strict JSON schema.
- AI 服務新增 DeepSeek（預設）與 OpenAI，可在設定切換，金鑰分開保存。

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
