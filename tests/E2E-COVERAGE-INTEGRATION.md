# E2E 測試覆蓋率整合方案

## 📌 方案概述

本方案實現了 **Puppeteer E2E 測試** 和 **Jest 單元測試** 的覆蓋率整合，解決了瀏覽器環境代碼無法被 Jest 覆蓋率統計的問題。

## 🎯 解決的問題

### 問題描述

在之前的測試架構中：
- **Jest 單元測試**（JSDOM 環境）只能測試純邏輯代碼
- **Chrome Extension APIs** 無法在 JSDOM 中真實運行
- **CSS Highlight API** 等瀏覽器專有 API 無法測試
- **實際的擴展行為** 無法驗證
- **覆蓋率統計不完整**（46.56%，大量真實執行的代碼未統計）

### 解決方案

使用 **Puppeteer + Coverage API** 整合方案：

```
Jest 測試 (JSDOM)          E2E 測試 (Puppeteer)
      ↓                          ↓
  Istanbul 覆蓋率          Coverage API 收集
      ↓                          ↓
coverage-final.json      e2e/coverage-final.json
      ↓                          ↓
      └──────────┬───────────────┘
                 ↓
          覆蓋率合併 (Istanbul)
                 ↓
        merged/coverage-final.json
                 ↓
       統一的 HTML/LCOV 報告
```

## 📂 文件結構

```
tests/e2e/
├── 📋 配置文件
│   └── coverage-config.js          # 主配置（測試場景、路徑等）
│
├── 🔧 核心工具
│   ├── coverage-collector.js       # E2E 覆蓋率收集器
│   ├── coverage-merger.js          # 覆蓋率合併工具
│   └── run-with-coverage.js        # 主執行腳本
│
├── 🧪 測試場景
│   └── scenarios/
│       ├── highlighter.e2e.js      # 高亮功能測試
│       └── content-extraction.e2e.js  # 內容提取測試
│
└── 📚 文檔
    ├── QUICK-START.md              # 5分鐘快速開始
    ├── E2E-COVERAGE-GUIDE.md       # 完整使用指南
    ├── IMPLEMENTATION-SUMMARY.md   # 實施總結
    ├── GETTING-STARTED.md          # MCP E2E 入門
    ├── README-MCP-E2E.md           # MCP E2E 說明
    └── TEST-RESULTS.md             # 測試記錄
```

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

新增的依賴：
- `puppeteer@^21.0.0` - 瀏覽器自動化
- `istanbul-lib-coverage@^3.2.2` - 覆蓋率數據處理
- `istanbul-lib-report@^3.0.1` - 報告生成
- `istanbul-reports@^3.1.7` - 報告格式化

### 2. 構建擴展

```bash
npm run build
```

### 3. 運行測試

```bash
# 推薦：完整測試流程
npm run test:all

# 或分步執行
npm run test:coverage         # Jest 單元測試
npm run test:e2e             # E2E 測試 + 合併
```

### 4. 查看報告

```bash
open coverage/merged/index.html
```

## 📊 新增的 npm 腳本

| 命令 | 說明 | 執行內容 |
|------|------|---------|
| `test:all` | 完整測試流程 | Jest → E2E → 合併 |
| `test:e2e` | E2E + 合併 | E2E 測試 + 覆蓋率合併 |
| `test:e2e:only` | 僅 E2E 測試 | 不合併覆蓋率 |
| `test:merge-coverage` | 手動合併 | 合併已有的覆蓋率數據 |

## 🎨 覆蓋率報告位置

```
coverage/
├── coverage-final.json        # Jest 覆蓋率
├── lcov.info                  # Jest LCOV
├── index.html                 # Jest HTML 報告
│
├── e2e/
│   ├── coverage-final.json    # E2E 覆蓋率
│   ├── lcov.info              # E2E LCOV
│   └── index.html             # E2E HTML 報告
│
└── merged/                    # ✨ 合併後報告
    ├── coverage-final.json    # 統一覆蓋率 JSON
    ├── lcov.info              # 統一 LCOV（可上傳 Codecov）
    └── index.html             # 👈 打開這個查看完整報告
```

## 📈 預期效果

### 覆蓋率提升

| 模塊 | 當前 | 整合後 | 提升 |
|------|------|--------|------|
| background.js | 6.92% | 40-50% | +33-43% ⬆️ |
| content.js | 31.53% | 60-70% | +28-38% ⬆️ |
| highlighter-v2.js | 18.78% | 55-65% | +36-46% ⬆️ |
| **總計** | **46.56%** | **65-75%** | **+18-28%** ⬆️ |

### 測試覆蓋範圍

✅ **Jest 單元測試** - 純邏輯、工具函數
✅ **E2E 測試** - 瀏覽器 API、擴展行為、UI 交互
✅ **統一報告** - 完整的代碼覆蓋率視圖

## 🔍 技術實現細節

### Puppeteer Coverage API

```javascript
// 啟動覆蓋率收集
await page.coverage.startJSCoverage({
  resetOnNavigation: false,
  reportAnonymousScripts: true
});

// 執行測試...

// 停止並獲取覆蓋率
const coverage = await page.coverage.stopJSCoverage();
```

### Istanbul 格式轉換

```javascript
// Puppeteer 格式 → Istanbul 格式
const coverageMap = createCoverageMap({});

for (const entry of coverage) {
  const istanbulCoverage = convertRangesToIstanbul(
    entry.url,
    entry.text,
    entry.ranges
  );
  coverageMap.addFileCoverage(istanbulCoverage);
}
```

### 覆蓋率合併

```javascript
// 加載 Jest 覆蓋率
const jestCoverage = JSON.parse(
  fs.readFileSync('coverage/coverage-final.json')
);

// 加載 E2E 覆蓋率
const e2eCoverage = JSON.parse(
  fs.readFileSync('coverage/e2e/coverage-final.json')
);

// 合併
coverageMap.merge(jestCoverage);
coverageMap.merge(e2eCoverage);

// 生成報告
generateReports(coverageMap, 'coverage/merged');
```

## 📝 創建自定義測試

### 1. 創建測試場景文件

```javascript
// tests/e2e/scenarios/my-test.e2e.js
module.exports = {
  name: 'My Custom Test',

  async run(page, config) {
    // 導航到測試頁面
    await page.goto('https://example.com');

    // 執行測試邏輯
    const result = await page.evaluate(() => {
      // 在頁面上下文執行的代碼
      return {
        title: document.title,
        testPassed: true
      };
    });

    // 驗證結果
    if (!result.testPassed) {
      throw new Error('Test failed');
    }

    console.log('✅ Test passed');
    return result;
  }
};
```

### 2. 添加到配置

```javascript
// coverage-config.js
testScenarios: [
  // 現有場景...
  {
    name: 'My Custom Test',
    file: 'tests/e2e/scenarios/my-test.e2e.js',
    timeout: 30000,
    enabled: true
  }
]
```

### 3. 運行測試

```bash
npm run test:e2e
```

## 🛠️ CI/CD 整合

### GitHub Actions 示例

```yaml
# .github/workflows/test.yml
name: Test with E2E Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Run all tests
        run: npm run test:all

      - name: Upload merged coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/merged/lcov.info
          flags: merged
```

## 📚 詳細文檔

| 文檔 | 說明 | 適合對象 |
|------|------|---------|
| [QUICK-START.md](e2e/QUICK-START.md) | 5分鐘快速開始 | 新手 ⭐ |
| [E2E-COVERAGE-GUIDE.md](e2e/E2E-COVERAGE-GUIDE.md) | 完整使用指南 | 進階用戶 |
| [IMPLEMENTATION-SUMMARY.md](e2e/IMPLEMENTATION-SUMMARY.md) | 實施總結 | 團隊成員 |

## ❓ 常見問題

### Q: 為什麼需要 E2E 測試覆蓋率？

**A**: 因為 Chrome Extension 的很多功能只能在真實瀏覽器中運行：
- `chrome.storage.local` - Chrome 存儲 API
- `CSS.highlights` - CSS Highlight API
- `chrome.runtime` - 擴展運行時 API
- 真實的 DOM 渲染和交互

### Q: E2E 測試會取代單元測試嗎？

**A**: 不會。兩者互補：
- **單元測試** - 快速、隔離、測試邏輯
- **E2E 測試** - 真實、集成、測試行為
- **合併覆蓋率** - 完整的代碼覆蓋視圖

### Q: 運行速度如何？

**A**:
- Jest 單元測試: ~10 秒
- E2E 測試: ~30 秒
- 總計: ~40-50 秒（可並行優化）

### Q: 如何調試 E2E 測試？

**A**:
```javascript
// 使用非 headless 模式
puppeteer: {
  headless: false,  // 看到瀏覽器窗口
  slowMo: 100       // 減慢操作速度
}

// 添加截圖
await page.screenshot({ path: 'debug.png' });
```

## 🎓 最佳實踐

### 1. 測試分層

```
E2E 測試 (30%)
  ↑ 測試完整流程和集成

集成測試 (40%)
  ↑ 測試模塊間交互

單元測試 (70%)
  ↑ 測試獨立功能
```

### 2. 優先順序

1. **先寫單元測試** - 快速、便宜、易維護
2. **再寫 E2E 測試** - 覆蓋關鍵流程
3. **定期運行兩者** - 保持覆蓋率

### 3. 覆蓋率目標

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    statements: 50,  // 逐步提升
    branches: 35,
    functions: 42,
    lines: 50
  }
}
```

## 🎉 總結

✅ **完整的技術方案** - Puppeteer + Istanbul + Jest
✅ **自動化流程** - 一鍵收集和合併覆蓋率
✅ **詳盡的文檔** - 從快速開始到進階配置
✅ **實用的示例** - 高亮器和內容提取測試
✅ **可擴展架構** - 輕鬆添加新測試場景

**開始使用**：
```bash
npm install
npm run test:all
open coverage/merged/index.html
```

**預期結果**: 覆蓋率從 46.56% 提升到 **65-75%** 🚀

---

**創建日期**: 2025-01-20
**維護者**: 測試團隊
**狀態**: ✅ 已完成，可用於生產
