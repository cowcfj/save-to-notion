# 變更日誌 (CHANGELOG)

## v2.14.2 - 2025-12-08

### 🐛 Bug 修復

- **Build 流程修復**：修復 GitHub Actions 中 `release.yml` 腳本引用已不存在的目錄 `scripts/imageExtraction` 導致的構建失敗問題。

## v2.14.1 - 2025-12-08

### 📚 版本更新

- **更新版本號**：更新至 v2.14.1。

### 🐛 Bug 修復

- **DomConverter Imports 順序修正**：修正了 `DomConverter.js` 中 `MAX_TEXT_LENGTH` 變數宣告在 import 語句之前的問題，使其符合 ESM 規範。
- **DomConverter 嵌套連結處理**：修正了 `DomConverter.js` 在處理嵌套連結（如 `<a><b>Bold Link</b></a>`）時，連結無法正確應用到所有嵌套文本節點的問題。

### 🏗️ 架構與代碼清理

- **移除未使用的函式庫**：移除了專案中未使用的 `turndown.js` 相關檔案，減小專案體積。
- **移除冗餘目錄**：移除了已被 `imageUtils` 和 `ImageCollector` 取代的 `scripts/imageExtraction` 目錄。
- **Build 系統統一**：更新 `rollup.all.config.mjs` 和 `package.json`，實現透過單一命令同時構建和監聽 Content Script 與 Highlighter。

## v2.14.0 - 2025-12-07

### ♻️ 代碼清理與架構優化

#### 移除舊版內容提取邏輯

- **移除 Legacy Fallback**：完全移除 `background.js` 中長達 1200 行的舊版 `injectWithResponse` 內容提取邏輯。
- **統一使用 PageContentService**：現在所有的內容提取請求都通過 `PageContentService` 處理，確保行為一致且更易於維護。
- **移除 Feature Flag**：移除了 `USE_PAGE_CONTENT_SERVICE` 開關，標誌著從舊架構向新服務化架構遷移的完成。
- **依賴簡化**：移除了不再使用的 `PerformanceOptimizer` 全局依賴（在 background 環境中）。

### 🧪 穩定性驗證

- **全面回歸測試**：通過所有 117 個測試套件驗證，確保在移除舊邏輯後核心功能不受影響。

### 🐛 Bug 修復

- **Logger.warn 修正**：修復了 `Logger.warn` 錯誤地使用 `console.error` 的問題，恢復了正確的警告級別日誌記錄。

### 🏗️ 架構改進

#### 統一常量配置系統建立

- **新增配置模組目錄**：創建 `scripts/config/` 集中管理所有常量
  - `constants.js`：通用靜態常量（圖片驗證、內容質量、Notion API、日誌級別）
  - `selectors.js`：DOM 選擇器配置（封面圖、文章區域、CMS 內容、排除區域）
  - `patterns.js`：正則表達式模式配置（列表處理、圖片屬性、佔位符）
  - `features.js`：功能開關配置（核心功能、性能優化、實驗性功能）
  - `env.js`：環境檢測工具（運行環境、開發/生產模式）
  - `index.js`：統一導出入口
  - `README.md`：完整使用文檔和遷移計畫

### 📋 設計策略

#### 註釋同步策略

- **保留配置模組作為參考**：作為單一真實來源（Single Source of Truth）
- **暫時保留重複定義**：在傳統腳本中保留常量，添加註釋指向配置模組
- **制定5階段遷移計畫**：逐步採用 ES6 模組系統
  - 階段 1：建立配置模組 ✅
  - 階段 2：測試環境遷移
  - 階段 3：工具模組遷移
  - 階段 4：主腳本遷移
  - 階段 5：清理與優化

### 💡 設計原則

- **環境安全**：純 ES6 模組，不依賴 `window` 或 `document`
- **循環依賴預防**：配置模組作為依賴圖的葉子節點
- **多環境支持**：支持 Content Script、Background Script 和測試環境
- **功能開關**：支持漸進式發布和快速功能切換

### 🧪 驗證結果

- ✅ **874 個測試全部通過**（100% 通過率）
- ✅ **Lint 檢查通過**（0 錯誤，341 警告為既有問題）
- ✅ **構建驗證成功**（dist/highlighter-v2.bundle.js 正常生成）
- ✅ **零破壞性變更**（完全向後兼容）

### 📊 影響範圍

- **用戶體驗**：無變化，透明升級
- **功能**：完全兼容，無破壞性變更
- **可維護性**：大幅提升，為未來 ES6 模組化遷移奠定基礎
- **向後兼容**：✅ 完全兼容 v2.13.1

---

## v2.13.2 - 2025-12-05

### ♻️ 代碼重構

#### 圖片驗證邏輯統一

- **統一驗證入口**：將分散在 `AttributeExtractor`、`FallbackStrategies` 和 `background.js` 中的圖片驗證邏輯統一收斂至 `scripts/utils/imageUtils.js`。
- **相對路徑支持**：`ImageUtils.cleanImageUrl` 與 `isValidImageUrl` 新增對相對路徑（如 `/images/photo.jpg`）的完整支持，修復了部分網站圖片無法提取的問題。
- **消除重複代碼**：移除 `background.js` 中冗餘的 URL 清理與驗證邏輯，改為直接調用 `ImageUtils`，提升維護性。
- **測試覆蓋**：更新並通過所有相關單元測試，確保重構不影響現有功能。

---

## v2.13.1 - 2025-12-01

### ⚡ 效能優化

#### 標註工具按需注入

- **移除自動注入**：從 `manifest.json` 的 `content_scripts` 中移除 `dist/highlighter-v2.bundle.js` 的自動注入
  - 標註工具改為只在用戶需要時透過 `background.js` 程式化注入
  - 減少不必要的資源消耗，提升頁面載入效能
  - 避免在所有網頁自動載入 15KB 的標註腳本
- **保留程式化注入**：現有的 5 個注入觸發點完全保留
  - 用戶點擊「開始標註」按鈕
  - 頁面有保存的標註時自動恢復
  - Notion 頁面被刪除時清除標註
  - 提取內容時收集標註
  - 清除頁面標註時
- **向後兼容**：功能完全不受影響，用戶無感知升級

### 📊 效能提升

- **記憶體優化**：未使用標註功能的頁面不再載入標註腳本（節省 ~15KB）
- **頁面載入速度**：減少不必要的腳本載入時間
- **資源使用**：只在需要時才注入和初始化標註工具

### 🧪 測試驗證

- ✅ 所有 78 個測試套件通過（100% 通過率）
- ✅ ESLint 檢查通過，無新增警告
- ✅ 功能驗證：標註創建、恢復、清除、同步等功能全部正常

### 🛡️ 風險控制

- **零功能變更**：所有標註功能保持不變
- **完全向後兼容**：與 v2.13.0 完全兼容
- **回滾計劃**：如有問題可立即恢復自動注入

---

## v2.13.0 - 2025-11-30

### ✨ 重大更新

#### 標註工具欄模組化完成

- **全面模組化**：完成標註工具欄的 ES6 模組化重構，徹底解決雙重注入衝突問題。
- **架構優化**：將單一巨大的 `highlighter-v2.js` 拆分為結構清晰的模組化組件。
- **遺留代碼處理**：將舊版 `scripts/highlighter-v2.js` 重命名為 `scripts/highlighter-v2.legacy.js`，保留作為參考。

### 🐛 Bug 修復

#### 腳本注入與運行時優化

- **冗餘注入修復**：移除 `background.js` 中 `collectHighlights` 和 `clearPageHighlights` 的冗餘腳本注入，消除潛在衝突。
- **runtime.lastError 修復**：修正消息監聽器的響應邏輯，確保只在實際發送響應時返回 `true`，消除控制台警告。
- **初始化邏輯增強**：優化 `HighlighterV2` 的初始化檢查，防止在未就緒狀態下調用 API。

### 📝 文檔與維護

#### 已知限制說明

- **CSP 兼容性**：確認部分採用嚴格 Content Security Policy (CSP) 的網站（如 latepost.com）可能無法使用標註功能。這是由於網站安全策略限制了擴展腳本的執行，屬於已知限制。

### 🧪 測試驗證

- **單元測試**：全項目 2253 個測試通過 (100% 通過率)。
- **E2E 測試**：除已知 CSP 限制網站外，主要功能驗證通過。

---

## v2.12.0 - 2025-11-22

### 🐛 Bug 修復

#### HighlightManager 穩定性修復

- **Highlight API 兼容性**：修復 `'Highlight' is not defined` 錯誤，增加對原生 Highlight API 的安全檢查與回退機制。
- **Chrome API 安全存取**：修復 `chrome` 未定義錯誤，使用 `getSafeExtensionStorage` 確保在非擴充功能環境下的安全性。
- **無限循環修復**：修復 `getNodePath` 在處理無父節點的文字節點時可能導致的無限循環問題。

#### 代碼驗證與規範

- **URL 驗證優化**：修復 `isValidUrl` 中的 `void` 運算符使用及未使用的 `URL` 物件實例化警告。
- **ESLint 警告修復**：修復多處 `this` 上下文使用警告（`HighlightManager`、`PerformanceBenchmark`）。

### 🛡️ 安全性增強

#### 防禦性編程

- **Highlight API 防護**：增強對 `window.Highlight` 的安全檢查，防止第三方腳本污染導致的安全風險。
- **Storage API 存取控制**：強化 `chrome.storage` 的存取限制，確保僅在受信任的擴充功能環境中執行。

### ♻️ CI/CD 改進

#### Release Workflow 優化

- **流程整合**：合併 GitHub Release 創建步驟，減少代碼重複。
- **Context Access 修復**：修復 workflow 中的 context access 警告，提升流程穩定性。

### 🔧 代碼品質

- **Rollup 配置清理**：移除 `rollup.config.mjs` 中未使用的變數。
- **全面警告修復**：系統性修復 codebase 中的各類 ESLint 警告，提升代碼整潔度。

---

## v2.11.6 - 2025-11-22

### 🔧 技術改進

#### ES6 模組化重構

- **Highlighter 模組化**：將 `highlighter-v2.js` (2,425 行) 重構為 9 個獨立 ES6 模組
  - **核心模組**：`Range.js`、`HighlightManager.js`
  - **工具模組**：`color.js`、`dom.js`、`validation.js`、`path.js`、`textSearch.js`、`domStability.js`
  - **入口模組**：`index.js`（整合所有模組並設置全局 API）
  - 位置：`scripts/highlighter/`（新目錄結構）
  - 原始文件保留（向後兼容）

#### Terser 壓縮優化

- **Rollup 構建配置**：新增 `rollup.config.mjs` 配置文件
  - 工具：**Rollup** + **@rollup/plugin-terser**
  - 環境區分：`NODE_ENV=production` 觸發壓縮
  - Source map：開發環境 inline，生產環境 external
- **壓縮配置**：
  - 保留 `console.log`（調試用）
  - 移除 `debugger` 和註釋
  - 保留關鍵全局變數（`HighlighterV2`、`Logger`、`StorageUtil`）
- **壓縮成果**：
  - Bundle 大小：166KB → **15KB** (-91%)
  - gzip 預估：~40KB → ~5-7KB (-85%)
  - Source map：70KB (external)
  - Build 時間：~216ms (生產)、~55ms (開發)

#### NPM Scripts 新增

- `build:prod`: 生產環境構建（壓縮）
- `build:watch`: 開發環境實時編譯
- `dev`: 開發模式別名

### 🐛 Bug 修復

#### Badge 顯示問題

- **問題**：頁面重載後 Extension badge (✅) 不自動顯示
- **原因**：重構時遺漏 `chrome.runtime.sendMessage({action: 'checkPageStatus'})` 調用
- **修復**：在 `index.js` 初始化後添加 checkPageStatus 通知
- **驗證**：手動測試通過，badge 立即顯示

### 🧪 測試與驗證

#### 單元測試

- ✅ **138/138 測試通過**（100% 通過率）
- ✅ 所有 highlighter 相關測試覆蓋
- ✅ 執行時間：~3.8 秒

#### 系統化遺漏檢測

- **Chrome API 調用對比**：
  - `sendMessage`: 7 處（舊）→ 2 處（新）+ 5 處 UI 功能（保留）
  - `storage`: StorageUtil 處理
  - `addEventListener`: 核心事件已提取
- **結論**：僅 1 個遺漏（badge 更新），已修復 ✅

#### 手動測試（Chrome Extension）

- ✅ 標註功能正常（創建、刪除、顏色切換）
- ✅ 重載後標註保留
- ✅ 同步到 Notion
- ✅ Badge 自動顯示
- ✅ 壓縮版本運作正常
- ✅ Console 無錯誤

### ♻️ CI/CD 改進

#### GitHub Actions 更新

- **test.yml** 新增生產構建驗證步驟：
  - 執行 `npm run build:prod`
  - 驗證 bundle 文件存在
  - 檢查 bundle 大小 < 50KB
  - 確保壓縮有效

### 📚 文檔更新

#### 新增文檔

- **重構最佳實踐指南**（`internal/guides/REFACTORING_BEST_PRACTICES.md`）：
  - 6 條核心規則
  - 完整檢查清單（重構前/中/後）
  - 實用工具腳本
  - 基於真實案例（highlighter 重構）
- **經驗教訓文檔**（artifacts/`refactoring_lessons_learned.md`）
- **遺漏檢測報告**（artifacts/`refactoring_gap_analysis.md`）
- **Release Notes v2.11.6**（artifacts/`release_notes_v2.11.6.md`）

#### 更新文檔

- **README.md**：
  - 添加構建流程說明
  - 更新項目結構（反映模組化）
  - 新增開發命令參考
- **AGENTS.md**：
  - 添加「大型代碼重構」章節
  - 6 條核心規則快速參考

### 📁 文件變更

#### 新增

- `rollup.config.mjs` - Rollup 配置
- `scripts/highlighter/` - 9 個模組文件
- `dist/highlighter-v2.bundle.js` - 壓縮版 bundle (15KB)
- `dist/highlighter-v2.bundle.js.map` - Source map
- `internal/guides/REFACTORING_BEST_PRACTICES.md` - 重構指南

#### 修改

- `manifest.json` - 指向 `dist/highlighter-v2.bundle.js`
- `package.json` - 新增 build scripts
- `.github/workflows/test.yml` - 添加 build 驗證
- `README.md` - 更新開發說明和項目結構
- `AGENTS.md` - 添加重構章節

#### 保留（向後兼容）

- `scripts/highlighter-v2.js` - 原始文件未刪除

### 📊 影響範圍

- **用戶體驗**：無變化，透明升級
- **功能**：完全兼容，無破壞性變更
- **性能**：初次載入時間減少 ~58%（166KB → 15KB）
- **可維護性**：大幅提升，模組化設計
- **向後兼容**：✅ 完全兼容 v2.11.5

### 🛡️ 安全性

- **無安全變更**：功能邏輯完全相同
- **代碼品質**：通過所有測試和 lint 檢查

---

## v2.11.5 - 2025-11-20

### ✨ 新功能

- **Popup 腳本注入強化**：在內容提取前主動注入 `utils.js`，確保工具函數可用，並新增腳本注入錯誤處理機制。
- **彈窗對話框改進**：將原生 `confirm` 對話框替換為自訂模態對話框，提升用戶體驗與視覺一致性。
- **日誌功能開關**：新增日誌功能的開關檢查，支援手動啟用日誌記錄和開發模式標記。

### 🐛 Bug 修復

#### 測試與日誌系統

- **Logger 模擬邏輯修正**：修正 Logger 模擬邏輯，確保測試環境中的 console 使用符合預期。
- **測試環境增強**：添加緩存控制函數以支持測試隔離和性能優化。
- **Node.js 20.x 相容性**：調整測試環境變數及配置以避免內存問題，優化 Jest 參數以改善性能和穩定性。
- **背景日誌發送邏輯**：改進背景日誌發送邏輯，消費 lastError 以避免未處理錯誤警告。
- **日誌旗標處理**：正規化日誌啟用旗標處理，確保字串 'false' 被正確忽略。

#### 圖片處理與 URL 驗證

- **AttributeExtractor URL 驗證**：修正 `_isValidImageUrl` 內使用 `new URL(url)` 僅為副作用的寫法，若宿主環境支援 `URL.canParse` 會優先使用零配置驗證，僅在必要時建立 `URL` 實例並保留相對路徑容錯，避免 ESLint `no-new` 類警告。
- **ImageExtractor 回退策略載入**：新增 `resolveFallbackStrategies()`，優先透過 CommonJS 取得 `FallbackStrategies`，若模組尚未注入則回退至 `globalThis/window`，並受 `enableFallbacks` 控制，解決 `'FallbackStrategies' is not defined` 的 ESLint 警告且避免背景/picture/noscript 提取在不同環境下失效。
- **SrcsetParser 解析優化**：優化圖片提取流程並擴充全域回退策略。
- **圖片提取方法靜態化**：將 `_extractFromSrcset` 和 `_extractFromAttributes` 方法改為靜態方法，並更新測試用例以反映此變更。

#### 其他修復

- **正則表達式修正**：修正正則表達式以支持全局和Unicode標誌。
- **遷移狀態存取**：修正存取 `chrome.storage` 的方式，確保在 Chrome 環境中正確讀取和設置遷移狀態。
- **變數初始化**：將多個變數初始化為 null，避免未定義錯誤，提高代碼穩定性。
- **日誌別名修正**：修正日誌別名以避免與全域變量衝突，並簡化代碼結構 (#112)。
- **錯誤處理與重試邏輯**：修正重試判斷函數的調用方式，確保正確上下文；簡化錯誤處理和重試管理器中的方法調用。

### ♻️ 代碼重構

#### 測試代碼優化

- **模態對話框事件監聽器**：簡化清除標註的模態事件監聽器，優化事件處理邏輯。
- **DOM 操作錯誤處理**：移除 expand helper 中 DOM 操作周圍不必要的 try/catch 塊（保留點擊事件）。
- **空函數註釋**：在測試設置和 console mocks 的空函數體中添加 `/* no-op */` 註釋以提高清晰度。
- **錯誤變數處理**：在測試 catch 塊中忽略未使用的錯誤變數，並清理測試全域指令。
- **測試清理邏輯**：簡化測試清理間隔清除邏輯，改用可選鏈接操作符。
- **測試代碼風格**：更新測試文件以使用模板字面量和簡潔方法語法。

#### 代碼結構優化

- **URL 變數命名**：更新 URL 正規化邏輯中的變數名稱，改善代碼可讀性。
- **URL 正規化日誌**：改善 URL 正規化錯誤日誌記錄和代碼風格。
- **靜態方法調用**：使用簡寫語法和靜態方法調用，簡化代碼結構。
- **批處理邏輯優化**：優化批處理邏輯，修正 batchQueue 提取方式並新增 destroy() 方法以清理資源。
- **性能優化器資源管理**：移除預熱超時控制欄位，優化性能優化器的資源管理。
- **Notion 區塊驗證**：明確檢查 Notion 區塊內容字段的存在性，優化驗證邏輯。

### 🧪 測試改進

- **高級工具測試更新**：更新 advanced utility tests，提升測試覆蓋率。
- **URL.canParse 測試**：新增 `URL.canParse` 快速路徑的單元測試，覆蓋成功與回退兩種分支，確保在不同瀏覽器與 JSDOM 環境皆能保持既有行為。
- **整合測試**：新增實驗性整合測試，暫時忽略有問題的單元測試。
- **批處理測試**：新增具備重試與失敗統計的批處理封裝測試，驗證其功能。
- **遷移方法測試**：將 migrateSpanToRange 方法設為靜態，並更新相關調用與測試。

### 📦 依賴更新

- **chore(deps-dev)**: bump jest-environment-jsdom from 29.7.0 to 30.2.0
- **chore(deps-dev)**: bump puppeteer from 24.25.0 to 24.30.0
- **chore(deps-dev)**: bump webpack-cli from 5.1.4 to 6.0.1
- **chore(deps)**: bump js-yaml
- **chore(deps)**: bump actions/download-artifact from 4 to 6
- **chore(deps)**: bump actions/github-script from 7 to 8

### 🔧 維護與配置

- **Dependabot 配置**：新增 dependabot 配置文件以自動管理依賴更新。
- **ESLint 配置簡化**：移除未使用的 ESLint 配置，簡化代碼結構 (#110)。
- **ESLint 命令優化**：移除 eslint 命令中明確的 `.js` 擴展名。

### 📊 影響範圍

- **穩定性提升**：改善測試環境穩定性，提升 Node.js 20.x 相容性。
- **向後兼容**：完全兼容 v2.11.4 及更早版本。
- **開發體驗**：優化日誌系統、錯誤處理與測試流程，提升開發效率。
- **代碼品質**：大幅度代碼重構與靜態分析警告修復，提升可維護性。

---

## v2.11.4 - 2025-11-15

### 🐛 Bug 修復

#### 防止重複注入錯誤

- **修復 `safeLogger` 重複宣告錯誤**：解決 `Uncaught SyntaxError: Identifier 'safeLogger' has already been declared` 錯誤
  - 將防重複注入檢查提前到檔案開頭，在 `safeLogger` 宣告之前執行
  - 使用 `window.__NOTION_UTILS_LOADED__` 標記追蹤載入狀態
  - 確保 `utils.js` 被重複注入時不會產生語法錯誤
  - 提升在複雜頁面環境下的腳本注入穩定性

### 📊 影響範圍

- **穩定性提升**：解決在某些網站上可能出現的腳本重複注入錯誤
- **向後兼容**：完全兼容 v2.11.3 及更早版本
- **用戶體驗**：減少控制台錯誤訊息，提升擴充功能可靠性

### 🛡️ 安全性

- **防禦性編程**：增強對重複腳本注入的容錯能力
- **錯誤預防**：在問題發生前就阻止重複宣告

### 🧪 測試

- ✅ 所有 608 個 utils 相關測試通過（100% 通過率）
- ✅ ESLint 檢查通過，無新增警告
- ✅ 重複載入測試驗證通過

---

## v2.11.3 - 2025-11-15

### 🐛 Bug 修復

#### 遷移系統錯誤處理增強

- **錯誤頁面遷移容錯**：修復 `migrateLegacyHighlights` 函數中的 `Frame with ID 0 is showing error page` 錯誤
  - 在遷移前檢查標籤頁有效性，跳過錯誤頁面（`chrome-error://`）
  - 改善 catch 區塊錯誤處理，使用 `isRecoverableInjectionError` 判斷可恢復錯誤
  - 可恢復錯誤（標籤已關閉、錯誤頁面等）降級為警告，避免中斷流程
  - 僅對非可恢復錯誤輸出完整錯誤日誌
  - 提升在網路錯誤、標籤關閉等場景下的穩定性

### 📊 影響範圍

- **穩定性提升**：用戶在錯誤頁面或標籤關閉時不再看到錯誤提示
- **向後兼容**：完全兼容 v2.11.2 及更早版本
- **用戶體驗**：減少不必要的錯誤訊息，提升操作流暢度

### 🛡️ 安全性

- **防禦性編程**：增強對異常標籤頁狀態的容錯能力
- **錯誤分類**：明確區分可恢復錯誤與嚴重錯誤

---

## v2.11.2 - 2025-11-15

### 🐛 Bug 修復

#### 腳本注入錯誤處理增強

- **錯誤頁面注入容錯**：修復 `Frame with ID 0 is showing error page` 錯誤導致的流程中斷
  - 擴展 `isRecoverableInjectionError()` 函數，新增錯誤頁面相關模式識別
  - 新增模式：`is showing error page`、`ERR_NAME_NOT_RESOLVED`、`ERR_CONNECTION_REFUSED`、`ERR_INTERNET_DISCONNECTED`、`ERR_TIMED_OUT`、`ERR_SSL_PROTOCOL_ERROR`
  - 錯誤自動降級為警告而非異常，避免中斷用戶操作流程
  - 改善在網路錯誤、DNS 解析失敗、SSL 錯誤等場景下的穩定性

### 📊 影響範圍

- **穩定性提升**：用戶在錯誤頁面點擊擴展圖標不再看到錯誤提示
- **向後兼容**：完全兼容 v2.11.1 及更早版本
- **用戶體驗**：減少不必要的錯誤訊息，提升操作流暢度

### 🛡️ 安全性

- **防禦性編程**：增強對異常頁面狀態的容錯能力
- **錯誤分類**：明確區分可恢復錯誤與嚴重錯誤

---

## v2.11.1 - 2025-11-14

### 🔧 代碼品質改進

#### imageUtils.js 重構與安全增強

- **函數模組化重構**：
  - 將 `extractImageSrc` 大型函數（93行）拆分為 6 個獨立子函數
  - `extractFromSrcset()`：處理響應式圖片（srcset 屬性）
  - `extractFromAttributes()`：遍歷懶加載與標準屬性
  - `extractFromPicture()`：處理 `<picture>` 元素
  - `extractFromBackgroundImage()`：提取 CSS 背景圖片
  - `extractFromNoscript()`：回退到 noscript 標籤
  - 提升可讀性、可測試性與可維護性

- **魔術數字重構**：
  - 抽取硬編碼常數為具名常數 `IMAGE_VALIDATION_CONSTANTS`
  - `MAX_URL_LENGTH: 1500`：Notion API URL 長度限制
  - `MAX_QUERY_PARAMS: 10`：查詢參數數量上限
  - `MAX_BG_URL_LENGTH: 2000`：背景圖片 URL 長度限制（ReDoS 防護）
  - 便於未來調整與配置管理

- **ReDoS 安全修復**：
  - 為 `extractFromBackgroundImage()` 添加 URL 長度檢查（2000 字符上限）
  - 防止超長 URL 觸發正則表達式回溯攻擊（ReDoS）
  - 保護擴充功能免受惡意構造的背景圖片 URL 攻擊

- **日誌規範合規**：
  - 移除生產環境 `console.warn`（第 156 行）
  - 改用 `Logger.warn()` 統一日誌系統
  - 符合專案日誌規範要求

### 🧪 測試覆蓋率提升

#### 新增邊界條件測試套件

- **新增測試文件**：`tests/unit/imageUtils.boundary.test.js`（55 個測試用例）
- **測試覆蓋範圍**：
  - **URL 長度邊界**：1500 字符臨界值測試
  - **查詢參數邊界**：10 個參數臨界值測試
  - **畸形輸入處理**：空字符串、特殊字符、無效格式
  - **srcset 解析邊界**：無描述符、混合條目、data: URL 過濾
  - **多層回退策略**：srcset → 屬性 → picture → background → noscript
  - **ReDoS 防護驗證**：超長 URL 拒絕測試
  - **空值與異常處理**：null、undefined、非字符串輸入
  - **整合測試**：完整回退鏈驗證

- **測試結果**：
  - ✅ 55/55 測試用例通過（100% 通過率）
  - ✅ 全專案 72 測試套件，1893 測試（100% 通過率）
  - ✅ 執行時間：46.7 秒

### 📊 影響範圍

- **功能無變更**：本次為程式碼品質提升，不影響用戶可見功能
- **向後兼容**：完全兼容 v2.11.0 及更早版本
- **安全增強**：修復 ReDoS 安全風險
- **可維護性提升**：函數模組化、常數化、測試覆蓋完整

### 🛡️ 安全性

- **ReDoS 防護**：防止正則表達式拒絕服務攻擊
- **輸入驗證增強**：嚴格的 URL 長度與格式檢查
- **日誌安全**：統一日誌系統，避免敏感信息洩露

---

## v2.11.0 - 2025-11-14

### ✨ 新功能

- **擴展保存目標選擇**：資料來源選擇器現在支援同時搜尋頁面（page）和數據庫（data_source），並智能排序優先顯示工作區直屬項目。
- **類型標識與視覺層級**：添加類型圖標（📊 數據庫、📄 頁面）和工作區標記，幫助用戶快速識別保存目標的類型和位置。
- **智能結果限制**：從顯示 100 個優化為 50 個最相關的保存目標，減少選擇過載。
- **Leaf Page 智能識別**：使用啟發式規則自動標記可能的 leaf pages（無子項頁面），並添加綠色 "📄 Leaf" 標記。
- **Parent 路徑顯示**：顯示每個項目的父級類型（📁 工作區、📄 子頁面、📊 資料庫項目），幫助用戶理解項目位置。

### 🔧 改進（v2 優化）

- **優化排序邏輯**：
  - ①數據庫優先（所有數據庫，不限 parent 類型）
  - ②頁面按啟發式排序：page_id parent 優先（更可能是 leaf） > data_source_id parent > workspace parent（更可能是容器）
  - ③移除最近編輯時間排序，避免干擾 leaf page 篩選
- **增加顯示數量**：從 50 個增加到 100 個保存目標，充分利用 Notion API 限制。
- **API 效率優化**：移除 filter 參數，單次 API 調用獲取所有類型，客戶端智能篩選（性能影響 < 5ms）。
- **向後兼容性**：完全兼容現有 data_source 選擇，自動默認未指定類型為 data_source。

### 🔄 改進（v3 優化：容器頁面優先）

- **反轉頁面篩選邏輯**：
  - 優先顯示容器頁面（workspace 直屬頁面），適合作為保存網頁的目錄
  - 排除深層頁面（page_id parent），這些通常是已保存的網頁內容
  - 更符合實際使用場景：頂層容器 > 數據庫子項 > 深層子頁面
- **智能容器識別**：
  - 將 `isLikelyLeafPage()` 改為 `isLikelyContainerPage()`，反轉啟發式邏輯
  - workspace 直屬頁面更可能是容器/目錄（準確度 70-80%）
  - 深層頁面（page_id parent）更可能是已保存的內容
- **優化排序規則（v3）**：
  - ①數據庫優先（所有數據庫，不限 parent）
  - ②容器頁面優先（workspace parent > data_source_id parent > page_id parent）
  - ③移除時間排序，確保分類清晰
- **視覺標記更新**：
  - "📄 Leaf" 標記改為 "📁 容器" 標記（橙色 #fef5e7）
  - 更清晰地標識適合作為保存目錄的頁面

### 🐛 Bug 修復

- **修正 parent 類型顯示**：
  - 添加對 `database_id` 類型的支持（舊版 API 命名）
  - 添加對 `block_id` 類型的支持（顯示為「🧩 區塊項目」）
  - 改進未知類型的顯示：從「❓ 未知」改為「❓ 其他 (類型名稱)」
  - 添加日誌記錄未知類型，便於調試和追蹤
- **解決「未知」顯示問題**：
  - 有些數據庫的 parent 類型為 `database_id` 或 `block_id`
  - 現在這些類型都有明確的圖標和名稱顯示
  - 提升用戶體驗，減少困惑

### 🚀 改進（v4.4 優化：基於 schema/properties 精確篩選）

- **精確識別保存目的地數據庫**：
  - 新增 `hasUrlProperty()` 函數，檢查數據庫 schema 是否有 URL 屬性
  - 有 URL 屬性的數據庫：很可能用於保存網頁（如「待辦」、「稍後閱讀」）
  - 準確度：90%+（基於 schema，非啟發式）
- **排除已保存網頁**：
  - 新增 `isSavedWebPage()` 函數，識別已保存的網頁
  - 判斷依據：object=page 且 parent=data_source_id 且 properties.URL 存在
  - 減少干擾項，提升列表清晰度
- **重新設計5層優先級**：
  - 第1層：**workspace 頁面**（幾乎必定是分類頁面）⭐ 提升到首位
  - 第2層：**有 URL 的數據庫**（保存網頁的目的地）⭐ 新標準
  - 第3層：**分類頁面**（page_id parent 的頁面）
  - 第4層：**其他數據庫**（無 URL 屬性的數據庫）
  - 第5層：**其他頁面**（保持原有）
- **性能影響評估**：
  - 無額外 API 調用（Search API 已返回 schema 和 properties）
  - schema 檢查：< 0.5ms（遍歷 properties 對象）
  - 總處理時間：< 3ms（與 v4.3 相同）
- **準確度提升**：
  - URL 數據庫識別：90%+（基於實際 schema）
  - 已保存網頁排除：70-80%（properties 可能不完整）
  - 分類頁面識別：保持 70-80%（啟發式）

### 🚀 改進（v4.3 優化：調整優先級，移除時間排序）

- **分類頁面優先級提升**：
  - 將分類頁面從第4層提升到第3層（優先於其他數據庫）
  - 分類頁面位置：從 40-70位 → 30-50位
  - 查找速度進一步提升 30%
- **其他數據庫優先級降低**：
  - 從第3層降低到第4層（低於分類頁面）
  - 原因：分類頁面更常用於組織內容，應優先顯示
- **完全移除時間排序**：
  - 移除所有層級的時間排序（第3、4、5層）
  - 原因：時間排序會干擾分類頁面的查找
  - 保持 API 返回順序，提供更穩定的顯示結果
- **優化後的5層優先級**：
  - 第1層：workspace 數據庫（保持不變）
  - 第2層：workspace 頁面（保持不變）
  - 第3層：**分類頁面**（page_id parent）⭐ 從第4層提升
  - 第4層：**其他數據庫**（所有非 workspace 的數據庫）⭐ 從第3層降低
  - 第5層：其他頁面（data_source_id parent，保持不變）
- **日誌順序優化**：
  - 更新日誌輸出順序，反映新的優先級
  - 便於追蹤分類頁面的優先顯示效果

### 🚀 改進（v4.2 優化：5層優先級，識別分類頁面）

- **識別分類頁面**：
  - 新增「分類頁面」概念：parent 為 page_id 的頁面（如「電影」、「閱讀」等）
  - 這些頁面介於 workspace 頁面和深層頁面之間，通常作為內容分類使用
  - 例如：「電影」頁面（parent: 「文化藝術」）→ 下有「法國電影」、「中國電影」等子頁面
- **5層優先級分層**：
  - 第1層：workspace 數據庫（最優先）
  - 第2層：workspace 頁面（次優先）
  - 第3層：其他數據庫（補充，按時間排序）
  - 第4層：**分類頁面**（page_id parent，可能有子項）⭐ 新增
  - 第5層：其他頁面（data_source_id parent，最低優先級）
- **視覺標記增強**：
  - 新增 "🗂️ 分類" 綠色標記（#e6f4ea）
  - 幫助用戶快速識別分類頁面
  - 與 "📁 容器"（橙色）和 "工作區"（藍色）標記區分
- **啟發式判斷**：
  - 新增 `isLikelyCategoryPage()` 函數
  - 使用 parent.type === 'page_id' 作為判斷依據
  - 準確度：70-80%（無需額外 API 調用）
- **優先級提升效果**：
  - 分類頁面從第5層（80-100位）提升到第4層（40-70位）
  - 大幅提升分類頁面的可見性和可訪問性
  - 例如「電影」頁面現在會出現在前半部分

### 🚀 改進（v4.1 優化：4層優先級，保留所有項目）

- **明確的4層優先級分層**：
  - 第1層：workspace 數據庫（最優先，適合作為資料庫條目保存）
  - 第2層：workspace 頁面（次優先，適合作為容器目錄保存）
  - 第3層：其他數據庫（補充，包括所有非 workspace 的數據庫，按最近編輯時間排序）
  - 第4層：其他頁面（最低優先級，包括所有非 workspace 的頁面，按最近編輯時間排序）
- **包容性過濾策略**：
  - 保留所有數據庫（data_source 類型），無論 parent 類型
  - 保留所有頁面（page 類型），無論 parent 類型
  - 不排除任何項目，確保用戶能找到所有可能的保存目標
  - 通過優先級分層實現智能排序，workspace 項目始終在前
- **智能時間排序**：
  - 僅對第3層（其他數據庫）和第4層（其他頁面）使用時間排序
  - 第1、2層保持 API 返回順序，確保 workspace 項目始終在前
  - 性能影響：< 3ms（客戶端分層和排序）
- **修正邏輯問題（v4 → v4.1）**：
  - 移除 `isLeafPage()` 函數（會錯誤排除 data_source_id parent 的數據庫）
  - data_source 類型永遠不排除（無論 parent 是什麼）
  - page 類型也不排除（無法通過 parent type 精確判斷是否有子項）
  - 通過優先級分層代替排除策略，更符合實際需求

### 📖 文檔改進

- **用戶指南新增**：添加「如何獲取 Notion ID」完整章節
  - 📄 Page ID 獲取方法（從 URL 和分享連結）
  - 📊 Database ID 獲取方法（全頁面模式和分享連結）
  - 🛠️ 手動輸入 ID 的使用說明
  - ❓ Page 和 Database 的區分指南
- **設定頁面優化**：
  - 在 "Notion Data Source ID" 欄位下方添加友好提示
  - 提供指向用戶指南的快速連結
  - 說明手動輸入 ID 作為下拉選單和搜尋的備選方案

### 🛠️ 技術改進

- **支援 page 類型 parent**：background.js 現在支援將內容保存為頁面的子頁面（page_id）或數據庫條目（data_source_id）。
- **類型持久化**：新增 `notionDataSourceType` 存儲字段，記錄選擇的保存目標類型。
- **啟發式判斷函數演進**：
  - v2：`isLikelyLeafPage()` 判斷深層頁面（page_id parent）
  - v3：改為 `isLikelyContainerPage()` 判斷容器頁面（workspace parent）
  - v4：新增 `isLeafPage()` 嘗試排除 leaf pages（後發現邏輯錯誤）
  - v4.1：移除 `isLeafPage()`，保留 `isLikelyContainerPage()` 用於視覺標記
  - v4.2：新增 `isLikelyCategoryPage()` 識別分類頁面（page_id parent）
  - v4.4：新增 `hasUrlProperty()` 和 `isSavedWebPage()` 基於 schema/properties 判斷
- **篩選邏輯演進（v4.4）**：
  - 基於 schema/properties 精確分類，不再僅依賴啟發式規則
  - 新增 URL 數據庫識別（檢查 schema 中的 URL 類型屬性）
  - 新增已保存網頁排除（檢查 properties 中的 URL 屬性）
  - 重新設計優先級：workspacePages → **urlDatabases** → categoryPages → otherDatabases → otherPages
  - workspace 頁面提升到第1層（最高優先級）
  - 性能保持：< 3ms（schema/properties 檢查開銷可忽略）
- **改進日誌（v4.4）**：
  - 更新日誌輸出，反映新的5層結構
  - 添加「URL 數據庫」統計
  - 添加「排除已保存網頁」計數
  - 便於追蹤精確篩選的效果
- **視覺系統擴展**：
  - 新增 `.category-badge` CSS 類（綠色系）
  - 與現有的 `.workspace-badge` 和 `.container-badge` 形成完整體系
  - 三色標記系統：藍色（workspace）、橙色（容器）、綠色（分類）

### 🛡️ 錯誤處理與腳本注入

- **錯誤處理模組動態載入**：為錯誤處理模組與 RetryManager 增加動態載入與初始化守衛，避免在非預期環境中載入失敗，並統一錯誤日誌格式與統計欄位。
- **重構重試邏輯**：將可重試 HTTP 狀態碼與網路錯誤判斷提取為常數與輔助函數，強化邊界檢查並簡化 `_shouldRetryNetworkError`、`ErrorHandler` 的分支邏輯。
- **ScriptInjector 輔助函數**：新增腳本注入輔助函數，專門處理 `chrome-extension://` 等受限網址與注入失敗情境，提供更安全的錯誤處理與一致的日誌輸出（PR #101）。

### 🧪 測試與代碼品質

- **高亮模組重構**：將多個高亮相關方法（如 `deserializeRange`、HighlightManager 方法）改為靜態方法，移除多餘的確認對話框，並新增 `isValidNonEmptyString` 工具函數，用於嚴格驗證非空字串輸入，提升可重用性與可測性。
- **PerformanceOptimizer 與工具函數清理**：將 `_analyzeSystemPerformance` 等方法簡化為同步/靜態實作，移除不必要的 async 標記與全域 Logger 依賴，並以 Promise 包裝獲取 API Key 等流程，使 async/await 調用鏈更一致。
- **DeepSource 警告修復**：
  - 移除多餘的錯誤參數與空 catch 變數，統一錯誤物件日誌格式（包含原始 error），避免靜態分析警告。
  - 使用物件屬性速記語法、調整 `use strict` 位置與輔助函數命名（例如清理圖片 URL 函數），提升代碼可讀性與一致性。
- **內容與測試細節調整**：更新標註恢復腳本與頁面複雜度檢測的錯誤處理邏輯，修正覆蓋率保存流程的小問題，並統一測試文件中的中文註釋用詞，讓測試描述更清晰易懂。

## v2.10.3 - 2025-11-10

### ✨ 新功能

- **存儲使用儀表板**：Options 頁面新增 `getStorageUsage`，即時計算 chrome.storage.local 的用量、標註頁面與設定數量，並提供刷新按鈕與風險提示，方便在清理前評估空間狀況。

### 🔄 穩定性與韌性

- **CMS 與清單回退**：新增 `cachedQuery`、Drupal/WordPress 感知的內容搜尋以及大型列表 fallback，並串接選擇性圖片擴展與批次處理，讓 WordPress、技術文件與 CLI 手冊在 Readability 失敗時仍能擷取正文與配圖。
- **非同步流程 Promise 化**：背景腳本、ScriptInjector 與 StorageUtil 移除多餘的 `async` 包裝，統一以 Promise 形式處理 chrome.storage 與腳本注入，並加入安全的 Logger 啟用守衛，降低未處理拒絕與 race condition。

### 🐛 Bug 修復

- **標註工具欄切換**：最小化按鈕改為依據當前狀態在展開/最小化之間切換，避免狀態不一致並修正 ESLint `no-unused-vars` 警告。
- **URL 與圖片清理**：`normalizeUrl`、`cleanImageUrl` 及圖片代理處理全面改用 `URL` 物件並在失敗時回傳 `null`，避免背景流程在遇到截斷或代理鏈接時崩潰。

### 🧪 測試與相容性

- 新增高亮工具欄狀態切換、StorageUtil、ScriptInjector、性能優化器與 Readability 回退等多組測試，確保 Promise 化調整與新回退流程皆有覆蓋並保持 100% 通過率。

## v2.10.2 - 2025-11-05

### 🐛 Bug 修復

- **空標註記錄處理**：當頁面無任何標註時，改為刪除 `highlights_*` 記錄而非保存空陣列，避免儲存空間被空資料佔用（`saveToStorage` 行為修正）。
- **Open in Notion 顯示條件**：優化按鈕顯示邏輯，只要頁面已保存即顯示，並為舊資料自動生成 `notionUrl` 回退。

### 🔄 穩定性與韌性

- **自動初始化體驗**：若偵測到已保存標註，頁面載入時自動初始化並在恢復完成後自動隱藏工具欄（用戶未主動展開時）。

### 🧪 測試與相容性

- **Highlight API 兼容性測試**：補齊 Highlight API 存在/不存在情境下的初始化行為測試。
- **存儲最佳化測試**：新增針對 `serializeRange` 不重複保存文本與遷移節省空間的驗證。

### 📌 影響

- 完全向後兼容 v2.10.1；改善長頁/動態頁中的工具欄穩定性，並降低空資料佔用儲存的風險。

## v2.10.1 - 2025-11-03

### 🐛 Bug 修復

#### 遷移系統穩定性改進

- **無縫遷移重試機制**：為舊版標註遷移功能增加重試邏輯，處理遷移過程中的錯誤並返回失敗結果，提升遷移成功率
- **變數初始化修復**：修復多個函數中的變數初始化問題，避免未定義錯誤
  - 初始化 `result` 變數在聲明時
  - 初始化 `blocks` 變數在使用前
  - 初始化回調變數為 null
- **錯誤處理優化**：將 StorageUtil 的錯誤處理從拋出異常改為返回拒絕的 Promise，提升錯誤處理一致性

#### 圖片驗證邏輯修復

- **緩存統計計算修正**：修復圖片 URL 驗證緩存的命中率計算邏輯，確保統計數據準確性
- **文本驗證邏輯改進**：增強文本範圍驗證，確保長度和內容匹配，並增強錯誤日誌記錄

#### DOM 穩定性優化

- **waitForDOMStability 方法同步化**：將方法從 async 轉為同步，提升性能並簡化邏輯
- **節點遍歷條件修正**：修復遍歷節點時的條件判斷，避免無效操作
- **MutationObserver 模擬優化**：移除不必要的變數並優化邏輯

### 🔧 代碼品質改進

#### 圖片驗證重構

- **LRU 緩存策略實現**：重構圖片 URL 驗證邏輯，增加 LRU 緩存策略並改進配置常量
- **配置常量優化**：增加配置常量並改進錯誤處理，提升代碼可維護性

#### 工具函數優化

- **clearHighlights 方法改進**：改進錯誤處理與性能，處理 undefined 輸入並優化清除操作
- **Logger 註解修正**：修正安全 Logger 的空函數註解，提升可讀性

#### 調試函數清理

- **維護函數移除**：移除清空圖片 URL 驗證緩存和獲取緩存統計信息的調試函數
- **代碼清理**：移除不必要的註解和空行，優化代碼可讀性

### ✨ 新功能

#### DOM 穩定性增強

- **waitForDOMStability 自訂化**：支援自訂容器和穩定性閾值，提供更靈活的 DOM 穩定性檢測
- **靜態方法優化**：將相關方法設為靜態，提升可用性和性能

#### API 兼容性增強

- **Highlight API 支持檢查**：增強對 Highlight API 的支持，添加兼容性測試和錯誤處理
- **Chrome API 回退處理**：增強 Chrome API 檢查，確保在 API 不可用時提供適當回退
- **樣式初始化改進**：添加 Highlight API 支持檢查及錯誤處理

#### ESLint 配置更新

- **全局變量配置**：更新 ESLint 配置，添加 Highlight 和 CSS 為全局變量

### 🧪 測試改進

#### Jest 配置優化

- **ES 模組轉換**：增加對 node_modules 中 ES 模組的轉換配置，提升測試兼容性

#### 測試實例加載修正

- **類實例化問題修復**：修正測試實例加載方式，避免類實例化問題
- **原始模組測試支持**：添加對原始模組的測試實例加載

### 🔄 效能改進

#### 日誌一致性優化

- **統一日誌記錄**：增強日誌一致性，重構性能優化器初始化邏輯

## v2.10.0 - 2025-10-31

### 🔧 版本管理改進

#### 版本對齊與硬編碼移除

- **版本統一**：將所有配置檔案和對外文檔的版本號統一對齊至 v2.10.0
  - 配置檔案（manifest.json、package.json）使用純數字格式「2.10.0」
  - 對外文檔和 UI 顯示統一使用「v2.10.0」格式（帶 v 前綴）
- **移除硬編碼**：清除所有 HTML 檔案中硬編碼的版本字串
  - help.html：移除 v2.9.10 硬編碼，改用 inline script 動態讀取版本
  - update-notification.html：移除 v2.9.9 硬編碼，由 JS 動態注入
  - update-notification.js：改善預設回退顯示，避免硬編碼舊版本
- **動態版本顯示**：所有對外顯示的版本號改為動態讀取 `chrome.runtime.getManifest().version`
  - 確保版本號始終與 manifest.json 保持同步
  - 降低未來版本更新時的維護成本

### ✨ 新功能

#### 內容質量評估系統

- **新增 `isContentGood` 函數**：智能評估擷取內容的質量，確保只保存高質量內容到 Notion
  - 實現多維度內容質量檢測（文本長度、連結密度、段落結構）
  - 自動過濾低質量或導航型頁面
  - 提升內容擷取準確性，減少雜訊內容
  - 新增 268 個單元測試覆蓋各種內容場景（[#68](https://github.com/cowcfj/save-to-notion/pull/68)）

#### 標註工具欄體驗優化

- **使用者可見性追蹤**：新增 `userVisibilityFlag` 標誌追蹤工具欄實際可見狀態
- **智能自動隱藏**：實現 5 秒無操作自動隱藏機制，減少視覺干擾
  - 用戶完成標註後工具欄自動收起
  - 懸停或互動時重置計時器，保持靈活性
  - 改善長時間閱讀時的視覺體驗
  - 修復工具欄顯示邏輯，確保狀態同步正確（[#69](https://github.com/cowcfj/save-to-notion/pull/69)）

### 🔧 代碼品質改進

#### DeepSource 問題修復（PR #67）

- **變數聲明優化**：修正 `handleSavePage` 函數中的重複變數聲明問題
- **錯誤診斷增強**：在 `content.js` 中新增 Readability 可用性檢查，提供更清晰的錯誤訊息
- **日誌系統統一**：將所有 `console.warn` 替換為 `Logger.warn`，確保日誌記錄一致性
- **manifest 權限優化**：調整 content_scripts 配置，改善腳本注入效率

#### 代碼重構

- **content.js 大幅重構**：優化內容擷取流程，提升程式碼可讀性和維護性（179 行變更）
- **使用模板字面量**：簡化測試中的內容字符串構建，提升測試代碼質量

### 🧪 測試覆蓋率提升

- **新增測試文件**：`tests/unit/content/isContentGood.test.js`（268 個測試用例）
- **測試場景覆蓋**：
  - 文本長度檢測（過短/正常/超長內容）
  - 連結密度評估（導航頁面/正常文章/連結農場）
  - 段落結構分析（單段落/多段落/空段落）
  - 邊界條件處理（空內容/特殊字符/極端數值）

### 📊 影響範圍

- **相容性**：完全向後兼容 v2.9.13 及更早版本
- **用戶體驗**：工具欄更智能，內容擷取更準確
- **代碼品質**：通過 DeepSource 靜態分析檢查
- **測試穩定性**：新增 268 個測試用例，100% 通過率

### 🔗 相關連結

- [完整變更比較](https://github.com/cowcfj/save-to-notion/compare/v2.9.13...v2.10.0)
- [PR #67 - DeepSource 修復](https://github.com/cowcfj/save-to-notion/pull/67)
- [PR #68 - 內容質量評估](https://github.com/cowcfj/save-to-notion/pull/68)
- [PR #69 - 工具欄可見性改進](https://github.com/cowcfj/save-to-notion/pull/69)

---

**版本建議**：次版本更新（Minor）v2.10.0
**理由**：

1. 新增功能（feat）：`isContentGood` 函數、工具欄自動隱藏機制
2. 無破壞性變更：所有改動均向後兼容
3. 遵循 Semantic Versioning 2.0.0 規範：新功能應提升次版本號
4. 根據 Conventional Commits：有 3 個 `feat:` 提交，應為次版本更新

---

## v2.9.13 - 2025-10-28

### 🔧 代碼品質改進

#### PR64 DeepSource 修復

- **正則表達式優化**：為多個正則表達式添加 `u` (Unicode) 旗標，改善 Unicode 字符處理
  - 影響文件：`lib/Readability.js`、`scripts/background.js`、`scripts/content.js`
  - 提升多語言環境支持，確保正確處理各種語言字符
  - 符合現代 JavaScript 最佳實踐和 DeepSource 代碼質量標準

#### 正則表達式 Linting 完成

- **代碼規範統一**：完成項目範圍內的正則表達式 linting 工作
  - 修正所有 ESLint regexp 插件警告
  - 統一正則表達式編寫風格
  - 提升代碼可讀性和維護性

### 🧪 測試系統完善

#### E2E 測試覆蓋率改進

- **測試基礎設施強化**：完善端到端測試系統
  - 驗證 E2E 測試覆蓋率收集機制
  - 改進測試穩定性和可靠性
  - 為未來的自動化測試奠定基礎

### 📊 影響範圍

- **無功能變更**：本版本專注於代碼品質提升，不影響用戶可見功能
- **向後兼容**：完全兼容 v2.9.12 及更早版本
- **技術債務清理**：減少技術債務，提升長期可維護性

### 🧹 維護

- 同步更新版本號：`manifest.json`、`package.json`、`README.md` → v2.9.13

---

## v2.9.12 - 2025-10-26

### 🐛 Bug 修復

- **Logger 系統修復**：修正 Logger 引用和可用性檢查，確保在全局範圍內正確使用和初始化統計資訊
- **圖片 URL 驗證優化**：更新 `isValidImageUrl` 函數使用正則表達式檢查 HTTP/HTTPS 協議，並實現緩存驗證結果以提升性能
- **按鈕顯示邏輯修復**：改善打開 Notion 頁面的按鈕顯示邏輯，添加更好的錯誤處理和用戶體驗
- **Readability 解析器初始化**：修復 Readability 解析器初始化時的變數設置問題，避免未定義錯誤
- **Notion 兼容性檢查**：更新 Notion 兼容圖片 URL 的檢查邏輯，改善內容解析流程

### 🔧 代碼品質

- **日誌系統統一**：將所有 `console` 日誌記錄替換為統一的 Logger 系統管理
- **代碼清理**：移除多餘空行，簡化函數定義，提升代碼可讀性
- **錯誤處理增強**：改善異步操作的錯誤處理，使用 async/await 模式
- **函數重命名**：重命名緩存圖片 URL 驗證函數以提高可讀性

### 🧹 維護

- 同步更新版本號：`manifest.json`、`package.json` → v2.9.12

## v2.9.11 - 2025-10-24

### ✨ 新功能

- 設置頁新增「斷開連接」按鈕：一鍵清除 Notion API Key 與資料來源（Data Source）設定，立即刷新授權狀態顯示。

### 🧪 測試

- 新增 `tests/unit/options.test.js`：覆蓋斷開連接流程、錯誤處理、授權狀態更新（3 項測試通過）。
- 新增 `tests/helpers/options.testable.js`：封裝測試輔助方法，簡化授權狀態檢查與資料清理流程。

### 🔧 代碼品質

- 移除無需 `await` 的 `async` 標記以消除 ESLint 警告（`async function without any await expressions`）。
- 將布林轉換由 `!!value` 調整為 `Boolean(value)`，提升可讀性與一致性。

### 🧹 維護

- 同步更新版本號：`manifest.json`、`package.json` → v2.9.11。

## v2.9.10 - 2025-10-23

### 🔧 維護

- 同步更新版本號：`manifest.json`、`package.json`、`package-lock.json` → v2.9.10。
- 同步更新文檔版本資訊：`Agents.md`、`CHANGELOG.md`。

> 本次為版本號一致性維護，無功能變更。

## v2.9.9 - 2025-10-22

### 🔧 維護

- 同步更新版本號：`manifest.json`、`package.json`、`package-lock.json` → v2.9.9。
- 同步更新文檔版本資訊：`Agents.md`、`CHANGELOG.md`。

> 本次為版本號一致性維護，無功能變更。

## v2.9.8 - 2025-10-21

### 🐛 Bug 修復

- **空標註資料膨脹**：
  - 背景服務僅在 HTTP(S) 網址且已有標註時才注入高亮腳本，避免為每個分頁建立空 `highlights_*` 紀錄。
  - `highlighter-v2` 在無標註資料時跳過初始化，杜絕自動寫入空陣列。
  - 選項頁偵測空標註並提供清理建議，能快速釋出儲存空間。
- **擴充程序頁面穩定性**：過濾 `chrome-extension://` 等內部網址，解決 Options 頁面注入失敗錯誤訊息。

### 🛠️ 工程改進

- 將除錯輸出統一導向 `Logger.debug`，清除殘留 `console.log`。
- 移除不必要的 `async` 標記並初始化統計變數，修正 DeepSource 警示。
- 調整單元測試 mock 寫法，確保 StorageUtil 行為與實際邏輯一致。

### ✅ 測試

- `npm test -- --watch=false`

---

## v2.9.7 - 2025-10-19

### 🐛 Bug 修復

- **Legacy 標註遷移權限錯誤**：在背景服務 worker 偵測非 HTTP(S) 網址（如 `chrome-extension://`、`chrome://`）時，將跳過舊版標註遷移流程，避免觸發 Chromium 權限限制導致的錯誤回報。
- **日誌一致性**：改用 `Logger.debug` 取代直接僅用 `console.log` 的除錯訊息，統一日誌輸出渠道。
- **程式碼可讀性**：移除無需 `await` 的 `async` 標記並調整內部變數命名，避免遮蔽外層作用域並符合靜態分析規範。

### 🧪 測試

- `npm test -- --runTestsByPath tests/unit/background/tab-listeners.test.js`
- `npm test`

## v2.9.6 - 2025-10-18

### 🎯 用戶體驗改進

- **Markdown 圖片自動渲染**：在內容擷取階段將 Markdown 圖片語法轉換為 Notion `image` 區塊，保留段落文字並僅允許 http/https 來源，避免圖片以純文字 URL 呈現。

### 🧪 測試

- `npm test -- tests/unit/htmlToNotionConverter.wrapper.test.js`
- `npm test`

## v2.9.5 - 2025-10-17

### ✨ 新功能

- **標註工具欄最小化功能**：解決工具欄遮蓋網頁內容的問題
  - 新增最小化按鈕（－），可將工具欄收縮為小圖標
  - 最小化後顯示 40x40px 圓形圖標（📝），點擊可重新展開
  - 保持原有關閉按鈕（✕）功能不變
  - 支援三種狀態：展開、最小化、隱藏
  - 包含完整的錯誤處理和調試日誌

### 🎯 用戶體驗改進

- **減少視覺干擾**：用戶可自由選擇工具欄顯示方式
- **保持功能完整**：最小化狀態下所有標註功能保持可用
- **直觀操作**：簡單點擊即可切換工具欄狀態

### 🔧 技術實現

- 新增狀態管理系統（展開/最小化/隱藏）
- 實現平滑的狀態切換動畫
- 完善的 DOM 元素檢查和錯誤處理
- 統一的日誌記錄格式

### 📦 版本更新

- 更新 manifest.json 版本號到 v2.9.5
- 更新 package.json 版本號到 v2.9.5
- 同步更新測試文件中的版本號引用

---

## v2.9.4 - 2025-10-16

### ♻️ 代碼重構

- **移除冗餘功能**：移除「清理空白頁面記錄」功能
  - 分析顯示每筆 `saved_` 記錄僅佔 ~250-450 bytes
  - 即使 1000 個頁面也僅佔用 250-450 KB（< 10% of 5 MB 限制）
  - `saved_` 記錄為核心功能必需（顯示「已保存」狀態）
  - 維護成本高但使用者價值低
- **保留功能**：「清理已刪除頁面的標註數據」功能正常運作

### 📊 影響

- **代碼簡化**：移除約 74 行代碼
- **測試狀態**：✅ 所有 21 個測試套件通過
- **覆蓋率**：✅ 保持穩定
- **用戶體驗**：簡化數據管理界面，移除混淆選項

---

## v2.9.3 - 2025-10-16

### 🔧 CI/Jest 穩定化

- 覆蓋率工作流精簡：`coverage.yml` 僅於主線 push、手動與排程觸發，避免與 PR 測試重複；啟用 OIDC 上傳 Codecov。
- Jest 調整：忽略 `tests/e2e/`，並暫不將注入型腳本（`scripts/utils/htmlToNotionConverter.js`、`scripts/utils/pageComplexityDetector.js`）計入覆蓋，改以 testable 版本覆蓋，讓覆蓋率訊號更準確。

### 🧪 測試增強與可測封裝

- 新增 testable 封裝：
  - `tests/helpers/pageComplexityDetector.testable.js`（detect/select/report/log）
  - `tests/helpers/htmlToNotionConverter.testable.js`（`convertMarkdownToNotionBlocks`、`isValidAbsoluteUrl`）
  - `tests/helpers/content-extraction.testable.js` 支援傳入 `document` 以便測試
- 新增與擴充單元/整合測試：
  - `tests/unit/pageComplexityDetector.wrapper.test.js`（技術文檔 vs 新聞頁面、分析報告、日誌）
  - `tests/unit/htmlToNotionConverter.wrapper.test.js`（多級標題、編號列表、未閉合代碼塊、URL 邊界）
  - `tests/unit/content-extraction.wrapper.test.js`（內容質量、高連結密度拒絕、Drupal/WordPress/Article/通用最大內容塊）

### 📌 備註

- 僅影響測試與 CI 配置，無運行時邏輯變更。

## v2.9.2 - 2025-10-14

### 🐛 Bug 修復

- **AttributeExtractor 修復**：修復 `isLazyLoadAttribute` 方法的誤判問題，避免將普通屬性（如 `data-testid`）錯誤識別為懶加載屬性
- **測試穩定性提升**：修復多個測試文件中的實現問題，提升整體測試穩定性

### 🧪 測試覆蓋率提升

- **測試覆蓋率達到 34.89%**：相比 2.9.1 版本提升 +3.48%（從 31.41% 提升）
- **新增測試文件**：
  - `tests/unit/imageExtraction/AttributeExtractor.test.js` - 圖片屬性提取器測試（95% 覆蓋率）
  - `tests/unit/utils.test.js` - 工具函數測試（74% 覆蓋率）
  - `tests/unit/seamless-migration.test.js` - 無痛遷移測試（76% 覆蓋率）
- **測試基礎設施完善**：更新 Jest 配置，調整覆蓋率門檻以反映當前進展

---

## v2.9.1 - 2025-10-13

### 🐛 Bug 修復

- **PerformanceOptimizer 測試穩定性提升**：增強 `_validateCachedElements` 的錯誤處理以支持 JSDOM 測試環境
- **DOM 驗證修復**：修復 PerformanceOptimizer 測試中的 DOM 驗證錯誤，確保測試在無瀏覽器環境下也能正確運行

### 🧪 測試覆蓋率提升

- **測試覆蓋率達到 31.41%**：相比 2.9.0 版本提升 +8.4%（從 23.01% 提升）
- **測試穩定性改進**：所有性能優化相關測試現在都能在 CI 環境中穩定通過

### 📚 文檔與代碼質量改進

- **README.md 更新**：更新功能展示和設置說明，移除過時的項目結構引用
- **文檔結構整理**：整理項目文檔結構，提升可讀性和維護性

---

## v2.9.0 - 2025-10-09

### 🚀 重大功能增強

#### 全新性能優化系統

- **DOM 查詢緩存**：實施 LRU 緩存策略，重複查詢性能提升 20-50%
- **批處理系統**：圖片和 DOM 操作批量化處理，提升響應性和用戶體驗
- **智能預加載**：關鍵選擇器預加載，減少首次查詢延遲
- **URL 驗證緩存**：避免重複驗證相同圖片 URL，提升圖片處理速度
- **性能監控**：實時收集和顯示性能統計，包括緩存命中率、查詢時間等

#### 技術架構改進

- **PerformanceOptimizer 類**：新增專門的性能優化組件
- **緩存策略**：實施多層緩存機制，包括 DOM 查詢緩存和 URL 驗證緩存
- **批處理隊列**：智能調度系統，16ms 延遲的批處理機制
- **錯誤處理增強**：統一的錯誤處理和重試機制
- **模組化設計**：新增 `scripts/performance/`、`scripts/errorHandling/`、`scripts/imageExtraction/` 模組

#### 測試覆蓋提升

- **新增 13 個性能測試**：全面覆蓋性能優化功能
- **測試通過率**：821/821 個測試 100% 通過
- **手動測試工具**：新增 `tests/manual/performance-test.html` 性能測試頁面
- **測試報告**：詳細的性能優化測試報告和基準測試

### 🔧 代碼質量改進

- **函數分解**：大型函數拆分為更小、更專注的函數
- **模組化重構**：圖片提取邏輯模組化，提升可維護性
- **錯誤處理標準化**：統一的錯誤處理模式和日誌記錄
- **性能監控**：內建性能統計和監控功能

### 📊 性能提升數據

- **DOM 查詢**：重複查詢性能提升 20-50%
- **圖片處理**：批處理機制提升響應性
- **內存使用**：智能緩存管理，避免內存洩漏
- **用戶體驗**：整體響應速度和流暢度顯著提升

## [Unreleased]

### 增強

- 統一應用可選鏈結（?.、?.()、?.[]）優化空值判斷，提升代碼可讀性與一致性
- 擴展圖片擷取能力：支持 srcset 智能解析（優先最大寬度）、更多懶加載屬性、背景圖回退、noscript 回退
- 改善錯誤處理：替換空 catch 塊為有意義的錯誤日誌，提升代碼質量
- 提升標註工具欄韌性：加入 MutationObserver 自動恢復（工具欄節點被移除時自動重新掛載）、在 show() 時保險重綁 Ctrl/Cmd+點擊刪除監聽器，並保持關鍵樣式與 z-index 斷言，以避免長頁與多次開關造成的「工具欄失聯/被覆蓋」。(模組：highlighter-v2，PR #11)
- Markdown 圖片支援：在內容擷取階段將 Markdown 圖片語法轉換為 Notion `image` 區塊，保留段落文字並僅允許 http/https 來源；新增對應單元測試覆蓋圖片轉換與 URL 驗證行為。（模組：htmlToNotionConverter）

## v2.8.2 - 2025-10-08

### 修復

- 強化標註工具欄顯示穩定性：在長內容頁面多次標註/同步並反覆開關後，工具欄可能無法再顯示。現已在顯示時自動重新掛載節點、重申關鍵樣式，並將 z-index 提升至 2147483647，避免被覆蓋。（模組：highlighter-v2）

## v2.8.1

- 對齊版本資訊：manifest.json 與 package.json → 2.8.1
- CI 小幅調整：升級 Codecov Action 至 v4、引入 `test:ci`，並在 workflow 中使用
- 覆蓋率門檻：Codecov project 目標由 20% 提升至 20.5%（保留 1% 容忍）
- 文檔：完善 PR 工作流程指南（internal/guides/PR_WORKFLOW.md），整合詳細的 PR 寫作規範、檢查清單和 FAQ
