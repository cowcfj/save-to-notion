/**
 * 統一配置模組導出入口
 * 集中管理所有配置的導入導出
 *
 * 使用範例：
 * ```javascript
 * // 導入所有配置
 * import * as Config from './config/index.js';
 *
 * // 或導入特定配置
 * import { IMAGE_VALIDATION_CONSTANTS, FEATURED_IMAGE_SELECTORS } from './config/index.js';
 * ```
 *
 * 注意：api.js (NOTION_API, NOTION_OAUTH 等) 僅供 Background Service Worker 使用，
 * 不在此處 re-export，消費者應直接從 './config/api.js' 引入，
 * 以確保 tree-shaking 能將其排除在 Content Script bundle 之外。
 */

// 系統級別配置（限制協議、Handler、Tab 服務、安全常數）
export * from './app.js';

// Highlight 專用常量
export * from './highlightConstants.js';

// Storage Keys 與前綴
export * from './storageKeys.js';

// 提取配置 (DOM 選擇器、Next.js 配置、圖片驗證、內容質量)
export * from './extraction.js';

// UI 選擇器與 UI 狀態常量
export * from './ui.js';

// 正則表達式和模式配置
export * from './patterns.js';

// 功能開關配置
export * from './features.js';

// 訊息、錯誤類型與日誌級別
export * from './messages.js';

// 環境檢測配置
export * from './env.js';

// UI 圖標配置
export * from './icons.js';
