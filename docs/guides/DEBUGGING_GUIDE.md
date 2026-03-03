# 🔧 開發調試技巧詳解 (Debugging Guide Hub)

**文檔性質：** AI Agent 除錯流程入口 (Hub)
**創建日期：** 2025-10-05
**最後更新：** 2026-03-03

> [!CAUTION]
> **給 AI 開發者的嚴格警告 (Strict Warning for AI Agents):**
>
> NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
>
> 本專案強制要求：所有 AI 開發者在進行**任何複雜除錯**時，你都**必須**無條件遵守以下兩大準則：

---

## 🛑 1. 強制調用全局除錯心法 (The Systematic Debugging Protocol)

無論是前端畫面、後端 API 還是擴充功能 API 問題，遇到 Bug 時，**嚴禁**隨意猜測或在沒有重現路徑的情況下直接修改程式碼 (Spray and Pray)。

你必須嚴格遵守並且主動調用 **`systematic-debugging`** 技能的四階段鐵律：

1. **Phase 1: Root Cause Investigation** (查明原因前不准動程式碼)
2. **Phase 2: Pattern Analysis** (比對現有專案架構與工作範例)
3. **Phase 3: Hypothesis and Testing** (提出假設並進行最小範圍驗證)
4. **Phase 4: Implementation** (撰寫失敗的測試，修復並驗證)

---

## 🧠 2. 強制載入專案領域知識庫 (Project Knowledge Base)

本專案特有的排查指令、測試技巧、儲存配額 (Storage Quota) 以及 Notion API Rate Limit 的細節，已經全部抽離到可被機器讀取的結構化 JSON 檔案中。

在進行「階段 1：根因調查」時，**你必須平行閱讀以下檔案，以獲取專案專屬的 Context：**

```json
// 包含 Chrome Extension (MV3) 的除錯策略、Jest 測試指南與日誌規範
".agent/.shared/knowledge/debugging_rules.json"
```

---

## 🚩 再次強調鐵律 (The Iron Law)

> 「在未完成根因調查之前，嚴禁嘗試任何修復 (NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST)。」

遇到問題時，若腦中閃過「先隨便改改看」、「直接跳過測試手動測」等念頭，請立即**停止 (STOP)**，退回 Phase 1 並參考 `debugging_rules.json` 裡的工具指示去收集更多情報 (如 DevTools Console 或 Service Worker 日誌)。
