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
  URL_LENGTH_INLINE_SAFETY_MARGIN: 100, // 行內圖片 URL 安全邊際，較寬鬆的檢查
  MAX_QUERY_PARAMS: 10, // 查詢參數數量閾值（超過可能為動態 URL）
  SRCSET_WIDTH_MULTIPLIER: 1000, // srcset w 描述符權重（優先於 x）
  MAX_BACKGROUND_URL_LENGTH: 2000, // 背景圖片 URL 最大長度（防止 ReDoS）
  MIN_IMAGE_WIDTH: 200, // 最小圖片寬度
  MIN_IMAGE_HEIGHT: 100, // 最小圖片高度
  MAX_RECURSION_DEPTH: 5, // 遞歸解析最大深度
};

export const IMAGE_VALIDATION = IMAGE_VALIDATION_CONSTANTS;

// IMAGE_ATTRIBUTES has been moved to patterns.js

export const IMAGE_VALIDATION_CONFIG = {
  // MAX_URL_LENGTH 已統一至 IMAGE_VALIDATION_CONSTANTS
  MAX_CACHE_SIZE: 500, // 緩存大小限制
  CACHE_TTL: 30 * 60 * 1000, // 30分鐘 TTL
  SUPPORTED_PROTOCOLS: ['http:', 'https:', 'data:', 'blob:'],
  // Patterns relocated to patterns.js
};

// ==========================================
// 協議驗證正則表達式
// ==========================================

// Protocol regexes moved to patterns.js

// ==========================================
// 受限協議配置（擴展無法注入的頁面類型）
// ==========================================

/**
 * 受限協議列表（擴展無法注入腳本的頁面）
 * 用於 InjectionService 和 saveHandlers 的前置檢查
 */
export const RESTRICTED_PROTOCOLS = [
  'chrome:',
  'edge:',
  'about:',
  'data:',
  'chrome-extension:',
  'view-source:',
  'file:', // 本地文件（PDF 等）
];

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

// TECHNICAL_TERMS moved to patterns.js

// ==========================================
// Notion API 相關常量
// ==========================================

export const NOTION_API = {
  // [Breaking Change] API version 2025-09-03 adds multi-data-source database support.
  // This version is required; using older versions will fail with:
  // "Databases with multiple data sources are not supported in this API version".
  VERSION: '2025-09-03',
  BASE_URL: 'https://api.notion.com/v1',
  BLOCKS_PER_BATCH: 100, // 每批次最多區塊數
  MAX_RETRIES: 3, // 最大重試次數
  BASE_RETRY_DELAY: 800, // 基礎重試延遲（ms）

  // 操作特定配置
  CHECK_RETRIES: 2, // 檢查操作重試次數
  CHECK_DELAY: 500, // 檢查操作延遲（ms）
  CREATE_RETRIES: 3, // 創建操作重試次數
  CREATE_DELAY: 600, // 創建操作延遲（ms）
  DELETE_RETRIES: 1, // 刪除操作重試次數
  DELETE_DELAY: 300, // 刪除操作延遲（ms）

  // 速率限制配置
  // Notion API 限制：每秒最多 3 個請求（3 req/s = 333ms/req）
  // 使用 350ms 確保安全範圍，適用於：
  // - 批次操作間延遲（appendBlocksInBatches）
  // - 連續刪除操作間延遲（_deleteBlocksByIds, deleteAllBlocks）
  // - 任何需要遵守速率限制的連續 API 調用
  RATE_LIMIT_DELAY: 350,

  // 批量刪除配置
  // Notion API 限制: 3 req/s，並發 3 後需等待 1 秒
  DELETE_CONCURRENCY: 3, // 刪除操作並發數
  DELETE_BATCH_DELAY_MS: 1000, // 批次刪除間延遲（ms）

  PAGE_SIZE: 100, // 分頁大小
  // 頁面結構配置
  HIGHLIGHT_SECTION_HEADER: '📝 頁面標記', // 高亮標記區域的標題
};

/**
 * Notion 服務配置（整合自 NotionService.js）
 * 集中管理 API 版本、延遲、重試等參數
 */
export const NOTION_CONFIG = {
  API_VERSION: NOTION_API.VERSION,
  BASE_URL: NOTION_API.BASE_URL,
  BLOCKS_PER_BATCH: NOTION_API.BLOCKS_PER_BATCH,
  DEFAULT_MAX_RETRIES: NOTION_API.MAX_RETRIES,
  DEFAULT_BASE_DELAY: NOTION_API.BASE_RETRY_DELAY,
  // 操作特定配置
  CHECK_RETRIES: NOTION_API.CHECK_RETRIES,
  CHECK_DELAY: NOTION_API.CHECK_DELAY,
  CREATE_RETRIES: NOTION_API.CREATE_RETRIES,
  CREATE_DELAY: NOTION_API.CREATE_DELAY,
  DELETE_RETRIES: NOTION_API.DELETE_RETRIES,
  DELETE_DELAY: NOTION_API.DELETE_DELAY,
  RATE_LIMIT_DELAY: NOTION_API.RATE_LIMIT_DELAY,
  PAGE_SIZE: NOTION_API.PAGE_SIZE,
  // 頁面結構配置
  HIGHLIGHT_SECTION_HEADER: NOTION_API.HIGHLIGHT_SECTION_HEADER,
  // 批量刪除配置
  DELETE_CONCURRENCY: NOTION_API.DELETE_CONCURRENCY,
  DELETE_BATCH_DELAY_MS: NOTION_API.DELETE_BATCH_DELAY_MS,
};

/**
 * InjectionService 相關配置
 * 集中管理腳本注入服務的超時與錯誤定義
 */
export const INJECTION_CONFIG = {
  PING_TIMEOUT_MS: 2000,
  PING_TIMEOUT_ERROR: 'PING timeout',
};

/**
 * 程式語言映射表 (用於 DomConverter.mapLanguage)
 * 將常見縮寫或別名映射至 Notion API 支援的語言名稱
 */
export const CODE_LANGUAGE_MAP = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  md: 'markdown',
  html: 'html',
  css: 'css',
  json: 'json',
  sh: 'bash',
  bash: 'bash',
  c: 'c',
  cpp: 'c++',
  java: 'java',
  go: 'go',
  rust: 'rust',
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

// ==========================================
// 錯誤處理與類型定義 (來自 ErrorHandler.js)
// ==========================================

/**
 * 應用程式錯誤類型枚舉
 */
export const ERROR_TYPES = {
  // 原有類型
  EXTRACTION_FAILED: 'extraction_failed',
  INVALID_URL: 'invalid_url',
  NETWORK_ERROR: 'network_error',
  PARSING_ERROR: 'parsing_error',
  PERFORMANCE_WARNING: 'performance_warning',
  DOM_ERROR: 'dom_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error',
  // 背景服務相關類型
  STORAGE: 'storage', // 存儲操作錯誤
  NOTION_API: 'notion_api', // Notion API 錯誤
  INJECTION: 'injection', // 腳本注入錯誤
  PERMISSION: 'permission', // 權限不足
  INTERNAL: 'internal', // 內部錯誤
};

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

/**
 * 統一日誌圖標定義 (Centralized Emoji Config)
 * 用於 Logger.success/start/ready 等語義化方法
 */
export const LOG_ICONS = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARN: '⚠️',
  START: '🚀',
  READY: '📦',
};

/**
 * UI 提示狀態類型
 */
export const UI_STATUS_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
};

/**
 * 通用 UI 組件 CSS 類名（用於盒子、徽章等）
 */
export const COMMON_CSS_CLASSES = {
  SUCCESS_BOX: 'success-box',
  ERROR_BOX: 'error-box',
  WARNING_BOX: 'warning-box',
  RESULT_URL: 'result-url',
  RESULT_ITEM: 'migration-result-item',
  COUNT_BADGE: 'count-badge',
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

// ==========================================
// Handlers 相關常量
// ==========================================

export const HANDLER_CONSTANTS = {
  BUNDLE_READY_RETRY_DELAY: 150, // Bundle 就緒檢查重試延遲 (ms)
  BUNDLE_READY_MAX_RETRIES: 10, // Bundle 就緒檢查最大重試次數
  PAGE_STATUS_CACHE_TTL: 60 * 1000, // 頁面保存狀態緩存時間 (60秒)
  IMAGE_RETRY_DELAY: 500, // 圖片驗證錯誤重試延遲 (ms)
  CHECK_DELAY: 500, // 頁面存在性檢查延遲 (ms)
};

// ==========================================
// TabService 相關常量
// ==========================================

export const TAB_SERVICE = {
  LOADING_TIMEOUT_MS: 10_000, // 頁面載入超時時間 (ms)
  STATUS_UPDATE_DELAY_MS: 1000, // 狀態更新延遲 (ms)
};

// ==========================================
// Performance 模組相關常量
// ==========================================

/**
 * PerformanceOptimizer 相關常量
 */
export const PERFORMANCE_OPTIMIZER = {
  // 緩存設定
  DEFAULT_CACHE_MAX_SIZE: 100, // 預設緩存大小
  MAX_CACHE_SIZE: 2000, // 最大緩存限制
  MIN_CACHE_SIZE: 50, // 最小緩存大小
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 分鐘 TTL

  // 批處理設定
  DEFAULT_BATCH_SIZE: 100, // 預設批處理大小
  MAX_BATCH_SIZE: 500, // 最大批處理大小
  MIN_BATCH_SIZE: 10, // 最小批處理大小
};

/**
 * Preloader 事件名稱（解耦 Phase 8）
 */
export const PRELOADER_EVENTS = {
  REQUEST: 'notion-preloader-request',
  RESPONSE: 'notion-preloader-response',
};

// ==========================================
// 標註遷移相關常量
// ==========================================

export const HIGHLIGHT_MIGRATION = {
  MAX_SCAN_LIMIT: 500, // localStorage 遍歷上限，避免性能問題
};

// ERROR_MESSAGES has been moved to messages.js

// ==========================================
// 安全驗證相關常量
// ==========================================

export const SECURITY_CONSTANTS = {
  // SVG 驗證白名單標籤 (來自 securityUtils.js)
  SVG_ALLOWED_TAGS: [
    'svg',
    'path',
    'circle',
    'rect',
    'line',
    'polyline',
    'polygon',
    'ellipse',
    'g',
    'defs',
    'use',
    'symbol',
    'title',
    'desc',
    'lineargradient', // 注意：轉為小寫比較
    'radialgradient',
    'stop',
    'clippath',
    'mask',
    'pattern',
    'text',
    'tspan',
    'image', // 允許圖片（但已在危險模式中檢查 data: 協議）
    'a', // 允許連結（但已在危險模式中檢查 javascript: 協議）
  ],

  // SVG 驗證白名單屬性 (來自 securityUtils.js)
  SVG_ALLOWED_ATTRS: [
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'width',
    'height',
    'class',
    'id',
    'xmlns',
    'x',
    'y',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'd',
    'points',
    'x1',
    'y1',
    'x2',
    'y2',
    'transform',
    'opacity',
  ],

  // 安全 URL 協議
  SAFE_URL_PROTOCOLS: ['http:', 'https:', ''],
};

// ==========================================
// UI 樣式相關常量
// ==========================================

export const UI_STYLE_CONSTANTS = {
  INLINE_BLOCK: 'inline-block',
  TEXT_BOTTOM: 'text-bottom',
};
