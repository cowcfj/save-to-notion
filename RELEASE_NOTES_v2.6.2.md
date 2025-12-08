# 🔴 v2.6.2 緊急修復：標註遷移問題

## 重要更新

**強烈建議所有用戶立即更新！**

這是一個緊急修復版本，解決了用戶從舊版本（v2.4.x 及更早）升級後**標註消失**的嚴重問題。

---

## 🔴 主要修復

### 標註遷移問題

- ✅ 自動檢測並遷移 localStorage 中的舊標註資料
- ✅ 智能文本定位：三層查找演算法（window.find → TreeWalker → 模糊匹配）
- ✅ 支援跨文本節點的標註恢復
- ✅ 資料格式自動轉換（舊格式 → 新格式）
- ✅ 遷移完成後顯示友好通知
- ✅ 預期恢復率：95%+

### 技術改進

- 新增 7 個遷移相關方法（500+ 行程式碼）
- 完整的錯誤處理和日誌記錄
- 使用者友好的遷移體驗

---

## 📦 安裝方式

### Chrome Web Store（推薦）

前往 [Chrome Web Store](https://chromewebstore.google.com/detail/save-to-notion-smart-clip/gmelegphcncnddlaeogfhododhbcbmhp) 安裝或更新

### 手動安裝

下載 [save-to-notion-v2.6.2.zip](https://github.com/cowcfj/save-to-notion/releases/download/v2.6.2/save-to-notion-v2.6.2.zip) 並解壓縮，在 Chrome 擴充功能頁面載入

---

## 📚 詳細資訊

- **完整更新日誌：** [CHANGELOG.md](https://github.com/cowcfj/save-to-notion/blob/main/CHANGELOG.md)
- **使用說明：** [README.md](https://github.com/cowcfj/save-to-notion#readme)
- **問題回報：** [GitHub Issues](https://github.com/cowcfj/save-to-notion/issues)

---

## ⚠️ 重要提示

如果您從 v2.4.x 或更早版本升級：

1. 首次開啟有標註的頁面時會自動執行遷移
2. 請等待 1-3 秒完成遷移過程
3. 查看控制台（F12）可檢視詳細遷移日誌
4. 如遇問題，請開啟 Issue 回報

---

**發布日期：** 2025年10月3日  
**版本類型：** 🔴 緊急修復 (Hotfix)
