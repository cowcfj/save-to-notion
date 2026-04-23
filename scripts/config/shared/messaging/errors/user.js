export const USER_MESSAGES = {
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
