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

import { RUNTIME_ACTIONS } from '../../config/runtimeActions.js';
import {
  getDriveSyncMetadata,
  updateDriveSyncRunMetadata,
  clearDriveDirty,
  uploadDriveSnapshot,
} from '../../auth/driveClient.js';
import {
  buildUnifiedPageStateFromLocalStorage,
  buildDriveSnapshot,
} from '../../sync/driveSnapshot.js';
import Logger from '../../utils/Logger.js';

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
 * 4. driveSyncDirty === true
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

  if (!metadata.dirty) {
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
 * @param {string} action
 * @param {object} [extra]
 * @returns {Promise<void>}
 */
async function broadcastAutoSyncUpdate(action, extra = {}) {
  await chrome.runtime.sendMessage({ action, ...extra }).catch(() => {
    // 其他 UI 頁面可能未開啟，忽略
  });
}

// =============================================================================
// Auto Upload Executor
// =============================================================================

/**
 * 執行一次自動上傳。
 * 此函數由 background alarm handler 觸發，不需要 UI 回應值。
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

  const { shouldRun, reason } = shouldRunAutoSync(metadata, context);

  if (!shouldRun) {
    Logger.info('[DriveAutoSync] 跳過自動同步', { reason });
    return;
  }

  Logger.info('[DriveAutoSync] 開始自動上傳', { frequency: metadata.frequency });

  try {
    const { pages, urlAliases } = await buildUnifiedPageStateFromLocalStorage();
    const snapshot = await buildDriveSnapshot(pages, urlAliases, {
      installationId: metadata.installationId,
      profileId: metadata.profileId,
    });

    const result = await uploadDriveSnapshot(snapshot, false);

    if (!result.success) {
      await updateDriveSyncRunMetadata({
        type: 'upload',
        success: false,
        errorCode: result.errorCode,
        remoteUpdatedAt: result.remoteUpdatedAt,
      });

      Logger.warn('[DriveAutoSync] 自動上傳失敗', { errorCode: result.errorCode });

      if (result.errorCode === 'REMOTE_SNAPSHOT_NEWER') {
        await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT, {
          conflictType: 'REMOTE_SNAPSHOT_NEWER',
          remoteUpdatedAt: result.remoteUpdatedAt,
        });
      }

      await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);
      return;
    }

    // 成功：清除 dirty，更新 metadata
    await updateDriveSyncRunMetadata({
      type: 'upload',
      success: true,
      remoteUpdatedAt: result.updatedAt,
    });

    // 計算 snapshot hash（簡單用 JSON 長度 + updated_at 作為 lightweight fingerprint）
    const snapshotHash = `${JSON.stringify(snapshot).length}:${result.updatedAt ?? ''}`;

    await clearDriveDirty({
      snapshotHash,
      frequency: metadata.frequency,
    });

    Logger.success('[DriveAutoSync] 自動上傳成功', {
      updatedAt: result.updatedAt,
      frequency: metadata.frequency,
    });

    await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);
  } catch (error) {
    await updateDriveSyncRunMetadata({
      type: 'upload',
      success: false,
      errorCode: 'UPLOAD_FAILED',
    });

    Logger.error('[DriveAutoSync] 自動上傳例外', {
      action: 'auto_sync_upload',
      result: 'failure',
      reason: error instanceof Error ? error.message : String(error),
      errorCode: 'UPLOAD_FAILED',
    });

    await broadcastAutoSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);
  }
}
