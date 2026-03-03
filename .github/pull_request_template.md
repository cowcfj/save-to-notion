# Pull Request

## 📋 變更描述

<!-- 簡要說明此 PR 的目的和主要變更 -->

## 🎯 變更類型

- [ ] ✨ 新功能 (Feature)
- [ ] 🐛 Bug 修復 (Bug Fix)
- [ ] 🔨 重構 (Refactor)
- [ ] 📝 文檔更新 (Documentation)
- [ ] 🧪 測試改進 (Testing)
- [ ] ⚡ 性能優化 (Performance)
- [ ] 🔒 安全性改進 (Security)

## ✅ 提交前檢查清單

### 必須檢查

- [ ] **本地測試**: 在本地執行 `npm run test:all` 或 `npm run test:e2e` 並確認通過
- [ ] **代碼規範**: 確保 ESLint 無警告

### 🔒 安全性檢查

- [ ] **日誌安全性**: 沒有記錄完整的 `sender`、`tab`、`request` 等物件
  - ✅ 只記錄 `sender?.id`、`tab?.id` 等識別符
  - ✅ 使用 `sanitizeUrlForLogging()` 處理 URL
- [ ] **無敏感信息**: 沒有 secrets、API keys

### 文檔

- [ ] **文檔同步**: 相關文檔已更新（如適用）

## 🔗 相關 Issue

Closes #
