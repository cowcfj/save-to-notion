# Config 目錄 (常數與設定)

本目錄包含整個專案的共用常數、文字與設定檔。這些設定有些會被打包注入到網頁中（Content Script / Highlighter），有些則直接在擴充功能的環境中執行（Background / Popup / Options / Side Panel）。

為減少最終發布版本的體積，只在「網頁注入」環境中使用的設定會在打包腳本中被排除，因為它們已經被 Rollup 打包進 `content.bundle.js` 中。

## 模組架構 (Config V3)

### 入口層

| 入口                 | 用途                                         | 可用環境                     |
| -------------------- | -------------------------------------------- | ---------------------------- |
| `index.js`           | Content-safe 聚合入口（不含 extension-only） | 所有環境                     |
| `env/index.js`       | 環境偵測 + BUILD_ENV                         | 所有環境                     |
| `extension/index.js` | Extension-only 配置（API、Auth、Drive Sync） | Background / Options / Popup |
| `shared/index.js`    | Content-safe 共用配置聚合                    | 所有環境                     |

### `env/` — 環境配置

- `runtime.js`: 環境偵測函數（isExtensionContext、isBackground 等）+ `ENV`
- `build.js`: `BUILD_ENV`（OAuth 配置，本地由 postinstall 從 build.example.js 複製）
- `build.example.js`: BUILD_ENV 範本（空值）

### `shared/core/` — 系統核心配置

- `browser.js`: `RESTRICTED_PROTOCOLS`
- `timing.js`: `HANDLER_CONSTANTS`、`TAB_SERVICE`
- `security.js`: `SECURITY_CONSTANTS`

### `shared/storage/` — Storage Keys 與前綴

- `keys.js`: `SYNC_CONFIG_KEYS`
- `prefixes.js`: `SAVED_PREFIX`、`HIGHLIGHTS_PREFIX` 等
- `auth.js`: `AUTH_LOCAL_KEYS`
- `dataSource.js`: `DATA_SOURCE_KEYS`、`LOCAL_STORAGE_KEYS`、`mergeDataSourceConfig()`

### `shared/ui/` — UI 配置

- `icons.js`: SVG 圖標
- `toolbar.js`: `TOOLBAR_SELECTORS`
- `status.js`: `UI_STATUS_TYPES`
- `classes.js`: `COMMON_CSS_CLASSES`
- `logIcons.js`: `LOG_ICONS`

### `shared/messaging/` — 訊息與 Action Registry

- `ui/`: UI 文案按領域拆分（auth、settings、dataSource、storage、popup、sidepanel、toolbar、cloudSync、logs、account）
- `errors/`: Error registry（technical、user、security、patterns、highlight）
- `runtime/`: Runtime action registry 按領域拆分（pageStatus、save、highlight、migration、auth、driveSync、sidepanel、diagnostics）

### `shared/content/` — 內容提取配置

- `nextjs.js`: `NEXTJS_CONFIG`
- `selectors.js`: 各類 DOM 選擇器（featured image、article、gallery、CMS、metadata 等）
- `cleaning.js`: `NOISE_SELECTORS`、`EXCLUSION_SELECTORS`、`GENERIC_CLEANING_RULES`、CMS/Domain 清洗規則
- `images.js`: `IMAGE_VALIDATION_CONSTANTS`、`IMAGE_LIMITS`、`IMAGE_SIZE_RESOLVE`
- `quality.js`: `CONTENT_QUALITY`、`DOM_STABILITY`
- `normalization.js`: `URL_NORMALIZATION`
- `text.js`: `TEXT_PROCESSING`

### `extension/` — Extension-only 配置

- `notionApi.js`: Notion Data API transport 與 retry 配置
- `notionAuth.js`: Notion OAuth endpoint paths
- `accountApi.js`: account 與 Google Drive Sync endpoint paths
- `driveSyncErrorCodes.js`: Drive Sync 已知核心錯誤碼
- `authMode.js`: AuthMode enum

### 獨立模組

- `highlightConstants.js`: 螢光筆標記常量
- `notionCodeLanguages.js`: Notion Code block 語言白名單

> **🚨 開發預警**
> 修改這些共用檔案時，請注意不可引入需要特定 Web API（如 `window`、`document`）或特定 Chrome API（如 `chrome.tabs.*`）的操作，以確保它在跨環境中都是安全的常數定義。
