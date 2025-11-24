# 第三方庫目錄 (Third-Party Libraries)

本目錄包含專案使用的第三方 vendored 代碼(直接嵌入的外部庫)。

## 📋 包含的庫

- **Readability.js** - Mozilla 的頁面內容提取庫
- **turndown.js** - HTML 轉 Markdown 轉換器
- **turndown-plugin-gfm.js** - Turndown 的 GitHub Flavored Markdown 插件

## ⚠️ 重要說明

### 不應直接修改

這些文件是從上游專案取得的第三方代碼,**不應該被直接修改**。直接修改會導致:

- 升級時丟失修改
- 維護困難
- 與上游版本不一致

### 更新流程

如需更新這些庫:

1. 從官方來源下載最新版本
2. 替換整個文件
3. 測試確保相容性
4. 更新版本記錄

### ESLint 配置

這些文件已在 `eslint.config.js` 中通過 `lib/**` 模式被排除,不會進行代碼風格檢查。

## 📚 上游來源

- **Readability.js**: [mozilla/readability](https://github.com/mozilla/readability)
- **Turndown**: [mixmark-io/turndown](https://github.com/mixmark-io/turndown)
- **turndown-plugin-gfm**: [mixmark-io/turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm)
