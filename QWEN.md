# QWEN.md - Notion Smart Clipper 項目上下文

## 項目概述

Notion Smart Clipper 是一個 Chrome 擴展，用於將網頁內容保存到 Notion，支持多色標註和智能內容提取。該擴展使用最新的 Chrome 擴展標準 (Manifest V3)，並具有豐富的功能集，包括智能內容提取、圖片處理、多色標註系統、模板自定義等。

### 核心技術和架構

- **Chrome Extension Manifest V3**: 使用最新的 Chrome 擴展標準
- **JavaScript**: 主要開發語言
- **CSS Highlight API**: 使用瀏覽器原生 API 實現標註功能，零 DOM 修改
- **Mozilla Readability**: 用於智能提取網頁主要內容
- **Jest**: 用於單元測試和集成測試

### 項目結構

```
notion-chrome/
├── manifest.json          # 擴展配置文件
├── package.json           # npm 配置文件
├── README.md              # 項目說明文件
├── USER_GUIDE.md          # 用戶指南
├── CHANGELOG.md           # 變更日誌
├── Agents.md              # AI Agent 工作指南
├── .github/               # GitHub 配置
│   └── workflows/          # GitHub Actions 工作流程
├── popup/                 # 彈出窗口 UI
├── options/               # 設置頁面（含搜索式數據庫選擇器）
├── scripts/               # 核心腳本
│   ├── background.js      # 後台腳本（Notion API、批處理）
│   ├── content.js         # 內容腳本（提取、圖片處理）
│   ├── highlighter-v2.js  # 新一代標註引擎（CSS Highlight API）
│   ├── performance/       # 性能優化模組
│   │   ├── PerformanceOptimizer.js     # 性能優化器
│   │   └── AdaptivePerformanceManager.js # 自適應性能管理器
│   └── utils.js           # 工具函數
├── lib/                   # 第三方庫
│   └── Readability.js     # Mozilla Readability
├── tests/                 # 測試文件（Jest）
│   ├── unit/              # 單元測試
│   │   ├── performance/    # 性能測試
│   │   │   ├── PerformanceOptimizer.test.js        # 基本性能測試
│   │   │   └── PerformanceOptimizerAdvanced.test.js # 進階性能測試
│   │   └── ...            # 其他單元測試
│   └── helpers/           # 測試輔助文件
│       └── performance.testable.js  # 可測試的性能優化器
└── icons/                 # 圖標文件
```

## 構建和運行

### 安裝依賴

```bash
npm install
```

### 運行測試

```bash
# 運行所有測試
npm test

# 運行測試並生成覆蓋率報告
npm run test:coverage

# 運行測試並監聽文件變化
npm run test:watch

# 運行 CI 測試（無交互模式）
npm run test:ci
```

### 開發模式安裝擴展

1. 打開 Chrome 瀏覽器，訪問 `chrome://extensions/`
2. 開啟「開發者模式」
3. 點擊「載入未封裝項目」
4. 選擇項目根目錄

## 開發約定

### 編碼風格

- **JavaScript**: 遵循 ES6+ 語法標準
- **模組化**: 使用 CommonJS 模組系統
- **錯誤處理**: 完善的錯誤處理和日誌記錄
- **性能**: 關注性能優化，特別是在 DOM 操作和網絡請求方面

### 測試實踐

- **測試框架**: Jest
- **測試類型**: 單元測試、集成測試
- **測試覆蓋率**: 目標是保持高測試覆蓋率
- **測試文件**: 測試文件放在 `tests/` 目錄下，與被測文件一一對應

### 性能優化系統

Notion Smart Clipper v2.9.0 引入了全新的性能優化系統，包括：

1. **DOM 查詢緩存**: 實施 LRU 緩存策略，重複查詢性能提升 20-50%
2. **批處理系統**: 圖片和 DOM 操作智能批量化，提升響應性和用戶體驗
3. **智能預加載**: 關鍵選擇器預加載機制，減少首次查詢延遲
4. **URL 驗證緩存**: 避免重複驗證相同圖片 URL，提升圖片處理速度
5. **性能監控**: 實時收集和顯示性能統計，包括緩存命中率、查詢時間等

新增的性能優化功能包括：
- **緩存預熱機制**: `preloadSelectors` 和 `smartPrewarm` 方法
- **TTL (Time-To-Live) 機制**: 緩存過期時間管理
- **自適應性能策略**: `AdaptivePerformanceManager` 動態調整性能參數
- **改進的批處理調度算法**: 動態計算最佳批處理大小並非阻塞處理

### 貢獻指南

- **分支命名**: 使用 `feature/`, `fix/`, `chore/`, `docs/`, `refactor/` 等前綴
- **提交訊息**: 遵循 Conventional Commits 規範
- **Pull Request**: 使用提供的 PR 模板
- **代碼審核**: 所有代碼變更都需要通過代碼審核