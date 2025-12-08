# E2E 測試覆蓋率整合指南

## 概述

本指南說明如何整合 **E2E 測試覆蓋率** 和 **Jest 單元測試覆蓋率**，生成統一的覆蓋率報告。

## 架構說明

### 工作流程

```
┌─────────────────┐     ┌─────────────────┐
│  Jest 單元測試   │     │  E2E 測試       │
│  (JSDOM 環境)   │     │  (真實瀏覽器)   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │ Istanbul              │ Puppeteer
         │ 覆蓋率收集            │ Coverage API
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ coverage/       │     │ coverage/e2e/   │
│ coverage-final  │     │ coverage-final  │
│ .json           │     │ .json           │
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

1. **coverage-config.js** - 覆蓋率收集配置
2. **coverage-collector.js** - E2E 覆蓋率收集器（使用 Puppeteer）
3. **coverage-merger.js** - 覆蓋率合併工具
4. **run-with-coverage.js** - 主執行腳本
5. **scenarios/** - E2E 測試場景

## 安裝依賴

首先安裝必要的依賴包：

```bash
npm install --save-dev \
  puppeteer \
  istanbul-lib-coverage \
  istanbul-lib-report \
  istanbul-reports
```

這些依賴已經添加到 `package.json` 中：

```json
{
  "devDependencies": {
    "puppeteer": "^21.0.0",
    "istanbul-lib-coverage": "^3.2.2",
    "istanbul-lib-report": "^3.0.1",
    "istanbul-reports": "^3.1.7"
  }
}
```

## 使用方法

### 方法 1: 完整測試流程（推薦）

執行完整的測試和覆蓋率收集：

```bash
# 運行所有測試（Jest + E2E）並生成合併報告
npm run test:all
```

這會自動執行：

1. Jest 單元測試 + 覆蓋率收集 → `coverage/`
2. E2E 測試 + Puppeteer 覆蓋率 → `coverage/e2e/`
3. 合併兩者 → `coverage/merged/`

### 方法 2: 單獨執行 E2E 測試

只運行 E2E 測試並收集覆蓋率：

```bash
# E2E 測試 + 覆蓋率合併
npm run test:e2e

# 只運行 E2E 測試（不合併）
npm run test:e2e:only
```

### 方法 3: 手動合併覆蓋率

如果已經有 Jest 和 E2E 覆蓋率數據，可以手動合併：

```bash
npm run test:merge-coverage
```

## 配置說明

### coverage-config.js

配置文件控制所有覆蓋率收集行為：

```javascript
module.exports = {
  // Puppeteer 配置
  puppeteer: {
    headless: true, // CI 環境使用 headless
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    extensionPath: './dist', // Chrome 擴展路徑
  },

  // 覆蓋率收集配置
  coverage: {
    include: ['scripts/**/*.js'], // 包含的文件
    exclude: ['scripts/**/*.test.js'], // 排除的文件
    reporters: ['text', 'json', 'lcov', 'html'],
    dir: 'coverage/e2e', // E2E 覆蓋率輸出
    mergedDir: 'coverage/merged', // 合併後輸出
  },

  // 測試場景
  testScenarios: [
    {
      name: 'Highlighter Workflow',
      file: 'tests/e2e/scenarios/highlighter.e2e.js',
      enabled: true,
    },
  ],
};
```

### 自定義配置

你可以根據需要修改配置：

```javascript
// 添加新的測試場景
testScenarios: [
  {
    name: 'My Custom Test',
    file: 'tests/e2e/scenarios/custom.e2e.js',
    timeout: 60000,
    enabled: true
  }
]

// 修改覆蓋率報告格式
coverage: {
  reporters: ['text-summary', 'json', 'html']
}

// 修改包含/排除規則
coverage: {
  include: [
    'scripts/**/*.js',
    'lib/**/*.js'
  ],
  exclude: [
    '**/*.test.js',
    '**/*.spec.js',
    'scripts/legacy/**'
  ]
}
```

## 創建 E2E 測試場景

### 基本結構

E2E 測試場景是一個導出 `run` 函數的模塊：

```javascript
// tests/e2e/scenarios/my-test.e2e.js
module.exports = {
  name: 'My Test',

  async run(page, config) {
    // 1. 導航到測試頁面
    await page.goto(config.testPages.mdn);

    // 2. 等待元素
    await page.waitForSelector('article');

    // 3. 執行測試邏輯
    const result = await page.evaluate(() => {
      // 在頁面上下文執行的代碼
      return {
        title: document.title,
        paragraphCount: document.querySelectorAll('p').length,
      };
    });

    // 4. 驗證結果
    if (!result.title) {
      throw new Error('No title found');
    }

    console.log('✅ Test passed');
    return result;
  },
};
```

### 完整示例

參考現有的測試場景：

- `tests/e2e/scenarios/highlighter.e2e.js` - 高亮功能測試
- `tests/e2e/scenarios/content-extraction.e2e.js` - 內容提取測試

## 覆蓋率報告

### 查看報告

執行測試後，覆蓋率報告會生成在以下位置：

```
coverage/
├── coverage-final.json    # Jest 覆蓋率（JSON）
├── lcov.info              # Jest 覆蓋率（LCOV）
└── index.html             # Jest 覆蓋率（HTML）

coverage/e2e/
├── coverage-final.json    # E2E 覆蓋率（JSON）
├── lcov.info              # E2E 覆蓋率（LCOV）
└── index.html             # E2E 覆蓋率（HTML）

coverage/merged/
├── coverage-final.json    # 合併覆蓋率（JSON）
├── lcov.info              # 合併覆蓋率（LCOV）
└── index.html             # 合併覆蓋率（HTML）✨
```

**查看 HTML 報告**：

```bash
# macOS
open coverage/merged/index.html

# Linux
xdg-open coverage/merged/index.html

# Windows
start coverage/merged/index.html
```

### 報告格式

#### 終端輸出

```
📊 合併後的覆蓋率摘要
============================================================
語句覆蓋率:   52.34% (1234/2356)
分支覆蓋率:   38.21% (456/1193)
函數覆蓋率:   45.67% (234/512)
行覆蓋率:     51.89% (1198/2310)
============================================================

📈 覆蓋率變化
============================================================
statements  : 46.56% → 52.34% ↗️ +5.78%
branches    : 33.12% → 38.21% ↗️ +5.09%
functions   : 40.23% → 45.67% ↗️ +5.44%
lines       : 46.01% → 51.89% ↗️ +5.88%
============================================================
```

#### JSON 格式

```json
{
  "scripts/background.js": {
    "path": "/path/to/scripts/background.js",
    "statementMap": { ... },
    "fnMap": { ... },
    "branchMap": { ... },
    "s": { "0": 1, "1": 5, ... },
    "f": { "0": 2, "1": 0, ... },
    "b": { "0": [1, 0], ... }
  }
}
```

#### LCOV 格式

可以上傳到 Codecov、Coveralls 等服務：

```
SF:scripts/background.js
FN:10,ScriptInjector
FN:20,injectAndExecute
FNDA:5,ScriptInjector
FNDA:10,injectAndExecute
DA:10,1
DA:11,5
end_of_record
```

## 高級用法

### 1. 加載 Chrome 擴展

如果需要測試實際的 Chrome 擴展行為：

```javascript
// 在 coverage-config.js 中配置擴展路徑
puppeteer: {
  extensionPath: './dist'; // 構建後的擴展目錄
}
```

Puppeteer 會自動加載擴展：

```javascript
// coverage-collector.js 中的實現
this.browser = await puppeteer.launch({
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
```

### 2. 自定義覆蓋率轉換

如果需要更精確的覆蓋率轉換（預設是簡化版）：

```javascript
// 在 coverage-collector.js 中自定義
convertRangesToIstanbul(filePath, text, ranges) {
  // 使用 @babel/parser 解析代碼
  const ast = parser.parse(text, { sourceType: 'module' });

  // 使用 AST 生成更準確的覆蓋率映射
  // ...

  return coverage;
}
```

### 3. 過濾特定文件

只收集特定文件的覆蓋率：

```javascript
shouldIncludeFile(url) {
  // 自定義過濾邏輯
  if (url.includes('vendor') || url.includes('node_modules')) {
    return false;
  }

  // 只包含特定目錄
  return url.includes('/scripts/') || url.includes('/lib/');
}
```

### 4. 添加截圖到報告

在測試失敗時自動截圖：

```javascript
async run(page, config) {
  try {
    // 測試邏輯
  } catch (error) {
    // 截圖保存
    await page.screenshot({
      path: `screenshots/${this.name}-error.png`
    });
    throw error;
  }
}
```

## CI/CD 整合

### GitHub Actions

在 `.github/workflows/test.yml` 中添加：

```yaml
name: Tests with Coverage

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

      - name: Run all tests with coverage
        run: npm run test:all

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/merged/lcov.info
          flags: merged
          name: merged-coverage
```

### 分別上傳不同的覆蓋率

```yaml
- name: Upload Jest coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    flags: unit
    name: unit-tests

- name: Upload E2E coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/e2e/lcov.info
    flags: e2e
    name: e2e-tests

- name: Upload merged coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/merged/lcov.info
    flags: merged
    name: merged-coverage
```

## 故障排除

### 問題 1: Puppeteer 安裝失敗

```bash
# 設置環境變量跳過 Chromium 下載
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install

# 或使用系統 Chrome
puppeteer.launch({ executablePath: '/usr/bin/google-chrome' });
```

### 問題 2: 覆蓋率數據為空

檢查文件路徑匹配：

```javascript
// 在 coverage-collector.js 中添加 debug 日誌
shouldIncludeFile(url) {
  console.log('Checking file:', url);  // Debug
  // ...
}
```

### 問題 3: 擴展加載失敗

確保擴展已構建：

```bash
npm run build
ls -la dist/  # 確認文件存在
```

### 問題 4: 覆蓋率合併錯誤

檢查兩個覆蓋率文件是否存在：

```bash
ls -la coverage/coverage-final.json
ls -la coverage/e2e/coverage-final.json
```

## 最佳實踐

### 1. 先運行單元測試

```bash
# 分步驟執行，更容易調試
npm run test:coverage  # 先確保單元測試通過
npm run test:e2e       # 再運行 E2E 測試
```

### 2. 使用 headless 模式（CI）

```javascript
// CI 環境自動使用 headless
puppeteer: {
  headless: process.env.CI === 'true',
}
```

### 3. 設置合理的超時時間

```javascript
testScenarios: [
  {
    name: 'Complex Test',
    timeout: 60000, // 複雜測試給更長時間
  },
];
```

### 4. 定期更新覆蓋率基準

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    statements: 50,  // 從 46% 提升到 50%
    branches: 35,    // 從 33% 提升到 35%
    functions: 42,   // 從 40% 提升到 42%
    lines: 50        // 從 46% 提升到 50%
  }
}
```

## 參考資源

- [Puppeteer Coverage API](https://pptr.dev/api/puppeteer.coverage)
- [Istanbul.js Documentation](https://istanbul.js.org/)
- [Jest Coverage Configuration](https://jestjs.io/docs/configuration#collectcoveragefrom-array)
- [Codecov Documentation](https://docs.codecov.com/)

## 總結

使用這套整合方案，你可以：

✅ **收集真實瀏覽器環境的覆蓋率**（E2E 測試）
✅ **保留 JSDOM 環境的覆蓋率**（單元測試）
✅ **生成統一的覆蓋率報告**（合併後）
✅ **追蹤覆蓋率變化**（對比報告）
✅ **集成到 CI/CD**（自動化）

**預期覆蓋率提升**：

| 模塊              | 當前       | E2E 後     | 提升        |
| ----------------- | ---------- | ---------- | ----------- |
| background.js     | 6.92%      | 40-50%     | +33-43%     |
| content.js        | 31.53%     | 60-70%     | +28-38%     |
| highlighter-v2.js | 18.78%     | 55-65%     | +36-46%     |
| **整體**          | **46.56%** | **65-75%** | **+18-28%** |
