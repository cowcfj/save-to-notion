# E2E 覆蓋率整合 - 快速開始

## 🚀 5 分鐘快速開始

### 1. 安裝依賴

```bash
npm install
```

新增的依賴：
- `puppeteer` - 瀏覽器自動化
- `istanbul-lib-coverage` - 覆蓋率數據處理
- `istanbul-lib-report` - 覆蓋率報告生成
- `istanbul-reports` - 覆蓋率報告格式

### 2. 構建擴展

```bash
npm run build
```

確保 `dist/` 目錄已生成。

### 3. 運行測試

```bash
# 方式 A: 運行所有測試（推薦）
npm run test:all

# 方式 B: 只運行 E2E 測試
npm run test:e2e

# 方式 C: 分步執行
npm run test:coverage    # 先運行 Jest 單元測試
npm run test:e2e:only    # 再運行 E2E 測試
npm run test:merge-coverage  # 最後合併覆蓋率
```

### 4. 查看報告

```bash
# macOS
open coverage/merged/index.html

# 或在終端直接查看
cat coverage/merged/lcov-report/index.html
```

## 📊 預期輸出

### 終端輸出示例

```
🚀 E2E 測試覆蓋率收集器
============================================================

📝 步驟 1/2: 執行 E2E 測試...

🚀 啟動 Puppeteer 瀏覽器...
✅ 瀏覽器啟動成功
📊 開始 JavaScript 覆蓋率收集...

🧪 執行測試場景: Highlighter Workflow
  📝 開始高亮功能測試...
  1️⃣ 導航到 MDN JavaScript Guide...
  2️⃣ 等待文章內容加載...
  3️⃣ 驗證頁面結構...
     ✅ 找到 32 個段落
  4️⃣ 測試文本選擇...
     ✅ 成功選擇文本: "The JavaScript Guide shows..."
  5️⃣ 檢測 CSS Highlight API 支持...
     ✅ window.Highlight API
     ✅ CSS.highlights registry
  6️⃣ 測試創建 CSS Highlight...
     ✅ 成功創建高亮，當前共有 1 個高亮
  7️⃣ 測試高亮數據持久化...
     ✅ 成功保存 1 個高亮到 localStorage
  8️⃣ 測試頁面刷新後恢復...
     ✅ 成功恢復 1 個高亮
  ✅ 高亮功能測試完成！

✅ Highlighter Workflow - 測試通過

🛑 停止覆蓋率收集...
✅ 收集到 15 個 JavaScript 文件的覆蓋率數據

🔄 轉換覆蓋率格式為 Istanbul...
✅ 轉換完成，包含 8 個文件

💾 保存覆蓋率報告到: coverage/e2e
  ✅ text 報告已生成
  ✅ json 報告已生成
  ✅ lcov 報告已生成
  ✅ html 報告已生成
✅ 所有覆蓋率報告已生成

============================================================
📊 E2E 測試結果摘要
============================================================
✅ Highlighter Workflow
✅ Content Extraction

總計: 2/2 通過
============================================================

📝 步驟 2/2: 合併覆蓋率報告...

📖 加載 Jest 單元測試覆蓋率...
✅ 已加載 42 個文件的 Jest 覆蓋率
📖 加載 E2E 測試覆蓋率...
✅ 已加載 8 個文件的 E2E 覆蓋率

📊 生成合併後的覆蓋率報告...
  ✅ text 報告已生成
  ✅ json 報告已生成
  ✅ lcov 報告已生成
  ✅ html 報告已生成

✅ 所有報告已保存到: coverage/merged

============================================================
📊 合併後的覆蓋率摘要
============================================================

語句覆蓋率:   52.34% (1234/2356)
分支覆蓋率:   38.21% (456/1193)
函數覆蓋率:   45.67% (234/512)
行覆蓋率:     51.89% (1198/2310)

============================================================

============================================================
📈 覆蓋率變化
============================================================
statements  : 46.56% → 52.34% ↗️ +5.78%
branches    : 33.12% → 38.21% ↗️ +5.09%
functions   : 40.23% → 45.67% ↗️ +5.44%
lines       : 46.01% → 51.89% ↗️ +5.88%
============================================================

============================================================
🎉 測試覆蓋率收集完成！
============================================================

📊 報告位置:
   - E2E 覆蓋率:    coverage/e2e
   - 合併覆蓋率:    coverage/merged

📈 覆蓋率提升:
   - 語句: 46.56% → 52.34%
   - 分支: 33.12% → 38.21%
   - 函數: 40.23% → 45.67%
   - 行數: 46.01% → 51.89%

💡 查看詳細報告: open coverage/merged/index.html

============================================================
```

## 📁 生成的文件結構

```
coverage/
├── coverage-final.json         # Jest 覆蓋率（JSON）
├── lcov.info                   # Jest 覆蓋率（LCOV）
├── lcov-report/                # Jest 覆蓋率（HTML）
│   └── index.html
│
├── e2e/
│   ├── coverage-final.json     # E2E 覆蓋率（JSON）
│   ├── lcov.info               # E2E 覆蓋率（LCOV）
│   └── lcov-report/            # E2E 覆蓋率（HTML）
│       └── index.html
│
└── merged/
    ├── coverage-final.json     # 合併覆蓋率（JSON）✨
    ├── lcov.info               # 合併覆蓋率（LCOV）✨
    └── lcov-report/            # 合併覆蓋率（HTML）✨
        └── index.html          # 👈 打開這個查看完整報告
```

## 🎯 npm 腳本說明

| 命令 | 說明 |
|------|------|
| `npm test` | 運行 Jest 單元測試 |
| `npm run test:coverage` | 運行 Jest 單元測試 + 覆蓋率 |
| `npm run test:e2e` | 運行 E2E 測試 + 合併覆蓋率 |
| `npm run test:e2e:only` | 只運行 E2E 測試（不合併） |
| `npm run test:merge-coverage` | 手動合併覆蓋率 |
| `npm run test:all` | 運行所有測試 + 合併覆蓋率 ⭐ |

## 🔧 配置文件

- `tests/e2e/coverage-config.js` - 主配置文件
- `tests/e2e/scenarios/*.e2e.js` - 測試場景
- `jest.config.js` - Jest 配置（不需要修改）

## 📝 創建新的測試場景

1. 在 `tests/e2e/scenarios/` 創建新文件：

```javascript
// tests/e2e/scenarios/my-test.e2e.js
module.exports = {
  name: 'My Test',

  async run(page, config) {
    // 測試邏輯
    await page.goto('https://example.com');
    const result = await page.evaluate(() => {
      return { title: document.title };
    });
    return result;
  }
};
```

2. 在 `coverage-config.js` 中啟用：

```javascript
testScenarios: [
  // ... 現有場景
  {
    name: 'My Test',
    file: 'tests/e2e/scenarios/my-test.e2e.js',
    enabled: true
  }
]
```

3. 運行測試：

```bash
npm run test:e2e
```

## ❓ 常見問題

### Q1: 為什麼覆蓋率沒有提升？

A: 檢查以下幾點：
1. 是否運行了 `npm run build` 構建擴展？
2. E2E 測試是否實際執行了目標代碼？
3. 查看 `coverage/e2e/` 是否有覆蓋率數據？

### Q2: Puppeteer 下載失敗怎麼辦？

A: 使用環境變量跳過下載：

```bash
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install
```

然後在配置中指定系統 Chrome：

```javascript
puppeteer: {
  executablePath: '/usr/bin/google-chrome'
}
```

### Q3: 測試運行很慢怎麼辦？

A: 減少測試場景數量：

```javascript
testScenarios: [
  { name: 'Highlighter', enabled: true },
  { name: 'Content Extraction', enabled: false }  // 暫時禁用
]
```

### Q4: 如何在 CI 中運行？

A: 在 GitHub Actions 中添加：

```yaml
- name: Run tests with coverage
  run: npm run test:all

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/merged/lcov.info
```

## 🎓 下一步

- 📖 閱讀完整文檔: `E2E-COVERAGE-GUIDE.md`
- 🧪 查看測試場景: `scenarios/highlighter.e2e.js`
- 🛠️ 自定義配置: `coverage-config.js`
- 📊 查看 HTML 報告: `open coverage/merged/index.html`

## 💡 技術原理

```
Jest 測試 (JSDOM)
    ↓
Istanbul 插桩
    ↓
覆蓋率數據 (coverage-final.json)

E2E 測試 (Puppeteer)
    ↓
Puppeteer Coverage API
    ↓
轉換為 Istanbul 格式
    ↓
覆蓋率數據 (e2e/coverage-final.json)

兩者合併
    ↓
統一報告 (merged/)
```

## 🎉 開始測試！

```bash
npm run test:all
```

祝你測試順利！ 🚀
