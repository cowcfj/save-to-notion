# 🌐 Fetch MCP 使用指南

**版本**：@modelcontextprotocol/server-fetch  
**狀態**：✅ 通用配置指南  
**適用於**：Kiro、Cline、Cursor、Windsurf 等支持 MCP 的 AI agent

> 💡 **相關文檔**：[MCP_USAGE_GUIDELINES.md](./MCP_USAGE_GUIDELINES.md) - 所有 MCP 服務器的使用準則和決策指南

---

## 📦 配置方法

### **不同 AI Agent 的配置文件位置**

#### **Kiro**
```bash
# 工作區配置（推薦）
.kiro/settings/mcp.json

# 用戶級配置（全局）
~/.kiro/settings/mcp.json
```

#### **Cline (VS Code)**
```bash
# Cline 配置
~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json
```

#### **Cursor**
```bash
# Cursor 配置
~/.cursor/mcp.json
```

#### **Windsurf**
```bash
# Windsurf 配置
~/.windsurf/mcp.json
```

---

## 🔧 配置內容（通用）

### **基本配置**
```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch"
      ]
    }
  }
}
```

### **Kiro 完整配置範例**
```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch"
      ],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

---

## 📝 配置說明

### **配置項解釋**

| 配置項 | 說明 | 可選值 |
|--------|------|--------|
| `command` | 執行命令 | `npx`, `uvx`, `node` |
| `args` | 命令參數 | 服務器包名和參數 |
| `env` | 環境變量 | 日誌級別等 |
| `disabled` | 是否禁用 | `true`, `false` |
| `autoApprove` | 自動批准的工具 | 工具名稱數組 |

### **日誌級別**
- `ERROR`: 只顯示錯誤（推薦）
- `WARN`: 顯示警告和錯誤
- `INFO`: 顯示信息、警告和錯誤
- `DEBUG`: 顯示所有日誌（調試用）

---

## 🎯 Fetch MCP 核心能力

### **1. HTTP 請求**
- GET, POST, PUT, DELETE, PATCH 等方法
- 自定義 Headers
- 請求 Body（JSON, Form Data, etc.）
- 超時控制

### **2. API 測試**
- 測試 RESTful API
- 驗證 API 響應
- 檢查狀態碼和響應內容
- 模擬不同的 API 場景

### **3. 網頁抓取**
- 獲取 HTML 內容
- 提取特定元素
- 驗證頁面結構
- 檢查 Meta 標籤

### **4. 資源獲取**
- 下載文件
- 驗證 URL 有效性
- 檢查圖片可訪問性
- 獲取 API 文檔

---

## 🚀 Notion Smart Clipper 使用場景

### **場景 1：測試 Notion API** ⭐⭐⭐⭐⭐

#### **用途**
直接測試 Notion API 調用，無需手動 curl 或 Postman。

#### **AI 提示範例**
```
"Use Fetch MCP to test the Notion API:
POST https://api.notion.com/v1/pages
with this page data: {title: 'Test Page', content: ...}"
```

#### **實際操作**
```javascript
// AI 會自動執行
fetch('https://api.notion.com/v1/pages', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer secret_...',
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  },
  body: JSON.stringify({
    parent: { database_id: 'xxx' },
    properties: { ... },
    children: [ ... ]
  })
})
```

#### **預期結果**
- ✅ 立即返回 API 響應
- ✅ 顯示狀態碼（200, 400, 500, etc.）
- ✅ 返回完整的響應 Body
- ✅ 顯示錯誤信息（如有）

---

### **場景 2：驗證圖片 URL** ⭐⭐⭐⭐

#### **用途**
檢查 Icon 提取功能提取的圖片 URL 是否有效。

#### **AI 提示範例**
```
"Check if this image URL is accessible:
https://wordpress.org/favicon.ico"
```

#### **實際操作**
```javascript
// AI 會自動執行
fetch('https://wordpress.org/favicon.ico', {
  method: 'HEAD'  // 只檢查 Headers，不下載內容
})
```

#### **預期結果**
- ✅ 200: 圖片可訪問 ✓
- ❌ 404: 圖片不存在 ✗
- ❌ 403: 無權訪問 ✗
- ⚠️ 重定向: 需要更新 URL

---

### **場景 3：獲取測試網頁內容** ⭐⭐⭐⭐

#### **用途**
獲取測試網站的 HTML 內容，驗證內容提取功能。

#### **AI 提示範例**
```
"Fetch the HTML content from wordpress.org and 
check if it has a <link rel='icon'> tag"
```

#### **實際操作**
```javascript
// AI 會自動執行
fetch('https://wordpress.org')
  .then(res => res.text())
  .then(html => {
    // 分析 HTML 內容
    const hasIcon = html.includes('<link rel="icon"');
    return { hasIcon, iconTag: '...' };
  })
```

#### **預期結果**
- ✅ 返回完整 HTML
- ✅ 檢查特定標籤存在性
- ✅ 提取 Icon URL
- ✅ 驗證提取邏輯正確性

---

### **場景 4：測試不同網站的 API 響應** ⭐⭐⭐

#### **用途**
模擬不同網站的響應，測試擴展的兼容性。

#### **AI 提示範例**
```
"Test these websites and report their og:image meta tags:
1. https://medium.com/some-article
2. https://bbc.com/news/article
3. https://github.com/user/repo"
```

#### **實際操作**
```javascript
// AI 會批量執行
const urls = ['url1', 'url2', 'url3'];
const results = await Promise.all(
  urls.map(url => 
    fetch(url)
      .then(res => res.text())
      .then(html => extractOgImage(html))
  )
);
```

#### **預期結果**
- ✅ 批量測試多個網站
- ✅ 比對不同網站的結構
- ✅ 發現兼容性問題
- ✅ 驗證提取邏輯通用性

---

### **場景 5：驗證 Readability.js 提取結果** ⭐⭐⭐

#### **用途**
獲取網頁內容，驗證 Readability.js 提取是否完整。

#### **AI 提示範例**
```
"Fetch the content from faroutmagazine.co.uk and 
verify if Readability.js correctly extracts the article"
```

#### **實際操作**
```javascript
// 1. 獲取原始 HTML
const html = await fetch(url).then(res => res.text());

// 2. 解析 HTML
const dom = new DOMParser().parseFromString(html, 'text/html');

// 3. 使用 Readability.js 提取
const reader = new Readability(dom);
const article = reader.parse();

// 4. 比對結果
return {
  title: article.title,
  content: article.content,
  excerpt: article.excerpt
};
```

---

## 🔧 使用方法

### **方法 1：直接提示 AI**
```
"Use Fetch MCP to test [描述你的需求]"
```

### **方法 2：指定詳細參數**
```
"Use Fetch MCP to:
- URL: https://api.notion.com/v1/pages
- Method: POST
- Headers: { Authorization: 'Bearer xxx', Content-Type: 'application/json' }
- Body: { ... }
- Expected: 200 OK with page ID"
```

### **方法 3：批量測試**
```
"Use Fetch MCP to test these URLs and report which ones are accessible:
1. https://example1.com
2. https://example2.com
3. https://example3.com"
```

---

## 📋 常用 API 測試模板

### **測試 Notion API - 創建頁面**
```
"Test Notion API page creation with Fetch MCP:
POST https://api.notion.com/v1/pages
Body: {
  parent: { database_id: 'YOUR_DB_ID' },
  properties: {
    Name: { title: [{ text: { content: 'Test Page' } }] }
  },
  children: [
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ text: { content: 'Test content' } }]
      }
    }
  ]
}"
```

### **測試 Notion API - 批量添加區塊**
```
"Test Notion API block append with Fetch MCP:
PATCH https://api.notion.com/v1/blocks/{block_id}/children
Body: {
  children: [
    { type: 'paragraph', paragraph: { rich_text: [...] } },
    { type: 'heading_2', heading_2: { rich_text: [...] } },
    { type: 'image', image: { external: { url: '...' } } }
  ]
}"
```

### **驗證圖片 URL**
```
"Check if these image URLs are accessible using Fetch MCP:
1. https://wordpress.org/favicon.ico
2. https://github.githubassets.com/favicons/favicon.png
3. https://medium.com/icon.png"
```

### **獲取網頁 Meta 標籤**
```
"Fetch the HTML from https://bbc.com and extract:
- og:title
- og:description
- og:image
- twitter:card"
```

---

## ⚠️ 注意事項

### **1. CORS 限制**
- ⚠️ 某些網站可能有 CORS 限制
- ✅ Fetch MCP 在服務器端執行，通常不受 CORS 影響
- ✅ 但某些 API 可能需要特定的 Origin Header

### **2. 速率限制**
- ⚠️ Notion API 有速率限制（3 requests/second）
- ✅ 批量測試時需要添加延遲
- ✅ 使用 `await delay(350)` 避免觸發限制

### **3. 認證信息**
- ⚠️ 不要在 AI 提示中明文包含完整的 API Token
- ✅ 使用占位符：`Bearer YOUR_NOTION_TOKEN`
- ✅ AI 會自動從環境變量或配置中讀取

### **4. 超時設置**
- ⚠️ 某些網站響應較慢
- ✅ 可以設置超時時間：`timeout: 5000`（5秒）
- ✅ 避免長時間等待

---

## 🎯 預期收益

### **測試效率提升**
- ⏱️ **節省時間**：50%+（無需手動 curl）
- ✅ **即時反饋**：立即看到 API 響應
- 🔍 **更好調試**：完整的錯誤信息

### **測試準確度提升**
- ✅ **真實環境**：在實際 HTTP 環境中測試
- ✅ **批量驗證**：同時測試多個 URL
- ✅ **自動化**：AI 自動執行，減少人為錯誤

### **開發體驗改善**
- 🚀 **快速迭代**：即時測試 API 變更
- 📊 **數據驗證**：直接檢查 API 響應格式
- 🛠️ **問題定位**：快速找到 API 錯誤原因

---

## 🔄 與其他 MCP 配合

### **Fetch + GitHub MCP**
```
場景：測試 CI/CD 中的 API 調用
1. 使用 GitHub MCP 獲取最新代碼
2. 使用 Fetch MCP 測試 API
3. 使用 GitHub MCP 創建 Issue（如有問題）
```

### **Fetch + Memory MCP**
```
場景：記錄 API 測試結果
1. 使用 Fetch MCP 測試 API
2. 使用 Memory MCP 記錄測試結果
3. 追蹤 API 響應時間變化
```

### **Fetch + Chrome DevTools MCP**
```
場景：完整的 E2E 測試
1. 使用 Chrome DevTools 打開網頁
2. 使用 Fetch MCP 驗證 API 調用
3. 使用 Chrome DevTools 驗證 UI 更新
```

---

## 🚨 故障排除

### **問題 1：Fetch MCP 未激活**

#### **Kiro**
```bash
# 解決方案
1. 檢查配置文件：.kiro/settings/mcp.json 或 ~/.kiro/settings/mcp.json
2. 重新連接 MCP Server（從 MCP Server 視圖）
3. 查看 Kiro 的 MCP 日誌
4. 確認 npx 已安裝：npx --version
```

#### **Cline (VS Code)**
```bash
# 解決方案
1. 重新啟動 VS Code（Window: Reload Window）
2. 檢查配置文件是否正確
3. 查看 Output 面板的 MCP 日誌
```

#### **通用檢查**
```bash
# 1. 確認 Node.js 已安裝
node --version  # 應該 >= 16

# 2. 確認 npx 可用
npx --version

# 3. 手動測試 Fetch MCP
npx -y @modelcontextprotocol/server-fetch
```

### **問題 2：API 請求失敗**
```bash
# 檢查清單
- [ ] URL 是否正確？
- [ ] Headers 是否完整？
- [ ] API Token 是否有效？
- [ ] 網絡連接是否正常？
- [ ] 是否觸發速率限制？
```

### **問題 3：無法獲取網頁內容**
```bash
# 可能原因
- 網站需要登錄
- 網站有反爬蟲機制
- HTTPS 證書問題
- 網站不存在或已關閉

# 解決方案
- 使用 Chrome DevTools MCP 替代（可以處理 JavaScript 渲染）
- 檢查網站是否可訪問（在瀏覽器中手動測試）
```

---

## 📚 參考資源

- **官方文檔**：https://github.com/modelcontextprotocol/servers/tree/main/src/fetch
- **MCP 協議**：https://modelcontextprotocol.io/
- **Notion API**：https://developers.notion.com/
- **Fetch API MDN**：https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API

---

## 🎉 快速開始

### **第一次使用**
```
"Hi! I want to test if Fetch MCP is working. 
Please fetch https://api.github.com and show me the response."
```

### **測試 Notion API**
```
"Use Fetch MCP to test my Notion API connection:
GET https://api.notion.com/v1/users/me
with my Notion API token"
```

### **驗證 Icon 提取**
```
"Check if these favicon URLs are accessible:
1. https://wordpress.org/favicon.ico
2. https://github.com/favicon.ico
3. https://medium.com/favicon.ico"
```

---

## 📋 配置檢查清單

### **Kiro 用戶**
- [ ] 創建或編輯 `.kiro/settings/mcp.json`
- [ ] 添加 Fetch MCP 配置
- [ ] 從 MCP Server 視圖重新連接
- [ ] 測試 Fetch MCP 是否工作

### **Cline 用戶**
- [ ] 編輯 `mcp_settings.json`
- [ ] 添加 Fetch MCP 配置
- [ ] 重新啟動 VS Code
- [ ] 測試 Fetch MCP 是否工作

### **其他 AI Agent**
- [ ] 查找對應的 MCP 配置文件
- [ ] 使用通用配置格式
- [ ] 重新啟動或重新連接
- [ ] 測試功能

---

## 🔄 配置更新記錄

- **2025-10-06**: 初始版本（Cline 專用）
- **2025-10-07**: 更新為通用配置指南，支持多個 AI agent

---

**配置狀態**：✅ 通用配置指南  
**適用範圍**：所有支持 MCP 的 AI agent  
**維護策略**：保持配置格式通用，避免特定 agent 的硬編碼路徑

**🎊 Fetch MCP 通用配置指南！適用於 Kiro、Cline、Cursor 等所有支持 MCP 的 AI agent！**
