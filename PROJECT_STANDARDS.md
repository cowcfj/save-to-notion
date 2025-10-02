# 📋 專案重要規範與資訊

## 🌐 語言規範

### ✅ 繁體中文標準
**所有中文內容必須使用繁體中文**

常見簡繁對照：
- 迁移 → 遷移
- 显示 → 顯示
- 详细 → 詳細
- 链接 → 連結
- 连接 → 連接
- 标注 → 標註
- 标记 → 標記
- 选择 → 選擇
- 识别 → 識別
- 图标 → 圖標
- 内容 → 內容
- 问题 → 問題
- 错误 → 錯誤
- 修复 → 修復
- 发布 → 發布
- 数据库 → 資料庫
- 设置 → 設定/設置
- 执行 → 執行
- 记录 → 記錄
- 检测 → 檢測
- 处理 → 處理

### 檢查清單
- [ ] README.md - 繁體中文
- [ ] CHANGELOG.md - 繁體中文
- [ ] RELEASE_NOTES_*.md - 繁體中文（簡化版）
- [ ] 程式碼註解 - 繁體中文
- [ ] Commit 訊息 - 繁體中文
- [ ] GitHub Issue/PR - 繁體中文

---

## 📝 Release Notes 規範

### ✅ 簡潔原則
**只列出更新要點，附上詳細更新連結**

### 標準格式範例

```markdown
# 🔴 v2.x.x [標題]

## 重要更新
[簡要說明]

## 🔴 主要修復/新功能
- ✅ 要點1
- ✅ 要點2
- ✅ 要點3

## 📦 安裝方式
### Chrome Web Store（推薦）
[Web Store 連結]

### 手動安裝
[下載連結]

## 📚 詳細資訊
- **完整更新日誌：** [CHANGELOG連結]
- **使用說明：** [README連結]
- **問題回報：** [Issues連結]

## ⚠️ 重要提示
[特別注意事項]
```

### ❌ 避免
- 過度詳細的技術說明
- 冗長的問題分析
- 完整的程式碼範例
- 內部開發細節

### ✅ 應該包含
- 核心功能/修復要點
- 使用者可見的改進
- 重要注意事項
- 詳細資訊連結

---

## 🔗 專案重要連結

### Chrome Web Store
```
https://chromewebstore.google.com/detail/save-to-notion-smart-clip/gmelegphcncnddlaeogfhododhbcbmhp
```

**使用時機：**
- Release Notes 中提供安裝連結
- README 安裝說明區域
- 宣傳材料
- 使用者支援

### GitHub Repository
```
https://github.com/cowcfj/save-to-notion
```

### 常用連結格式
```markdown
- **Chrome Web Store：** [安裝擴充功能](https://chromewebstore.google.com/detail/save-to-notion-smart-clip/gmelegphcncnddlaeogfhododhbcbmhp)
- **GitHub：** [專案首頁](https://github.com/cowcfj/save-to-notion)
- **問題回報：** [GitHub Issues](https://github.com/cowcfj/save-to-notion/issues)
- **詳細更新：** [CHANGELOG.md](https://github.com/cowcfj/save-to-notion/blob/main/CHANGELOG.md)
```

---

## 📂 文件管理規範

### 📚 版本文檔分工

#### CHANGELOG.md（完整版本歷史）
- **目標受眾：** 開發者、貢獻者
- **內容風格：** 詳細技術說明
- **更新方式：** 持續累積所有版本
- **用途：** 查詢完整歷史、技術參考

#### RELEASE_NOTES_v*.md（發布公告）
- **目標受眾：** 一般使用者
- **內容風格：** 簡潔要點 + 連結
- **更新方式：** 每個版本獨立文件
- **用途：** GitHub Release、Chrome Store 發布

⚠️ **重要：不要創建 `CHANGELOG_v*.md`**
- 避免與 CHANGELOG.md 和 RELEASE_NOTES 功能重疊
- 維持清晰的文件分工

### 公開文件（需同步到 GitHub）
- ✅ `README.md` - 專案說明
- ✅ `CHANGELOG.md` - 完整更新日誌（開發者參考）
- ✅ `RELEASE_NOTES_v*.md` - 發布說明（使用者導向）
- ✅ `PRIVACY.md` - 隱私政策
- ✅ `PROJECT_ROADMAP.md` - 發展規劃
- ✅ `PROJECT_STANDARDS.md` - 專案規範
- ✅ `Agents.md` - AI Agent 工作指南

### 內部文件（.gitignore 排除）
- ❌ `QUICK_START.md` - 本地開發設定
- ❌ `*_INTERNAL.md` - 內部文件
- ❌ `*_LOCAL.md` - 本地設定
- ❌ `*_COMPLETE.md` - 完成總結
- ❌ `CHANGELOG_v*.md` - 避免功能重疊
- ❌ `TESTING_GUIDE_*.md` - 測試指南
- ❌ 包含本地絕對路徑的任何文件

### 檢查清單
發布前確認：
- [ ] 無簡體中文
- [ ] 無本地絕對路徑
- [ ] Release Notes 簡潔明瞭
- [ ] 包含 Chrome Web Store 連結
- [ ] 包含詳細更新連結

---

## 🎯 AI Agent 提醒

### 每次生成內容時
1. **語言：** 使用繁體中文
2. **Release Notes：** 保持簡潔，附上詳細連結
3. **連結：** 記得使用 Chrome Web Store URL
4. **文件：** 區分公開/內部文件

### Git Commit 訊息
```
✅ 好的範例：
- v2.6.2: 🔴 緊急修復標註遷移問題
- docs: 更新 README 功能說明
- fix: 修正圖片提取邏輯

❌ 避免：
- 修复标注迁移问题（簡體中文）
- update readme（英文，不明確）
- 各種修改（過於簡略）
```

---

**最後更新：** 2025年10月3日  
**版本：** v1.0
