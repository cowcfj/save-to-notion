# 變更日誌 (CHANGELOG)

## [Unreleased]

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
