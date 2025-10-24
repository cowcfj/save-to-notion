# RELEASE NOTES v2.9.11 (2025-10-24)

## Highlights
- 新增「斷開連接」按鈕：一鍵清除 Notion API Key 與資料來源（Data Source）設定，立即刷新授權狀態顯示。
- 測試覆蓋新增：`tests/unit/options.test.js` 覆蓋斷開連接流程、錯誤處理與授權狀態更新（3/3 皆通過）。
- 測試輔助封裝：`tests/helpers/options.testable.js` 提供授權狀態檢查與資料清理輔助方法。

## Quality
- 移除無需 `await` 的 `async` 標記，解決 ESLint 警告：`async function without any await expressions`。
- 將布林轉換由 `!!value` 調整為 `Boolean(value)`，提升可讀性與一致性。

## Versioning
- 版本號更新：`manifest.json`、`package.json` → v2.9.11。
- 相關變更已記錄於 `CHANGELOG.md`。

## How to Upgrade
1. 於選項頁點擊「斷開連接」以清除舊憑證（如需）。
2. 重新連接 Notion，或在「手動設置」填入 API Key 並選擇資料來源。
3. 儲存設定後，授權狀態將立即更新。

## Packaging
- 發佈包：`releases/notion-smart-clipper-v2.9.11.zip`
- 包含：`manifest.json`, `icons/`, `options/`, `popup/`, `scripts/`, `lib/`, `update-notification/`, `help.html`

## Tests
- `npx jest tests/unit/options.test.js`：斷開連接、錯誤處理、授權狀態更新（3 測試通過）