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
 */

// 常量配置
export * from './constants.js';

// 提取配置 (DOM 選擇器與 Next.js 配置)
export * from './extraction.js';
export * from './ui-selectors.js';

// 正則表達式和模式配置
export * from './patterns.js';

// 功能開關配置
export * from './features.js';

// 訊息配置
export * from './messages.js';

// 環境檢測配置
export * from './env.js';

// UI 圖標配置
export * from './icons.js';
