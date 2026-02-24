# Utils 目錄 (共用工具)

本目錄包含整個專案的共用功能。由於擴展的架構特性，有些模組會被打包注入到網頁中（Content Script / Highlighter），有些則直接在擴充功能的環境中執行（Background / Popup / Options / Side Panel）。

為減少最終發布版本的體積，只在「網頁注入」環境中使用的工具已在打包腳本 (`tools/package-extension.sh`) 中被排除，因為它們已經被 Rollup 打包進 `content.bundle.js` 中。

## 模組分類與使用環境

### 1. 跨界共用 (跨注入環境與擴展環境)

這些模組同時被 `content`/`highlighter` (打包注入) 及 Extension 介面 (Background / Popup / Options / Side Panel) 使用。

- `Logger.js`: 全域日誌工具
- `ErrorHandler.js`: 統一錯誤處理
- `securityUtils.js`: 安全性檢查、API 錯誤處理等
- `urlUtils.js`: URL 解析與正規化

> **🚨 開發預警 / Warning**
> 修改這些檔案時，需確保它們同時相容於注入網頁的環境（無法直接存取大部分 `chrome.*` API）以及擴展本身的環境。

### 2. 僅注入環境 (僅網頁內執行)

這些模組**只被** `content` 引用。打包時會透過 Rollup tree-shaking 進入 bundle，因此最終的 zip 檔中**不會包含**這些原始檔案。

- `contentUtils.js`: Notion 內容提取輔助
- `imageUtils.js`: 圖片處理與提取
- `pageComplexityDetector.js`: 網頁複雜度分析與提取策略選擇

### 3. 僅擴展環境 (不進入網頁環境)

這些模組只在 Background, Popup, Options, 或 Side Panel 中運行，可以使用完整的擴展執行環境資源。

- `uiUtils.js`: 供 Popup 和 Options 使用的共用 UI 工具
- `RetryManager.js`: 僅 Background 的網頁請求重試管理
- `LogBuffer.js`: 僅 Background 的日誌緩衝區
- `LogExporter.js`: 僅 Background 的日誌匯出器
- `LogSanitizer.js`: 僅 Background 的日誌清理與脫敏工具
