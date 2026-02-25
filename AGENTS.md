# 🤖 AI Agent 開發手冊 (Hub)

> **單一真理來源 (Single Source of Truth)**: 本文件僅作為索引，詳細規範請查閱 `docs/guides/`。

## 🗺️ 知識導航 (Knowledge Map)

> [!IMPORTANT]
> **按需載入原則**：**嚴禁**一次性讀取所有 guides。請先查閱 [`INDEX.md`](docs/guides/INDEX.md) 摘要索引，再決定是否深入閱讀具體指南。

當你遇到特定任務時，請**優先**閱讀以下指南：

| 領域 (Domain)     | 關鍵指南 (Essential Guide)                                                     | 適用場景 (When to use)                          |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| **🧪 測試**       | [`TESTING_GUIDE.md`](docs/guides/TESTING_GUIDE.md)                             | 編寫單元測試、Mock API、檢查覆蓋率              |
| **🏛️ 架構**       | [`ARCHITECTURE_DECISION_GUIDE.md`](docs/guides/ARCHITECTURE_DECISION_GUIDE.md) | 新功能設計、撰寫 implementation_plan 等前置作業 |
| **🐛 除錯**       | [`DEBUGGING_GUIDE.md`](docs/guides/DEBUGGING_GUIDE.md)                         | 修復 Bug、分析日誌、系統化排查                  |
| **🔨 重構**       | [`REFACTORING_BEST_PRACTICES.md`](docs/guides/REFACTORING_BEST_PRACTICES.md)   | 修改現有代碼、消除代碼異味 (Code Smells)        |
| **👀 審核**       | [`CODE_REVIEW_GUIDE.md`](docs/guides/CODE_REVIEW_GUIDE.md)                     | PR 審核、代碼質量評估                           |
| **🌐 Chrome**     | [`CHROME_EXTENSION_PATTERNS.md`](docs/guides/CHROME_EXTENSION_PATTERNS.md)     | MV3 API、Message Passing、Storage               |
| **📝 Notion**     | [`NOTION_API_PATTERNS.md`](docs/guides/NOTION_API_PATTERNS.md)                 | API Rate Limits、Block 結構、常量配置           |
| **💻 編碼**       | [`CODE_PATTERNS_GUIDE.md`](docs/guides/CODE_PATTERNS_GUIDE.md)                 | Linter 規則、Magic Numbers、Async/Await         |
| **🔒 安全 (App)** | [`SECURITY_BEST_PRACTICES.md`](docs/guides/SECURITY_BEST_PRACTICES.md)         | 威脅模型評估、避免過度設計、RFD 防護、DOM 安全  |
| **🔑 安全 (Ops)** | [`GITHUB_SYNC_POLICY.md`](docs/guides/GITHUB_SYNC_POLICY.md)                   | 權限管理、Token 安全、文件同步策略              |
| **📚 文檔**       | [`DOCUMENTATION_STRATEGY.md`](docs/guides/DOCUMENTATION_STRATEGY.md)           | 文檔更新規則、Markdown 格式                     |
| **🤖 MCP**        | [`MCP_USAGE_GUIDELINES.md`](docs/guides/MCP_USAGE_GUIDELINES.md)               | Tool 使用準則、避免誤用、MCP 列表               |
| **🎯 目標**       | [`GOALS.md`](docs/guides/GOALS.md)                                             | 了解項目路線圖、功能優先級                      |
| **📏 規範**       | [`PROJECT_STANDARDS.md`](docs/guides/PROJECT_STANDARDS.md)                     | 語言規範、Git Commit 格式                       |
| **🤝 協作**       | [`PR_WORKFLOW.md`](docs/guides/PR_WORKFLOW.md)                                 | Pull Request 建立流程、規範與 Review 準備       |
| **🚀 發布**       | [`RELEASE_WORKFLOW.md`](docs/guides/RELEASE_WORKFLOW.md)                       | 版本發布流程、Store 上架準備                    |

## 🚀 3 分鐘快速入門 (3-Minute Quick Start)

### 核心原則 (Core Principles)

1.  **語言政策**: **必須**使用 **繁體中文 (Traditional Chinese)** 回應與撰寫文檔。
2.  **安全第一**: 嚴禁在生產環境代碼中保留 `console.log` (僅允許 `console.error`)。
3.  **依賴管控**: 安裝新的 npm package 前，**必須**徵求用戶明確同意。
4.  **文檔與模板強制**: 撰寫文檔或生成實作計畫時，**必須**遵循 [`DOCUMENTATION_STRATEGY.md`](docs/guides/DOCUMENTATION_STRATEGY.md) 的規範（包含強制調用如 `writing-plans` 技能），且**強制使用繁體中文**，嚴禁使用系統默認的英文格式。
5.  **測試優先**: 修改核心邏輯前，確保有測試覆蓋；Bug 修復前先寫失敗測試。
6.  **文檔同步**: 代碼變更後，**立即**更新對應的文檔 (`docs/guides/` 或 `docs/specs/`)。
7.  **審核評估 (Critical Review)**: 當收到「審核」、「批評」或「修正」請求時，必須先閱讀並遵循 [`CODE_REVIEW_GUIDE.md`](docs/guides/CODE_REVIEW_GUIDE.md) 的完整流程。
8.  **反思與確認 (Reflective Execution)**: 收到用戶的建議或重構請求時，**嚴禁**不經思考直接執行。必須遵循 **思考 (Think) → 建議 (Propose) → 執行 (Execute)** 的流程：
    - **先思考**：評估改動的必要性、架構合理性與潛在副作用。
    - **再作答**：向用戶闡述你的分析與建議（包含反對意見，如果有的話）。
    - **後執行**：只有在獲得用戶**明確同意**後，才寫入程式碼。
9.  **API 版本鎖定**: 關於 Notion API 的版本鎖定與強制升降級規則，必須嚴格遵守 [`NOTION_API_PATTERNS.md`](docs/guides/NOTION_API_PATTERNS.md#23-api-版本鎖定-api-version-locking) 的定義。
10. **純淨代碼原則 (Pure Code Artifacts)**: 嚴禁將 AI 的思考過程、內部筆記、嘗試性獨白（如 "Let's try..."、"Actually..."）留存在源代碼或測試代碼中。代碼註解必須保持專業並僅與實作邏輯相關。

### 觸發器 (Triggers)

Antigravity 系統會在特定情境下自動注入規則警告：

- 修改關鍵 API 時會觸發 `.agent/rules/notion-api.md` 或 `chrome-patterns.md`。
- 涉及敏感操作時會觸發 `.agent/rules/security.md`。

## 🏗️ 專案架構概覽 (Architecture)

```mermaid
graph TD
    User[用戶] --> Popup[Popup UI]
    Popup -->|Message: SAVE_TO_NOTION| BG[Background (Service Worker)]
    BG -->|Notion API| Notion[Notion Platform]
    BG -->|Chrome Storage| Storage[Local Storage]

    subgraph Content Script
        CS[Content.js] -->|DOM Parser| Page[目標網頁]
        CS -->|Message: PARSED_DATA| BG
    end

    subgraph "Documentation Guides (Source of Truth)"
        Guides[docs/guides/*.md]
    end
```

## 🧠 跨代理協作層 (Cross-Agent Layer)

本專案啟用 `.agent/.shared/` 架構以支持多代理協作。

| 目錄           | 用途                       | 關鍵檔案                                                             |
| -------------- | -------------------------- | -------------------------------------------------------------------- |
| **knowledge/** | 靜態規範 (Source of Truth) | `notion_constraints.json`, `message_bus.json`, `storage_schema.json` |
| **memory/**    | 動態狀態 (Context)         | `linter_rules.json`                                                  |
| **mocks/**     | 測試資源 (Reusable)        | `notion_api/blocks.json`                                             |

> [!NOTE]
> **給 Agent 的指令**：在進行開發前，請優先讀取 `knowledge/` 中的 JSON 規範，而非僅依賴 Markdown 指南。這能確保你的代碼與專案約束完全一致。

## 🛠️ 專屬與共用技能 (Project & Shared Skills)

本專案定義了專屬技能，並推薦搭配特定共用技能。雖然系統會自動觸發，但在進行相關任務前，**建議**主動閱讀其 `SKILL.md` 以獲取詳細指令。

### 📌 專案專屬技能 (Project Specific)

| 技能名稱              | 位置 (內外部)                      | 適用場景                               |
| --------------------- | ---------------------------------- | -------------------------------------- |
| **Extension Expert**  | `.agent/skills/extension-expert/`  | Manifest V3 驗證、功能腳手架、架構檢查 |
| **Notion QA**         | `.agent/skills/notion-qa/`         | Notion API 行為測試、數據對齊驗證      |
| **Local Docs Backup** | `.agent/skills/local-docs-backup/` | 文檔版本備份、同步衝突處理             |

### 🌟 推薦共用技能 (Recommended Shared)

| 技能名稱                           | 核心價值           | 適用場景                                       |
| ---------------------------------- | ------------------ | ---------------------------------------------- |
| **complex-site-analysis**          | 反向工程複雜 DOM   | 開發/修改 Content Script 解析 NotionSPA 結構時 |
| **systematic-debugging**           | 系統化根因分析     | 遇到難以重現的 Bug 或異步問題時                |
| **ui-ux-pro-max**                  | 專業交互與動畫設計 | 提升產品高級感與用戶體驗 (UX) 時               |
| **test-driven-development**        | 穩定性優先開發模式 | 修改核心服務邏輯 (Services) 前編寫規格時       |
| **test-fixing**                    | 系統化修復測試用例 | 大規模重構後或 CI/CD 單元測試失敗時            |
| **requesting-code-review**         | 發布前嚴格質量把關 | 重大功能開發完成準備提交 Pull Request 前       |
| **verification-before-completion** | 強制驗證結果防呆   | 在宣告任何已修復或已完成的任務之前             |

> [!TIP]
> **主動加載技能**：如果你需要手動獲取技能指令，請使用 `view_file` 讀取對應目錄下的 `SKILL.md`。

## 🔧 工具使用策略 (Tool Strategy)

| 任務類型         | 首選工具                                    | 備選工具         |
| ---------------- | ------------------------------------------- | ---------------- |
| **領域專屬邏輯** | **專屬與共用技能 (Skills)**                 | -                |
| **文件操作**     | Native Tools (`read_file`, `grep`)          | MCP `filesystem` |
| **GitHub 操作**  | MCP `github`                                | -                |
| **搜索代碼**     | `grep_search` (精確), `find_by_name` (模糊) | -                |
| **思考與規劃**   | MCP `sequentialthinking`                    | -                |
| **Web 搜索**     | `search_web`                                | -                |

---

**最後更新**: 2025-12-31
_此文件僅為索引，請點擊上方表格中的連結獲取詳細資訊。_
