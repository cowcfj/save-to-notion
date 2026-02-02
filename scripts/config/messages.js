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
    SELECT_REMINDER: '資料來源已選擇，請點擊保存設置',
    FOUND_COUNT: count => `找到 ${count} 個資料來源，請從下拉選單中選擇`,
    NO_RESULT: keyword => `未找到 "${keyword}" 相關的保存目標`,
    NO_DATA_SOURCE_FOUND:
      '未找到任何保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料來源',
    LOAD_FAILED: error => `載入保存目標失敗: ${error}`,
    DEFAULT_OPTION: '選擇資料來源...',
  },
  LOGS: {
    EXPORT_SUCCESS: count =>
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> 已成功導出 ${count} 條日誌`,
    EXPORT_FAILED: error =>
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ${error || '導出失敗，請稍後再試'}`,
  },
  SETTINGS: {
    SAVE_SUCCESS:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> 設置已成功保存！',
    SAVE_FAILED: '保存失敗，請查看控制台日誌或稍後再試。',
    MISSING_API_KEY: '請輸入 API Key',
    INVALID_ID: '資料來源 ID 格式無效。請輸入有效的 32 字符 ID 或完整的 Notion URL',
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
    CONNECTED: '已連接到 Notion',
    NOT_CONNECTED: '未連接到 Notion',
    CONNECT: '連接到 Notion',
    RECONNECT: '重新設置',
    OPENING_NOTION: '正在打開 Notion...',
    OPEN_NOTION_FAILED: error => `打開 Notion 頁面失敗: ${error}`,
  },
  SETUP: {
    MISSING_CONFIG: '請先完成設定頁面的配置',
  },
  POPUP: {
    SAVING: 'Saving...',
    SAVE_FAILED_PREFIX: 'Failed to save: ',
    HIGHLIGHT_STARTING: 'Starting highlight mode...',
    HIGHLIGHT_ACTIVATED: 'Highlight mode activated!',
    HIGHLIGHT_FAILED: 'Failed to start highlight mode.',
    OPEN_NOTION_FAILED: 'Failed to open Notion page.',
    CLEAR_CONFIRM: '確定要清除頁面上的所有標記嗎？這個操作無法撤銷。',
    CLEARING: 'Clearing highlights...',
    CLEAR_FAILED: 'Failed to clear highlights.',
    CLEAR_SUCCESS: count => `Cleared ${count} highlights successfully!`,
    PAGE_READY: 'Page saved. Ready to highlight or save again.',
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

  // === API 認證與權限 ===
  INVALID_API_KEY_FORMAT: 'API Key 格式無效，請確認是否完整複製',
  DATABASE_ACCESS_DENIED: '無法存取此資料庫，請確認已授權擴展存取權限',
  INTEGRATION_DISCONNECTED: '與 Notion 的連接已斷開，請重新授權',

  // === 初始設定 ===
  SETUP_MISSING_API_KEY: '請先在設定頁面配置 Notion API Key',
  SETUP_MISSING_DATA_SOURCE: '請先在設定頁面選擇 Notion 資料庫',
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

    // Notion API 錯誤
    'API Key': USER_MESSAGES.SETUP_MISSING_API_KEY,
    'Invalid API Key format': USER_MESSAGES.INVALID_API_KEY_FORMAT,
    'Data Source ID': USER_MESSAGES.SETUP_MISSING_DATA_SOURCE,
    'Database access denied': USER_MESSAGES.DATABASE_ACCESS_DENIED,
    'Integration disconnected': USER_MESSAGES.INTEGRATION_DISCONNECTED,
    'Page ID is missing': '無法識別頁面，請重回 Notion 頁面再試',
    'Page not saved': '頁面尚未保存，請先保存頁面',
    'Invalid request': '請求無效，請檢查設定與內容格式',

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
