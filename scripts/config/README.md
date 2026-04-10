# Config 目錄 (常數與設定)

本目錄包含整個專案的共用常數、文字與設定檔。這些設定有些會被打包注入到網頁中（Content Script / Highlighter），有些則直接在擴充功能的環境中執行（Background / Popup / Options / Side Panel）。

為減少最終發布版本的體積，只在「網頁注入」環境中使用的設定會在打包腳本中被排除，因為它們已經被 Rollup 打包進 `content.bundle.js` 中。

## 模組分類與用途

### 1. 系統核心與基礎配置

- `app.js`: 系統核心配置 (限制協議、處理器閾值、Tab 服務等)
- `api.js`: API 專屬配置 (Notion API 端點、OAuth、超時) **僅供 Background Service Worker 使用**
- `env.js`: 環境配置 (運行環境檢測與變數抽象)
- `storageKeys.js`: 存儲鍵值配置 (Chrome Storage Keys 與前綴)

### 2. 跨模組聚合

- `index.js`: 提供給 Background 等模組統一引入路徑的聚合檔（不含 `api.js`）。
  > **注意：UI 擴充環境 (Popup/Options/Side Panel) 請避免使用此聚合檔，以免連帶引入被打包腳本排除的模組而引發錯誤。**

### 3. UI 與內容提取配置

- `extraction.js`: 內容提取配置 (解析選擇器、Next.js 配置、圖片驗證規則等)
- `notionCodeLanguages.js`: Notion Code block 語言白名單、fallback 與語言提示相關共享常數
- `ui.js`: UI 層配置 (擴充功能介面專用的選擇器、狀態常量等)
- `highlightConstants.js`: 螢光筆標記常量 (Highlight 相關特有類名與屬性，供 Highlighter 與 Content 使用)
- `icons.js`: SVG 圖標與 Emoji 映射配置 (供 Extension UI 與頁面注入腳本使用)
- `messages.js`: 所有的 UI 顯示文字、錯誤映射與日誌級別

> **🚨 開發預警**
> 修改這些共用檔案時，請注意不可引入需要特定 Web API（如 `window`、`document`）或特定 Chrome API（如 `chrome.tabs.*`）的操作，以確保它在跨環境中都是安全的常數定義。
