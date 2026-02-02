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

- [ ] **測試通過**: `npm test` 全部通過
- [ ] **覆蓋率達標**: Codecov 檢查通過
- [ ] **代碼規範**: ESLint 無警告

### 🔒 安全性檢查

- [ ] **日誌安全性**: 沒有記錄完整的 `sender`、`tab`、`request` 等物件
  - ✅ 只記錄 `sender?.id`、`tab?.id` 等識別符
  - ✅ 使用 `sanitizeUrlForLogging()` 處理 URL
- [ ] **無敏感信息**: 沒有 secrets、API keys

### 文檔

- [ ] **文檔同步**: 相關文檔已更新（如適用）

## 📊 測試結果

```bash
# 粘貼測試輸出
npm test
```

## 🔗 相關 Issue

Closes #
