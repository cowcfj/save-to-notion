import { UI_MESSAGES } from '../ui/index.js';
import { USER_MESSAGES } from './user.js';

export const PATTERNS = {
  'No tab with id': '頁面狀態已變更，請重新整理頁面後再試',
  'active tab': '無法獲取當前分頁，請確保擴展有權限存取此頁面',
  'Cannot access contents': '無法存取此頁面內容，可能是受保護的系統頁面',
  'Receiving end does not exist': '頁面載入中，請稍候再試',
  'Could not establish connection': '頁面通訊失敗，請重新整理頁面',
  oauth_identity_unavailable: UI_MESSAGES.AUTH.OAUTH_UNAVAILABLE,
  'OAuth Identity API unavailable': UI_MESSAGES.AUTH.OAUTH_UNAVAILABLE,

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

  rate_limited: '請求過於頻繁，請稍後再試',
  conflict_error: '發生資料衝突，請稍後重試',
  object_not_found: '找不到目標頁面或資料庫，請確認資源存在且已授權',
  unauthorized: USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED,
  invalid_request_url: '請求的 URL 無效，請確認頁面網址正確',
  invalid_json: '資料格式錯誤，請稍後再試',
  service_unavailable: 'Notion 服務暫時不可用，請稍後再試',
  internal_server_error: 'Notion 伺服器錯誤，請稍後再試',

  'Network error': '網路連線異常，請檢查網路後重試',
  'rate limit': '請求過於頻繁，請稍後再試',
  timeout: '請求超時，請檢查網路連線',

  'Internal Server Error': 'Notion 服務暫時不可用，請稍後再試',
  'Unknown Error': '發生未知錯誤，請稍後再試',
};

export const DEFAULT = '操作失敗，請稍後再試。如問題持續，請查看擴充功能設置';

export const API_ERROR_PATTERNS = {
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
  DATA_SOURCE: ['database', 'object_not_found'],

  VALIDATION: ['validation', 'image', 'media', 'conflict', 'bad request', 'invalid', '400'],
  NETWORK: ['network', 'fetch', 'timeout', 'enotfound'],

  SERVER_ERROR: ['service', 'unavailable', 'internal', 'error'],
};
