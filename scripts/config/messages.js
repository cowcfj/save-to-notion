/**
 * 訊息配置模組
 * 集中管理所有用戶可見的文本訊息，包含 UI 提示與錯誤訊息
 */

/**
 * UI 提示訊息（非錯誤類）
 */
export const UI_MESSAGES = {
  DATA_SOURCE: {
    LOADING: '正在載入保存目標列表...',
    SEARCHING: keyword => `正在搜尋 "${keyword}"...`,
    SELECT_REMINDER: '保存目標已選擇，請點擊保存設置',
    LOAD_SUCCESS: count => `已成功載入 ${count} 個保存目標`,
    FOUND_COUNT: count => `找到 ${count} 個保存目標，請從下拉選單中選擇`,
    NO_RESULT: keyword => `未找到 "${keyword}" 相關的保存目標`,
    NO_DATA_SOURCE_FOUND:
      '未找到任何保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料庫',
    LOAD_FAILED: error => `載入保存目標失敗: ${error}`,
    DEFAULT_OPTION: '選擇保存目標...',
  },
  LOGS: {
    EXPORT_SUCCESS: count => `已成功匯出 ${count} 條日誌`,
    EXPORT_FAILED_PREFIX: '匯出失敗：',
    EXPORTING: '匯出中...',
  },
  SETTINGS: {
    SAVE_SUCCESS: '設置已成功保存！',
    SAVE_FAILED: '保存失敗，請查看控制台日誌或稍後再試。',
    // Renamed to avoid security scanner false positives
    KEY_INPUT_REQUIRED: '請輸入 API Key',
    INVALID_ID: '保存目標 ID 格式無效。請輸入有效的 32 字符 ID 或完整的 Notion URL',
    DEBUG_LOGS_ENABLED: '已啟用偵測日誌（前端日誌將轉送到背景頁）',
    DEBUG_LOGS_DISABLED: '已停用偵測日誌',
    DEBUG_LOGS_TOGGLE_FAILED: error => `切換日誌模式失敗: ${error}`,
    DISCONNECT_SUCCESS: '已成功斷開與 Notion 的連接。',
    DISCONNECT_FAILED: error => `斷開連接失敗: ${error}`,
    API_KEY_FORMAT_ERROR: 'API Key 格式不正確，長度太短',
    TEST_API_LABEL: '測試 API Key',
    TESTING_LABEL: '測試中...',
  },
  AUTH: {
    // 狀態標籤
    STATUS_CONNECTED: '已連接到 Notion',
    STATUS_DISCONNECTED: '未連接到 Notion',

    // 按鈕動作
    ACTION_CONNECT: '連接到 Notion',
    ACTION_RECONNECT: '重新設置',
    OAUTH_ACTION_CONNECT: '以 OAuth 連接 Notion',
    OAUTH_CONNECTING: '連接中...',
    OAUTH_UNAVAILABLE: '目前環境不支援 OAuth（缺少 identity 權限或擴充功能版本不完整）',
    // Renamed to avoid security scanner false positives
    MISSING_ENV_CONFIG: 'OAuth 功能未啟用，請在 scripts/config/env.js 中設定 OAUTH_CLIENT_ID',

    // 即時提示
    NOTIFY_SUCCESS: 'Notion 連接成功！',
    NOTIFY_ERROR: 'Notion 連接失敗，請重試。',
    OAUTH_TARGET_REQUIRED: '已連接 Notion，下一步請選擇保存目標並按儲存。',

    // 導航/其他
    OPENING_NOTION: '正在打開 Notion...',
    OPEN_NOTION_FAILED: error => `打開 Notion 頁面失敗: ${error}`,
  },
  ACCOUNT: {
    AVATAR_ALT: '使用者頭像',
    LOCKED_LOGIN_REQUIRED: '需先登入 Google 帳號。',
    LOCKED_COMING_SOON: '功能即將推出。',
  },
  SETUP: {
    MISSING_CONFIG: '請先完成設定頁面的配置',
  },
  POPUP: {
    SAVING: '儲存中...',
    SAVE_FAILED_PREFIX: '儲存失敗：',
    HIGHLIGHT_STARTING: '載入標註模式...',
    HIGHLIGHT_ACTIVATED: '標註模式已啟動！',
    HIGHLIGHT_FAILED: '啟動標註模式失敗。',
    OPEN_NOTION_FAILED: '開啟 Notion 頁面失敗。',
    CLEAR_CONFIRM: '確定要清除頁面上的所有標註嗎？這個操作無法復原。',
    CLEARING: '正在清除標註...',
    CLEAR_FAILED: '清除標註失敗。',
    CLEAR_SUCCESS: count => `已成功清除 ${count} 條標註！`,
    HIGHLIGHT_FAILED_PREFIX: '啟動標註失敗：',
    PAGE_READY: '頁面已儲存，可開始標註。',
    START_HIGHLIGHT: '開始標註',
    DELETED_PAGE: '原頁面已刪除，請重新儲存。',
    DELETION_PENDING: '正在確認原頁面是否已刪除，請稍後再試。',
    SAVE_SUCCESS: '儲存成功！',
    RECREATED: '重建成功 (原頁面已刪除)',
    HIGHLIGHTS_UPDATED: '標註已更新',
    UPDATED: '更新成功',
    CREATED: '建立成功',
  },
  SIDEPANEL: {
    NOT_SUPPORTED: '不支援此頁面',
    LOAD_FAILED: '載入標註失敗',
    SYNCING: '同步中...',
    SYNC_SUCCESS: '同步成功',
    SYNC_FAILED: '同步失敗',
    OPENING: '開啟中...',
    OPEN_SUCCESS: '開啟成功',
    OPEN_FAILED: '開啟失敗',
    ALL_SYNCED: '已全部同步',
    NO_HIGHLIGHTS: '此網頁尚無標註',
    NO_HIGHLIGHTS_SUBTITLE: '選取文字即可開始標註',
    REMAINING_COUNT: count => `還有 ${count} 筆`,
    PAGE_COUNT: count => `${count} 個頁面`,
    HIGHLIGHT_COUNT: count => `${count} 個標註`,
  },
  HIGHLIGHTS: {
    NO_NEW_TO_SYNC: '沒有新標註需要同步',
    SYNC_SUCCESS_COUNT: count => `成功同步 ${count} 個標註`,
  },
  TOOLBAR: {
    SYNCING: '正在同步...',
    SYNC_SUCCESS: '同步成功',
    SYNC_FAILED: '同步失敗',
    SYNC_FAILED_PREFIX: '同步失敗：',
  },
  STORAGE: {
    // === 備份/恢復 ===
    BACKUP_START: '正在備份數據...',
    BACKUP_SUCCESS: '數據備份成功！備份文件已下載。',
    BACKUP_FAILED: '備份失敗：',
    IMPORT_START: '正在匯入數據...',
    IMPORT_FAILED: '匯入失敗：',
    INVALID_BACKUP_FORMAT: '無效的備份文件格式',

    // === 增量匯入 ===
    IMPORT_SELECT_MODE: '請選擇匯入模式：',
    IMPORT_MODE_HINT:
      '「新增 + 覆蓋衝突」會合併備份，並以備份資料覆蓋衝突項；「僅匯入新資料」最安全，不會改動任何現有標註；「全部覆蓋」會清除所有現有資料。',
    IMPORT_MODE_OVERWRITE_ALL: '全部覆蓋',
    IMPORT_MODE_NEW_ONLY: '僅匯入新資料',
    IMPORT_MODE_NEW_AND_OVERWRITE: '新增 + 覆蓋衝突',
    IMPORT_CANCEL: '取消',
    IMPORT_CANCELED: '已取消匯入。',
    IMPORT_SUCCESS: (newCount, overwriteCount, skipCount) =>
      `匯入完成！新增 ${newCount} 項、覆蓋 ${overwriteCount} 項、跳過 ${skipCount} 項相同資料。正在重新整理...`,
    IMPORT_NOTHING_TO_DO: '備份與本地資料一致，無需匯入。',
    IMPORT_NEW_ONLY_ALL_CONFLICTS: skipCount =>
      `僅新增模式下無新項可匯入，已跳過 ${skipCount} 項衝突。`,

    // === 統一清理（由 getStorageHealthReport 驅動）===
    CLEANUP_EXECUTING: '正在執行數據優化...',
    UNIFIED_CLEANUP_SUCCESS: (keys, size) =>
      `數據優化完成！已清理 ${keys} 個項目，釋放 ${size} KB 空間`,
    CLEANUP_SUMMARY: (parts, spaceKB) => `可清理：${parts.join('、')}，預計釋放 ${spaceKB} KB`,
    NO_CLEANUP_NEEDED: '無可清理項目',
    CLEANUP_FAILED: errorMsg => `清理失敗：${errorMsg}`,

    // === 數據健康度 ===
    HEALTH_CORRUPTED: count => `發現 ${count} 個損壞的數據項`,
    HEALTH_MIGRATION_LEFTOVERS: (count, size) => `${count} 個舊版格式升級殘留（${size} KB）`,
    HEALTH_LEGACY_SAVED: count => `${count} 個舊版網頁保存紀錄（重訪相關網頁時會自動升級）`,
    HEALTH_OK: '數據完整',

    // === 使用量警告 ===
    USAGE_TOO_LARGE: size => `數據量過大 (${size} MB)，可能影響擴展性能，建議立即清理`,
    USAGE_LARGE: size => `數據量較大 (${size} MB)，建議清理不需要的標記數據以維持最佳性能`,
  },
  CLOUD_SYNC: {
    // === 狀態顯示（後接 timestamp 或 error code 作為結尾）===
    LAST_UPLOAD_PREFIX: '上次上載：',
    LAST_REMOTE_PREFIX: '雲端備份：',
    NEVER_UPLOADED: '尚未上載',

    // === 錯誤 banner（後接 error code 或 timestamp）===
    SYNC_FAILED_PREFIX: '同步失敗：',
    ERROR_TIME_PREFIX: '發生時間：',

    // === Loading overlay 文字 ===
    LOADING_UPLOAD: '上載到雲端中...',
    LOADING_FORCE_UPLOAD: '強制上載中...',
    LOADING_DOWNLOAD: '從雲端還原中...',
    LOADING_DISCONNECT: '中斷連線中...',

    // === 成功 toast ===
    UPLOAD_SUCCESS: '上載成功！',
    DOWNLOAD_SUCCESS: '還原成功！頁面資料已從雲端更新。',
    DISCONNECT_SUCCESS: '已中斷 Google Drive 連線',

    // === 失敗 toast（*_PREFIX 後接 sanitized error message）===
    CONNECT_FAILED_PREFIX: '連接失敗：',
    UPLOAD_FAILED_PREFIX: '上載失敗：',
    DOWNLOAD_FAILED_PREFIX: '還原失敗：',
    DISCONNECT_FAILED: '中斷連線失敗，請重試',

    // === 內部 Error 訊息（拋出後交給 sanitizeApiError / ErrorHandler 處理）===
    BG_NO_RESPONSE: '背景無回應',
    UPLOAD_FAILED_GENERIC: '上載失敗',
    DOWNLOAD_FAILED_GENERIC: '下載失敗',

    // === Confirm dialog（含 \n\n 分段）===
    CONFIRM_DOWNLOAD:
      '從 Google Drive 還原資料將覆蓋本地所有已儲存的標記與保存記錄。\n\n確定要繼續嗎？',
    CONFIRM_DISCONNECT:
      '確定要中斷 Google Drive 連線嗎？\n\n本地資料不受影響，但雲端同步功能將停用。',
    CONFIRM_FORCE_UPLOAD: '確定要強制上載並覆蓋較新的雲端版本嗎？\n\n此操作無法還原。',
    // === Phase B: 自動同步頻率 ===
    FREQUENCY_LABEL: '自動同步頻率',
    FREQUENCY_OFF: '停用（僅手動）',
    FREQUENCY_DAILY: '每日',
    FREQUENCY_WEEKLY: '每週',
    FREQUENCY_MONTHLY: '每月',
    AUTO_SYNC_NEVER: '尚未自動同步',
    AUTO_SYNC_NEEDS_REVIEW: '❗ 雲端備份較新，請手動處理',
    FREQUENCY_SAVE_SUCCESS: '自動同步設定已儲存',
    FREQUENCY_SAVE_FAILED: '設定儲存失敗，請重試',
  },
};

const USER_MESSAGES = {
  // === 頁面保存相關 ===
  PAGE_NOT_SAVED_TO_NOTION: '頁面尚未保存到 Notion，請先點擊「保存頁面」',
  NO_NOTION_PAGE_URL: '無法獲取 Notion 頁面 URL',

  // === 標註功能限制 ===
  HIGHLIGHT_NOT_SUPPORTED: '此頁面不支援標註功能（系統頁面或受限網址）',
  BUNDLE_INIT_TIMEOUT: 'Bundle 初始化超時，請重試或刷新頁面',

  // === 保存功能限制 ===
  SAVE_NOT_SUPPORTED_RESTRICTED_PAGE: '此頁面無法保存（受限頁面不支援擴展運作）',

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

  // === API 請求驗證 ===
  API_VALIDATION_FAILED: '資料驗證失敗，請確認設定正確後再試',

  // === API 認證與權限 ===
  INVALID_API_KEY_FORMAT: 'API Key 格式無效，請確認是否完整複製',
  DATABASE_ACCESS_DENIED: '無法存取此資料庫，請確認已授權擴展存取權限',
  INTEGRATION_DISCONNECTED: '與 Notion 的連接已斷開，請重新授權',

  // === 初始設定 ===
  // Renamed to avoid security scanner false positives
  SETUP_KEY_NOT_CONFIGURED: '請先在設定頁面配置 Notion API Key',
  SETUP_MISSING_DATA_SOURCE: '請先在設定頁面選擇 Notion 資料庫',
};

/**
 * 安全相關錯誤訊息
 * 集中管理安全驗證失敗時的提示訊息
 */
export const SECURITY_ERROR_MESSAGES = {
  TAB_CONTEXT_REQUIRED: '拒絕訪問：此操作必須在標籤頁上下文中調用',
  INTERNAL_ONLY: '拒絕訪問：此操作僅限擴充功能內部調用',
  CONTENT_SCRIPT_ONLY: '拒絕訪問：僅限本擴充功能的 content script 調用',
};

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
    NO_ACTIVE_TAB: 'active tab',
    MISSING_API_KEY: 'API Key',
    MISSING_DATA_SOURCE: 'Data Source ID',
    MISSING_PAGE_ID: 'Page ID is missing',
    PAGE_NOT_SAVED: 'Page not saved',
    NO_NOTION_URL: 'No URL provided',
    API_KEY_NOT_CONFIGURED: 'API Key',
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
  },

  /**
   * 用戶友善訊息（直接使用）
   * 這些是業務代碼中直接返回給用戶的友善訊息，不需要轉換
   */
  USER_MESSAGES,

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
    oauth_identity_unavailable: UI_MESSAGES.AUTH.OAUTH_UNAVAILABLE,
    'OAuth Identity API unavailable': UI_MESSAGES.AUTH.OAUTH_UNAVAILABLE,

    // Notion API 錯誤（已轉換的關鍵字）
    'API Key': USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED,
    'Invalid API Key format': USER_MESSAGES.INVALID_API_KEY_FORMAT,
    'Data Source ID': USER_MESSAGES.SETUP_MISSING_DATA_SOURCE,
    'Database access denied': USER_MESSAGES.DATABASE_ACCESS_DENIED,
    'Integration disconnected': USER_MESSAGES.INTEGRATION_DISCONNECTED,
    'Integration forbidden (403)': USER_MESSAGES.DATABASE_ACCESS_DENIED,
    'Page ID is missing': '無法識別頁面，請重回 Notion 頁面再試',
    'Page not saved': '頁面尚未保存，請先保存頁面',
    'Invalid request': USER_MESSAGES.CONTENT_PARSE_FAILED,
    validation_error: USER_MESSAGES.API_VALIDATION_FAILED,
    image_validation_error: '圖片驗證失敗 (Notion API 拒絕)。如有需要，請導出偵錯日誌以查看詳情。',
    highlight_section_delete_incomplete: '標註同步未完成，請稍後再試',
    notionhq_client_response_error: 'Notion API 請求失敗，請稍後再試',

    // Notion SDK 原始錯誤碼（直接來自 apiError.code）
    // 這些 key 與 Notion SDK 的 APIResponseError.code 完全一致
    rate_limited: '請求過於頻繁，請稍後再試',
    conflict_error: '發生資料衝突，請稍後重試',
    object_not_found: '找不到目標頁面或資料庫，請確認資源存在且已授權',
    unauthorized: USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED,
    invalid_request_url: '請求的 URL 無效，請確認頁面網址正確',
    invalid_json: '資料格式錯誤，請稍後再試',
    service_unavailable: 'Notion 服務暫時不可用，請稍後再試',
    internal_server_error: 'Notion 伺服器錯誤，請稍後再試',

    // 網路與限流
    'Network error': '網路連線異常，請檢查網路後重試',
    'rate limit': '請求過於頻繁，請稍後再試',
    timeout: '請求超時，請檢查網路連線',

    // 內部與其他錯誤
    'Internal Server Error': 'Notion 服務暫時不可用，請稍後再試',
    'Unknown Error': '發生未知錯誤，請稍後再試',
  },

  /**
   * 預設錯誤訊息
   * 當無法匹配任何 PATTERN 時使用
   */
  DEFAULT: '操作失敗，請稍後再試。如問題持續，請查看擴充功能設置',
};

/**
 * API 錯誤關鍵字模式配置
 * 僅存儲純數據 (字串陣列)，供 securityUtils.js 中的分類器使用
 */
export const API_ERROR_PATTERNS = {
  // 1. 認證相關
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

  // 2. 權限相關
  PERMISSION: ['permission', 'access denied'],
  PERMISSION_DB: ['database'],

  // 3. 限制與資源
  RATE_LIMIT: ['rate limit', 'too many requests'],
  NOT_FOUND: ['not found', 'does not exist'],
  ACTIVE_TAB: ['active tab'],
  DATA_SOURCE: ['database', 'object_not_found'],

  // 4. 驗證與網路
  VALIDATION: ['validation', 'image', 'media', 'conflict', 'bad request', 'invalid', '400'],
  NETWORK: ['network', 'fetch', 'timeout', 'enotfound'],

  // 5. 伺服器錯誤 (需組合判斷)
  SERVER_ERROR: ['service', 'unavailable', 'internal', 'error'],
};

// ==========================================
// 日誌與錯誤類型定義
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
 * 標記區塊操作錯誤碼
 */
export const HIGHLIGHT_ERROR_CODES = {
  DELETE_INCOMPLETE: 'highlight_section_delete_incomplete',
  PHASE_DELETE: 'delete_highlight_section',
};
