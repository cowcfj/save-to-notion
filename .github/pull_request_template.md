## PR 標題
Notion Smart Clipper：CI/Jest 穩定化＋內容提取 testable 封裝與複雜用例測試

## 摘要
- 精簡 CI 覆蓋率工作流觸發，避免與 PR 測試重複；使用 OIDC 強化 Codecov 上傳。
- 明確忽略 `tests/e2e/` 與注入型腳本的覆蓋統計，讓覆蓋率訊號更準確。
- 為內容提取與轉換建立可測試封裝（testable wrappers），補齊複雜用例測試並通過本地驗證。

## 主要變更
- CI/workflows
  - 調整 `coverage.yml` 觸發條件（僅主線 push＋手動/排程），`use_oidc: true` 上傳覆蓋率。
  - 減少與 `.github/workflows/test.yml` 重疊，提升穩定性與可預期性。
- Jest/覆蓋率配置
  - `jest.config.js`：忽略 `tests/e2e/`；暫不計入覆蓋率的注入腳本 `scripts/utils/htmlToNotionConverter.js`、`scripts/utils/pageComplexityDetector.js`（後續以整合測試覆蓋）。
- Testable 封裝與測試
  - `tests/helpers/pageComplexityDetector.testable.js`
  - `tests/helpers/htmlToNotionConverter.testable.js`
  - `tests/helpers/content-extraction.testable.js`（接受 `document` 參數）
  - `tests/unit/pageComplexityDetector.wrapper.test.js`
  - `tests/unit/htmlToNotionConverter.wrapper.test.js`
  - `tests/unit/content-extraction.wrapper.test.js`

## 驗證
- 本地 `npm run test:ci`：42 套件、1176 測試全部通過，覆蓋率報告生成正常且訊號純淨。

## 風險與回滾
- 低風險：僅測試與 CI 配置調整，不影響擴展運行時。
- 回滾：恢復原 `coverage.yml` 觸發或逐檔回滾測試改動即可。

## 文件同步建議
- 更新 `CHANGELOG.md`（已更新 v2.9.3 條目）。
- 補充 `internal/specs/TECHNICAL_OVERVIEW.md` 的測試覆蓋與回退策略段落。
- 若影響流程規範，更新 `Agents.md` 的測試覆蓋與常見場景章節。

## 後續工作
- htmlToNotionConverter：引用 `>`、分隔線 `---`、內聯粗斜體、連結 `title`、嵌套列表多層級縮排。
- content-extraction：Readability 與 `@extractus` 輸出一致性比對與回退邊界。
- 覆蓋率目標：在訊號純淨前提下向 20%/35% 提升。

