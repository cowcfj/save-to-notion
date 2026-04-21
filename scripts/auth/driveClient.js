/**
 * Drive Auth & Sync Helper
 *
 * 封裝所有 Google Drive Sync Phase A 所需的功能：
 * 1. Drive OAuth flow 啟動（redirect to backend /drive/start）
 * 2. Drive connection metadata 的 chrome.storage.local 讀寫
 * 3. Drive API 呼叫（connection / snapshot status / upload / download / disconnect）
 *
 * ⚠️ 設計原則（不可違反）：
 * - 本模組 MUST NOT 修改任何 Notion OAuth / account session keys。
 * - 所有 storage key 皆以 driveSync 前綴命名，與其他 keys 完整隔離。
 * - upload 前不修改本地 storage；download 套用由 driveSnapshot.js 負責。
 * - REMOTE_SNAPSHOT_NEWER 衝突時 MUST NOT 自動 force=true。
 *
 * Storage keys（與 .agents/.shared/knowledge/storage_schema.json 一致）：
 *   driveSyncConnectionEmail          — 連線帳號 email（PII，勿寫 log）
 *   driveSyncConnectedAt              — 授權完成時間（ISO 8601）
 *   driveSyncLastKnownRemoteUpdatedAt — 後端 snapshot updatedAt
 *   driveSyncLastSuccessfulUploadAt   — 上次上傳成功時間
 *   driveSyncLastSuccessfulDownloadAt — 上次下載成功時間
 *   driveSyncLastErrorCode            — 上次失敗錯誤代碼
 *   driveSyncLastErrorAt              — 上次失敗時間
 *   driveSyncLastRunAt                — 上次執行時間
 *   driveSyncLastRunType              — 上次執行類型
 *   driveSyncNeedsManualReview        — 是否有待人工處理的衝突
 *   driveSyncInstallationId           — extension 安裝唯一 ID
 *   driveSyncProfileId                — 後端 Drive profile ID
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-a-manual-sync-plan.md
 * @see .agents/.shared/knowledge/storage_schema.json §driveSync
 */

/* global chrome */

import { BUILD_ENV } from '../config/env.js';
import { ACCOUNT_API } from '../config/api.js';
import { buildAccountAuthHeaders } from './accountSession.js';

// =============================================================================
// Storage key 常量
// =============================================================================

export const DRIVE_SYNC_STORAGE_KEYS = /** @type {const} */ ({
  CONNECTION_EMAIL: 'driveSyncConnectionEmail',
  CONNECTED_AT: 'driveSyncConnectedAt',
  LAST_KNOWN_REMOTE_UPDATED_AT: 'driveSyncLastKnownRemoteUpdatedAt',
  LAST_SUCCESSFUL_UPLOAD_AT: 'driveSyncLastSuccessfulUploadAt',
  LAST_SUCCESSFUL_DOWNLOAD_AT: 'driveSyncLastSuccessfulDownloadAt',
  LAST_ERROR_CODE: 'driveSyncLastErrorCode',
  LAST_ERROR_AT: 'driveSyncLastErrorAt',
  LAST_RUN_AT: 'driveSyncLastRunAt',
  LAST_RUN_TYPE: 'driveSyncLastRunType',
  NEEDS_MANUAL_REVIEW: 'driveSyncNeedsManualReview',
  INSTALLATION_ID: 'driveSyncInstallationId',
  PROFILE_ID: 'driveSyncProfileId',
  // Phase B
  FREQUENCY: 'driveSyncFrequency',
  DIRTY: 'driveSyncDirty',
  LAST_SNAPSHOT_HASH: 'driveSyncLastSnapshotHash',
  NEXT_ELIGIBLE_AT: 'driveSyncNextEligibleAt',
});

/** Phase A + B 所有 driveSync keys */
const ALL_DRIVE_SYNC_KEYS = Object.values(DRIVE_SYNC_STORAGE_KEYS);

// =============================================================================
// 型別定義
// =============================================================================

/**
 * @typedef {object} DriveConnection
 * @property {string} email - 連線帳號 email（PII）
 * @property {string | null} connectedAt - ISO 8601 timestamp；伺服器未提供時為 null
 */

/**
 * @typedef {object} DriveConnectionStatus
 * @property {boolean} connected - 是否已連線
 * @property {string | null} email - 連線帳號 email，未連線時為 null
 * @property {string | null} connectedAt - 授權時間，未連線時為 null
 */

/**
 * @typedef {object} DriveSnapshotStatus
 * @property {boolean} exists - 遠端是否有 snapshot
 * @property {string | null} updatedAt - 遠端 snapshot 最後更新時間（ISO 8601）
 * @property {number | null} size - snapshot 大小（bytes，若後端提供）
 */

/**
 * @typedef {object} DriveSyncMetadata
 * @property {string | null} connectionEmail - 連線帳號 email
 * @property {string | null} connectedAt - 授權完成時間
 * @property {string | null} lastKnownRemoteUpdatedAt - 後端 snapshot updatedAt
 * @property {string | null} lastSuccessfulUploadAt - 上次上傳成功時間
 * @property {string | null} lastSuccessfulDownloadAt - 上次下載成功時間
 * @property {string | null} lastErrorCode - 上次失敗錯誤代碼
 * @property {string | null} lastErrorAt - 上次失敗時間
 * @property {string | null} lastRunAt - 上次執行時間
 * @property {string | null} lastRunType - 上次執行類型
 * @property {boolean} needsManualReview - 是否有待人工處理的衝突
 * @property {string | null} installationId - extension 安裝唯一 ID
 * @property {string | null} profileId - 後端 Drive profile ID
 * @property {'off' | 'daily' | 'weekly' | 'monthly'} frequency - 自動同步頻率（Phase B）
 * @property {boolean} dirty - 本地資料是否已變更尚未同步（Phase B）
 * @property {string | null} lastSnapshotHash - 上次成功上傳的 snapshot 內容哈希（Phase B）
 * @property {string | null} nextEligibleAt - 下次允許自動上傳的最早時間 ISO 8601（Phase B）
 */

// =============================================================================
// Drive OAuth Flow
// =============================================================================

/**
 * 啟動 Google Drive OAuth 授權流程。
 * 先以 Bearer token 呼叫受保護的 /v1/account/drive/start-url，
 * 再以後端回傳的 authorizationUrl 開新分頁。
 *
 * ⚠️ 此函數 MUST 在 options.js 的 click handler 中呼叫（非 background）。
 * connect 完成後，options 頁會在重新獲焦或收到 runtime 訊息時重新同步 Drive connection state。
 *
 * @returns {Promise<void>}
 */
export async function startDriveOAuthFlow() {
  const headers = await buildAccountAuthHeaders();
  const url = `${BUILD_ENV.OAUTH_SERVER_URL}${ACCOUNT_API.DRIVE_START_URL}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers },
  });

  if (!res.ok) {
    throw new Error(`GET /account/drive/start-url failed: ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  const authorizationUrl =
    typeof json.authorizationUrl === 'string' ? json.authorizationUrl.trim() : '';

  if (!authorizationUrl) {
    throw new Error('GET /account/drive/start-url failed: authorizationUrl missing');
  }

  await chrome.tabs.create({ url: authorizationUrl });
}

// =============================================================================
// Drive Storage Metadata 讀寫
// =============================================================================

/**
 * 讀取所有 Drive Sync metadata。
 *
 * @returns {Promise<DriveSyncMetadata>}
 */
export async function getDriveSyncMetadata() {
  const data = await chrome.storage.local.get(ALL_DRIVE_SYNC_KEYS);
  return {
    connectionEmail: data[DRIVE_SYNC_STORAGE_KEYS.CONNECTION_EMAIL] ?? null,
    connectedAt: data[DRIVE_SYNC_STORAGE_KEYS.CONNECTED_AT] ?? null,
    lastKnownRemoteUpdatedAt: data[DRIVE_SYNC_STORAGE_KEYS.LAST_KNOWN_REMOTE_UPDATED_AT] ?? null,
    lastSuccessfulUploadAt: data[DRIVE_SYNC_STORAGE_KEYS.LAST_SUCCESSFUL_UPLOAD_AT] ?? null,
    lastSuccessfulDownloadAt: data[DRIVE_SYNC_STORAGE_KEYS.LAST_SUCCESSFUL_DOWNLOAD_AT] ?? null,
    lastErrorCode: data[DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_CODE] ?? null,
    lastErrorAt: data[DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_AT] ?? null,
    lastRunAt: data[DRIVE_SYNC_STORAGE_KEYS.LAST_RUN_AT] ?? null,
    lastRunType: data[DRIVE_SYNC_STORAGE_KEYS.LAST_RUN_TYPE] ?? null,
    needsManualReview: data[DRIVE_SYNC_STORAGE_KEYS.NEEDS_MANUAL_REVIEW] ?? false,
    installationId: data[DRIVE_SYNC_STORAGE_KEYS.INSTALLATION_ID] ?? null,
    profileId: data[DRIVE_SYNC_STORAGE_KEYS.PROFILE_ID] ?? null,
    // Phase B
    frequency: data[DRIVE_SYNC_STORAGE_KEYS.FREQUENCY] ?? 'off',
    dirty: data[DRIVE_SYNC_STORAGE_KEYS.DIRTY] ?? false,
    lastSnapshotHash: data[DRIVE_SYNC_STORAGE_KEYS.LAST_SNAPSHOT_HASH] ?? null,
    nextEligibleAt: data[DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT] ?? null,
  };
}

/**
 * 寫入 Drive 連線成功的 metadata。
 * 由 drive-auth.html callback bridge 呼叫。
 *
 * @param {DriveConnection} connection
 * @param {{ resetConflicts?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function setDriveConnection(connection, options = {}) {
  const patch = {
    [DRIVE_SYNC_STORAGE_KEYS.CONNECTION_EMAIL]: connection.email,
    [DRIVE_SYNC_STORAGE_KEYS.CONNECTED_AT]: connection.connectedAt,
  };

  if (options.resetConflicts !== false) {
    patch[DRIVE_SYNC_STORAGE_KEYS.NEEDS_MANUAL_REVIEW] = false;
  }

  await chrome.storage.local.set(patch);
}

/**
 * 清除所有 Drive Sync metadata。
 * disconnect 時呼叫；不影響 account / Notion OAuth keys。
 *
 * @returns {Promise<void>}
 */
export async function clearDriveSyncMetadata() {
  await chrome.storage.local.remove(ALL_DRIVE_SYNC_KEYS);
}

/**
 * 更新 Drive Sync 執行結果 metadata（成功 / 失敗均呼叫）。
 *
 * @param {{ type: 'upload' | 'download' | 'status_check'; success: boolean; remoteUpdatedAt?: string | null; errorCode?: string | null }} result
 * @returns {Promise<void>}
 */
export async function updateDriveSyncRunMetadata(result) {
  const now = new Date().toISOString();
  const patch = {
    [DRIVE_SYNC_STORAGE_KEYS.LAST_RUN_AT]: now,
    [DRIVE_SYNC_STORAGE_KEYS.LAST_RUN_TYPE]: result.type,
  };

  if (result.success) {
    patch[DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_CODE] = null;
    patch[DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_AT] = null;
    patch[DRIVE_SYNC_STORAGE_KEYS.NEEDS_MANUAL_REVIEW] = false;
    if (result.type === 'upload') {
      patch[DRIVE_SYNC_STORAGE_KEYS.LAST_SUCCESSFUL_UPLOAD_AT] = now;
    } else if (result.type === 'download') {
      patch[DRIVE_SYNC_STORAGE_KEYS.LAST_SUCCESSFUL_DOWNLOAD_AT] = now;
    }
    if (result.remoteUpdatedAt !== undefined) {
      patch[DRIVE_SYNC_STORAGE_KEYS.LAST_KNOWN_REMOTE_UPDATED_AT] = result.remoteUpdatedAt;
    }
  } else {
    patch[DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_CODE] = result.errorCode ?? 'UNKNOWN';
    patch[DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_AT] = now;
    if (result.errorCode === 'REMOTE_SNAPSHOT_NEWER') {
      patch[DRIVE_SYNC_STORAGE_KEYS.NEEDS_MANUAL_REVIEW] = true;
    }
    if (result.remoteUpdatedAt !== undefined) {
      patch[DRIVE_SYNC_STORAGE_KEYS.LAST_KNOWN_REMOTE_UPDATED_AT] = result.remoteUpdatedAt;
    }
  }

  await chrome.storage.local.set(patch);
}

/**
 * 清除衝突待審標記。
 * 使用者主動決策（強制覆蓋或放棄）後呼叫。
 *
 * @returns {Promise<void>}
 */
export async function clearDriveSyncConflict() {
  await chrome.storage.local.set({
    [DRIVE_SYNC_STORAGE_KEYS.NEEDS_MANUAL_REVIEW]: false,
    [DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_CODE]: null,
    [DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_AT]: null,
  });
}

/**
 * 單獨更新「後端已知 snapshot updatedAt」，不修改 conflict / error / run 欄位。
 * 用於 reconnect 後的 UI 同步，避免誤清 needsManualReview。
 *
 * @param {string | null} updatedAt
 * @returns {Promise<void>}
 */
export async function setLastKnownRemoteUpdatedAt(updatedAt) {
  await chrome.storage.local.set({
    [DRIVE_SYNC_STORAGE_KEYS.LAST_KNOWN_REMOTE_UPDATED_AT]: updatedAt,
  });
}

// =============================================================================
// Drive API 呼叫
// =============================================================================

/**
 * 查詢 Drive 連線狀態。
 * 若 session token 無效，headers 會是空物件，後端應回傳 401。
 *
 * @returns {Promise<DriveConnectionStatus>}
 * @throws {Error} 網路錯誤或非 2xx / 404 回應
 */
export async function fetchDriveConnectionStatus() {
  const headers = await buildAccountAuthHeaders();
  const url = `${BUILD_ENV.OAUTH_SERVER_URL}${ACCOUNT_API.DRIVE_CONNECTION}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  if (res.status === 404) {
    // 尚未連線
    return { connected: false, email: null, connectedAt: null };
  }

  if (!res.ok) {
    throw new Error(`GET /drive/connection failed: ${res.status}`);
  }

  const json = await res.json();
  return {
    connected: true,
    email: json.providerAccountEmail ?? json.email ?? null,
    connectedAt: json.connectedAt ?? null,
  };
}

/**
 * 查詢遠端 snapshot metadata（不下載內容）。
 *
 * @returns {Promise<DriveSnapshotStatus>}
 * @throws {Error} 網路錯誤或非 2xx / 404 回應
 */
export async function fetchDriveSnapshotStatus() {
  const headers = await buildAccountAuthHeaders();
  const url = `${BUILD_ENV.OAUTH_SERVER_URL}${ACCOUNT_API.DRIVE_SNAPSHOT_STATUS}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  if (res.status === 404) {
    // 尚未有 snapshot
    return { exists: false, updatedAt: null, size: null };
  }

  if (!res.ok) {
    throw new Error(`GET /drive/snapshot/status failed: ${res.status}`);
  }

  const json = await res.json();
  return {
    exists:
      json.has_snapshot === true || Boolean(json.remote_updated_at) || Boolean(json.updatedAt),
    updatedAt: json.remote_updated_at ?? json.updatedAt ?? null,
    size: json.size ?? null,
  };
}

/**
 * 上傳 snapshot 到 Drive。
 *
 * @param {object} snapshotPayload - buildDriveSnapshot() 的輸出
 * @param {boolean} [force=false] - 強制覆蓋（需使用者二次確認後才傳 true）
 * @returns {Promise<{ success: true; updatedAt: string | null } | { success: false; errorCode: string; message: string; remoteUpdatedAt: string | null }>}
 */
export async function uploadDriveSnapshot(snapshotPayload, force = false) {
  const headers = await buildAccountAuthHeaders();
  const url = `${BUILD_ENV.OAUTH_SERVER_URL}${ACCOUNT_API.DRIVE_SNAPSHOT}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snapshot: snapshotPayload,
      force,
    }),
  });

  if (res.status === 409) {
    const json = await res.json().catch(() => ({}));
    return {
      success: false,
      errorCode: json.code ?? 'REMOTE_SNAPSHOT_NEWER',
      message: json.message ?? 'Remote snapshot is newer',
      remoteUpdatedAt: json.remote_updated_at ?? json.updatedAt ?? null,
    };
  }

  if (!res.ok) {
    throw new Error(`PUT /drive/snapshot failed: ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  return {
    success: true,
    updatedAt: json.metadata?.updated_at ?? json.updatedAt ?? null,
  };
}

/**
 * 下載遠端完整 snapshot。
 *
 * @returns {Promise<object>} 遠端 snapshot 原始內容（由 driveSnapshot.js 解析套用）
 * @throws {Error} 網路錯誤、404（無 snapshot）、或非 2xx 回應
 */
export async function downloadDriveSnapshot() {
  const headers = await buildAccountAuthHeaders();
  const url = `${BUILD_ENV.OAUTH_SERVER_URL}${ACCOUNT_API.DRIVE_SNAPSHOT}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  if (res.status === 404) {
    const err = new Error('NO_REMOTE_SNAPSHOT');
    err.code = 'NO_REMOTE_SNAPSHOT';
    throw err;
  }

  if (!res.ok) {
    throw new Error(`GET /drive/snapshot failed: ${res.status}`);
  }

  return res.json();
}

/**
 * 中斷 Drive 連線。
 * 後端刪除連線授權；本地 metadata 由呼叫方另行清除。
 *
 * @returns {Promise<void>}
 * @throws {Error} 網路錯誤或非 2xx 回應
 */
export async function disconnectDrive() {
  const headers = await buildAccountAuthHeaders();
  const url = `${BUILD_ENV.OAUTH_SERVER_URL}${ACCOUNT_API.DRIVE_CONNECTION}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`DELETE /drive/connection failed: ${res.status}`);
  }
}

// =============================================================================
// Phase B: 自動同步 metadata helpers
// =============================================================================

/** 合法的同步頻率值 */
export const DRIVE_SYNC_FREQUENCIES = /** @type {const} */ (['off', 'daily', 'weekly', 'monthly']);

/**
 * 更新自動同步頻率設定，並同步更新 nextEligibleAt。
 *
 * @param {'off' | 'daily' | 'weekly' | 'monthly'} frequency
 * @returns {Promise<void>}
 */
export async function setDriveFrequency(frequency) {
  const nextEligibleAt = frequency === 'off' ? null : computeNextEligibleAt(frequency);
  await chrome.storage.local.set({
    [DRIVE_SYNC_STORAGE_KEYS.FREQUENCY]: frequency,
    [DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]: nextEligibleAt,
  });
}

/**
 * 標記本地資料已變更（dirty = true）。
 * 在所有 canonical write path 後呼叫。
 *
 * @returns {Promise<void>}
 */
export async function markDriveDirty() {
  await chrome.storage.local.set({
    [DRIVE_SYNC_STORAGE_KEYS.DIRTY]: true,
  });
}

/**
 * 清除 dirty 標記，並更新 snapshot hash 與下次允許時間。
 *
 * @param {{ snapshotHash?: string | null; frequency: 'off' | 'daily' | 'weekly' | 'monthly' }} options
 * @returns {Promise<void>}
 */
export async function clearDriveDirty(options) {
  const nextEligibleAt =
    options.frequency === 'off' ? null : computeNextEligibleAt(options.frequency);
  await chrome.storage.local.set({
    [DRIVE_SYNC_STORAGE_KEYS.DIRTY]: false,
    [DRIVE_SYNC_STORAGE_KEYS.LAST_SNAPSHOT_HASH]: options.snapshotHash ?? null,
    [DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]: nextEligibleAt,
  });
}

/**
 * 計算下次允許自動上傳的最早時間（基於頻率）。
 *
 * @param {'daily' | 'weekly' | 'monthly'} frequency
 * @returns {string} ISO 8601 timestamp
 */
export function computeNextEligibleAt(frequency) {
  const now = new Date();
  if (frequency === 'daily') {
    now.setDate(now.getDate() + 1);
  } else if (frequency === 'weekly') {
    now.setDate(now.getDate() + 7);
  } else {
    // monthly
    now.setMonth(now.getMonth() + 1);
  }
  return now.toISOString();
}

// =============================================================================
// 內部常量匯出（供測試使用）
// =============================================================================

export { ALL_DRIVE_SYNC_KEYS };
