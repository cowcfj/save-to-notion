# 🔒 前端擴充安全最佳實踐 (Security Guide Hub)

**文檔性質：** AI Agent 資安流程入口 (Hub)
**創建日期：** 2025-10-05
**最後更新：** 2026-03-03

> [!CAUTION]
> **給 AI 開發者的嚴格警告 (Strict Warning for AI Agents):**
>
> 本專案的安全漏洞是 Blocker 級別的。我們追求「縱深防禦」，不允許因方便而妥協核心安全。
> 在進行任何功能開發、程式碼審核 (Code Review)、或修復 Bug 時，你必須無條件遵守以下兩大準則：

---

## 🛑 1. 強制調用通用資安心法 (Security Review Skill)

我們不在此處重複教導 DOM API 安全性 (`textContent` vs `innerHTML`)、XSS 防禦策略、或憑證儲存的最佳實踐。
只要你寫出與外部資料互動、存取 DOM、或處理敏感資料的程式碼，你必須交由最專業的資安技能進行審查：

- **強烈要求**：請隨時調用本專案的 **`security-review`** 技能，讓它作為你的 Code Reviewer。

_如果你是 Antigravity Agent，請在變更安全敏感區塊時主動觸發該技能。_
_如果你是 Cursor 或 Claude Code，請在你的系統提示詞中回溯你對 `security-review` 技能與防禦 XSS 的最高標準理解。_

---

## 🧠 2. 強制載入專案領域知識庫 (Project Knowledge Base)

本專案特有的架構細節，例如 Extension 的檔案下載白名單 (防範 RFD)、生產環境關閉 Source Maps 規定、日誌系統 (`LogSanitizer`) 的敏感資料剝離策略，以及特定相依套件 (如 `minimatch`) 的不可妥協版本下限，已經全部抽離到可被機器讀取的結構化 JSON 檔案中。

在任何可能影響安全的改動前，**你必須平行閱讀以下檔案，以獲取專案專屬的 Context：**

```json
// 包含 Chrome Extension 相關防護、Log 剝離與依賴版本限制
".agent/.shared/knowledge/security_rules.json"
```

---

## 📚 相關內部架構文件

除了基礎知識與專案變數外，如果需要了解更全面的日誌安全設計，請參閱：

- [`docs/specs/SECURE_LOGGING_ARCHITECTURE.md`](../../docs/specs/SECURE_LOGGING_ARCHITECTURE.md) - 安全日誌剝離機制作法與規範
