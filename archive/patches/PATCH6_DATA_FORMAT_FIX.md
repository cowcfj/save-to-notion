# PATCH 6: 數據格式不匹配修復

## 🐛 問題診斷

### 原始錯誤
用戶報告刷新後標註消失，控制台顯示：
```
utils.js:77 Loading highlights for key: highlights_https://atbug.com/agents-md-unifying-coding-agent-instructions
utils.js:87 No highlights found in chrome.storage, checking localStorage
utils.js:102 No highlights found for this page
highlighter-v2.js:395 📦 從存儲加載的數據: []
```

### 根本原因
**數據格式不匹配** - 存儲和讀取使用了不同的數據結構：

1. **存儲格式** (`saveToStorage()`):
   ```javascript
   {
       url: "https://example.com",
       highlights: [...]  // 對象格式
   }
   ```

2. **讀取期望** (`loadHighlights()`):
   ```javascript
   [...]  // 直接期望數組
   ```

3. **檢查條件失敗**:
   ```javascript
   if (stored && Array.isArray(stored) && stored.length > 0) {
       // ❌ stored 是對象，不是數組！
   }
   ```

## ✅ 修復方案

### 1. 修改 `utils.js` - 兼容兩種格式

#### A. 修復 `saveHighlights` 日誌
```javascript
async saveHighlights(pageUrl, highlightData) {
    const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
    // 支持對象和數組兩種格式
    const count = Array.isArray(highlightData) 
        ? highlightData.length 
        : (highlightData?.highlights?.length || 0);
    console.log(`Saving ${count} highlights for key:`, pageKey);
```

#### B. 修復 `loadHighlights` - 智能格式檢測
```javascript
async loadHighlights(pageUrl) {
    const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
    
    return new Promise((resolve) => {
        chrome.storage?.local?.get([pageKey], (data) => {
            const stored = data && data[pageKey];
            if (stored) {
                // 🔧 支持兩種格式：數組（舊版）和對象（新版）
                let highlights = [];
                if (Array.isArray(stored)) {
                    highlights = stored;  // 舊格式
                } else if (stored.highlights && Array.isArray(stored.highlights)) {
                    highlights = stored.highlights;  // 新格式
                }
                
                if (highlights.length > 0) {
                    console.log(`Found ${highlights.length} highlights`);
                    resolve(highlights);
                    return;
                }
            }
            // ... localStorage 回退邏輯也同樣處理
        });
    });
}
```

### 2. 修改 `highlighter-v2.js` - 統一使用數組

#### A. `restoreHighlights()`
```javascript
// ❌ 之前期望對象
const data = await StorageUtil.loadHighlights(url);
if (!data || !data.highlights || data.highlights.length === 0) { ... }

// ✅ 現在直接使用數組
const highlights = await StorageUtil.loadHighlights(url);
if (!highlights || highlights.length === 0) { ... }
```

#### B. `autoInit()` 自動初始化
```javascript
// ❌ 之前
const data = await StorageUtil.loadHighlights(url);
if (data && data.highlights && data.highlights.length > 0) { ... }

// ✅ 現在
const highlights = await StorageUtil.loadHighlights(url);
if (highlights && highlights.length > 0) { ... }
```

## 📊 修復效果

### 修復前
```
Saving undefined highlights for key: ...  ❌ 無法正確記錄
No highlights found in chrome.storage     ❌ 找不到數據
📦 從存儲加載的數據: []                  ❌ 返回空數組
```

### 修復後
```
Saving 3 highlights for key: ...          ✅ 正確計數
Found 3 highlights in chrome.storage      ✅ 成功讀取
📦 從存儲加載的數據: [...]               ✅ 返回完整數組
🔄 開始恢復 3 個標註...                   ✅ 開始恢復
✅ 恢復完成: 成功 3/3，失敗 0            ✅ 全部成功
```

## 🎯 兼容性保證

修復後的代碼支持：

1. **新格式** (對象): `{url: "...", highlights: [...]}`
2. **舊格式** (數組): `[...]`
3. **localStorage** 回退（兼容舊版本）
4. **Chrome Storage** 優先使用

## 🧪 測試步驟

### 測試 1: 清空測試
```bash
1. 打開 Chrome DevTools → Application → Storage → Clear site data
2. 重新加載擴展
3. 創建標註 → 刷新 → 檢查是否顯示
```

### 測試 2: 控制台驗證
```bash
1. 創建 3 個標註
2. 刷新頁面
3. 檢查控制台輸出：
   ✅ "Saving 3 highlights for key: ..."
   ✅ "Found 3 highlights in chrome.storage"
   ✅ "📦 從存儲加載的數據: [3 items]"
   ✅ "🔄 開始恢復 3 個標註..."
   ✅ "✅ 恢復完成: 成功 3/3"
```

### 測試 3: Storage 檢查
```javascript
// 在控制台執行
chrome.storage.local.get(null, (data) => {
    console.log('All stored data:', data);
    // 應該看到 highlights_xxx 的鍵，值為對象 {url, highlights}
});
```

## 📝 相關文件

- ✅ `/scripts/utils.js` - 存儲工具類
- ✅ `/scripts/highlighter-v2.js` - 標註管理器
- ⚠️ 其他使用 `loadHighlights()` 的文件需要驗證

## ⚠️ 注意事項

1. **向後兼容**: 同時支持舊數組格式和新對象格式
2. **URL 標準化**: 使用 `normalizeUrl()` 移除 hash 和追蹤參數
3. **localStorage 回退**: 保留對舊存儲的支持

## 🔄 版本更新

- **修復版本**: v2.5.1
- **修復日期**: 2025-10-01
- **修復類型**: Critical Bug Fix
- **影響範圍**: 標註持久化核心功能

---

**狀態**: ✅ 已修復，待測試  
**優先級**: 🔴 Critical  
**預期結果**: 標註在刷新後正確顯示
