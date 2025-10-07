# 標註遷移指南# 技術移植指南

**版本:** v2.5.0  

**日期:** 2025年10月1日## 🔧 將標記系統移植到現有擴展



## 📋 核心問題### 📦 核心模組提取



> **"實行新方案後，舊版標註仍會在已保存的網頁顯示嗎？"**#### 1. 可移植的模組

```

**簡短答案：** scripts/

- ✅ **會顯示** - 舊標註的span元素已經在DOM中，會繼續有視覺效果├── utils.js              # 共享工具（URL標準化、存儲）

- ⚠️ **但無法管理** - 新版工具不認識這些舊元素├── highlighter.js        # 標記系統核心

- 🔄 **需要遷移** - 我們提供了自動遷移工具├── highlight-restore.js  # 自動恢復機制

└── script-injector.js    # 腳本注入管理（背景腳本部分）

---```



## 🔍 舊版標註的兩種存在形式#### 2. 整合要點



### 1️⃣ DOM中的物理標註##### A. Manifest.json 權限

```json

```html{

<!-- 舊版在HTML中的實際存在 -->  "permissions": [

<p>這是一段文本，    "activeTab",

    <span class="simple-highlight" style="background-color: #fff3cd;">    "scripting", 

        這部分被標註了    "storage"

    </span>  ],

    繼續其他文本。  "content_scripts": [

</p>    {

```      "matches": ["<all_urls>"],

      "js": ["scripts/utils.js", "scripts/highlight-restore.js"],

**特點：**      "run_at": "document_end"

- ✅ **永久存在** - span已插入DOM    }

- ✅ **會繼續顯示** - 有CSS樣式就有黃色背景  ]

- ❌ **無法管理** - 新版不認識這些元素}

- ❌ **無法刪除** - 雙擊操作無效```



### 2️⃣ Storage中的數據##### B. 背景腳本整合

將 ScriptInjector 類別整合到現有背景腳本：

```javascript

{```javascript

    text: "這部分被標註了",// 最小整合版本

    color: "#fff3cd"class HighlightManager {

}    static async injectHighlighter(tabId) {

```        return chrome.scripting.executeScript({

            target: { tabId },

- 僅用於同步到Notion            files: ['scripts/utils.js', 'scripts/highlighter.js']

- 不用於恢復顯示        });

    }

---    

    static async collectHighlights(tabId) {

## 🎯 解決方案：自動遷移        const result = await chrome.scripting.executeScript({

            target: { tabId },

### 遷移流程            func: () => window.collectHighlights ? window.collectHighlights() : []

        });

```        return result[0]?.result || [];

頁面加載    }

    ↓}

檢測舊標註 (.simple-highlight)```

    ↓

[發現舊標註] → 顯示遷移提示##### C. 訊息處理器擴展

    ↓```javascript

用戶選擇// 添加到現有訊息處理器

    ├─ [遷移] → 轉換為新格式 → 移除舊span → ✅完成chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    └─ [保持] → 記錄決定 → 保持原樣 → ⏭️跳過    switch (request.action) {

```        case 'startHighlight':

            HighlightManager.injectHighlighter(sender.tab.id)

### 遷移對話框                .then(() => sendResponse({ success: true }));

            return true;

```            

┌──────────────────────────────────────┐        case 'updateHighlights':

│  🔄 標註功能升級                      │            HighlightManager.collectHighlights(sender.tab.id)

├──────────────────────────────────────┤                .then(highlights => {

│  檢測到此頁面有 5 個舊版標註。        │                    // 整合到現有的 Notion 保存邏輯

│                                      │                    sendResponse({ success: true, highlights });

│  新版標註功能：                       │                });

│  ✨ 不修改網頁結構                    │            return true;

│  🎯 完美支持跨元素標註                │    }

│  ⚡ 性能更好，更穩定                  │});

│                                      │```

│  是否要將舊標註遷移到新格式？          │

│                                      │### 🔗 與現有功能整合

│    [保持舊版]    [遷移到新版] ←推薦   │

└──────────────────────────────────────┘#### 1. 保存邏輯整合

``````javascript

// 在現有的保存函數中添加標記

---async function savePageToNotion(pageData) {

    // 現有邏輯...

## 🔄 遷移前後對比    

    // 添加標記收集

### 遷移前（舊版）    const highlights = await HighlightManager.collectHighlights(tabId);

    if (highlights.length > 0) {

**DOM：**        pageData.highlights = highlights;

```html        // 添加到 Notion blocks

<p>文本<span class="simple-highlight">標註</span>文本</p>        pageData.blocks.push(...formatHighlightsAsBlocks(highlights));

```    }

    

**問題：**    // 繼續現有保存邏輯...

- ❌ DOM被修改}

- ❌ 跨元素困難```

- ❌ 可能重複

#### 2. UI 整合選項

### 遷移後（新版）

##### A. 獨立工具欄（現有方式）

**DOM：**保持現有的標記工具欄設計

```html

<p>文本標註文本</p>##### B. 整合到現有面板

<!-- 完全不變！ -->```javascript

```// 在現有彈出面板中添加標記按鈕

function addHighlightButton() {

**CSS Highlight API：**    const highlightBtn = document.createElement('button');

```javascript    highlightBtn.textContent = '開始標記';

const range = createRange(4, 6);    highlightBtn.onclick = () => {

const highlight = new Highlight(range);        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {

CSS.highlights.set('notion-highlight-1', highlight);            chrome.runtime.sendMessage({

```                action: 'startHighlight'

            });

**優勢：**        });

- ✅ DOM不變    };

- ✅ 跨元素完美    

- ✅ 無重複問題    // 添加到現有 UI

    document.getElementById('existing-panel').appendChild(highlightBtn);

---}

```

## 🛠️ 技術實現

### 📋 移植檢查清單

### 1. 檢測舊標註

#### Phase 1: 基礎整合 ✅

```javascript- [ ] 複製 utils.js 到目標擴展

const oldHighlights = document.querySelectorAll('.simple-highlight');- [ ] 複製 highlighter.js 和 highlight-restore.js

console.log(`發現 ${oldHighlights.length} 個舊標註`);- [ ] 更新 manifest.json 權限

```- [ ] 基本功能測試



### 2. 提取信息#### Phase 2: 功能整合 🔄

- [ ] 整合 HighlightManager 到背景腳本

```javascript- [ ] 添加訊息處理器

const text = span.textContent;- [ ] 測試標記保存和恢復

const bgColor = span.style.backgroundColor;

const color = convertColorToName(bgColor); // yellow/green/blue/red#### Phase 3: UI 整合 ⏳

```- [ ] 決定 UI 整合方式

- [ ] 實現標記按鈕

### 3. 創建Range- [ ] 統一設計風格



```javascript#### Phase 4: 高級功能 🎯

const range = document.createRange();- [ ] 標記數據同步到 Notion

range.selectNodeContents(span);- [ ] 設定頁面整合

highlightManager.addHighlight(range, color);- [ ] 用戶偏好設定

```

### 🚨 潛在挑戰

### 4. 移除舊span

#### 1. 代碼衝突

```javascript- 命名空間衝突

const parent = span.parentNode;- CSS 樣式衝突

while (span.firstChild) {- 全域變數重複

    parent.insertBefore(span.firstChild, span);

}#### 2. 功能重複

parent.removeChild(span);- 存儲機制不同

parent.normalize();- 錯誤處理方式差異

```- API 呼叫模式不同



---#### 3. 用戶體驗

- UI 一致性

## ⚠️ 注意事項- 功能發現性

- 學習曲線

### 1. 遷移是單向的

- 遷移後無法自動回滾### 🎯 建議步驟

- 建議先小範圍測試

1. **先做技術可行性測試**

### 2. 某些情況可能失敗   - 下載現有擴展（如果可能）

- DOM結構已嚴重變化   - 分析其代碼結構

- span被其他腳本刪除   - 評估整合複雜度

- 會記錄失敗原因

2. **建立最小可行版本**

### 3. 多設備同步   - 只整合核心標記功能

- 每台設備獨立遷移   - 測試基本相容性

- Notion端數據保持兼容   - 驗證無功能衝突



### 4. 瀏覽器要求3. **逐步深度整合**

- Chrome 105+ / Safari 17.2+   - UI 統一化

- 不支持時會使用傳統方法   - 功能完善

   - 效能優化
---

## 📊 遷移統計

### 成功示例

```
✅ 遷移完成
成功: 5 / 5
所有標註已更新到新格式
```

### 部分失敗

```
⚠️ 遷移完成  
成功: 4 / 5
失敗: 1
部分標註需要手動處理
```

---

## 🎯 用戶指南

### 我應該遷移嗎？

**推薦遷移，如果：**
- ✅ 您經常標註跨元素文本
- ✅ 遇到過重複標註問題
- ✅ 希望更好的性能

**可以保持舊版，如果：**
- ⚠️ 您的瀏覽器版本較舊
- ⚠️ 您很少使用標註功能
- ⚠️ 暫時不想改變

### 遷移安全嗎？

是的！遷移過程：
1. 先創建新標註
2. 確認成功後才移除舊標註
3. 失敗的標註保持原樣
4. 可以隨時重新嘗試

### 遷移後能回滾嗎？

- 可以重新安裝舊版擴展
- 但已移除的span無法恢復
- 建議先測試再大量遷移

---

## 📁 相關文件

已創建的遷移工具：
- `scripts/highlighter-v2.js` - 新版標註實現
- `scripts/highlighter-migration.js` - 遷移管理器
- `HIGHLIGHTER_UPGRADE_PLAN.md` - 完整升級計劃

---

## 🚀 發布計劃

### v2.5.0-beta
- 新舊共存
- 小範圍測試遷移
- 收集反饋

### v2.5.0
- 默認啟用新版
- 自動提示遷移
- 保留傳統後備

### v2.6.0
- 移除舊代碼
- 完全使用新API
- 進一步優化

---

## 💡 總結

### 關鍵點

1. ✅ **舊標註會顯示** - DOM中的span不會消失
2. ⚠️ **但無法管理** - 需要遷移才能管理
3. 🔄 **提供遷移工具** - 友好的自動遷移
4. ✨ **遷移後更好** - 解決所有已知問題

### 建議流程

```
1. 安裝 v2.5.0-beta
2. 打開已標註的頁面
3. 看到遷移提示 → 選擇"遷移"
4. 驗證標註正常 → ✅ 完成
```

---

**文檔版本：** 1.0  
**最後更新：** 2025年10月1日  
**適用版本：** v2.5.0+
