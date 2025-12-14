# E2E 測試覆蓋率整合指南 (Playwright 版)

## 概述

本指南說明如何使用 **Playwright** 整合 **E2E 測試覆蓋率** 和 **Jest 單元測試覆蓋率**，生成統一的覆蓋率報告。

## 架構說明

### 工作流程

```
┌─────────────────┐     ┌─────────────────┐
│  Jest 單元測試   │     │  E2E 測試       │
│  (JSDOM 環境)   │     │  (Playwright)   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │ Istanbul              │ V8 Coverage
         │ 覆蓋率收集            │ Coverage API
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ coverage/       │     │ .nyc_output/    │
│ coverage-final  │     │ playwright-*.   │
│ .json           │     │ json            │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │ 覆蓋率合併   │
              │ (Istanbul)  │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │ coverage/   │
              │ merged/     │
              │ 統一報告    │
              └─────────────┘
```

### 核心組件

1.  **playwright.config.js** - Playwright 測試配置
2.  **tests/e2e/fixtures.js** - 測試 Fixtures 與覆蓋率收集邏輯
3.  **tests/e2e/coverage-merger.js** - 覆蓋率合併工具
4.  **tests/e2e/specs/** - E2E 測試規範文件

## 安裝依賴

依賴已包含在 `package.json` 中：

```bash
npm install
```

主要依賴：

- `@playwright/test`
- `v8-to-istanbul` (用於轉換 Playwright V8 覆蓋率數據)
- `istanbul-lib-coverage`
- `istanbul-lib-report`
- `istanbul-reports`

## 使用方法

### 方法 1: 完整測試流程（推薦）

執行完整的測試和覆蓋率收集：

```bash
# 運行所有測試（Jest + Playwright）並生成合併報告
npm run test:all
```

這會自動執行：

1.  Jest 單元測試 + 覆蓋率收集 → `coverage/`
2.  Playwright E2E 測試 + V8 覆蓋率 → `.nyc_output/`
3.  合併兩者 → `coverage/merged/`

### 方法 2: 單獨執行 E2E 測試

只運行 E2E 測試：

```bash
# 運行 Playwright 測試
npm run test:e2e
```

### 方法 3: 手動合併覆蓋率

如果已經有 Jest 和 E2E 覆蓋率數據，可以手動合併：

```bash
npm run test:merge-coverage
```

## 配置說明

### playwright.config.js

Playwright 的核心配置：

```javascript
module.exports = defineConfig({
  testDir: './tests/e2e/specs',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  use: {
    actionTimeout: 0,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

### 覆蓋率收集邏輯 (fixtures.js)

我們通過擴展 Playwright 的 `test` fixture 來自動收集覆蓋率：

1.  在 `context` 初始化時，開啟 JS 覆蓋率收集 (`page.coverage.startJSCoverage`)。
2.  在測試結束時，停止收集 (`page.coverage.stopJSCoverage`)。
3.  過濾 Chrome Extension 的腳本（移除 node_modules 和第三方庫）。
4.  使用 `v8-to-istanbul` 將 V8 格式轉換為 Istanbul 格式。
5.  將覆蓋率數據保存到 `.nyc_output/` 目錄下的 JSON 文件中。

## 創建 E2E 測試場景

### 基本結構

在 `tests/e2e/specs/` 下創建 `.spec.js` 文件：

```javascript
import { test, expect } from '../fixtures';

test('My Test Case', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');

  // 測試邏輯...
  expect(await page.title()).toBe('Example Domain');
});
```

`fixtures.js` 提供了 `extensionId` 和自動覆蓋率收集的 `context`。

## 覆蓋率報告

### 查看報告

執行測試後，覆蓋率報告會生成在以下位置：

```
coverage/
├── coverage-final.json    # Jest 覆蓋率
└── ...

.nyc_output/               # Playwright 原始覆蓋率數據 (JSON)

coverage/merged/
├── coverage-final.json    # 合併覆蓋率（JSON）
├── lcov.info              # 合併覆蓋率（LCOV）
└── index.html             # 合併覆蓋率（HTML）✨
```

**查看 HTML 報告**：

```bash
open coverage/merged/index.html
```

## CI/CD 整合

### GitHub Actions

`.github/workflows/ci.yml` 已經配置好：

```yaml
- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run E2E Tests
  run: npm run test:e2e

- name: Merge Coverage
  if: always()
  run: npm run test:merge-coverage
```

## 故障排除

### 問題 1: 測試執行失敗

檢查 Playwright 報告：

```bash
npx playwright show-report
```

### 問題 2: 覆蓋率數據為空

確保：

1.  已執行 `npm run build` 生成 `dist/`。
2.  測試實際執行了目標代碼路徑。
3.  `.nyc_output` 目錄中有生成的 JSON 文件。

### 問題 3: 擴充功能未加載

確保 `fixtures.js` 中的 `pathToExtension` 指向正確的 `dist/` 目錄。

## 總結

使用 Playwright 替換 Puppeteer 後，我們獲得了：
✅ **更穩定的測試執行** (自動等待機制)
✅ **更快的執行速度** (並行測試)
✅ **原生的擴充功能支持**
✅ **強大的調試工具** (Trace Viewer, UI Mode)

繼續保持測試習慣，運行 `npm run test:all` 確保代碼質量！
