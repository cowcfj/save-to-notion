/**
 * Canonical error registries for the extension, supporting tree-shaking by avoiding the UI_MESSAGES monolith.
 */

function deepFreeze(target) {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
    return target;
  }

  if (Object.isFrozen(target)) {
    return target;
  }

  for (const value of Object.values(target)) {
    if (value && (typeof value === 'object' || typeof value === 'function')) {
      deepFreeze(value);
    }
  }

  return Object.freeze(target);
}

const TECHNICAL = {
  NO_ACTIVE_TAB: 'NO_ACTIVE_TAB',
  MISSING_API_KEY: 'API_KEY_NOT_CONFIGURED',
  MISSING_DATA_SOURCE: 'MISSING_DATA_SOURCE',
  MISSING_PAGE_ID: 'MISSING_PAGE_ID',
  PAGE_NOT_SAVED: 'PAGE_NOT_SAVED',
  API_KEY_NOT_CONFIGURED: 'API_KEY_NOT_CONFIGURED',
  GET_VERSION_FAILED: '無法獲取應用程式版本號',
  NAV_MISSING_ITEMS: '設定頁面：找不到導航項目或設定區塊',
  NAV_MISSING_ATTR: '設定頁面：導航項目缺少 data-section 屬性',
  NAV_TARGET_NOT_FOUND: '設定頁面：找不到目標區塊',
  TOOLBAR_SHOW_FAILED: 'Failed to show toolbar after save',
  BACKGROUND_NO_RESPONSE: '未收到背景頁回應',
  LOG_EXPORT_FAILED: '日誌導出失敗',
  SVG_PARSE_ERROR: 'SVG parse error',
  CHROME_STORAGE_UNAVAILABLE: 'Chrome storage not available',
  INVALID_PAGE_URL: 'Invalid pageUrl: must be a non-empty string',
  LOG_INVALID_URL: '無效的 URL 參數',
  CLEAR_NOTION_STATE_FAILED: '清除本地 Notion 狀態失敗',
};

export const LOG_LEVELS = deepFreeze({
  DEBUG: 0,
  LOG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
});

export const ERROR_TYPES = deepFreeze({
  EXTRACTION_FAILED: 'extraction_failed',
  INVALID_URL: 'invalid_url',
  NETWORK_ERROR: 'network_error',
  PARSING_ERROR: 'parsing_error',
  PERFORMANCE_WARNING: 'performance_warning',
  DOM_ERROR: 'dom_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error',
  STORAGE: 'storage',
  NOTION_API: 'notion_api',
  INJECTION: 'injection',
  PERMISSION: 'permission',
  INTERNAL: 'internal',
});

const USER_MESSAGES = {
  PAGE_NOT_SAVED_TO_NOTION: '頁面尚未保存到 Notion，請先點擊「保存頁面」',
  NO_NOTION_PAGE_URL: '無法獲取 Notion 頁面 URL',

  HIGHLIGHT_NOT_SUPPORTED: '此頁面不支援標註功能（系統頁面或受限網址）',
  BUNDLE_INIT_TIMEOUT: 'Bundle 初始化超時，請重試或刷新頁面',

  SAVE_NOT_SUPPORTED_RESTRICTED_PAGE: '此頁面無法保存（受限頁面不支援擴展運作）',

  INVALID_URL_PROTOCOL: '拒絕訪問：僅支持 HTTP/HTTPS 協議的有效 URL',
  INVALID_URLS_IN_BATCH: '拒絕訪問：包含無效或不支持的 URL',
  NOTION_DOMAIN_ONLY: '安全性錯誤：僅允許打開 Notion 官方網域的頁面',

  MISSING_URL: '缺少 URL 參數',

  NO_HIGHLIGHT_DATA: '找不到該頁面的標註數據',

  MIGRATION_EXECUTOR_NOT_LOADED: 'MigrationExecutor 未載入',
  HIGHLIGHTER_MANAGER_NOT_INITIALIZED: 'HighlighterV2.manager 未初始化',

  CHECK_PAGE_EXISTENCE_FAILED: '檢查頁面狀態時發生網路錯誤或服務不可用，請稍後再試。',
  CONTENT_EXTRACTION_FAILED: '內容提取失敗，請查看瀏覽器控制台或稍後再試。',
  CONTENT_PARSE_FAILED: '無法解析頁面內容，請查看瀏覽器控制台或稍後再試。',
  CONTENT_TITLE_MISSING: '無法獲取頁面標題，請查看瀏覽器控制台。',
  CONTENT_BLOCKS_MISSING: '無法獲取頁面內容區塊，請查看瀏覽器控制台。',

  API_VALIDATION_FAILED: '資料驗證失敗，請確認設定正確後再試',

  INVALID_API_KEY_FORMAT: 'API Key 格式無效，請確認是否完整複製',
  DATABASE_ACCESS_DENIED: '無法存取此資料庫，請確認已授權擴展存取權限',
  INTEGRATION_DISCONNECTED: '與 Notion 的連接已斷開，請重新授權',

  SETUP_KEY_NOT_CONFIGURED: '請先在設定頁面配置 Notion API Key',
  SETUP_MISSING_DATA_SOURCE: '請先在設定頁面選擇 Notion 資料庫',
};

export const SECURITY_ERROR_MESSAGES = deepFreeze({
  TAB_CONTEXT_REQUIRED: '拒絕訪問：此操作必須在標籤頁上下文中調用',
  INTERNAL_ONLY: '拒絕訪問：此操作僅限擴充功能內部調用',
  CONTENT_SCRIPT_ONLY: '拒絕訪問：僅限本擴充功能的 content script 調用',
});

const NOTION_SERVICE_UNAVAILABLE_MESSAGE = 'Notion 服務暫時不可用，請稍後再試';

const PATTERNS = {
  NO_TAB_WITH_ID: '頁面狀態已變更，請重新整理頁面後再試',
  NO_ACTIVE_TAB: '無法獲取當前分頁，請確保擴展有權限存取此頁面',
  TAB_RESTRICTED_PAGE: '無法存取此頁面內容，可能是受保護的系統頁面',
  CONTENT_SCRIPT_NOT_READY: '頁面載入中，請稍候再試',
  TAB_COMMUNICATION_FAILED: '頁面通訊失敗，請重新整理頁面',
  OAUTH_IDENTITY_UNAVAILABLE: '目前環境不支援 OAuth（缺少 identity 權限或擴充功能版本不完整）',

  API_KEY_NOT_CONFIGURED: USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED,
  INVALID_API_KEY_FORMAT: USER_MESSAGES.INVALID_API_KEY_FORMAT,
  MISSING_DATA_SOURCE: USER_MESSAGES.SETUP_MISSING_DATA_SOURCE,
  DATABASE_ACCESS_DENIED: USER_MESSAGES.DATABASE_ACCESS_DENIED,
  INTEGRATION_DISCONNECTED: USER_MESSAGES.INTEGRATION_DISCONNECTED,
  INTEGRATION_FORBIDDEN: USER_MESSAGES.DATABASE_ACCESS_DENIED,
  MISSING_PAGE_ID: '無法識別頁面，請重回 Notion 頁面再試',
  PAGE_NOT_SAVED: '頁面尚未保存，請先保存頁面',
  INVALID_REQUEST: USER_MESSAGES.CONTENT_PARSE_FAILED,
  VALIDATION_ERROR: USER_MESSAGES.API_VALIDATION_FAILED,
  IMAGE_VALIDATION_ERROR: '圖片驗證失敗 (Notion API 拒絕)。如有需要，請導出偵錯日誌以查看詳情。',
  HIGHLIGHT_SECTION_DELETE_INCOMPLETE: '標註同步未完成，請稍後再試',
  MIGRATION_BATCH_DELETE_PARTIAL_FAILURE: '部分標註數據刪除失敗，請稍後再試',
  NOTIONHQ_CLIENT_RESPONSE_ERROR: 'Notion API 請求失敗，請稍後再試',

  RATE_LIMITED: '請求過於頻繁，請稍後再試',
  CONFLICT_ERROR: '發生資料衝突，請稍後重試',
  OBJECT_NOT_FOUND: '找不到目標頁面或資料庫，請確認資源存在且已授權',
  UNAUTHORIZED: USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED,
  INVALID_REQUEST_URL: '請求的 URL 無效，請確認頁面網址正確',
  INVALID_JSON: '資料格式錯誤，請稍後再試',
  SERVICE_UNAVAILABLE: NOTION_SERVICE_UNAVAILABLE_MESSAGE,
  INTERNAL_SERVER_ERROR: NOTION_SERVICE_UNAVAILABLE_MESSAGE,

  NETWORK_ERROR: '網路連線異常，請檢查網路後重試',
  TIMEOUT: '請求超時，請檢查網路連線',

  UNKNOWN_ERROR: '發生未知錯誤，請稍後再試',

  DESTINATION_PROFILE_NOT_FOUND: '找不到指定的保存目的地，請重新整理後再試。',
  DESTINATION_PROFILE_NOT_CONFIGURED: '尚未設定保存目的地，請先到設定頁完成設定。',
  DESTINATION_PROFILE_NOT_ALLOWED: '此保存目的地目前不可使用，請改用其他保存目標。',
  UNKNOWN_DESTINATION_PROFILE_ERROR: '保存目的地無法使用，請重新整理後再試。',
};

const DEFAULT = '操作失敗，請稍後再試。如問題持續，請查看擴充功能設置';

export const API_ERROR_PATTERNS = deepFreeze({
  AUTH: [
    'unauthorized',
    'authentication',
    'api key',
    'api_key',
    'api_token',
    'api token',
    'bearer token',
  ],
  AUTH_DISCONNECTED: ['integration disconnected', 'invalid_token'],
  AUTH_INVALID: ['invalid api key', 'malformed_token'],
  AUTH_FORBIDDEN: ['forbidden', 'permission_denied', 'permission denied'],

  PERMISSION: ['permission', 'access denied'],
  PERMISSION_DB: ['database'],

  RATE_LIMIT: ['rate limit', 'too many requests'],
  NOT_FOUND: ['not found', 'does not exist'],
  ACTIVE_TAB: ['active tab'],
  TAB_NOT_FOUND: ['no tab with id'],
  RUNTIME_DISCONNECTED: ['receiving end does not exist'],
  CONNECTION_NOT_ESTABLISHED: ['could not establish connection'],
  DATA_SOURCE: ['database', 'object_not_found'],

  VALIDATION: ['validation', 'image', 'media', 'conflict', 'bad request', 'invalid', '400'],
  TIMEOUT: ['timeout', 'timed out'],
  NETWORK: ['network', 'fetch', 'enotfound'],

  SERVER_ERROR: ['service', 'unavailable', 'internal', 'error'],
});

export const HIGHLIGHT_ERROR_CODES = deepFreeze({
  DELETE_INCOMPLETE: 'HIGHLIGHT_SECTION_DELETE_INCOMPLETE',
  PHASE_DELETE: 'delete_highlight_section',
});

export const ERROR_MESSAGES = deepFreeze({
  TECHNICAL,
  USER_MESSAGES,
  PATTERNS,
  DEFAULT,
});
