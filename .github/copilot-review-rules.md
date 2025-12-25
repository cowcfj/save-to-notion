# Copilot Code Review Custom Rules

## 規則調整說明

此文件用於調整 GitHub Copilot 代碼審核的行為，減少不適用於本專案的警告。

## 測試文件特例

### 忽略規則：測試文件中的變數初始化警告

在 Jest 測試文件 (`*.test.js`) 中，以下模式是合理的且不應觸發警告：

1. **變數在 `beforeEach` 中初始化**
   - `describe` 區塊內宣告的 `let` 變數通常在 `beforeEach` 中賦值
   - 這是 Jest 測試的標準模式
   - 例：`let mockChrome;` 隨後在 `beforeEach(() => { mockChrome = {...}; })` 中賦值

2. **Chrome API Mock**
   - 測試 Chrome 擴展時需要 mock `chrome` 全域物件
   - Chrome API callback 不遵循 Node.js error-first 模式
   - 例：`callback({ success: true })` 是 Chrome API 的標準用法

3. **私有方法測試（白盒測試）**
   - `*.extended.test.js` 文件專門用於測試「私有」方法（以 `_` 前綴命名）
   - 這是為了提高覆蓋率的有意設計

## 建議忽略的警告類型

對於 `tests/` 目錄下的文件：

- "The base expression of this property access is always undefined"（變數在 beforeEach 中初始化）
- "Variable should be initialized on declaration"（已使用 JSDoc 類型標註作為替代）
