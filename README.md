# Notion Smart Clipper v2.8.2

> 最近更新：修復長頁面多次開關後標註工具欄不顯示的問題（v2.8.2 已發布）

[![Latest Release](https://img.shields.io/github/v/release/cowcfj/save-to-notion)](https://github.com/cowcfj/save-to-notion/releases/latest)
[![Tests](https://github.com/cowcfj/save-to-notion/actions/workflows/test.yml/badge.svg)](https://github.com/cowcfj/save-to-notion/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/cowcfj/save-to-notion/branch/main/graph/badge.svg)](https://codecov.io/gh/cowcfj/save-to-notion)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 🎉 **最新版本 v2.8.2 已發布！** [查看更新內容](https://github.com/cowcfj/save-to-notion/releases/tag/v2.8.2) - 標註工具欄顯示穩定性修復；並已追加小幅增強（MutationObserver 自動恢復 + show() 重綁刪除監聽）

## 🏆 近期里程碑
[![Codecov Success](https://img.shields.io/badge/🎉_Codecov-Integration_Success-success.svg)](CODECOV_INTEGRATION_MILESTONE.md)
[![Coverage Boost](https://img.shields.io/badge/Coverage-19.13%25_→_20.67%25-brightgreen.svg)](https://codecov.io/gh/cowcfj/save-to-notion)
[![Tests Passing](https://img.shields.io/badge/Tests-764%2F764_Passing-success.svg)](https://github.com/cowcfj/save-to-notion/actions/workflows/test.yml)

一個智能的 Chrome 擴展，用於將網頁內容保存到 Notion，支持多色標註和智能內容提取。

### 📦 最新更新 (v2.8.2 - 2025-10-08)
- ✅ **數據管理功能完善**：修復檢查數據完整性、數據重整、自動清理功能
- ✅ **遷移數據清理**：真正刪除遷移數據並釋放存儲空間
- ✅ **測試通過**：25/25 測試項目通過（100%）

[查看完整發布說明](RELEASE_NOTES_v2.8.2.md) | [查看所有版本](https://github.com/cowcfj/save-to-notion/releases)

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
3. 貼上 Token，選擇目標數據庫，保存設置

### 3. 授權數據庫
在 Notion 數據庫中：點擊「...」→「Add connections」→ 選擇你的 Integration

> � **詳細配置步驟請參考** → [完整使用指南](USER_GUIDE.md#-快速開始)

---

## 🎬 功能展示

<div align="center">

### 一鍵保存網頁到 Notion
![核心功能展示](promo-images/image1-main-feature.png)

### 隨時標記重要內容
![文本標註功能](promo-images/image2-highlight-feature.png)

### 完美整合 Notion
![Notion 整合展示](promo-images/image3-notion-integration.png)

### 簡單設置，立即使用
![設置界面](promo-images/image4-easy-setup.png)

### 智能網站圖標選擇
![智能圖標](promo-images/image5-smart-icon.png)

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
- 自動載入數據庫列表
- API Key 連接測試

---

## 📝 最新更新

### v2.8.0 🎉 用戶優化與功能增強
- 🔗 **Open in Notion 按鈕優化**：修復標註後按鈕消失問題，標註面板新增快捷按鈕
- 📢 **更新通知系統**：擴展更新後自動顯示新功能說明，智能化、現代化設計
- 🔍 **搜索式數據庫選擇器**：實時搜索、鍵盤導航、詳細信息顯示，大幅改善多數據庫用戶體驗
- 🛡️ **兼容性改進**：完美支持舊版本數據，自動生成 Notion URL

### v2.7.3 🐛 超長文章支持
- **修復超長文章截斷問題**：支持保存任意長度的文章（自動分批處理，遵守 Notion API 限制）
- **用戶價值**：長文章（如 8000+ 字的技術文章）現在可以完整保存，無需手動操作

### v2.7.0-v2.7.2 主要更新
- 🎯 **圖標徽章顯示保存狀態**：擴展圖標上顯示綠色 "✓" 表示頁面已保存
- 🔗 **Open in Notion 按鈕**：保存成功後一鍵打開對應的 Notion 頁面
- 🐛 **數據清理機制**：完善數據清理，減少 90%+ 無效數據累積

📚 **完整更新記錄**請查看 [CHANGELOG.md](CHANGELOG.md)

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
├── manifest.json          # 擴展配置文件
├── popup/                 # 彈出窗口 UI
├── options/               # 設置頁面（含搜索式數據庫選擇器）
├── scripts/               # 核心腳本
│   ├── background.js      # 後台腳本（Notion API、批處理）
│   ├── content.js         # 內容腳本（提取、圖片處理）
│   ├── highlighter-v2.js  # 新一代標註引擎（CSS Highlight API）
│   └── utils.js           # 工具函數
├── update-notification/   # 更新通知系統（v2.8.0 新增）
├── lib/                   # 第三方庫
│   └── Readability.js     # Mozilla Readability
├── tests/                 # 測試文件（Jest）
└── icons/                 # 圖標文件
```

---

## 🧪 測試覆蓋率

當前測試覆蓋率：**20.00%** ✅ ([詳細報告](TEST_COVERAGE_MILESTONE_20_PERCENT.md))

```
Coverage Summary
-------------------------------|---------|----------|---------|---------|
File                           | % Stmts | % Branch | % Funcs | % Lines |
-------------------------------|---------|----------|---------|---------|
All files                      |   20.00 |    27.75 |   23.90 |   19.36 |
tests/helpers/                 |   94.70 |    90.32 |  100.00 |   94.77 |
-------------------------------|---------|----------|---------|---------|
```

**測試統計：**
- 總測試數：608 個
- 測試通過率：100%
- 測試套件：12 個
- 執行時間：1.985 秒

**運行測試：**
```bash
npm test                    # 運行所有測試
npm test -- --coverage      # 生成覆蓋率報告
```

---

## 🔧 開發說明

### 主要組件
- **background.js**：處理擴展邏輯、API 調用、模板處理、更新通知
- **content.js**：網頁內容提取、圖片處理
- **highlighter-v2.js**：基於 CSS Highlight API 的標註引擎
- **options.js**：設置頁面邏輯，包含搜索式數據庫選擇器
- **utils.js**：共享工具函數和 URL 處理

### 核心技術特點
- **CSS Highlight API**：使用瀏覽器原生 API，零 DOM 修改
- **搜索式選擇器**：實時搜索、鍵盤導航、高亮匹配（v2.8.0）
- **更新通知系統**：智能化新功能提示（v2.8.0）
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
