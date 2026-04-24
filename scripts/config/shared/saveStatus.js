/**
 * 保存狀態契約輔助函式
 *
 * 集中定義跨 background / popup / toolbar 共享的保存狀態語意。
 */

export const SAVE_STATUS_KINDS = Object.freeze({
  SAVED: 'saved',
  UNSAVED: 'unsaved',
  DELETION_PENDING: 'deletion_pending',
  DELETED_REMOTE: 'deleted_remote',
  UNVERIFIED_SAVED: 'unverified_saved',
  ERROR: 'error',
});

const RESERVED_RESPONSE_FIELDS = new Set([
  'success',
  'statusKind',
  'stableUrl',
  'isSaved',
  'canSave',
  'canSyncHighlights',
  'wasDeleted',
  'deletionPending',
  'error',
  'notionPageId',
  'notionUrl',
  'title',
]);

const SAVE_STATUS_KIND_VALUES = new Set(Object.values(SAVE_STATUS_KINDS));

function resolveCapabilities(statusKind) {
  switch (statusKind) {
    case SAVE_STATUS_KINDS.SAVED:
    case SAVE_STATUS_KINDS.DELETION_PENDING:
    case SAVE_STATUS_KINDS.UNVERIFIED_SAVED: {
      return { canSave: false, canSyncHighlights: true };
    }
    case SAVE_STATUS_KINDS.UNSAVED:
    case SAVE_STATUS_KINDS.DELETED_REMOTE: {
      return { canSave: true, canSyncHighlights: false };
    }
    default: {
      return { canSave: false, canSyncHighlights: false };
    }
  }
}

export function isSavedStatusKind(statusKind) {
  return (
    statusKind === SAVE_STATUS_KINDS.SAVED ||
    statusKind === SAVE_STATUS_KINDS.DELETION_PENDING ||
    statusKind === SAVE_STATUS_KINDS.UNVERIFIED_SAVED
  );
}

/**
 * 判定保存狀態回應是否應視為「已保存」。
 *
 * 優先序如下（由高到低）：
 * 1. deletionPending === true：直接返回 true（最高優先，覆蓋其他欄位）。
 * 2. wasDeleted === true：直接返回 false。
 * 3. statusKind 為字串：交由 isSavedStatusKind(statusKind) 判定。
 * 4. 其餘情況回退為 Boolean(isSaved)。
 *
 * 注意：deletionPending 會覆蓋 statusKind（包含 deleted_remote）以避免呼叫端誤判。
 *
 * @param {object} status - 保存狀態回應
 * @returns {boolean}
 */
export function isSavedStatusResponse(status) {
  if (!status) {
    return false;
  }

  if (status.deletionPending === true) {
    return true;
  }

  if (status.wasDeleted === true) {
    return false;
  }

  if (typeof status.statusKind === 'string') {
    return isSavedStatusKind(status.statusKind);
  }

  return Boolean(status.isSaved);
}

export function createSaveStatusResponse({
  statusKind,
  stableUrl,
  savedData,
  success = true,
  error,
  extra = {},
} = {}) {
  const knownStatusKind = SAVE_STATUS_KIND_VALUES.has(statusKind);
  const normalizedStatusKind = knownStatusKind ? statusKind : SAVE_STATUS_KINDS.ERROR;
  const normalizedSuccess = knownStatusKind ? success : false;
  const normalizedError = knownStatusKind ? error : error || 'unknown_status_kind';

  if (!knownStatusKind) {
    globalThis.Logger?.warn?.('unknown status kind', {
      operation: 'createSaveStatusResponse',
      reason: 'unknown_status_kind',
      statusKind,
    });
  }

  const { canSave, canSyncHighlights } = resolveCapabilities(normalizedStatusKind);
  const isSaved = isSavedStatusKind(normalizedStatusKind);
  const sanitizedExtra = Object.fromEntries(
    Object.entries(extra).filter(([key]) => !RESERVED_RESPONSE_FIELDS.has(key))
  );

  return {
    success: normalizedSuccess,
    statusKind: normalizedStatusKind,
    isSaved,
    canSave,
    canSyncHighlights,
    stableUrl,
    wasDeleted: normalizedStatusKind === SAVE_STATUS_KINDS.DELETED_REMOTE,
    deletionPending: normalizedStatusKind === SAVE_STATUS_KINDS.DELETION_PENDING,
    ...(savedData?.notionPageId ? { notionPageId: savedData.notionPageId } : {}),
    ...(savedData?.notionUrl ? { notionUrl: savedData.notionUrl } : {}),
    ...(savedData && 'title' in savedData ? { title: savedData.title } : {}),
    ...(normalizedError ? { error: normalizedError } : {}),
    ...sanitizedExtra,
  };
}
