/**
 * Background-safe UI response messages, supporting tree-shaking for background handlers.
 */

import { deepFreeze } from '../shared/deepFreeze.js';

export const BACKGROUND_MESSAGES = deepFreeze({
  POPUP: {
    DELETION_PENDING: '正在確認原頁面是否已刪除，請稍後再試。',
    DELETED_PAGE: '原頁面已刪除，請重新儲存。',
  },
  HIGHLIGHTS: {
    NO_NEW_TO_SYNC: '沒有新標註需要同步',
    SYNC_SUCCESS_COUNT: count => `成功同步 ${count} 個標註`,
  },
  STORAGE: {
    MIGRATION_BATCH_DELETE_SUCCESS: success => `成功刪除 ${success} 個頁面的標註數據`,
    MIGRATION_BATCH_DELETE_PARTIAL: (success, failed) =>
      `成功刪除 ${success} 個頁面，${failed} 個失敗`,
  },
  DESTINATION_PROFILE: {
    DEFAULT_PROFILE_NAME: '預設',
    CREATE_LIMIT_REACHED: '已達目的地數量上限。',
  },
  DRIVE_SYNC: {
    TRANSIENT_AUTH_ERROR: '臨時登入失效，請重新登入 Google 帳號或刷新 token 後再試。',
  },
  ACCOUNT: {
    LOGIN_PAGE_OPEN_FAILED: '無法開啟登入頁面，請稍後再試',
  },
});
