# Project Context: Save to Notion (Smart Clipper)

> **One-Liner**: A Chrome Extension that allows users to clip web content (articles, highlights) and save it directly to Notion with customizable properties.

## 核心功能 (Core Features)

1.  **Smart Clip**:
    - 自動提取網頁正文 (Readability.js)。
    - 支援保存為 Notion Page。
    - 支援自定義 Database Properties (Tags, Category, etc.)。

2.  **Highlighter**:
    - 在網頁上直接標註文字 (CSS Highlight API)。
    - 標註內容同步到 Notion Page 底部。
    - 5 種顏色支援，跨重載持久化。

3.  **Authentication**:
    - Notion Integration (OAuth/Token)。
    - 用戶選擇 Target Database。

## 技術架構 (Tech Stack)

- **Platform**: Chrome Extension (Manifest V3)
- **Background**: Service Worker (Module-based)
- **Content Scripts**: Preloader + Dynamic Injection (Rollup bundled)
- **Storage**: `chrome.storage.local` (Content), `chrome.storage.sync` (Config)
- **API**: Notion API v1

## 關鍵工作流 (Key Workflows)

1.  **Save Page**:
    `Popup` -> `Message Bus` -> `Background (NotionService)` -> `Notion API`

2.  **Highlighting**:
    `Shortcut/Menu` -> `Content Script` -> `Storage` -> `Notion Sync`

## Agent 指南 (Agent Guidelines)

- **修改 API 邏輯**：請先查閱 `.agent/.shared/knowledge/notion_constraints.json`。
- **新增 Message**：請更新 `.agent/.shared/knowledge/message_bus.json`。
- **代碼風格**：嚴格遵守 `AGENTS.md` (繁體中文, JSDoc)。
