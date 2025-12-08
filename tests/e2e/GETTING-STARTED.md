# Chrome DevTools MCP E2E 測試實戰指南

## 當前狀態

✅ **已完成**:

- 測試計劃文檔 (`README-MCP-E2E.md`)
- 測試套件模板 (`mcp-test-suite.js`)
- 31 個單元測試（CMS extraction + Highlighter interactions）

⚠️ **待配置**:

- Chrome DevTools MCP 服務器連接
- 測試執行環境設置

## 快速開始：使用 MCP 進行 E2E 測試

### 方式 1: 直接與 Claude Code 對話測試

你可以直接在 Claude Code 中發送測試請求，我會使用 MCP 工具執行：

```
請幫我測試高亮功能：
1. 打開 https://developer.mozilla.org/en-US/docs/Web/JavaScript
2. 等待頁面加載
3. 執行腳本選擇第一段文本
4. 截圖保存結果
5. 報告測試結果
```

### 方式 2: 使用測試腳本

運行我創建的測試套件：

```bash
node tests/e2e/mcp-test-suite.js
```

這會輸出測試計劃，然後你可以要求我執行每個步驟。

### 方式 3: 集成測試工作流

在 Claude Code 中創建測試任務：

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

// 我會使用 MCP 工具執行並報告結果
```

## 實際測試示例

### 示例 1: 測試基礎高亮功能

**請求**:

```
使用 Chrome DevTools MCP 測試高亮器：
1. 打開測試頁面（MDN JavaScript Guide）
2. 檢查頁面是否有 article 元素
3. 找到第一個段落並選擇前 50 個字符
4. 截圖顯示選中狀態
5. 驗證選擇是否成功
```

**預期結果**:

- 頁面成功加載
- 找到文章內容
- 文本被選中
- 截圖顯示選中效果

### 示例 2: 測試高亮持久化

**請求**:

```
測試高亮數據持久化：
1. 在當前頁面創建一個測試高亮數據
2. 將數據保存到 chrome.storage.local
3. 刷新頁面
4. 從 storage 讀取數據
5. 驗證數據完整性
```

**預期結果**:

- 數據成功保存到 storage
- 刷新後數據仍然存在
- 數據內容正確

### 示例 3: 測試內容提取

**請求**:

```
測試內容提取功能：
1. 打開一個 WordPress 博客文章（如有測試 URL）
2. 執行內容提取腳本
3. 檢查提取的數據結構
4. 驗證標題、段落、圖片都被提取
5. 報告提取的區塊數量
```

## MCP 工具能力

基於項目中可用的 MCP 工具，我們可以：

### 頁面控制

- `new_page` - 創建新標籤頁
- `navigate_page` - 導航到 URL
- `close_page` - 關閉頁面
- `resize_page` - 調整視窗大小

### 交互操作

- `click` - 點擊元素
- `fill` - 填寫表單
- `hover` - 懸停元素
- `drag` - 拖拽操作

### 腳本執行

- `evaluate_script` - 在頁面執行 JavaScript
- 可以訪問 Chrome Extension APIs
- 可以操作 DOM 和 window 對象

### 調試輔助

- `take_screenshot` - 截圖
- `take_snapshot` - 頁面快照
- `list_console_messages` - 查看控制台
- `list_network_requests` - 查看網絡請求

### 等待和驗證

- `wait_for` - 等待元素或條件
- 可以設置超時時間
- 可以等待選擇器、網絡或自定義條件

## 測試覆蓋率提升計劃

使用 MCP E2E 測試，我們可以提升以下模塊的覆蓋率：

### background.js (6.92% → 目標 40-50%)

**可測試場景**:

- ✅ Message handlers (checkPageStatus, saveToNotion, etc.)
- ✅ Script injection flow
- ✅ Notion API integration
- ✅ Storage operations
- ✅ Tab lifecycle management

**測試方法**:

```javascript
// 在頁面中發送消息給 background script
await evaluate_script({
  script: `
        chrome.runtime.sendMessage({ action: 'checkPageStatus' }, response => {
            console.log('Response:', response);
        });
    `,
});
```

### content.js (31.53% → 目標 60-70%)

**可測試場景**:

- ✅ Readability content extraction
- ✅ CMS-specific extraction (Drupal, WordPress)
- ✅ Image extraction with priorities
- ✅ Large list extraction
- ✅ Expandable content detection

**測試方法**:

```javascript
// 注入 content script 並執行提取
await evaluate_script({
  script: `
        // 模擬 content script 的提取邏輯
        const result = extractArticleContent();
        return result;
    `,
});
```

### highlighter-v2.js (18.78% → 目標 55-65%)

**可測試場景**:

- ✅ Text selection and highlight creation
- ✅ Multi-color support
- ✅ CSS Highlight API detection
- ✅ Highlight deletion (Ctrl+Click)
- ✅ Storage and restoration
- ✅ Event handling

**測試方法**:

```javascript
// 測試高亮創建
await evaluate_script({
  script: `
        // 選擇文本
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('p'));
        window.getSelection().addRange(range);

        // 觸發高亮創建事件
        document.dispatchEvent(new MouseEvent('mouseup'));

        // 檢查結果
        return {
            highlightCreated: !!document.querySelector('[data-highlight-id]'),
            highlightCount: window.notionHighlighter?.manager?.getCount()
        };
    `,
});
```

## 下一步行動

### 立即可以做的

1. **運行測試計劃腳本**: `node tests/e2e/mcp-test-suite.js`
2. **在對話中請求測試**: 告訴我你想測試什麼功能
3. **查看測試文檔**: 閱讀 `README-MCP-E2E.md`

### 需要配置的

1. **確認 MCP 連接**: Chrome DevTools MCP 可能需要額外配置
2. **準備測試環境**: 確保擴展已構建 (`npm run build`)
3. **創建測試數據**: 準備測試用的 Notion API 配置

### 長期改進

1. **自動化測試**: 集成到 CI/CD
2. **測試報告**: 生成覆蓋率報告
3. **回歸測試**: 每次發布前運行完整測試套件

## 實戰建議

### 從簡單開始

1. 先測試靜態功能（內容提取）
2. 再測試交互功能（高亮創建）
3. 最後測試集成功能（保存到 Notion）

### 逐步驗證

1. 每個步驟都截圖
2. 檢查控制台輸出
3. 驗證 storage 數據
4. 確認網絡請求

### 錯誤處理

1. 設置合理的超時時間
2. 捕獲並記錄錯誤
3. 在失敗時截圖
4. 清理測試數據

## 總結

✅ **已準備好的資源**:

- 測試計劃和文檔
- 測試套件模板
- 詳細的測試場景

🚀 **如何開始**:

- 直接告訴我你想測試什麼
- 我會使用 MCP 工具執行並報告結果
- 逐步提升測試覆蓋率

💡 **記住**:

- MCP E2E 測試是提升覆蓋率的關鍵
- 可以測試 Jest 無法測試的 Extension 功能
- 真實瀏覽器環境提供最準確的測試結果
