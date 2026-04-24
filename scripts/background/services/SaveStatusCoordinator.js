import { HANDLER_CONSTANTS } from '../../config/shared/core.js';
import { SAVE_STATUS_KINDS, createSaveStatusResponse } from '../../config/saveStatus.js';

function defaultLogger() {
  return {
    debug() {},
    log() {},
    warn() {},
    error() {},
  };
}

async function resolveExistsWithRetry(savedData, deps) {
  const { notionService, wait } = deps;
  const exists = await notionService.checkPageExists(savedData.notionPageId, {
    apiKey: deps.activeToken.token,
  });

  if (exists !== null) {
    return exists;
  }

  await wait(HANDLER_CONSTANTS.CHECK_DELAY);

  return notionService.checkPageExists(savedData.notionPageId, {
    apiKey: deps.activeToken.token,
  });
}

function shouldUseCache({ forceRefresh, migratedFromOldKey, isCacheValid }) {
  return !forceRefresh && !migratedFromOldKey && isCacheValid;
}

async function touchLastVerifiedIfNeeded(context, deps) {
  await deps.storageService.setSavedPageData(context.normUrl, {
    ...context.savedData,
    lastVerifiedAt: deps.now,
  });
}

async function handleDeletedRemoteStatus(context, deps, savedData) {
  const cleanupUrl = await deps.resolveCleanupUrl();
  const clearResult = await deps.storageService.clearNotionStateWithRetry(context.resolvedUrl, {
    source: 'SaveStatusCoordinator.resolve',
    expectedPageId: savedData.notionPageId,
  });

  if (clearResult.skipped) {
    const latestSavedData = await deps.storageService.getSavedPageData(cleanupUrl);
    if (!latestSavedData?.notionPageId) {
      return createSaveStatusResponse({
        statusKind: SAVE_STATUS_KINDS.UNSAVED,
        stableUrl: cleanupUrl,
      });
    }

    return createSaveStatusResponse({
      statusKind: SAVE_STATUS_KINDS.SAVED,
      stableUrl: cleanupUrl,
      savedData: latestSavedData,
    });
  }

  if (!clearResult.cleared) {
    deps.tabService.confirmRemotePageMissing?.(savedData.notionPageId);
    deps.logger.error('清理本地 notion 狀態失敗，維持 deleted_remote 對外狀態', {
      action: 'checkPageStatus',
      operation: 'clearNotionStateWithRetry',
      attempts: clearResult.attempts,
      error: clearResult.error,
    });
  }

  return createSaveStatusResponse({
    statusKind: SAVE_STATUS_KINDS.DELETED_REMOTE,
    stableUrl: cleanupUrl,
  });
}

export async function resolveSaveStatus(context, rawDeps) {
  const deps = {
    getActiveToken: async () => ({ token: null }),
    wait: delay => new Promise(resolve => setTimeout(resolve, delay)),
    resolveCleanupUrl: async () => context.resolvedUrl,
    now: Date.now(),
    logger: defaultLogger(),
    ...rawDeps,
  };

  const { savedData, normUrl } = context;

  if (!savedData?.notionPageId) {
    return createSaveStatusResponse({
      statusKind: SAVE_STATUS_KINDS.UNSAVED,
      stableUrl: normUrl,
    });
  }

  const ttl = HANDLER_CONSTANTS.PAGE_STATUS_CACHE_TTL;
  const lastVerifiedAt = savedData.lastVerifiedAt || 0;
  const isCacheValid = deps.now - lastVerifiedAt < ttl;

  if (
    shouldUseCache({
      forceRefresh: context.forceRefresh,
      migratedFromOldKey: context.migratedFromOldKey,
      isCacheValid,
    })
  ) {
    return createSaveStatusResponse({
      statusKind: SAVE_STATUS_KINDS.SAVED,
      stableUrl: normUrl,
      savedData,
    });
  }

  deps.activeToken = await deps.getActiveToken();
  if (!deps.activeToken?.token) {
    return createSaveStatusResponse({
      statusKind: SAVE_STATUS_KINDS.UNVERIFIED_SAVED,
      stableUrl: normUrl,
      savedData,
    });
  }

  const exists = await resolveExistsWithRetry(savedData, deps);

  if (exists === null) {
    return createSaveStatusResponse({
      statusKind: SAVE_STATUS_KINDS.UNVERIFIED_SAVED,
      stableUrl: normUrl,
      savedData,
    });
  }

  const deletionCheck = deps.tabService.consumeDeletionConfirmation(savedData.notionPageId, exists);

  if (exists === false && deletionCheck.shouldDelete) {
    return handleDeletedRemoteStatus(context, deps, savedData);
  }

  if (exists === false && deletionCheck.deletionPending) {
    return createSaveStatusResponse({
      statusKind: SAVE_STATUS_KINDS.DELETION_PENDING,
      stableUrl: normUrl,
      savedData,
    });
  }

  if (exists === true) {
    await touchLastVerifiedIfNeeded(context, deps);
  }

  return createSaveStatusResponse({
    statusKind: SAVE_STATUS_KINDS.SAVED,
    stableUrl: normUrl,
    savedData,
  });
}
