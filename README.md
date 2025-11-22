# Notion Smart Clipper

[![Latest Release](https://img.shields.io/github/v/release/cowcfj/save-to-notion)](https://github.com/cowcfj/save-to-notion/releases/latest)
[![Tests](https://github.com/cowcfj/save-to-notion/actions/workflows/test.yml/badge.svg)](https://github.com/cowcfj/save-to-notion/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/cowcfj/save-to-notion/branch/main/graph/badge.svg)](https://codecov.io/gh/cowcfj/save-to-notion)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)



一個智能的 Chrome 擴展，用於將網頁內容保存到 Notion，支持多色標註和智能內容提取。

**當前版本：v2.11.4**

### 📦 最新更新
查看最新功能和改進：[所有版本發布說明](https://github.com/cowcfj/save-to-notion/releases)

> 📖 **[完整使用指南](USER_GUIDE.md)** | 包含詳細操作說明、FAQ 和故障排除

---

## 🚀 快速開始

### 1. 安裝擴展

**方法一：Chrome 商店安裝（推薦）**
- 訪問 [Chrome Web Store - Save to Notion](https://chromewebstore.google.com/detail/save-to-notion-smart-clip/gmelegphcncnddlaeogfhododhbcbmhp) 🔗
- 點擊「加到 Chrome」即可安裝

**方法二：開發者模式安裝**
1. 從 [Releases](https://github.com/cowcfj/save-to-notion/releases) 下載最新版本
2. 打開 `chrome://extensions/`，開啟「開發者模式」
3. 點擊「載入未封裝項目」，選擇下載的資料夾

### 2. 設置 Notion Integration
1. 點擊擴展圖標 → Settings → 連接到 Notion
2. 在 Notion 創建 Integration，複製 API Token
3. 貼上 Token，選擇目標資料來源（Notion 介面仍顯示為 Database），保存設置

### 3. 授權資料來源（Database）
在 Notion 資料來源（Notion 介面標示為 Database）中：點擊「...」→「Add connections」→ 選擇你的 Integration

> � **詳細配置步驟請參考** → [完整使用指南](USER_GUIDE.md#-快速開始)

---

## 🎬 功能展示

<div align="center">

### 一鍵保存網頁到 Notion
![核心功能展示](https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image1-main-feature1280.jpg)

### 隨時標記重要內容
![文本標註功能](https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image2-highlight-feature1280.jpg)

### 完美整合 Notion
![Notion 整合展示](https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image3-notion-integration1280.jpg)

### 簡單設置，立即使用
![設置界面](https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image4-easy-setup1280.jpg)

### 智能網站圖標選擇
![智能圖標](https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image5-smart-icon1280.jpg)

</div>

---

## ✨ 核心功能

### 🎨 新一代標註系統
- **CSS Highlight API**：使用瀏覽器原生功能，零 DOM 修改，完美跨元素支持
- **多顏色標註**：5 種顏色（🟡黃、🟢綠、🔵藍、🔴紅、🟣紫），適應不同使用場景
- **自動遷移**：智能遷移舊標註，自動回滾機制，確保數據安全
- **實時同步**：標記變更即時同步到 Notion 頁面
- **雙重刪除**：雙擊刪除或 Ctrl/Cmd + 點擊快速刪除
- **快速跳轉**：工具欄和標註列表雙重 "Open in Notion" 按鈕，一鍵跳轉到 Notion 頁面

### 📄 智能內容提取
- **Mozilla Readability**：智能提取文章主要內容，支持多種 CMS 系統
- **自動過濾**：自動過濾廣告和無關內容
- **完整保存**：支持超長文章（8000+ 字），自動分批處理

### 🖼️ 圖片和圖標支持
- **網站 Icon**：自動提取網站 favicon/logo 顯示在 Notion 頁面標題旁
- **封面圖識別**：自動識別文章封面圖（支持 20+ 種選擇器）
- **智能過濾**：自動排除作者頭像和無關圖片
- **格式支持**：懶加載、響應式、代理 URL 自動處理

### 🎨 模板自定義
- **標題模板**：支持變量（`{title}`、`{date}`、`{domain}` 等）
- **內容選項**：可添加時間戳和來源信息
- **預覽功能**：即時查看模板效果

### ⚙️ 便捷設置
- 一鍵連接 Notion Integration
- 自動載入資料來源列表
- API Key 連接測試

---

---

## � 使用指南

**📚 [完整使用指南 (USER_GUIDE.md)](USER_GUIDE.md)**

包含詳細的操作步驟、30+ 常見問題 FAQ、故障排除指南和最佳實踐。推薦所有用戶閱讀!

**快速鏈接:**
- [🚀 快速開始](USER_GUIDE.md#-快速開始) - 安裝和配置步驟
- [📦 核心功能](USER_GUIDE.md#-核心功能) - 功能詳細說明
- [❓ FAQ](USER_GUIDE.md#-常見問題-faq) - 常見問題解答
- [🔧 故障排除](USER_GUIDE.md#-故障排除) - 問題診斷和解決
- [📝 最佳實踐](USER_GUIDE.md#-最佳實踐) - 工作流優化建議

---

### 保存網頁
1. 瀏覽到想保存的網頁，點擊擴展圖標
2. 點擊「Save Page」，等待完成（擴展圖標會顯示綠色 "✓"）
3. 點擊「Open in Notion」可直接打開保存的頁面

### 文本標註
1. 點擊「Start Highlighting」啟用標註模式
2. 選擇標註顏色（🟡黃色、🟢綠色、🔵藍色、🔴紅色、🟣紫色）
3. 選中文字自動創建標註（支持跨段落選擇）
4. 點擊「同步」將標記保存到 Notion
5. **刪除標註**：
   - 雙擊標記文本後確認刪除
   - 或按住 Ctrl/Cmd + 點擊快速刪除

### 自定義模板
在設置頁面配置標題模板（如 `[{domain}] {title}`）和內容選項，點擊「預覽效果」查看結果

---

## 🛠️ 技術特性

- **Manifest V3**：使用最新的 Chrome 擴展標準
- **CSS Highlight API**：使用瀏覽器原生 API，零 DOM 修改
- **智能內容識別**：多層回退機制確保內容提取成功
- **圖片處理優化**：支持現代網站的各種圖片載入技術
- **模板系統**：靈活的內容自定義功能
- **錯誤處理**：完善的錯誤處理和用戶反饋

---

## 📁 項目結構

```
notion-chrome/
├── .github/               # CI 與 workflow（test.yml、coverage.yml）
├── manifest.json          # 擴展配置與權限（Manifest V3）
├── rollup.config.mjs      # Rollup 構建配置
├── popup/                 # 彈出窗口 UI（popup.html, popup.js, popup.css）
├── options/               # 設置頁面（options.html, options.js, options.css）
├── scripts/               # 核心腳本與子模組
│   ├── background.js
│   ├── content.js
│   ├── highlighter/       # 🆕 ES6 模組化標註系統
│   │   ├── index.js       #     入口文件
│   │   ├── core/          #     核心模組（Range, HighlightManager）
│   │   └── utils/         #     工具模組（6個）
│   ├── highlighter-v2.js  # 原始文件（保留向後兼容）
│   ├── highlighter-migration.js
│   ├── script-injector.js
│   ├── seamless-migration.js
│   ├── imageExtraction/
│   ├── performance/
│   └── utils/
├── dist/                  # 🆕 構建產物
│   ├── highlighter-v2.bundle.js      # 壓縮版 (15KB)
│   └── highlighter-v2.bundle.js.map  # Source map
├── update-notification/   # 更新通知頁面與邏輯
├── lib/                   # 第三方庫（Readability.js）
├── icons/                 # 圖標
├── promo-images/          # 宣傳圖片（Chrome Web Store）
├── tests/                 # 測試文件（138 tests）
├── README.md              # 用戶說明
└── CHANGELOG.md           # 版本變更記錄
```

---

---

## 🔧 開發說明

### 項目設置

```bash
# 克隆倉庫
git clone https://github.com/cowcfj/save-to-notion.git
cd save-to-notion

# 安裝依賴（會自動執行構建）
npm install
# → postinstall hook 會自動執行 npm run build
# → dist/highlighter-v2.bundle.js 自動生成

# 載入 Chrome Extension
# Chrome → 擴展程式 → 開啟開發者模式 → 載入未封裝項目 → 選擇此目錄
```

### 開發模式

```bash
# 🔥 推薦：實時編譯（修改源碼自動重新打包）
npm run build:watch

# 修改 highlighter 源碼（scripts/highlighter/）
# → 自動重新打包到 dist/
# → 重新載入 Extension 即可看到變更

# 一次性構建（開發版本，未壓縮）
npm run build

# 生產構建（Terser 壓縮）
npm run build:prod

# 運行測試
npm test

# 代碼檢查
npm run lint
```

### 構建說明

**自動構建機制**：
- ✅ `npm install` 後自動執行 `npm run build`（通過 postinstall hook）
- ✅ 開發者無需手動構建即可載入 Extension
- ✅ `dist/` 目錄不被追蹤（在 `.gitignore` 中）

**開發時的最佳實踐**：
```bash
# 1. 開啟實時編譯（推薦）
npm run build:watch

# 2. 修改代碼
vim scripts/highlighter/core/Range.js

# 3. 查看 Terminal 確認重新打包
# ✅ created dist/highlighter-v2.bundle.js in 55ms

# 4. 重新載入 Extension（Chrome Extension 頁面點擊刷新圖標）
```

### 主要組件
- **background.js**：處理擴展邏輯、API 調用、模板處理、更新通知
- **content.js**：網頁內容提取、圖片處理
- **highlighter-v2.js**：基於 CSS Highlight API 的標註引擎（已模組化）
  - 位置：`scripts/highlighter/` (ES6 模組)
  - 構建產物：`dist/highlighter-v2.bundle.js` (15KB 壓縮版)
- **options.js**：設置頁面邏輯，包含搜索式資料來源選擇器
- **utils.js**：共享工具函數和 URL 處理

### 構建流程

本項目使用 **Rollup** 進行模組打包：

- **開發環境**：`npm run build:watch`
  - 實時監控文件變更
  - 不壓縮代碼
  - inline source map

- **生產環境**：`npm run build:prod`
  - Terser 壓縮（-91% 體積）
  - 外部 source map (`.map` 文件)
  - 保留 console.log（除錯用）
  - 保留關鍵全局變數

**構建配置**：`rollup.config.mjs`

### 核心技術特點
- **CSS Highlight API**：使用瀏覽器原生 API，零 DOM 修改
- **ES6 模組化**：highlighter 已重構為 9 個獨立模組
- **搜索式選擇器**：實時搜索、鍵盤導航、高亮匹配（v2.8.0）
- **URL 正規化**：移除追蹤參數（`utm_*`、`gclid`、`fbclid` 等）
- **智能遷移**：自動從舊版本升級，支持回滾機制
- **Range API**：精確的文本位置記錄和恢復

---

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request 來改進這個項目！

## 🔒 隱私政策

請查看我們的 [隱私政策](PRIVACY.md) 了解更多資訊。

## 📄 許可證

MIT License
