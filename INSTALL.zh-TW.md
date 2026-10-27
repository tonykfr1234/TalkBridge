# TalkBridge 語橋：安裝與使用

## 直接開啟，不必下載原始碼
**[開啟 TalkBridge](https://tonykfr1234.github.io/TalkBridge/)**

電腦與 Android 建議使用 Chrome／Edge；iPhone 使用 Safari。允許麥克風後即可使用。
要像 App 一樣從桌面啟動，在 App 設定或瀏覽器選單選擇安裝；iPhone 使用 Safari「分享 → 加入主畫面」。選項是否出現由瀏覽器決定。
Android APK 另見 [最新 Release](https://github.com/tonykfr1234/TalkBridge/releases/latest)，下載發行頁實際列出的 APK，依手機提示安裝。

## 第一次使用
1. 進入「口譯」，選擇「我說」與「對方說」的語言。
2. 按開始，允許麥克風，先說一小段確認收音與字幕。
3. 使用會議功能時先取得參與者同意；結束後匯出要保留的紀錄。
4. AI 功能為選用；需要時在 App 設定填入自己的服務金鑰，不要寫入原始碼或提交 GitHub。

完整操作見 [繁體中文說明](README.zh-TW.md)。語音與 AI 功能可能需要網路及服務授權；安裝到主畫面不代表全部功能可離線使用。

## 更新、資料與排錯
重新開啟網站取得更新；若仍顯示舊版，先匯出重要紀錄，再依 App／瀏覽器提示更新。
紀錄儲存在目前裝置與瀏覽器；換瀏覽器、換網址、清除網站資料或解除安裝可能失去本機紀錄，先匯出備份。
沒有聲音：檢查網站麥克風權限、選用的收音裝置及系統權限。
不需要把私密會議、金鑰或匯出資料上傳到 GitHub。

## 開發者在本機執行
已安裝 Python 3 後，下載完整專案，在根目錄執行：
```bash
python -m http.server 8080 --bind 127.0.0.1
```
開啟 `http://localhost:8080`；不要直接雙擊 HTML。按 Ctrl+C 停止。
這個開發伺服器只綁定本機；手機測試請使用上方 HTTPS 網站或自行配置 HTTPS 開發環境。
