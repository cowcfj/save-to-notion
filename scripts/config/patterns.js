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
  bulletPrefix: /^(?:[-\u{2022}*·–—►▶✔▪]|\d+[.)])\s+/u,
  // 多餘空格正規化
  multipleSpaces: /\s+/g,
  // 空白行檢測
  emptyLine: /^\s*$/,
};

/**
 * 項目符號字符正則表達式
 */
export const BULLET_PATTERNS = {
  bulletChar: /^[-\u{2022}*·–—►▶✔▪]\s+/u,
  numbered: /^\d+[).|]\s+/,
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

export const IMAGE_EXTENSIONS = /\.(?:jpg|jpeg|png|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)$/i;

export const IMAGE_PATH_PATTERNS = [
  /\/images?\//i,
  /\/imgs?\//i,
  /\/photos?\//i,
  /\/pictures?\//i,
  /\/media\//i,
  /\/uploads?\//i,
  /\/assets?\//i,
  /\/files?\//i,
  /\/content\//i,
  /\/wp-content\//i,
  /\/cdn\//i,
  /cdn\d*\./i,
  /\/static\//i,
  /\/thumbs?\//i,
  /\/thumbnails?\//i,
  /\/resize\//i,
  /\/crop\//i,
  /\/(\d{4})\/(\d{2})\//,
  /\/avatars?\//i,
  /\/u\/\d+(?:$|\/|\?)/i,
  /\/profile_images\//i,
  /\/creatr-uploaded-images\//i,
  /\/ny\/api\/res\//i,
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
// 文檔站點識別模式
// ==========================================

/**
 * 文檔站點主機名模式（用於 pageComplexityDetector.js）
 * 識別常見的文檔託管服務和子域名
 */
export const DOC_HOST_PATTERNS = [
  /\.github\.io$/,
  /^docs?\./,
  /\.readthedocs\.io$/,
  /\.gitbook\.io$/,
  /^wiki\./,
  /^api\./,
  /^developer\./,
  /^guide\./,
];

/**
 * 基礎文檔路徑模式（共用模式，減少重複）
 * DOC_PATH_PATTERNS 和 TECHNICAL_DOC_URL_PATTERNS 共用此基礎
 */
const BASE_DOC_PATH_PATTERNS = [
  /\/docs?\//,
  /\/documentation\//,
  /\/guide\//,
  /\/manual\//,
  /\/api\//,
  /\/reference\//,
  /\/cli\//,
];

/**
 * 文檔站點路徑模式（用於 pageComplexityDetector.js）
 * 基於 BASE_DOC_PATH_PATTERNS 擴展
 */
export const DOC_PATH_PATTERNS = [
  ...BASE_DOC_PATH_PATTERNS,
  /\/wiki\//,
  /\/getting-started\//,
  /\/tutorial\//,
];

/**
 * 技術文檔 URL 模式（用於 pageComplexityDetector.js isTechnicalDoc）
 * 基於 BASE_DOC_PATH_PATTERNS 擴展
 */
export const TECHNICAL_DOC_URL_PATTERNS = [
  ...BASE_DOC_PATH_PATTERNS,
  /\/commands?\//,
  /github\.io.*docs/,
  /\.github\.io/,
];

/**
 * 技術文檔標題模式（用於 pageComplexityDetector.js isTechnicalDoc）
 */
export const TECHNICAL_DOC_TITLE_PATTERNS = [
  /documentation/,
  /commands?/,
  /reference/,
  /guide/,
  /manual/,
  /cli/,
  /api/,
];

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
  'miscellaneous', // 排除雜項佈局圖片 (e.g., miscellaneous_sprite.png)
  '.gif', // 排除 GIF 圖片（通常為動畫圖標或佔位符，非內容圖片）
];

// ==========================================
// 日誌脫敏模式
// ==========================================

/**
 * 敏感鍵名模式（涵蓋常見的敏感欄位名稱，包括複合詞）
 * 用於 LogSanitizer.js
 */
export const SENSITIVE_KEY_PATTERN =
  /auth|token|secret|credential|password|pwd|key|cookie|session|authorization|bearer|viewer|access|refresh|api|private/i;

/**
 * 安全的 HTTP Headers 白名單（不包含敏感資訊）
 * 用於 LogSanitizer.js
 */
export const LOGGING_SAFE_HEADERS = [
  'content-type',
  'content-length',
  'user-agent',
  'accept',
  'accept-language',
  'cache-control',
];
