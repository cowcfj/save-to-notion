# 🏛️ Architecture Review Report (2026-07-03)

JULES_CONTEXT_V1

## 模塊 1: 資料流地圖 (Data Flow Map)

- **用戶配置更新:** 偏好設定自動保存於 `pages/options/options.js:287` -> 寫入 `chrome.storage.sync`；認證與資料來源狀態刷新由 `pages/options/AuthManager.js:359` 讀取 `chrome.storage.local` / `chrome.storage.sync`。
- **內容圖片收集:** `scripts/content/index.js:316` -> 委派給 `scripts/content/extractors/ImageCollector.js:828`
- **資料儲存至 Notion:** 用戶操作觸發 `chrome.runtime.sendMessage` -> 接收於 `scripts/background/handlers/saveHandlers.js:1279` -> `scripts/background/handlers/saveHandlers.js:917` 呼叫 `scripts/background/services/NotionService.js:841` -> 使用 `@notionhq/client`。

## 模塊 2: 熱點清單 (Hotspot Table)

| 檔案 (File)                                    | 行數 (Lines) | 耦合問題 (Concerns Tangled)                                                                                 | 計畫級別 (Plan Level) | 需要 ADR (ADR Need)       | 測試覆蓋率 (Test Coverage)          | 風險評估 (Risk) |
| ---------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------- | ----------------------------------- | --------------- |
| `scripts/content/extractors/ImageCollector.js` | 1449         | 圖片尋找邏輯 (如 85 行 DOM 提取) 與驗證規則 (如 208 / 444 行)、批次邏輯 (如 1416 行) 混雜。                 | Standard              | N                         | High (`ImageCollector.test.js`, 等) | 低 (Low)        |
| `pages/options/options.js`                     | 1187         | 側邊欄 UI 結構切換 (如 120 / 1011 行) 與直接操作 `chrome.storage.sync` 的設定保存 (如 287 行) 混雜。        | Deep                  | Y (涉及 storage keys)     | High                                | 中 (Medium)     |
| `scripts/background/handlers/saveHandlers.js`  | 1557         | Message 驗證 (如 721 / 1279 行) 與核心 Notion 儲存邏輯 (如 917 行)、錯誤 UI 格式化 (如 196 / 200 行) 混雜。 | Deep                  | Y (涉及 Message Contract) | High                                | 高 (High)       |

## 模塊 3: 針對性重構提案 (Per-Hotspot Proposal)

### 熱點 1: `scripts/content/extractors/ImageCollector.js`

- **當前職責 (What it does today):** 負責尋找、驗證、計算尺寸、過濾並組織頁面上的所有圖片。包含原生的 DOM 操作 (line 85 / 171)、NextJS JSON 解析 (line 1079) 以及批次執行的編排 (line 1416)。
- **違反 SRP 原因 (Why it violates SRP):** 將從不同來源取得圖片的機制與圖片的驗證和尺寸限制邏輯 (line 208 / 444)、以及最終的批次流程編排混為一談。
- **重構提案 (Proposed split):**
  - `ImageDiscovery.js` (負責不同來源的圖片獲取策略)
  - `ImageEvaluation.js` (負責 URL 驗證與尺寸評估)
  - `ImageCollector.js` (僅負責流程協調與批次執行)
- **計畫級別 (Plan Level required):** Standard
- **需要 ADR (ADR need):** N
- **風險 (Risk):** 若邊界劃分不清，可能遺漏邊緣案例的圖片。
- **測試覆蓋狀態 (Test coverage status):** Covered (具備完善覆蓋，如 `ImageCollector.collection-strategies.test.js`)
- **預估規模 (Rough size):** 約 400 LOC，可輕易拆分為獨立 PR。

### 熱點 2: `pages/options/options.js`

- **當前職責 (What it does today):** 負責整個 Options 頁面的啟動、側邊欄導航 (line 120)、直接寫入 `chrome.storage.sync` 來保存使用者的偏好設定 (line 287)。
- **違反 SRP 原因 (Why it violates SRP):** 嚴重耦合了 UI 結構與事件綁定、以及直接的存儲訪問。
- **重構提案 (Proposed split):**
  - `OptionsApp.js` (主入口，處理核心啟動與依賴注入)
  - `PreferenceStore.js` (封裝針對 `chrome.storage` 的讀寫邏輯)
  - `DestinationProfileController.js` (專注於 Destination Profile 的 UI 操作)
- **計畫級別 (Plan Level required):** Deep (根據規則，修改 `chrome.storage` 的存取方式需要 Deep Plan)
- **需要 ADR (ADR need):** Y (改變了存儲的互動模式)
- **風險 (Risk):** 存儲更新可能無法即時反映在其他背景服務。
- **測試覆蓋狀態 (Test coverage status):** Covered (如 `optionsController.test.js`)
- **預估規模 (Rough size):** 約 500 LOC。

### 熱點 3: `scripts/background/handlers/saveHandlers.js`

- **當前職責 (What it does today):** 處理整個 `savePage` 和 `saveContent` 流程。包含發送者驗證 (line 266)、錯誤解析 (line 196) 及 Notion API 的編排。
- **違反 SRP 原因 (Why it violates SRP):** Message Bus 的邊界合約驗證與核心的 Notion 存檔邏輯、還有 UI 反饋 (錯誤與 toast) 混在同一個巨大的檔案中。
- **重構提案 (Proposed split):**
  - `SaveRequestHandler.js` (專職 Message 邊界驗證與防護)
  - `SaveBusinessLogic.js` (編排 Notion API 儲存)
  - `SaveResponseFormatter.js` (錯誤標準化與 UI toast 構建)
- **計畫級別 (Plan Level required):** Deep (修改 message bus handler 結構，即使合約本身未改變也存在極大風險)
- **需要 ADR (ADR need):** Y (改動 Message Bus handler 的職責劃分)
- **風險 (Risk):** 最核心的儲存功能可能因為訊息合約遺漏而徹底損壞。
- **測試覆蓋狀態 (Test coverage status):** Covered (`saveHandlers.actions.test.js`, `saveHandlers.savePage.test.js`)
- **預估規模 (Rough size):** 約 600 LOC。

## 模塊 4: 推薦執行順序 (Recommended Ordering)

1. `scripts/content/extractors/ImageCollector.js` - 重構價值高且風險最低，因為僅涉及頁面內容提取，並有良好測試。
2. `pages/options/options.js` - 有助於改善 Options 頁面的長期維護性，風險中等，需編寫 ADR。
3. `scripts/background/handlers/saveHandlers.js` - 風險最高，因為任何錯誤都可能造成擴充套件核心功能癱瘓，應最後處理，並且先審查 ADR。

## 模塊 5: 範圍外發現 (Out-of-scope findings)

- `pages/options/AuthManager.js` 是一個超過 1100 行的檔案，嚴重混雜了 OAuth 流程 (line 858)、API 測試和 UI 更新。由於修改 OAuth 與 Token 相關路徑被明確標記為高風險，並在此次任務中設定為 Out-of-scope，故暫不列入重構提案。
