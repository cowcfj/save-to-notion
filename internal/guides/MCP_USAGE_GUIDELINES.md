# 🤖 MCP 使用完備準則

## 📋 文檔信息

**版本**：v1.0  
**創建日期**：2025-10-06  
**最後更新**：2025-10-06  
**維護者**：AI Agent  
**目的**：提供完備的 MCP (Model Context Protocol) 調用指導，避免遺忘和誤用

---

## 🎯 核心原則

### 1. **按需激活**
- ✅ 只在明確需要時激活 MCP 服務器
- ✅ 避免預先激活所有可用的 MCP
- ✅ 激活前評估是否有更簡單的替代方案

### 2. **優先內建**
- ✅ 優先使用 VS Code 內建工具（read_file, grep_search, run_in_terminal）
- ✅ 只在內建工具無法滿足需求時使用 MCP
- ✅ MCP 作為增強而非替代基本工具

### 3. **批量操作**
- ✅ 能批量執行的操作盡量批量執行
- ✅ 使用 Promise.all 並行處理獨立任務
- ✅ 避免不必要的順序等待

### 4. **驗證狀態**
- ✅ 執行操作前先驗證前提條件
- ✅ 檢查實際代碼和文檔狀態
- ✅ 不盲目相信計劃文檔，以實際為準

### 5. **持久記憶**
- ✅ 重要決策和教訓記錄到 Memory MCP
- ✅ 項目狀態變更及時更新知識圖譜
- ✅ 建立實體間的邏輯關聯

---

## 🗺️ MCP 服務器總覽

### 1. **GitHub MCP Server** ✅ 已激活
- **提供者**：mcp_github
- **核心能力**：Repository、Issue、PR、Workflow、Search、Release、Security、Discussion、Project、Team、Gist、Commit 管理
- **適用場景**：GitHub 倉庫操作、CI/CD 調試、代碼搜索
- **狀態**：已激活並頻繁使用

### 2. **Memory MCP Server** ✅ 已激活
- **提供者**：mcp_memory
- **核心能力**：知識圖譜管理（實體、關係、觀察）
- **適用場景**：持久化工作記憶、跨會話信息查詢
- **狀態**：已激活，用於項目記憶

### 3. **Chrome DevTools MCP Server** ⚠️ 可用未激活
- **提供者**：mcp_chrome_devtools（推測）
- **核心能力**：瀏覽器自動化、性能分析、網絡監控、截圖、腳本執行
- **適用場景**：E2E 測試、性能分析、UI 自動化
- **狀態**：可用但尚未在當前會話激活
- **測試指南**：[TEST_E2E_MCP_GUIDE.md](./TEST_E2E_MCP_GUIDE.md)

### 4. **Fetch MCP Server** ✅ 已激活
- **提供者**：@modelcontextprotocol/server-fetch
- **核心能力**：HTTP 請求、API 測試、網頁抓取、資源獲取
- **適用場景**：測試 Notion API、驗證圖片 URL、獲取網頁內容
- **狀態**：2025-10-06 已安裝並配置

### 5. **Sequential Thinking MCP Server** ✅ 已激活
- **提供者**：@modelcontextprotocol/server-sequential-thinking
- **核心能力**：結構化思考、多步驟推理、邏輯鏈構建、錯誤預防
- **適用場景**：複雜問題分析、多步驟任務規劃、避免邏輯錯誤
- **狀態**：2025-10-06 已安裝並配置
- **詳細指南**：[SEQUENTIAL_THINKING_MCP_GUIDE.md](./SEQUENTIAL_THINKING_MCP_GUIDE.md)

### 6. **Pylance MCP Server** ⚠️ 可用未激活
- **提供者**：mcp_pylance
- **核心能力**：Python 代碼分析、語法檢查、環境管理、重構
- **適用場景**：Python 項目開發
- **狀態**：可用但當前項目（JavaScript）不適用

---

## 🎯 MCP 激活決策樹

### 第一層：任務類型判斷

#### 1. **文件操作**（讀取、修改、搜索）
- ✅ **使用內建工具**：read_file, grep_search, replace_string_in_file
- ❌ **不使用 MCP**：除非涉及 GitHub 倉庫遠程操作
- 📝 **示例**：讀取 manifest.json → `read_file`

#### 2. **GitHub API 操作**（Issue、PR、CI）
- ✅ **激活 GitHub MCP**：涉及 Issue、PR、Workflow、Repository 操作
- ⚠️ **先驗證連接**：使用 `github_get_me` 確認 API 可用
- ⚠️ **檢查實際狀態**：創建 Issue 前檢查 CHANGELOG 和代碼
- 📝 **示例**：創建 Issue → `mcp_github_create_issue`

#### 3. **瀏覽器自動化**（測試、性能分析）
- ✅ **激活 Chrome DevTools MCP**：需要瀏覽器環境的操作
- ⚠️ **評估必要性**：簡單單元測試不需要瀏覽器
- 📝 **示例**：測試 popup.html → `activate_chrome_devtools_interaction`

#### 4. **記憶管理**（記錄、查詢、追蹤）
- ✅ **使用 Memory MCP**：重要狀態、決策、教訓、長期追蹤
- ⚠️ **選擇性記錄**：只記錄重要信息，避免過度存儲
- 📝 **示例**：記錄版本發布 → `mcp_memory_add_observations`

#### 5. **HTTP 請求和 API 測試**
- ✅ **使用 Fetch MCP**：測試 API、驗證 URL、獲取網頁內容
- ⚠️ **替代方案**：簡單 GET 請求可用內建 `fetch_webpage`
- 📝 **示例**：測試 Notion API → `fetch_webpage`

#### 6. **複雜問題分析和多步驟任務**
- ✅ **使用 Sequential Thinking MCP**：需要結構化推理的複雜任務
- ⚠️ **評估必要性**：簡單任務不需要額外的思考結構
- 📝 **示例**：規劃功能實施 → 啟用 Sequential Thinking

#### 5. **HTTP 請求和 API 測試**（測試、驗證、獲取）
- ✅ **使用 Fetch MCP**：測試 API、驗證 URL、獲取網頁內容
- ⚠️ **替代方案**：簡單 GET 請求可用 `curl` 命令
- 📝 **示例**：測試 Notion API → Fetch MCP
- 📝 **示例**：驗證圖片 URL → Fetch MCP

---

## 📘 GitHub MCP 使用場景

### ✅ **適用場景**

#### 1. **Issue 管理**
```
任務：創建、更新、列出、評論 Issue
工具：create_issue, update_issue, list_issues, add_issue_comment
注意：創建前檢查 CHANGELOG.md 和實際代碼狀態
教訓：今天創建了 3 個已實現功能的 Issue，後來發現錯誤並關閉
```

#### 2. **Pull Request 管理**
```
任務：創建、合併、審查、請求 Copilot 審查
工具：create_pull_request, merge_pull_request, create_review, request_copilot_review
適用：需要自動化 PR 流程時
```

#### 3. **CI/CD 調試**
```
任務：查看 Workflow 運行、獲取失敗日誌、重新運行
工具：list_workflow_runs, get_job_logs, rerun_failed_jobs, rerun_workflow_run
適用：調試 GitHub Actions 失敗時
注意：get_job_logs 支持 failed_only=true，高效獲取所有失敗作業日誌
```

#### 4. **代碼和 Issue 搜索**
```
任務：全倉庫代碼搜索、Issue 搜索
工具：search_code, search_issues, search_pull_requests
適用：需要快速定位特定代碼或 Issue
注意：本地文件搜索優先使用 grep_search
```

#### 5. **Release 管理**
```
任務：創建發布、列出版本、獲取特定版本
工具：create_release, list_releases, get_release_by_tag
適用：版本發布流程自動化
```

### ❌ **不適用場景**

#### 1. **讀取本地文件**
```
❌ 不使用：github_get_file_contents（遠程操作，慢）
✅ 使用：read_file（本地操作，快）
```

#### 2. **簡單 Git 操作**
```
❌ 不使用：github_push_files（複雜，需要編碼）
✅ 使用：run_in_terminal("git add/commit/push")（簡單直接）
```

#### 3. **本地代碼搜索**
```
❌ 不使用：github_search_code（API 限流）
✅ 使用：grep_search（無限制，更快）
```

### 🛡️ **錯誤處理**

#### 1. **驗證連接**
```javascript
// 執行任何操作前先驗證
await mcp_github_github_get_me();
```

#### 2. **檢查實際狀態**
```javascript
// 創建 Issue 前檢查是否已實現
await grep_search("功能名稱", "CHANGELOG.md");
await read_file("scripts/background.js", 1, 50);
```

#### 3. **批量操作**
```javascript
// 創建多個 Issues（並行執行）
const issues = [
  { title: "功能 A", body: "描述 A" },
  { title: "功能 B", body: "描述 B" },
  { title: "功能 C", body: "描述 C" }
];

await Promise.all(
  issues.map(issue => mcp_github_create_issue({
    owner: "user",
    repo: "repo",
    title: issue.title,
    body: issue.body
  }))
);
```

---

## 🧠 Memory MCP 使用場景

### ✅ **適用場景**

#### 1. **記錄項目重要狀態**
```
任務：記錄版本、測試覆蓋率、已實現功能
工具：add_observations
示例：
  - "當前版本：v2.7.3"
  - "測試：608/608 通過，19.40% 覆蓋率"
  - "Codecov 集成成功"
```

#### 2. **保存開發決策和教訓**
```
任務：記錄重要決策、錯誤教訓、改進建議
工具：add_observations
示例：
  - "2025-10-06: 創建 Issue 前必須檢查 CHANGELOG 和實際代碼"
  - "錯誤：創建了 3 個已實現功能的 Issue"
  - "教訓：信任但驗證計劃文檔"
```

#### 3. **建立知識關聯**
```
任務：建立實體間的邏輯關係
工具：create_entities, create_relations
示例：
  - Notion Smart Clipper 專案 → has → 測試覆蓋率提升計劃
  - 測試覆蓋率提升計劃 → uses → 測試架構
  - 測試架構 → tests → background.testable.js
```

#### 4. **跨會話信息查詢**
```
任務：查詢歷史信息、搜索特定實體
工具：read_graph, search_nodes, open_nodes
示例：
  - 查詢項目當前狀態 → read_graph
  - 搜索測試相關信息 → search_nodes("測試")
  - 獲取特定實體詳情 → open_nodes(["實體名稱"])
```

#### 5. **追蹤長期計劃進展**
```
任務：記錄目標、里程碑、進展
工具：add_observations
示例：
  - "測試覆蓋率目標：階段1 20%，階段2 35%"
  - "當前進展：19.40%（接近階段1目標）"
  - "下一步：實施 Issue #4（商店更新說明彈出）"
```

### 🔄 **更新頻率**

#### 重要里程碑
- ✅ 版本發布（v2.7.0, v2.7.1, v2.7.3）
- ✅ 測試覆蓋率顯著提升（3.02% → 19.40%）
- ✅ 重大功能實現（Codecov 集成）

#### 重大決策
- ✅ 技術選型（CSS Highlight API）
- ✅ 架構調整（highlighter v2 遷移）
- ✅ 工作流程改進（文件同步策略）

#### 教訓學習
- ✅ 錯誤發現（Issue 創建失誤）
- ✅ 改進措施（檢查清單建立）
- ✅ 最佳實踐（MCP 使用準則）

### 📊 **數據結構**

#### 實體類型（Entity Types）
```
- Software Project（軟件項目）
- Development Task（開發任務）
- Code File（代碼文件）
- Test Suite（測試套件）
- Best Practices（最佳實踐）
- Decision Framework（決策框架）
- Usage Pattern（使用模式）
- MCP Service（MCP 服務）
- System Architecture（系統架構）
```

#### 關係類型（Relation Types）
```
- has（擁有）
- uses（使用）
- tests（測試）
- completed（完成）
- defines（定義）
- guides（指導）
- follows（遵循）
- manages（管理）
- remembers（記憶）
- can test（可測試）
- includes（包含）
```

#### 觀察內容（Observations）
```
- 具體事實（版本號、測試數量、覆蓋率）
- 時間信息（日期、順序、持續時間）
- 狀態變更（從 A 到 B）
- 原因結果（因為 X 所以 Y）
- 教訓總結（發現問題 → 解決方案）
```

---

## 🌐 Fetch MCP 使用場景

### ✅ **適用場景**

#### 1. **測試 Notion API**
```
用途：直接測試 Notion API 調用，無需手動 curl
AI 提示：
"Use Fetch MCP to test the Notion API:
POST https://api.notion.com/v1/pages
with this page data..."

優勢：
- 立即返回 API 響應
- 顯示完整的錯誤信息
- 自動處理認證 Headers
- 支持批量測試

適用：API 開發、調試、驗證
```

#### 2. **驗證圖片 URL**
```
用途：檢查 Icon 提取功能提取的圖片 URL 是否有效
AI 提示：
"Check if this image URL is accessible:
https://wordpress.org/favicon.ico"

檢查項：
- 200: 圖片可訪問 ✓
- 404: 圖片不存在 ✗
- 403: 無權訪問 ✗
- 重定向: 需要更新 URL

適用：Icon 提取驗證、圖片 URL 測試
```

#### 3. **獲取測試網頁內容**
```
用途：獲取測試網站的 HTML 內容，驗證內容提取功能
AI 提示：
"Fetch the HTML content from wordpress.org and 
check if it has a <link rel='icon'> tag"

檢查項：
- 返回完整 HTML
- 檢查特定標籤存在性
- 提取 Icon URL
- 驗證提取邏輯正確性

適用：內容提取驗證、網頁結構分析
```

#### 4. **測試不同網站的 API 響應**
```
用途：模擬不同網站的響應，測試擴展的兼容性
AI 提示：
"Test these websites and report their og:image meta tags:
1. https://medium.com/some-article
2. https://bbc.com/news/article
3. https://github.com/user/repo"

優勢：
- 批量測試多個網站
- 比對不同網站的結構
- 發現兼容性問題
- 驗證提取邏輯通用性

適用：多網站兼容性測試
```

#### 5. **驗證 Readability.js 提取結果**
```
用途：獲取網頁內容，驗證 Readability.js 提取是否完整
流程：
1. 使用 Fetch MCP 獲取原始 HTML
2. 解析 HTML
3. 使用 Readability.js 提取
4. 比對結果

適用：內容提取質量驗證
```

### ❌ **不適用場景**

#### 1. **本地文件讀取**
```
❌ 不使用：Fetch MCP（只能請求 HTTP/HTTPS）
✅ 使用：read_file（讀取本地文件）
```

#### 2. **需要 JavaScript 渲染的頁面**
```
❌ 不使用：Fetch MCP（只獲取原始 HTML）
✅ 使用：Chrome DevTools MCP（可執行 JavaScript）
原因：某些網站內容由 JavaScript 動態生成
```

#### 3. **需要登錄的 API**
```
⚠️ 謹慎使用：需要處理 Cookie 和 Session
✅ 替代方案：使用環境變量存儲認證信息
注意：不要在 AI 提示中明文包含密碼
```

### 🎯 **與 Notion Smart Clipper 的結合**

#### **測試保存功能**
```
場景：驗證 Notion API 調用是否正確
步驟：
1. 準備測試頁面數據
2. 使用 Fetch MCP 模擬 API 調用
3. 檢查響應狀態和內容
4. 驗證錯誤處理

AI 提示：
"Use Fetch MCP to test saving this page to Notion:
Title: 'Test Article'
URL: 'https://example.com/article'
Content: [100 blocks]
Expected: 200 OK with page ID"
```

#### **驗證圖片 URL 清理**
```
場景：測試圖片 URL 清理功能
步驟：
1. 提取測試頁面的圖片 URL
2. 使用 Fetch MCP 檢查原始 URL
3. 使用 Fetch MCP 檢查清理後的 URL
4. 比對結果

AI 提示：
"Check if these URLs are accessible:
Original: https://i0.wp.com/example.com/image.jpg?w=800
Cleaned: https://example.com/image.jpg"
```

#### **測試 Icon 提取多網站兼容性**
```
場景：批量測試多個網站的 Icon 提取
步驟：
1. 使用 Fetch MCP 獲取測試網站 HTML
2. 提取 Icon URL
3. 使用 Fetch MCP 驗證 Icon URL 可訪問性
4. 記錄成功率

AI 提示：
"Test icon extraction for these sites:
1. wordpress.org
2. github.com
3. medium.com
4. bbc.com
5. wikipedia.org
Report: which sites have accessible icons?"
```

### 🔧 **使用技巧**

#### **批量測試**
```javascript
// AI 會自動執行
const urls = [
  'https://site1.com',
  'https://site2.com',
  'https://site3.com'
];

const results = await Promise.all(
  urls.map(url => 
    fetch(url)
      .then(res => ({ url, status: res.status, ok: res.ok }))
      .catch(err => ({ url, error: err.message }))
  )
);
```

#### **超時控制**
```javascript
// AI 會自動添加超時
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

fetch(url, { signal: controller.signal })
  .finally(() => clearTimeout(timeoutId));
```

#### **錯誤處理**
```javascript
// AI 會自動處理錯誤
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json();
} catch (error) {
  console.error('Fetch 失敗:', error.message);
  return null;
}
```

### 📋 **快速參考**

**完整使用指南**：[FETCH_MCP_GUIDE.md](./FETCH_MCP_GUIDE.md) - 包含詳細配置、使用場景和故障排除

---

## 🌐 Chrome DevTools MCP 使用場景

### ✅ **適用場景**

#### 1. **端到端測試（E2E Testing）**
```
流程：navigate → interact → screenshot → verify
步驟：
  1. 激活 Navigation 工具
  2. 導航到測試頁面
  3. 激活 Interaction 工具
  4. 執行用戶操作（click、fill、submit）
  5. 激活 Screenshotting 工具
  6. 截圖驗證結果
適用：Chrome Extension popup.html 功能測試
```

#### 2. **性能分析**
```
流程：start_performance_trace → 操作 → stop → 分析
工具：activate_chrome_devtools_performance
指標：Core Web Vitals（LCP, FID, CLS）
適用：頁面保存速度、標註恢復速度分析
```

#### 3. **網絡監控**
```
流程：list_network_requests → 分析 → 驗證
工具：activate_chrome_devtools_network
監控：Notion API 調用、圖片加載、資源請求
適用：調試 API 錯誤、檢查請求參數
```

#### 4. **自動化 UI 測試**
```
操作：click、fill、drag、hover
工具：activate_chrome_devtools_interaction
適用：
  - 測試 popup 按鈕功能
  - 驗證設置頁面交互
  - 檢查標註顏色選擇
```

#### 5. **截圖和快照**
```
工具：take_screenshot（視覺截圖）、take_snapshot（DOM 快照）
適用：
  - 視覺回歸測試
  - UI 變更驗證
  - Bug 報告附件
```

### 🎯 **當前項目應用**

#### Notion Smart Clipper 測試場景

##### **1. Icon 提取功能測試（v2.7.0 已實現）**
```
測試目標：驗證網站 Icon（Favicon）提取功能
測試提示：
"Test the extension's icon extraction on wordpress.org. 
Check if it correctly extracts the favicon from the page DOM."

AI 將自動：
1. 啟動 Chrome 瀏覽器
2. 加載 notion-chrome 擴展
3. 訪問 wordpress.org
4. 檢查 DOM 中的 <link rel="icon"> 元素
5. 驗證擴展是否提取了正確的 Icon
6. 檢查控制台日誌
7. 返回測試報告

測試網站：wordpress.org, github.com, medium.com
```

##### **2. 封面圖提取測試**
```
測試目標：驗證文章封面圖（Featured Image）提取
測試提示：
"Visit faroutmagazine.co.uk article and verify the featured image 
is correctly extracted as the first block."

AI 將自動：
1. 訪問測試頁面
2. 檢查 og:image meta 標籤
3. 驗證擴展提取結果
4. 確認圖片 URL 正確性
5. 檢查圖片是否作為第一個區塊
```

##### **3. 文本標註功能測試（v2.5.x 已實現）**
```
測試目標：驗證 CSS Highlight API 標註功能
測試提示：
"Test the text highlighting feature. Select some text and 
verify the highlight is applied correctly."

AI 將自動：
1. 模擬文本選擇
2. 觸發標註功能（右鍵菜單或快捷鍵）
3. 檢查 CSS.highlights 註冊
4. 驗證樣式應用
5. 測試標註持久化
6. 測試標註恢復
```

##### **4. 保存到 Notion 功能測試**
```
測試目標：驗證完整的保存流程和 API 調用
測試提示：
"Test the save to Notion functionality. Click the extension 
icon and verify the API calls are made correctly."

AI 將自動：
1. 模擬點擊擴展圖標
2. 監控網路請求（Notion API）
3. 驗證批次處理（100 個區塊/批次）
4. 檢查錯誤處理（400/500 狀態碼）
5. 驗證成功提示
6. 檢查「Open in Notion」按鈕（v2.7.0）
```

##### **5. Popup 界面交互測試**
```
測試場景：
1. 測試「保存到 Notion」按鈕
   - 點擊觸發保存
   - 驗證載入狀態
   - 檢查成功/失敗提示
   
2. 測試「Open in Notion」按鈕（v2.7.0）
   - 驗證按鈕顯示條件
   - 點擊打開新標籤頁
   - 確認 URL 正確性
   
3. 測試「標註」按鈕
   - 檢查標註模式切換
   - 驗證顏色選擇
   - 測試標註應用
   
4. 測試「設置」鏈接
   - 點擊打開設置頁面
   - 驗證頁面跳轉
```

##### **6. 設置頁面測試**
```
測試場景：
1. API Token 管理
   - 填寫 Token
   - 保存到 storage
   - 驗證存儲成功
   
2. Database ID 設置
   - 填寫 Database ID
   - 保存並驗證
   - 測試無效 ID 錯誤處理
   
3. 數據清理功能
   - 測試「清除所有標註」
   - 測試「清除已保存記錄」
   - 驗證清理確認提示
```

##### **7. 性能測試**
```
測試目標：測量關鍵操作的性能指標
測試提示：
"Check the performance of the extension when saving a large page. 
Measure the LCP and report any issues."

AI 將自動：
1. 執行效能追蹤
2. 分析 LCP、FCP、CLS 等指標
3. 測量頁面保存時間
4. 測量標註恢復速度
5. 分析 Notion API 響應時間
6. 識別性能瓶頸
7. 提供優化建議

性能目標：
- 短文章（< 100 區塊）：< 2 秒
- 長文章（300+ 區塊）：< 10 秒
- 標註恢復：< 500 毫秒
```

##### **8. 多網站兼容性測試**
```
測試網站清單：
✅ WordPress.org - CMS 網站
✅ Medium.com - 部落格平台
✅ GitHub.com - 代碼托管
✅ BBC News - 新聞網站
✅ Wikipedia - 百科網站
✅ Notion.so - SaaS 應用

測試重點：
- Icon 提取成功率
- 內容提取完整性
- 圖片處理正確性
- 標註功能穩定性
```

### ❌ **不適用場景**

#### 1. **簡單單元測試**
```
❌ 不使用：Chrome DevTools MCP
✅ 使用：Jest 單元測試
原因：不需要瀏覽器環境，Jest 更快更簡單
```

#### 2. **邏輯測試**
```
❌ 不使用：瀏覽器自動化
✅ 使用：純函數測試（utils.test.js）
原因：邏輯測試不需要 DOM 環境
```

#### 3. **API 單元測試**
```
❌ 不使用：Network 監控
✅ 使用：Mock API 響應
原因：單元測試應該隔離外部依賴
```

### 🔧 **使用方法**

#### **方法 1：直接提示 AI**
```
"Please test the Icon extraction feature on wordpress.org 
using Chrome DevTools MCP."
```

#### **方法 2：批量測試**
```
"Run all extension tests:
1. Icon extraction (wordpress.org, github.com, medium.com)
2. Cover image extraction (faroutmagazine.co.uk)
3. Text highlighting
4. Save to Notion functionality
5. Performance check"
```

#### **方法 3：調試特定問題**
```
"The icon extraction seems to fail on some sites. 
Debug why it's not working on example.com."
```

### 🚨 **故障排除**

#### **問題 1：MCP 服務器未啟動**
```bash
# 手動測試
npx -y chrome-devtools-mcp@latest --version
```

#### **問題 2：Chrome 未正確啟動**
- 確保已安裝 Chrome 瀏覽器
- 檢查 Chrome 路徑配置
- 關閉其他 Chrome 實例

#### **問題 3：擴展未加載**
- Chrome DevTools MCP 可能不支持自動加載擴展
- 需要手動在 Chrome 中加載擴展
- 或使用 Puppeteer 腳本配合測試

### 💡 **測試最佳實踐**

#### **1. 測試前準備**
- 關閉不必要的 Chrome 窗口
- 清除瀏覽器緩存
- 確保 Notion API Token 有效

#### **2. 測試中監控**
- 觀察控制台輸出
- 檢查網路請求
- 監控性能指標

#### **3. 測試後清理**
- 關閉測試瀏覽器窗口
- 清理測試數據
- 記錄測試結果

---

## 🔄 MCP 組合使用策略

### 場景 1：完整的功能開發流程

```markdown
1. **規劃階段** - Memory MCP
   - 查詢知識圖譜了解項目當前狀態
   - 搜索類似功能的實現歷史
   - 記錄規劃決策

2. **開發階段** - VS Code 內建工具
   - 使用 read_file 讀取代碼
   - 使用 replace_string_in_file 修改代碼
   - 使用 run_in_terminal 運行測試

3. **測試階段** - Chrome DevTools MCP（如需要）
   - E2E 測試新功能
   - 性能測試
   - UI 驗證

4. **發布階段** - GitHub MCP + Memory MCP
   - 創建 GitHub Issue 記錄功能
   - 更新 CHANGELOG（內建工具）
   - 創建 GitHub Release
   - 記錄發布信息到知識圖譜

5. **回顧階段** - Memory MCP
   - 記錄教訓和改進建議
   - 更新最佳實踐
```

### 場景 2：Bug 調試流程

```markdown
1. **問題發現** - GitHub MCP
   - 查看 Issue 報告
   - 獲取 CI 失敗日誌

2. **代碼分析** - VS Code 內建工具
   - grep_search 搜索相關代碼
   - read_file 讀取代碼細節
   - semantic_search 查找類似問題

3. **復現測試** - Chrome DevTools MCP（如需要）
   - 自動化復現 Bug
   - 截圖記錄問題
   - 網絡監控找原因

4. **修復驗證** - VS Code 內建工具 + runTests
   - 修改代碼
   - 運行單元測試
   - 運行集成測試

5. **結果記錄** - GitHub MCP + Memory MCP
   - 更新 Issue 狀態
   - 記錄 Bug 原因和解決方案
   - 更新知識圖譜
```

---

## ⚠️ 常見錯誤和避免方法

### 錯誤 1：忘記已使用的 MCP

**症狀**：
- 報告時沒有提到 Memory MCP 或 Chrome DevTools MCP
- 重複激活已激活的 MCP

**原因**：
- 缺乏系統化的 MCP 清單
- 沒有定期查詢知識圖譜

**解決**：
- ✅ 建立本文檔（MCP 使用準則）
- ✅ 在 Memory MCP 中記錄所有 MCP 服務器
- ✅ 定期使用 `read_graph` 查詢當前狀態
- ✅ 在重要操作前檢查清單

### 錯誤 2：創建重複或已實現功能的 Issue

**症狀**：
- 創建了 3 個已在 v2.7.0 實現的功能的 Issue
- 浪費時間和造成混淆

**原因**：
- 沒有檢查 CHANGELOG.md
- 沒有檢查實際代碼實現
- 盲目信任計劃文檔（GOALS.md）

**解決**：
- ✅ 創建 Issue 前先檢查 CHANGELOG.md
- ✅ 使用 grep_search 搜索相關代碼
- ✅ 使用 read_file 確認實際實現
- ✅ 信任但驗證計劃文檔

**檢查清單**：
```markdown
創建 GitHub Issue 前：
- [ ] 檢查 CHANGELOG.md 是否已記錄
- [ ] 搜索代碼確認是否已實現
- [ ] 檢查 manifest.json 版本號
- [ ] 驗證功能在當前版本的可用性
- [ ] 如有疑問，詢問用戶
```

### 錯誤 3：過度使用 MCP

**症狀**：
- 使用 GitHub MCP 讀取本地文件
- 使用 Chrome DevTools 測試簡單邏輯

**原因**：
- 沒有評估內建工具的適用性
- 不了解各 MCP 的適用場景

**解決**：
- ✅ 遵循「優先內建」原則
- ✅ 參考本文檔的「適用/不適用場景」
- ✅ 評估成本效益（速度、複雜度）

### 錯誤 4：忽略錯誤處理

**症狀**：
- API 調用失敗沒有檢測
- 未驗證 MCP 連接狀態

**原因**：
- 假設 API 總是可用
- 沒有異常處理機制

**解決**：
- ✅ 使用 try-catch 包裹 MCP 調用
- ✅ 調用前驗證連接（如 `github_get_me`）
- ✅ 提供友好的錯誤提示
- ✅ 記錄錯誤到 Memory MCP 用於改進

---

## 📋 MCP 使用檢查清單

### 開始新任務時

```markdown
- [ ] 明確任務類型（文件/API/瀏覽器/記憶）
- [ ] 評估是否可用內建工具完成
- [ ] 確定需要激活哪些 MCP
- [ ] 查詢 Memory MCP 了解項目當前狀態
- [ ] 檢查是否有類似任務的歷史記錄
```

### 使用 GitHub MCP 時

```markdown
- [ ] 驗證 GitHub API 連接（get_me）
- [ ] 檢查 CHANGELOG.md 了解實際狀態
- [ ] 搜索代碼確認功能實現狀態
- [ ] 評估是否需要批量操作
- [ ] 準備錯誤處理和降級方案
```

### 使用 Memory MCP 時

```markdown
- [ ] 確定要記錄的信息類型（狀態/決策/教訓）
- [ ] 選擇合適的實體類型
- [ ] 建立與現有實體的關係
- [ ] 使用清晰的觀察描述
- [ ] 包含時間信息和上下文
```

### 使用 Chrome DevTools MCP 時

```markdown
- [ ] 確認需要瀏覽器環境
- [ ] 評估是否可用單元測試替代
- [ ] 規劃測試流程（navigate → interact → verify）
- [ ] 準備截圖和日誌收集
- [ ] 考慮性能和資源消耗
```

### 完成任務後

```markdown
- [ ] 記錄重要決策到 Memory MCP
- [ ] 記錄教訓和改進建議
- [ ] 更新知識圖譜的實體關係
- [ ] 更新相關文檔（如本文檔）
- [ ] 提交代碼和文檔修改
```

---

## 🔄 準則維護

### 更新觸發條件

1. **發現新的 MCP 使用場景**
   - 添加到「使用場景」章節
   - 記錄到 Memory MCP

2. **發現新的錯誤模式**
   - 添加到「常見錯誤」章節
   - 更新檢查清單

3. **MCP 服務器更新**
   - 新增或移除 MCP
   - 更新功能描述
   - 調整使用建議

4. **項目需求變化**
   - 調整優先級策略
   - 更新適用場景
   - 修改決策樹

### 版本歷史

- **v1.0** (2025-10-06)：初始版本
  - 創建完整的 MCP 使用準則
  - 記錄 4 個 MCP 服務器
  - 建立決策樹和使用場景
  - 添加常見錯誤和檢查清單

---

## 📚 相關文檔

- **Agents.md** - AI Agent 完整工作指南
- **AI_AGENT_QUICK_REF.md** - 快速參考卡
- **GOALS.md** - 項目目標和發展計劃
- **GITHUB_SYNC_POLICY.md** - GitHub 文件同步策略
- **TESTING_GUIDE.md** - 測試指南

---

**🎯 記住**：MCP 是增強工具，不是替代工具。優先使用內建功能，按需激活 MCP，並持續記錄使用經驗以改進本準則。

**最後更新**：2025-10-06  
**維護者**：AI Agent  
**反饋**：發現問題或改進建議請更新本文檔和 Memory MCP
