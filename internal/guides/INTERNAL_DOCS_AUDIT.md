# 📋 內部文檔審查報告

**審查日期：** 2025年10月5日  
**審查範圍：** `internal/guides/` 目錄所有文檔  
**目的：** 確認每個文檔的作用和 AI Agent 是否遵循

---

## 📊 文檔清單總覽

| 文檔 | 大小 | 狀態 | AI 是否遵循 | 優先級 |
|------|------|------|------------|--------|
| **AI_AGENT_QUICK_REF.md** | 2.0K | ✅ 活躍 | ✅ 是 | 🔴 高 |
| **GITHUB_SYNC_POLICY.md** | 10K | ✅ 活躍 | ✅ 是 | 🔴 高 |
| **DOCUMENTATION_STRATEGY.md** | 11K | ✅ 活躍 | ⚠️ 部分 | 🟡 中 |
| **PROJECT_ROADMAP.md** | 9.0K | ⚠️ 過時 | ⚠️ 部分 | 🟡 中 |
| **PROJECT_STANDARDS.md** | 4.5K | ✅ 活躍 | ✅ 是 | 🔴 高 |
| **AI_COPILOT_GUIDE_INTERNAL.md** | 11K | ❓ 重複 | ❌ 否 | 🔵 低 |
| **GOALS.md** | 4.7K | ⚠️ 過時 | ❌ 否 | 🔵 低 |
| **IMAGE_EXTRACTION_GUIDE.md** | 5.0K | ✅ 活躍 | ⚠️ 參考 | 🟢 技術 |
| **MCP_SETUP_GUIDE.md** | 6.2K | ✅ 活躍 | ❌ 否 | 🟢 技術 |
| **NEXT_STEPS_ACTION_PLAN.md** | 6.2K | ⚠️ 過時 | ❌ 否 | 🔵 低 |
| **PROJECT_EVALUATION_REPORT.md** | 13K | ⚠️ 過時 | ❌ 否 | 🔵 低 |
| **QUICK_START.md** | 6.2K | ⚠️ 過時 | ❌ 否 | 🔵 低 |
| **UI_IMPROVEMENT_v2.7.2.md** | 8.8K | ⚠️ 過時 | ❌ 否 | 🔵 低 |
| **UPGRADE_DATA_SAFETY.md** | 4.6K | ✅ 活躍 | ⚠️ 參考 | 🟢 技術 |
| **diagnose-mcp.md** | 3.9K | ✅ 活躍 | ❌ 否 | 🟢 技術 |

---

## 🔴 核心指導文檔（AI 必須遵循）

### 1️⃣ AI_AGENT_QUICK_REF.md
**狀態：** ✅ 活躍使用  
**AI 遵循：** ✅ 是  
**作用：** 快速參考卡，關鍵規則提醒

**核心內容：**
- 🌐 語言規範（繁體中文）
- 📝 Release Notes 格式
- 🔗 Chrome 商店連結
- 📂 文件分類規則
- ✍️ Commit 訊息範例

**重要性：** ⭐⭐⭐⭐⭐  
**建議：** 保持現狀，定期更新

---

### 2️⃣ GITHUB_SYNC_POLICY.md
**狀態：** ✅ 活躍使用  
**AI 遵循：** ✅ 是  
**作用：** GitHub 同步安全策略

**核心原則：**
- ⚡ 默認不同步原則
- 🤔 疑惑時先詢問
- ✅ 白名單：應該同步的文件
- ❌ 黑名單：不應該同步的文件

**重要性：** ⭐⭐⭐⭐⭐  
**建議：** 
- AI Agent 必須嚴格遵循
- 每次 git commit 前檢查
- 與 Agents.md 的 GitHub 同步安全原則保持一致

---

### 3️⃣ PROJECT_STANDARDS.md
**狀態：** ✅ 活躍使用  
**AI 遵循：** ✅ 是  
**作用：** 專案重要規範與資訊

**核心內容：**
- 🌐 語言規範（簡繁對照表）
- 📝 Release Notes 規範
- 🔗 Chrome 商店連結
- 📊 版本號規則

**重要性：** ⭐⭐⭐⭐⭐  
**建議：**
- 內容與 AI_AGENT_QUICK_REF.md 高度重疊
- 考慮合併或明確分工
- 建議：PROJECT_STANDARDS.md 作為詳細版本，AI_AGENT_QUICK_REF.md 作為精簡版本

---

## 🟡 策略指導文檔（AI 應理解並參考）

### 4️⃣ DOCUMENTATION_STRATEGY.md
**狀態：** ✅ 活躍  
**AI 遵循：** ⚠️ 部分遵循  
**作用：** 文檔管理策略

**核心策略：**
- 📄 README.md - 用戶入口（簡潔）
- 📚 CHANGELOG.md - 完整歷史（分組折疊）
- 📋 RELEASE_NOTES_v*.md - 個別發布公告

**重要性：** ⭐⭐⭐⭐  
**當前問題：**
- AI 有時會違反"簡潔原則"，在 Release Notes 中寫入過多細節
- 需要強化"只列要點+詳細連結"的規則

**建議：**
- 將核心規則摘要添加到 AI_AGENT_QUICK_REF.md
- AI 在生成 Release Notes 前必須檢查此策略

---

### 5️⃣ PROJECT_ROADMAP.md
**狀態：** ⚠️ 過時  
**AI 遵循：** ⚠️ 部分參考  
**作用：** 項目發展計劃

**內容：**
- 📊 功能分類和優先級
- 🔴🟡🔵 高/中/低優先級功能
- 📅 預計工期和技術風險

**重要性：** ⭐⭐⭐  
**當前問題：**
- 文檔版本：v1.0（2025年9月29日）
- 當前版本：已到 v2.7.3，文檔中標註 v2.4.8
- 許多功能已實現或計劃改變

**建議：**
- 需要更新到 v2.7.3 現狀
- 更新已實現功能狀態
- 調整優先級反映當前計劃

---

## 🟢 技術參考文檔（特定場景使用）

### 6️⃣ IMAGE_EXTRACTION_GUIDE.md
**狀態：** ✅ 活躍  
**AI 遵循：** ⚠️ 需要時參考  
**作用：** 圖片提取技術指南

**內容：**
- 🖼️ 多來源 Icon 提取策略
- 📸 封面圖識別邏輯
- 🔄 圖片 URL 清理方法

**重要性：** ⭐⭐⭐  
**建議：** 保留作為技術參考，當處理圖片相關問題時查閱

---

### 7️⃣ UPGRADE_DATA_SAFETY.md
**狀態：** ✅ 活躍  
**AI 遵循：** ⚠️ 需要時參考  
**作用：** 數據升級安全指南

**內容：**
- 🔒 版本升級數據保護策略
- 📦 向後兼容原則
- 🔄 數據遷移最佳實踐

**重要性：** ⭐⭐⭐⭐  
**建議：** 在進行版本升級或數據結構變更時必須參考

---

### 8️⃣ MCP_SETUP_GUIDE.md & diagnose-mcp.md
**狀態：** ✅ 活躍  
**AI 遵循：** ❌ 特定場景  
**作用：** Model Context Protocol 設置和診斷

**重要性：** ⭐⭐  
**建議：** 僅在 MCP 相關問題時使用，非日常指南

---

## 🔵 過時/重複文檔（需要清理）

### 9️⃣ AI_COPILOT_GUIDE_INTERNAL.md
**狀態：** ❓ 與 Agents.md 重複  
**AI 遵循：** ❌ 否（應遵循 Agents.md）  
**問題：** 11KB，內容與 Agents.md 高度重疊

**建議：** ⚠️ 刪除或合併到 Agents.md

---

### 🔟 GOALS.md
**狀態：** ⚠️ 過時（2025年9月29日）  
**AI 遵循：** ❌ 否  
**內容：** 項目目標和願景

**問題：** 內容可能已過時，與當前 v2.7.3 狀況不符

**建議：** 更新或歸檔

---

### 1️⃣1️⃣ NEXT_STEPS_ACTION_PLAN.md
**狀態：** ⚠️ 過時  
**AI 遵循：** ❌ 否  
**內容：** 下一步行動計劃

**問題：** 時效性文檔，可能已完成或改變

**建議：** 檢查內容，已完成項目應歸檔

---

### 1️⃣2️⃣ PROJECT_EVALUATION_REPORT.md
**狀態：** ⚠️ 過時報告  
**AI 遵循：** ❌ 否  
**內容：** 13KB 項目評估報告

**問題：** 歷史報告，參考價值有限

**建議：** 移至 archive/reports/ 目錄

---

### 1️⃣3️⃣ QUICK_START.md
**狀態：** ⚠️ 包含本地路徑  
**AI 遵循：** ❌ 否  
**內容：** 快速開始指南（開發者用）

**問題：** 已在 .gitignore 中排除，包含本地設置

**建議：** 保持為本地開發參考文件

---

### 1️⃣4️⃣ UI_IMPROVEMENT_v2.7.2.md
**狀態：** ⚠️ 版本特定文檔  
**AI 遵循：** ❌ 否  
**內容：** v2.7.2 UI 改進計劃

**問題：** 版本特定，現已到 v2.7.3

**建議：** 如果已完成，移至 archive/versions/

---

## 🎯 AI Agent 應該遵循的優先級

### 🔴 必須嚴格遵循（每次都檢查）
1. **Agents.md** - 主要工作指南
2. **AI_AGENT_QUICK_REF.md** - 快速參考卡
3. **GITHUB_SYNC_POLICY.md** - 同步安全策略
4. **PROJECT_STANDARDS.md** - 語言和格式規範

### 🟡 應該理解並參考（特定場景）
5. **DOCUMENTATION_STRATEGY.md** - 生成文檔時遵循
6. **PROJECT_ROADMAP.md** - 了解項目方向（需更新）
7. **UPGRADE_DATA_SAFETY.md** - 數據變更時參考

### 🟢 技術參考（問題相關時查閱）
8. **IMAGE_EXTRACTION_GUIDE.md** - 圖片處理
9. **MCP_SETUP_GUIDE.md** - MCP 相關
10. **diagnose-mcp.md** - MCP 診斷

### 🔵 歸檔或清理（不需遵循）
11. **AI_COPILOT_GUIDE_INTERNAL.md** - 刪除/合併
12. **GOALS.md** - 更新或歸檔
13. **NEXT_STEPS_ACTION_PLAN.md** - 檢查後歸檔
14. **PROJECT_EVALUATION_REPORT.md** - 移至 archive/
15. **QUICK_START.md** - 保持本地參考
16. **UI_IMPROVEMENT_v2.7.2.md** - 移至 archive/

---

## 📋 立即行動清單

### ✅ 立即執行
1. [ ] 更新 PROJECT_ROADMAP.md 到 v2.7.3 現狀
2. [ ] 將 DOCUMENTATION_STRATEGY 核心規則添加到 AI_AGENT_QUICK_REF.md
3. [ ] 刪除 AI_COPILOT_GUIDE_INTERNAL.md（與 Agents.md 重複）
4. [ ] 檢查 NEXT_STEPS_ACTION_PLAN.md 是否已完成

### ⏳ 近期執行
5. [ ] 創建 archive/reports/ 目錄
6. [ ] 移動 PROJECT_EVALUATION_REPORT.md 到 archive/reports/
7. [ ] 移動 UI_IMPROVEMENT_v2.7.2.md 到 archive/versions/
8. [ ] 更新 GOALS.md 或移至 archive/

### 🔄 持續維護
9. [ ] 定期檢查內部文檔的時效性
10. [ ] 確保 AI Agent 遵循核心指導文檔
11. [ ] 新增規則時同步到 AI_AGENT_QUICK_REF.md

---

**審查結論：**
- ✅ 核心指導文檔架構清晰（4個文件）
- ⚠️ 存在重複內容需要合併（AI_COPILOT_GUIDE_INTERNAL.md）
- ⚠️ 部分文檔過時需要更新（PROJECT_ROADMAP.md, GOALS.md）
- ✅ 技術參考文檔有用但不需要 AI 日常遵循
- 🎯 AI Agent 現在應聚焦於 4 個核心文檔 + 特定場景參考

**最後更新：** 2025年10月5日
