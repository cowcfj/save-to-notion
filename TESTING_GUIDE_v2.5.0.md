# 📋 v2.5.0 完整測試指南

## 🎯 測試目標
驗證新版標註系統（CSS Highlight API + Toggle Mode）是否完全正常工作。

---

## ✅ 預備檢查清單

### 1. **環境要求**
- [ ] Chrome 版本 ≥ 105（支持 CSS Highlight API）
- [ ] 擴展已更新到 v2.5.0
- [ ] 已在 `chrome://extensions/` 重新加載擴展

### 2. **配置檢查**
- [ ] Notion API Key 已設置
- [ ] Database ID 已設置
- [ ] 可以在設置頁面看到 v2.5.0 版本號

### 3. **瀏覽器控制台準備**
```
打開開發者工具（F12）
切換到 Console 標籤
準備監控以下消息：
- ✅ 標註系統初始化成功
- ✅ 標註已創建: highlight-X
- ⚠️ 任何錯誤訊息
```

---

## 🧪 測試場景

### **場景 1：正常文本選擇（未開啟標註模式）**

**目的：** 驗證不影響正常文本操作

#### 步驟：
1. 訪問任意網頁（例如：https://en.wikipedia.org/wiki/Chrome_Extension）
2. **不要**點擊擴展圖標或開啟標註模式
3. 嘗試以下操作：
   - 用鼠標拖動選擇一段文字
   - 複製文字（Ctrl/Cmd+C）
   - 雙擊選擇單個詞
   - 三擊選擇整段

#### 預期結果：
- ✅ 文本選擇正常，不會被自動清除
- ✅ 複製功能正常工作
- ✅ **沒有黃色標註出現**
- ✅ 控制台沒有標註相關日誌

#### 失敗跡象：
- ❌ 選擇的文字立即消失
- ❌ 自動出現黃色標註
- ❌ 控制台出現標註系統日誌

---

### **場景 2：啟動標註模式**

**目的：** 驗證 Toggle Mode UI 和狀態切換

#### 步驟：
1. 點擊 Chrome 工具欄的擴展圖標
2. 在彈出窗口中觀察按鈕狀態
3. 點擊 "📝 Start Highlighting" 按鈕
4. 觀察頁面變化

#### 預期結果：
- ✅ 彈出窗口顯示 "Highlight mode activated!"
- ✅ 彈出窗口自動關閉（1秒後）
- ✅ 頁面左上角出現工具欄
- ✅ 工具欄包含：
  - "開始標註" 按鈕（綠色背景）
  - "關閉" 按鈕
- ✅ 鼠標光標變為十字準星（crosshair）
- ✅ 控制台輸出：
  ```
  ===== Notion Highlighter v2 Initialized =====
  ✅ CSS Highlight API 支持: true
  標註工具欄已創建
  ```

#### 失敗跡象：
- ❌ 彈出窗口報錯
- ❌ 頁面沒有工具欄出現
- ❌ 控制台有錯誤訊息
- ❌ 鼠標光標沒有變化

---

### **場景 3：單元素標註**

**目的：** 驗證基本標註功能

#### 步驟：
1. 確認標註模式已開啟（光標為十字準星）
2. 在**同一個段落內**選擇一段文字（20-50字）
3. 鬆開鼠標

#### 預期結果：
- ✅ 選擇的文字**立即變成黃色背景**
- ✅ **選擇保持可見**（藍色選擇 + 黃色標註疊加）
- ✅ 可以在標註後**立即複製文字**（Ctrl+C / Cmd+C）
- ✅ 控制台輸出：
  ```
  📍 選擇了文本: "你選擇的文字..."
  ✅ 標註已創建: highlight-1，黃色標記已應用
  ```
- ✅ 點擊其他地方時選擇自然消失
- ✅ 可以繼續選擇其他文字進行標註

#### 失敗跡象：
- ❌ 文字沒有變黃
- ❌ 需要選擇兩次才出現標註
- ❌ 控制台報錯
- ❌ 標註模式自動關閉

---

### **場景 4：跨元素標註（核心測試）**

**目的：** 驗證修復跨元素標註bug

#### 步驟：
1. 確認標註模式已開啟
2. 從一個段落的中間開始選擇
3. 跨越到下一個段落或列表項
4. 選擇範圍覆蓋多個 HTML 元素

#### 測試用例：

##### 用例 4.1：段落跨越
```html
<p>這是第一段的最後幾個字</p>
<p>這是第二段的開頭幾個字</p>
```
選擇：從"最後"到"開頭"

##### 用例 4.2：列表跨越
```html
<ul>
  <li>第一項內容</li>
  <li>第二項內容</li>
</ul>
```
選擇：從"第一項"到"第二項"

##### 用例 4.3：混合元素
```html
<p>段落文字</p>
<ul><li>列表項</li></ul>
<p>另一個段落</p>
```
選擇：從段落到列表再到段落

#### 預期結果：
- ✅ **所有選擇的文字都變成黃色**
- ✅ 標註連續完整，沒有中斷
- ✅ 控制台輸出成功消息
- ✅ 沒有錯誤或警告

#### 失敗跡象（v2.4.x 的問題）：
- ❌ 第一次選擇沒有標註出現
- ❌ 需要選兩次才顯示
- ❌ Notion 頁面出現重複內容
- ❌ 控制台報錯："Failed to execute 'surroundContents'"

---

### **場景 5：複雜選擇測試**

**目的：** 壓力測試新系統

#### 測試用例：
1. **超長選擇**：選擇 5-10 個段落
2. **嵌套元素**：選擇包含粗體、斜體、鏈接的文字
3. **特殊字符**：選擇包含 emoji、中文、特殊符號的文字
4. **表格內容**：選擇表格單元格內的文字

#### 預期結果：
- ✅ 所有情況都能正確標註
- ✅ 黃色標註完整覆蓋
- ✅ 沒有崩潰或卡頓

---

### **場景 6：標註模式切換**

**目的：** 驗證 Toggle 功能

#### 步驟：
1. 標註模式開啟時，點擊工具欄的 "開始標註" 按鈕
2. 觀察狀態變化
3. 再次點擊按鈕

#### 預期結果：
- ✅ 第一次點擊：
  - 按鈕變為灰色
  - 文字變為 "開始標註"
  - 光標恢復正常
- ✅ 再次點擊：
  - 按鈕變為綠色
  - 文字變為 "標註中..."
  - 光標變為十字準星
- ✅ 關閉狀態下選擇文字不會標註
- ✅ 開啟狀態下選擇文字會標註

---

### **場景 7：清除標註**

**目的：** 驗證清除功能

#### 步驟：
1. 創建 3-5 個標註
2. 點擊工具欄的 "關閉" 按鈕
3. 觀察頁面變化

#### 預期結果：
- ✅ 所有黃色標註消失
- ✅ 工具欄消失
- ✅ 控制台輸出：
  ```
  🗑️ 清除了 X 個標註
  ```

---

### **場景 8：頁面刷新和持久化**

**目的：** 驗證標註保存

#### 步驟：
1. 創建 2-3 個標註
2. 刷新頁面（F5）
3. 觀察標註恢復

#### 預期結果：
- ✅ 刷新後標註重新出現
- ✅ 位置完全正確
- ✅ 控制台輸出：
  ```
  📦 從存儲恢復了 X 個標註
  ```

---

### **場景 9：舊標註遷移**

**目的：** 驗證無痛遷移功能

#### 前提：
需要有使用舊版（v2.4.x）創建的標註

#### 步驟：
1. 訪問之前標註過的頁面
2. 觀察控制台和頁面

#### 預期結果：
- ✅ 舊標註自動轉換為新標註
- ✅ 控制台輸出：
  ```
  🔄 開始自動遷移...
  ✅ Phase 1: 創建新標註系統
  ⏳ Phase 2: 等待驗證...
  ✅ Phase 3: 完成遷移
  ```
- ✅ 舊的 DOM 元素被移除
- ✅ 新的 CSS 標註正常顯示

---

### **場景 10：保存到 Notion**

**目的：** 驗證完整工作流

#### 步驟：
1. 訪問新頁面
2. 創建 3-5 個標註（包括跨元素）
3. 點擊擴展圖標
4. 點擊 "💾 Save Page" 按鈕
5. 前往 Notion 檢查

#### 預期結果：
- ✅ 保存成功
- ✅ Notion 頁面包含標註文字
- ✅ 標註文字用 **粗體** 標記
- ✅ 標註內容完整，沒有重複
- ✅ 跨元素標註正確保存

---

## 🔧 故障排除

### 問題 1：控制台報錯 "CSS.highlights is not defined"

**原因：** 瀏覽器版本太舊

**解決：**
```javascript
// 檢查瀏覽器版本
console.log(navigator.userAgent);

// 檢查 API 支持
console.log('CSS Highlight API:', typeof CSS !== 'undefined' && 'highlights' in CSS);
```

**要求：** Chrome ≥ 105, Edge ≥ 105, Safari ≥ 17.2

---

### 問題 2：工具欄沒有出現

**可能原因：**
1. 腳本注入失敗
2. 頁面 CSP 限制
3. 與其他擴展衝突

**檢查：**
```javascript
// 在控制台執行
console.log('Highlighter loaded:', typeof window.initHighlighter);
console.log('Manager instance:', window.notionHighlighter);
```

**解決：**
- 重新加載擴展
- 檢查頁面 Content Security Policy
- 暫時禁用其他擴展

---

### 問題 3：標註不顯示但控制台顯示成功

**可能原因：** CSS 樣式被覆蓋

**檢查：**
```javascript
// 檢查 highlight 數量
console.log('Highlights count:', CSS.highlights.size);

// 檢查特定 highlight
const h = CSS.highlights.get('notion-highlight-1');
console.log('Highlight 1:', h ? h.size : 'not found');
```

**解決：**
- 檢查頁面是否有 `::highlight` 樣式覆蓋
- 嘗試在不同網站測試

---

### 問題 4：跨元素標註失敗

**這是關鍵問題！** 如果仍然失敗：

**檢查：**
```javascript
// 手動測試
const range = window.getSelection().getRangeAt(0);
console.log('Range:', {
    startContainer: range.startContainer,
    endContainer: range.endContainer,
    commonAncestor: range.commonAncestorContainer,
    collapsed: range.collapsed
});

// 測試創建 highlight
const highlight = new Highlight(range);
CSS.highlights.set('test-highlight', highlight);
```

**報告：**
- 提供失敗的網頁 URL
- 提供選擇的具體內容
- 提供完整的控制台錯誤

---

## 📊 測試結果記錄表

| 場景 | 通過 | 失敗 | 備註 |
|------|------|------|------|
| 1. 正常文本選擇 | ⬜ | ⬜ | |
| 2. 啟動標註模式 | ⬜ | ⬜ | |
| 3. 單元素標註 | ⬜ | ⬜ | |
| 4. 跨元素標註 | ⬜ | ⬜ | **核心測試** |
| 5. 複雜選擇 | ⬜ | ⬜ | |
| 6. 模式切換 | ⬜ | ⬜ | |
| 7. 清除標註 | ⬜ | ⬜ | |
| 8. 頁面刷新 | ⬜ | ⬜ | |
| 9. 舊標註遷移 | ⬜ | ⬜ | |
| 10. 保存到 Notion | ⬜ | ⬜ | **完整流程** |

---

## 🎯 核心驗證點

### ✅ 必須通過的測試：
1. **場景 1**：不影響正常文本操作
2. **場景 4**：跨元素標註成功（這是主要修復目標）
3. **場景 10**：保存到 Notion 時標註內容不重複

### ⚠️ 如果任何核心測試失敗：
1. 記錄詳細錯誤信息
2. 提供控制台完整日誌
3. 截圖失敗的具體步驟
4. 提供測試的網頁 URL

---

## 📝 測試報告模板

```markdown
## v2.5.0 測試報告

**測試日期：** YYYY-MM-DD
**測試環境：** 
- Chrome 版本: 
- 操作系統: 
- 擴展版本: 

**測試結果概覽：**
- 通過: X/10
- 失敗: X/10

**詳細結果：**

### 場景 1: 正常文本選擇
- 結果: ✅/❌
- 備註: 

### 場景 4: 跨元素標註（核心）
- 結果: ✅/❌
- 測試頁面: 
- 備註: 

### 場景 10: 保存到 Notion（完整流程）
- 結果: ✅/❌
- Notion 頁面: 
- 備註: 

**問題和建議：**
1. 
2. 

**控制台日誌：**
```
（粘貼相關日誌）
```

**總體評價：** ⭐️⭐️⭐️⭐️⭐️
```

---

## 🚀 快速測試腳本

在控制台運行以下代碼快速驗證系統狀態：

```javascript
// === 快速診斷腳本 ===
console.log('=== Notion Highlighter v2.5.0 診斷 ===');

// 1. 檢查 API 支持
const apiSupported = typeof CSS !== 'undefined' && 'highlights' in CSS;
console.log('1. CSS Highlight API:', apiSupported ? '✅ 支持' : '❌ 不支持');

// 2. 檢查腳本加載
const scriptsLoaded = {
    utils: typeof window.normalizeUrl === 'function',
    migration: typeof window.SeamlessMigration !== 'undefined',
    highlighter: typeof window.initHighlighter === 'function'
};
console.log('2. 腳本加載狀態:', scriptsLoaded);

// 3. 檢查實例
const instanceExists = typeof window.notionHighlighter !== 'undefined';
console.log('3. 標註管理器:', instanceExists ? '✅ 已初始化' : '❌ 未初始化');

// 4. 檢查當前標註數量
if (apiSupported) {
    console.log('4. 當前標註數量:', CSS.highlights.size);
}

// 5. 檢查舊標註
const oldHighlights = document.querySelectorAll('.simple-highlight').length;
console.log('5. 舊標註元素:', oldHighlights);

// 總結
const allGood = apiSupported && scriptsLoaded.highlighter && instanceExists;
console.log('\n總體狀態:', allGood ? '✅ 一切正常' : '⚠️ 存在問題');
```

---

**最後更新：** 2025-01-XX
**文檔版本：** v1.0
**對應項目版本：** v2.5.0
