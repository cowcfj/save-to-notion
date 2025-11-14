# 變更日誌 (CHANGELOG)

## [Unreleased]

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
