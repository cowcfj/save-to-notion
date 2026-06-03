# 🏛️ Architect SRP Hotspot Analysis (2024-06-03)

**Marker**: `JULES_CONTEXT_V1`

## 1. 🔍 Data Flow Map

- **網頁擷取 (Page Save Flow)**:
  User clicks Save (Popup/Sidepanel) → `chrome.runtime.sendMessage({ action: 'savePage' })` → Background `scripts/background/handlers/saveHandlers.js` (line 1240) → `chrome.tabs.sendMessage` to Content Script → `scripts/content/extractors/NextJsExtractor.js` (line 137, on Next.js sites) → Background orchestrates `NotionService` → `saveHandlers.js` sends `RUNTIME_ACTIONS.PAGE_SAVE_HINT` to UI (line 110).
- **設定頁面 (Options Flow)**:
  User toggles setting in `pages/options/options.html` → `pages/options/options.js` DOM events (line 110) → directly modifies `chrome.storage` (line 265) or receives background `chrome.runtime.onMessage` (line 213).

## 2. 🎯 Hotspot Table

| File                                            | Lines | Tangled Concerns                            | Plan Level | ADR Need | Coverage | Risk                   |
| ----------------------------------------------- | ----- | ------------------------------------------- | ---------- | -------- | -------- | ---------------------- |
| `pages/options/options.js`                      | 1078  | DOM UI / Message Handler / Storage I/O      | Standard   | N        | Covered  | Medium (UI events)     |
| `scripts/background/handlers/saveHandlers.js`   | 1523  | Orchestration / Error Formatting / UI Notif | Deep       | Y        | Covered  | High (Message bus)     |
| `scripts/content/extractors/NextJsExtractor.js` | 1591  | DOM Data Extraction / Notion Block Conv     | Standard   | N        | Covered  | Low (Local pure logic) |

## 3. 📝 Per-Hotspot Proposal

### Hotspot 1: `pages/options/options.js`

- **What it does today**: 處理 Options 頁面的所有 DOM 操作（如 `activateSidebarSection`，line 110）、直接讀取/寫入 `chrome.storage`（如 `initializeZoomPreference`，line 260），並監聽後台訊息（`bindOptionsRuntimeMessages`，line 212）。
- **Why it violates SRP**: 將視圖層 (View/DOM)、控制器層 (Controller) 以及外部 I/O (`chrome.storage`, `chrome.runtime.onMessage`) 混雜在同一個 1000 多行的檔案中。
- **Proposed split**:
  - `pages/options/OptionsController.js`: 負責管理訊息與初始化。
  - `pages/options/OptionsUI.js`: 負責所有的 DOM 操作（例如 `activateSidebarSection`, `initializeZoomPreference` 的 DOM 更新）。
- **Plan Level required**: Standard
- **ADR need**: N
- **Risk**: 拆分可能影響 UI 的事件綁定順序與生命週期。
- **Test coverage status**: Covered (`tests/unit/options/options.test.js` passed).
- **Rough size**: ~400 lines moved.

### Hotspot 2: `scripts/background/handlers/saveHandlers.js`

- **What it does today**: 處理儲存頁面的核心調度（line 1240），並混雜了大量的 UI 錯誤格式化邏輯（如 `buildSaveSuccessStatus` line 222，`formatErrorPhaseInfo` line 196）及跨分頁通知（`sendPageSaveHint` line 102）。
- **Why it violates SRP**: 檔案超過 1500 行，將 Background 的「核心業務流程控制」與「UI 呈現資料格式化」以及「Chrome Tab API 溝通」高度耦合。
- **Proposed split**:
  - `scripts/background/handlers/saveHandlers.js`: 僅保留核心業務邏輯。
  - `scripts/background/handlers/saveResponseFormatter.js`: 處理 `buildSaveSuccessStatus` 與所有錯誤格式化邏輯。
  - `scripts/background/handlers/saveTabNotifier.js`: 負責 `chrome.tabs.sendMessage` 與分頁操作（如 `openResolvedNotionPage`）。
- **Plan Level required**: Deep (touches message bus contract flow)
- **ADR need**: Y (Changes communication patterns)
- **Risk**: 跨模組拆分可能導致背景訊息回傳格式或時序不一致。
- **Test coverage status**: Covered (`tests/unit/background/handlers/saveHandlers.test.js` passed).
- **Rough size**: ~500 lines moved.

### Hotspot 3: `scripts/content/extractors/NextJsExtractor.js`

- **What it does today**: 檢測 Next.js 網頁，提取 `__NEXT_DATA__` JSON（line 36），並負責將 JSON 轉換為 Notion 的 Block 格式（line 46）。
- **Why it violates SRP**: 檔案達 1591 行，同時負責「從特定網頁結構提取資料」與「將資料轉換為 Notion Block 格式」這兩個無關的職責。
- **Proposed split**:
  - `scripts/content/extractors/NextJsExtractor.js`: 專注於擷取 `__NEXT_DATA__` 與頁面元資料。
  - `scripts/content/converters/NextJsBlockConverter.js`: 負責 `_convertHeadingBlock`, `_convertQuoteBlock` 等格式轉換邏輯。
- **Plan Level required**: Standard
- **ADR need**: N
- **Risk**: 轉換邏輯如果與提取資料結構過度耦合，重構可能需要調整參數傳遞。
- **Test coverage status**: Covered (`tests/unit/content/extractors/NextJsExtractor.test.js` passed).
- **Rough size**: ~800 lines moved.

## 4. 📈 Recommended Ordering

1. **`scripts/content/extractors/NextJsExtractor.js`**: 低風險，純邏輯拆分，不影響外部合約與狀態。
2. **`pages/options/options.js`**: 中風險，僅限前端 UI 分離。
3. **`scripts/background/handlers/saveHandlers.js`**: 高風險，需要 Deep Plan 與 ADR，建議在其他項目完成並確認穩定後再進行。

## 5. 🚫 Out-of-Scope Findings

目前所選取的 3 個 Hotspots 都有對應的 Jest 單元測試覆蓋（`tests/unit/` 中均有對應的 test.js 且成功執行）。對於涉及 OAuth 的路徑，如 `AuthManager.js` 與 `notionAuth.js`，雖然可能違反 SRP，但因為風險過高且有安全顧慮（近期發生過 OAuth 相關事件），本次掃描暫不建議重構。
