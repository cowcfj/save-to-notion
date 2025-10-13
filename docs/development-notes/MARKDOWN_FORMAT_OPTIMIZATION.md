# 🎯 Markdown 網站格式優化報告

> 日期：2025-10-13
> 目標：優化 Markdown 網站（如 Gemini CLI 文檔）的格式保留
> 狀態：✅ 已優化

## 📋 問題分析

### 用戶反饋
- HK01 新聞：✅ 基本沒問題
- Gemini CLI 文檔：⚠️ 格式還原不完整（比之前好些，但仍需改進）

### 根本原因

當前流程對 Markdown 網站處理不夠智能：

```
Markdown 渲染的 HTML
    ↓
Emergency Extraction (提取 HTML)
    ↓
Turndown 轉換 (HTML → Markdown)
    ↓
Markdown → Notion Blocks
```

**問題**：經過了兩次轉換，格式損失較多。

## 💡 優化方案

### 策略層級

#### 1. **最優方案**：直接獲取原始 Markdown
```javascript
// 嘗試從 GitHub 獲取原始 .md 文件
const markdownUrl = guessMarkdownSourceUrl(pageUrl);
// 例：https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/commands.md
```

**優勢**：
- ✅ 100% 保留原始格式
- ✅ 跳過 HTML 渲染階段
- ✅ 最快最準確

**局限**：
- ❌ 只適用於 GitHub Pages
- ❌ 需要猜測正確的文件路徑
- ❌ 可能遇到跨域限制

#### 2. **次優方案**：頁面內嵌 Markdown
```javascript
// 檢查頁面中是否有嵌入的 Markdown 源碼
<script type="text/markdown">
  # Original Markdown Content
</script>
```

**優勢**：
- ✅ 格式完整
- ✅ 不需要額外請求

**局限**：
- ❌ 很少網站這樣做

#### 3. **實用方案**：保留完整 HTML 結構 ⭐

```javascript
// 檢測 Markdown 網站
const isMarkdownSite =
    url.includes('github.io') ||
    document.querySelector('.markdown-body');

if (isMarkdownSite) {
    // 優先選擇 .markdown-body 等選擇器
    // 返回完整的 HTML（包括所有 <ul>, <ol>, <code>, <pre> 等）
    // 不要簡化，讓 Turndown 處理
}
```

**優勢**：
- ✅ 通用性強，適用於所有 Markdown 網站
- ✅ 保留完整的 HTML 結構（列表、代碼塊等）
- ✅ Turndown 能準確轉換回 Markdown

**關鍵改進**：
- 📌 不再簡化 HTML
- 📌 優先選擇 `.markdown-body` 等特定選擇器
- 📌 為 Markdown 網站的列表和代碼塊增加權重

## 🔧 實施內容

### 1. Emergency Extraction 優化

**文件**：`scripts/background.js` - `extractEmergencyContent()` 函數

**新增邏輯**：
```javascript
// 檢測 Markdown 網站
const isMarkdownSite =
    window.location.href.includes('github.io') ||
    window.location.href.includes('.github.io') ||
    document.querySelector('.markdown-body, .markdown, [class*="markdown"]') !== null;

if (isMarkdownSite) {
    console.log('📋 Detected Markdown site - will preserve full structure');

    // 優先選擇器
    const markdownSelectors = [
        '.markdown-body',
        '.markdown',
        '.markdown-content',
        '[class*="markdown"]',
        '.docs-content'
    ];

    // 返回完整 HTML，不簡化
    return element.innerHTML;  // 保留所有 <ul>, <li>, <code>, <pre> 等
}
```

**評分權重調整**：
```javascript
// TreeWalker 評分時，為 Markdown 網站增加列表和代碼塊權重
if (isMarkdownSite) {
    score += headings * 50 + codeBlocks * 100 + lists * 150;  // 列表權重更高
} else {
    score += headings * 50 + codeBlocks * 30 + lists * 20;
}
```

### 2. 智能 Markdown URL 猜測

**文件**：`scripts/background.js` - `guessMarkdownSourceUrl()` 函數

**支持的模式**：
```javascript
// GitHub Pages
username.github.io/repo/path/page.html
    ↓
https://raw.githubusercontent.com/username/repo/main/path/page.md

// 示例
google-gemini.github.io/gemini-cli/docs/cli/commands.html
    ↓
https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/commands.md
```

**備用分支**：
- 先嘗試 `main` 分支
- 再嘗試 `master` 分支

### 3. 頁面內嵌 Markdown 檢測

**文件**：`scripts/background.js` - `extractEmbeddedMarkdown()` 函數

**檢測目標**：
```html
<!-- 方式1：Script tag -->
<script type="text/markdown">
# Original Content
</script>

<!-- 方式2：Textarea -->
<textarea class="markdown">
# Original Content
</textarea>

<!-- 方式3：Pre tag -->
<pre class="markdown">
# Original Content
</pre>

<!-- 方式4：Data attribute -->
<div data-markdown="...">
```

## 📊 轉換流程對比

### 舊流程（問題較多）
```
Markdown 渲染的 HTML
    ↓
提取簡化的 HTML（丟失部分結構）
    ↓
Turndown 轉換（嘗試還原）
    ↓
Markdown → Notion Blocks
    ↓
格式損失 ⚠️
```

### 新流程（優化後）

#### 流程 A：直接獲取原始 Markdown ⭐⭐⭐
```
GitHub Pages URL
    ↓
猜測原始 .md 文件 URL
    ↓
XMLHttpRequest 獲取
    ↓
Markdown → Notion Blocks
    ↓
完美格式 ✅
```

#### 流程 B：保留完整 HTML 結構 ⭐⭐
```
Markdown 渲染的 HTML
    ↓
檢測 Markdown 網站
    ↓
選擇 .markdown-body（完整 HTML）
    ↓
Turndown 轉換（高質量）
    ↓
Markdown → Notion Blocks
    ↓
良好格式 ✅
```

## 🧪 測試驗證

### 測試案例

#### 1. Gemini CLI 文檔
**URL**: https://google-gemini.github.io/gemini-cli/docs/cli/commands.html

**預期主控台輸出**：
```
📋 Technical documentation detected, using emergency extraction
📋 Detected Markdown site - will preserve full structure
🔄 Attempting to fetch Markdown from: https://raw.githubusercontent.com/...
✅ Successfully fetched original Markdown: xxxxx chars
📝 Converting Markdown to Notion blocks...
✅ Created XX Notion blocks
```

**或（如果原始文件獲取失敗）**：
```
📋 Detected Markdown site - will preserve full structure
✅ Found Markdown content with selector: .markdown-body (xxxxx chars)
📌 Preserving full HTML structure (lists, code blocks, etc.)
🎉 Using enhanced HTML to Notion converter (with Turndown)
```

**預期 Notion 結果**：
- ✅ 樹形列表完整保留
- ✅ 列表項縮進正確
- ✅ 代碼塊有語法高亮
- ✅ 標題層級清晰
- ✅ 命令名稱粗體格式保留

#### 2. HK01 新聞
**URL**: https://www.hk01.com/...

**預期**：
- ✅ 維持現有良好表現
- ✅ 段落格式保留
- ✅ 標題層級正確

## 🎯 關鍵改進點

### 1. Markdown 網站檢測
```javascript
const isMarkdownSite =
    url.includes('github.io') ||
    url.includes('.github.io') ||
    url.includes('readthedocs.io') ||
    url.includes('gitbook.io') ||
    document.querySelector('.markdown-body, .markdown, [class*="markdown"]');
```

### 2. 優先級策略
```
1. 嘗試獲取原始 .md 文件     (最佳)
2. 檢查頁面內嵌 Markdown      (次佳)
3. 使用 .markdown-body 選擇器 (實用)
4. 保留完整 HTML 結構        (保底)
5. Turndown 高質量轉換       (最後)
```

### 3. 評分權重調整
```javascript
// Markdown 網站
lists權重: 20 → 150  (提升 7.5倍)
codeBlocks權重: 30 → 100 (提升 3.3倍)
```

## ✅ 成功指標

### 格式保留度
- **列表結構**：95%+ 正確（含縮進）
- **代碼塊**：100% 保留（含語言標記）
- **標題層級**：100% 正確
- **富文本**：80%+ （粗體、斜體）

### 用戶體驗
- **Gemini CLI**：樹形列表完整，代碼塊清晰
- **HK01 新聞**：維持良好表現
- **其他技術文檔**：格式顯著改善

## 🚀 驗證步驟

1. **重新載入擴展**
   ```
   chrome://extensions/ → Notion Smart Clipper → 重新載入
   ```

2. **測試 Gemini CLI**
   ```
   URL: https://google-gemini.github.io/gemini-cli/docs/cli/commands.html
   查看：列表縮進、代碼塊、標題層級
   ```

3. **檢查主控台**
   ```
   應該看到：
   - "Detected Markdown site"
   - "Preserving full structure"
   - 可能看到原始 Markdown 獲取成功
   ```

4. **對比 Notion**
   ```
   - 列表應該有正確的縮進
   - 代碼塊應該有語法高亮
   - 標題應該有 H1/H2/H3 層級
   ```

## 📝 未來改進

### 短期
- [ ] 更多網站的原始 Markdown URL 規則
- [ ] ReadTheDocs、GitBook 的特殊處理
- [ ] 更智能的 Markdown 源文件路徑猜測

### 中期
- [ ] 支持更多 Markdown 方言（MDX、AsciiDoc）
- [ ] 視覺化預覽轉換結果
- [ ] 用戶自定義 URL 映射規則

### 長期
- [ ] AI 輔助的智能格式識別
- [ ] 社區貢獻的網站規則庫
- [ ] 完整的 Markdown 生態系統支持

---

**實施者**：Notion Chrome Extension Team
**版本**：v2.11.0
**狀態**：✅ 已優化並待測試
