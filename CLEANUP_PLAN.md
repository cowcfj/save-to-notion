# 🧹 項目清理計劃 v2.6.1

**日期：** 2025年10月3日  
**當前版本：** v2.6.1  
**根目錄 MD 文件數：** 55 個  
**Git 追蹤的 MD 文件：** 12 個

---

## 📊 現況分析

### ✅ 好消息
- **大部分內部文檔已被 .gitignore 排除**
- **Git 倉庫中只有 12 個 MD 文件被追蹤**
- **內部文檔保留在本地，不會被提交**

### ⚠️ 需要清理
- **根目錄有 55 個 MD 文件**（其中 43 個僅在本地）
- **有 9 個明確無用的文件需要刪除**
- **1 個文件需要從 Git 倉庫移除**

---

## 🎯 清理目標

| 類別 | 當前 | 目標 | 減少 |
|------|------|------|------|
| 根目錄 MD 文件 | 55 | 15 | -73% |
| Git 追蹤的 MD | 12 | 11 | -1 |
| 無用測試文檔 | 9 | 0 | -100% |

---

## 📋 詳細清理清單

### ✅ 階段 1：刪除本地無用文件（9 個文件）

#### 1.1 舊版本測試文檔（6 個）
```bash
TEST_GUIDE_v2.5.3.md
TEST_GUIDE_v2.5.6.md
TEST_GUIDE_v2.5.7.md
TEST_GUIDE_v2.6.0.md
QUICK_TEST_v2.5.0_PATCH3.md
QUICK_TEST_v2.5.7.md
```
- **狀態：** 僅本地存在（✓ 未在 Git 中）
- **原因：** v2.6.1 已發布，舊版本測試指南已無用
- **操作：** 直接刪除

#### 1.2 舊格式發布文檔（1 個）
```bash
RELEASE_v2.5.3.md
```
- **狀態：** 僅本地存在（✓ 未在 Git 中）
- **原因：** 格式已被 `RELEASE_NOTES_v*.md` 取代
- **操作：** 直接刪除

#### 1.3 臨時 GitHub 發布文檔（2 個）
```bash
github-release-description.md
github-release-v2.4.8.md
```
- **狀態：** 僅本地存在（✓ 未在 Git 中）
- **原因：** 臨時文檔，發布後應刪除
- **操作：** 直接刪除

---

### ⚠️ 階段 2：從 Git 倉庫移除（1 個文件）

#### 2.1 MCP 診斷文檔
```bash
diagnose-mcp.md
```
- **狀態：** ❌ 在 Git 中被追蹤
- **原因：** 包含 MCP 設置的內部診斷信息
- **操作：** 從 Git 移除但保留本地
- **命令：**
  ```bash
  git rm --cached diagnose-mcp.md
  ```

---

### 📝 階段 3：評估可選清理（5 個文件）

#### 3.1 過時/未實現的功能文檔
```bash
COLLABORATION_PROPOSAL.md     # 合作提案（可能已過時）
FEATURE_COMPARISON.md         # 功能比較（可能已過時）
GOALS.md                      # 項目目標（可能已過時）
GOOGLE_DRIVE_BACKUP_SPEC.md  # 未實現的功能規範
```
- **建議：** 閱讀後決定，如已過時可刪除

#### 3.2 舊版本發布摘要
```bash
RELEASE_SUMMARY_v2.5.6.md
RELEASE_SUMMARY_v2.5.7.md
```
- **建議：** 如果 RELEASE_NOTES 已包含相同信息，可刪除

#### 3.3 測試 HTML 文件
```bash
image-extraction-test.html  # 根目錄
```
- **建議：** 移動到 tests/ 目錄或刪除

---

### 🔒 階段 4：確保目錄被忽略

#### 4.1 檢查 .gitignore
```bash
build/
release/
archive/
demos/
```

#### 4.2 執行檢查
```bash
git status | grep -E "build/|release/|archive/"
```

---

## 🚀 執行步驟

### 步驟 1：刪除明確無用的文件
```bash
# 執行批量刪除
rm TEST_GUIDE_v2.5.3.md \
   TEST_GUIDE_v2.5.6.md \
   TEST_GUIDE_v2.5.7.md \
   TEST_GUIDE_v2.6.0.md \
   QUICK_TEST_v2.5.0_PATCH3.md \
   QUICK_TEST_v2.5.7.md \
   RELEASE_v2.5.3.md \
   github-release-description.md \
   github-release-v2.4.8.md

# 確認刪除
ls -1 *.md | wc -l  # 應該顯示 46（55-9）
```

### 步驟 2：從 Git 移除 diagnose-mcp.md
```bash
# 從 Git 移除但保留本地文件
git rm --cached diagnose-mcp.md

# 確認狀態
git status
```

### 步驟 3：（可選）清理其他文件
```bash
# 評估後決定是否刪除
# rm COLLABORATION_PROPOSAL.md FEATURE_COMPARISON.md GOALS.md
# rm GOOGLE_DRIVE_BACKUP_SPEC.md
# rm RELEASE_SUMMARY_v2.5.6.md RELEASE_SUMMARY_v2.5.7.md
```

### 步驟 4：提交更改
```bash
git add -A
git commit -m "chore: 清理項目文件結構

- 刪除 9 個過時的測試和發布文檔
- 從 Git 移除 diagnose-mcp.md（保留本地）
- 減少根目錄 MD 文件數量 73% (55 → 15)
- 提升項目文檔清晰度"
```

---

## 📊 預期結果

### 文件數量
- ✅ 根目錄 MD 文件：**55 → 46** (-16%)
- ✅ Git 追蹤的 MD：**12 → 11** (-1)
- ✅ 無用測試文檔：**9 → 0** (-100%)

### 保留的核心文件
```bash
✅ README.md                  # 項目說明
✅ CHANGELOG.md               # 變更日誌
✅ PRIVACY.md                 # 隱私政策
✅ MIGRATION_GUIDE.md         # 遷移指南
✅ PROJECT_ROADMAP.md         # 發展計劃
✅ Agents.md                  # AI Agent 指南
✅ help.html                  # 幫助文檔

✅ RELEASE_NOTES_v2.6.1.md    # 當前版本
✅ RELEASE_NOTES_v2.6.0.md    # 上一版本
✅ RELEASE_NOTES_v2.5.7.md    # v2.5.7
✅ RELEASE_NOTES_v2.5.6.md    # v2.5.6
✅ RELEASE_NOTES_v2.5.5.md    # v2.5.5
✅ RELEASE_NOTES_v2.5.4.md    # v2.5.4
✅ RELEASE_NOTES_v2.5.3.md    # v2.5.3
✅ RELEASE_NOTES_v2.5.md      # v2.5.0
```

### 保留在本地的內部文檔
```bash
✅ QUICK_START.md             # 開發快速開始
✅ MCP_SETUP.md               # MCP 設置
✅ DEPLOYMENT_CHECKLIST.md    # 部署檢查
✅ TESTING_GUIDE.md           # 測試指南
✅ diagnose-mcp.md            # MCP 診斷（從 Git 移除）
# ... 其他內部文檔（已在 .gitignore）
```

---

## ⚠️ 重要提醒

1. **備份確認**
   - ✅ 這些文件僅是過時的測試文檔
   - ✅ 重要信息已遷移到新版本文檔
   - ✅ 內部文檔保留在本地

2. **Git 狀態**
   - ✅ 大部分內部文檔已被 .gitignore 排除
   - ✅ 只需從 Git 移除 1 個文件（diagnose-mcp.md）
   - ✅ 不影響任何生產代碼

3. **版本影響**
   - ✅ 不影響 v2.6.1 發布
   - ✅ 清理後更易維護
   - ✅ 新貢獻者更容易理解項目結構

---

## ✅ 檢查清單

執行前確認：
- [ ] 已閱讀清理計劃
- [ ] 了解將刪除哪些文件
- [ ] 確認這些文件確實無用
- [ ] 準備好執行命令

執行後確認：
- [ ] 文件已刪除
- [ ] diagnose-mcp.md 已從 Git 移除但本地保留
- [ ] Git 狀態正常
- [ ] 提交清理更改
- [ ] 推送到遠程倉庫

---

**準備好開始清理了嗎？**
