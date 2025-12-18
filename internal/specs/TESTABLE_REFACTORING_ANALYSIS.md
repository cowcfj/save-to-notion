# Testable 文件進階重構技術分析

> 文檔日期：2024-12-18
> 分支：`refactor/test-coverage`
> 狀態：評估完成，待決策

## 1. 執行摘要

本文檔分析剩餘 5 個 `.testable.js` 文件進一步模組化的**價值與風險**，為後續技術決策提供依據。

### 當前狀態

| 類別 | 數量 | 代碼行數 |
|------|------|---------|
| ✅ 已刪除 | 8 個 | ~1,297 行 |
| ⚠️ 剩餘 | 5 個 | ~1,500 行 |

### 結論預覽

| 文件 | 模組化建議 | 優先級 |
|------|-----------|--------|
| `utils.testable.js` | 保持現狀 | ❌ 不建議 |
| `background-utils.testable.js` | 選擇性抽取工具函數 | ⚠️ 低 |
| `options.testable.js` | 保持現狀 | ❌ 不建議 |
| `highlighter/core/*.testable.js` | 無法模組化 | 🚫 技術限制 |

---

## 2. 文件詳細分析

### 2.1 `utils.testable.js` (740 行)

#### 內容組成

| 功能模組 | 行數 | 源代碼對應 |
|---------|------|-----------|
| Logger helpers | ~150 | ✅ `Logger.module.js` |
| StorageUtil | ~200 | ✅ `scripts/utils.js` |
| normalizeUrl | ~80 | ✅ `urlUtils.js` |
| Dev mode 工具 | ~100 | ⚠️ 僅測試專用 |
| 其他 | ~210 | 雜項 |

#### 模組化價值分析

**潛在收益**：
- 減少代碼重複（~400 行可對應源代碼）
- 統一導入模式

**風險評估**：

| 風險項目 | 嚴重度 | 說明 |
|---------|--------|------|
| 測試 side effect 依賴 | 🔴 高 | 多個測試依賴 `window.StorageUtil` 注入順序 |
| Cache 機制差異 | 🟡 中 | `isManifestMarkedDev` 有測試專用 cache 控制 |
| 回歸風險 | 🔴 高 | 影響 3 個測試套件（~100+ 測試） |

**結論**：❌ **不建議模組化**

開發成本（~4 小時）遠超收益，且有引入回歸的高風險。

---

### 2.2 `background-utils.testable.js` (563 行，17 函數待處理)

#### 未遷移函數清單

| 函數名稱 | 類別 | 模組化可行性 |
|---------|------|-------------|
| `splitTextForHighlight` | 文本處理 | ✅ 已在 BlockBuilder |
| `isSuccessStatusCode` | HTTP | ✅ 可抽取 |
| `isRedirectStatusCode` | HTTP | ✅ 可抽取 |
| `isClientErrorStatusCode` | HTTP | ✅ 可抽取 |
| `isServerErrorStatusCode` | HTTP | ✅ 可抽取 |
| `getStatusCodeCategory` | HTTP | ✅ 可抽取 |
| `splitIntoBatches` | 批次處理 | ✅ 可抽取 |
| `calculateBatchStats` | 批次處理 | ✅ 可抽取 |
| `truncateText` | 文本處理 | ✅ 可抽取 |
| `safeJsonParse` | JSON | ✅ 可抽取 |
| `safeJsonStringify` | JSON | ✅ 可抽取 |
| `createNotionRichText` | Notion Block | ⚠️ API 差異 |
| `createNotionParagraph` | Notion Block | ⚠️ API 差異 |
| `createNotionHeading` | Notion Block | ⚠️ API 差異 |
| `createNotionImage` | Notion Block | ⚠️ API 差異 |
| `isValidNotionBlock` | Notion Block | ⚠️ API 差異 |

#### 模組化方案對比

##### 現有 `scripts/utils/` 結構

```
scripts/utils/
├── Logger.js              (日誌系統，IIFE)
├── Logger.module.js       (Logger 橋接模組)
├── imageUtils.js          (圖片處理，IIFE)
├── imageUtils.module.js   (imageUtils 橋接模組)
├── urlUtils.js            (URL 處理，ES Module)
└── pageComplexityDetector.js (頁面複雜度，ES Module)

scripts/utils.js           (StorageUtil + normalizeUrl，IIFE，424 行)
```

---

##### 方案 A：建立新工具模組（純粹拆分）

**策略**：每個功能類別建立獨立模組

```
scripts/utils/
├── httpUtils.js      (NEW) - 6 個 HTTP 狀態碼 helpers
├── batchUtils.js     (NEW) - splitIntoBatches, calculateBatchStats
├── jsonUtils.js      (NEW) - safeJsonParse, safeJsonStringify
└── textUtils.js      (NEW) - truncateText
```

| 優點 | 缺點 |
|------|------|
| ✅ 職責單一，易維護 | ⚠️ 新增 4 個文件 |
| ✅ 未來擴展清晰 | ⚠️ 導入語句變多 |
| ✅ 測試可針對單一模組 | |

**工作量**：~3 小時 | **新增文件**：4 個

---

##### 方案 B：合併到現有模組（避免碎片化）

**策略**：添加到現有 `scripts/utils.js` 或相近模組

```
scripts/utils.js  (MODIFY)
  └── 新增: safeJsonParse, safeJsonStringify, truncateText, splitIntoBatches...
```

| 優點 | 缺點 |
|------|------|
| ✅ 無新增文件 | ⚠️ utils.js 膨脹（424→~500 行） |
| ✅ 導入簡單 | ⚠️ 違反單一職責 |
| | ⚠️ 需為 IIFE 添加更多 window 暴露 |

**工作量**：~2 小時 | **新增文件**：0 個

---

##### ✅ 方案 A+B：結合策略（推薦）

**策略**：基於現有模組結構，選擇性新增或合併

```
重構決策邏輯：
1. 如果功能與現有模組高度相關 → 合併
2. 如果功能獨立且可預見擴展 → 新建
3. 如果只有 1-2 個小函數 → 合併到 utils.js
```

**具體分配**：

| 函數 | 目標模組 | 策略 | 理由 |
|------|---------|------|------|
| HTTP 狀態碼 (6 個) | `httpUtils.js` (NEW) | 新建 | 獨立功能，可能擴展 |
| `truncateText` | `urlUtils.js` (MODIFY) | 合併 | 文本/URL 處理相關 |
| `safeJsonParse/Stringify` | `utils.js` (MODIFY) | 合併 | 通用工具，僅 2 個 |
| `splitIntoBatches` | `utils.js` (MODIFY) | 合併 | 通用工具 |
| `calculateBatchStats` | `utils.js` (MODIFY) | 合併 | 與 splitIntoBatches 配對 |

**結果**：

```
scripts/utils/
├── httpUtils.js      (NEW) - 6 個 HTTP helpers
├── urlUtils.js       (MODIFY) - 新增 truncateText
└── ...其他不變

scripts/utils.js      (MODIFY) - 新增 4 個通用工具
```

| 維度 | 方案 A | 方案 B | 方案 A+B |
|------|--------|--------|----------|
| 新增文件 | 4 個 | 0 個 | 1 個 |
| 職責分離 | ✅ 好 | ⚠️ 差 | ✅ 平衡 |
| 維護性 | ✅ 好 | ⚠️ 差 | ✅ 好 |
| 工作量 | 3h | 2h | 2.5h |

**結論**：⚠️ **建議採用方案 A+B**

當有相關需求時實施，可在減少文件碎片化的同時保持良好架構。

---

##### 方案 C：保持現狀

保留在 testable 文件中，不做任何遷移。

**結論**：如無具體需求驅動，選擇方案 C 最務實。

---

### 2.3 `options.testable.js` (67 行)

#### 問題根源

源代碼 `options/options.js` 採用 **DOMContentLoaded IIFE** 模式：

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // 所有函數定義在此回調內
  async function disconnectFromNotion() { /* ... */ }
  function checkAuthStatus() { /* ... */ }
  // 無法導出
});
```

#### 模組化方案

**完整重構方案**：

```javascript
// options/optionsCore.js (NEW) - 純邏輯，可測試
export async function disconnectFromNotion(storageAPI) {
  await storageAPI.remove([...]);
}

// options/options.js - DOM 綁定
import { disconnectFromNotion } from './optionsCore.js';
document.addEventListener('DOMContentLoaded', () => {
  button.onclick = () => disconnectFromNotion(chrome.storage.sync);
});
```

**工作量估算**：~6 小時（包含重構和測試更新）
**風險**：🔴 高（需修改核心設定頁邏輯）

**結論**：❌ **不建議模組化**

Options 頁面是核心用戶功能，重構風險高。Testable 僅 67 行，維護成本極低。

---

### 2.4 `highlighter/core/*.testable.js` (2 個文件)

#### 技術限制

這兩個文件對應的源代碼依賴 **CSS Highlight API**：

```javascript
// 源代碼
const highlight = new Highlight();  // jsdom 不支援
CSS.highlights.set('notion', highlight);  // jsdom 不支援
```

#### 模組化方案

**唯一可行方案**：使用真實瀏覽器測試（Playwright/Puppeteer）

**成本估算**：~8 小時（配置 + 測試遷移）
**維護成本**：顯著增加（需維護瀏覽器測試環境）

**結論**：🚫 **技術限制，無法模組化**

保留 testable 文件是最務實的選擇。

---

## 3. 成本效益總結

### 量化分析

| 文件 | 模組化工時 | 減少代碼 | 風險等級 | ROI |
|------|-----------|---------|---------|-----|
| `utils.testable.js` | 4h | 400 行 | 🔴 高 | ❌ 負 |
| `background-utils.testable.js` | 3h | 200 行 | 🟡 中 | ⚠️ 低 |
| `options.testable.js` | 6h | 67 行 | 🔴 高 | ❌ 負 |
| `highlighter/core/*` | 8h | 0 行 | 🔴 技術限制 | ❌ 不可行 |

### 決策矩陣

```
                    收益
                    高
                     │
         ┌──────────┼──────────┐
         │    II    │    I     │
         │  問題區  │  優先區  │
    低 ──┼──────────┼──────────┼── 高 成功率
         │   III    │    IV    │
         │  放棄區  │  可選區  │
         └──────────┼──────────┘
                    低

utils.testable:      III（放棄區）
background-utils:    IV（可選區）
options.testable:    III（放棄區）
highlighter/core:    不可行
```

---

## 4. 建議行動

### 短期（立即）

1. ✅ **保持現狀** - 所有 5 個文件維持現有架構
2. ✅ **文檔化** - 將橋接模組說明整合到 `AGENTS.md`

### 中期（當有相關需求時）

3. ⚠️ **選擇性抽取** - 如果新功能需要 HTTP/JSON 工具，順便從 `background-utils.testable.js` 抽取到源代碼

### 長期（架構重構時）

4. ❓ **評估 Options 重構** - 如果 Options 頁面需要重大功能更新，考慮抽取 `optionsCore.js`

---

## 5. 風險登記表

| 風險 ID | 描述 | 影響 | 緩解措施 |
|---------|------|------|---------|
| R1 | 保留 testable 導致代碼分歧 | 中 | 代碼審查時檢查 testable 與源代碼一致性 |
| R2 | 新開發者不了解 testable 用途 | 低 | 在 AGENTS.md 說明 testable 保留原因 |
| R3 | 未來 jsdom 支援 Highlight API | 低 | 定期檢查 jsdom 更新日誌 |

---

## 6. 附錄

### A. 橋接模組模式

本專案使用 IIFE + 橋接模組模式：

| IIFE 源文件 | 橋接模組 | 用途 |
|------------|---------|------|
| `Logger.js` | `Logger.module.js` | 日誌系統 |
| `imageUtils.js` | `imageUtils.module.js` | 圖片處理 |

測試中應優先使用橋接模組：

```javascript
// ✅ 推薦
const Logger = require('...Logger.module.js').default;

// ⚠️ 避免
require('...Logger.js');
const Logger = global.window.Logger;
```

### B. 相關文檔

- [TEST_REFACTOR_PLAN.md](file:///Volumes/WD1TMac/code/notion-chrome/internal/specs/TEST_REFACTOR_PLAN.md) - 重構計劃
- [AGENTS.md](file:///Volumes/WD1TMac/code/notion-chrome/AGENTS.md) - AI Agent 指引
