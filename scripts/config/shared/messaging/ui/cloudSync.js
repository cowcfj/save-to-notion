export const CLOUD_SYNC = {
  LAST_UPLOAD_PREFIX: '上次上載：',
  LAST_REMOTE_PREFIX: '雲端備份：',
  NEVER_UPLOADED: '尚未上載',

  SYNC_FAILED_PREFIX: '同步失敗：',
  ERROR_TIME_PREFIX: '發生時間：',

  LOADING_ACCOUNT_STATUS: '檢查登入與雲端狀態中...',
  LOADING_STATUS_SYNC: '檢查雲端狀態中...',
  LOADING_UPLOAD: '上載到雲端中...',
  LOADING_FORCE_UPLOAD: '強制上載中...',
  LOADING_DOWNLOAD: '從雲端還原中...',
  LOADING_DISCONNECT: '中斷連線中...',

  UPLOAD_SUCCESS: '上載成功！',
  DOWNLOAD_SUCCESS: '還原成功！頁面資料已從雲端更新。',
  DISCONNECT_SUCCESS: '已中斷 Google Drive 連線',

  CONNECT_FAILED_PREFIX: '連接失敗：',
  UPLOAD_FAILED_PREFIX: '上載失敗：',
  DOWNLOAD_FAILED_PREFIX: '還原失敗：',
  DISCONNECT_FAILED: '中斷連線失敗，請重試',

  BG_NO_RESPONSE: '背景無回應',
  UPLOAD_FAILED_GENERIC: '上載失敗',
  DOWNLOAD_FAILED_GENERIC: '下載失敗',

  CONFIRM_DOWNLOAD:
    '從 Google Drive 還原資料將覆蓋本地所有已儲存的標記與保存記錄。\n\n確定要繼續嗎？',
  CONFIRM_DISCONNECT:
    '確定要中斷 Google Drive 連線嗎？\n\n本地資料不受影響，但雲端同步功能將停用。',
  CONFIRM_FORCE_UPLOAD: '確定要強制上載並覆蓋較新的雲端版本嗎？\n\n此操作無法還原。',

  FREQUENCY_LABEL: '自動同步頻率',
  FREQUENCY_OFF: '停用（僅手動）',
  FREQUENCY_DAILY: '每日',
  FREQUENCY_WEEKLY: '每週',
  FREQUENCY_MONTHLY: '每30天',
  AUTO_SYNC_NEEDS_REVIEW: '❗ 雲端備份較新，請手動處理',
  FREQUENCY_SAVE_SUCCESS: '自動同步設定已儲存',
  FREQUENCY_SAVE_FAILED: '設定儲存失敗，請重試',

  SOURCE_WARNING: '⚠️ 目前雲端備份來自其他裝置或擴展安裝',
  CONFIRM_CROSS_INSTALL_UPLOAD:
    '目前雲端備份來自其他裝置或擴展安裝。\n\n若繼續上載，可能覆蓋該裝置最近的備份。確定要繼續嗎？',
};
