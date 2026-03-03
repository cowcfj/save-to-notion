# 📚 Notion API 開發模式指南 (API Patterns Hub)

**文檔性質：** AI Agent 專用流程指南與入口 (Hub)

> [!CAUTION]
> **給 AI 開發者的嚴格警告 (Strict Warning for AI Agents):**
> 本文件僅定義語法結構規範。
> 關於 Notion API 的速率限制、區塊數量上限、字元長度限制、以及當前鎖定的 API 版本等具體參數，**你必須且只能參照單一真理庫：**
>
> ```json
> ".agent/.shared/knowledge/notion_constraints.json"
> ```
>
> **嚴禁在此處或其他任何地方自行定義或猜測參數上限。**

---

## 1. 🛑 測試與驗證協議 (Mandatory QA Protocol)

當你修改任何涉及 Notion API 的底層核心邏輯（保存頁面、標註高亮、結構遷移）後，**必須**透過我們的自製測試技能來驗證你的改動是否造成退化：

- **強制觸發技能**：請主動調閱 **`.agent/skills/notion-qa`** 技能，了解如何啟動我們的端到端 (E2E) 測試套件（`run_e2e_suite.py`），並確保通過所有測試。

---

## 2. 🏗️ 架構規範：NotionService 優先

全專案禁止在 UI 層或其他 Content Script 中直接實例化 Notion SDK (`new Client()`) 或直接發送原始的 HTTP Request (`fetch`) 至 Notion。所有對 Notion 的操作，**必須**透過 `NotionService` 進行封裝轉換。

### 我們為何如此堅持？

- **統一攔截與退避 (Rate Limiting Resilience)**：`NotionService` 集中處理了 429 與 5xx 錯誤的指數退避策略。
- **統一錯誤脫敏 (Security over Logging)**：捕捉到的 `NotionClientError` 都會在其內部經過 `sanitizeApiError` 處理，剝離可能包含 Token 的原始 Request URL 後，方可進入日誌。

---

## 3. ⚙️ SDK 呼叫模式 (@notionhq/client)

當在 `NotionService` 內部開發新功能時，請遵循以下模式：

### 3.1 執行管道 (The Pipeline)

不要直接調用 SDK 的底層方法，應將其包裹進由專案提供的內部重試包裝器 (如 `_executeWithRetry`)。

```javascript
// ✅ 推薦模式
async myNewFeature(data) {
  return await this._executeWithRetry(
    client => client.pages.create(data),
    { label: 'CreateSomething', maxRetries: 3 }
  );
}
```

### 3.2 處理分頁 (Pagination)與迴圈

當獲取列表（例如查詢 Block Children）時，必須實作 `start_cursor` 與 `has_more` 的非同步迴圈邏輯。在單次迴圈迭代之間，系統應根據真理庫定義的延遲毫秒數進行節流 (Throttle)。

### 3.3 圖片長度攔截（URL 長度防禦）

Notion API 對於外部圖片 URL 具有強韌的長度限制（請參照 Knowledge Base 上的絕對規定）。在發送批次 Payload 之前，務必呼叫類似 `filterValidImageBlocks` 的清理程序來剔除 Base64 或過長網址的圖片，防止該筆 Request 整批翻車。
