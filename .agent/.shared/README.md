# 🧠 跨代理共用知識與能力層 (Cross-Agent Shared Layer)

此目錄 (`.agent/.shared/`) 是本專案中所有 AI Agent (Planner, Coder, Reviewer) 的協作中樞。
它提供了單一真理來源 (Single Source of Truth) 與資源重用機制。

## 📂 目錄結構

### 1. `knowledge/` (靜態知識)

存放從 `docs/` 提取的結構化規範，供 Agent 機械式讀取 (Machine-Readable)。

- `notion_constraints.json`: Notion API 限制與結構定義。
- `message_bus.json`: Chrome Message Passing 路由表。

### 2. `memory/` (動態記憶)

存放專案的當前狀態與上下文，解決 Agent 遺忘問題。

- `linter_rules.json`: 當前專案的代碼風格偏好。

### 3. `mocks/` (測試資源)

存放標準化的 API 回傳範例，用於單元測試與邏輯驗證。

- `notion_api/`: 各種 Notion Block, Page, Database 的 JSON 結構。

### 4. `staging/` (暫存區)

Agent 在協作過程中的中間產物緩衝區。

## 🤖 Agent 使用規範

1.  **Read First**: 在生成代碼前，優先讀取 `knowledge/` 中的規範，而非依賴訓練數據。
2.  **Reuse**: 編寫測試時，優先引用 `mocks/` 中的數據，而非重新生成。
3.  **Update**: 當修改了 `docs/` 中的原始規範時，必須同步更新此處的 JSON。
