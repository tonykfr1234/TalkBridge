# 贊助設定與確認

## 設定收款資訊

編輯 repository 根目錄的 `donate.json`（這些資料會公開顯示在贊助頁）：

```json
{
  "bank": { "name": "銀行名稱", "code": "銀行代碼", "account": "帳號", "holder": "戶名" },
  "linePay": { "url": "LINE Pay 收款連結", "id": "LINE ID", "qr": "QR 碼圖片網址（可放在 assets/ 用相對路徑）" }
}
```

沒填的欄位，贊助頁會顯示「設定中」。推上 GitHub 後網站立刻更新，App 也會讀到最新設定。

## 確認入帳、加入名單

贊助者完成後會用 LINE 傳一則訊息給你（暱稱、金額、方式、末五碼）。對帳確認收到後：

```bash
python3 scripts/add_donor.py "小美" --message "口譯很好用！"
git commit -am "Add supporter 小美" && git push
```

或直接跟 Claude 說「確認贊助：小美，留言：口譯很好用」，它會幫你加入並推上 GitHub。

名單只顯示暱稱與留言，不顯示金額與帳號。人數 = 名單筆數，所有 App 共用。
