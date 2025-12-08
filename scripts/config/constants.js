/**
 * 統一常量配置模組
 * 集中管理所有靜態常量，避免散落在多個文件中
 *
 * 注意：此模組必須為純 ES6 模組，不可依賴 window 或 document
 */

// ==========================================
// 圖片驗證相關常量
// ==========================================

/**
 * 圖片驗證常量（來自 imageUtils.js）
 */
export const IMAGE_VALIDATION_CONSTANTS = {
  MAX_URL_LENGTH: 2000, // Notion API 限制通常為 2000 字符，這也是瀏覽器的安全限制
  URL_LENGTH_SAFETY_MARGIN: 500, // 安全邊際，用於 Notion API 請求時預留空間，避免臨界值問題
  MAX_QUERY_PARAMS: 10, // 查詢參數數量閾值（超過可能為動態 URL）
  SRCSET_WIDTH_MULTIPLIER: 1000, // srcset w 描述符權重（優先於 x）
  MAX_BACKGROUND_URL_LENGTH: 2000, // 背景圖片 URL 最大長度（防止 ReDoS）
  MIN_IMAGE_WIDTH: 200, // 最小圖片寬度
  MIN_IMAGE_HEIGHT: 100, // 最小圖片高度
};

/**
 * 圖片 URL 驗證配置（來自 background.js）
 */
export const IMAGE_VALIDATION_CONFIG = {
  // MAX_URL_LENGTH 已統一至 IMAGE_VALIDATION_CONSTANTS
  MAX_CACHE_SIZE: 500, // 緩存大小限制
  CACHE_TTL: 30 * 60 * 1000, // 30分鐘 TTL
  SUPPORTED_PROTOCOLS: ['http:', 'https:', 'data:', 'blob:'],
  IMAGE_EXTENSIONS: /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(?:\?.*)?$/i,
  IMAGE_PATH_PATTERNS: [
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
  ],
  EXCLUDE_PATTERNS: [
    /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
    /\/api\//i,
    /\/ajax\//i,
    /\/callback/i,
    /\/track/i,
    /\/analytics/i,
  ],
};

// ==========================================
// 協議驗證正則表達式
// ==========================================

export const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;
export const DATA_PROTOCOL_REGEX = /^data:image\/(?:png|jpg|jpeg|gif|webp|svg\+xml);base64,/i;
export const BLOB_PROTOCOL_REGEX = /^blob:/i;

// ==========================================
// 內容提取相關常量
// ==========================================

/**
 * 內容質量評估常量（來自 content.js）
 */
export const CONTENT_QUALITY = {
  MIN_CONTENT_LENGTH: 250, // 內容長度最小值
  MAX_LINK_DENSITY: 0.3, // 最大鏈接密度（30%）
  LIST_EXCEPTION_THRESHOLD: 8, // 列表項數量閾值（允許例外）
};

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
// Notion API 相關常量
// ==========================================

export const NOTION_API = {
  VERSION: '2025-09-03', // Notion API 版本
  BASE_URL: 'https://api.notion.com/v1',
  BLOCKS_PER_BATCH: 100, // 每批次最多區塊數
  DELAY_BETWEEN_BATCHES: 350, // 批次間延遲（ms），遵守速率限制（3 req/s）
  MAX_RETRIES: 3, // 最大重試次數
  BASE_RETRY_DELAY: 800, // 基礎重試延遲（ms）
};

/**
 * 支持嵌套 Children 的 Block 類型 (Notion API 2025-09-03)
 */
export const BLOCKS_SUPPORTING_CHILDREN = [
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'toggle',
  'callout',
  'column_list',
  'column',
];

/**
 * 在列表項 (List Item) 中不安全、需要被扁平化 (Flatten) 的子 Blocks 類型
 * Notion API 對於列表內嵌套複雜 Block (如圖片、Code、Header) 往往校驗失敗。
 */
export const UNSAFE_LIST_CHILDREN_FOR_FLATTENING = [
  'code',
  'image',
  'bookmark',
  'embed',
  'video',
  'pdf',
  'file',
  'audio',
  'equation',
  'divider',
  'table',
  'callout',
  'quote',
  'heading_1',
  'heading_2',
  'heading_3',
];

// ==========================================
// 日誌系統相關常量
// ==========================================

/**
 * 日誌級別定義（來自 Logger.js）
 */
export const LOG_LEVELS = {
  DEBUG: 0,
  LOG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

// ==========================================
// 文本處理相關常量
// ==========================================

export const TEXT_PROCESSING = {
  MAX_RICH_TEXT_LENGTH: 2000, // Notion rich_text 區塊最大長度
  MIN_SPLIT_RATIO: 0.5, // 文本分割時的最小比例
};

// ==========================================
// URL 標準化相關常量
// ==========================================

export const URL_NORMALIZATION = {
  TRACKING_PARAMS: [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'mc_cid',
    'mc_eid',
    'igshid',
    'vero_id',
  ],
};
