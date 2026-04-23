export const SETTINGS = {
  SAVE_SUCCESS: '設置已成功保存！',
  SAVE_FAILED: '保存失敗，請查看控制台日誌或稍後再試。',
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
};
