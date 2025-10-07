# 🔒 GitHub 同步安全策略

**創建日期：** 2025年10月4日  
**文檔性質：** 內部工作指南（不同步到 GitHub）  
**重要性：** ⚠️ 高 - 防止內部信息洩露

---

## 🎯 核心原則

### ⚡ **默認不同步原則**
除了明確的核心文件和正式發布文檔外，**所有新創建的文件默認都不同步到 GitHub**。

### 🤔 **疑惑時先詢問**
如果 AI Agent 對某個文件是否應該同步有任何疑惑，**必須先詢問用戶**，而不是自動提交。

---

## ✅ 白名單：應該同步的文件

### 1️⃣ **核心代碼文件**（必須同步）
```
scripts/
├── background.js              # Service Worker (Notion API、批處理)
├── content.js                 # 內容腳本 (頁面交互)
├── highlighter-v2.js          # CSS Highlight API 標註系統
├── highlighter-migration.js   # 遷移輔助腳本
├── seamless-migration.js      # 無痛自動遷移系統
├── utils.js                   # 共用工具函數
└── script-injector.js         # ⚠️ 已整合到 background.js，可能移除

popup/
├── popup.html
├── popup.js
└── popup.css

options/
├── options.html
├── options.js
└── options.css

update-notification/           # v2.8.0+ 更新通知頁面
├── update-notification.html
├── update-notification.js
└── update-notification.css

lib/
└── Readability.js             # Mozilla Readability 庫

icons/
├── icon16.png
├── icon48.png
└── icon128.png
```

### 2️⃣ **配置文件**（必須同步）
```
manifest.json          # 擴展配置 (Manifest V3)
package.json           # NPM 依賴和腳本
package-lock.json      # 依賴鎖定 (支持 CI/CD)
jest.config.js         # Jest 測試配置
codecov.yml            # Codecov 配置
.deepsource.toml       # DeepSource 配置
```

### 3️⃣ **用戶文檔**（必須同步）
```
README.md           - 項目說明和使用指南
USER_GUIDE.md       - 用戶使用指南
PRIVACY.md          - 隱私政策
CHANGELOG.md        - 技術變更記錄（面向開發者）
help.html           - 幫助頁面
```

### 4️⃣ **正式發布說明**（必須同步）
```
RELEASE_NOTES_v2.5.*.md
RELEASE_NOTES_v2.6.*.md
RELEASE_NOTES_v2.7.*.md
RELEASE_NOTES_v2.8.*.md
（每個正式版本的發布說明）
```

### 5️⃣ **測試文件**（部分同步）
```
tests/
├── unit/              # ✅ Jest 單元測試（同步）
├── helpers/           # ✅ 測試輔助函數（同步）
├── mocks/             # ✅ Mock 數據（同步）
├── setup.js           # ✅ Jest 配置（同步）
├── README.md          # ✅ 測試說明（同步）
├── manual/            # ❌ 手動測試文件（不同步）
├── e2e/               # ❌ E2E 測試（不同步）
└── results/           # ❌ 測試結果（不同步）
```

### 6️⃣ **CI/CD 配置**（必須同步）
```
.github/
└── workflows/
    └── test.yml       # GitHub Actions 測試工作流
```

---

## ❌ 黑名單：默認不同步的文件

### 🧪 **測試文件**（全部不同步）
```
*test*.html           - 所有測試 HTML 文件
*-test.html
test-*.html
highlight-test.html
template-test.html
debug-test.html
*preview.html
```

### 📝 **測試和開發文檔**（全部不同步）
```
TEST_*.md             - 測試記錄和指南
TEST_v*.md            - 版本測試記錄
TEST_GUIDE_*.md
TEST_RESULTS_*.md
QUICK_TEST_*.md
```

### 🔧 **開發工具和腳本**（全部不同步）
```
build.sh              - 構建腳本
cleanup.sh            - 清理腳本
*.sh                  - 所有 shell 腳本
```

### 📋 **內部工作文檔**（全部不同步）
```
*_INTERNAL.md         - 內部文檔
*_LOCAL.md            - 本地配置
*_CHECKLIST*.md       - 檢查清單
RELEASE_CHECKLIST_*.md
DEPLOYMENT_CHECKLIST.md
GIT_PUSH_CHECKLIST.md
PUBLISH_CHECKLIST.md
```

### 📐 **模板和指南**（全部不同步）
```
GITHUB_RELEASE_TEMPLATE.md    - Release 模板
*_TEMPLATE.md                 - 所有模板
*_GUIDE.md                    - 內部指南（除非明確是用戶指南）
```

### 📊 **項目規劃和管理**（全部不同步）
```
PROJECT_ROADMAP.md            - 項目路線圖
PROJECT_PROGRESS_REPORT.md    - 進度報告
MIGRATION_GUIDE.md            - 遷移指南
Agents.md                     - AI Agent 工作指南
AI_AGENT_QUICK_REF.md
```

### 🏗️ **技術規格和分析**（全部不同步）
```
*_SPEC.md
*_ANALYSIS.md
*_PLAN.md
*_REPORT.md
*_SUMMARY.md
PERFORMANCE_*.md
DATA_*.md
FEATURE_COMPARISON.md
```

### 📦 **發布相關內部文檔**（全部不同步）
```
RELEASE_COMPLETE_*.md
RELEASE_SUMMARY_*.md
GITHUB_RELEASE_GUIDE_*.md
CHROME_STORE_GUIDE.md
FIX_COMPLETE_*.md
```

### 🗂️ **構建和資源目錄**（全部不同步）
```
build/                - 構建輸出
*.zip                 - 打包文件
tests/                - 測試目錄
archive/              - 歸檔目錄
demos/                - 演示目錄
promo-images/         - 推廣圖片
release/              - 舊版本發布目錄
node_modules/         - 依賴包
```

---

## 🔍 判斷標準

當創建新文件時，使用以下決策樹：

```
新文件
│
├─ 是核心代碼？
│  ├─ 是 → ✅ 同步
│  └─ 否 → 繼續判斷
│
├─ 是配置文件？
│  ├─ 是 → ✅ 同步
│  └─ 否 → 繼續判斷
│
├─ 是用戶文檔？
│  ├─ 是 → ✅ 同步
│  └─ 否 → 繼續判斷
│
├─ 是正式發布說明？
│  ├─ 是 → ✅ 同步
│  └─ 否 → 繼續判斷
│
├─ 包含以下關鍵詞？
│  ├─ TEST, INTERNAL, LOCAL, TEMPLATE, 
│  │   CHECKLIST, GUIDE (內部), PLAN, 
│  │   REPORT, SUMMARY, SPEC, ANALYSIS
│  │  → ❌ 不同步
│  └─ 否 → 繼續判斷
│
├─ 文件名包含版本號但不是 RELEASE_NOTES？
│  ├─ 是 → ❌ 不同步
│  └─ 否 → 繼續判斷
│
├─ 是 .sh 腳本或測試 HTML？
│  ├─ 是 → ❌ 不同步
│  └─ 否 → 繼續判斷
│
└─ ⚠️ 不確定？
   └─ 🤔 **先詢問用戶**
```

---

## 🚨 特殊情況處理

### 1. **已經同步但不應該同步的文件**

如果發現某個文件已經在 Git 追蹤中，但根據策略不應該同步：

```bash
# 1. 從 Git 追蹤中移除（保留本地文件）
git rm --cached <文件名>

# 2. 加入 .gitignore
echo "<文件名或模式>" >> .gitignore

# 3. 提交更改
git add .gitignore
git commit -m "chore: 移除不應發布的內部文檔"
git push origin main
```

### 2. **用戶指南和改進說明**

像 `UI_IMPROVEMENT_v*.md` 或 `USER_GUIDE_v*.md` 這類文件：
- ❓ **不確定** - 可能對用戶有價值，但也可能包含內部討論
- ✅ **正確做法**：詢問用戶是否需要同步
- ⚠️ **錯誤做法**：自動決定同步或不同步

### 3. **README 中的引用**

如果內部文檔被 README.md 引用：
- ❌ **不要** 同步內部文檔
- ✅ **應該** 從 README 中移除該引用
- ✅ **或者** 將內容整合到 README 中

---

## 📋 AI Agent 工作檢查清單

每次創建新文件後，AI Agent 必須：

- [ ] 檢查文件名是否匹配黑名單模式
- [ ] 確認文件內容是否包含內部信息
- [ ] 如果是發布相關文檔，確認是否為正式版本
- [ ] 如果不確定，**必須先詢問用戶**
- [ ] 默認將新文件加入 .gitignore
- [ ] 只有在明確確認後才提交到 Git

---

## 🎯 當前需要評估的文件

以下文件已在 Git 追蹤中，需要評估是否應該移除：

```
UI_IMPROVEMENT_v2.7.2.md      - ⚠️ 需要用戶確認
USER_GUIDE_v2.7.0.md          - ⚠️ 需要用戶確認
build.sh                       - ❌ 應該移除（已在 .gitignore）
```

---

## 📝 維護指南

### 何時更新此文件

**必須更新的情況**:
1. ✅ **架構變更** - 添加/刪除核心目錄或文件
   - 例如：添加 `update-notification/` 目錄
   - 例如：移除 `script-injector.js`

2. ✅ **新增配置文件** - 添加新的配置文件
   - 例如：添加 `codecov.yml`
   - 例如：添加新的 CI/CD 配置

3. ✅ **測試結構變更** - 測試目錄組織改變
   - 例如：添加 `tests/manual/`
   - 例如：重組測試文件

4. ✅ **發布策略變更** - 改變哪些文件應該發布
   - 例如：決定某類文檔是否發布

### 更新流程

```bash
# 1. 檢查項目結構變更
git diff --name-status

# 2. 更新 GITHUB_SYNC_POLICY.md 的白名單/黑名單

# 3. 同步更新 .gitignore（如需要）

# 4. 提交更新
git add internal/guides/GITHUB_SYNC_POLICY.md
git commit -m "docs: update GITHUB_SYNC_POLICY for architecture changes"
```

---

## 📝 更新記錄

| 日期 | 更新內容 |
|------|---------|
| 2025-10-04 | 創建初始版本，明確白名單和黑名單策略 |
| 2025-10-07 | 更新核心代碼結構，添加 update-notification/、測試目錄、配置文件，添加維護指南 |

---

## 🔧 實用 Git 命令

### 📋 推送前檢查命令

```bash
# 1. 查看待推送的文件
git status

# 2. 查看具體更改內容
git diff --cached

# 3. 查看待推送的提交
git log origin/main..HEAD --oneline

# 4. 查看新增的未追蹤文件
git status | grep "Untracked"

# 5. 快速檢查是否有敏感文件
git status | grep -E "TEST_|INTERNAL|LOCAL|CHECKLIST|TEMPLATE|_GUIDE"

# 6. 列出所有被追蹤的 .md 文件
git ls-files | grep "\.md$"
```

### 🚫 撤銷錯誤操作

```bash
# 取消暫存某個文件
git restore --staged <filename>

# 取消暫存所有文件
git restore --staged .

# 移除文件但保留本地副本
git rm --cached <filename>
```

### ⚠️ 如果錯誤已經推送

```bash
# 1. 從 Git 移除文件（保留本地）
git rm --cached <filename>

# 2. 添加到 .gitignore
echo "<filename>" >> .gitignore

# 3. 提交更改
git add .gitignore
git commit -m "chore: 移除不應發布的內部文檔"

# 4. 推送
git push origin main
```

---

## 📋 推送前完整檢查流程

### 步驟 1：查看狀態
```bash
git status
```
**檢查要點：**
- [ ] 沒有包含 `TEST_*.md` 或 `*_INTERNAL.md` 文件
- [ ] 沒有包含 `*_CHECKLIST.md` 文件
- [ ] 沒有包含 `build.sh` 等構建腳本
- [ ] 沒有包含本地路徑或敏感信息

### 步驟 2：檢查新文件
```bash
# 如果有新文件，逐個檢查內容
git diff --cached <filename>
```

### 步驟 3：驗證 .gitignore
```bash
# 確保內部文檔規則在 .gitignore 中
cat .gitignore | grep -E "TEST_|INTERNAL|CHECKLIST"
```

### 步驟 4：查看提交歷史
```bash
# 查看將要推送的提交
git log origin/main..HEAD --oneline
git show HEAD
```

### 步驟 5：最後確認
```bash
# 確認沒有問題後推送
git push origin main
```

---

## 💡 最佳實踐

### 1. **養成習慣**
   - 每次推送前都執行完整檢查
   - 不要在匆忙時推送
   - 使用 `git status` 和 `git diff --cached` 仔細檢查

### 2. **文檔命名規範**
   - 內部文檔使用 `*_INTERNAL.md` 或 `*_LOCAL.md` 後綴
   - 測試文檔使用 `TEST_*` 前綴
   - 檢查清單使用 `*_CHECKLIST.md` 格式
   - 模板使用 `*_TEMPLATE.md` 格式

### 3. **定期審查**
   - 每週檢查一次 `.gitignore`
   - 每月審查一次已提交的文件列表
   - 及時移除不應該公開的文件

### 4. **使用 Git Hooks（可選）**
   創建 `.git/hooks/pre-push` 自動檢查：
   ```bash
   #!/bin/bash
   # 檢查是否有不應推送的文件
   if git diff --cached --name-only | grep -E "TEST_|INTERNAL|CHECKLIST|TEMPLATE"; then
     echo "⚠️ 警告：發現內部文檔，請檢查！"
     exit 1
   fi
   ```

---

## 📝 檢查清單模板

**每次推送前填寫：**

```
日期：___________
推送內容：___________

[ ] 1. 執行 git status 檢查
[ ] 2. 檢查新文件是否應該推送（參考決策樹）
[ ] 3. 查看 git diff --cached 確認更改
[ ] 4. 確認沒有本地路徑
[ ] 5. 確認沒有敏感信息
[ ] 6. 查看待推送的提交
[ ] 7. 驗證 .gitignore 正確
[ ] 8. 如有疑惑，詢問用戶
[ ] 9. 執行推送：git push origin main

確認人：___________
```

---

**⚠️ 重要提醒：**
- 這個文檔本身也不應該同步到 GitHub
- 已加入 .gitignore: `GITHUB_SYNC_POLICY.md`
- 所有 AI Agent 都應該遵循這個策略
- **記住：寧可多檢查一遍，也不要推送錯誤的文件！** 🔐
