# Config 目錄

本目錄集中管理跨環境共享的常量與設定。目標是維持清楚的 runtime boundary，同時避免 `shared/` 再往下長出深層樹狀結構。

## 模組架構

### 入口層

| 入口                 | 用途                                              | 可用環境                     |
| -------------------- | ------------------------------------------------- | ---------------------------- |
| `index.js`           | Content-safe 聚合入口，不含 extension-only config | 所有環境                     |
| `shared/index.js`    | Shared config 聚合入口                            | 所有環境                     |
| `env/index.js`       | 環境偵測與 `BUILD_ENV`                            | 所有環境                     |
| `extension/index.js` | Extension-only config 聚合入口                    | Background / Options / Popup |

### `shared/` — Shared config 的唯一目錄

`shared/` 直層檔案是 shared config 的**最深合法層級**。預設 **MUST NOT** 在 `shared/` 下再新增第二層子目錄。

- `core.js`: `RESTRICTED_PROTOCOLS`、`HANDLER_CONSTANTS`、`TAB_SERVICE`、`SECURITY_CONSTANTS`
- `storage.js`: `SYNC_CONFIG_KEYS`、storage prefixes、`AUTH_LOCAL_KEYS`、`DATA_SOURCE_KEYS`、`mergeDataSourceConfig()`
- `ui.js`: `UI_ICONS`、`TOOLBAR_SELECTORS`、`UI_STATUS_TYPES`、`COMMON_CSS_CLASSES`、`LOG_ICONS`
- `messages.js`: `UI_MESSAGES`、`ERROR_MESSAGES`、`SECURITY_ERROR_MESSAGES`、`API_ERROR_PATTERNS`、`LOG_LEVELS`、`ERROR_TYPES`、`HIGHLIGHT_ERROR_CODES`
- `runtimeActions.js`: `RUNTIME_ACTIONS`、`RUNTIME_ERROR_MESSAGES` 與相鄰 JSDoc typedef
- `content.js`: extraction constants，包括 Next.js、selectors、cleaning、images、quality、normalization、text
- `highlightConstants.js`: `HIGHLIGHT_COLOR_WHITELIST`、`HIGHLIGHT_MATCH_SCORING`
- `notionCodeLanguages.js`: Notion Code block 語言白名單與 fallback 常量
- `saveStatus.js`: 保存狀態契約 helper

### `env/` — 環境配置

`env/` 保留子目錄，因為它處理不同的 environment boundary。

- `runtime.js`: `ENV` 與環境偵測函式
- `build.js`: `BUILD_ENV`
- `build.example.js`: build-time env 範本

### `extension/` — Extension-only config

`extension/` 保留子目錄，因為它明確隔離 Content Script 不可引用的常量。

- `notionApi.js`: Notion Data API transport 與 retry 配置
- `notionAuth.js`: Notion OAuth endpoint paths
- `accountApi.js`: account 與 Google Drive Sync endpoint paths
- `driveSyncErrorCodes.js`: Drive Sync 已知核心錯誤碼
- `authMode.js`: `AuthMode`

### 根目錄 leaf entry

以下根目錄檔案保留作為穩定 leaf entry，但其 canonical source 已在 `shared/*.js`：

- `icons.js`
- `saveStatus.js`
- `highlightConstants.js`
- `notionCodeLanguages.js`

## 導入規則

- Shared config 預設從 `scripts/config/shared/*.js` 導入。
- 一般 consumer 若需要 content-safe aggregate，可從 `scripts/config/index.js` 導入。
- `extension/` 常量 **MUST NOT** 經由 `index.js` 或 `shared/index.js` re-export。
- `env/` 與 `extension/` 的子檔案可直接導入；`shared/` 則不應再有 `shared/foo/bar.js` 這種深路徑。

## 結構原則

- `scripts/config/shared/*.js` 是 shared config 的預設與最深合法層級。
- 只有在單一直層 domain file 已被證明不可維護時，才可例外提案新增 `shared/` 第二層子目錄。
- **MUST NOT** 為了拆分而拆分出 3 到 10 行的小檔。
- **MUST NOT** 新增只做轉手的 barrel `index.js`。
- `scripts/config/` 仍是 Content Script 與 Background 之間的中立橋樑，shared module **MUST NOT** 在模組頂層依賴 `window`、`document` 或 `chrome.tabs.*`。
