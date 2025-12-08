# Chrome DevTools MCP E2E 測試指南

## 概述

使用 Chrome DevTools MCP 工具可以實現真實瀏覽器環境的自動化 E2E 測試，特別適合測試 Chrome Extension 的功能。

## 為什麼使用 Chrome DevTools MCP？

### 優勢

1. **真實環境** - 在真實的 Chrome 瀏覽器中運行，完整支持 Extension APIs
2. **自動化** - 可編程控制瀏覽器操作（導航、點擊、輸入等）
3. **調試友好** - 可以截圖、查看控制台、檢查 DOM
4. **已集成** - Claude Code 已經配置好 MCP 工具

### vs. 現有方案

- **vs. Jest + JSDOM**: 真實瀏覽器環境，支持 Extension APIs
- **vs. Puppeteer**: MCP 已集成，無需額外配置
- **vs. 手動測試**: 可重複、自動化、快速

## 可測試的功能模塊

### 1. Highlighter 功能

- ✅ 文本選擇和高亮創建
- ✅ 多顏色高亮 (yellow, green, blue, red, purple)
- ✅ 高亮刪除 (Ctrl+Click, 雙擊)
- ✅ 高亮持久化（存儲和恢復）
- ✅ CSS Highlight API vs. Span-based 回退

### 2. Content Extraction

- ✅ Readability 內容提取
- ✅ CMS 適配 (Drupal, WordPress)
- ✅ 圖片提取
- ✅ 網站圖標提取

### 3. Notion Integration

- ✅ 保存頁面到 Notion
- ✅ 同步高亮到 Notion
- ✅ 更新已保存頁面
- ✅ 打開 Notion 頁面

## MCP 工具使用示例

### 基本流程

```javascript
// 1. 創建新頁面
(await mcp__chrome) - devtools__new_page();

// 2. 導航到測試頁面
(await mcp__chrome) -
  devtools__navigate_page({
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  });

// 3. 等待頁面加載
(await mcp__chrome) -
  devtools__wait_for({
    selector: 'article',
    timeout: 5000,
  });

// 4. 執行腳本注入高亮器
(await mcp__chrome) -
  devtools__evaluate_script({
    script: `
        // 模擬擴展腳本加載
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/highlighter-v2.js');
        document.head.appendChild(script);
    `,
  });

// 5. 選擇文本並創建高亮
(await mcp__chrome) -
  devtools__evaluate_script({
    script: `
        const p = document.querySelector('article p');
        const range = document.createRange();
        range.selectNodeContents(p);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // 觸發 mouseup 事件
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    `,
  });

// 6. 驗證高亮創建
(await mcp__chrome) -
  devtools__evaluate_script({
    script: `
        const highlights = document.querySelectorAll('[data-highlight-id]');
        return highlights.length > 0;
    `,
  });

// 7. 截圖驗證
(await mcp__chrome) -
  devtools__take_screenshot({
    path: 'tests/e2e/screenshots/highlight-created.png',
  });
```

## 測試場景示例

### 場景 1: 高亮創建和刪除

```javascript
// 測試步驟
1. 打開測試頁面
2. 加載擴展腳本
3. 選擇文本並創建黃色高亮
4. 驗證高亮顯示
5. Ctrl+Click 刪除高亮
6. 驗證高亮移除
```

### 場景 2: 高亮持久化

```javascript
// 測試步驟
1. 創建多個不同顏色的高亮
2. 刷新頁面
3. 驗證高亮從 chrome.storage 恢復
4. 檢查所有高亮顏色正確
```

### 場景 3: CMS 內容提取

```javascript
// 測試步驟
1. 導航到 WordPress 博客文章
2. 觸發內容提取
3. 驗證提取了標題、正文、圖片
4. 檢查 Notion 區塊格式正確
```

## 實際測試實現

### 方法 1: 在 Claude Code Chat 中直接運行

向 Claude Code 發送：

```
使用 Chrome DevTools MCP 測試高亮功能：
1. 打開 https://developer.mozilla.org/en-US/docs/Web/JavaScript
2. 注入 highlighter-v2.js
3. 選擇第一段文本創建黃色高亮
4. 截圖保存
5. 刷新頁面驗證高亮恢復
```

### 方法 2: 編寫測試腳本（由 Agent 執行）

創建測試任務文件，使用 `Task` 工具啟動 agent 執行：

```javascript
// tests/e2e/mcp-tests/highlight-workflow.task.js
module.exports = {
  name: 'Highlight Workflow E2E Test',
  steps: [
    'new_page',
    'navigate to MDN',
    'wait for article',
    'inject highlighter',
    'create yellow highlight',
    'verify highlight exists',
    'delete highlight',
    'verify highlight removed',
  ],
};
```

## 關鍵測試點

### Background.js (Service Worker)

```javascript
// 測試消息處理
(await mcp__chrome) -
  devtools__evaluate_script({
    script: `
        chrome.runtime.sendMessage({ action: 'checkPageStatus' }, response => {
            console.log('Response:', response);
        });
    `,
  });
```

### Content.js (Content Script)

```javascript
// 測試內容提取
(await mcp__chrome) -
  devtools__evaluate_script({
    script: `
        const result = extractArticleContent();
        return {
            title: result.title,
            blockCount: result.blocks.length,
            hasImages: result.blocks.some(b => b.type === 'image')
        };
    `,
  });
```

### Highlighter-v2.js

```javascript
// 測試高亮 API
(await mcp__chrome) -
  devtools__evaluate_script({
    script: `
        const manager = window.notionHighlighter?.manager;
        return {
            isActive: manager?.isActive(),
            highlightCount: manager?.getCount(),
            supportsAPI: typeof CSS?.highlights !== 'undefined'
        };
    `,
  });
```

## 覆蓋率提升預期

使用 MCP E2E 測試後，預期覆蓋率提升：

| 模塊              | 當前   | E2E 後預期 | 提升    |
| ----------------- | ------ | ---------- | ------- |
| background.js     | 6.92%  | 40-50%     | +33-43% |
| content.js        | 31.53% | 60-70%     | +28-38% |
| highlighter-v2.js | 18.78% | 55-65%     | +36-46% |

## 最佳實踐

1. **獨立性**: 每個測試應該獨立，不依賴其他測試
2. **清理**: 測試後清理 storage 和 DOM 狀態
3. **截圖**: 關鍵步驟截圖，便於調試
4. **錯誤處理**: 捕獲並記錄詳細錯誤信息
5. **超時設置**: 合理設置等待超時時間

## 下一步

1. 在 Claude Code 中嘗試運行簡單的 MCP 測試
2. 驗證擴展腳本可以正確注入
3. 逐步添加測試場景
4. 集成到 CI/CD 流程（如果需要）

## 參考資源

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Chrome Extension Testing](https://developer.chrome.com/docs/extensions/mv3/tut_testing/)
- 項目現有測試: `tests/e2e/`
