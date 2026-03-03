# 🧪 專案測試指南 (Testing Guide Hub)

**文檔性質：** AI Agent 測試流程入口 (Hub)
**創建日期：** 2025-10-05
**最後更新：** 2026-03-03

> [!CAUTION]
> **給 AI 開發者的嚴格警告 (Strict Warning for AI Agents):**
>
> 本專案嚴格遵守 TDD，不接受沒有測試覆蓋的核心邏輯變更。
> 在進行任何測試編寫與修復時，你必須無條件遵守以下兩大準則：

---

## 🛑 1. 強制調用測試心法 (Testing Pattern Skills)

我們不在此處重複教導 AAA 模式 (Arrange, Act, Assert) 或基本的 Mock 觀念。
撰寫測試時，必須交由最專業的測試技能進行指導：

- **若是 JavaScript 單元測試**：請調用或遵循 `javascript-testing-patterns` 技能。
- **若是 E2E (Playwright) 測試**：請調用或遵循 `e2e-testing-patterns` 技能。
- **若是開發新功能**：請調用 `test-driven-development` 技能 (先寫失敗的測試，才寫實作代碼)。

_如果你是 Antigravity Agent，請立即調用上述對應技能。_
_如果你是 Cursor 或 Claude Code，請在你的系統提示詞中回溯你對上述測試模式與 TDD 的最高標準理解。_

---

## 🧠 2. 強制載入專案領域知識庫 (Project Knowledge Base)

本專案特有的架構細節，例如 `chrome.storage` API 的生命週期清理要求、Service Worker 的直接注入 (Direct Script Injection) 模式，以及最低覆蓋率要求，已經全部抽離到可被機器讀取的結構化 JSON 檔案中。

在編寫或修復測試前，**你必須平行閱讀以下檔案，以獲取專案專屬的 Context：**

```json
// 包含 Chrome API Mocking、E2E 直接注入模式與 ESLint 規範
".agent/.shared/knowledge/testing_rules.json"
```

---

## 📁 測試目錄與常用指令 (給人類開發者)

- `tests/unit/` - Jest 單元測試。
- `tests/e2e/` - Playwright 擴充功能端到端測試。
- `tests/manual/` - 供開發者手動點擊驗證的 HTML 頁面（不會被發布打包）。

```bash
npm run test:quick         # 只有改動的檔案 (⚡ 日常推薦，約 30 秒)
npm run test:coverage      # 完整單元測試並產出覆蓋率 (PR 前門檻)
npm run test:all           # 包含 E2E 的地毯式完整測試
```

---

## 📚 相關內部架構文件

除了全局技巧，如需深入了解本專案的 E2E 基礎設施，請參閱：

- [`tests/e2e/COVERAGE-GUIDE.md`](../../tests/e2e/COVERAGE-GUIDE.md) - E2E 覆蓋率與 Jest 合併架構解密
