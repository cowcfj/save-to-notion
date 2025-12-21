# E2E 測試快速開始 (Playwright)

## 🚀 5 分鐘快速開始

### 1. 安裝依賴

```bash
npm install
```

這會安裝 Playwright 及其依賴。如果需要安裝瀏覽器二進制文件：

```bash
npx playwright install
```

### 2. 構建擴展

E2E 測試需要測試構建後的擴展：

```bash
npm run build
```

確保 `dist/` 目錄已生成。

### 3. 運行測試

```bash
# 方式 A: 運行所有測試（推薦 - 單元測試 + E2E + 覆蓋率合併）
npm run test:all

# 方式 B: 只運行 E2E 測試
npm run test:e2e
```

### 4. 查看報告

測試完成後，會生成多種報告：

**Playwright 測試報告 (HTML)**:

```bash
npx playwright show-report
```

**覆蓋率報告 (HTML)**:

```bash
open coverage/merged/index.html
```

## 📊 預期輸出

運行 `npm run test:e2e` 時，你應該看到類似以下的輸出：

```
Running 1 test using 1 worker
  1 passed (5.5s)

To open last HTML report run:
  npx playwright show-report
```

覆蓋率合併腳本會輸出：

```
✨ Coverage merged successfully!
Report generated at: .../coverage/merged/index.html
```

## 📁 主要文件結構

```
tests/e2e/
├── specs/             # 測試用例 (*.spec.js)
│   └── highlight.spec.js
├── fixtures.js        # Playwright Fixtures (擴展加載、覆蓋率收集)
├── coverage-merger.js # 覆蓋率合併工具
├── playwright.config.js # 配置文件 (項目根目錄或此處)
├── README.md          # 本指南
└── COVERAGE-GUIDE.md  # 覆蓋率整合深度指南
```

## 📝 常用命令

| 命令                          | 說明                                 |
| ----------------------------- | ------------------------------------ |
| `npm run test:e2e`            | 運行 E2E 測試                        |
| `npx playwright test --ui`    | 啟動 Playwright UI 模式 (交互式調試) |
| `npx playwright test --debug` | 啟動調試模式 (逐步執行)              |
| `npx playwright show-report`  | 查看測試結果報告                     |

## 💡 開發貼士

1.  **UI 模式**: 使用 `npx playwright test --ui` 可以直觀地看到瀏覽器操作和每一步的狀態，非常適合開發新測試。
2.  **Trace Viewer**: 測試失敗時，Playwright 會自動保存 Trace（如果配置了）。使用 `npx playwright show-trace path/to/trace.zip` 查看詳細執行過程。
3.  **自動等待**: Playwright 自動等待元素就緒，通常不需要手動 `wait_for`。

祝你測試順利！ 🚀
