export const AUTH = {
  STATUS_CONNECTED: '已連接到 Notion',
  STATUS_DISCONNECTED: '未連接到 Notion',

  ACTION_CONNECT: '連接到 Notion',
  ACTION_RECONNECT: '重新設置',
  OAUTH_ACTION_CONNECT: '以 OAuth 連接 Notion',
  OAUTH_CONNECTING: '連接中...',
  OAUTH_UNAVAILABLE: '目前環境不支援 OAuth（缺少 identity 權限或擴充功能版本不完整）',
  MISSING_ENV_CONFIG: 'OAuth 功能未啟用，請在 scripts/config/env.js 中設定 OAUTH_CLIENT_ID',

  NOTIFY_SUCCESS: 'Notion 連接成功！',
  NOTIFY_ERROR: 'Notion 連接失敗，請重試。',
  OAUTH_TARGET_REQUIRED: '已連接 Notion，下一步請選擇保存目標並按儲存。',

  OPENING_NOTION: '正在打開 Notion...',
  OPEN_NOTION_FAILED: error => `打開 Notion 頁面失敗: ${error}`,
};

export const SETUP = {
  MISSING_CONFIG: '請先完成設定頁面的配置',
};
