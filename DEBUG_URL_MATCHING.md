# URL 匹配診斷指南

## 🔍 問題描述

用戶報告：
- 在 `https://atbug.com/agents-md-unifying-coding-agent-instructions/#如何使用` 創建標註
- 刷新後標註存在（✅ 保存和恢復成功）
- 但訪問 `https://atbug.com/agents-md-unifying-coding-agent-instructions`（無 hash）時標註不存在

**預期行為**：這兩個 URL 應該視為同一頁面，共享標註數據。

---

## 🛠️ URL 標準化邏輯

`normalizeUrl()` 函數會：
1. ✅ 移除 hash (#錨點)
2. ✅ 移除追蹤參數 (utm_*, gclid, fbclid 等)
3. ✅ 標準化尾部斜杠（非根路徑移除 `/`）

### 示例
```javascript
normalizeUrl('https://example.com/page/#section')
// → 'https://example.com/page'

normalizeUrl('https://example.com/page/?utm_source=twitter')
// → 'https://example.com/page'

normalizeUrl('https://example.com/page/')
// → 'https://example.com/page'

normalizeUrl('https://example.com/')
// → 'https://example.com/' (根路徑保留斜杠)
```

---

## 🔧 診斷步驟

### 步驟 1: 查看當前頁面的標準化 URL

在控制台執行：
```javascript
// 查看當前頁面 URL
console.log('當前 URL:', window.location.href);

// 查看標準化後的 URL
console.log('標準化 URL:', normalizeUrl(window.location.href));

// 查看存儲鍵
console.log('存儲鍵:', 'highlights_' + normalizeUrl(window.location.href));
```

### 步驟 2: 列出所有已存儲的標註

在控制台執行：
```javascript
// 查看所有標註鍵
await StorageUtil.debugListAllKeys();
```

**輸出示例**：
```
📋 所有標註鍵 (2 個):
   3 個標註: https://atbug.com/agents-md-unifying-coding-agent-instructions
   5 個標註: https://example.com/another-page
```

### 步驟 3: 手動查看存儲數據

在控制台執行：
```javascript
// 查看完整存儲數據
chrome.storage.local.get(null, (data) => {
    console.log('所有存儲數據:', data);
});
```

### 步驟 4: 對比兩個 URL 的標準化結果

```javascript
const url1 = 'https://atbug.com/agents-md-unifying-coding-agent-instructions/#如何使用';
const url2 = 'https://atbug.com/agents-md-unifying-coding-agent-instructions';

console.log('URL1 標準化:', normalizeUrl(url1));
console.log('URL2 標準化:', normalizeUrl(url2));
console.log('是否相同:', normalizeUrl(url1) === normalizeUrl(url2));
```

---

## 📊 新增調試日誌（v2.5.1）

重新加載擴展後，你會看到詳細的調試日誌：

### 保存標註時
```
💾 [saveToStorage] 當前頁面 URL: https://atbug.com/.../#如何使用
🔧 [normalizeUrl] 原始 URL: https://atbug.com/.../#如何使用
   移除 hash: #如何使用
✅ [normalizeUrl] 標準化後: https://atbug.com/...
💾 [saveHighlights] 開始保存標註
   原始 URL: https://atbug.com/.../#如何使用
   保存 3 個標註到鍵: highlights_https://atbug.com/...
```

### 讀取標註時
```
🔍 [restoreHighlights] 當前頁面 URL: https://atbug.com/...
   pathname: /agents-md-unifying-coding-agent-instructions
   hash: (無)
   search: (無)
🔧 [normalizeUrl] 原始 URL: https://atbug.com/...
✅ [normalizeUrl] 標準化後: https://atbug.com/...
📖 [loadHighlights] 開始讀取標註
   原始 URL: https://atbug.com/...
   讀取鍵: highlights_https://atbug.com/...
```

**關鍵點**：檢查 "標準化後" 的 URL 是否完全一致！

---

## 🐛 可能的問題和解決方案

### 問題 1: 尾部斜杠不一致

**症狀**：
- 保存時：`highlights_https://example.com/page/`
- 讀取時：`highlights_https://example.com/page`

**解決方案**：已修復！`normalizeUrl()` 會移除非根路徑的尾部斜杠。

---

### 問題 2: 瀏覽器自動重定向

**症狀**：
訪問 `https://example.com/page` 時，瀏覽器自動重定向到 `https://example.com/page/`

**診斷**：
```javascript
// 在頁面加載時檢查
console.log('初始 URL:', document.location.href);
setTimeout(() => {
    console.log('1秒後 URL:', document.location.href);
}, 1000);
```

**解決方案**：`normalizeUrl()` 會處理這個問題。

---

### 問題 3: SPA 動態修改 URL

**症狀**：
單頁應用 (SPA) 使用 `history.pushState()` 動態修改 URL

**診斷**：
檢查日誌中的 "當前頁面 URL" 是否符合預期

**解決方案**：
如果 SPA 頻繁修改 URL，考慮監聽 `popstate` 事件重新恢復標註。

---

### 問題 4: 查詢參數不同

**症狀**：
- `https://example.com/page?foo=bar`
- `https://example.com/page?bar=baz`

被視為不同頁面

**解決方案**：
如果這些應該視為同一頁面，需要在 `normalizeUrl()` 中移除特定查詢參數。

**自定義修改**：
```javascript
// 在 normalizeUrl() 中添加
const ignoredParams = ['foo', 'bar', 'session_id'];
ignoredParams.forEach(p => u.searchParams.delete(p));
```

---

## 🧪 測試場景

### 場景 1: Hash 變化
```
1. 訪問 https://example.com/page
2. 創建標註
3. 點擊頁面內錨點，URL 變為 https://example.com/page#section
4. 刷新
5. ✅ 標註應該顯示
```

### 場景 2: 直接訪問帶 Hash 的 URL
```
1. 直接訪問 https://example.com/page#section
2. 創建標註
3. 訪問 https://example.com/page（無 hash）
4. ✅ 標註應該顯示
```

### 場景 3: 尾部斜杠
```
1. 訪問 https://example.com/page/
2. 創建標註
3. 訪問 https://example.com/page（無斜杠）
4. ✅ 標註應該顯示
```

---

## 📝 報告問題時請提供

如果標註仍然不匹配，請提供：

1. **控制台完整日誌**（包含 [normalizeUrl] 的日誌）
2. **兩個 URL**：
   - 創建標註時的 URL
   - 訪問時找不到標註的 URL
3. **存儲鍵列表**：執行 `StorageUtil.debugListAllKeys()` 的輸出
4. **瀏覽器信息**：Chrome 版本、操作系統

---

## 🔧 臨時解決方案

如果診斷後發現是 URL 不匹配問題，可以手動遷移數據：

```javascript
// 1. 讀取舊鍵的數據
const oldKey = 'highlights_https://example.com/page/';
const newKey = 'highlights_https://example.com/page';

chrome.storage.local.get([oldKey], (data) => {
    if (data[oldKey]) {
        // 2. 寫入新鍵
        chrome.storage.local.set({ [newKey]: data[oldKey] }, () => {
            console.log('✅ 已遷移標註數據');
            
            // 3. 刪除舊鍵（可選）
            chrome.storage.local.remove([oldKey], () => {
                console.log('✅ 已清理舊鍵');
            });
        });
    }
});
```

---

**更新日期**：2025-10-01  
**版本**：v2.5.1  
**狀態**：增強調試功能，等待用戶反饋
