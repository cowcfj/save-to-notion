# 📝 GitHub Release 說明指南

## 🎯 核心原則

### ✅ **應該做的**
1. **簡潔明瞭**：50-80 行，聚焦用戶價值
2. **面向用戶**：用戶能看懂的語言，避免技術術語
3. **突出亮點**：3-5 個最重要的改進
4. **清晰指引**：安裝步驟、升級建議、獲取幫助的方式

### ❌ **不應該做的**
1. **過度詳細**：技術細節應該在 CHANGELOG.md
2. **開發術語**：避免「modified function X」這類描述
3. **完整文檔**：不要把整個用戶手冊放進來
4. **內部信息**：測試結果、開發流程等

---

## 📋 標準模板

```markdown
# 🎉 Notion Smart Clipper v{VERSION}

**發布日期：** {DATE}  
**下載：** [notion-smart-clipper-v{VERSION}.zip](https://github.com/cowcfj/save-to-notion/releases/download/v{VERSION}/notion-smart-clipper-v{VERSION}.zip)

---

## ✨ 新功能和改進

### v{VERSION} - {THEME} {EMOJI}
- {EMOJI} **{功能名稱}**：用戶價值描述
- {EMOJI} **{功能名稱}**：用戶價值描述
- {EMOJI} **{功能名稱}**：用戶價值描述

（如果是大版本，可包含前幾個小版本的摘要）

---

## 📥 如何安裝

1. 下載 [notion-smart-clipper-v{VERSION}.zip](https://github.com/cowcfj/save-to-notion/releases/download/v{VERSION}/notion-smart-clipper-v{VERSION}.zip)
2. 解壓縮文件
3. Chrome 瀏覽器打開 `chrome://extensions/`
4. 啟用「開發者模式」（右上角）
5. 點擊「載入未封裝項目」
6. 選擇解壓後的文件夾
7. 在設置中配置你的 Notion API Key 和 Database ID

---

## 🔄 升級指南

- **從 v{PREVIOUS_VERSION}**：簡短說明兼容性和注意事項
- **從更舊版本**：簡短說明主要變化

---

## 📚 更多信息

- 📖 [完整使用手冊](https://github.com/cowcfj/save-to-notion/blob/main/README.md)
- 📋 [詳細更新日誌](https://github.com/cowcfj/save-to-notion/blob/main/CHANGELOG.md)
- 🐛 [問題回報](https://github.com/cowcfj/save-to-notion/issues)
- ⭐ 喜歡這個項目？給個 Star 吧！

---

**上一版本：** [v{PREVIOUS_VERSION}](https://github.com/cowcfj/save-to-notion/releases/tag/v{PREVIOUS_VERSION})  
**完整功能列表：** 查看 [README.md](https://github.com/cowcfj/save-to-notion/blob/main/README.md)
```

---

## 📏 長度指南

| 內容類型 | 建議行數 | 說明 |
|---------|---------|------|
| 標題和元信息 | 3-5 行 | 版本號、日期、下載鏈接 |
| 新功能摘要 | 15-25 行 | 3-5 個主要功能，每個 3-5 行 |
| 安裝指南 | 10-12 行 | 標準步驟 |
| 升級指南 | 5-8 行 | 兼容性說明 |
| 更多信息 | 8-10 行 | 文檔鏈接 |
| **總計** | **50-80 行** | 在一屏內能看完主要內容 |

---

## 💡 寫作技巧

### 1. **用戶價值優先**
❌ "Modified `clearPageState()` to remove both keys"  
✅ "刪除 Notion 頁面時，同時清理本地標註數據"

### 2. **具體描述**
❌ "Improved performance"  
✅ "減少 90%+ 無效數據累積"

### 3. **視覺化說明**
❌ "Added loading indicator"  
✅ "添加旋轉動畫，讓你知道正在處理"

### 4. **分組歸納**
- 如果同一版本有多個相關功能，用主題歸納
- 例如："UI 優化"、"性能改進"、"Bug 修復"

---

## 📊 實例對比

### ❌ **過長版本（280 行）**
```markdown
包含：
- 完整的技術實現細節
- 所有測試場景
- 詳細的 API 說明
- 完整的安裝手冊
- 升級的每個步驟
- 所有已知問題
- 完整的版本歷史
- 項目未來計劃
```
**問題：** 用戶需要滾動很多次才能找到關鍵信息

### ✅ **簡潔版本（58 行）**
```markdown
包含：
- 3 個版本的核心改進（各 3-4 點）
- 簡化的安裝步驟
- 簡要的升級建議
- 文檔鏈接
```
**優點：** 一屏內看完所有重要信息

---

## 🔗 相關文檔

- **CHANGELOG.md** - 面向開發者的詳細技術變更
- **RELEASE_NOTES_v*.md** - 面向內部的完整發布說明
- **README.md** - 用戶使用手冊
- **GitHub Release** - 面向用戶的簡潔發布公告（本指南）

---

## ✅ 檢查清單

發布前檢查：
- [ ] Release 說明在 50-80 行之間
- [ ] 每個功能都說明了用戶價值
- [ ] 沒有技術術語（或有解釋）
- [ ] 包含下載鏈接和安裝步驟
- [ ] 包含文檔鏈接
- [ ] 語言通俗易懂
- [ ] 沒有內部開發信息
- [ ] 格式清晰，易於掃讀

---

**最後更新：** 2025年10月3日  
**適用版本：** v2.7.2+
