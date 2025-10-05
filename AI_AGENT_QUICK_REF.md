# 🤖 AI Agent 快速參考卡

## 📌 記住這三件事

### 1️⃣ 語言規範
**所有中文內容必須使用繁體中文**

常見錯誤：
❌ 迁移、显示、详细、链接、标注  
✅ 遷移、顯示、詳細、連結、標註

### 2️⃣ Release Notes 格式
**簡潔明瞭，只列要點 + 詳細連結**

```markdown
## 🔴 主要修復
- ✅ 要點1
- ✅ 要點2

## 📚 詳細資訊
- **完整更新日誌：** [CHANGELOG連結]
```

❌ 避免：過度詳細的技術說明、完整程式碼範例  
✅ 應該：核心要點、使用者可見改進、詳細連結

### 3️⃣ Chrome Web Store 連結
```
https://chromewebstore.google.com/detail/save-to-notion-smart-clip/gmelegphcncnddlaeogfhododhbcbmhp
```

**使用時機：**
- Release Notes 安裝說明
- README 安裝區域
- 宣傳材料

---

## 📂 文件分類

### 📚 版本文檔分工
```
CHANGELOG.md              → 完整版本歷史（開發者參考）
RELEASE_NOTES_v*.md       → 簡潔發布公告（使用者導向）
⚠️ 不要創建 CHANGELOG_v*.md  → 避免功能重疊
```

### ✅ 可發布（推送到 GitHub）
- `README.md`
- `CHANGELOG.md` - 完整版本歷史
- `RELEASE_NOTES_v*.md` - 簡潔發布公告
- `PRIVACY.md`

### ❌ 內部文件（.gitignore 排除）
- `PROJECT_STANDARDS.md`
- `PROJECT_ROADMAP.md`
- `*_COMPLETE.md`
- `*_INTERNAL.md`
- `*_LOCAL.md`
- `CHANGELOG_v*.md` ⚠️ 避免功能重疊
- `TESTING_GUIDE_*.md`
- 包含本地路徑的任何文件

---

## ✍️ Commit 訊息範例

```
✅ 好的範例：
v2.6.2: 🔴 緊急修復標註遷移問題
docs: 更新 README 功能說明
fix: 修正圖片提取邏輯

❌ 避免：
修复标注问题（簡體中文）
update（不明確）
```

---

## 🔍 發布前檢查清單

- [ ] 無簡體中文
- [ ] Release Notes 簡潔
- [ ] 包含 Chrome Web Store 連結
- [ ] 包含詳細更新連結
- [ ] 無本地絕對路徑
- [ ] 內部文件已在 .gitignore

---

**完整規範：** 請參閱 `PROJECT_STANDARDS.md`
