# 測試重構與技術債清理計劃 (Test Refactoring Plan)

## 1. 目標 (Objective)

本計劃旨在移除專案中遺留的 `tests/helpers/*.testable.js` 文件，將單元測試遷移至直接測試源代碼 (`scripts/**`)。
這將解決以下問題：
1.  **覆蓋率準確性**：消除因測試替身 (Test Doubles) 導致的覆蓋率雙重計算或稀釋問題。
2.  **代碼維護性**：移除重複的邏輯代碼，確保測試與生產代碼行為一致。
3.  **現代化**：全面擁抱 ES Modules 測試模式。

## 2. 現狀分析 (Current State)

目前 `tests/helpers/` 目錄下存在大量 `.testable.js` 文件，它們是舊版 CommonJS 架構的遺留物，用於將瀏覽器端代碼封裝為可測試模組。

### 技術債清單 (Inventory)

| 遺留檔案 (Legacy File) | 主要消費者 (Test Consumer) | 現代化替換目標 (Source Target) | 複雜度 |
| :--- | :--- | :--- | :--- |
| ✅ ~~`pageComplexityDetector.testable.js`~~ | ~~`pageComplexityDetector.test.js`~~ | `scripts/utils/pageComplexityDetector.js` | **已完成** |
| ✅ ~~`utils.testable.js`~~ | ~~`logger.advanced.test.js`~~<br>~~`utils.debugTools.test.js`~~ | `scripts/utils/Logger.js`<br>`scripts/utils.js` (StorageUtil) | **已完成** |
| ⚠️ `background-utils.testable.js` | `background-utils.test.js` | 部分完成：3 函數遷移 (`imageUtils.module.js`, `urlUtils.js`)，17 函數保留（API 差異） | 部分 |
| `options.testable.js` | `options.test.js` | `options/options.js` | 高 (DOM 依賴) |
| ✅ ~~`highlighter/utils/*.testable.js`~~ (6個) | `highlighter/utils/*.test.js` | `scripts/highlighter/utils/*.js` | **已完成** |
| ⚠️ `highlighter/core/*.testable.js` (2個) | `highlighter/core/*.test.js` | 需保留（源代碼依賴 CSS Highlight API，jsdom 不支援） | 保留 |
| ✅ ~~`expand.testable.js`~~ | 無消費者 | 已刪除（死代碼） | **已完成** |
| ✅ ~~`background.testable.js`~~ | 無消費者 | 已刪除（死代碼） | **已完成** |

## 3. 重構策略 (Strategy)

### 3.1 遷移原則
1.  **單一來源 (Single Source of Truth)**：測試必須直接引用生產代碼。
2.  **模擬隔離 (Mock Isolation)**：使用 Jest 的 `jest.mock` 或 `spyOn` 處理外部依賴 (Chrome API, DOM)，而不是修改源代碼來適配測試。
3.  **漸進式執行 (Incremental approach)**：每次只重構一個 `.testable.js` 文件及其對應的測試，確保測試通過後再刪除遺留文件。

### 3.2 技術挑戰與解決方案

#### 挑戰 A: ES Modules vs CommonJS
許多源代碼現在是 ES Modules (`export ...`)，而舊測試使用 `require`。
*   **解法**：源代碼已透過 `module.exports` 兼容代碼塊 (`// TEST_EXPOSURE_START`) 支援測試引用，或者測試文件應升級為使用 `import` (或 `require` 配合 Babel/Jest 轉換)。目前 Jest 配置已支持 ES6。

#### 挑戰 B: 瀏覽器全局變數
源代碼可能直接使用 `window` 或 `chrome`。
*   **解法**：確保測試文件頂部聲明 `/** @jest-environment jsdom */`，並在 `beforeEach` 中設置 `global.chrome` 和 `global.window` 的 mock。

## 4. 執行階段 (Execution Phases)

### 第一階段：純函數與工具類 (Utilities)
優先處理邏輯獨立、不依賴複雜狀態的模組。
1.  **Page Complexity**: 重構 `pageComplexityDetector.test.js`。
2.  **Utils**: 拆解 `utils.testable.js` 的依賴，分別重構 Logger 和 UrlUtils 的測試。

### 第二階段：核心業務邏輯 (Background & Content)
1.  **Components**: 處理 `background-utils.testable.js` 和其他小型組件。
2.  **Expand**: 重構 `expand.testable.js`。

### 第三階段：複雜 UI 邏輯 (Highlighter & Options)
這些模組涉及大量 DOM 操作和狀態管理，風險較高。
1.  **Highlighter Core**: 重構 `HighlightManager` 等核心類。
2.  **Options Page**: 重構選項頁面邏輯。

## 5. 驗證標準 (Verification Criteria)
對於每個重構的模組：
1.  **測試通過**：`npm test -- <test_file>` 必須全綠。
2.  **文件刪除**：對應的 `tests/helpers/*.testable.js` 必須被物理刪除。
3.  **配置更新**：`jest.config.js` 中的 `collectCoverageFrom` 不再包含該文件。
4.  **覆蓋率確認**：運行覆蓋率檢查，確認源代碼文件 (如 `scripts/utils/Logger.module.js`) 有被正確統計。

## 6. 具體操作範例 (Reference)

將 `require('../../helpers/utils.testable.js')` 替換為：
```javascript
// 引入真實模組
const { Logger } = require('../../../scripts/utils/Logger.module.js');
const { cleanImageUrl } = require('../../../scripts/utils/imageUtils.js');

// 設置 Mock (如果源代碼依賴全局變數)
global.chrome = { ... };
```
