/**
 * 統一配置模組導出入口
 * 集中管理所有配置的導入導出
 *
 * 注意：`./extension/` 目錄下的 extension-only config
 * 不在此處 re-export，消費者應直接從對應模組引入，
 * 以確保 Content Script bundle 不會誤帶入 extension pages / Background 專用常量。
 */

// Highlight 專用常量
export * from './highlightConstants.js';

// Notion Code 語言白名單與 fallback 常數
export * from './notionCodeLanguages.js';

// Content-safe shared configs (core, storage, ui, messaging, content)
export * from './shared/index.js';

// 環境檢測配置
export * from './env/index.js';

// Extension-only configs (不 re-export，保持分隔)
// 消費者應直接從 config/extension/index.js 引入
