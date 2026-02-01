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
  VERSION: '2025-09-03', // Notion API 版本
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
  LOADING_TIMEOUT_MS: 10000, // 頁面載入超時時間 (ms)
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

// ==========================================
// 錯誤訊息相關常量
// ==========================================

/**
 * 錯誤訊息配置
 * 分為三個層次：
 * 1. TECHNICAL - 技術錯誤（供 ErrorHandler 內部使用）
 * 2. USER_MESSAGES - 用戶友善訊息（直接使用）
 * 3. PATTERNS - 錯誤映射規則（供 ErrorHandler.formatUserMessage 使用）
 */
export const ERROR_MESSAGES = {
  /**
   * 技術錯誤訊息（開發者使用）
   * 這些是業務代碼中拋出的原始錯誤訊息，會被 ErrorHandler 轉換為友善訊息
   */
  TECHNICAL: {
    NO_ACTIVE_TAB: 'Could not get active tab.',
    MISSING_API_KEY: 'API Key is missing.',
    MISSING_DATA_SOURCE: 'Data Source ID is missing.',
    MISSING_PAGE_ID: 'Page ID is missing',
    PAGE_NOT_SAVED: 'Page not saved yet. Please save the page first.',
    NO_NOTION_URL: 'No URL provided',
    API_KEY_NOT_CONFIGURED: 'Notion API Key not configured',
  },

  /**
   * 用戶友善訊息（直接使用）
   * 這些是業務代碼中直接返回給用戶的友善訊息，不需要轉換
   */
  USER_MESSAGES: {
    // === 頁面保存相關 ===
    PAGE_NOT_SAVED_TO_NOTION: '頁面尚未保存到 Notion，請先點擊「保存頁面」',
    NO_NOTION_PAGE_URL: '無法獲取 Notion 頁面 URL',

    // === 標註功能限制 ===
    HIGHLIGHT_NOT_SUPPORTED: '此頁面不支援標註功能（系統頁面或受限網址）',
    BUNDLE_INIT_TIMEOUT: 'Bundle 初始化超時，請重試或刷新頁面',

    // === 安全性檢查 ===
    INVALID_URL_PROTOCOL: '拒絕訪問：僅支持 HTTP/HTTPS 協議的有效 URL',
    INVALID_URLS_IN_BATCH: '拒絕訪問：包含無效或不支持的 URL',
    NOTION_DOMAIN_ONLY: '安全性錯誤：僅允許打開 Notion 官方網域的頁面',

    // === 參數驗證 ===
    MISSING_URL: '缺少 URL 參數',

    // === 數據操作 ===
    NO_HIGHLIGHT_DATA: '找不到該頁面的標註數據',

    // === Migration 系統 ===
    MIGRATION_EXECUTOR_NOT_LOADED: 'MigrationExecutor 未載入',
    HIGHLIGHTER_MANAGER_NOT_INITIALIZED: 'HighlighterV2.manager 未初始化',

    // === 網路與服務 ===
    CHECK_PAGE_EXISTENCE_FAILED: '檢查頁面狀態時發生網路錯誤或服務不可用，請稍後再試。',
    CONTENT_EXTRACTION_FAILED: '內容提取失敗，請查看瀏覽器控制台或稍後再試。',
    CONTENT_PARSE_FAILED: '無法解析頁面內容，請查看瀏覽器控制台或稍後再試。',
    CONTENT_TITLE_MISSING: '無法獲取頁面標題，請查看瀏覽器控制台。',
    CONTENT_BLOCKS_MISSING: '無法獲取頁面內容區塊，請查看瀏覽器控制台。',
  },

  /**
   * 錯誤模式映射（供 ErrorHandler.formatUserMessage 使用）
   * 將外部 API/系統錯誤轉換為用戶友善訊息
   * 格式：{ '錯誤關鍵字': '友善訊息' }
   */
  PATTERNS: {
    // Chrome API 錯誤
    'No tab with id': '頁面狀態已變更，請重新整理頁面後再試',
    'active tab': '無法獲取當前分頁，請確保擴展有權限存取此頁面',
    'Cannot access contents': '無法存取此頁面內容，可能是受保護的系統頁面',
    'Receiving end does not exist': '頁面載入中，請稍候再試',
    'Could not establish connection': '頁面通訊失敗，請重新整理頁面',

    // Notion API 錯誤
    'API Key': '請先在設定頁面配置 Notion API Key',
    'Data Source ID': '請先在設定頁面選擇 Notion 資料庫',
    'Page ID is missing': '無法識別頁面，請重回 Notion 頁面再試',
    'Page not saved': '頁面尚未保存，請先保存頁面',
    'Invalid request': '請求無效，請檢查設定與內容格式',

    // 網路與限流
    'Network error': '網路連線異常，請檢查網路後重試',
    'rate limit': '請求過於頻繁，請稍後再試',
  },

  /**
   * 預設錯誤訊息
   * 當無法匹配任何 PATTERN 時使用
   */
  DEFAULT: '操作失敗，請稍後再試。如問題持續，請查看擴充功能設置',
};
