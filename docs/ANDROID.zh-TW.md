# Android App

Android App 和網頁版是同一套程式：建置時把網頁（`index.html`、`css/`、`js/`、`assets/`）打包進 APK，所以網頁有任何修正，下一版 APK 就自動包含。App 可以離線開啟。

## 安裝

1. 用手機打開 <https://github.com/tonykfr1234/TalkBridge/releases/latest>，下載 **TalkBridge.apk**。
2. 點下載完成的檔案安裝。第一次會要求允許「安裝不明來源的應用程式」，請允許你用來下載的瀏覽器或檔案管理員。
3. 打開「語橋 TalkBridge」，允許麥克風。

需要 Android 8.0 以上。

## 自動更新

- 每次程式推送到 GitHub 的 `main`，GitHub Actions 會自動測試、打包並發佈新的 Release（版本號像 `1.4.0.57`，最後一段是建置編號）。
- App 開啟時會檢查 GitHub 上有沒有更新的版本，有的話上方會出現「有新版本，下載更新」。下載後點開安裝即可，資料（會議、設定、練習進度）會保留。

## 簽章金鑰（一次性設定，很重要）

Android 只允許「同一把金鑰簽章」的新版本覆蓋安裝。請在 GitHub repository 的 **Settings → Secrets and variables → Actions → New repository secret** 新增：

| 名稱 | 內容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 金鑰檔（`.jks`）的 Base64 文字 |
| `ANDROID_KEYSTORE_PASSWORD` | 金鑰庫密碼 |
| `ANDROID_KEY_ALIAS` | 金鑰別名（例如 `talkbridge`） |
| `ANDROID_KEY_PASSWORD` | 金鑰密碼 |

沒有設定時，GitHub Actions 仍會打包，但用的是每次都不同的暫時金鑰：更新時 Android 會拒絕覆蓋，必須先解除安裝舊版（會清掉 App 裡的資料）。Release 說明會標註「暫時簽章」。

自己產生金鑰（macOS／Linux／Windows 都有 `keytool`，隨 JDK 安裝）：

```bash
keytool -genkeypair -keystore talkbridge-release.jks -storetype PKCS12 -alias talkbridge \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 talkbridge-release.jks > ANDROID_KEYSTORE_BASE64.txt   # macOS：base64 -i talkbridge-release.jks
```

金鑰檔**不要**放進 repository（`scripts/security_scan.py` 看到 `.jks` 會判定失敗）。請備份到安全的地方：弄丟之後，新版本就無法覆蓋安裝。

## 與網頁版的差異

| 功能 | Android App |
| --- | --- |
| 語音辨識 | 使用 Android 系統的語音辨識（Google 語音服務）。每次重新開始收音時，部分手機會有提示音 |
| 朗讀 | Android 系統的文字轉語音；有 OpenAI 金鑰時同樣可用 OpenAI 語音與「我的聲音」 |
| 匯出 | 存到「下載／TalkBridge」資料夾 |
| 分享 | Android 分享選單，可直接選 LINE |
| 會議錄音 + 逐字稿同時進行 | 部分手機的系統語音辨識無法和錄音同時使用麥克風；若逐字稿停住，請關掉「同時錄音」 |

## 自己建置

需要 JDK 17 以上與 Android SDK（裝 Android Studio 最簡單）。

```bash
cd android
./gradlew testDebugUnitTest assembleDebug     # 測試並產生 app/build/outputs/apk/debug/app-debug.apk
```

正式版簽章：把 `keystore.properties.example` 複製成 `keystore.properties` 並填好，再執行 `./gradlew assembleRelease`。
