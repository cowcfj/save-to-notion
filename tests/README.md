# 📦 Notion Smart Clipper 測試套件

## 📂 目錄結構

### ✅ 單元測試（Jest）- 同步到 GitHub
- `unit/` - 單元測試文件
  - `background/` - background.js 相關測試
  - `utils/` - utils.js 工具函數測試
  - `content/` - content.js 內容提取測試
- `helpers/` - 測試輔助文件
  - `*.testable.js` - 可測試版本的模塊
- `mocks/` - Mock 對象（Chrome API 等）
- `setup.js` - Jest 測試環境設置
- `jest.config.js` - Jest 配置（項目根目錄）

### 🔒 E2E 測試（不同步到 GitHub）
- `e2e/` - 自動化 E2E 測試腳本
  - `automated-test-suite.js` - 完整的自動化測試套件
    - 使用 Chrome DevTools MCP 進行自動化測試
    - 測試 15+ 個不同類型的網站
    - Icon 提取、封面圖識別、元數據提取
    - 自動生成測試報告
  - `test-update-flow.js` - 更新流程測試
  - `test-update-notification.js` - 更新通知測試
  - `verify-*.js` - 各種驗證腳本

### 🔒 手動測試頁面（不同步到 GitHub）
- `manual/` - 手動測試 HTML 文件
  - `highlight-test.html` - 標註功能測試
  - `test-highlighting.html` - 標註系統測試
  - `list-test.html` - 列表標註測試
  - `long-text-test.html` - 長文本處理測試
  - `css-highlight-api-test.html` - CSS Highlight API 測試
  - `highlighter-comparison.html` - 新舊版本對比
  - `migration-test-suite.html` - 遷移測試套件
  - `test-database-selector.html` - 數據庫選擇器測試
  - `simple-test.html` - 簡單功能測試
  - `template-test.html` - 模板測試
  - `quick-test.html` - 快速測試

### 🔒 測試結果（不同步到 GitHub）
- `results/` - 測試報告和結果
  - JSON 和 Markdown 格式的測試報告
  - 測試覆蓋率報告
  - 測試摘要

---

## 🚀 快速開始

### 單元測試（Jest）

1. **運行所有測試**
   ```bash
   npm test
   ```

2. **運行測試並生成覆蓋率報告**
   ```bash
   npm test -- --coverage
   ```

3. **查看覆蓋率報告**
   - 終端輸出：即時查看覆蓋率統計
   - HTML 報告：`coverage/lcov-report/index.html`

4. **測試範圍**
   - ✅ `scripts/` - 核心功能腳本
   - ❌ `popup/`, `options/`, `update-notification/` - UI 代碼（需要 E2E 測試）

### 自動化 E2E 測試（推薦）

1. **確保 Chrome DevTools MCP 已設置**
   - 參考 `internal/guides/TEST_E2E_MCP_GUIDE.md`
   - VS Code 版本 >= 1.102

2. **執行測試**
   ```
   在 GitHub Copilot 中說：
   "請使用 tests/e2e/automated-test-suite.js 執行完整測試"
   ```

3. **查看結果**
   - 測試報告會保存在 `tests/results/` 目錄
   - JSON 和 Markdown 兩種格式

### 手動測試

1. 在瀏覽器中打開 `tests/manual/` 目錄下的 HTML 文件
2. 載入擴展（開發模式）
3. 測試相應功能

---

## 📋 自動化測試範圍

### 1. **Icon 提取測試**
- ✅ Apple Touch Icon 識別
- ✅ Standard Favicon 識別
- ✅ SVG Icon 支持
- ✅ 多尺寸 Icon 處理
- ✅ Mask Icon (Safari) 識別

### 2. **封面圖提取測試**
- ✅ Open Graph Image (og:image)
- ✅ Twitter Card Image (twitter:image)
- ✅ Schema.org Image

### 3. **頁面兼容性測試**
- ✅ 新聞網站（BBC, CNN, The Guardian）
- ✅ 技術網站（GitHub, Stack Overflow, MDN）
- ✅ 內容平台（Medium, WordPress, Dev.to）
- ✅ 社交媒體（Twitter/X, Reddit）
- ✅ 電商網站（Amazon）
- ✅ 維基百科、YouTube 等

---

## 📊 測試報告示例

測試完成後會生成：

```
tests/
├── results/
│   ├── test-report-2025-10-02.json
│   └── test-report-2025-10-02.md
└── screenshots/
    ├── error-bbc-news.png
    └── error-twitter.png
```

報告內容包括：
- 測試摘要（通過/失敗/跳過）
- 每個網站的詳細結果
- Icon 數量和類型
- 錯誤和警告信息
- 執行時間統計

---

## 🔧 自定義測試

### 添加新的測試網站

編輯 `tests/e2e/automated-test-suite.js`：

```javascript
{
    name: '你的網站',
    url: 'https://example.com',
    type: 'news',
    expectedIcons: { min: 2, max: 8 },
    hasFeaturedImage: false,
    notes: '測試說明'
}
```

### 修改測試腳本

在 `tests/e2e/automated-test-suite.js` 中有三個主要測試腳本：
- `ICON_EXTRACTION_SCRIPT` - Icon 提取
- `FEATURED_IMAGE_SCRIPT` - 封面圖提取
- `METADATA_SCRIPT` - 元數據提取

可以根據需要修改或添加新的測試邏輯。

---

## 📈 性能基準

基於初步測試的典型表現：

| 網站類型 | 平均加載時間 | Icon 數量範圍 |
|---------|------------|-------------|
| 新聞網站 | 3-8 秒 | 3-10 |
| 技術網站 | 2-5 秒 | 1-5 |
| 內容平台 | 3-6 秒 | 3-8 |
| 社交媒體 | 4-10 秒 | 2-8 |

---

## 🐛 常見問題

**Q: 某些網站超時怎麼辦？**  
A: 增加 `timeout.navigation` 設置，或標記為 `skipIfNotFound: true`

**Q: 如何跳過需要登入的網站？**  
A: 設置 `requiresAuth: true`

**Q: 測試結果不一致？**  
A: 某些網站會根據地理位置返回不同內容，這是正常現象

---

## 📚 相關文檔

- 項目根目錄的 MCP 設置文檔
- `internal/guides/GOALS.md` - 項目目標和發展計劃
- `Agents.md` - AI Agent 工作指南

---

**版本：** 1.0.0  
**最後更新：** 2025年10月2日
