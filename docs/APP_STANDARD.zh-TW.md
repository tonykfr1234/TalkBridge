# Tony 的 App 共用規範：關於、更新說明、請喝咖啡

所有 Tony 的 App（網頁、Android、iOS、桌面）都要有一致的「關於」與贊助入口。新 App 或改版時照這份清單做。

## 1. 「關於」頁面（App 內）

| 項目 | 內容 |
| --- | --- |
| App 名稱與圖示 | 與商店／README 一致 |
| 版本 | 目前安裝的版本（Android 用 versionName，網頁用 CHANGELOG 最新版本） |
| 製作者 | **Build by Tony · 2026 年製作**（年份為第一版製作年份） |
| 連結 | 網頁版（若有）、下載最新版、GitHub 原始碼 |
| 請 Tony 喝咖啡 | 按鈕連到共用贊助頁 <https://tonykfr1234.github.io/TalkBridge/donate.html>，並顯示目前贊助人數 |
| 更新進度 | 列出最近 10 版以上的更新說明，**從 GitHub 讀最新 CHANGELOG**，讓舊版 App 也看得到最新進度；離線時用 App 內附的 CHANGELOG；有新版時提示更新 |

TalkBridge 的實作可直接參考：`js/support.js`（讀取與解析）、`js/views/about.js`（畫面）。

## 2. 更新說明（每次 Release）

- 每一版在 `CHANGELOG.md` 加一節：`## YYYY-MM-DD · x.y.z`，每項改動英文一行、繁中一行。
- GitHub Release 的說明由 CHANGELOG 最新一節自動產生（參考 `scripts/release_notes.mjs`），內容包含：
  - 更新內容（繁中）與 What's new（英文）
  - 安裝方式
  - **Build by Tony · 2026 年製作**
  - ☕ 請 Tony 喝一杯咖啡 連結
- README 頂端放最新版本徽章與下載連結；README 末段放「支持」區塊（製作者、贊助連結、贊助人數徽章）。

## 3. 請 Tony 喝咖啡（共用一個贊助頁與名單）

- 所有 App 都連到同一個贊助頁與同一份名單，人數不分 App：
  - 贊助頁：<https://tonykfr1234.github.io/TalkBridge/donate.html>
  - 收款設定：`donate.json`（銀行名稱、代碼、帳號、戶名、LINE Pay 連結／ID／QR 碼）
  - 名單：`donors.json`，只列出 **Tony 確認入帳** 的贊助者
- 贊助流程：選金額 → 銀行轉帳或 LINE Pay → 填暱稱 → 立即產生專屬感謝影片（含音效、第幾位贊助者）→ 用 LINE 通知 Tony 確認。
- Tony 確認收到後：`python3 scripts/add_donor.py "暱稱" --message "留言"`，commit 上 GitHub；所有 App 與 README 徽章的人數會一起更新。

## 4. GitHub repository 規格

與 superlive-ai-monitor、Android_wifi-spectrum 相同：12 種語言 README、中英對照 CHANGELOG、CONTRIBUTING、SECURITY、MIT LICENSE、SHA256SUMS.txt、`docs/` 使用說明、`docs/media` 示範截圖／MP4／GIF、GitHub Actions 安全掃描與測試，推送 `main` 自動部署與發佈。
