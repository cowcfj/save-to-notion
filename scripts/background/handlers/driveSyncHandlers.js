/**
 * driveSyncHandlers.js — Background Drive Sync Handler
 *
 * 負責處理來自 options page 的手動同步指令：
 * - DRIVE_SYNC_MANUAL_UPLOAD：建立 snapshot 並上傳到 Drive
 * - DRIVE_SYNC_MANUAL_DOWNLOAD：從 Drive 下載並套用 snapshot
 *
 * 設計原則（MUST NOT 違反）：
 * - upload 前 MUST NOT 修改本地 storage
 * - 收到 REMOTE_SNAPSHOT_NEWER（409 conflict）時，回傳 errorCode='REMOTE_SNAPSHOT_NEWER'，
 *   不自動重試 force=true
 * - 套用 download snapshot 後，廣播 DRIVE_SYNC_STATUS_UPDATED 給其他 UI
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-a-manual-sync-plan.md §6 Step 4/5
 */

/* global chrome, Logger */

import { RUNTIME_ACTIONS } from '../../config/runtimeActions.js';
import {
  uploadDriveSnapshot,
  downloadDriveSnapshot,
  clearDriveSyncMetadata,
  updateDriveSyncRunMetadata,
} from '../../auth/driveAuth.js';
import {
  buildUnifiedPageStateFromLocalStorage,
  buildDriveSnapshot,
  applyDriveSnapshotToLocalStorage,
} from '../../sync/driveSnapshot.js';

// =============================================================================
// 廣播工具
// =============================================================================

/**
 * 廣播 Drive Sync 狀態更新給其他 UI 頁面
 *
 * @param {string} action
 * @param {object} [extra]
 */
function broadcastDriveSyncUpdate(action, extra = {}) {
  chrome.runtime.sendMessage({ action, ...extra }).catch(() => {
    // 其他 UI 頁面可能未開啟，忽略錯誤
  });
}

// =============================================================================
// Handler：手動上傳
// =============================================================================

/**
 * 處理 DRIVE_SYNC_MANUAL_UPLOAD
 *
 * @param {object} request
 * @param {boolean} [request.force=false] - 是否強制覆蓋（需使用者二次確認）
 * @returns {Promise<{ success: boolean; errorCode?: string; error?: string }>}
 */
async function handleManualUpload(request) {
  const force = Boolean(request.force);

  Logger.info('[DriveSyncHandler] Manual upload requested', { force });

  // Step 1：從本地 storage 合併 unified page state
  const { pages, urlAliases } = await buildUnifiedPageStateFromLocalStorage();

  // Step 2：序列化為 snapshot
  const snapshot = buildDriveSnapshot(pages, urlAliases);

  Logger.info('[DriveSyncHandler] Snapshot built', {
    pageCount: Object.keys(snapshot.pages).length,
    force,
  });

  // Step 3：上傳到 Drive
  const result = await uploadDriveSnapshot(snapshot, force);

  if (!result.success) {
    // 衝突或其他錯誤
    await updateDriveSyncRunMetadata({
      type: 'upload',
      success: false,
      errorCode: result.errorCode,
    });

    Logger.warn('[DriveSyncHandler] Upload failed', { errorCode: result.errorCode });
    broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

    return {
      success: false,
      errorCode: result.errorCode,
      error: result.message,
    };
  }

  // 上傳成功 → 更新 metadata
  await updateDriveSyncRunMetadata({
    type: 'upload',
    success: true,
    remoteUpdatedAt: result.updatedAt,
  });

  Logger.success('[DriveSyncHandler] Upload succeeded', { updatedAt: result.updatedAt });
  broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

  return { success: true, updatedAt: result.updatedAt };
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
  Logger.info('[DriveSyncHandler] Manual download requested');

  // Step 1：下載遠端 snapshot
  let remoteSnapshot;
  try {
    remoteSnapshot = await downloadDriveSnapshot();
  } catch (error) {
    const errorCode =
      error.message === 'NO_REMOTE_SNAPSHOT' ? 'NO_REMOTE_SNAPSHOT' : 'DOWNLOAD_FAILED';

    await updateDriveSyncRunMetadata({
      type: 'download',
      success: false,
      errorCode,
    });

    Logger.warn('[DriveSyncHandler] Download failed', { errorCode });
    broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

    return { success: false, error: error.message };
  }

  // Step 2：套用 snapshot 到本地 storage，含 Compatibility Mirror
  const { writtenKeys, removedKeys } = await applyDriveSnapshotToLocalStorage(remoteSnapshot);

  // Step 3：更新 metadata
  await updateDriveSyncRunMetadata({
    type: 'download',
    success: true,
    remoteUpdatedAt: remoteSnapshot.snapshotCreatedAt ?? null,
  });

  Logger.success('[DriveSyncHandler] Download & apply succeeded', {
    writtenCount: writtenKeys.length,
    removedCount: removedKeys.length,
  });
  broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED);

  return { success: true, writtenKeys: writtenKeys.length };
}

// =============================================================================
// Handler：中斷連線
// =============================================================================

/**
 * 處理 Drive 中斷連線（清除本地 driveSync* metadata）
 *
 * 注意：實際撤銷後端授權應由 disconnectDrive() 呼叫，
 * 此 handler 僅負責 metadata 清除（由 DriveCloudSyncController 直接呼叫後端）。
 *
 * @returns {Promise<{ success: boolean }>}
 */
async function handleDriveDisconnect() {
  Logger.info('[DriveSyncHandler] Drive disconnect: clearing local metadata');
  await clearDriveSyncMetadata();
  broadcastDriveSyncUpdate(RUNTIME_ACTIONS.DRIVE_CONNECTION_UPDATED, {
    email: null,
    connectedAt: null,
  });
  return { success: true };
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
    [RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT]: handleDriveDisconnect,
  };
}
