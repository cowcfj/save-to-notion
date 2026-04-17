# Notion Smart Clipper

[![Latest Release](https://img.shields.io/github/v/release/cowcfj/save-to-notion)](https://github.com/cowcfj/save-to-notion/releases/latest)
[![Tests](https://github.com/cowcfj/save-to-notion/actions/workflows/ci.yml/badge.svg)](https://github.com/cowcfj/save-to-notion/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/cowcfj/save-to-notion/branch/main/graph/badge.svg)](https://codecov.io/gh/cowcfj/save-to-notion)
[![Chrome Users](https://img.shields.io/chrome-web-store/users/gmelegphcncnddlaeogfhododhbcbmhp?label=Chrome%20Users)](https://chromewebstore.google.com/detail/save-to-notion-smart-clip/gmelegphcncnddlaeogfhododhbcbmhp)
[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

一個智能的 Chrome 擴展，精準將網頁內容保存至 Notion。具備強大的智能內容提取功能，結合 Readability 與獨家演算法，為絕大多數網頁提供純淨的正文與圖片保存體驗；同時針對結構複雜的網站（如 BBC、明報、HK01、Yahoo 香港新聞等，持續擴展中）提供深度優化支持，並可持久保存遷移的多色標註功能。

## 目錄

[🚀 快速開始](#-快速開始) | [🎬 功能展示](#-功能展示) | [✨ 核心功能](#-核心功能) | [📖 使用指南](#-使用指南) | [🛠️ 技術特性](#-技術特性) | [🔧 開發說明](#-開發說明) | [🤝 貢獻](#-貢獻)

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

### 2. 連接 Notion 帳號 (提供兩種方式)

**👉 方式 A：快捷授權 (推薦，支援 OAuth 一鍵登入)**

> ⚠️ **注意**：此一鍵登入功能僅支援官方發布的版本（包含 Chrome 商店與 GitHub Releases 載點）。若您使用的是自行編譯的 Fork 或二次開發版本，請使用下方的「方式 B」，或查閱文末的「自訂 Notion OAuth」開發說明。

1. 點擊擴展圖標 → `⚙️ 設定` → 點擊「**🔌 連接到 Notion**」
2. 在跳轉的 Notion 官方頁面完成授權並選擇工作區
3. 回到擴展的設定介面，選擇目標資料庫（Data Source），點擊「保存設置」

**👉 方式 B：手動輸入 Integration Token (傳統方式)**

1. 訪問 [Notion Integrations](https://www.notion.so/my-integrations) 頁面創建 Integration，並複製 Internal Integration Token
2. 點擊擴展圖標 → `⚙️ 設定`，將 Token 貼入輸入框並保存
3. **重要**：在 Notion 目標資料庫頁面右上角 `...` 中，將該 Integration 加入 Connections 中

> 📖 **詳細配置步驟與問題排查請參考** → [完整使用指南](USER_GUIDE.md#-快速開始-只需-2-分鐘)

---

## 🎬 功能展示

> 💡 **點擊圖片可查看大圖**

<div align="center">

### 一鍵保存網頁到 Notion

<a href="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image1-main-feature1280.jpg" target="_blank">
  <img src="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image1-main-feature1280.jpg" alt="核心功能展示" width="600">
</a>

### 隨時標記重要內容

<a href="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image2-highlight-feature1280.jpg" target="_blank">
  <img src="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image2-highlight-feature1280.jpg" alt="文本標註功能" width="600">
</a>

### 完美整合 Notion

<a href="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image3-notion-integration1280.jpg" target="_blank">
  <img src="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image3-notion-integration1280.jpg" alt="Notion 整合展示" width="600">
</a>

### 簡單設置，立即使用

<a href="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image4-easy-setup1280.jpg" target="_blank">
  <img src="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image4-easy-setup1280.jpg" alt="設置界面" width="600">
</a>

### 智能網站圖標選擇

<a href="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image5-smart-icon1280.jpg" target="_blank">
  <img src="https://raw.githubusercontent.com/cowcfj/save-to-notion/main/promo-images/image5-smart-icon1280.jpg" alt="智能圖標" width="600">
</a>

</div>

---

## ✨ 核心功能

### 🎨 新一代標註系統

- **CSS Highlight API**：使用瀏覽器原生功能，零 DOM 修改，完美跨元素支持
- **多顏色標註**：4 種顏色（🟡黃、🟢綠、🔵藍、🔴紅），適應不同使用場景
- **自定義樣式**：支持背景顏色、文字顏色、底線三種模式，適應暗色模式與個人偏好
- **同步Notion**：標記變更同步到 Notion 頁面
- **雙重刪除**：雙擊刪除或 Ctrl/Cmd + 點擊快速刪除

### 📄 智能內容提取

- **Next.js原生支持**：深度解析 **Next.js (App Router/Pages Router)** 網站數據，精準還原高品質內容
- **深度優化**：針對 **BBC、HK01、明報、Yahoo HK** 等複雜網站特別優化，提供網域專屬清洗規則支援完整、乾淨的內容保存
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

### ⚙️ 便捷設置與安全穩定

- **OAuth 認證**：支援新版 Notion OAuth 安全授權，內建 Token 自動刷新與過期防護機制
- **儲存與備份**：內建增強的存儲管理，支援擴展配置的自動備份與還原功能；支援本地標注備份與還原

---

---

## 📖 使用指南

**📚 [完整使用指南 (USER_GUIDE.md)](USER_GUIDE.md)**

包含詳細的操作步驟、常見問題與故障排除、以及實用的達人技巧。推薦所有用戶閱讀！

**快速連結:**

- [🚀 快速開始](USER_GUIDE.md#-快速開始-只需-2-分鐘) - 安裝和配置步驟
- [🎯 核心功能與使用情境](USER_GUIDE.md#-核心功能與使用情境) - 功能詳細說明與情境展示
- [💡 達人技巧](USER_GUIDE.md#-達人技巧-pro-tips) - 工作流優化建議
- [❓ 常見問題與故障排除](USER_GUIDE.md#-常見問題與故障排除) - 疑難排解與常見問題解答

---

### 保存網頁

1. 瀏覽到想保存的網頁，點擊擴展圖標
2. 點擊「**保存頁面**」，等待完成（擴展圖標會顯示綠色 "✓"）
3. 點擊「**在 Notion 中打開**」可直接打開保存的頁面

### 文本標註

1. 點擊「**開始標註**」啟用標註模式
2. 選擇標註顏色（🟡黃色、🟢綠色、🔵藍色、🔴紅色）
3. 選中文字自動創建標註（支持跨段落選擇）
4. 點擊「同步」將標記保存到 Notion
5. **刪除標註**：
   - 雙擊標記文本後確認刪除
   - 或按住 Ctrl/Cmd + 點擊快速刪除

### 自定義模板

在「**設定**」頁面配置標題模板（如 `[{domain}] {title}`）和內容選項，點擊「預覽效果」查看結果

---

## 🛠️ 技術架構

### 擴展標準與協作模式

- **Manifest V3**：使用最新的 Chrome 擴展標準
- **ES6 模組化**：核心系統已重構為獨立模組，提升可維護性

### 智能注入策略

- **Preloader**：`< 5KB` 全域注入，負責快捷鍵監聯與性能預熱
- **按需載入**：主程式僅在需要時載入，大幅降低記憶體佔用

### 核心技術

- **Range API**：精確的文本位置記錄和恢復
- **URL 正規化**：移除追蹤參數（`utm_*`、`gclid`、`fbclid` 等）

---

### 項目結構

```
notion-chrome/
├── .github/               # CI 與 workflow（ci.yml、release-please.yml）
├── manifest.json          # 擴展配置與權限（Manifest V3）
├── rollup.all.config.mjs  # 統一構建配置
├── dist/                  # 打包產物 (preloader.js, content.bundle.js)
├── popup/                 # 彈出窗口 UI（處理 API 調用與 DOM 更新）
├── sidepanel/             # 側邊欄 UI（常駐顯示保存狀態、支援快速操作與頁面同步）
├── options/               # 設置頁面 UI（模塊化設置邏輯：Auth, DataSource, Storage 等）
├── scripts/               # 核心腳本與子模組
│   ├── background.js      # 處理擴展邏輯、API 調用、模板處理與更新通知
│   ├── background/        # 模塊化背景服務
│   │   ├── services/      # 服務層 (Notion, Storage, Injection, Tab, PageContent)
│   │   ├── handlers/      # 業務處理器 (Save, Highlight, Migration)
│   │   └── utils/         # 背景工具 (BlockBuilder)
│   ├── content/           # 模塊化內容提取系統 (產出: dist/content.bundle.js)
│   │   ├── index.js       # 入口文件
│   │   ├── extractors/    # 提取層 (ContentExtractor, ReadabilityAdapter, ImageCollector 等)
│   │   ├── converters/    # 轉換層 (ConverterFactory, DomConverter)
│   │   └── adapters/      # 適配層 (整合 Readability.js 等)
│   ├── config/            # 集中化配置管理 (常量、DOM選擇器、正則匹配、開關等)
│   ├── highlighter/       # 基於 CSS Highlight API 的新一代標註引擎 (產出: dist/highlighter-v2.bundle.js)
│   │   ├── core/          # 核心模組 (Range, HighlightManager, Storage 等)
│   │   ├── ui/            # UI 組件 (Toolbar, Components, Styles)
│   │   └── utils/         # 工具模組 (color, dom, textSearch 等)
│   ├── performance/       # 性能優化模組
│   └── utils/             # 工具模組 (Logger, Security, ErrorHandler, ImageUtils)

├── dist/                  # 構建產物
│   ├── content.bundle.js         # Content Script 統一打包版
│   └── *.js.map           # Source maps
├── update-notification/   # 更新通知頁面與邏輯
├── icons/                 # 圖標
├── promo-images/          # 宣傳圖片（Chrome Web Store）
├── tests/                 # 測試文件（2500+ tests）
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
# → dist/highlighter-v2.bundle.js 與 dist/content.bundle.js 自動生成

# 載入 Chrome Extension
# Chrome → 擴展程式 → 開啟開發者模式 → 載入未封裝項目 → 選擇此目錄
```

### 開發模式

```bash
# 🔥 推薦：實時編譯（同時監控 Highlighter 與 Content Script）
npm run dev
# 或 npm run build:watch

# 修改源碼 (scripts/highlighter/ 或 scripts/content/)
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

- ✅ `npm install` 後自動執行 `npm run build`
- ✅ 開發者無需手動構建即可載入 Extension
- ✅ `dist/` 目錄不被追蹤（在 `.gitignore` 中）

**開發時的最佳實踐**：

```bash
# 1. 開啟實時編譯（推薦）
npm run dev

# 2. 修改代碼
vim scripts/highlighter/core/Range.js
# 或 vim scripts/content/converters/DomConverter.js

# 3. 查看 Terminal 確認重新打包
# ✅ created dist/content.bundle.js in 40ms
# ✅ created dist/highlighter-v2.bundle.js in 55ms

# 4. 重新載入 Extension（Chrome Extension 頁面點擊刷新圖標）
```

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

### 🔌 自訂 Notion OAuth (適用於二次開發)

開源版與官方生產版的建置環境已完全分離。為避免依賴無法公開的官方後端代理，開源版預設會隱藏 OAuth 按鈕（僅顯示傳統的「手動填寫 Integration Token」）。

如果您希望在自己開發的版本中啟用 Notion OAuth 一鍵登入，請按照以下步驟設定：

1. **部署自己的 OAuth 代理伺服器**：
   - 您需要實作一個後端服務（如 Cloudflare Worker）來安全保管您的 `client_secret`，並代理 Notion 的 `/v1/oauth/token` 與 `/v1/oauth/refresh` 請求。
   - **安全建議**：為了防止他人濫用您的代理伺服器，請自行生成一組專屬的金鑰（API Key），並在您的後端服務中檢查請求標頭 `X-Extension-Key` 是否與該金鑰相符。
   - <details>
       <summary>💡 查看 Cloudflare Worker 代理伺服器範例</summary>

     我們準備了一份可以直接複製使用的 [Cloudflare Worker 代理程式碼範例](examples/cloudflare-worker-oauth.js)，其中已包含 CORS 處理與基本的安全性防護，可大幅節省您的建置時間。
     </details>

2. **申請 Notion Public Integration**：
   - 在 Notion Integrations 頁面建立一組 Public API，取得 `client_id`。
3. **配置本地環境變數**：
   - 首次執行 `npm install` 後，專案會自動將模板複製為 `scripts/config/env.js`（此檔案並未被 Git 追蹤，以防機密外洩）。
   - 開啟 `scripts/config/env.js`，將尾段的 `BUILD_ENV` 區塊修改為您的專屬配置：
     ```javascript
     export const BUILD_ENV = Object.freeze({
       ENABLE_OAUTH: true, // 👈 將此設為 true 以在設定頁顯示 OAuth 按鈕
       ENABLE_ACCOUNT: true, // 👈 將此設為 true 以在設定頁顯示帳號登入按鈕
       OAUTH_SERVER_URL: 'https://your-oauth-proxy-url.com', // 👈 填寫您的後端代理伺服器網址
       OAUTH_CLIENT_ID: 'your-notion-client-id', // 👈 填寫您的 Notion Client ID
       EXTENSION_API_KEY: 'your-custom-header-key', // 👈 填入您在步驟 1 中自訂的 API Key。擴充功能會在發送請求時，自動將其附加至 `X-Extension-Key` Header 中。
     });
     ```
4. **重新打包並載入**：若您處於 `npm run dev` 開發模式，存檔後即會自動重新打包。刷新擴充功能後，即可在設定頁中看到生效的 OAuth 登入選項。

---

## 🤝 貢獻

歡迎提交 [Issue](https://github.com/cowcfj/save-to-notion/issues) 和 [Pull Request](https://github.com/cowcfj/save-to-notion/pulls) 來改進這個項目！

## 🔒 隱私政策

請查看我們的 [隱私政策](https://cowcfj.github.io/save-to-notion/privacy.html) 了解更多資訊。

## 📄 許可證

[GPLv3 License](./LICENSE)

本專案採用 GPLv3 授權。如果您需要將其整合至閉源商業產品，請與我聯繫取得商業授權（Dual Licensing）。

## 🙏 致謝 / Acknowledgements

This extension relies on the following open-source projects:

- **[@mozilla/readability](https://github.com/mozilla/readability)**
  Used for extracting main content from web pages.
  Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
  Copyright (c) 2010 Arc90 Inc.
