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
    EXPORT_SUCCESS: count => `已成功匯出 ${count} 條日誌`,
    EXPORT_FAILED_PREFIX: '匯出失敗：',
    EXPORTING: '匯出中...',
  },
  SETTINGS: {
    SAVE_SUCCESS: '設置已成功保存！',
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
    // 狀態標籤
    STATUS_CONNECTED: '已連接到 Notion',
    STATUS_DISCONNECTED: '未連接到 Notion',

    // 按鈕動作
    ACTION_CONNECT: '連接到 Notion',
    ACTION_RECONNECT: '重新設置',

    // 即時提示
    NOTIFY_SUCCESS: 'Notion 連接成功！',
    NOTIFY_ERROR: 'Notion 連接失敗，請重試。',

    // 導航/其他
    OPENING_NOTION: '正在打開 Notion...',
    OPEN_NOTION_FAILED: error => `打開 Notion 頁面失敗: ${error}`,
  },
  SETUP: {
    MISSING_CONFIG: '請先完成設定頁面的配置',
  },
  POPUP: {
    SAVING: '儲存中...',
    SAVE_FAILED_PREFIX: '儲存失敗：',
    HIGHLIGHT_STARTING: '正在啟動標註模式...',
    HIGHLIGHT_ACTIVATED: '標註模式已啟動！',
    HIGHLIGHT_FAILED: '啟動標註模式失敗。',
    OPEN_NOTION_FAILED: '打開 Notion 頁面失敗。',
    CLEAR_CONFIRM: '確定要清除頁面上的所有標記嗎？這個操作無法撤銷。',
    CLEARING: '正在清除標註...',
    CLEAR_FAILED: '清除標註失敗。',
    CLEAR_SUCCESS: count => `已成功清除 ${count} 條標註！`,
    PAGE_READY: '頁面已儲存，可以開始標註或再次儲存。',
  },
  TOOLBAR: {
    SYNCING: '正在同步...',
    SYNC_SUCCESS: '同步成功',
    SYNC_FAILED: '同步失敗',
    SYNC_FAILED_PREFIX: '同步失敗：',
  },
  STORAGE: {
    CHECKING: '正在檢查數據完整性...',
    REPORT_TITLE: '數據完整性報告：',
    TOTAL_ITEMS: count => `• 總共 ${count} 個數據項`,
    HIGHLIGHT_PAGES: count => `• ${count} 個頁面有標記`,
    CONFIG_ITEMS: count => `• ${count} 個配置項`,
    MIGRATION_DATA: (count, size) => `• ${count} 個遷移數據（${size} KB，可清理）`,
    CORRUPTED_DATA: count => `• ${count} 個損壞的數據項`,
    OPTIMIZATION_SUGGESTION: '• 建議使用「數據重整」功能清理遷移數據',
    INTEGRITY_OK: '• 所有數據完整無損',
    BACKUP_START: '正在備份數據...',
    RESTORE_START: '正在恢復數據...',
    INVALID_BACKUP_FORMAT: '無效的備份文件格式',
    CLEANUP_NONE: '沒有需要清理的數據',
    OPTIMIZE_NONE: '數據已經處於最佳狀態',
    CLEANUP_TITLE: '安全清理預覽',
    CLEANUP_WILL_CLEAN: '將清理：',
    DELETED_PAGES_DATA: count => `• ${count} 個已刪除頁面的數據`,
    SPACE_FREED_ESTIMATE: size => `釋放約 ${size} MB 空間`,
    EXECUTE_CLEANUP_NONE: '沒有清理計劃可執行',
    CLEANUP_EXECUTING: '正在執行安全清理...',
    CLEANUP_SUCCESS: (keys, size) =>
      `安全清理完成！已移除 ${keys} 個無效記錄，釋放 ${size} KB 空間`,
    CLEANUP_DELETED_PAGES: count => `• 清理了 ${count} 個已刪除頁面的數據`,
    CLEANUP_FAILED: '清理失敗：',
    PREVIEW_CLEANUP_FAILED: '預覽清理失敗：',
    OPTIMIZE_SUCCESS: size =>
      `數據重整完成！已清理遷移數據，節省 ${size} KB 空間，所有標記內容完整保留`,
    OPTIMIZE_FAILED: '數據重整失敗：',
    BACKUP_SUCCESS: '數據備份成功！備份文件已下載。',
    BACKUP_FAILED: '備份失敗：',
    RESTORE_SUCCESS: count => `數據恢復成功！已恢復 ${count} 項數據。正在重新整理...`,
    RESTORE_FAILED: '恢復失敗：',
    CHECK_FAILED: '檢查失敗：',
    OPTIMIZE_EXECUTE_NONE: '沒有重整計劃可執行',
    OPTIMIZING: '正在執行數據重整...',
    USAGE_TOO_LARGE: size => `數據量過大 (${size} MB)，可能影響擴展性能，建議立即清理`,
    USAGE_LARGE: size => `數據量較大 (${size} MB)，建議清理不需要的標記數據以維持最佳性能`,
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
    BACKGROUND_NO_RESPONSE: '未收到背景頁回應',
    LOG_EXPORT_FAILED: '日誌導出失敗',
    SVG_PARSE_ERROR: 'SVG parse error',
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
