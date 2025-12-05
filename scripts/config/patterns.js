/**
 * 正則表達式模式配置模組
 * 集中管理所有正則表達式和屬性列表
 *
 * 注意：此模組必須為純 ES6 模組，不可依賴 window 或 document
 */

// ==========================================
// 列表處理模式
// ==========================================

/**
 * 列表處理的預編譯正則表達式模式（來自 content.js）
 * 性能優化：避免在循環中重複編譯
 */
export const LIST_PREFIX_PATTERNS = {
  // 移除列表前綴：連字符、項目符號、星號、數字、點、管道、括號和空格
  bulletPrefix: /^[-•\u{2022}*\d+.|)\s]+/u,
  // 多餘空格正規化
  multipleSpaces: /\s+/g,
  // 空白行檢測
  emptyLine: /^\s*$/,
};

/**
 * 項目符號字符正則表達式
 */
export const BULLET_PATTERNS = {
  bulletChar: /^[-\u{2022}*•·–—►▶✔▪]\s+/u,
  numbered: /^\d+[.|)]\s+/,
};

// ==========================================
// 圖片屬性列表
// ==========================================

/**
 * 統一的圖片屬性列表（來自 imageUtils.js）
 * 涵蓋各種懶加載和響應式圖片的情況
 */
export const IMAGE_ATTRIBUTES = [
  'src',
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-srcset',
  'data-lazy-srcset',
  'data-original-src',
  'data-actualsrc',
  'data-src-original',
  'data-echo',
  'data-href',
  'data-large',
  'data-bigsrc',
  'data-full-src',
  'data-hi-res-src',
  'data-large-src',
  'data-zoom-src',
  'data-image-src',
  'data-img-src',
  'data-real-src',
  'data-lazy',
  'data-url',
  'data-image',
  'data-img',
  'data-fallback-src',
  'data-origin',
];

// ==========================================
// 佔位符模式
// ==========================================

/**
 * 圖片佔位符關鍵字（來自 imageUtils.js isValidImageUrl）
 */
export const PLACEHOLDER_KEYWORDS = [
  'placeholder',
  'loading',
  'spinner',
  'blank',
  'empty',
  '1x1',
  'transparent',
];
