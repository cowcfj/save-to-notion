# Chrome DevTools MCP E2E 測試實戰指南

## 概述

本項目包含兩種 E2E 測試方式：

1.  **自動化測試 (Playwright)**: 用於回歸測試和代碼覆蓋率收集。請參閱 `README.md`。
2.  **交互式測試 (MCP)**: 用於開發過程中的快速驗證和探索性測試（本指南重點）。

## 交互式測試 (MCP)

使用 Claude 和 Chrome DevTools MCP Server 直接操作瀏覽器進行測試。

### 方式 1: 直接對話測試

你可以在 Claude Code 中發送測試請求：

```
請幫我測試高亮功能：
1. 打開 https://developer.mozilla.org/en-US/docs/Web/JavaScript
2. 等待頁面加載
3. 執行腳本選擇第一段文本
4. 截圖保存結果
5. 報告測試結果
```

### 方式 2: 使用測試腳本模板

我們提供了 `mcp-test-suite.js` 作為測試步驟的參考模板：

```bash
node tests/e2e/mcp-test-suite.js
```

這會輸出標準化的測試步驟，你可以將這些步驟複製給 Claude 執行。

### 方式 3: 集成測試工作流

在 Claude Code 中定義測試任務：

```javascript
// 告訴我要測試什麼
const testPlan = {
  feature: 'Highlighter',
  scenarios: [
    'Create yellow highlight',
    'Change color to green',
    'Delete highlight',
    'Verify persistence after refresh',
  ],
};
```

## MCP 工具能力

基於項目中可用的 MCP 工具 (`@modelcontextprotocol/server-chrome-extension`)，我們可以：

### 頁面控制

- `new_page` / `close_page`
- `navigate_page` / `resize_page`

### 交互操作

- `click` / `fill`
- `hover` / `drag`

### 腳本執行

- `evaluate_script` - 在頁面執行 JavaScript (可訪問 Chrome Extension APIs)

### 調試輔助

- `take_screenshot`
- `take_snapshot`
- `list_console_messages`

## 常見測試場景

### 1. 測試基礎高亮功能

- 打開測試頁面
- 選中文本
- 驗證 DOM 變化

### 2. 測試高亮持久化

- 創建高亮
- 刷新頁面
- 驗證 `chrome.storage.local` 數據

### 3. 測試內容提取

- 導航到文章頁面
- 模擬 Content Script 提取邏輯
- 驗證提取結果格式

## 自動化回歸測試

對於需要穩定重複執行和計算覆蓋率的測試，**請使用 Playwright 自動化套件**。

運行命令：

```bash
npm run test:e2e
```

詳情請參考 [COVERAGE-GUIDE.md](./COVERAGE-GUIDE.md)。
