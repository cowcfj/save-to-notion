<!-- 🤖 AI Prompt: CRITICAL INSTRUCTION for PR Title Generation. You MUST strictly use Conventional Commits format (e.g., `feat:`, `fix:`, `refactor:`, `chore:`). DO NOT capitalize the type. DO NOT write "Refactor xyz", it MUST be "refactor: xyz". -->

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

## 🤖 提交者聲明

- [ ] 👨‍💻 由人類開發者手動提交
- [ ] 🤖 由 AI Agent 自動建立

## ✅ 提交前檢查清單

- [ ] **PR 標題合規**: 我的 PR 標題確實遵循 Conventional Commits 規範 (如 `feat: `, `fix: `, `refactor: `)，以確保 `release-please` 正常分析版本號。
- [ ] **流程與安全自評**: 我已閱讀並確認變更符合 [`PR_WORKFLOW.md`](docs/guides/PR_WORKFLOW.md) 中的測試規範、代碼規範與安全性指引。
- [ ] **Bundle 體積評估**: 本 PR 是否涉及大型依賴或核心打包結構變動？雖然 CI 的 Hard Size Gate 依然會把關，但若有重大體積變動，建議手動在本地執行 `npm run ext` 評估 unpacked 體積。

## 🔗 相關 Issue

Closes #
