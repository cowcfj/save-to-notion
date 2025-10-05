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
- ✅ 要點1（一行說明）
- ✅ 要點2（一行說明）

## 📚 詳細資訊
- **完整更新日誌：** [CHANGELOG.md](link)
```

❌ **絕對禁止：**
- 過度詳細的技術說明
- 完整程式碼範例
- 多段落的實現細節
- 超過 80 行的 Release Notes

✅ **必須遵守：**
- 每個要點一行（最多兩行）
- 只寫使用者可見的改進
- 技術細節放在 CHANGELOG.md
- 提供"完整更新日誌"連結

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

### 📚 文檔三層策略
```
README.md                 → 用戶入口（簡潔，~200行）
CHANGELOG.md              → 完整技術歷史（分組折疊）
RELEASE_NOTES_v*.md       → 個別發布公告（50-80行）
```

**README.md 更新規則：**
- 小版本 (v2.7.2→v2.7.3): 只更新當前版本描述
- 大版本 (v2.7.x→v2.8.0): v2.7.x 合併為摘要，突出 v2.8.0

**CHANGELOG.md 規則：**
- ✅ 永遠不刪除歷史記錄
- ✅ 使用 `<details>` 折疊舊版本
- ✅ 按主要版本分組 (v2.7.x, v2.6.x, v2.5.x)

**RELEASE_NOTES 規則：**
- ✅ 每個版本獨立文件 (RELEASE_NOTES_v2.7.3.md)
- ✅ 永遠不合併或刪除
- ✅ 50-80 行，簡潔為主

⚠️ **不要創建：** CHANGELOG_v*.md（與 RELEASE_NOTES 功能重疊）

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
