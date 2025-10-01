# 🔧 v2.5.0 緊急修復報告 #2

## 🚨 新問題：無法選中文字

**報告時間：** 2025年10月1日  
**嚴重程度：** 🔴 阻塞性 (Critical)

### 問題描述
用戶反饋：「現在根本無法選中文字」

### 根本原因
```javascript
// 錯誤的實現：每次 mouseup 都立即標註並清除選擇
document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
        const selection = window.getSelection();
        if (!selection.isCollapsed) {
            manager.addHighlight(range);     // 立即標註
            selection.removeAllRanges();      // 立即清除 ❌
        }
    }, 10);
});

// 結果：用戶無法選中任何文字進行複製、拖拽等操作
```

### 正確的設計
舊版使用 **標註模式切換**：
1. 用戶點擊「開始標記」按鈕 → 進入標註模式
2. 在標註模式下選擇文字 → 自動標註
3. 點擊按鈕停止 → 退出標註模式
4. 正常情況下可以自由選擇文字

---

## ✅ 實施的修復

### 1. 添加標註模式狀態
```javascript
let isActive = false;  // 標註模式開關

function toggleHighlightMode() {
    isActive = !isActive;
    
    if (isActive) {
        // 進入標註模式
        btn.textContent = '標註中...';
        btn.style.background = '#48bb78';
        document.body.style.cursor = 'crosshair';
    } else {
        // 退出標註模式
        btn.textContent = '開始標註';
        btn.style.background = 'white';
        document.body.style.cursor = '';
    }
}
```

### 2. 只在標註模式下處理選擇
```javascript
document.addEventListener('mouseup', (e) => {
    // 🔑 關鍵修復：檢查標註模式是否啟動
    if (!isActive || e.target.closest('#notion-highlighter-v2')) {
        return;  // 標註模式未啟動，不處理
    }
    
    // 只在標註模式下才標註並清除選擇
    setTimeout(() => {
        const selection = window.getSelection();
        if (!selection.isCollapsed) {
            manager.addHighlight(range);
            selection.removeAllRanges();
        }
    }, 10);
});
```

### 3. 創建簡單工具欄
```javascript
function createSimpleToolbar(manager) {
    const toolbar = document.createElement('div');
    toolbar.innerHTML = `
        <div>📝 標註工具</div>
        <button id="toggle-highlight-v2">開始標註</button>
        <button id="close-highlight-v2">關閉</button>
        <div>點擊「開始標註」後選擇文字</div>
    `;
    return toolbar;
}
```

---

## 🎯 用戶操作流程

### 正常文字選擇（不標註）
```
1. 直接選擇文字
2. ✅ 可以正常選中
3. ✅ 可以複製、拖拽等
4. ✅ 不會自動標註
```

### 標註文字
```
1. 點擊擴展圖標打開標註工具
2. 點擊「開始標註」按鈕
3. 游標變成十字 ✚
4. 選擇要標註的文字
5. ✅ 自動創建黃色標註
6. 選擇被自動清除
7. 繼續選擇其他文字標註
8. 完成後點擊按鈕停止標註
```

---

## 📊 修改對比

### 修復前（錯誤）
```javascript
function initHighlighter() {
    const manager = new HighlightManager();
    
    // ❌ 總是處理 mouseup，無法正常選擇文字
    document.addEventListener('mouseup', (e) => {
        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection.isCollapsed) {
                manager.addHighlight(range);
                selection.removeAllRanges();  // 立即清除！
            }
        }, 10);
    });
}
```

### 修復後（正確）
```javascript
function initHighlighter() {
    const manager = new HighlightManager();
    let isActive = false;  // ✅ 添加狀態控制
    
    const toolbar = createSimpleToolbar(manager);
    document.body.appendChild(toolbar);
    
    // ✅ 綁定切換按鈕
    toolbar.querySelector('#toggle-highlight-v2')
        .addEventListener('click', () => {
            isActive = !isActive;
            // 更新UI
        });
    
    // ✅ 只在標註模式下處理
    document.addEventListener('mouseup', (e) => {
        if (!isActive) return;  // 關鍵！
        
        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection.isCollapsed) {
                manager.addHighlight(range);
                selection.removeAllRanges();
            }
        }, 10);
    });
}
```

---

## 🧪 測試驗證

### 測試 1：正常文字選擇
```
1. 重新加載擴展
2. 訪問任意網頁
3. 嘗試選擇文字
4. ✅ 驗證：可以正常選中文字
5. ✅ 驗證：可以複製（Ctrl+C）
6. ✅ 驗證：不會自動標註
```

### 測試 2：標註功能
```
1. 點擊擴展圖標（右上角）
2. 看到「📝 標註工具」工具欄
3. 點擊「開始標註」按鈕
4. ✅ 驗證：按鈕變成「標註中...」綠色
5. ✅ 驗證：游標變成十字
6. 選擇文字
7. ✅ 驗證：自動創建黃色標註
8. 點擊按鈕停止
9. ✅ 驗證：回到正常模式
```

### 測試 3：跨元素標註
```
1. 開啟標註模式
2. 選擇跨兩個段落的文字
3. ✅ 驗證：標註成功（不失敗）
4. 選擇：普通文字 + <li> 列表
5. ✅ 驗證：標註成功
6. 控制台無錯誤
```

---

## 🔍 工具欄觸發方式

### 問題：如何打開標註工具？

**方案 A：點擊擴展圖標（popup）**
```javascript
// popup.js 中需要注入標註工具
chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    files: ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js']
}, () => {
    chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
            if (window.initHighlighter) {
                window.initHighlighter();  // 顯示工具欄
            }
        }
    });
});
```

**方案 B：右鍵選單（未實現）**
- 需要在 background.js 中註冊 contextMenu
- 選擇文字 → 右鍵 → 「標註文字」

**方案 C：快捷鍵（未實現）**
- 需要在 manifest.json 中添加 commands
- 按 Alt+H 開啟標註工具

### 當前狀態
- ✅ 方案 A 應該可用（通過 popup）
- ❌ 方案 B、C 未實現

---

## 📝 待確認事項

### 1. Popup 注入邏輯
檢查 `popup.js` 是否正確注入標註工具：

```javascript
// popup.js 中應該有類似代碼
document.getElementById('highlight-button').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 注入標註工具
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js']
    });
    
    // 初始化並顯示
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            if (window.initHighlighter) {
                window.initHighlighter();
            }
        }
    });
});
```

### 2. 右鍵選單支持
如果需要右鍵選單，需要在 `background.js` 中添加：

```javascript
// 創建右鍵選單
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'highlight-text',
        title: '標註文字',
        contexts: ['selection']
    });
});

// 處理點擊
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'highlight-text') {
        // 注入並啟動標註
        ScriptInjector.injectHighlighter(tab.id);
    }
});
```

---

## ✅ 修復完成清單

- [x] 添加標註模式狀態（isActive）
- [x] 創建工具欄UI
- [x] 綁定切換按鈕事件
- [x] 只在標註模式下處理選擇
- [x] 更新游標樣式
- [x] 添加關閉按鈕
- [ ] 確認 popup 注入邏輯
- [ ] 測試擴展圖標觸發
- [ ] 考慮添加右鍵選單支持

---

## 🎯 預期效果

### 正常情況
```
用戶訪問網頁
    ↓
可以自由選擇和複製文字 ✅
    ↓
不會自動標註
```

### 標註模式
```
點擊擴展圖標
    ↓
工具欄出現
    ↓
點擊「開始標註」
    ↓
游標變成十字 ✚
    ↓
選擇文字
    ↓
自動標註 ✅
    ↓
繼續選擇其他文字
    ↓
點擊停止
    ↓
回到正常模式
```

---

## 🚀 下一步行動

### 立即測試
1. **重新加載擴展**
   ```
   chrome://extensions/ → 刷新
   ```

2. **測試正常選擇**
   ```
   訪問網頁 → 選擇文字 → 驗證可以選中
   ```

3. **測試標註功能**
   ```
   點擊擴展圖標 → 點擊「開始標註」 → 選擇文字
   ```

### 如果擴展圖標無反應
檢查 `popup.html` 和 `popup.js`：
- 是否有標註按鈕？
- 按鈕是否正確注入腳本？
- 控制台是否有錯誤？

---

## 📞 問題排查

### 工具欄沒有出現？
```javascript
// 在控制台執行
if (window.initHighlighter) {
    window.initHighlighter();
}
// 應該顯示工具欄
```

### 仍然無法選中文字？
```javascript
// 檢查是否有其他腳本干擾
document.querySelectorAll('*').forEach(el => {
    const events = getEventListeners(el);
    if (events.mouseup) {
        console.log('mouseup listeners:', el, events.mouseup);
    }
});
```

### 標註模式無法切換？
```javascript
// 檢查工具欄是否存在
console.log(document.getElementById('notion-highlighter-v2'));

// 檢查按鈕
console.log(document.getElementById('toggle-highlight-v2'));
```

---

**修復完成時間：** 2025年10月1日  
**修復人員：** GitHub Copilot  
**狀態：** ✅ 代碼修復完成，需要測試驗證  
**關鍵改進：** 添加標註模式切換，用戶可以正常選擇文字了！
