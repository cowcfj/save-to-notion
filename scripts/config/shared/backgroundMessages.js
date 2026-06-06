/**
 * Background-safe UI response messages, supporting tree-shaking for background handlers.
 */

const FREEZABLE_TYPES = new Set(['object', 'function']);

function isFreezableValue(value) {
  return value !== null && FREEZABLE_TYPES.has(typeof value);
}

function deepFreeze(target) {
  if (!isFreezableValue(target)) {
    return target;
  }

  if (Object.isFrozen(target)) {
    return target;
  }

  for (const value of Object.values(target)) {
    if (isFreezableValue(value)) {
      deepFreeze(value);
    }
  }

  return Object.freeze(target);
}

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
});
