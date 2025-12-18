# 🤖 AI Agent 工作指南
> [!WARNING]
> **平台特定指南**
>

> 各種 AI 編碼助理（如 Claude Code, GitHub Copilot, Cursor, kiro, Continue, roo code 等）擁有其獨立的配置方式、記憶系統、上下文管理及偏好設定。
>
> 在回答問題時，除非明確需要，否則不應參考或檢索此文件中的知識。在可能的情況下，請提供與工具無關的指導。在討論特定功能時，請清楚地區分其適用的工具或平台。請認知到，記憶系統、上下文視窗、提示策略和配置方法在不同的 AI 編碼助理之間存在顯著差異。


## 📖 快速導航

### 🔴 必讀 (每次任務必看)
- [核心原則](#核心原則) - 6條必須遵守的規則
- [工具使用優先級](#工具使用優先級) - VS Code vs MCP
- [文檔閱讀策略](#文檔閱讀策略) - 何時閱讀相關文檔

### ⚡ 日常參考
- [常見任務索引](#常見任務索引) - 快速查找操作指南
- [開發流程決策](#開發流程決策) - 分支 vs 主分支
- [文件修改影響](#文件修改影響) - 需同步更新的文檔
- [程式碼審核](#程式碼審核) - 評分標準速查

### 📚 詳細參考
- [項目架構](#項目架構) - 核心模組與通訊模式
- [編程規範](#編程規範) - 代碼風格與最佳實踐
- [測試與調試](#測試與調試) - 測試流程與調試技巧

---

## 核心原則

### 🔴 最高優先級規則

| # | 原則 | 說明 |
|---|------|------|
| 1 | **安全第一** | 新文件默認不同步 GitHub，疑惑時詢問用戶。嚴格遵循 `GITHUB_SYNC_POLICY.md` |
| 2 | **文檔同步** | 代碼改了立即更新相關文檔。版本號必須同步到所有文件 |
| 3 | **測試穩定性** | 新功能採用 Test First Mode，不能破壞現有測試 (736個測試，100%通過率) |
| 4 | **漸進式開發** | 先修復 bug 再添加功能；先基本實現再優化體驗；小步快跑，保持每次改動可編譯可驗證 |
| 5 | **簡單實用** | 單一職責、三次重複後再抽象、可讀性優於技巧、遵循既有風格與模式 |
| 6 | **繁體中文回應** | 所有 AI 回應必須使用繁體中文（zh-Hant），包括解釋、建議、錯誤訊息等，除非引用既有專有名詞。若使用者輸入其他語言，仍以繁中回覆並附關鍵詞原文於括號。代碼註解與文檔亦同 |
| 7 | **拒絕臆測** | 遇到不明白、不確定的地方先反問用戶，確認需求後再開始編碼，不急於行動 |
| 8 | **驗證後修改** | 修改配置或重構文件前，必須先讀取當前內容確認其狀態。嚴禁在未確認文件內容的情況下使用覆蓋模式 (`Overwrite: true`) 寫入文件，避免丟失重要配置 |

### 防止執行迴旋

- ✅ 成功 `read_file` 後必須立即分析，不得重複讀取相同路徑
- ✅ 禁止對相同工具使用語義等價參數重複調用
- ✅ 遇到錯誤改變策略，不得進入重試循環

### 複雜任務處理

**何時使用 Sequential Thinking MCP**：
- ✅ **多步驟決策**：需要評估多個方案或權衡利弊時
- ✅ **架構設計**：涉及模組間交互、數據流設計時
- ✅ **問題診斷**：需要系統性排查多個可能原因時
- ✅ **程式碼審核**：需要結構化評估代碼質量時（見[程式碼審核指南](#程式碼審核指南)）
- ✅ **風險評估**：涉及向後兼容性、性能影響、安全性考量時

**不需要使用的情況**：
- ❌ 簡單的文件讀寫、代碼修改
- ❌ 明確的單步操作（如更新版本號、修復拼寫錯誤）
- ❌ 已有明確解決方案的常見問題

**使用原則**：先思考再行動，避免盲目嘗試導致的重複失敗

---

## 工具使用優先級

### 決策流程圖

```

評估操作類型
    ├─ 文件讀寫/搜索 → VS Code 內建工具 (優先)
    │                   ↓ (若不可用)
    │                   Filesystem MCP (備用)
    ├─ 語義檢索/重構 → Serena MCP
    ├─ 程式碼搜尋/範例 → Exa Code MCP
    ├─ GitHub 操作 → GitHub MCP (先驗證狀態)
    ├─ 瀏覽器測試 → Chrome DevTools MCP
    ├─ 記憶管理 → Memory MCP
    └─ 複雜推理 → Sequential Thinking MCP
```

### MCP 服務器總覽

| 服務器 | 狀態 | 主要用途 | 何時使用 |
|--------|------|----------|----------|
| **Filesystem MCP** | 🔄 | 文件系統操作 | 內建工具不可用時的備用方案 |
| **Serena MCP** | ✅ | 語義檢索、符號級重構 | 跨檔案分析、重構 |
| **GitHub MCP** | ✅ | Repository、Issue、PR | GitHub API 操作 |
| **Memory MCP** | ✅ | 知識圖譜 | 持久化決策記錄 |
| **Sequential Thinking** | ✅ | 結構化推理 | 複雜問題分析 |
| **Chrome DevTools** | ⚠️ | 瀏覽器自動化 | E2E 測試、性能分析 |
| **Exa Code MCP** | ✅ | 真實代碼搜尋 | 尋找範例、最佳實踐、除錯 |

**核心原則**：優先內建 → 按需激活 MCP → 批量操作 → 驗證狀態

---

## 文檔閱讀策略

### 核心原則

- ✅ **按需閱讀**：只在需要時讀取文檔，不預先讀取所有引用
- ✅ **任務驅動**：根據當前任務類型決定需要哪些文檔
- ✅ **問題驅動**：遇到具體問題或需要深入了解時再讀取技術規格

### 閱讀決策流程

```
評估當前任務
    ├─ 明確的簡單任務 → 僅使用 AGENTS.md 中的信息
    ├─ 需要詳細指南 → 讀取對應的 guides/ 文檔
    ├─ 需要技術細節 → 讀取對應的 specs/ 文檔
    └─ 不確定需要什麼 → 先嘗試 AGENTS.md，不夠時再讀取
```

### 閱讀規則

1. **不要預先讀取**：在讀取 AGENTS.md 時，不要自動讀取所有引用的文檔
2. **按任務選擇**：根據當前任務類型，只讀取相關的文檔
3. **先簡後詳**：優先使用 AGENTS.md 中的簡要說明，不足時再讀取完整文檔
4. **條件觸發**：只有在滿足特定條件時才讀取對應文檔（見下方「快速參考文檔」表格）

---

## 常見任務索引

| 任務 | 快速指南 | 關鍵檢查項 |
|------|----------|-----------|
| 🐛 **修復 Bug** | 1. 查看 [問題解決策略](#問題解決策略)<br>2. 使用 [調試技巧](#調試技巧)<br>3. 遵循 [開發流程](#開發流程決策)<br>⚠️ **僅在需要時**讀取 `DEBUGGING_GUIDE.md` | ✅ 添加測試重現 bug<br>✅ 確保向後兼容 |
| ✨ **新功能** | 1. **僅在開發新功能時**檢查 `internal/guides/GOALS.md` 優先級<br>2. 使用 [Test First Mode](#test-first-mode-測試驅動開發)<br>3. 遵循 [編程規範](#編程規範)<br>4. 更新相關文檔 | ✅ 先寫測試再實現<br>✅ 更新 CHANGELOG |
| 📦 **發布版本** | **自動化流程** (參考下方 [自動化發布流程](#自動化發布流程)) | ✅ 確保 Commits 符合 Conventional Commits<br>✅ 合併 Release PR 即發布 |
| 🧪 **編寫測試** | 1. 查看 `tests/unit/` 範例<br>2. 使用 AAA 模式<br>3. 中文描述測試意圖 | ✅ 覆蓋率不下降<br>✅ 100% 通過率 |
| 📝 **更新文檔** | 遵循 GitHub 同步安全原則 | ✅ 無本地路徑<br>✅ 疑惑時詢問 |
| 🔧 **調試問題** | 使用 emoji 過濾日誌 (🎨/📦/🚀) | ✅ 檢查 DevTools Console |

---

## 發布流程

> 📖 **完整指南**：[RELEASE_WORKFLOW.md](internal/guides/RELEASE_WORKFLOW.md)

### 快速參考

- 使用 **Release Please** 自動化版本管理
- 合併 Release PR 即觸發發布
- Conventional Commits 規範：`feat:` → Minor，`fix:` → Patch

---

## 大型代碼重構

### 何時使用重構指南

**需要讀取 `internal/guides/REFACTORING_BEST_PRACTICES.md` 的情況**：
- ✅ 重構大型文件（>1000 行）為模組化架構
- ✅ Chrome Extension 代碼重構
- ✅ 涉及大量副作用和 API 調用的重構

### 核心原則（快速參考）

| 原則 | 說明 | 為什麼重要 |
|------|------|-----------|
| **副作用清單優先** | 重構前必須掃描所有 `chrome.*` 調用 | 副作用比純函數更容易遺漏 |
| **行為對比測試** | 製作新 vs 舊行為對比清單 | 單元測試通過 ≠ 行為正確 |
| **Chrome API 追蹤** | 對比新舊版本的 API 調用次數 | Chrome API 是隱藏依賴 |
| **初始化流程圖** | 繪製並驗證所有初始化步驟 | 初始化包含多個副作用 |
| **增量驗證** | 每個模組提取後立即測試 | 避免最後才發現問題 |
| **系統化檢測** | 使用腳本自動化對比 | 手動檢查容易遺漏 |

### 快速檢查命令

```bash
# 重構前：掃描副作用
grep -n "chrome\." target.js | wc -l
grep -n "addEventListener" target.js | wc -l

# 重構後：API 調用對比
grep -c "sendMessage" old.js
find new/ -name "*.js" -exec grep "sendMessage" {} \; | wc -l
```

### 最容易遺漏的問題

1. **初始化副作用** - 頁面載入時的 API 調用（如 badge 更新）
2. **隱藏依賴** - 不在函數參數的 Chrome API 調用
3. **行為差異** - 單元測試通過但行為不一致

**完整指南**：`internal/guides/REFACTORING_BEST_PRACTICES.md`

---

## 開發流程決策

### 分支 vs 主分支決策表

| 修改類型 | 決策 | 理由 |
|---------|------|------|
| 新核心功能、架構重構、API 變更 | 🌿 **分支 + PR** | 影響範圍大，需要審查 |
| 實驗性功能、性能優化 | 🌿 **分支 + PR** | 可能影響穩定性 |
| 簡單 bug 修復、文檔更新 | ⚡ **直接主分支** | 單文件，風險低 |
| 版本號更新、日誌改進、CSS 調整 | ⚡ **直接主分支** | 配置/樣式，風險極低 |

**決策原則**：疑惑時選擇分支；涉及安全/穩定性必須使用分支

### 標準修改流程

```
1. 問題分析 → 檢查現有代碼、確定影響範圍
2. 方案設計 → 多層回退、錯誤處理、兼容性
3. 代碼實現 → 詳細日誌、錯誤處理、回退機制
4. 測試驗證 → 不同網站、控制台日誌、邊緣情況
5. 文檔更新 → 版本號、相關文檔、Git 消息
```

### 強制檢查清單

#### 提交前檢查
- [ ] 無 `console.log/info/debug` (生產環境，使用 `Logger.*`)
- [ ] ESLint 通過 (`npm run lint`)
- [ ] 測試通過 (`npm test`)
- [ ] 無本地絕對路徑 (`/Volumes/`, `/Users/`, `C:\`)
- [ ] 新文件已確認是否同步 GitHub

#### 快速檢查命令
```bash
grep -r "console\.\(log\|info\|debug\)" scripts/  # 檢查日誌
npm run lint && npm test                           # 檢查質量
```

---

## 文件修改影響

### 修改後必須更新的文檔

> ⚠️ **重要**：以下技術規格文檔僅在**實際修改對應文件時**才需要讀取。不需要預先讀取所有文檔。

| 修改文件 | 必須同步更新 | 何時讀取技術規格 |
|---------|-------------|----------------|
| `scripts/highlighter/` | `internal/specs/HIGHLIGHTER_SYSTEM_SPEC.md`<br>`tests/unit/highlighter/*.test.js`<br>`CHANGELOG.md` | 僅在修改標註系統時 |
| `scripts/background.js` | `internal/specs/CONTENT_EXTRACTION_SYSTEM.md`<br>`tests/manual/smart-hybrid-mode-integration.test.js`<br>`CHANGELOG.md` | 僅在修改背景服務邏輯時 |
| `scripts/background/*` | `internal/specs/BACKGROUND_ARCHITECTURE.md`<br>`tests/unit/background/*.test.js`<br>`CHANGELOG.md` | 僅在修改背景服務模組時 |
| `scripts/utils/imageUtils.js` | `internal/specs/IMAGE_PROCESSING_SPEC.md`<br>`tests/unit/imageUtils*.test.js`<br>`CHANGELOG.md` | 僅在修改圖片工具庫時 |
| `scripts/content/extractors/ImageCollector.js` | `internal/specs/IMAGE_PROCESSING_SPEC.md`<br>`tests/unit/content/extractors/*.test.js`<br>`CHANGELOG.md` | 僅在修改圖片提取功能時 |
| `scripts/content/index.js` (圖片集成) | `internal/specs/IMAGE_PROCESSING_SPEC.md`<br>`tests/unit/content-*.test.js`<br>`CHANGELOG.md` | 僅在修改圖片收集集成時 |
| `scripts/performance/*` | `internal/guides/PROJECT_STRUCTURE.md`<br>`tests/unit/performance/*.test.js`<br>`CHANGELOG.md` | 僅在修改性能優化模組時 |
| `manifest.json` / `popup/*` | `README.md`<br>`CHANGELOG.md` | 僅在修改權限或 UI 時 |
| `scripts/config/*` | `internal/specs/CONFIGURATION_ARCHITECTURE.md`<br>`scripts/config/index.js`<br>`CHANGELOG.md` | 僅在修改全局配置時 |

---

## 項目架構

### 整體架構流程
```
Popup UI (popup.html/popup.js)
         ↓
Background (background.js)
  ├─ Services (Notion, Storage, Injection, Tab, PageContent)
  ├─ Handlers (Message)
  └─ Utils (BlockBuilder, Logger)
         ↓
Content Scripts
  ├─ dist/content.bundle.js **[模塊化架構]**
  │   └─ scripts/content/ (ES6 模塊源碼)
  │       ├─ index.js (入口文件)
  │       ├─ extractors/ **[提取層]**
  │       │   ├─ ContentExtractor.js (內容提取入口)
  │       │   ├─ ReadabilityAdapter.js (Readability 適配器)
  │       │   ├─ MetadataExtractor.js (元數據提取)
  │       │   └─ ImageCollector.js (圖片收集)
  │       ├─ converters/ **[轉換層]**
  │       │   ├─ ConverterFactory.js (轉換器工廠)
  │       │   └─ DomConverter.js (通用 HTML → Notion Block 轉換)
  │       └─ adapters/ **[適配層]**
  │           └─ ReadabilityAdapter.js (Readability.js 整合)
  ├─ utils.js (工具函數文件)
  │   • URL 正規化
  │   • Storage 管理
  ├─ utils/ **[工具模組目錄]**
  │   ├─ Logger.js **[統一日誌系統]**
  │   │   • 環境感知 (Browser/Service Worker)
  │   │   • 調試模式控制 (Manifest + Storage)
  │   │   • 背景日誌轉發
  │   │   • 分級日誌 (debug/log/info/warn/error)
  │   ├─ Logger.module.js (ES6 Wrapper)
  │   ├─ imageUtils.js (圖片處理工具庫)
  │   ├─ imageUtils.module.js (ES6 Wrapper)
  │   └─ pageComplexityDetector.js (頁面複雜度檢測)
  ├─ config/ **[配置管理]**
  │   ├─ constants.js (統一常量定義)
  │   ├─ selectors.js (DOM 選擇器配置)
  │   ├─ patterns.js (正則表達式配置)
  │   ├─ features.js (功能開關配置)
  │   ├─ env.js (環境檢測工具)
  │   ├─ index.js (統一導出入口)
  │   └─ README.md (使用手冊)
  ├─ performance/ (性能優化模組)
  ├─ errorHandling/ (錯誤處理模組)
  └─ dist/highlighter-v2.bundle.js (標註系統)
      • ES6 模組打包 (Rollup + Terser)
      • CSS Highlight API
      • 9 個獨立模組
      • 15KB 壓縮版 (-91%)
         ↓
Target Web Page
```

### 關鍵模組

| 模組 | 檔案 | 職責 |
|------|------|------|
| **背景服務 (模塊化)** | `scripts/background/` **[ES6 模塊化]** | 核心業務邏輯分裂為獨立服務，提升可維護性 |
| ├─ **入口** | `background.js` | 服務初始化、依賴注入、事件協調 |
| ├─ **Notion服務** | `services/NotionService.js` | Notion API 交互、批次處理、限流控制 |
| ├─ **頁面提取** | `services/PageContentService.js` | 注入 Content Bundle，協調提取結果 |
| **內容腳本 (模塊化)** | `scripts/content/` **[ES6 模塊化]** | 內容提取與轉換邏輯 |
| ├─ **入口** | `index.js` → `dist/content.bundle.js` | 暴露全局 `extractPageContent` |
| ├─ **轉換器** | `DomConverter.js` | HTML DOM → Notion Blocks (核心邏輯) |
| **標註系統** | `scripts/highlighter/` **[ES6 模塊化]** | 標註創建、管理、DOM 恢復 |
| ├─ **入口** | `index.js` → `dist/highlighter-v2.bundle.js` | 暴露全局 `HighlighterV2` |
| **構建系統** | `rollup.all.config.mjs` | 統一管理所有 Bundle 的打包與監控 |

### 構建命令

- `npm run dev`: 同時監控並構建 Highlighter 和 Content Script (開發模式)
- `npm run build`: 構建所有 Bundle (開發模式)
- `npm run build:prod`: 構建所有 Bundle (生產模式，壓縮)
| ├─ **存儲服務** | `services/StorageService.js` | 數據持久化、狀態管理 (Local/Sync) |
| ├─ **注入服務** | `services/InjectionService.js` | Content Script 注入、錯誤恢復、重試機制 |
| ├─ **頁面內容服務** | `services/PageContentService.js` | 協調內容提取與標註收集 |
| ├─ **標籤頁服務** | `services/TabService.js` | Tab 狀態追蹤、圖標更新、導航監聽 |
| ├─ **消息處理** | `handlers/MessageHandler.js` | 統一消息路由、Action 分發 |
| ├─ **工具庫** | `utils/BlockBuilder.js` | Notion Block 結構構建工廠 (無狀態) |
| **內容提取 (新架構)** | `scripts/content/` **[ES6 模塊化]** | 智能內容提取、多層回退機制、圖片收集與過濾 |
| ├─ **入口** | `index.js` | 消息監聽、模塊協調、錯誤處理 |
| ├─ **提取層** | `extractors/ContentExtractor.js` | 內容提取入口、Readability 整合、頁面複雜度檢測 |
| ├─ **提取層** | `extractors/ReadabilityAdapter.js` | Readability.js 適配、內容質量評估 |
| ├─ **提取層** | `extractors/MetadataExtractor.js` | Title、Favicon、Author 提取 |
| ├─ **提取層** | `extractors/ImageCollector.js` | 圖片收集、整合 imageExtraction 策略 |
| ├─ **轉換層** | `converters/ConverterFactory.js` | 根據頁面類型選擇轉換策略 |
| ├─ **轉換層** | `converters/DomConverter.js` | 統一 HTML → Notion Block 轉換 (含 Markdown 渲染頁面) |
| ├─ **壓縮產物** | `dist/content.bundle.js` | Rollup 打包 (211KB) |
| **標註系統 (模塊化)** | `scripts/highlighter/` **[ES6 模塊化]** | CSS Highlight API、5色標註、零DOM修改、持久化 |
| ├─ **入口** | `index.js` (124行) | 全局 API 設置、初始化協調、事件監聽 |
| ├─ **核心** | `core/Range.js` (125行) | Range 序列化/反序列化、路徑記錄 |
| ├─ **核心** | `core/HighlightManager.js` (701行) | 標註管理、CSS Highlight API 整合、事件處理 |
| ├─ **工具** | `utils/color.js` (53行) | 顏色配置、CSS 變數映射 |
| ├─ **工具** | `utils/dom.js` (101行) | DOM 操作、節點遍歷、元素查找 |
| ├─ **工具** | `utils/validation.js` (121行) | 輸入驗證、參數檢查 |
| ├─ **工具** | `utils/path.js` (198行) | 節點路徑計算、路徑解析 |
| ├─ **工具** | `utils/textSearch.js` (200行) | 文本搜索、範圍匹配 |
| ├─ **工具** | `utils/domStability.js` (146行) | DOM 穩定性檢測、MutationObserver |
| ├─ **UI 組件** | `ui/` | 標註工具欄 UI 組件 |
| │  ├─ **核心** | `Toolbar.js`, `ToolbarState.js` | UI 控制器與狀態管理 |
| │  ├─ **組件** | `components/*.js` | ColorPicker, HighlightList, MiniIcon |
| │  └─ **樣式** | `styles/*.js` | ToolbarStyles, ToolbarContainer |
| ├─ **壓縮產物** | `dist/highlighter-v2.bundle.js` | Rollup + Terser 壓縮 (15KB, -91%) |
| **配置管理** | `scripts/config/` **[集中化配置]** | 統一常量與選擇器定義 |
| ├─ **常量** | `constants.js` | 圖片驗證、性能優化、錯誤處理常量 |
| └─ **選擇器** | `selectors.js` | DOM 選擇器、技術內容標記 |
| **統一日誌** | `utils/Logger.js` | 環境感知日誌系統、調試模式控制、背景轉發、與 options 整合 |
| **工具函數** | `utils.js` | URL 正規化、Storage 管理 |
| **圖片工具庫** | `utils/imageUtils.js` | 統一圖片處理接口：URL 清理、驗證、提取（srcset → 屬性 → picture → background → noscript） |
| **性能優化** | `performance/*` | 快取、批處理、自適應管理 |
| **錯誤處理** | `errorHandling/*` | ErrorHandler、RetryManager |

### 資料存儲

```javascript
// chrome.storage.local (頁面標註與狀態)
highlights_<normalizedURL>: [{text, color, ranges, timestamp}]
saved_<normalizedURL>: {title, savedAt, notionPageId, notionUrl}

// chrome.storage.sync (設定與偏好)
notionApiKey, notionDataSourceId, titleTemplate, includeTimestamp
```

### 通訊模式

```
Popup → Background: savePage, checkPageStatus
Background → Content: extractContent, collectHighlights
Content → Background: contentReady (回報狀態)
```

---

## 構建流程

### Rollup + Terser 配置

本項目使用 **Rollup** 進行模組打包，並使用 **Terser** 進行生產環境壓縮。

| 環境 | 命令 | 輸出 | Source Map | 壓縮 |
|------|------|------|-----------|------|
| **開發** | `npm run build` / `npm run build:watch` | `dist/highlighter-v2.bundle.js` (166KB) | inline | ❌ |
| **生產** | `npm run build:prod` | `dist/highlighter-v2.bundle.js` (15KB, -91%) | external (`.map`) | ✅ |

### NPM Scripts

```bash
# 開發模式（實時編譯）
npm run build:watch

# 一次性構建（開發）
npm run build

# 生產構建（壓縮）
npm run build:prod

# 測試
npm test

# Lint 檢查
npm run lint
```

### Terser 壓縮配置

**配置文件**：`rollup.config.mjs`

```javascript
{
  compress: {
    drop_console: false,      // 保留 console.log（調試用）
    drop_debugger: true,      // 移除 debugger
    pure_funcs: ['console.debug']
  },
  mangle: {
    reserved: [               // 保留全局變數
      'HighlighterV2',
      'Logger',
      'StorageUtil'
    ]
  },
  format: {
    comments: false           // 移除註釋
  }
}
```

### 壓縮成果

| 指標 | 開發版本 | 生產版本 | 改進 |
|------|----------|----------|------|
| Bundle 大小 | 166KB | 15KB | -91% |
| Gzip 預估 | ~40KB | ~5-7KB | -85% |
| Source Map | inline | external (70KB) | 分離 |
| Build 時間 | ~55ms | ~216ms | 可接受 |

### 構建驗證

**CI/CD 自動檢查**（`.github/workflows/ci.yml`）：
- ✅ 執行 `npm run build:prod`
- ✅ 驗證 bundle 存在
- ✅ 檢查 bundle 大小 < 50KB

---

## 編程規範

> 📖 **完整指南**：[CODE_PATTERNS_GUIDE.md](internal/guides/CODE_PATTERNS_GUIDE.md) + [PROJECT_STANDARDS.md](internal/guides/PROJECT_STANDARDS.md)

### 代碼風格 (快速參考)

| 項目 | 規範 |
|------|------|
| **命名** | camelCase，描述性強 (`handleSelection`, `selectedText`) |
| **註釋** | 繁體中文（zh-Hant），變數與 API 命名可維持英文 |
| **錯誤處理** | try-catch + 多層回退 + 詳細日誌 |
| **異步** | async/await + try-catch + 超時處理 |
| **簡單性** | 單一職責、三次重複後再抽象、可讀性優於技巧 |
| **一致性** | 遵循既有代碼風格、匯入順序、命名慣例 |

### 靜態分析警告修復優先級

| 優先級 | 修復方法 | 適用情況 |
|--------|---------|---------|
| **1️⃣ 最優** | 移除未使用的代碼 | 變數/函數確實未被使用 |
| **2️⃣ 推薦** | 重構使變數被使用 | 可以改進代碼結構 |
| **3️⃣ 可接受** | 註釋說明保留原因 | 未來功能預留、接口兼容 |
| **4️⃣ 最後** | 下劃線前綴 | 接口一致性要求 |

> ⚠️ **禁止**將下劃線前綴作為首選修復方法

---

## 測試與調試

> 📖 **完整指南**：[TESTING_GUIDE.md](internal/guides/TESTING_GUIDE.md) + [DEBUGGING_GUIDE.md](internal/guides/DEBUGGING_GUIDE.md)

### 測試現狀與目標

> 📊 **覆蓋率報告**：查看 `coverage/merged/index.html`（整合 Jest + E2E 測試）

| 指標 | 要求 |
|------|------|
| **測試通過率** | 100% |
| **執行時間** | <10秒 |

**Highlighter 測試**：
- ✅ **138 測試** - highlighter 模組化後新增
- ✅ 7 個測試套件（核心 2 + 工具 5）
- ✅ 100% 通過率
- ✅ 覆蓋所有 9 個模組

### Test First Mode (測試驅動開發)

**新功能開發流程**：
- ✅ **先寫測試**：編寫或更新單元測試，然後實現代碼至通過
- ✅ **組件測試優先**：UI 狀態變更優先使用組件測試
- ✅ **回歸測試**：發現 bug 時先添加失敗測試重現問題，再修復至通過

**實施原則**：
```javascript
// 1. 先寫失敗測試 (Red)
test('應該正確處理新功能需求', () => {
  expect(newFeature()).toBe(expectedResult); // 此時會失敗
});

// 2. 實現最小代碼使測試通過 (Green)
function newFeature() {
  return expectedResult; // 最簡實現
}

// 3. 重構優化 (Refactor)
// 在測試保護下改進代碼質量
```

### AAA 測試模式 (必須遵守)

```javascript
test('應該正確處理有效輸入', () => {
  // Arrange - 準備測試數據
  const input = { url: 'https://example.com' };

  // Act - 執行測試
  const result = normalizeUrl(input.url);

  // Assert - 驗證結果
  expect(result).toBe('https://example.com');
});
```

### 測試命名規範

- ✅ 使用中文描述測試意圖
- ✅ 描述「應該做什麼」而非「如何做」
- ✅ 每個測試只驗證一個行為
- ✅ **Mock 回調命名**：使用動作動詞 (`sendResult`, `sendTab`) 而非名詞 (`data`) 或事件名 (`onSuccess`)，明確表示「Mock 函數主動發送結果」

### 調試場景快速指南

| 問題 | 檢查點 | 工具 |
|------|--------|------|
| **標記功能無效** | CSS.highlights 支持<br>遷移狀態<br>URL 規範化 | DevTools Console<br>emoji 過濾 (🎨) |
| **保存失敗** | API 狀態碼<br>批次處理日誌<br>速率限制 | Service Worker Inspector |
| **性能緩慢** | 批次大小<br>API 回應時間<br>存儲大小 | Network 標籤<br>Performance API |
| **標註恢復失敗** | 遷移完成<br>URL 匹配<br>文本存在 | Console 日誌順序 |

### 日誌規範

```javascript
// ⚠️ 生產環境嚴禁 console.log/info/debug
// ✅ 使用 Logger 系統
Logger.log('🚀 [初始化]...')   // 僅開發環境
Logger.warn('⚠️ [警告]...')    // 所有環境
Logger.error('❌ [錯誤]...')   // 所有環境

// emoji 過濾：🎨(標註) 📦(存儲) 🚀(初始化) ❌(錯誤)
```

### 模組導入模式

本專案使用 **IIFE + 橋接模組** 模式支援瀏覽器和測試環境：

| IIFE 源文件 | 橋接模組 | 用途 |
|------------|---------|------|
| `Logger.js` | `Logger.module.js` | 日誌系統 |
| `imageUtils.js` | `imageUtils.module.js` | 圖片處理 |

**測試導入規範**：

```javascript
// ✅ 推薦：使用橋接模組
const Logger = require('../../scripts/utils/Logger.module.js').default;
const { cleanImageUrl } = require('../../scripts/utils/imageUtils.module.js');

// ⚠️ 避免：side effect + 全域變數
require('../../scripts/utils/Logger.js');
const Logger = global.window.Logger;
```

> 📖 **詳細分析**：[TESTABLE_REFACTORING_ANALYSIS.md](internal/specs/TESTABLE_REFACTORING_ANALYSIS.md)

---

## 問題解決策略

### 常見問題快速索引

| 問題類型 | 核心策略 | 解決步驟 |
|---------|---------|---------|
| **跨元素標記** | DOM 片段重建 | 1. 自定義範圍分割<br>2. 虛擬節點包裝 |
| **圖片處理** | URL 清理 + 驗證 | 1. 清理代理 URL<br>2. 驗證格式<br>3. 友好錯誤 |
| **性能優化** | 批次 + 快取 | 1. 分批處理<br>2. 懶加載<br>3. 快取結果 |

### 代碼模式參考

> ⚠️ **按需閱讀**：以下關鍵模式速查通常已足夠。**僅在** AGENTS.md 中的說明不足、需要更詳細的實現範例時，才讀取 `internal/guides/CODE_PATTERNS_GUIDE.md`

關鍵模式速查：
- 錯誤處理：try-catch + 多層回退 + 超時處理
- 異步處理：批次處理 + 並行控制 + 重試機制
- 存儲管理：安全操作 + 配額檢查 + 快取策略
- DOM 操作：防禦性 + 批量更新 + 錯誤恢復
- API 調用：重試 + 限流 + 指數退避

---

## 程式碼審核

> 📖 **完整指南**：[CODE_REVIEW_GUIDE.md](internal/guides/CODE_REVIEW_GUIDE.md)

### 快速參考

| 綜合評分 | 審核結論 | 處理方式 |
|---------|---------|---------|
| 90-100分 | ✅ 通過 | 可直接合併 |
| 70-89分 | ⚠️ 需改進 | 改進後合併 |
| 0-69分 | ❌ 退回 | 必須修復後重審 |

---

## 工作優先級

| 級別 | 類型 | 範例 |
|------|------|------|
| 🔴 **最高** | 破壞性bug、安全漏洞、兼容性 | 核心功能失效、數據洩露 |
| 🟡 **高** | 用戶體驗、性能優化、功能增強 | 響應慢、流程複雜 |
| 🟢 **中** | 重構、文檔、測試覆蓋 | 技術債、文檔不全 |
| 🔵 **低** | 新功能、UI 美化、實驗性 | 全新模塊、視覺改進 |

---

## 項目發展計劃

### 已實現核心功能

> 📦 查看當前版本：`package.json` → `version` 欄位

**核心功能列表**：
- ✅ 保存後打開 Notion 頁面
- ✅ 圖標徽章顯示保存狀態
- ✅ 擷取網站 Favicon
- ✅ 商店更新說明彈出
- ✅ 可搜索資料來源選擇器
- ✅ 標註工具欄最小化

**待開發**：
- 🟡 中優先級：內容快取機制 (性能提升50-80%)
- 🔵 長期計劃：圖片上載功能 (需考慮成本)

> ⚠️ **按需閱讀**：**僅在**需要查看完整長期規劃、功能優先級或開發路線圖時，才讀取 `internal/guides/GOALS.md`

---

## 預期工作成果

### 質量標準檢查表

- [ ] **代碼質量**：可讀性佳、錯誤處理完善、模塊化設計、響應<2秒
- [ ] **文檔質量**：完整、準確、友好、及時同步
- [ ] **測試質量**：100%通過率、覆蓋率不下降、AAA模式
- [ ] **提交質量**：清晰Git消息、版本號同步、無本地路徑

### 成功指標

- ✅ 用戶不查文檔就能使用核心功能
- ✅ 錯誤有明確解決指導
- ✅ 新功能不破壞現有工作流程
- ✅ 代碼修改後更穩定

---

## 快速參考文檔

> ⚠️ **重要**：以下文檔**僅在滿足特定條件時**才需要讀取。不要預先讀取所有文檔。

### 核心文檔

| 文檔 | 何時閱讀 | 為什麼閱讀 | 優先級 |
|------|---------|-----------|--------|
| `AI_AGENT_QUICK_REF.md` | 需要快速查找常用命令和規則時 | 提供最常用的工作指南速查 | 可選 |
| `internal/guides/GOALS.md` | 開發新功能時需要確認優先級和長期規劃 | 了解項目發展計劃和功能優先級 | 推薦 |
| `internal/guides/MCP_USAGE_GUIDELINES.md` | 需要使用 MCP 服務器進行複雜操作時 | 獲取 MCP 工具的詳細使用指南 | 可選 |
| `internal/guides/PR_WORKFLOW.md` | 創建 Pull Request 時 | 確保 PR 流程符合項目規範 | 推薦 |
| `internal/guides/RELEASE_WORKFLOW.md` | 準備發布新版本時 | 確保發布流程完整無遺漏 | 必須 |
| `internal/guides/DEBUGGING_GUIDE.md` | AGENTS.md 中的調試技巧不足時 | 獲取完整的除錯方法和技巧 | 可選 |
| `internal/guides/CODE_PATTERNS_GUIDE.md` | AGENTS.md 中的代碼模式速查不足時 | 獲取詳細的代碼實現模式和範例 | 可選 |

### 技術規格

| 文檔 | 何時閱讀 | 為什麼閱讀 | 優先級 |
|------|---------|-----------|--------|
| `internal/guides/PROJECT_STRUCTURE.md` | 需要了解項目目錄結構和模組職責時 | 快速參考項目架構 | 推薦 |
| `internal/specs/HIGHLIGHTER_SYSTEM_SPEC.md` | 修改 `scripts/highlighter/` 時 | 了解標註系統的技術架構和設計 | 必須 |
| `internal/specs/IMAGE_PROCESSING_SPEC.md` | 修改 `scripts/imageExtraction/*` 或圖片處理邏輯時 | 了解圖片提取、URL 清理、驗證的完整技術規格 | 必須 |
| `internal/specs/CONTENT_EXTRACTION_RESEARCH.md` | 修改內容提取邏輯或需要了解提取研究時 | 了解內容提取的技術細節和研究 | 推薦 |
| `internal/specs/CONTENT_FLOW_EXPLANATION.md` | 修改 `scripts/background.js` 的內容處理邏輯時 | 了解內容流和處理流程 | 必須 |
| `internal/guides/PROJECT_STRUCTURE.md` | 修改 `scripts/performance/*` 時 | 了解性能優化的模組架構 | 推薦 |

### 用戶文檔

| 文檔 | 何時閱讀 | 為什麼閱讀 | 優先級 |
|------|---------|-----------|--------|
| `README.md` | 需要了解用戶功能或更新用戶說明時 | 了解面向用戶的功能說明 | 可選 |
| `CHANGELOG.md` | 發布新版本時需要更新變更記錄 | 記錄版本變更歷史 | 必須 |
| `PRIVACY.md` | 修改隱私相關功能時 | 確保符合隱私政策 | 可選 |

---

## 安全清理與備份

### 備份未追蹤文檔（避免誤刪）

```bash
# 備份未追蹤文件
internal/scripts/backup-local-docs.sh --only-untracked

# 乾跑預覽
internal/scripts/backup-local-docs.sh -n
```

### 安全清理產物

```bash
# 先預覽（必須）
git clean -nfd

# 僅刪產物目錄（推薦）
rm -rf node_modules/ dist/ build/ coverage/ .nyc_output/

# ❌ 危險：勿用 git clean -fdx (會刪除 AGENTS.md)
```

**白名單（永不清理）**：
- `AGENTS.md`, `AI_AGENT_QUICK_REF.md`
- `internal/specs/**`, `internal/scripts/**`

---

## 常見失誤與避免

| 失誤 | 影響 | 避免方法 |
|------|------|---------|
| 誤用 `git clean -fdx` | 刪除所有未追蹤檔案 | 只用 `git clean -nfd` 預覽 |
| 未備份就清理 | 內部文檔不可恢復 | 先執行備份腳本 |
| 內部文件放 `scripts/` | 混入發佈包 | 放 `internal/` 目錄 |
| 空 catch 或無日誌 | 錯誤無法追蹤 | 使用 `ErrorHandler` |
| 未驗證改動權限 | 商店審核風險 | 列明理由與影響 |
| 漏同步文檔與測試 | 知識斷層與回歸 | 改動時更新對應文檔 |

---

**最後更新：** 動態維護，請參考 Git commit 記錄
**文檔版本：** v2.1 (精簡優化版，部分內容已拆分至獨立指南)

