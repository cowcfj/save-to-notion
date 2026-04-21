/**
 * driveSyncHandlers.js — Background Drive Sync Handler
 *
 * 負責處理來自 options page 的手動同步指令：
 * - DRIVE_SYNC_MANUAL_UPLOAD：建立 snapshot 並上傳到 Drive
 * - DRIVE_SYNC_MANUAL_DOWNLOAD：從 Drive 下載並套用 snapshot
 *
 * 設計原則：
 * - upload 前 MUST NOT 修改本地 storage
 * - 收到 REMOTE_SNAPSHOT_NEWER（409 conflict）時，回傳 errorCode='REMOTE_SNAPSHOT_NEWER'，
 *   不自動重試 force=true
 * - 套用 download snapshot 後，廣播 DRIVE_SYNC_STATUS_UPDATED 給其他 UI
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-a-manual-sync-plan.md §6 Step 4/5
 */

/* global chrome */

import { RUNTIME_ACTIONS } from '../../config/runtimeActions.js';
import {
  uploadDriveSnapshot,
  downloadDriveSnapshot,
  getDriveSyncMetadata,
  updateDriveSyncRunMetadata,
} from '../../auth/driveClient.js';
import {
  buildUnifiedPageStateFromLocalStorage,
  buildDriveSnapshot,
  applyDriveSnapshotToLocalStorage,
} from '../../sync/driveSnapshot.js';
import Logger from '../../utils/Logger.js';

// =============================================================================
// 廣播工具
// =============================================================================

/**
 * 廣播 Drive Sync 狀態更新給其他 UI 頁面
 *
 * @param {string} action
 * @param {object} [extra]
 */
async function broadcastDriveSyncUpdate(action, extra = {}) {
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
    // 其他 UI 頁面可能未開啟，忽略錯誤
  });
}

// =============================================================================
// Handler：手動上傳
// =============================================================================

/**
 * 處理 DRIVE_SYNC_MANUAL_UPLOAD
 *
 * @param {object} [request]
 * @param {boolean} [request.force=false] - 是否強制覆蓋（需使用者二次確認）
 * @returns {Promise<{ success: boolean; errorCode?: string; error?: string; remoteUpdatedAt?: string | null; updatedAt?: string | null }>}
 */
async function handleManualUpload(request) {
  const force = Boolean(request?.force);

  try {
    const metadata = await getDriveSyncMetadata();

    Logger.info('[DriveSyncHandler] Manual upload requested', { force });

    const { pages, urlAliases } = await buildUnifiedPageStateFromLocalStorage();

    const snapshot = await buildDriveSnapshot(pages, urlAliases, {
      installationId: metadata.installationId,
      profileId: metadata.profileId,
    });

    Logger.info('[DriveSyncHandler] Snapshot built', {
      pageCount: snapshot.metadata?.item_counts?.saved_states ?? 0,
      force,
    });

    const result = await uploadDriveSnapshot(snapshot, force);

    if (!result.success) {
      await updateDriveSyncRunMetadata({
        type: 'upload',
        success: false,
        errorCode: result.errorCode,
        remoteUpdatedAt: result.remoteUpdatedAt,
      });

      Logger.warn('[DriveSyncHandler] Upload failed', { errorCode: result.errorCode });

      if (result.errorCode === 'REMOTE_SNAPSHOT_NEWER') {
        const remoteUpdatedAt = result.remoteUpdatedAt;
        if (remoteUpdatedAt && !Number.isNaN(Date.parse(remoteUpdatedAt))) {
          await broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT, {
            conflictType: 'REMOTE_SNAPSHOT_NEWER',
            remoteUpdatedAt,
          });
        } else {
          Logger.warn('[DriveSyncHandler] REMOTE_SNAPSHOT_NEWER without valid remoteUpdatedAt', {
            remoteUpdatedAt: result.remoteUpdatedAt,
          });
        }
      }
      await broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

      return {
        success: false,
        errorCode: result.errorCode,
        error: result.message,
        remoteUpdatedAt: result.remoteUpdatedAt ?? null,
      };
    }

    await updateDriveSyncRunMetadata({
      type: 'upload',
      success: true,
      remoteUpdatedAt: result.updatedAt,
    });

    Logger.success('[DriveSyncHandler] Upload succeeded', { updatedAt: result.updatedAt });
    await broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

    return { success: true, updatedAt: result.updatedAt };
  } catch (error) {
    await updateDriveSyncRunMetadata({
      type: 'upload',
      success: false,
      errorCode: 'UPLOAD_FAILED',
    });
    Logger.error('[DriveSyncHandler] Upload exception', {
      action: 'drive_upload',
      result: 'failure',
      reason: error instanceof Error ? error.message : String(error),
      type: 'upload',
      errorCode: 'UPLOAD_FAILED',
    });
    await broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

    return {
      success: false,
      errorCode: 'UPLOAD_FAILED',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Handler：手動下載
// =============================================================================

/**
 * 處理 DRIVE_SYNC_MANUAL_DOWNLOAD
 *
 * @returns {Promise<{ success: boolean; writtenKeys?: number; error?: string }>}
 */
async function handleManualDownload() {
  try {
    Logger.info('[DriveSyncHandler] Manual download requested');

    const remoteSnapshot = await downloadDriveSnapshot();
    const { writtenKeys, removedKeys } = await applyDriveSnapshotToLocalStorage(remoteSnapshot);

    await updateDriveSyncRunMetadata({
      type: 'download',
      success: true,
      remoteUpdatedAt: remoteSnapshot.metadata?.updated_at ?? null,
    });

    Logger.success('[DriveSyncHandler] Download & apply succeeded', {
      writtenCount: writtenKeys.length,
      removedCount: removedKeys.length,
    });
    await broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

    return { success: true, writtenKeys: writtenKeys.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      error?.code === 'NO_REMOTE_SNAPSHOT' ? 'NO_REMOTE_SNAPSHOT' : 'DOWNLOAD_FAILED';

    await updateDriveSyncRunMetadata({
      type: 'download',
      success: false,
      errorCode,
    });

    if (errorCode === 'NO_REMOTE_SNAPSHOT') {
      Logger.warn('[DriveSyncHandler] No remote snapshot found', { type: 'download' });
    } else {
      Logger.error('[DriveSyncHandler] Download exception', {
        action: 'drive_download',
        result: 'failure',
        reason: errorMessage,
        type: 'download',
        errorCode: 'DOWNLOAD_FAILED',
      });
    }
    await broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

    return { success: false, errorCode, error: errorMessage };
  }
}

// =============================================================================
// Handler 工廠
// =============================================================================

/**
 * 建立 Drive Sync handlers map
 *
 * @returns {Record<string, Function>}
 */
export function createDriveSyncHandlers() {
  return {
    [RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]: handleManualUpload,
    [RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]: handleManualDownload,
  };
}
