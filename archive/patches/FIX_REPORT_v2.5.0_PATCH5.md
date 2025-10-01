# 🚨 緊急修復報告 - v2.5.0 PATCH5

## 📌 問題描述

**用戶報告的問題：**

1. ❌ **標註狀態沒有保存，刷新頁面即消失**
2. ❌ **`window.collectHighlights is not a function`** 錯誤

**嚴重程度：** 🔴 **CRITICAL** - 核心功能完全失效

---

## 🔍 根本原因分析

### 問題 1：標註刷新後消失

**原因：** 
- `highlighter-v2.js` 沒有自動初始化
- `HighlightManager` 構造函數會調用 `restoreHighlights()`
- 但如果 `initHighlighter()` 從未被調用，管理器就不會被創建
- 因此無法恢復保存的標註

**證據：**
```javascript
// highlighter-v2.js 的結構
function initHighlighter() {
    const manager = new HighlightManager(); // 只有這裡會創建管理器
    // ...
}

class HighlightManager {
    constructor() {
        this.restoreHighlights(); // 恢復標註
    }
}

// 腳本末尾
window.initHighlighter = initHighlighter; // 只是導出，沒有調用！
```

### 問題 2：`window.collectHighlights is not a function`

**原因：**
- `window.collectHighlights` 依賴於 `window.notionHighlighter` 存在
- `window.notionHighlighter` 只在 `initHighlighter()` 被調用時創建
- 腳本加載時沒有自動調用 `initHighlighter()`

**證據：**
```javascript
// highlighter-v2.js
window.collectHighlights = () => {
    if (window.notionHighlighter) {  // 🔴 依賴 notionHighlighter
        return window.notionHighlighter.manager.collectHighlightsForNotion();
    }
    return [];
};

// initHighlighter() 中
window.notionHighlighter = {  // 🔴 只在這裡創建
    manager: manager,
    // ...
};
```

### 問題 3：腳本不會自動加載

**原因：**
- `manifest.json` 沒有 `content_scripts` 配置
- 腳本只在用戶點擊 "Start Highlighting" 時手動注入
- 頁面刷新後，腳本沒有重新注入

---

## ✅ 修復方案

### 修復 1：添加自動初始化邏輯

**文件：** `scripts/highlighter-v2.js`

在腳本末尾添加自動初始化：

```javascript
// 🔑 頁面加載時自動初始化
console.log('🚀 Notion Highlighter v2 腳本已加載');

(async function autoInit() {
    try {
        const url = window.location.href;
        const data = await StorageUtil.loadHighlights(url);
        
        if (data && data.highlights && data.highlights.length > 0) {
            // 有保存的標註，自動初始化
            console.log(`📦 發現 ${data.highlights.length} 個保存的標註，自動初始化...`);
            initHighlighter();
            // 隱藏工具欄（只恢復標註，不顯示UI）
            if (window.notionHighlighter) {
                window.notionHighlighter.hide();
            }
        } else {
            // 沒有保存的標註，但仍然初始化以便函數可用
            console.log('📝 初始化標註系統（無保存的標註）');
            initHighlighter();
            if (window.notionHighlighter) {
                window.notionHighlighter.hide();
            }
        }
    } catch (error) {
        console.error('❌ 自動初始化失敗:', error);
        // 即使失敗也要初始化
        initHighlighter();
        if (window.notionHighlighter) {
            window.notionHighlighter.hide();
        }
    }
})();
```

**效果：**
- ✅ 頁面加載時自動初始化標註系統
- ✅ 恢復之前保存的標註
- ✅ `window.collectHighlights` 等函數始終可用
- ✅ 工具欄默認隱藏，用戶點擊後才顯示

### 修復 2：工具欄默認隱藏

**文件：** `scripts/highlighter-v2.js`

修改 `initHighlighter()` 函數：

```javascript
function initHighlighter() {
    if (window.notionHighlighter) {
        console.log('✅ 標註工具已存在，顯示工具欄');
        window.notionHighlighter.show();
        return;
    }

    console.log('🔧 開始初始化標註系統...');

    const manager = new HighlightManager();
    let isActive = false;
    
    // 創建工具欄（默認隱藏）
    const toolbar = createSimpleToolbar(manager);
    toolbar.style.display = 'none'; // 🔑 默認隱藏
    document.body.appendChild(toolbar);
    
    // ...
}
```

**效果：**
- ✅ 自動初始化時不顯示工具欄
- ✅ 點擊 "Start Highlighting" 時才顯示

### 修復 3：添加 content_scripts 配置

**文件：** `manifest.json`

添加自動腳本注入：

```json
{
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": [
        "scripts/utils.js",
        "scripts/seamless-migration.js",
        "scripts/highlighter-v2.js"
      ],
      "run_at": "document_idle",
      "all_frames": false
    }
  ]
}
```

**效果：**
- ✅ 每個頁面自動加載腳本
- ✅ 刷新頁面後標註自動恢復
- ✅ `window.collectHighlights` 始終可用

### 修復 4：優化 background.js

**文件：** `scripts/background.js`

修改 `injectHighlighter()` 方法：

```javascript
static async injectHighlighter(tabId) {
    return this.injectAndExecute(
        tabId,
        ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
        () => {
            // 確保已初始化
            if (window.initHighlighter) {
                window.initHighlighter();
            }
            
            // 顯示工具欄
            if (window.notionHighlighter) {
                window.notionHighlighter.show();
                console.log('✅ 工具欄已顯示');
            }
        },
        {
            errorMessage: 'Failed to inject highlighter',
            successMessage: 'Highlighter v2 injected and initialized successfully'
        }
    );
}
```

**效果：**
- ✅ 即使腳本已加載，調用時也能正確顯示工具欄

---

## 🎯 修復效果對比

### 修復前 ❌

```
用戶操作流程：
1. 訪問頁面
2. 腳本未加載（沒有 content_scripts）
3. 點擊 "Start Highlighting"
4. 腳本被注入，initHighlighter() 被調用
5. 創建標註
6. 刷新頁面
7. 腳本消失，標註消失 ❌
8. window.collectHighlights 不存在 ❌

問題：
- 標註不會恢復
- 無法同步到 Notion
- 用戶體驗極差
```

### 修復後 ✅

```
用戶操作流程：
1. 訪問頁面
2. content_scripts 自動加載 ✅
3. 自動初始化標註系統 ✅
4. 檢查並恢復之前的標註 ✅
5. 工具欄隱藏（不干擾用戶）✅
6. 點擊 "Start Highlighting"
7. 工具欄顯示
8. 創建標註
9. 刷新頁面
10. 腳本自動重新加載 ✅
11. 標註自動恢復並顯示 ✅
12. window.collectHighlights 始終可用 ✅

優勢：
- 標註持久化
- 刷新後自動恢復
- 可以隨時同步到 Notion
- 用戶體驗流暢
```

---

## 🧪 測試驗證

### 測試場景 1：首次訪問頁面

```
步驟：
1. 重新加載擴展
2. 訪問新頁面（從未標註過）
3. 打開控制台（F12）

預期控制台輸出：
🚀 Notion Highlighter v2 腳本已加載
📝 初始化標註系統（無保存的標註）
🔧 開始初始化標註系統...
✅ 使用 CSS Custom Highlight API
✅ 已註冊標註樣式: notion-yellow
✅ 已註冊標註樣式: notion-green
✅ 已註冊標註樣式: notion-blue
✅ 已註冊標註樣式: notion-red
沒有需要恢復的標註
✅ 標註工具已初始化

驗證：
✅ 頁面上沒有工具欄（隱藏狀態）
✅ window.notionHighlighter 存在
✅ window.collectHighlights 是函數
```

### 測試場景 2：創建標註

```
步驟：
1. 點擊擴展 → "Start Highlighting"
2. 工具欄出現
3. 選擇文字創建標註
4. 看到黃色標記

預期控制台輸出：
✅ 工具欄已顯示
✅ 標註模式已啟動
📍 選擇了文本: "..."
✅ 已添加到 notion-yellow Highlight 對象
✅ 標註已添加: highlight-1, 文本長度: XX

驗證：
✅ 文字有黃色背景
✅ 控制台有成功日誌
```

### 測試場景 3：刷新頁面（關鍵測試）

```
步驟：
1. 創建 2-3 個標註
2. 按 F5 刷新頁面
3. 觀察頁面和控制台

預期控制台輸出：
🚀 Notion Highlighter v2 腳本已加載
📦 發現 3 個保存的標註，自動初始化...
🔧 開始初始化標註系統...
✅ 使用 CSS Custom Highlight API
✅ 已註冊標註樣式: notion-yellow
...
🔄 開始恢復 3 個標註...
✅ 成功恢復 3/3 個標註
✅ 標註工具已初始化

預期視覺效果：
✅ 之前標註的文字仍然有黃色背景
✅ 工具欄隱藏（用戶點擊後才顯示）
✅ 標註完整恢復

驗證：
✅ 標註沒有消失 ⭐️
✅ 可以創建新標註
✅ window.collectHighlights() 返回 3 個標註
```

### 測試場景 4：同步到 Notion

```
步驟：
1. 有標註的頁面
2. 在控制台運行：window.collectHighlights()
3. 點擊 "Save Page"
4. 前往 Notion 檢查

預期：
✅ window.collectHighlights() 返回標註數組
✅ 控制台顯示收集日誌
✅ Notion 頁面包含標註內容
```

---

## 📊 技術細節

### content_scripts 的作用

```json
"content_scripts": [
    {
        "matches": ["http://*/*", "https://*/*"],
        "js": ["scripts/utils.js", "scripts/seamless-migration.js", "scripts/highlighter-v2.js"],
        "run_at": "document_idle",
        "all_frames": false
    }
]
```

**參數說明：**

- **`matches`**: 在所有 HTTP/HTTPS 頁面上運行
- **`js`**: 按順序注入腳本（依賴順序很重要）
- **`run_at: "document_idle"`**: DOM 加載完成後運行（最佳時機）
- **`all_frames: false`**: 只在主框架運行（不在 iframe 中）

**優勢：**
- 自動注入，無需手動調用
- 每次頁面加載都會運行
- 刷新頁面自動重新加載

### 自動初始化的策略

```javascript
(async function autoInit() {
    // 1. 檢查是否有保存的標註
    const data = await StorageUtil.loadHighlights(url);
    
    if (data && data.highlights.length > 0) {
        // 2a. 有標註：初始化 + 恢復 + 隱藏工具欄
        initHighlighter();
        window.notionHighlighter.hide();
    } else {
        // 2b. 無標註：初始化 + 隱藏工具欄
        initHighlighter();
        window.notionHighlighter.hide();
    }
})();
```

**為什麼總是初始化？**
- 確保 `window.collectHighlights` 等函數始終可用
- 即使沒有標註，也可以隨時開始標註
- 避免「函數不存在」錯誤

**為什麼隱藏工具欄？**
- 不干擾用戶正常瀏覽
- 用戶主動點擊後才顯示
- 提供乾淨的用戶體驗

---

## 🎓 經驗總結

### 這次問題的教訓

1. **自動化 > 手動化**
   - content_scripts 比手動注入更可靠
   - 自動初始化比等待調用更穩健

2. **測試真實場景**
   - 不只測試首次使用
   - 要測試刷新、關閉、重開
   - 模擬用戶的完整使用流程

3. **依賴關係要清楚**
   - `collectHighlights` 依賴 `notionHighlighter`
   - `notionHighlighter` 依賴 `initHighlighter`
   - 依賴鏈要保證完整

4. **初始化時機很重要**
   - 太早：DOM 可能未就緒
   - 太晚：用戶操作時功能不可用
   - `document_idle` 是最佳時機

### 最佳實踐

1. **Content Scripts 設計**
   ```javascript
   // ✅ 正確：自動初始化 + 條件顯示
   autoInit(); // 總是初始化
   hideUI();   // 默認隱藏UI
   
   // ❌ 錯誤：等待手動調用
   window.init = function() { ... }; // 可能永遠不被調用
   ```

2. **狀態恢復**
   ```javascript
   // ✅ 正確：初始化時自動恢復
   constructor() {
       this.restoreHighlights(); // 自動
   }
   
   // ❌ 錯誤：手動調用
   manager.restore(); // 容易忘記
   ```

3. **UI 顯示控制**
   ```javascript
   // ✅ 正確：初始化時隱藏，需要時顯示
   toolbar.style.display = 'none'; // 初始化
   toolbar.style.display = 'block'; // 用戶觸發
   
   // ❌ 錯誤：初始化時就顯示
   toolbar.style.display = 'block'; // 干擾用戶
   ```

---

## 🚀 部署和驗證

### 緊急程度
🔴 **立即部署** - 核心功能完全失效

### 部署步驟

1. **重新加載擴展**
   ```
   chrome://extensions/ → 找到 Notion Smart Clipper → 點擊 🔄
   ```

2. **刷新所有已打開的頁面**
   ```
   F5 或 Cmd+R
   ```

3. **驗證自動初始化**
   ```
   打開控制台 → 應該看到 "🚀 Notion Highlighter v2 腳本已加載"
   ```

### 回歸測試清單

- [ ] 訪問新頁面 → 腳本自動加載
- [ ] 控制台有初始化日誌
- [ ] `window.collectHighlights` 是函數
- [ ] 點擊 "Start Highlighting" → 工具欄顯示
- [ ] 創建標註 → 黃色標記出現
- [ ] 刷新頁面 → **標註仍然存在** ⭐️
- [ ] 控制台有恢復日誌
- [ ] `window.collectHighlights()` 返回標註
- [ ] 保存到 Notion → 標註內容出現在頁面

---

## 📝 相關文件修改

### 修改的文件
1. **`scripts/highlighter-v2.js`**
   - 添加自動初始化邏輯
   - 工具欄默認隱藏
   - 增強日誌輸出

2. **`manifest.json`**
   - 添加 `content_scripts` 配置

3. **`scripts/background.js`**
   - 優化 `injectHighlighter()` 方法
   - 添加調試日誌

### 需要更新的文檔
- 所有之前的測試指南需要更新
- README 需要說明自動恢復功能

---

## 🎯 成功指標

修復成功的標準：

✅ 訪問頁面時腳本自動加載  
✅ `window.collectHighlights` 始終可用  
✅ 創建標註後**刷新頁面標註不消失** ⭐️  
✅ 控制台有恢復標註的日誌  
✅ 保存到 Notion 時標註內容正確同步  
✅ 多個頁面的標註獨立保存和恢復  

---

**修復完成時間：** 2025年10月1日  
**修復版本：** v2.5.0-patch5  
**問題類型：** 腳本未自動加載，標註無法持久化  
**影響程度：** 🔴 CRITICAL - 核心功能失效  
**修復狀態：** ✅ 已完成  
**需要測試：** 🧪 等待用戶驗證
