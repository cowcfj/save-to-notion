# Release Notes - v2.6.0 🎯

**發布日期：** 2025年10月2日  
**版本類型：** 功能版本（Feature Release）  
**主要功能：** 網站 Icon 自動提取與顯示

---

## 🎯 核心功能

### 網站 Icon 自動提取

v2.6.0 新增了網站 favicon/logo 的自動提取功能，讓您的 Notion 數據庫更加美觀和易於識別。

**功能特點：**

- ✅ **自動提取**：保存網頁時自動擷取網站 Icon
- ✅ **智能選擇**：按優先級選擇最佳品質的 Icon
- ✅ **Notion 原生**：使用 Notion API 的 icon 屬性，完美顯示
- ✅ **無需配置**：自動化處理，無需用戶干預
- ✅ **靜默失敗**：Icon 提取失敗不影響頁面保存

---

## 📊 Icon 提取策略

v2.6.0 使用智能化的多層 Icon 提取策略：

### 優先級排序

1. **Apple Touch Icon** (最優)
   - 通常尺寸較大（180x180px 或更大）
   - 高清晰度，適合顯示
   - 選擇器：`<link rel="apple-touch-icon">`

2. **標準 Favicon**
   - 常見的網站圖標
   - 選擇器：`<link rel="icon">`

3. **Shortcut Icon**
   - 傳統 favicon 格式
   - 選擇器：`<link rel="shortcut icon">`

4. **默認 Favicon** (回退)
   - 網站根目錄的 /favicon.ico
   - 所有網站的標準位置

### 提取流程

```
開始提取
    ↓
嘗試 Apple Touch Icon
    ↓ (未找到)
嘗試標準 Favicon
    ↓ (未找到)
嘗試 Shortcut Icon
    ↓ (未找到)
回退到 /favicon.ico
    ↓
返回結果（或 null）
```

---

## 🎨 視覺效果對比

### 修改前（v2.5.7）

```
Notion 數據庫
├─ 📄 Article Title 1
├─ 📄 Article Title 2
└─ 📄 Article Title 3
```

### 修改後（v2.6.0）

```
Notion 數據庫
├─ 🌐 Article Title 1  (網站 logo)
├─ 📰 Article Title 2  (新聞網站 logo)
└─ 📝 Article Title 3  (博客 logo)
```

**實際效果：**

- Notion 數據庫列表中，每個頁面標題前顯示網站 Icon
- 打開頁面時，標題旁邊顯示 Icon
- 快速識別內容來源
- 更美觀的視覺呈現

---

## 🔧 技術實現

### 新增函數

#### `collectSiteIcon()`

```javascript
function collectSiteIcon() {
  console.log('🎯 Attempting to collect site icon/favicon...');

  const iconSelectors = [
    { selector: 'link[rel="apple-touch-icon"]', attr: 'href', priority: 1 },
    { selector: 'link[rel="apple-touch-icon-precomposed"]', attr: 'href', priority: 2 },
    { selector: 'link[rel="icon"]', attr: 'href', priority: 3 },
    { selector: 'link[rel="shortcut icon"]', attr: 'href', priority: 4 },
  ];

  // 按優先級嘗試每個選擇器
  // 轉換為絕對 URL
  // 返回第一個有效的 Icon URL
}
```

**功能：**

- 按優先級搜索 Icon
- 自動轉換相對路徑為絕對 URL
- 回退到默認 favicon
- 完善的錯誤處理

### 修改函數

#### `saveToNotion()` 增強

```javascript
async function saveToNotion(
  title,
  blocks,
  pageUrl,
  apiKey,
  databaseId,
  sendResponse,
  siteIcon = null
) {
  const pageData = {
    parent: { database_id: databaseId },
    properties: {
      /* ... */
    },
    children: blocks.slice(0, 100),
  };

  // v2.6.0: 添加網站 Icon（如果有）
  if (siteIcon) {
    pageData.icon = {
      type: 'external',
      external: { url: siteIcon },
    };
    console.log('✓ Setting page icon:', siteIcon);
  }

  // 調用 Notion API...
}
```

**改進：**

- 新增 `siteIcon` 參數（可選）
- 使用 Notion API 的 `icon` 屬性
- `external` 類型，支持外部 URL
- 詳細的日誌記錄

### 調試日誌

**成功提取 Icon：**

```
🎯 Attempting to collect site icon/favicon...
✓ Found site icon via link[rel="apple-touch-icon"]: https://example.com/icon.png
✓ Setting page icon: https://example.com/icon.png
```

**回退到默認 Favicon：**

```
🎯 Attempting to collect site icon/favicon...
✓ Falling back to default favicon: https://example.com/favicon.ico
```

**提取失敗（靜默處理）：**

```
🎯 Attempting to collect site icon/favicon...
✗ No site icon found
(頁面仍正常保存，只是沒有 Icon)
```

---

## 📋 測試驗證

### 測試網站

| 網站類型  | 測試 URL             | Icon 類型        | 結果    |
| --------- | -------------------- | ---------------- | ------- |
| WordPress | faroutmagazine.co.uk | Apple Touch Icon | ✅ 通過 |
| Medium    | medium.com           | Apple Touch Icon | ✅ 通過 |
| BBC News  | bbc.com/news         | Standard Favicon | ✅ 通過 |
| GitHub    | github.com           | SVG Favicon      | ✅ 通過 |
| 簡單網站  | -                    | /favicon.ico     | ✅ 通過 |

### 測試場景

#### 場景 1：標準網站

- ✅ Icon 正確提取
- ✅ Notion 頁面顯示 Icon
- ✅ 數據庫列表顯示 Icon

#### 場景 2：無 Icon 網站

- ✅ 提取失敗靜默處理
- ✅ 頁面正常保存
- ✅ 無錯誤信息

#### 場景 3：相對路徑 Icon

- ✅ 自動轉換為絕對路徑
- ✅ Icon 正確顯示

#### 場景 4：多個 Icon 標籤

- ✅ 按優先級選擇最佳的
- ✅ Apple Touch Icon 優先

---

## 🚀 使用指南

### 自動化使用

v2.6.0 的 Icon 功能是**完全自動的**，無需任何設置：

1. **正常保存網頁**
   - 點擊「保存到 Notion」按鈕
   - 擴展自動提取網站 Icon

2. **檢查結果**
   - 打開 Notion 數據庫
   - 查看頁面標題旁的 Icon

3. **查看日誌（可選）**
   - 按 F12 打開控制台
   - 查看 Icon 提取日誌

### 預期行為

**有 Icon 的網站：**

- Icon 自動顯示在 Notion 頁面標題旁
- 數據庫列表中也會顯示
- 快速識別內容來源

**無 Icon 的網站：**

- 頁面正常保存
- 標題旁沒有 Icon（與 v2.5.7 相同）
- 無錯誤提示

---

## 💡 用戶價值

### 視覺識別

- **快速識別來源**：一眼看出內容來自哪個網站
- **美觀的數據庫**：Icon 讓 Notion 數據庫更有吸引力
- **專業感**：類似瀏覽器書籤的視覺效果

### 組織效率

- **分類輔助**：通過 Icon 快速區分不同來源
- **視覺標記**：Icon 比文字更容易記憶
- **搜索輔助**：視覺線索幫助快速找到內容

### 自動化

- **零配置**：無需任何設置
- **零維護**：自動處理所有情況
- **零干擾**：失敗不影響正常功能

---

## 🔄 與其他功能的集成

### v2.5.6 封面圖

- **Icon**：顯示在頁面標題旁（小圖標）
- **封面圖**：顯示在頁面頂部（大圖片）
- **互補關係**：一個是網站標識，一個是文章內容

### v2.5.7 頭像過濾

- Icon 提取**不會**受頭像過濾影響
- Icon 和封面圖是獨立的提取流程
- 互不干擾

### 完整體驗

```
保存網頁到 Notion
    ↓
1. 提取網站 Icon → 顯示在標題旁
2. 提取封面圖 → 顯示在頁面頂部
3. 過濾作者頭像 → 避免誤識別
4. 提取文章內容 → 主要內容
5. 提取其他圖片 → 補充圖片
    ↓
完美的 Notion 頁面
```

---

## 🛠️ 技術細節

### Notion API 使用

**Page Object 結構：**

```json
{
  "parent": { "database_id": "..." },
  "icon": {
    "type": "external",
    "external": {
      "url": "https://example.com/icon.png"
    }
  },
  "properties": { ... },
  "children": [ ... ]
}
```

**Icon 類型：**

- `emoji`：表情符號（如 🌐）
- `external`：外部圖片 URL（我們使用這個）
- `file`：上傳的文件（暫不支持）

### URL 處理

**相對路徑轉換：**

```javascript
const iconUrl = element.getAttribute('href');
const absoluteUrl = new URL(iconUrl, document.baseURI).href;
```

**示例：**

- 輸入：`/images/icon.png`
- 網站：`https://example.com/article/page.html`
- 輸出：`https://example.com/images/icon.png`

### 錯誤處理

**層級回退機制：**

1. 嘗試 Apple Touch Icon → 失敗
2. 嘗試標準 Favicon → 失敗
3. 嘗試 Shortcut Icon → 失敗
4. 回退到 /favicon.ico → 失敗
5. 返回 null，頁面正常保存

**異常處理：**

```javascript
try {
  const absoluteUrl = new URL(iconUrl, document.baseURI).href;
  return absoluteUrl;
} catch (e) {
  console.warn('Failed to process icon URL:', iconUrl, e);
  // 繼續嘗試下一個選擇器
}
```

---

## 📈 性能影響

### 額外開銷

- **提取時間**：< 10ms（可忽略）
- **API 調用**：無額外調用（在現有創建頁面請求中）
- **網絡請求**：0（只提取 URL，不下載圖片）

### 優化策略

- **按需提取**：只在保存頁面時提取
- **單次提取**：每次保存只提取一次
- **緩存友好**：Notion 自己會緩存 Icon

---

## 🔮 未來計劃

### v2.6.1 可能的增強（根據反饋）

- 🎯 用戶設置：啟用/禁用 Icon 功能
- 🎯 Icon 類型選擇：優先使用特定類型
- 🎯 自定義回退：設置默認 Icon

### 長期計劃

- 🎯 Icon 緩存機制
- 🎯 高清 Icon 優先
- 🎯 SVG Icon 支持優化

---

## 📝 版本信息

- **版本號：** v2.6.0
- **發布日期：** 2025年10月2日
- **上一版本：** v2.5.7（作者頭像過濾）
- **下一版本計劃：** v2.6.1（根據用戶反饋）
- **Git Commit：** e740d49

---

## 🎉 總結

v2.6.0 為 Notion Smart Clipper 帶來了視覺上的重大升級：

✅ **自動化**：無需配置，自動提取和顯示  
✅ **智能化**：多層回退，確保最佳效果  
✅ **穩定性**：失敗不影響核心功能  
✅ **美觀度**：大幅提升 Notion 數據庫視覺效果

---

_v2.6.0 - 讓您的 Notion 數據庫更美觀、更專業！_ 🎯✨
