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
 * 圖片 URL 驗證配置（來自 constants.js）
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
// 圖片路徑與排除模式
// ==========================================

export const IMAGE_EXTENSIONS =
  /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(?:\?.*)?$/i;

export const IMAGE_PATH_PATTERNS = [
  /\/image[s]?\//i,
  /\/img[s]?\//i,
  /\/photo[s]?\//i,
  /\/picture[s]?\//i,
  /\/media\//i,
  /\/upload[s]?\//i,
  /\/asset[s]?\//i,
  /\/file[s]?\//i,
  /\/content\//i,
  /\/wp-content\//i,
  /\/cdn\//i,
  /cdn\d*\./i,
  /\/static\//i,
  /\/thumb[s]?\//i,
  /\/thumbnail[s]?\//i,
  /\/resize\//i,
  /\/crop\//i,
  /\/(\d{4})\/(\d{2})\//,
];

export const EXCLUDE_PATTERNS = [
  /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
  /\/api\//i,
  /\/ajax\//i,
  /\/callback/i,
  /\/track/i,
  /\/analytics/i,
  /\/pixel/i,
];

// ==========================================
// 協議驗證正則表達式
// ==========================================

export const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;
export const DATA_PROTOCOL_REGEX = /^data:image\/(?:png|jpg|jpeg|gif|webp|svg\+xml);base64,/i;
export const BLOB_PROTOCOL_REGEX = /^blob:/i;

// ==========================================
// 技術內容關鍵詞
// ==========================================

/**
 * 技術內容關鍵詞（用於 pageComplexityDetector.js）
 * 用於識別頁面是否包含大量技術術語
 */
export const TECHNICAL_TERMS = [
  // 編程概念
  'function',
  'class',
  'method',
  'variable',
  'constant',
  'interface',
  'callback',
  'async',
  'await',
  'syntax',
  'parameter',
  'argument',
  'return',
  'exception',
  'error',

  // API & Web
  'api',
  'endpoint',
  'request',
  'response',
  'header',
  'json',
  'xml',
  'yaml',
  'http',
  'https',
  'rest',
  'graphql',

  // 工具 & CLI
  'cli',
  'command',
  'option',
  'flag',
  'usage',
  'install',
  'configure',
  'build',
  'deploy',
  'npm',
  'git',
  'docker',
  'kubernetes',
  'sdk',

  // 語言 & 框架
  'javascript',
  'python',
  'java',
  'go',
  'rust',
  'c++',
  'typescript',
  'react',
  'vue',
  'angular',
  'node',
  'express',
  'django',
  'flask',
  'spring',

  // 文檔特定
  'example',
  'tutorial',
  'guide',
  'reference',
  'deprecated',
  'version',
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
