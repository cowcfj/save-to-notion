# 📚 文檔管理策略

**文檔性質：** 內部指南（不同步到 GitHub）  
**創建日期：** 2025-10-05  
**最後更新：** 2025-10-05

---

## 🎯 核心原則：分層文檔策略

> 不同文檔服務不同目的，各司其職

---

## 📄 三類文檔的角色定位

### 1️⃣ README.md - 用戶入口文檔

**目標讀者：** 新用戶、潛在用戶、GitHub 訪客  
**更新頻率：** 每個大版本更新  
**內容策略：** ✅ 保持簡潔，突出重點

#### 內容結構
```markdown
# 項目標題和簡介
## 功能展示（截圖）
## 核心功能（5-6 個主要功能點）
## 最新更新
   - 當前版本 (v2.7.3)
   - 近期版本摘要 (v2.7.0-v2.7.2)
   - 引導查看 CHANGELOG.md
## 快速開始（3 步安裝）
## 使用指南（基本操作）
## 技術特性
## 項目結構
## 貢獻、隱私政策、許可證
```

#### 更新規則

**小版本更新 (v2.7.2 → v2.7.3)：**
- ✅ 更新「最新更新」中的當前版本號和描述
- ✅ 保持其他內容不變

**大版本更新 (v2.7.x → v2.8.0)：**
- ✅ 將 v2.7.x 詳細記錄合併為簡短摘要
- ✅ 突出 v2.8.0 的新功能
- ✅ 刪除 v2.6.x 的詳細描述
- ✅ 確保總長度控制在 200 行以內

**範例（v2.8.0 更新時）：**
```markdown
## 📝 最新更新

### v2.8.0 (最新版本) ✨ 全新功能
- 新功能 A：描述...
- 新功能 B：描述...
- 用戶價值：...

### v2.7.x 主要成就
- v2.7.3: 超長文章支持 ✅
- v2.7.0-v2.7.2: UX 改進、數據清理

📚 **完整更新記錄**請查看 [CHANGELOG.md](CHANGELOG.md)
```

---

### 2️⃣ CHANGELOG.md - 完整技術記錄

**目標讀者：** 開發者、貢獻者、維護者  
**更新頻率：** 每個版本發布  
**內容策略：** ❌ 永不刪除，完整保留所有歷史

#### 內容結構（當前實施）

```markdown
# 變更日誌 (CHANGELOG)

> 本文檔記錄項目的所有重要變更。

**快速導航：**
- v2.7.x (當前版本)
- v2.6.x (已歸檔)
- v2.5.x (已歸檔)
- v2.4.x (已歸檔)

---

## [v2.7.x] - Current

### [v2.7.3] - 2025-10-05
（完整記錄）

### [v2.7.2] - 2025-10-03
（完整記錄）

---

## [v2.6.x] - Archived

<details>
<summary>📦 點擊展開 v2.6.x 完整變更記錄 (7 個版本)</summary>

### [v2.6.2] - 2025-10-03
（完整記錄，摺疊但保留）

</details>
```

#### 更新規則

**小版本更新 (v2.7.2 → v2.7.3)：**
```markdown
## [v2.7.x] - Current

### [v2.7.3] - 2025-10-05
#### Fixed
- 具體修復內容...

### [v2.7.2] - 2025-10-03
（保持不變）
```

**大版本更新 (v2.7.x → v2.8.0)：**
```markdown
## [v2.8.x] - Current

### [v2.8.0] - 2025-11-01
#### Added
- 新功能...

---

## [v2.7.x] - Archived

<details>
<summary>📦 點擊展開 v2.7.x 完整變更記錄 (4 個版本)</summary>

### [v2.7.3] - 2025-10-05
（保留完整記錄，僅改為摺疊）

### [v2.7.2] - 2025-10-03
（保留完整記錄）

</details>
```

#### 組織技巧

1. **使用版本分組**：按大版本（v2.7.x, v2.6.x）分組
2. **使用摺疊標記**：舊版本用 `<details>` 標籤摺疊
3. **添加導航鏈接**：文檔頂部添加快速導航
4. **保持一致格式**：遵循 Keep a Changelog 格式

---

### 3️⃣ RELEASE_NOTES_v*.md - 發布公告

**目標讀者：** 所有用戶（技術和非技術）  
**更新頻率：** 每個版本一個獨立文件  
**內容策略：** ❌ 永不刪除或合併

#### 文件命名規範

```
RELEASE_NOTES_v2.7.3.md  ✅ 保留
RELEASE_NOTES_v2.7.2.md  ✅ 保留
RELEASE_NOTES_v2.7.1.md  ✅ 保留
RELEASE_NOTES_v2.6.2.md  ✅ 保留
```

#### 內容結構（簡潔版 50-80 行）

```markdown
# Release Notes v2.7.3

## 🚀 核心改進

### 超長文章支持
- 修復：文章截斷問題
- 用戶價值：完整保存長文

## 📊 技術細節
- 自動分批處理
- 遵守 Notion API 限制

## 🙏 致謝
感謝用戶反饋
```

#### 更新規則

**每次版本發布：**
1. ✅ 創建新的 `RELEASE_NOTES_v{version}.md` 文件
2. ✅ 所有舊文件保持不變
3. ✅ 用於創建 GitHub Release

**大版本更新時：**
- ❌ 不合併舊版本的 Release Notes
- ❌ 不刪除任何文件
- ✅ 繼續創建新文件

---

## 🔄 版本更新工作流程

### 小版本更新 (v2.7.2 → v2.7.3)

#### 步驟 1：更新 README.md
```markdown
## 📝 最新更新

### v2.7.3 (最新版本) 🐛 Bug 修復
- 修復超長文章截斷問題
- 測試案例：https://...

### v2.7.0-v2.7.2 主要更新
（保持不變）
```

#### 步驟 2：更新 CHANGELOG.md
```markdown
## [v2.7.x] - Current

### [v2.7.3] - 2025-10-05
#### Fixed
- 超長文章截斷問題
  - 問題描述
  - 根本原因
  - 解決方案
  - 技術細節

### [v2.7.2] - 2025-10-03
（保持不變）
```

#### 步驟 3：創建 RELEASE_NOTES_v2.7.3.md
```bash
cp RELEASE_NOTES_TEMPLATE.md RELEASE_NOTES_v2.7.3.md
# 編輯內容
```

#### 步驟 4：更新其他文件
```bash
# manifest.json
"version": "2.7.3"

# package.json
"version": "2.7.3"

# help.html（如果有功能變更）
更新版本號和功能說明
```

#### 步驟 5：Git 提交
```bash
git add .
git commit -m "release: v2.7.3 - 修復超長文章截斷問題"
git tag v2.7.3
git push origin main --tags
```

#### 步驟 6：GitHub Release
```bash
gh release create v2.7.3 \
  --title "v2.7.3 - 超長文章支持" \
  --notes-file RELEASE_NOTES_v2.7.3.md \
  build/notion-smart-clipper-v2.7.3.zip
```

---

### 大版本更新 (v2.7.x → v2.8.0)

#### 步驟 1：更新 README.md（重點！）

**刪除 v2.6.x 詳細內容，合併 v2.7.x 為摘要**

```markdown
## 📝 最新更新

### v2.8.0 (最新版本) ✨ 全新功能
- 新功能 A：革命性改進
- 新功能 B：重大突破
- 用戶價值：顯著提升效率

### v2.7.x 主要成就
- v2.7.3: 超長文章支持 ✅
- v2.7.0-v2.7.2: UX 改進、數據清理、徽章顯示

📚 **完整更新記錄**請查看 [CHANGELOG.md](CHANGELOG.md)
```

#### 步驟 2：重組 CHANGELOG.md

**不刪除任何內容，僅調整結構**

```markdown
## [v2.8.x] - Current

### [v2.8.0] - 2025-11-01
#### Added
- 新功能詳細描述...

---

## [v2.7.x] - Archived

<details>
<summary>📦 點擊展開 v2.7.x 完整變更記錄 (4 個版本)</summary>

### [v2.7.3] - 2025-10-05
（保留所有詳細內容）

### [v2.7.2] - 2025-10-03
（保留所有詳細內容）

### [v2.7.1] - 2025-10-03
（保留所有詳細內容）

### [v2.7.0] - 2025-10-03
（保留所有詳細內容）

</details>

---

## [v2.6.x] - Archived

<details>
（保持原樣）
</details>
```

#### 步驟 3：創建新的 Release Notes
```bash
# 創建 v2.8.0 的 Release Notes
# 不修改任何舊文件
```

#### 步驟 4-6：同小版本更新

---

## 📊 文檔狀態檢查清單

### 每次發布前檢查

- [ ] **README.md**
  - [ ] 版本號已更新
  - [ ] 最新更新章節已更新
  - [ ] 總長度 < 200 行
  - [ ] 引導連結到 CHANGELOG.md

- [ ] **CHANGELOG.md**
  - [ ] 新版本記錄已添加
  - [ ] 使用正確的日期格式
  - [ ] 分類清楚（Fixed, Added, Changed, etc.）
  - [ ] 舊版本記錄完整保留

- [ ] **RELEASE_NOTES_v*.md**
  - [ ] 新版本文件已創建
  - [ ] 內容簡潔（50-80 行）
  - [ ] 面向用戶友好
  - [ ] 無技術術語過載

- [ ] **其他文件**
  - [ ] manifest.json 版本已更新
  - [ ] package.json 版本已更新
  - [ ] help.html 版本已更新（如需要）

---

## 🎯 成功案例參考

### 優秀的開源項目文檔管理

**[Vue.js](https://github.com/vuejs/core/blob/main/CHANGELOG.md)**
- ✅ 保留所有版本記錄（從 v0.x 開始）
- ✅ 使用清晰的版本分組
- ✅ README 只顯示最新功能

**[React](https://github.com/facebook/react/blob/main/CHANGELOG.md)**
- ✅ 從 2013 年至今的完整記錄
- ✅ 詳細的技術變更記錄
- ✅ 方便問題追溯

**[TypeScript](https://github.com/microsoft/TypeScript/blob/main/CHANGELOG.md)**
- ✅ 使用 `<details>` 摺疊舊版本
- ✅ 保持完整歷史
- ✅ 改善可讀性

---

## ⚠️ 常見錯誤和避免方法

### ❌ 錯誤做法

1. **合併或刪除 CHANGELOG.md 中的舊版本記錄**
   - 問題：丟失歷史信息，無法追溯
   - 影響：調試困難，用戶不滿

2. **在 README.md 保留所有版本詳細記錄**
   - 問題：文檔過長，信息過載
   - 影響：新用戶望而卻步

3. **合併多個版本的 Release Notes**
   - 問題：破壞 GitHub Release 結構
   - 影響：用戶無法查看特定版本信息

4. **不使用摺疊標記**
   - 問題：CHANGELOG.md 過長難讀
   - 影響：開發者體驗差

### ✅ 正確做法

1. **README.md 保持簡潔**
   - 只顯示當前版本 + 近期摘要
   - 引導查看 CHANGELOG.md

2. **CHANGELOG.md 保留完整記錄**
   - 使用版本分組
   - 使用摺疊標記改善可讀性
   - 添加快速導航

3. **Release Notes 保持獨立**
   - 每個版本一個文件
   - 永不合併或刪除

4. **定期檢查和優化**
   - 每個大版本更新時重組結構
   - 但不刪除任何歷史記錄

---

## 🔧 工具和腳本

### 自動化腳本建議（未來實施）

```bash
#!/bin/bash
# scripts/prepare-release.sh

VERSION=$1

# 1. 更新版本號
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" manifest.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# 2. 創建 Release Notes
cp GITHUB_RELEASE_TEMPLATE.md RELEASE_NOTES_v$VERSION.md

# 3. 提示下一步
echo "✅ 版本號已更新到 $VERSION"
echo "📝 請編輯 RELEASE_NOTES_v$VERSION.md"
echo "📝 請更新 CHANGELOG.md"
echo "📝 請更新 README.md"
```

---

## 📚 延伸閱讀

- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Release Best Practices](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Writing Good Commit Messages](https://chris.beams.io/posts/git-commit/)

---

## 🔗 相關文檔

- [REPORT_WRITING_STANDARDS.md](./REPORT_WRITING_STANDARDS.md) - 內部報告撰寫規範
- [PROJECT_STANDARDS.md](./PROJECT_STANDARDS.md) - 項目開發規範
- [GITHUB_RELEASE_TEMPLATE.md](./GITHUB_RELEASE_TEMPLATE.md) - Release 撰寫指南

---

**最後更新：** 2025-10-07  
**維護者：** 項目團隊  
**狀態：** ✅ 已實施（v2.7.3 起）
