# Highlighter 測試架構文檔

## 概述

Highlighter 採用**分層測試架構**,通過不同層級的測試確保代碼質量和功能正確性。

## 測試分層

### 1. 單元測試層 (Unit Tests)

**位置**: `tests/unit/highlighter/core/` 和 `tests/unit/highlighter/utils/`

**目的**: 測試最小可測試單元(函數、類方法)

**特點**:

- 快速執行
- 隔離測試
- 高覆蓋率要求
- 使用 Mock 隔離依賴

**文件結構**:

```
tests/unit/highlighter/
├── core/                 # 核心類的單元測試
│   ├── HighlightManager.test.js
│   ├── HighlightManager.coverage.test.js
│   ├── Range.test.js
│   └── Range.coverage.test.js
└── utils/                # 工具函數的單元測試
    ├── color.test.js
    ├── dom.test.js
    ├── domStability.test.js
    ├── path.test.js
    ├── textSearch.test.js
    └── validation.test.js
```

**示例**: `utils/domStability.test.js`

```javascript
// 測試獨立的工具函數
const {
  waitForDOMStability,
} = require('../../../helpers/highlighter/utils/domStability.testable.js');

test('should resolve true when DOM is stable', async () => {
  // 單一功能測試
});
```

### 2. 功能測試層 (Feature Tests)

**位置**: `tests/unit/highlighter/highlighter-*.test.js`

**目的**: 測試特定功能模組的完整行為

**特點**:

- 測試多個組件協作
- 關注業務邏輯
- 真實場景模擬

**文件列表**:

- `highlighter-v2.test.js` - 主測試文件,測試 `highlighter-v2.testable.js` 導出的純函數
- `highlighter-dom-stability.test.js` - DOM 穩定性功能測試
- `highlighter-migration.test.js` - 數據遷移功能測試
- `highlighter-path-compression.test.js` - 路徑壓縮功能測試
- `highlighter-storage-optimization.test.js` - 存儲優化功能測試
- `highlighter-toolbar.test.js` - 工具列功能測試

**示例**: `highlighter-dom-stability.test.js`

```javascript
// 測試 HighlightManager 類的方法
describe('HighlightManager.waitForDOMStability', () => {
  // 測試方法在不同場景下的行為
});
```

### 3. 集成測試層 (Integration Tests)

**位置**: `tests/unit/highlighter/*.integration.test.js`

**目的**: 測試完整的用戶流程和系統集成

**特點**:

- 端到端場景
- 多模組協作
- 接近真實使用

**文件列表**:

- `highlighter-v2.integration.test.js` - 完整集成測試
- `highlight-interactions.test.js` - 用戶交互集成測試

## 測試文件命名約定

### 單元測試

- **格式**: `[模組名].test.js`
- **示例**: `color.test.js`, `Range.test.js`
- **Coverage測試**: `[模組名].coverage.test.js`

### 功能測試

- **格式**: `highlighter-[功能名].test.js`
- **示例**: `highlighter-migration.test.js`, `highlighter-toolbar.test.js`

### 集成測試

- **格式**: `[模組名].integration.test.js`
- **示例**: `highlighter-v2.integration.test.js`

## Testable 文件模式

Highlighter 使用 **`*.testable.js` 模式**來導出可測試的純函數:

### 主要 Testable 文件

- `tests/helpers/highlighter-v2.testable.js` - 導出純函數供測試使用

### 為什麼使用這個模式?

#### 問題

`scripts/highlighter-v2.js` 是一個 IIFE(瀏覽器環境),無法直接導出類和函數到測試環境。

#### 解決方案

將可測試的**純函數**提取到 `*.testable.js` 文件:

```javascript
// highlighter-v2.testable.js
function validateHighlightData(highlightData) {
  // 純函數邏輯
}

module.exports = {
  validateHighlightData,
  // 其他純函數...
};
```

#### 測試使用

```javascript
// highlighter-v2.test.js
const { validateHighlightData } = require('../../helpers/highlighter-v2.testable');

test('should validate highlight data', () => {
    expect(validateHighlightData({...})).toBe(true);
});
```

## 添加新測試的指南

### 1. 確定測試層級

**問題**: 我要測試什麼?

- **純函數/工具** → 單元測試 (`core/` 或 `utils/`)
- **功能模組** → 功能測試 (`highlighter-*.test.js`)
- **完整流程** → 集成測試 (`*.integration.test.js`)

### 2. 選擇文件位置

```
需要測試 HighlightManager 類的新方法?
  → tests/unit/highlighter/core/HighlightManager.test.js

需要測試新的工具函數?
  → tests/unit/highlighter/utils/[名稱].test.js

需要測試新功能(如導出)?
  → tests/unit/highlighter/highlighter-export.test.js

需要測試完整用戶流程?
  → tests/unit/highlighter/highlighter-export.integration.test.js
```

### 3. 遵循命名約定

- 單元測試: `[模組名].test.js`
- 功能測試: `highlighter-[功能名].test.js`
- 集成測試: `[功能名].integration.test.js`

### 4. 使用適當的測試工具

```javascript
// 單元測試 - 使用 testable 文件
const { utilFunction } = require('../../../helpers/[模組].testable');

// 功能/集成測試 - 模擬環境
beforeEach(() => {
    global.document = {...};
    global.window = {...};
});
```

## Mock 策略

### Browser APIs

```javascript
// Mock Highlight API
global.Highlight = jest.fn(() => ({
  add: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
}));

global.CSS = {
  highlights: {
    set: jest.fn(),
    delete: jest.fn(),
  },
};
```

### Chrome APIs

```javascript
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
};
```

### Logger

```javascript
global.logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
```

## 運行測試

### 全部測試

```bash
npm test
```

### 特定文件

```bash
npm test tests/unit/highlighter/highlighter-v2.test.js
```

### Watch 模式

```bash
npm test -- --watch
```

### Coverage

```bash
npm test -- --coverage
```

## 最佳實踐

### 1. 測試隔離

每個測試應該獨立,不依賴其他測試的執行順序

```javascript
beforeEach(() => {
  // 每個測試前重置狀態
});

afterEach(() => {
  // 清理
  jest.clearAllMocks();
});
```

### 2. 清晰的測試描述

```javascript
// ✅ 好的描述
test('should return false when highlight data has no text', () => {});

// ❌ 不好的描述
test('validates data', () => {});
```

### 3. AAA 模式

```javascript
test('description', () => {
    // Arrange - 設置
    const input = {...};

    // Act - 執行
    const result = functionUnderTest(input);

    // Assert - 斷言
    expect(result).toBe(expected);
});
```

### 4. 測試邊界情況

- 正常情況
- 邊界值
- 錯誤情況
- 空值/null/undefined

## 測試覆蓋率目標

| 層級     | 目標覆蓋率   |
| -------- | ------------ |
| 核心類   | 90%+         |
| 工具函數 | 95%+         |
| 功能模組 | 80%+         |
| 集成測試 | 關鍵路徑100% |

## 故障排除

### 測試失敗常見原因

1. **Mock 未正確設置**
   - 檢查 `beforeEach` 中的 Mock 配置
   - 確保每個測試後清理 Mock

2. **異步測試未等待**
   - 使用 `async/await`
   - 或返回 Promise

3. **JSDOM 環境問題**
   - 確保測試文件頂部有 `@jest-environment jsdom`

## 參考資料

- [Jest 文檔](https://jestjs.io/)
- [測試最佳實踐](https://github.com/goldbergyoni/javascript-testing-best-practices)
- 項目內部: `tests/helpers/highlighter-v2.testable.js` - Testable 模式範例
