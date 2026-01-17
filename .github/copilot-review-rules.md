# Copilot Code Review Custom Rules

> **目的**：調整 GitHub Copilot 代碼審核行為，減少針對專案特定模式的誤報。

---

## 📁 測試文件特例 (Test Files)

**適用於** `tests/**/*.js`、`*.test.js`、`*.spec.js`

### 1. Jest 測試模式

以下是 Jest 測試的標準模式，**不應**觸發警告：

- **`let` 變數延遲初始化**：`describe` 區塊內宣告的 `let` 變數在 `beforeEach` 中賦值

  ```javascript
  // ✅ 這是正確的 Jest 模式
  describe('ModuleName', () => {
    let mockChrome; // 聲明但不初始化
    beforeEach(() => {
      mockChrome = {
        /* ... */
      }; // 在 beforeEach 中初始化
    });
  });
  ```

- **Chrome API Mock**：測試 Chrome 擴展時需 mock `chrome` 全域物件
- **結果優先 Callback**：Chrome API 使用 `callback({ success: true })`，**不是** Node.js 的 error-first 模式

### 2. 私有方法白盒測試

- `*.extended.test.js` 文件專門測試以 `_` 前綴命名的「私有」方法
- 這是為了提高測試覆蓋率的**有意設計**

### 建議忽略的警告類型

| 警告訊息                                                          | 忽略原因                      |
| ----------------------------------------------------------------- | ----------------------------- |
| "The base expression of this property access is always undefined" | 變數在 `beforeEach` 中初始化  |
| "Variable should be initialized on declaration"                   | 已使用 JSDoc 類型標註作為替代 |
| "Callback should follow error-first pattern"                      | Chrome API 使用結果優先模式   |

---

## 🔧 Chrome Extension 特定模式

### 1. Promise API 使用

本專案使用 **Manifest V3**，Chrome API 原生支持 Promise：

```javascript
// ✅ 正確：直接使用 await
const result = await chrome.storage.sync.get(['apiKey']);

// ⚠️ 不需要建議包裝為 Promise
```

### 2. `chrome.runtime.lastError`

MV3 中 `lastError` 錯誤會自動轉換為 Promise rejection，可直接用 `try-catch` 捕獲：

```javascript
// ✅ 現代化錯誤處理（本專案採用）
try {
  const results = await chrome.scripting.executeScript({
    /* ... */
  });
} catch (error) {
  // 無需檢查 lastError
}
```

### 3. 遺留 Callback 模式檢測

**審核時應指出以下情況**：

| 模式                             | 問題                             | 建議                     |
| -------------------------------- | -------------------------------- | ------------------------ |
| 使用 callback 版本 Chrome API    | 遺留代碼，MV3 已原生支援 Promise | 建議遷移至 `async/await` |
| 同一文件混用 callback 和 Promise | 重構不完整                       | 統一為 Promise 模式      |
| 手動包裝 `new Promise()`         | 不必要的包裝                     | 直接使用 `await`         |

**典型遺留模式範例**：

```javascript
// ⚠️ 遺留 callback 模式 - 應建議遷移
chrome.storage.sync.get(['key'], result => {
  // 舊式 callback
});

// ✅ 應遷移為
const result = await chrome.storage.sync.get(['key']);
```

---

## 🎨 代碼風格

### 1. Console 使用規則

本專案使用統一的 `Logger` 類別：

- ✅ **生產代碼**：使用 `Logger.info()`, `Logger.error()`, `Logger.debug()`
- ⚠️ **禁止**：在生產代碼中直接使用 `console.log` (僅 `console.error` 可用)
- ✅ **測試文件**：允許使用 `console.log`

### 2. 變數命名忽略

以下變數名是**有意設計**，不應建議改名：

- `_sender`, `_sendResponse`：標記為未使用但需保留的回調參數
- `_` 前綴：表示意圖不使用的參數

### 3. Magic Numbers

本專案所有時間/閾值常量已提取至 `scripts/config/constants.js`：

- 不需建議「將硬編碼數值提取為常量」如果該常量已存在於 `constants.js`

---

## 📝 語言規範

本專案**必須**使用**繁體中文**：

- 代碼註解 (Comments)
- JSDoc 文檔字串
- Git commit messages
- Markdown 文檔

**不適用中文警告的情況**：

- 變數名、函數名（使用英文）
- 技術術語可保留英文

---

## 🏗️ 架構模式

### 1. 測試暴露模式 (Test Exposure)

以下代碼塊是**必要的測試支援**，不應建議移除：

```javascript
// TEST_EXPOSURE_START
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    /* exports */
  };
}
// TEST_EXPOSURE_END
```

### 2. 文件結構

本專案已有明確的文件結構規範：

- 文件大小限制：普通模組 ~500 行、UI 模組 ~300 行
- 已完成的模組化拆分不需建議進一步拆分

---

## 🔒 安全相關

### SVG 驗證

本專案使用 [`validateSafeSvg()`](file:///Volumes/WD1TMac/code/notion-chrome/scripts/utils/securityUtils.js) 函數處理 SVG 安全驗證，已覆蓋已知 XSS 攻擊向量。

**審核時應檢查**：

- [ ] 新的 SVG 來源是否經過 `validateSafeSvg()` 驗證？
- [ ] 動態生成的 SVG 內容是否調用了 `validateSafeSvg()`？
- [ ] 新增的 SVG 處理代碼是否引用並使用了 `validateSafeSvg()`？

**可跳過 SVG 安全建議的情況**（僅限已驗證的代碼）：

- ✅ 代碼已確認調用 `validateSafeSvg()` 進行驗證
- ✅ SVG 為靜態資源且來自專案內部 `icons/` 目錄
- ✅ 已在 `StorageManager.js` 或 `UIManager.js` 中使用統一的驗證流程

---

## 🚫 避免重複檢查（DeepSource / ESLint 已覆蓋）

以下檢查項目已由 **DeepSource** 或 **ESLint** 自動處理，Copilot **不需要**重複提出：

### ESLint 已處理

| 規則               | 說明                             |
| ------------------ | -------------------------------- |
| `no-unused-vars`   | 未使用變數（`_` 前綴變數已忽略） |
| `no-var`           | 禁止使用 `var`                   |
| `prefer-const`     | 優先使用 `const`                 |
| `prefer-template`  | 使用模板字串                     |
| `object-shorthand` | 物件屬性簡寫                     |
| `eqeqeq`           | 使用 `===` 和 `!==`              |
| `curly`            | 控制語句使用大括號               |
| `no-else-return`   | 避免 `if` 後的 `else return`     |
| `regexp/*`         | 正規表達式安全性檢查             |

### DeepSource 已處理

| 代碼    | 說明                                         |
| ------- | -------------------------------------------- |
| JS-0002 | Console 使用（測試文件已豁免）               |
| JS-0064 | 變數初始化聲明（測試文件已豁免）             |
| JS-0105 | 類方法應使用 `this`（特定 Factory 類已豁免） |
| JS-0241 | Callback literal 模式（Chrome API 豁免）     |
| JS-0255 | Error-first callback（Chrome API 豁免）      |
| JS-0417 | Callback literal 檢查（測試豁免）            |
| JS-0427 | 錯誤日誌格式（scripts 目錄已豁免）           |

### 其他自動化工具已處理

- **Prettier**：代碼格式化（縮排、空格、分號）
- **Codecov**：測試覆蓋率檢查
- **Husky + lint-staged**：提交前自動 lint

> [!NOTE]
> 如果發現新的模式問題，優先考慮更新 ESLint/DeepSource 規則，而非逐個 PR 審核指出。

---

## ⚠️ 審核重點（應該關注）

以下事項**值得**在審核中指出：

1. **安全漏洞**：XSS（包括 SVG 內容驗證）、注入攻擊、敏感信息洩漏
   - SVG 處理代碼必須確認調用 `validateSafeSvg()`
2. **邏輯錯誤**：條件判斷錯誤、邊界情況未處理
3. **測試缺失**：新功能沒有對應測試
4. **向後兼容**：可能破壞現有功能的變更
5. **性能問題**：不必要的重複操作、記憶體洩漏風險

---

**最後更新**: 2026-01-18
