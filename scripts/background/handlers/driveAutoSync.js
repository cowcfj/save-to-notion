/**
 * driveAutoSync.js — Auto Upload Orchestrator
 *
 * 負責：
 * - 判斷當前是否滿足自動上傳的所有前置條件
 * - 執行自動 upload（複用 Phase A 的 upload 邏輯）
 * - 更新 dirty 狀態與 nextEligibleAt
 *
 * 設計原則（MUST NOT 違反）：
 * - 自動同步只做 upload，MUST NOT 背景 download
 * - 遇到 REMOTE_SNAPSHOT_NEWER 時設 needsManualReview，不 force upload
 * - 失敗後不做立即 retry
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-b-auto-sync-plan.md §6 Step 4/5
 */

/* global chrome */

import { RUNTIME_ACTIONS } from '../../config/shared/runtimeActions.js';
import { DRIVE_SYNC_ERROR_CODES } from '../../config/extension/driveSyncErrorCodes.js';
import {
  getDriveSyncMetadata,
  updateDriveSyncRunMetadata,
  clearDriveDirty,
  uploadDriveSnapshot,
} from '../../auth/driveClient.js';
import { getAccountAccessToken } from '../../auth/accountSession.js';
import {
  buildUnifiedPageStateFromLocalStorage,
  buildDriveSnapshot,
} from '../../sync/driveSnapshot.js';
import Logger from '../../utils/Logger.js';

/**
 * 產生 Drive snapshot lightweight hash，供 dirty metadata 比對。
 *
 * @param {object} snapshot
 * @param {string | null | undefined} updatedAt
 * @returns {string}
 */
export function computeDriveSnapshotHash(snapshot, updatedAt) {
  return `${JSON.stringify(snapshot).length}:${updatedAt ?? ''}`;
}

// =============================================================================
// 條件判斷
// =============================================================================

/**
 * 判斷目前是否應執行自動同步上傳。
 *
 * 所有條件須同時成立：
 * 1. account 已登入（有 connectionEmail）
 * 2. Drive 已連接（有 connectionEmail）
 * 3. frequency 非 'off'
 * 4. 本地有未同步變更：dirtyRevision > lastUploadedRevision
 * 5. needsManualReview !== true
 * 6. nextEligibleAt 已到期（或為 null）
 *
 * @param {import('../../auth/driveClient.js').DriveSyncMetadata} metadata
 * @param {{ isAccountLoggedIn?: boolean }} [context]
 * @returns {{ shouldRun: boolean; reason: string }}
 */
export function shouldRunAutoSync(metadata, context = {}) {
  if (context.isAccountLoggedIn === false) {
    return { shouldRun: false, reason: 'account_not_logged_in' };
  }

  if (!metadata.connectionEmail) {
    return { shouldRun: false, reason: 'drive_not_connected' };
  }

  if (metadata.frequency === 'off') {
    return { shouldRun: false, reason: 'frequency_off' };
  }

  if (metadata.dirtyRevision <= metadata.lastUploadedRevision) {
    return { shouldRun: false, reason: 'not_dirty' };
  }

  if (metadata.needsManualReview) {
    return { shouldRun: false, reason: 'needs_manual_review' };
  }

  if (metadata.nextEligibleAt && Date.parse(metadata.nextEligibleAt) > Date.now()) {
    return { shouldRun: false, reason: 'not_yet_eligible' };
  }

  return { shouldRun: true, reason: 'all_conditions_met' };
}

// =============================================================================
// 廣播工具（局部，僅用於 auto sync）
// =============================================================================

/**
 * 廣播 Drive Sync 狀態更新給其他 UI 頁面。
 *
 * DRIVE_SYNC_STATUS_UPDATED 依 message_bus.json 契約必須帶 lastKnownRemoteUpdatedAt
 * 與 lastSuccessfulUploadAt，因此在廣播前會重讀 metadata 組裝 payload。
 *
 * @param {string} action
 * @param {object} [extra]
 * @returns {Promise<void>}
 */
async function broadcastAutoSyncUpdate(action, extra = {}) {
  const payload = { action, ...extra };

  if (action === RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED) {
    try {
      const metadata = await getDriveSyncMetadata();
      payload.lastKnownRemoteUpdatedAt = metadata.lastKnownRemoteUpdatedAt ?? null;
      payload.lastSuccessfulUploadAt = metadata.lastSuccessfulUploadAt ?? null;
    } catch {
      payload.lastKnownRemoteUpdatedAt = null;
      payload.lastSuccessfulUploadAt = null;
    }
  }

  await chrome.runtime.sendMessage(payload).catch(() => {
    // 其他 UI 頁面可能未開啟，忽略
  });
}

// =============================================================================
// Helpers（僅給 runAutoUpload 用，拆出以控制 Cognitive Complexity）
// =============================================================================

/**
 * 解析當前是否登入。caller 若未傳入則主動讀 accountSession。
 *
 * @param {{ isAccountLoggedIn?: boolean }} context
 * @returns {Promise<{ isAccountLoggedIn: boolean }>}
 */
async function resolveLoginState(context) {
  if (context.isAccountLoggedIn !== undefined) {
    return { ...context };
  }
  try {
    const token = await getAccountAccessToken();
    return { ...context, isAccountLoggedIn: token !== null };
  } catch (error) {
    Logger.warn('[DriveAutoSync] 登入狀態檢查失敗，保守地視為未登入', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return { ...context, isAccountLoggedIn: false };
  }
}

/**
 * 處理 upload 失敗：更新 metadata 並視情況廣播 REMOTE_SNAPSHOT_NEWER 衝突。
 *
 * DRIVE_SYNC_CONFLICT 契約要求 remoteUpdatedAt 為有效 ISO 8601；
 * 無法解析時僅 log warning 並略過衝突廣播，UI 會在 STATUS_UPDATED 時
 * 透過 needsManualReview 取得狀態。
 *
 * @param {{ errorCode?: string | null; remoteUpdatedAt?: string | null }} result
 * @returns {Promise<void>}
 */
async function handleUploadFailure(result) {
  await updateDriveSyncRunMetadata({
    type: 'upload',
    success: false,
    errorCode: result.errorCode,
    remoteUpdatedAt: result.remoteUpdatedAt,
  });

  Logger.warn('[DriveAutoSync] 自動上傳失敗', { errorCode: result.errorCode });

  if (result.errorCode === DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER) {
    const rawRemoteUpdatedAt = result.remoteUpdatedAt;
    const parsed = rawRemoteUpdatedAt ? Date.parse(rawRemoteUpdatedAt) : Number.NaN;
    if (Number.isFinite(parsed)) {
      await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT, {
        conflictType: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        remoteUpdatedAt: new Date(parsed).toISOString(),
      });
    } else {
      Logger.warn('[DriveAutoSync] REMOTE_SNAPSHOT_NEWER without valid remoteUpdatedAt', {
        remoteUpdatedAt: rawRemoteUpdatedAt,
      });
    }
  }

  await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);
}

/**
 * 處理 upload 成功：更新 metadata、記錄已上傳 revision、廣播最新狀態。
 *
 * 傳入 expectedDirtyRevision（上傳開始時捕獲的 dirtyRevision），
 * clearDriveDirty 會將其寫入 LAST_UPLOADED_REVISION。若上傳期間有新的
 * markDriveDirty() 觸發，dirtyRevision 已大於 expectedDirtyRevision，
 * 下次 shouldRunAutoSync 比較時會判斷為 dirty → 重新觸發上傳。
 *
 * @param {{ updatedAt?: string | null }} result
 * @param {object} snapshot
 * @param {{ frequency: 'off' | 'daily' | 'weekly' | 'monthly' }} metadata
 * @param {number} expectedDirtyRevision
 * @returns {Promise<void>}
 */
async function handleUploadSuccess(result, snapshot, metadata, expectedDirtyRevision) {
  await updateDriveSyncRunMetadata({
    type: 'upload',
    success: true,
    remoteUpdatedAt: result.updatedAt,
  });

  const snapshotHash = computeDriveSnapshotHash(snapshot, result.updatedAt);

  await clearDriveDirty({
    snapshotHash,
    frequency: metadata.frequency,
    expectedDirtyRevision,
  });

  Logger.success('[DriveAutoSync] 自動上傳成功', {
    updatedAt: result.updatedAt,
    frequency: metadata.frequency,
  });

  await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);
}

// =============================================================================
// Auto Upload Executor
// =============================================================================

/**
 * 執行一次自動上傳。
 * 此函數由 background alarm handler 觸發，不需要 UI 回應值。
 *
 * 若 caller 未明確傳入 isAccountLoggedIn，會呼叫 getAccountAccessToken() 自行判斷；
 * 未登入則交由 shouldRunAutoSync 以 `account_not_logged_in` 理由略過。
 *
 * @param {{ isAccountLoggedIn?: boolean }} [context]
 * @returns {Promise<void>}
 */
export async function runAutoUpload(context = {}) {
  let metadata;
  try {
    metadata = await getDriveSyncMetadata();
  } catch (error) {
    Logger.error('[DriveAutoSync] 讀取 metadata 失敗，跳過本次自動同步', {
      action: 'auto_sync',
      reason: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const resolvedContext = await resolveLoginState(context);
  const { shouldRun, reason } = shouldRunAutoSync(metadata, resolvedContext);

  if (!shouldRun) {
    Logger.info('[DriveAutoSync] 跳過自動同步', { reason });
    return;
  }

  Logger.info('[DriveAutoSync] 開始自動上傳', { frequency: metadata.frequency });

  // 在讀取 metadata 時同步捕獲當前 dirty revision。
  // upload 完成後，clearDriveDirty 會將此值寫入 LAST_UPLOADED_REVISION。
  // 若期間有新 markDriveDirty()（dirtyRevision 已變大），下次 shouldRunAutoSync
  // 會偵測到 dirtyRevision > lastUploadedRevision → 重新觸發上傳。
  const expectedDirtyRevision = metadata.dirtyRevision;

  try {
    const { pages, urlAliases } = await buildUnifiedPageStateFromLocalStorage();
    const snapshot = await buildDriveSnapshot(pages, urlAliases, {
      installationId: metadata.installationId,
      profileId: metadata.profileId,
    });

    const result = await uploadDriveSnapshot(snapshot, false);

    if (!result.success) {
      await handleUploadFailure(result);
      return;
    }

    await handleUploadSuccess(result, snapshot, metadata, expectedDirtyRevision);
  } catch (error) {
    await updateDriveSyncRunMetadata({
      type: 'upload',
      success: false,
      errorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
    });

    Logger.error('[DriveAutoSync] 自動上傳例外', {
      action: 'auto_sync_upload',
      result: 'failure',
      reason: error instanceof Error ? error.message : String(error),
      errorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
    });

    await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);
  }
}
