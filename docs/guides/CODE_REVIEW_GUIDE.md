# 📋 專案程式碼審核指南 (Code Review Guide)

> **核心精神**：本專案的 Code Review 流程與品質把關，已全數交由 AI 全局技能處理。本文件僅定義專案專屬的「絕對紅線」，審核者必須以此為最高裁決標準。

---

## 🤖 AI 技能協作 (Skill Synergy)

當進行 Code Review 相關操作時，請務必先參閱並嚴格遵守以下全局技能：

1. **開發者準備提交 PR 時**：請調用 `requesting-code-review` 技能，進行提交前的最後質量與測試把關。
2. **開發者收到 Review 意見時**：請調用 `receiving-code-review` 技能，進行技術驗證後再決定是否實作建議。

---

## ⛔ 專案專屬審核紅線 (Project Critical Bounds)

審核時，除了常規的架構與測試覆蓋率外，遇到特定情況必須無條件退回 (Reject)。

> **⚠️ 注意：真正的審核紅線與檢查清單（Checklist）已抽離至機器可讀的 JSON 檔案中。**
>
> 請參閱：`.agent/.shared/knowledge/code_review_rules.json`

此設計可讓各種 AI 開發輔助工具，在執行 Review 動作前動態載入最權威且最新的專案規則，確保「單一真理來源 (Single Source of Truth)」，避免 Markdown 指南與實際執行標準產生分歧。

---

## 📝 快速檢查清單 (Quick Checklist)

> 此清單的實作細節同樣定義於 `.agent/.shared/knowledge/code_review_rules.json`。
> 具體審查請交由全域的 `requesting-code-review` 技能，搭配上述 JSON 規則庫自動執行。

開發者與審核者在進行 Review 時，AI 工具會自動從 JSON 提取以下四大檢查維度：

1. **單一職責 (Single Responsibility)**
2. **日誌脫敏 (Log Sanitization)**
3. **資料隔離 (Data Isolation)**
4. **繁體中文 (Language)**
