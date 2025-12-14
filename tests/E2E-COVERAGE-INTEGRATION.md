# E2E 測試覆蓋率整合方案 (Playwright)

## 📌 方案概述

本方案實現了 **Playwright E2E 測試** 和 **Jest 單元測試** 的覆蓋率整合，解決了瀏覽器環境代碼無法被 Jest 覆蓋率統計的問題。

## 🎯 解決的問題

### 問題描述

在之前的測試架構中：
- **Jest 單元測試**（JSDOM 環境）只能測試純邏輯代碼
- **Chrome Extension APIs** 無法在 JSDOM 中真實運行
- **CSS Highlight API** 等瀏覽器專有 API 無法測試
- **實際的擴展行為** 無法驗證
- **覆蓋率統計不完整**（46.56%，大量真實執行的代碼未統計）

### 解決方案

使用 **Playwright + V8 Coverage** 整合方案：

```
Jest 測試 (JSDOM)          E2E 測試 (Playwright)
      ↓                          ↓
  Istanbul 覆蓋率          V8 Coverage 收集
      ↓                          ↓
coverage-final.json      .nyc_output/*.json
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
│   ├── playwright.config.js       # Playwright 主配置
│   └── fixtures.js               # 測試環境與覆蓋率收集配置
│
├── 🔧 核心工具
│   ├── coverage-merger.js        # 覆蓋率合併工具
│   └── coverage-config.js        # 輔助配置
│
├── 🧪 測試用例
│   └── specs/
│       └── highlight.spec.js     # 高亮功能測試
│
└── 📚 文檔
    ├── README.md                 # 5分鐘快速開始 (原 QUICK-START)
    ├── COVERAGE-GUIDE.md         # 完整架構指南 (原 E2E-COVERAGE-GUIDE)
    ├── MIGRATION-STATUS.md       # 遷移狀態總結 (原 IMPLEMENTATION-SUMMARY)
    └── MCP-TESTING.md            # MCP 交互式測試指南 (原 GETTING-STARTED)
```

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

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
| `test:e2e` | E2E + 合併 | Playwright 測試 + 覆蓋率合併 |
| `test:merge-coverage` | 手動合併 | 合併已有的覆蓋率數據 |

## 📚 詳細文檔

| 文檔 | 說明 | 適合對象 |
|------|------|---------|
| [README.md](e2e/README.md) | 5分鐘快速開始 | 新手 ⭐ |
| [COVERAGE-GUIDE.md](e2e/COVERAGE-GUIDE.md) | 完整使用指南 | 進階用戶 |
| [MIGRATION-STATUS.md](e2e/MIGRATION-STATUS.md) | 遷移狀態總結 | 團隊成員 |
| [MCP-TESTING.md](e2e/MCP-TESTING.md) | MCP 交互式測試 | 開發者 |

## ❓ 常見問題

### Q: 為什麼選擇 Playwright 而非 Puppeteer？

**A**:
- **原生 Extension 支持**: Playwright 提供了更加簡潔的 Extension 加載方式。
- **自動等待**: 減少了大量的 `wait_for` 樣板代碼，測試更穩定。
- **UI 調試**: `npx playwright test --ui` 提供了極佳的開發體驗。

### Q: 運行速度如何？

**A**:
- Playwright 支持並行測試，執行速度顯著優于串行的 Puppeteer。
- 完整測試套件（Jest + Playwright）通常在 1 分鐘內完成。

## 🎉 總結

✅ **現代化技術棧** - Playwright + V8 Coverage
✅ **完整自動化** - 一鍵運行，自動合併
✅ **文檔清晰** - 結構化文檔，容易上手

**開始使用**：
```bash
npm run test:all
```
