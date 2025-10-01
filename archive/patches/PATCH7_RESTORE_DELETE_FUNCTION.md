# v2.5.2: 恢復刪除標註功能

## 🐛 問題描述

用戶報告：「標註狀態似乎沒問題了，但是原有的刪除標註的功能消失了。」

**原因分析**：
- 舊版本使用 DOM 修改方式（`<span>` 元素），可以綁定雙擊和 Ctrl+點擊事件來刪除
- 新版本使用 CSS Highlight API，不修改 DOM，所以沒有元素可以綁定事件
- 導致所有刪除功能失效

---

## ✅ 解決方案

實現了**兩種刪除方式**，讓用戶有更好的靈活性：

### 方案 1: Ctrl+點擊快速刪除（保持舊版體驗）

**使用方法**：
1. Ctrl+點擊（Mac: Cmd+點擊）已標註的文本
2. 彈出確認對話框
3. 確認後刪除標註

**技術實現**：
```javascript
// 全局點擊監聽器
document.addEventListener('click', clickHandler, true);

handleDocumentClick(event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    
    const highlightId = this.getHighlightAtPoint(event.clientX, event.clientY);
    if (highlightId) {
        // 檢測到點擊在標註上，顯示確認對話框
        if (confirm(`確定要刪除這個標註嗎？`)) {
            this.removeHighlight(highlightId);
        }
    }
}
```

**核心技術**：
- `document.caretRangeFromPoint(x, y)` - 從座標獲取 Range
- `range.isPointInRange(node, offset)` - 檢測點是否在範圍內
- `rangesOverlap()` - 檢測兩個 Range 是否重疊

---

### 方案 2: 標註列表管理（新功能）

**使用方法**：
1. 點擊工具欄的「📋 管理」按鈕
2. 展開標註列表，顯示所有標註
3. 點擊對應標註旁的 🗑️ 按鈕刪除

**列表顯示內容**：
```
1. 黃色標註
   這是標註的文本內容，最多顯示40字...  [🗑️]

2. 綠色標註
   另一個標註的文本內容...  [🗑️]
```

**優點**：
- 直觀清晰，可以一覽所有標註
- 不需要在頁面中定位標註位置
- 適合管理大量標註

---

## 🎨 UI 改進

### 工具欄新布局

```
┌────────────────────────────┐
│      📝 標註工具            │
├────────────────────────────┤
│ [開始標註]       [✕]       │
├────────────────────────────┤
│ [🔄 同步]  [📋 管理]       │
├────────────────────────────┤
│  標註列表（可展開/收起）     │
│  ┌──────────────────────┐  │
│  │ 1. 黃色標註  [🗑️]    │  │
│  │ 2. 綠色標註  [🗑️]    │  │
│  └──────────────────────┘  │
├────────────────────────────┤
│   已標註: 2 段              │
├────────────────────────────┤
│ 💡 Ctrl+點擊標註可快速刪除  │
└────────────────────────────┘
```

### 按鈕說明

| 按鈕 | 功能 | 顏色 |
|------|------|------|
| 開始標註 | 切換標註模式 | 綠色 |
| ✕ | 關閉工具欄 | 灰色 |
| 🔄 同步 | 同步標註到 Notion | 藍色 |
| 📋 管理 | 展開/收起標註列表 | 橙色 |
| 🗑️ | 刪除單個標註 | 紅色 |

---

## 🔧 技術實現細節

### 1. 點擊檢測邏輯

```javascript
getHighlightAtPoint(x, y) {
    // 從座標獲取 Range
    const range = document.caretRangeFromPoint(x, y);
    
    // 遍歷所有標註，檢查是否重疊
    for (const [id, highlight] of this.highlights.entries()) {
        if (this.rangesOverlap(range, highlight.range)) {
            return id;  // 找到匹配的標註
        }
    }
    return null;
}

rangesOverlap(range1, range2) {
    // 檢查 range2 的起點或終點是否在 range1 內
    if (range1.isPointInRange(range2.startContainer, range2.startOffset)) {
        return true;
    }
    if (range1.isPointInRange(range2.endContainer, range2.endOffset)) {
        return true;
    }
    // 檢查 range1 是否完全在 range2 內
    if (range2.isPointInRange(range1.startContainer, range1.startOffset)) {
        return true;
    }
    return false;
}
```

### 2. 全局監聽器管理

```javascript
// 添加監聽器
const clickHandler = (e) => manager.handleDocumentClick(e);
document.addEventListener('click', clickHandler, true);

// 清理監聽器（工具欄關閉時）
const originalHide = () => {
    toolbar.style.display = 'none';
    document.removeEventListener('click', clickHandler, true);
};
```

**重要**：使用 `capture: true` 確保在其他事件處理器之前捕獲點擊。

### 3. 動態列表生成

```javascript
function updateHighlightList() {
    const highlights = Array.from(manager.highlights.values());
    
    // 生成 HTML
    listDiv.innerHTML = highlights.map((h, index) => {
        const text = h.text.substring(0, 40) + '...';
        return `<div>...標註項 HTML...</div>`;
    }).join('');
    
    // 綁定刪除按鈕事件
    listDiv.querySelectorAll('.delete-highlight-btn-v2').forEach(btn => {
        btn.addEventListener('click', () => {
            manager.removeHighlight(id);
            updateHighlightCount();
            updateHighlightList();
        });
    });
}
```

---

## 🧪 測試步驟

### 測試 1: Ctrl+點擊刪除

```
1. 創建 3 個標註
2. Ctrl+點擊（Mac: Cmd+點擊）其中一個標註
3. 應該彈出確認對話框
4. 點擊「確定」
5. ✅ 標註應該消失，計數變為 2
```

### 測試 2: 列表管理刪除

```
1. 創建 3 個標註
2. 點擊「📋 管理」按鈕
3. ✅ 應該展開列表，顯示 3 個標註項
4. 點擊第 2 個標註的 🗑️ 按鈕
5. 點擊確認對話框
6. ✅ 列表應該更新，只剩 2 項
7. ✅ 計數顯示「已標註: 2 段」
8. ✅ 頁面上的標註也消失
```

### 測試 3: 刪除後同步

```
1. 創建 5 個標註
2. 刪除其中 2 個
3. 點擊「🔄 同步」
4. ✅ Notion 頁面應該只有 3 個標註塊
```

### 測試 4: 刪除後刷新

```
1. 創建 3 個標註
2. 刪除 1 個，剩餘 2 個
3. 刷新頁面（F5）
4. ✅ 應該只恢復 2 個標註
```

---

## 📝 修改文件

- ✅ `scripts/highlighter-v2.js` - 主要修改：
  - 添加 `getHighlightAtPoint()` 方法
  - 添加 `rangesOverlap()` 方法
  - 添加 `handleDocumentClick()` 方法
  - 修改工具欄 HTML，添加「管理」按鈕和列表容器
  - 添加 `updateHighlightList()` 函數
  - 添加全局點擊監聽器綁定和清理

- ✅ `manifest.json` - 版本更新至 v2.5.2

---

## 💡 用戶提示

工具欄底部新增提示文字：
```
💡 Ctrl+點擊標註可快速刪除
```

讓用戶知道可以使用快捷方式。

---

## 🎯 功能對比

### 舊版本（highlighter.js - DOM 修改）
- ✅ 雙擊標註刪除
- ✅ Ctrl+點擊標註刪除
- ❌ 無法跨複雜元素標註

### 新版本（highlighter-v2.js - CSS Highlight API）
- ✅ Ctrl+點擊標註刪除（保留）
- ✅ 標註列表管理刪除（新增）
- ✅ 可以跨複雜元素標註
- ✅ 不修改 DOM，更穩定

---

## ⚠️ 注意事項

1. **點擊檢測可能不精確**：
   - 對於非常接近的標註，可能難以精確選擇
   - 建議在這種情況下使用「列表管理」方式

2. **刪除操作不可撤銷**：
   - 刪除前會彈出確認對話框
   - 刪除後立即保存到 Storage
   - 如需恢復，只能重新創建標註

3. **監聽器性能**：
   - 全局點擊監聽器只在工具欄顯示時激活
   - 工具欄關閉時自動清理監聽器
   - 使用 `capture: true` 優先處理

---

## 🔄 版本信息

- **版本號**: v2.5.2
- **發布日期**: 2025-10-01
- **更新類型**: Feature Enhancement
- **優先級**: 高（恢復核心功能）

---

**狀態**: ✅ 已完成  
**測試狀態**: 待測試  
**用戶反饋**: 待收集
