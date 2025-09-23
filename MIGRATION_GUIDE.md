# 技術移植指南

## 🔧 將標記系統移植到現有擴展

### 📦 核心模組提取

#### 1. 可移植的模組
```
scripts/
├── utils.js              # 共享工具（URL標準化、存儲）
├── highlighter.js        # 標記系統核心
├── highlight-restore.js  # 自動恢復機制
└── script-injector.js    # 腳本注入管理（背景腳本部分）
```

#### 2. 整合要點

##### A. Manifest.json 權限
```json
{
  "permissions": [
    "activeTab",
    "scripting", 
    "storage"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["scripts/utils.js", "scripts/highlight-restore.js"],
      "run_at": "document_end"
    }
  ]
}
```

##### B. 背景腳本整合
將 ScriptInjector 類別整合到現有背景腳本：

```javascript
// 最小整合版本
class HighlightManager {
    static async injectHighlighter(tabId) {
        return chrome.scripting.executeScript({
            target: { tabId },
            files: ['scripts/utils.js', 'scripts/highlighter.js']
        });
    }
    
    static async collectHighlights(tabId) {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.collectHighlights ? window.collectHighlights() : []
        });
        return result[0]?.result || [];
    }
}
```

##### C. 訊息處理器擴展
```javascript
// 添加到現有訊息處理器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'startHighlight':
            HighlightManager.injectHighlighter(sender.tab.id)
                .then(() => sendResponse({ success: true }));
            return true;
            
        case 'updateHighlights':
            HighlightManager.collectHighlights(sender.tab.id)
                .then(highlights => {
                    // 整合到現有的 Notion 保存邏輯
                    sendResponse({ success: true, highlights });
                });
            return true;
    }
});
```

### 🔗 與現有功能整合

#### 1. 保存邏輯整合
```javascript
// 在現有的保存函數中添加標記
async function savePageToNotion(pageData) {
    // 現有邏輯...
    
    // 添加標記收集
    const highlights = await HighlightManager.collectHighlights(tabId);
    if (highlights.length > 0) {
        pageData.highlights = highlights;
        // 添加到 Notion blocks
        pageData.blocks.push(...formatHighlightsAsBlocks(highlights));
    }
    
    // 繼續現有保存邏輯...
}
```

#### 2. UI 整合選項

##### A. 獨立工具欄（現有方式）
保持現有的標記工具欄設計

##### B. 整合到現有面板
```javascript
// 在現有彈出面板中添加標記按鈕
function addHighlightButton() {
    const highlightBtn = document.createElement('button');
    highlightBtn.textContent = '開始標記';
    highlightBtn.onclick = () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.runtime.sendMessage({
                action: 'startHighlight'
            });
        });
    };
    
    // 添加到現有 UI
    document.getElementById('existing-panel').appendChild(highlightBtn);
}
```

### 📋 移植檢查清單

#### Phase 1: 基礎整合 ✅
- [ ] 複製 utils.js 到目標擴展
- [ ] 複製 highlighter.js 和 highlight-restore.js
- [ ] 更新 manifest.json 權限
- [ ] 基本功能測試

#### Phase 2: 功能整合 🔄
- [ ] 整合 HighlightManager 到背景腳本
- [ ] 添加訊息處理器
- [ ] 測試標記保存和恢復

#### Phase 3: UI 整合 ⏳
- [ ] 決定 UI 整合方式
- [ ] 實現標記按鈕
- [ ] 統一設計風格

#### Phase 4: 高級功能 🎯
- [ ] 標記數據同步到 Notion
- [ ] 設定頁面整合
- [ ] 用戶偏好設定

### 🚨 潛在挑戰

#### 1. 代碼衝突
- 命名空間衝突
- CSS 樣式衝突
- 全域變數重複

#### 2. 功能重複
- 存儲機制不同
- 錯誤處理方式差異
- API 呼叫模式不同

#### 3. 用戶體驗
- UI 一致性
- 功能發現性
- 學習曲線

### 🎯 建議步驟

1. **先做技術可行性測試**
   - 下載現有擴展（如果可能）
   - 分析其代碼結構
   - 評估整合複雜度

2. **建立最小可行版本**
   - 只整合核心標記功能
   - 測試基本相容性
   - 驗證無功能衝突

3. **逐步深度整合**
   - UI 統一化
   - 功能完善
   - 效能優化