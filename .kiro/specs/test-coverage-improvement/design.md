# Design Document - 測試覆蓋率改進

## Overview

本設計文檔描述如何系統性地提升 Notion Smart Clipper 的測試覆蓋率，從當前的 19.13% 提升至 20%+。我們將採用增量式測試策略，優先測試核心功能和高風險區域，同時保持測試代碼的可維護性。

### 測試範圍說明

**包含在測試覆蓋率中：**
- `scripts/` - 核心功能腳本（background.js, content.js, utils.js, highlighter-v2.js）
- `tests/helpers/*.testable.js` - 可測試版本的模塊

**不包含在測試覆蓋率中：**
- `popup/` - 彈出窗口 UI（需要瀏覽器環境）
- `options/` - 設置頁面 UI（需要瀏覽器環境）
- `update-notification/` - 更新通知頁面（需要瀏覽器環境）
- `lib/` - 第三方庫（Readability.js）

> 註：UI 相關代碼（popup, options, update-notification）需要完整的瀏覽器環境和用戶交互，不適合單元測試。這些模塊應該通過 E2E 測試或手動測試來驗證。

### 當前狀況分析

**已充分測試的模塊（>90%）：**
- `background-utils.testable.js`: 97.56%
- `content.testable.js`: 97.46%
- `highlighter-v2.testable.js`: 98.90%
- `utils.testable.js`: 88.53%

**需要改進的模塊（<10%）：**
- `background.js`: 7.89% (446-884, 900-1001, 1014-2155, 2165-2286 行未覆蓋)
- `content.js`: 0%
- `utils.js`: 0%
- `highlighter-v2.js`: 0%
- 其他遷移相關腳本: 0%

### 目標

1. **整體覆蓋率**: 從 19.13% → 20%+
2. **background.js**: 從 7.89% → 15%+
3. **utils.js**: 從 0% → 80%+
4. **content.js**: 從 0% → 10%+

## Architecture

### 測試架構設計

```
tests/
├── unit/                          # 單元測試（同步到 GitHub）
│   ├── background/               # background.js 相關測試
│   │   ├── message-handlers.test.js
│   │   ├── storage-operations.test.js
│   │   └── notion-integration.test.js
│   ├── utils/                    # utils.js 相關測試
│   │   ├── storage-util.test.js  (已存在，需增強)
│   │   ├── logger.test.js        (已存在)
│   │   └── url-normalization.test.js (已存在)
│   └── content/                  # content.js 相關測試
│       ├── content-extraction.test.js
│       └── image-processing.test.js (已存在)
├── helpers/                      # 測試輔助文件（同步到 GitHub）
│   ├── background.testable.js    # 可測試版本的 background.js
│   ├── utils.testable.js         # 可測試版本的 utils.js
│   └── content.testable.js       # 可測試版本的 content.js
├── mocks/                        # Mock 對象（同步到 GitHub）
│   └── chrome.js                 # Chrome API mock
├── manual/                       # 手動測試頁面（不同步）
├── e2e/                          # E2E 測試腳本（不同步）
├── results/                      # 測試結果（不同步）
├── setup.js                      # 測試環境設置（同步到 GitHub）
└── README.md                     # 測試說明（同步到 GitHub）
```

### 測試策略

#### 1. 純函數優先策略
- 優先測試不依賴外部狀態的純函數
- 使用 testable.js 文件導出純函數進行測試
- 已成功應用於 background-utils、content、highlighter-v2

#### 2. Mock 依賴策略
- 使用 Jest mock 模擬 Chrome API
- 模擬 chrome.storage、chrome.runtime、chrome.tabs 等
- 模擬 Notion API 響應

#### 3. JSDOM 環境策略
- 使用 JSDOM 模擬瀏覽器 DOM 環境
- 測試 DOM 操作和內容提取功能
- 已成功應用於 content.js 測試

## Components and Interfaces

### Component 1: Background.js 測試增強

#### 1.1 消息處理器測試

**目標函數：**
- `chrome.runtime.onMessage` 監聽器
- 各種消息類型處理：`saveToNotion`, `getHighlights`, `clearHighlights` 等

**測試接口：**
```javascript
// tests/unit/background/message-handlers.test.js
describe('Background Message Handlers', () => {
  describe('saveToNotion message', () => {
    it('應該成功處理保存請求');
    it('應該處理 API 錯誤');
    it('應該處理無效數據');
  });
  
  describe('getHighlights message', () => {
    it('應該返回存儲的標註');
    it('應該處理不存在的 URL');
  });
});
```

**Mock 需求：**
- `chrome.runtime.sendMessage`
- `chrome.runtime.onMessage.addListener`
- `chrome.storage.local.get/set`

#### 1.2 存儲操作測試

**目標函數：**
- 存儲相關的輔助函數
- 數據遷移邏輯

**測試接口：**
```javascript
// tests/unit/background/storage-operations.test.js
describe('Background Storage Operations', () => {
  it('應該正確保存設置');
  it('應該處理存儲配額錯誤');
  it('應該正確遷移舊版本數據');
});
```

#### 1.3 Notion API 集成測試

**目標函數：**
- `createNotionPage` (已部分測試)
- `appendBlocksInBatches` (已部分測試)
- `fetchDatabases` (已部分測試)
- 錯誤處理和重試邏輯

**測試接口：**
```javascript
// tests/unit/background/notion-integration.test.js
describe('Notion API Integration', () => {
  describe('Error Handling', () => {
    it('應該處理 401 未授權錯誤');
    it('應該處理 404 數據庫不存在');
    it('應該處理 429 速率限制');
    it('應該處理網絡超時');
  });
  
  describe('Retry Logic', () => {
    it('應該在失敗後重試');
    it('應該在多次失敗後放棄');
  });
});
```

### Component 2: Utils.js 完整測試

#### 2.1 StorageUtil 增強測試

**當前覆蓋率：** 已有基礎測試
**改進方向：**
- 增加邊界情況測試
- 增加並發操作測試
- 增加數據遷移測試

**測試接口：**
```javascript
// tests/unit/utils/storage-util.test.js (增強)
describe('StorageUtil - Advanced', () => {
  describe('Concurrent Operations', () => {
    it('應該處理並發保存操作');
    it('應該處理並發讀取操作');
  });
  
  describe('Data Migration', () => {
    it('應該遷移舊格式數據');
    it('應該處理損壞的數據');
  });
  
  describe('Storage Quota', () => {
    it('應該檢測存儲空間不足');
    it('應該清理舊數據釋放空間');
  });
});
```

#### 2.2 Logger 測試

**當前狀態：** 已有完整測試
**維護：** 保持現有測試質量

#### 2.3 URL 標準化測試

**當前狀態：** 已有完整測試
**維護：** 保持現有測試質量

### Component 3: Content.js 基礎測試

#### 3.1 內容提取測試

**目標函數：**
- `findContentCmsFallback`
- `isContentGood`
- Readability.js 集成

**測試接口：**
```javascript
// tests/unit/content/content-extraction.test.js
describe('Content Extraction', () => {
  describe('CMS Fallback', () => {
    it('應該識別 Drupal 結構');
    it('應該識別 WordPress 結構');
    it('應該回退到通用選擇器');
  });
  
  describe('Content Quality Check', () => {
    it('應該接受高質量內容');
    it('應該拒絕低質量內容');
    it('應該檢查連結密度');
  });
});
```

**Mock 需求：**
- JSDOM 環境
- 模擬各種 CMS 的 HTML 結構

#### 3.2 圖片處理測試

**當前狀態：** 已有部分測試
**改進方向：**
- 增加更多真實場景測試
- 測試懶加載圖片處理

## Data Models

### 測試數據模型

#### 1. Mock Chrome Storage 數據
```javascript
{
  'highlights_https://example.com': {
    highlights: [
      {
        text: '測試標註',
        color: 'yellow',
        timestamp: 1234567890
      }
    ]
  },
  'notion_api_key': 'secret_xxx',
  'notion_database_id': 'abc123'
}
```

#### 2. Mock Notion API 響應
```javascript
{
  // 成功響應
  success: {
    object: 'page',
    id: 'page-id-123',
    url: 'https://notion.so/...'
  },
  
  // 錯誤響應
  error: {
    status: 401,
    code: 'unauthorized',
    message: 'API token is invalid'
  }
}
```

#### 3. Mock DOM 結構
```javascript
{
  drupal: `
    <div class="node__content">
      <div class="field--name-field-image">...</div>
      <div class="field--name-field-body">...</div>
    </div>
  `,
  wordpress: `
    <article class="post">
      <div class="entry-content">...</div>
    </article>
  `
}
```

## Error Handling

### 測試錯誤處理策略

#### 1. API 錯誤測試
- 401 未授權
- 404 資源不存在
- 429 速率限制
- 500 服務器錯誤
- 網絡超時

#### 2. 數據錯誤測試
- null/undefined 輸入
- 無效格式數據
- 損壞的 JSON
- 超大數據

#### 3. 環境錯誤測試
- Chrome API 不可用
- 存儲空間不足
- 權限不足

## Testing Strategy

### 測試優先級

#### Phase 1: 快速提升（目標：20%）
1. **background.js 消息處理** (預計 +3%)
   - 測試主要消息類型
   - 測試基本錯誤處理

2. **utils.js 核心函數** (預計 +2%)
   - 測試 StorageUtil 邊界情況
   - 測試 normalizeUrl 特殊情況

3. **content.js 內容提取** (預計 +1%)
   - 測試 CMS 回退邏輯
   - 測試內容質量檢查

#### Phase 2: 持續改進（目標：25%+）
- 增加集成測試
- 增加端到端測試
- 提升分支覆蓋率

### 測試質量標準

#### 1. AAA 模式
```javascript
it('應該正確處理有效輸入', () => {
  // Arrange - 準備測試數據
  const input = { ... };
  const expected = { ... };
  
  // Act - 執行測試
  const result = functionUnderTest(input);
  
  // Assert - 驗證結果
  expect(result).toEqual(expected);
});
```

#### 2. 清晰的測試描述
- 使用中文描述測試意圖
- 描述應該說明「應該做什麼」
- 每個測試只驗證一個行為

#### 3. Mock 最小化原則
- 只 mock 必要的依賴
- 優先測試純函數
- 保持 mock 簡單明確

#### 4. 測試獨立性
- 每個測試應該獨立運行
- 使用 beforeEach/afterEach 清理狀態
- 避免測試間的依賴

### 覆蓋率監控

#### 1. 持續監控
```bash
npm test -- --coverage --watch
```

#### 2. 覆蓋率報告
- 使用 lcov 生成 HTML 報告
- 定期檢查未覆蓋代碼
- 識別高風險未測試區域

#### 3. 覆蓋率門檻
```javascript
// jest.config.js
coverageThreshold: {
  global: {
    statements: 20,
    branches: 15,
    functions: 20,
    lines: 20
  }
}
```

## Implementation Notes

### 技術考慮

#### 1. Chrome API Mock
- 使用現有的 `tests/mocks/chrome.js`
- 確保 mock 行為與真實 API 一致
- 支持異步操作

#### 2. JSDOM 限制
- 某些 DOM API 可能不完全支持
- 需要額外 polyfill 的功能
- CSS Highlight API 需要特殊處理

#### 3. 異步測試
- 使用 async/await 處理 Promise
- 正確處理回調函數
- 設置合理的超時時間

### 最佳實踐

#### 1. 測試文件組織
- 按功能模塊組織測試
- 使用清晰的目錄結構
- 測試文件名與源文件對應

#### 2. 測試數據管理
- 使用工廠函數創建測試數據
- 集中管理常用測試數據
- 避免硬編碼測試數據

#### 3. 測試維護
- 定期更新測試
- 移除過時的測試
- 重構重複的測試代碼

## Success Metrics

### 量化指標

1. **覆蓋率目標**
   - 整體語句覆蓋率 >= 20%
   - background.js >= 15%
   - utils.js >= 80%
   - content.js >= 10%

2. **測試質量**
   - 所有測試通過率 = 100%
   - 測試執行時間 < 5 秒
   - 無 flaky tests（不穩定測試）

3. **代碼質量**
   - 無測試相關的 lint 錯誤
   - 測試代碼可讀性高
   - Mock 使用合理

### 定性指標

1. **可維護性**
   - 測試易於理解和修改
   - 測試失敗時錯誤信息清晰
   - 測試代碼結構良好

2. **可靠性**
   - 測試結果穩定可重複
   - 測試覆蓋關鍵功能
   - 測試能捕獲真實問題

3. **開發體驗**
   - 測試運行速度快
   - 測試反饋及時
   - 測試幫助開發而非阻礙

## Risks and Mitigation

### 風險識別

#### 1. 測試覆蓋率提升困難
**風險：** 某些代碼難以測試（如 Chrome API 深度集成）
**緩解：** 
- 重構代碼提取可測試邏輯
- 使用更完善的 mock
- 接受某些代碼無法完全測試

#### 2. 測試維護成本高
**風險：** 測試代碼變得難以維護
**緩解：**
- 遵循測試最佳實踐
- 定期重構測試代碼
- 使用測試輔助函數

#### 3. 測試執行時間過長
**風險：** 測試變慢影響開發效率
**緩解：**
- 優化慢速測試
- 使用並行測試執行
- 分離快速測試和慢速測試

### 應對策略

1. **增量式改進**
   - 不追求一次性達到高覆蓋率
   - 每次提升 1-2%
   - 持續改進而非一次性完成

2. **優先級管理**
   - 優先測試核心功能
   - 優先測試高風險區域
   - 接受某些低優先級代碼暫不測試

3. **團隊協作**
   - 代碼審查包含測試審查
   - 分享測試最佳實踐
   - 持續學習和改進
