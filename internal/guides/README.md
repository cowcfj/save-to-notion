# 📚 Internal Guides 目錄

**用途：** 開發指南和技術文檔集合，供 AI Agent 和開發者參考

---

## 🔴 核心指導文檔（必讀）

這些文檔定義了項目的核心規範和策略，AI Agent 應該熟悉：

| 文檔 | 用途 | 何時閱讀 |
|------|------|---------|
| **GITHUB_SYNC_POLICY.md** | GitHub 同步安全策略 | 每次 git commit 前 |
| **GOALS.md** | 項目目標和發展計劃 | 規劃新功能時 |
| **PROJECT_STANDARDS.md** | 語言規範、格式、連結 | 創建文檔或 commit 時 |
| **DOCUMENTATION_STRATEGY.md** | 文檔管理策略 | 更新文檔時 |
| **PUBLISH_CHECKLIST.md** | 發布安全審查指南 | 發布新版本前 |
| **GITHUB_RELEASE_TEMPLATE.md** | Release Notes 寫作指南 | 撰寫 Release Notes 時 |

> 💡 這些文檔已在 `Agents.md` 的「常用文檔」章節中引用

---

## 🟢 技術參考文檔（按需閱讀）

這些文檔提供特定技術的詳細指南：

### MCP 相關
| 文檔 | 用途 |
|------|------|
| **MCP_USAGE_GUIDELINES.md** | MCP 使用完備準則（30K+） |
| **FETCH_MCP_GUIDE.md** | Fetch MCP 詳細使用指南 |
| **SEQUENTIAL_THINKING_MCP_GUIDE.md** | Sequential Thinking MCP 詳細使用指南 |
| **diagnose-mcp.md** | MCP 診斷檢查清單 |
| **MCP_SYNC_QUICK_START.md** | MCP 配置同步快速指南 |
| **MCP_SYNC_SOLUTION.md** | MCP 配置跨設備同步方案 |

### 功能相關
| 文檔 | 用途 |
|------|------|
| **IMAGE_EXTRACTION_GUIDE.md** | 圖片提取技術指南 |

> 💡 MCP 核心文檔已在 `Agents.md` 的「MCP 使用準則」章節中引用

---

## 🔵 歷史記錄文檔（參考用）

這些文檔記錄了特定版本或歷史對話的內容：

| 文檔 | 類型 | 說明 |
|------|------|------|
| **INTERNAL_DOCS_AUDIT.md** | 審查報告 | 2025-10-05 文檔審查 |
| **UPGRADE_DATA_SAFETY.md** | 對話報告 | 數據升級安全討論 |
| **QUICK_START.md** | 版本指南 | v2.5.0 快速啟動 |
| **UI_IMPROVEMENT_v2.7.2.md** | 版本說明 | v2.7.2 UI 改進 |
| **USER_GUIDE_v2.7.0.md** | 版本指南 | v2.7.0 用戶指南 |

---

## 🎯 快速查找

### 按使用場景查找文檔：

**我要創建 GitHub Issue**
→ 先讀 `GOALS.md` 確認計劃，再讀 `GITHUB_SYNC_POLICY.md`

**我要更新文檔**
→ 讀 `DOCUMENTATION_STRATEGY.md` 和 `PROJECT_STANDARDS.md`

**我要使用 MCP**
→ 讀 `MCP_USAGE_GUIDELINES.md`，需要詳細場景時讀對應的 `*_MCP_GUIDE.md`

**我要提交代碼**
→ 讀 `GITHUB_SYNC_POLICY.md` 和 `PROJECT_STANDARDS.md`

**我要發布新版本**
→ 讀 `PUBLISH_CHECKLIST.md` 和 `GITHUB_RELEASE_TEMPLATE.md`

**我要規劃新功能**
→ 讀 `GOALS.md` 了解優先級和計劃

**MCP 出問題了**
→ 讀 `diagnose-mcp.md` 進行故障排除

---

## 📝 添加新文檔指引

### 1. 確定文檔類型
- **核心指導** - 定義規範和策略
- **技術參考** - 特定技術的詳細指南
- **歷史記錄** - 版本特定或對話記錄

### 2. 命名規範
- 核心指導：`UPPERCASE_NAME.md`
- 技術參考：`FEATURE_NAME_GUIDE.md`
- 歷史記錄：`NAME_vX.X.X.md` 或 `NAME_REPORT.md`

### 3. 更新相關文檔
- [ ] 更新本 README.md
- [ ] 如果是核心指導，在 `Agents.md` 中添加引用
- [ ] 更新 `INTERNAL_GUIDES_ANALYSIS.md`（如需要）

---

## 📊 統計

- **總文檔數：** 18 個
- **核心指導：** 6 個
- **技術參考：** 7 個
- **歷史記錄：** 5 個

---

## 🔗 相關文檔

- **詳細分析：** `internal/reports/INTERNAL_GUIDES_ANALYSIS.md`
- **AI Agent 指南：** `Agents.md`
- **快速參考：** `AI_AGENT_QUICK_REF.md`

---

**最後更新：** 2025-10-07
