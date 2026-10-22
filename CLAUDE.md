# TalkBridge 工作規則（給 Claude）

- 所有回覆使用繁體中文。
- **每次修改完成後都要自動上傳 GitHub**，不需要再問：
  1. 跑測試：`python3 scripts/security_scan.py .`、`npm test`、`npm run test:e2e`；動到聲音或發言人相關程式時再跑 `npm run test:voices`（需要含 flite 的 ffmpeg）。動到 `android/` 的 Kotlin 時，至少確認能編譯。
  2. 使用者看得到的修改要更新 `CHANGELOG.md`（英文＋繁中各一段），並把 `package.json` 的 `version` 加一個小版號；`sw.js` 的 `VERSION` 一起改。
  3. `python3 scripts/update_checksums.py` 更新 `SHA256SUMS.txt`。
  4. commit 後 `git push origin main`。
  5. 等 GitHub Actions 的 Security Scan and Tests、Deploy to GitHub Pages、Android App 都完成，確認成功再回報；失敗就修好再推。
- 網頁在 repository 根目錄；Android App（`android/`）建置時會把網頁打包進 APK，所以網頁修正會自動進到下一版 APK。推到 `main` 會自動部署網站並發佈新的 APK Release。
- 不要把任何 API 金鑰、簽章金鑰（`.jks`）或 `keystore.properties` 放進 repository。
- 使用者介面文字用繁體中文；README 有 12 種語言，英文與繁中版要保持一致。
