# 📦 Notion Smart Clipper v2.8.2 發布說明

> 版本狀態：擬定中（待合併 PR #10）

## ✨ 變更摘要

- 修復在長內容頁面多次標註/同步並反覆開關後，標註工具欄偶發「無法再顯示」的問題。
- 在顯示時自動重新掛載工具欄節點、重申關鍵樣式，並提升 z-index 至 2147483647，避免被頁面 overlay 遮蔽。（模組：highlighter-v2）

## 🛠️ 技術細節

- 若工具欄節點不在 DOM（被網站動態渲染移除），於 show() 時自動 append 回 document.body。
- 於 show() 時重新設定關鍵樣式：position: fixed、top/right 預設、z-index、display、visibility、opacity，並加入 try/catch 錯誤防護與日誌。
- hide() 加入 try/catch 提升穩定性。

## 🔬 測試與驗證

1. 開啟 https://m.nfcmag.com/article/9405.html
2. 啟動標註、建立多個標註並同步到 Notion
3. 多次關閉/重新打開工具欄
4. 預期：工具欄每次打開均能正常顯示於右上方，不被遮擋亦不失聯

## 🔁 回滾策略

- 回滾 scripts/highlighter-v2.js 本次改動即可；不影響資料結構與既有標註

## 📎 參考連結

- PR #10: https://github.com/cowcfj/save-to-notion/pull/10
- 模組：highlighter-v2（CSS Custom Highlight API 版本）
