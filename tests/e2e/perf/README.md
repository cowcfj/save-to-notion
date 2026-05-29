# E2E Performance Timing Baseline

> **本機限定。不入 CI。**

此目錄收錄 Playwright 端到端**時序基準**測試。它們**不會**在 `npm run test:e2e` 或任何 CI workflow 中執行；只能透過 `npm run perf:e2e` 顯式呼叫。

## 為什麼分離

時序測試與功能測試的需求相反：

|          | 功能 e2e (`tests/e2e/specs/`) | 時序 e2e (`tests/e2e/perf/`)            |
| -------- | ----------------------------- | --------------------------------------- |
| 並行     | `fullyParallel: true`         | `fullyParallel: false`                  |
| 重試     | `retries: 2` (CI)             | `retries: 0`（重試會污染樣本）          |
| Worker   | 多                            | 1                                       |
| 失敗條件 | `expect()` 不通過             | **不寫絕對 ms 斷言**，只記錄 + 印 delta |
| 跑在哪   | 本機 + CI                     | **本機限定**                            |

CI runner 共享資源、變異大；在 CI 跑時序會變 flaky 來源。Bundle size regression 已由 [tools/check-size-gates.mjs](../../../tools/check-size-gates.mjs) 在 CI 守備，這層只補「**執行時間**」維度的本機觀測。

## 跑法

```bash
npm run perf:e2e
```

第一次跑會在 `.tmp/perf-baseline.json` 建立 baseline。後續每次跑會在 console 印目前數字 vs baseline 的 delta。`.tmp/` 已被 `.gitignore`，baseline 只綁定本機。

要更新 baseline，先刪除既有的 `.tmp/perf-baseline.json`，再重新執行 `npm run perf:e2e`，讓新跑出的結果成為 baseline。

## 量測對象

| Spec                       | 量什麼                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `save-timing.spec.js`      | example.com 上 `chrome.runtime.sendMessage({action: 'savePage'})` round-trip                    |
| `extract-timing.spec.js`   | 同上，但在 35KB `__NEXT_DATA__` 的 fixture 上跑；對比 `save-timing` 反映 NextJsExtractor 的開銷 |
| `highlight-timing.spec.js` | `HighlighterV2.manager.addHighlight(range, color)` 在固定段落上的執行時間                       |

每個 spec 都跑 1 次 warm-up（discard）+ 10 次取樣，記錄 median 與 p95。

## 該怎麼讀數字

- **跨 commit 比較**：先跑 baseline → 改 code → 再跑 → 看 console 的 `Δ`。**目前的 baseline 不會自動更新**，重新覆寫會把這次成為新 baseline；要保留比較窗口就先別覆寫。
- **絕對值不可跨機器比較**：你的電腦 vs 同事的電腦 vs CI 完全是不同的數字曲線。
- **不要寫絕對 ms 的 `expect()`**：時序測試永遠只記錄 + 觀察，由人決策。
- **絕對值包含測試 harness 開銷，不等於 user-perceived latency**：`save_round_trip_*` 的每次取樣都包含 `popup = await context.newPage(); popup.goto(popup.html); waitForLoadState('networkidle'); ... popup.close()` 的成本。實測 `chrome.runtime.sendMessage→callback` 的真實 round-trip 中位數約 **51ms**，但 `save_round_trip_example_com` baseline 中位數約 **685ms**，差 ~640ms 全是 harness navigation 開銷。**Δ 仍是真實 extension 變化的可信訊號**（jitter 不增加），但**絕對值不要直接拿來代表「user 點按鈕到完成」的延遲**。要量真實 user-perceived latency 的話，spec 必須在迴圈外開一次 popup、迴圈內只做 `sendMessage`。

## 維護注意

- **不要把 `perf:e2e` 加進 `test:all` / `test:ci`**：那會讓它意外進到 CI 流程。
- **不要把 `.tmp/perf-baseline.json` 加入 git 追蹤**：baseline 本機綁定。
- **要新增量測對象**：加新 spec、用 `measureN(name, fn, n)` + `writeBaseline(stats)` 即可；name 必須唯一以免覆寫他人 bucket。

## 相關文件

- [tools/check-size-gates.mjs](../../../tools/check-size-gates.mjs) — bundle size budget（CI 內守備靜態體積）
- [docs/plans/2026-05-12-content-bundle-size-gate-budget.md](../../../docs/plans/2026-05-12-content-bundle-size-gate-budget.md) — size gate 設計背景
- [tests/e2e/specs/save.spec.js](../specs/save.spec.js) — save 流程的功能 e2e（被 perf spec 沿用為 setup pattern 來源）
