# Config 目錄 (常數與設定)

本目錄包含整個專案的共用常數、文字與設定檔。這些設定有些會被打包注入到網頁中（Content Script / Highlighter），有些則直接在擴充功能的環境中執行（Background / Popup / Options / Side Panel）。

為減少最終發布版本的體積，只在「網頁注入」環境中使用的設定已經在打包腳本 (`tools/package-extension.sh`) 中被排除，因為它們已經被 Rollup 打包進 `content.bundle.js` 中。

## 模組分類與使用環境

### 1. 跨界共用 (跨注入環境與擴展環境)

這些模組同時被 `content`/`highlighter` (打包注入) 及 Extension 介面 (Background / Popup / Options / Side Panel) 使用。

- `constants.js`: 核心常數 (API 端點、上限配置等)
- `messages.js`: 所有的 UI 顯示文字與錯誤訊息
- `index.js`: 提供給 Background/Popup/Options 統一引入路徑的聚合檔

> **🚨 開發預警 / Warning**
> 修改這些共用檔案時，請注意不可引入需要特定 Web API（如 `window`、`document`）或特定 Chrome API（如 `chrome.tabs.*`）的操作，以確保它在跨環境中都是安全的常數定義。

### 2. 僅注入環境 (僅網頁內執行)

這些模組**只被** `content` 或 `highlighter` 引用。打包時會透過 Rollup tree-shaking 進入 bundle；打包腳本 (`tools/package-extension.sh`) 的 rsync 排除清單也會在封裝時排除這些原始檔案，因此最終的 zip 檔中**不會包含**它們。

- `extraction.js`: 定義內容提取規則與選擇器 (被 Content 使用)
- `patterns.js`: 網頁內容的正規表達式 (被 Content 使用)
- `ui-selectors.js`: 原有網頁 UI 的 CSS 選擇器，主要用於規避或攔截 (被 Highlighter 使用)

### 3. 僅擴展環境 (不進入網頁環境)

這些模組只在 Background, Popup, Options 或 Side Panel 中運行。

- `icons.js`: 提供給 Extension UI 的 SVG ICONS 字串
- `env.js`: 環境檢測工具（判斷 Extension / Background / Content / Dev 等執行環境）
- `features.js`: 功能開關設定
