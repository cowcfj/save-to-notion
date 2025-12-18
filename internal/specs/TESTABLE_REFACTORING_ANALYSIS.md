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

#### 模組化方案

**方案 A：建立新工具模組**

```
scripts/utils/
├── httpUtils.js      (NEW) - 6 個 HTTP helpers
├── batchUtils.js     (NEW) - 2 個批次函數
├── jsonUtils.js      (NEW) - 2 個 JSON 工具
└── textUtils.js      (NEW) - 2 個文本工具
```

**工作量估算**：~3 小時
**影響測試**：188 個測試

**方案 B：合併到現有模組**

將工具函數添加到現有的 `scripts/utils/` 文件中。

**工作量估算**：~2 小時
**風險**：可能導致現有模組膨脹

**方案 C：保持現狀**

保留在 testable 文件中。

**結論**：⚠️ **可選擇性實施方案 A**

如果專案有新功能需要這些工具函數，可順便抽取到源代碼。否則保持現狀。

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
