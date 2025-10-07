# 📋 GitHub 發布前檢查清單

**重要：此文件僅供本地使用，不應發布到 GitHub！**

---

## 🔒 安全審查標準

### ✅ 可以發布的文件類型

#### 📚 用戶文檔
- `README.md` - 項目介紹和使用說明
- `PRIVACY.md` - 隱私政策
- `help.html` - 用戶幫助文檔

#### 📝 版本記錄
- `CHANGELOG.md` - 完整變更記錄
- `RELEASE_NOTES_*.md` - 具體版本的發布說明（不含本地路徑）

#### 🛠️ 用戶指南
- `MIGRATION_GUIDE.md` - 用戶遷移指南（僅限用戶操作步驟）

#### 💻 源代碼

**核心文件**:
- `manifest.json` - 擴展配置（Manifest V3）

**腳本目錄** (`scripts/`):
- `background.js` - Service Worker（Notion API、批處理）
- `content.js` - 內容腳本（頁面交互）
- `highlighter-v2.js` - CSS Highlight API 標註系統
- `seamless-migration.js` - 無痛自動遷移系統
- `highlighter-migration.js` - 遷移輔助腳本
- `utils.js` - 共用工具函數
- ⚠️ `script-injector.js` - 已整合到 background.js，可能移除

**UI 目錄**:
- `popup/` - 彈窗界面（HTML、CSS、JS）
- `options/` - 設置頁面（HTML、CSS、JS）
- `update-notification/` - 更新通知頁面（v2.8.0+）

**資源目錄**:
- `icons/` - 擴展圖標（16x16、48x48、128x128）
- `lib/` - 第三方庫（Readability.js）

**測試目錄** (部分發布):
- `tests/unit/` - Jest 單元測試 ✅
- `tests/helpers/` - 測試輔助函數 ✅
- `tests/mocks/` - Mock 數據 ✅
- `tests/setup.js` - Jest 配置 ✅
- `tests/manual/` - 手動測試文件 ❌ 不發布
- `tests/e2e/` - E2E 測試 ❌ 不發布

**配置文件**:
- `package.json` - NPM 依賴和腳本
- `package-lock.json` - 依賴鎖定（支持 CI/CD）
- `jest.config.js` - Jest 測試配置
- `codecov.yml` - Codecov 配置

**文檔文件**:
- `README.md` - 項目說明
- `USER_GUIDE.md` - 用戶指南
- `PRIVACY.md` - 隱私政策
- `CHANGELOG.md` - 變更日誌
- `RELEASE_NOTES_*.md` - 發布說明
- `help.html` - 幫助頁面

---

### ❌ 絕對不能發布的文件類型

#### 🚫 開發文檔（含本地路徑或內部流程）
- `QUICK_START.md` - 開發快速啟動指南
- `DEPLOYMENT_CHECKLIST.md` - 部署檢查清單
- `TESTING_GUIDE*.md` - 任何測試指南
- `TEST_GUIDE_*.md` - 任何測試文檔
- `CODE_REVIEW_REPORT.md` - 代碼審查報告
- `CLEANUP_REPORT_*.md` - 清理報告
- `QUICK_TEST_*.md` - 快速測試文檔

#### 🚫 調試和診斷文檔
- `DEBUG_*.md` - 任何調試文檔
- `HIGHLIGHT_SYNC_DIAGNOSTIC.md` - 同步診斷
- `*_DIAGNOSTIC.md` - 任何診斷文檔

#### 🚫 技術規格和內部設計
- `INTEGRATION_SUMMARY.md` - 整合總結
- `SEAMLESS_MIGRATION.md` - 技術遷移文檔
- `HIGHLIGHTER_UPGRADE_PLAN.md` - 升級計劃
- `LOGGER_OPTIMIZATION_PLAN.md` - 優化計劃
- `PERFORMANCE_ANALYSIS.md` - 性能分析
- `PERFORMANCE_OPTIMIZATION_GUIDE.md` - 優化指南
- `DATA_OPTIMIZATION_GUIDE.md` - 數據優化
- `DATA_PROTECTION_GUIDE.md` - 數據保護
- `GOOGLE_DRIVE_BACKUP_SPEC.md` - 技術規格
- `UPGRADE_DATA_SAFETY.md` - 升級安全文檔

#### 🚫 功能對比和分析
- `FEATURE_COMPARISON.md` - 功能對比

#### 🚫 發布流程文檔
- `CHROME_STORE_GUIDE.md` - Chrome 商店發布指南
- `GITHUB_RELEASE_GUIDE_*.md` - GitHub Release 指南
- `github-release-*.md` - 任何 Release 相關文檔

#### 🚫 協作和規劃文檔
- `COLLABORATION_PROPOSAL.md` - 協作提案
- `GOALS.md` - 項目目標
- `PROJECT_ROADMAP.md` - 項目路線圖
- `Agents.md` - AI Agent 工作指南

#### 🚫 構建和開發工具
- `build.sh` - 打包腳本
- `cleanup.sh` - 清理腳本
- `*.sh` - 任何 Shell 腳本

#### 🚫 測試文件
- `*test.html` - 任何測試 HTML
- `*-test.html`
- `test-*.html`

---

## 📋 完整發布工作流程

### 階段 1: 開發
- [ ] 代碼修復完成
- [ ] 測試文件放在 `tests/manual/` (不是 `internal/scripts/`)
- [ ] 測試通過

### 階段 2: 文檔更新 ⭐ 重要
- [ ] 更新 `manifest.json` 版本號
- [ ] 更新 `CHANGELOG.md`
- [ ] 創建 `RELEASE_NOTES_vX.X.X.md`
- [ ] **更新 `README.md`** ⭐ 必須
  - [ ] 更新版本號（標題）
  - [ ] 添加最新版本徽章
  - [ ] 添加版本更新通知
  - [ ] 更新「最新更新」區域
  - [ ] 添加發布說明鏈接

### 階段 3: 安全審查

#### 1️⃣ 文件內容審查
```bash
# 檢查是否包含本地路徑
grep -r "/Volumes/" . --include="*.md" --include="*.html" --include="*.js"
grep -r "/Users/" . --include="*.md" --include="*.html" --include="*.js"
grep -r "C:\\" . --include="*.md" --include="*.html" --include="*.js"

# 檢查是否包含個人信息
grep -r "chanfungking" . --include="*.md" --include="*.html"
grep -r "ChandeMac" . --include="*.md" --include="*.html"
```

### 2️⃣ 文件類型審查
```bash
# 列出所有 Markdown 文件
ls -la *.md

# 列出所有 Shell 腳本
ls -la *.sh

# 列出所有 HTML 測試文件
ls -la *test*.html
```

### 3️⃣ Git 狀態檢查
```bash
# 查看即將提交的文件
git status

# 查看即將提交的具體內容
git diff --cached

# 檢查是否有敏感文件
git diff --cached --name-only | grep -E "(test|debug|internal|local|guide|report)"
```

### 階段 4: Git 操作
- [ ] `git add` (確保包含 README.md)
- [ ] `git commit -m "chore: release vX.X.X - 描述"`
- [ ] `git tag vX.X.X`
- [ ] `git push origin main`
- [ ] `git push origin vX.X.X`

### 階段 5: 打包發布
- [ ] 執行 `bash internal/scripts/build.sh`
- [ ] 驗證 ZIP 文件內容
- [ ] 檢查文件大小

### 階段 6: GitHub Release
- [ ] 使用 `gh release create vX.X.X` 或手動創建
- [ ] 上傳 ZIP 文件
- [ ] 設置為最新版本
- [ ] 驗證 Release 頁面

### 階段 7: 最終驗證
- [ ] README 顯示正確版本
- [ ] Release 頁面正常
- [ ] ZIP 文件可下載
- [ ] 版本徽章更新

### 4️⃣ 新增文件特別審查
對於任何新增的文件，問自己：
- [ ] 這個文件是用戶需要的嗎？
- [ ] 這個文件包含本地路徑嗎？
- [ ] 這個文件包含內部流程嗎？
- [ ] 這個文件包含個人信息嗎？
- [ ] 這個文件如果公開會造成問題嗎？

**如果任何一個答案是「是」或「不確定」，就不要發布！**

---

## 🎯 發布原則

### 黃金規則
1. **默認不發布** - 除非確定需要公開，否則默認不發布
2. **用戶視角** - 只發布對用戶有用的文件
3. **無敏感信息** - 絕不包含本地路徑、個人信息、內部流程
4. **審查新文件** - 每個新文件都必須經過嚴格審查

### 三重檢查
1. ✅ **內容檢查** - 無本地路徑、無個人信息
2. ✅ **用途檢查** - 對用戶有價值、必須公開
3. ✅ **影響檢查** - 公開後不會造成安全或隱私問題

---

## 📊 已清理的文件統計

### 已從 GitHub 移除的文件（共 30+ 個）
- 10 個開發指南和測試文檔
- 8 個技術規格和優化文檔
- 4 個發布流程文檔
- 3 個協作和規劃文檔
- 2 個構建腳本
- 2 個功能對比和診斷文檔
- 其他內部文檔

**總計移除**: 約 5,000+ 行內部文檔和腳本

---

## ⚠️ 常見錯誤

### 易犯錯誤
1. ❌ 快速提交時忽略檢查新文件
2. ❌ 認為「只是文檔」就可以隨便發布
3. ❌ 沒有檢查文件中的本地路徑
4. ❌ 沒有從用戶視角審視文件價值

### 正確做法
1. ✅ 每次提交前運行檢查腳本
2. ✅ 新文件必須經過三重檢查
3. ✅ 使用 `.gitignore` 自動排除開發文檔
4. ✅ 定期審查已發布的文件

---

## 🛡️ 防護機制

### 已建立的防護
1. **完善的 .gitignore** - 自動排除開發文檔
2. **文件命名規範** - `*_INTERNAL.md`, `*_LOCAL.md`, `*_GUIDE.md` 等
3. **本地檢查清單** - 發布前必須檢查的項目
4. **定期審查** - 每月審查一次已發布的文件

---

## 📝 文檔維護指南

### 何時更新此文件

**必須更新的情況**:
1. ✅ **架構變更** - 添加/刪除核心目錄或文件
   - 例如：添加 `update-notification/` 目錄
   - 例如：移除 `script-injector.js`

2. ✅ **新增功能模塊** - 添加新的腳本或組件
   - 例如：新的標註系統
   - 例如：新的遷移腳本

3. ✅ **測試結構變更** - 測試目錄組織改變
   - 例如：添加 `tests/manual/`
   - 例如：重組測試文件

4. ✅ **配置文件變更** - 添加新的配置文件
   - 例如：添加 `codecov.yml`
   - 例如：添加新的構建配置

### 更新流程

```bash
# 1. 檢查項目結構
ls -la

# 2. 更新 PUBLISH_CHECKLIST.md 的「源代碼」部分

# 3. 提交更新
git add internal/guides/PUBLISH_CHECKLIST.md
git commit -m "docs: update PUBLISH_CHECKLIST for architecture changes"
```

### 維護責任

- **開發者**: 架構變更時同步更新
- **審查者**: 發布前驗證文檔準確性
- **定期審查**: 每季度檢查一次

---

**記住：寧可不發布，也不要錯誤發布！** 🔒

**最後更新**: 2025-10-07 (v2.8.1) - 更新源代碼結構，添加維護指南
