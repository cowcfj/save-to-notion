/**
 * Save status contract helpers
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
  const { canSave, canSyncHighlights } = resolveCapabilities(statusKind);
  const isSaved = isSavedStatusKind(statusKind);

  return {
    success,
    statusKind,
    isSaved,
    canSave,
    canSyncHighlights,
    stableUrl,
    wasDeleted: statusKind === SAVE_STATUS_KINDS.DELETED_REMOTE,
    deletionPending: statusKind === SAVE_STATUS_KINDS.DELETION_PENDING,
    ...(savedData?.notionPageId ? { notionPageId: savedData.notionPageId } : {}),
    ...(savedData?.notionUrl ? { notionUrl: savedData.notionUrl } : {}),
    ...(savedData?.title ? { title: savedData.title } : {}),
    ...(error ? { error } : {}),
    ...extra,
  };
}
