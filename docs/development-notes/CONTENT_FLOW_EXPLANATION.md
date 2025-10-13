# 內容提取與轉換流程詳解

## 📊 完整流程圖

```
開始
  ↓
[頁面類型檢測]
  ↓
  ├─→ Markdown 網站？
  │     ↓ YES
  │   [三層 Markdown 提取策略]
  │     ├─→ 1. 嘗試獲取原始 .md 文件（GitHub Pages）
  │     │     ↓ 失敗（通常 404）
  │     ├─→ 2. 檢測頁面內嵌 Markdown 源
  │     │     ↓ 很少見
  │     └─→ 3. 保留完整 HTML 結構
  │           ↓
  │   [Emergency Extraction]
  │     → 提取 HTML（保留列表、代碼塊等結構）
  │     ↓
  │   [Turndown 轉換]
  │     → HTML → Markdown（標準化格式）
  │     ↓
  │
  └─→ 一般網頁？
        ↓ YES
      [智能混合模式提取]
        → Readability.js / @extractus/article-extractor
        → 簡化後的 HTML
        ↓
      [Turndown 轉換]
        → HTML → Markdown
        ↓

[共同路徑]
  ↓
[Markdown → Notion Blocks 解析]
  → parseRichText()：處理粗體、斜體、連結、代碼
  → convertMarkdownToNotionBlocks()：構建 blocks 結構
  ↓
[Notion API]
  → 保存到 Notion
  ↓
完成
```

## 🔧 Turndown 的作用

### 為什麼需要 Turndown？

**簡單回答**：Turndown 是 **HTML → Markdown** 的轉換器，是整個流程的關鍵橋樑。

### 詳細說明

#### 1️⃣ **問題背景**
- **輸入**：無論是 Markdown 網站還是一般網頁，我們最終都得到的是 **HTML**
  - Markdown 網站：渲染後的 HTML（如 `<ul>`, `<li>`, `<pre><code>`）
  - 一般網頁：簡化提取後的 HTML
- **目標**：轉換為 Notion Blocks（JSON 格式）
- **挑戰**：HTML 結構複雜多變，直接解析困難

#### 2️⃣ **Turndown 的價值**

**核心作用**：
```
複雜的 HTML → 標準化的 Markdown → 結構化的 Notion Blocks
```

**具體例子**：

```html
<!-- 輸入：HTML（各種可能的寫法） -->
<ul class="list">
  <li><strong>項目 1</strong></li>
  <li>
    <span>項目 2</span>
    <ul>
      <li>子項目 2.1</li>
    </ul>
  </li>
</ul>
```

↓ **Turndown 轉換**

```markdown
<!-- 輸出：標準化的 Markdown -->
- **項目 1**
- 項目 2
  - 子項目 2.1
```

↓ **我們的解析器**

```javascript
// 輸出：Notion Blocks
[
  {
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ type: 'text', text: { content: '項目 1' }, annotations: { bold: true } }]
    }
  },
  {
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ type: 'text', text: { content: '項目 2' } }],
      children: [
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: '子項目 2.1' } }]
          }
        }
      ]
    }
  }
]
```

#### 3️⃣ **如果沒有 Turndown 會怎樣？**

**方案 A：直接從 HTML 解析**
```javascript
// ❌ 需要處理各種 HTML 結構變化
function parseHTML(html) {
  // 需要處理：
  - <ul>, <ol> 的各種嵌套組合
  - <strong>, <b> 都表示粗體
  - <em>, <i> 都表示斜體
  - <code>, <pre><code> 的不同情況
  - 各種自定義 class 和 style
  - ... 無窮無盡的變化
}
```

**方案 B：使用 Turndown（當前方案）**
```javascript
// ✅ 只需處理標準 Markdown 格式
function parseMarkdown(markdown) {
  // 只需處理：
  - "- " 或 "* " 開頭 = 無序列表
  - "1. " 開頭 = 有序列表
  - "**text**" = 粗體
  - "*text*" = 斜體
  - "`code`" = 行內代碼
  - 標準化、可預測
}
```

### 是否有存在的必要？

**答案：絕對必要！** ✅

理由：
1. **標準化**：將千變萬化的 HTML 統一為標準 Markdown
2. **維護性**：只需維護 Markdown → Notion 的解析器
3. **可靠性**：Turndown 是成熟的開源庫，經過充分測試
4. **擴展性**：未來支援新格式只需調整 Markdown 解析器

## 📋 實際流程示例

### Gemini CLI 文檔網站的處理流程

```
https://google-gemini.github.io/gemini-cli/docs/cli/commands.html
  ↓
[1] 檢測：是 Markdown 網站（.github.io）
  ↓
[2] Emergency Extraction
  → 選擇器：.markdown-body
  → 提取：30012 字符的 HTML（包含完整列表結構）
  ↓
[3] Turndown 轉換
  輸入：<ul><li>gemini<ul><li>init</li></ul></li></ul>
  輸出：
    - gemini
      - init
  ↓
[4] Markdown 解析
  → 檢測縮排層級（2 空格 = 1 層）
  → 使用堆疊構建嵌套結構
  → 生成 Notion blocks（包含 children）
  ↓
[5] 保存到 Notion
  → 樹形列表正確嵌套
  → 格式完整保留
```

## 🎯 兩種網頁的處理差異

### Markdown 網站（如 GitHub Pages）

```
特徵：
- URL 包含 .github.io 或 /docs/
- 有代碼塊、技術文檔特徵
- HTML 結構保留了 Markdown 的語義

處理：
1. Emergency extraction（保留完整結構）
2. Turndown（HTML → Markdown）
3. 自定義解析器（Markdown → Notion）

優勢：
- 格式保留更完整
- 列表嵌套正確
- 代碼塊語言標記保留
```

### 一般網頁（如新聞網站）

```
特徵：
- 複雜的廣告、導航
- 大量無關元素
- 需要內容提取

處理：
1. Readability/Extractus（簡化提取）
2. Turndown（HTML → Markdown）
3. 自定義解析器（Markdown → Notion）

優勢：
- 過濾廣告和無關內容
- 提取核心文章內容
- 保留基本格式
```

## 🔍 關鍵組件職責

| 組件 | 職責 | 輸入 | 輸出 |
|------|------|------|------|
| **Emergency Extraction** | 從技術文檔提取完整 HTML | 頁面 DOM | HTML 字符串 |
| **Readability.js** | 簡化一般網頁內容 | 頁面 DOM | 簡化的 HTML |
| **Turndown** | 標準化轉換 | HTML | Markdown |
| **parseRichText()** | 解析行內格式 | Markdown 文字 | Notion rich_text |
| **convertMarkdownToNotionBlocks()** | 構建 blocks 結構 | Markdown | Notion blocks 陣列 |

## 💡 總結

1. **所有路徑都經過 Turndown**
   - Markdown 網站：HTML（完整結構）→ Turndown → Markdown
   - 一般網頁：HTML（簡化後）→ Turndown → Markdown

2. **Turndown 是不可或缺的**
   - 統一了不同來源的 HTML
   - 簡化了後續處理邏輯
   - 提高了系統的可維護性

3. **兩種網頁的差異在於 HTML 來源**
   - Markdown 網站：保留完整結構的 HTML
   - 一般網頁：簡化提取的 HTML
   - 但後續流程完全相同
