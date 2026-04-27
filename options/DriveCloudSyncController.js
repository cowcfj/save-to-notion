/**
 * DriveCloudSyncController.js
 *
 * Cloud Sync Card UI Controller（Step 2 + Step 4 + Step 5 + Step 6）
 *
 * 負責：
 * - 根據 account 登入狀態 + Drive 連線狀態渲染 Cloud Sync card
 * - 處理 connect / upload / download / disconnect 按鈕事件
 * - 處理 REMOTE_SNAPSHOT_NEWER 衝突流程（二次確認後才允許 force=true）
 *
 * 設計原則（MUST NOT 違反）：
 * - upload 前會先查 snapshot status，收到 409 進 conflict 流程，不自動 force
 * - download 套用前顯示摘要讓使用者確認
 * - 所有 Drive 操作透過 background service worker 執行（DRIVE_SYNC_MANUAL_* actions）
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-a-manual-sync-plan.md §6
 */

/* global chrome */

import { RUNTIME_ACTIONS } from '../scripts/config/shared/runtimeActions.js';
import { UI_MESSAGES } from '../scripts/config/shared/messages.js';
import { DRIVE_SYNC_ERROR_CODES } from '../scripts/config/extension/driveSyncErrorCodes.js';
import {
  clearDriveSyncMetadata,
  disconnectDrive,
  fetchDriveConnectionStatus,
  fetchDriveSnapshotStatus,
  getDriveSyncMetadata,
  setLastKnownRemoteUpdatedAt,
  setDriveConnection,
  startDriveOAuthFlow,
} from '../scripts/auth/driveClient.js';
import Logger from '../scripts/utils/Logger.js';
import { ErrorHandler } from '../scripts/utils/ErrorHandler.js';
import { sanitizeApiError } from '../scripts/utils/securityUtils.js';

// =============================================================================
// DOM ID 常量
// =============================================================================

const DOM = {
  CARD: '#cloud-sync-card',
  STATE_LOGGED_OUT: '#drive-state-logged-out',
  STATE_DISCONNECTED: '#drive-state-disconnected',
  STATE_CONNECTED: '#drive-state-connected',
  STATE_CONFLICT: '#drive-state-conflict',
  ERROR_BANNER: '#drive-error-banner',
  ERROR_CODE: '#drive-error-code',
  ERROR_TIME: '#drive-error-time',
  LOADING_OVERLAY: '#drive-loading-overlay',
  LOADING_TEXT: '#drive-loading-text',
  SYNC_STATUS: '#drive-sync-status',
  CONNECTED_EMAIL: '#drive-connected-email',
  LAST_UPLOAD_TEXT: '#drive-last-upload-text',
  CONFLICT_REMOTE_TIME: '#drive-conflict-remote-time',
  // Phase B
  FREQUENCY_SELECT: '#drive-frequency-select',
  AUTO_SYNC_STATUS: '#drive-auto-sync-status',
  AUTO_SYNC_STATUS_TEXT: '#drive-auto-sync-status-text',
  // 帳號隔離
  SOURCE_WARNING: '#drive-source-warning',
  // Buttons
  BTN_LOGIN_PROMPT: '#drive-login-prompt-button',
  BTN_CONNECT: '#drive-connect-button',
  BTN_UPLOAD: '#drive-upload-button',
  BTN_DOWNLOAD: '#drive-download-button',
  BTN_DISCONNECT: '#drive-disconnect-button',
  BTN_CONFLICT_DOWNLOAD: '#drive-conflict-download-button',
  BTN_CONFLICT_FORCE_UPLOAD: '#drive-conflict-force-upload-button',
};

// =============================================================================
// 工具函數
// =============================================================================

/**
 * 格式化 ISO 8601 timestamp 為簡短顯示文字
 *
 * @param {string | null} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
  if (!isoString) {
    return '—';
  }
  try {
    const parsed = Date.parse(isoString);
    if (!Number.isFinite(parsed)) {
      return isoString;
    }
    const formatted = new Date(parsed).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const timezoneLabel = getLocalTimezoneLabel();
    return `${formatted}（${timezoneLabel}）`;
  } catch {
    return isoString;
  }
}

function getLocalTimezoneLabel() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone) {
    return timezone;
  }
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');
  return `GMT${sign}${hours}:${minutes}`;
}

/**
 * 取得 DOM element，不存在時靜默跳過
 *
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function el(selector) {
  return document.querySelector(selector);
}

/**
 * 將 error 轉為可安全記錄的字串代碼。
 *
 * @param {unknown} error
 * @param {string} context
 * @returns {string | object}
 */
function getSafeError(error, context) {
  return sanitizeApiError(error, context);
}

/**
 * 將 error 轉為使用者可見的友善訊息。
 *
 * @param {unknown} error
 * @param {string} context
 * @returns {string}
 */
function getUserFriendlyErrorMessage(error, context) {
  return ErrorHandler.formatUserMessage(getSafeError(error, context));
}

/**
 * 將 server 端 Drive connection 狀態同步到本地 metadata。
 *
 * @param {{ transientAuthError?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function syncRemoteDriveConnection(options = {}) {
  if (options.transientAuthError) {
    return;
  }
  const status = await fetchDriveConnectionStatus();

  if (status.connected && status.email) {
    const previousMetadata = await getDriveSyncMetadata();
    const connectedAt =
      status.connectedAt ??
      (previousMetadata.connectionEmail === status.email ? previousMetadata.connectedAt : null) ??
      new Date().toISOString();

    await setDriveConnection(
      {
        email: status.email,
        connectedAt,
      },
      { resetConflicts: false }
    );
    await syncRemoteSnapshotStatus();
    return;
  }

  await clearDriveSyncMetadata();
}

/**
 * 查詢遠端 snapshot 存在狀態，並把 updatedAt 寫入 lastKnownRemoteUpdatedAt。
 * 同步更新 module-level lastSnapshotStatus cache。
 * 任何失敗都必須 silent，不得阻擋 UI 渲染。
 *
 * @param {{
 *   warnMessage?: string;
 *   errorContext?: string;
 * }} [options]
 * @returns {Promise<import('../scripts/auth/driveClient.js').DriveSnapshotStatus | null>}
 */
async function syncRemoteSnapshotStatus(options = {}) {
  const warnMessage = options.warnMessage ?? '[CloudSync] Snapshot status sync skipped';
  const errorContext = options.errorContext ?? 'drive_snapshot_status_sync';
  try {
    const snapshot = await fetchDriveSnapshotStatus();
    await setLastKnownRemoteUpdatedAt(snapshot.exists ? snapshot.updatedAt : null);
    lastSnapshotStatus = {
      sourceInstallationId: snapshot.sourceInstallationId ?? null,
      sourceProfileId: snapshot.sourceProfileId ?? null,
    };
    return snapshot;
  } catch (error) {
    Logger.warn(warnMessage, {
      error: getSafeError(error, errorContext),
    });
    lastSnapshotStatus = null;
    return null;
  }
}

/**
 * 嘗試同步 server 端 Drive connection；失敗時回退本地 metadata，
 * 避免整張卡片因 API 失敗而完全不渲染。
 *
 * @param {{ transientAuthError?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function syncRemoteDriveConnectionSafely(options = {}) {
  try {
    await syncRemoteDriveConnection(options);
  } catch (error) {
    Logger.error('[CloudSync] Drive connection sync failed', {
      action: 'syncRemoteDriveConnection',
      error: getSafeError(error, 'drive_connection_sync'),
    });
  }
}

let hasInstalledReturnSyncListeners = false;
let isReturnSyncInFlight = false;
let syncStatusTimeoutId = null;
/** @type {AbortController | null} */
let buttonListenersController = null;
/** @type {{ sourceInstallationId: string | null; sourceProfileId: string | null } | null} */
let lastSnapshotStatus = null;

function syncOnReturn() {
  if (isReturnSyncInFlight) {
    return;
  }

  isReturnSyncInFlight = true;
  return refreshCloudSyncCard({ syncRemote: true })
    .catch(() => {})
    .finally(() => {
      isReturnSyncInFlight = false;
    });
}

function installReturnSyncListeners() {
  if (hasInstalledReturnSyncListeners) {
    return;
  }

  globalThis.addEventListener('focus', syncOnReturn);
  globalThis.addEventListener('pageshow', event => {
    if (event.persisted === true) {
      syncOnReturn();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncOnReturn();
    }
  });

  hasInstalledReturnSyncListeners = true;
}

// =============================================================================
// Cloud Sync Card UI 渲染
// =============================================================================

/**
 * 根據 account 是否已登入決定 Cloud Sync card 是否顯示
 *
 * @param {boolean} isLoggedIn
 */
export function setCloudSyncCardVisibility(isLoggedIn) {
  const card = el(DOM.CARD);
  if (card) {
    card.style.display = isLoggedIn ? '' : 'none';
  }
}

function _setActionButtonsDisabled(disabled) {
  for (const selector of [
    DOM.BTN_LOGIN_PROMPT,
    DOM.BTN_UPLOAD,
    DOM.BTN_DOWNLOAD,
    DOM.BTN_DISCONNECT,
    DOM.BTN_CONNECT,
    DOM.BTN_CONFLICT_DOWNLOAD,
    DOM.BTN_CONFLICT_FORCE_UPLOAD,
  ]) {
    const btn = el(selector);
    if (btn) {
      btn.disabled = disabled;
    }
  }
}

/**
 * 顯示 loading overlay
 *
 * @param {string} message
 */
function showLoading(message) {
  setCloudSyncCardVisibility(true);
  const overlay = el(DOM.LOADING_OVERLAY);
  const text = el(DOM.LOADING_TEXT);
  if (overlay) {
    overlay.style.display = '';
  }
  if (text) {
    text.textContent = message;
  }
  _setActionButtonsDisabled(true);
}

/**
 * 隱藏 loading overlay
 */
function hideLoading() {
  const overlay = el(DOM.LOADING_OVERLAY);
  if (overlay) {
    overlay.style.display = 'none';
  }
  _setActionButtonsDisabled(false);
}

/**
 * 顯示 Drive 操作狀態訊息
 *
 * @param {string} message
 * @param {'success' | 'error' | ''} type
 */
function showSyncStatus(message, type = '') {
  const statusEl = el(DOM.SYNC_STATUS);
  if (!statusEl) {
    return;
  }

  if (syncStatusTimeoutId !== null) {
    clearTimeout(syncStatusTimeoutId);
    syncStatusTimeoutId = null;
  }

  statusEl.textContent = message;
  statusEl.className = type ? `status-message ${type}` : 'status-message';
  if (message && type !== 'error') {
    syncStatusTimeoutId = setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
      syncStatusTimeoutId = null;
    }, 4000);
  }
}

/**
 * 更新各狀態區塊的顯示（disconnected / connected / conflict）
 *
 * @param {'loading' | 'logged_out' | 'disconnected' | 'connected' | 'conflict'} state
 */
function _updateStatePanels(state) {
  const stateLoggedOut = el(DOM.STATE_LOGGED_OUT);
  const stateDisconnected = el(DOM.STATE_DISCONNECTED);
  const stateConnected = el(DOM.STATE_CONNECTED);
  const stateConflict = el(DOM.STATE_CONFLICT);

  if (stateLoggedOut) {
    stateLoggedOut.style.display = state === 'logged_out' ? '' : 'none';
  }
  if (stateDisconnected) {
    stateDisconnected.style.display = state === 'disconnected' ? '' : 'none';
  }
  if (stateConnected) {
    stateConnected.style.display = state === 'connected' ? '' : 'none';
  }
  if (stateConflict) {
    stateConflict.style.display = state === 'conflict' ? '' : 'none';
  }
}

/**
 * 更新已連線狀態的帳號資訊與上傳時間
 *
 * @param {{
 *   connectionEmail?: string | null;
 *   lastSuccessfulUploadAt?: string | null;
 *   lastKnownRemoteUpdatedAt?: string | number | Date | null | undefined;
 * }} metadata - `lastKnownRemoteUpdatedAt` 為最後一次已知遠端更新時間，當 `lastSuccessfulUploadAt` 缺失時用於 UI fallback
 */
function _updateConnectedInfo(metadata) {
  const emailEl = el(DOM.CONNECTED_EMAIL);
  if (emailEl) {
    emailEl.textContent = metadata.connectionEmail ?? '';
  }

  const lastUploadEl = el(DOM.LAST_UPLOAD_TEXT);
  if (!lastUploadEl) {
    return;
  }

  if (metadata.lastSuccessfulUploadAt) {
    lastUploadEl.textContent = `${UI_MESSAGES.CLOUD_SYNC.LAST_UPLOAD_PREFIX}${formatTimestamp(metadata.lastSuccessfulUploadAt)}`;
  } else if (metadata.lastKnownRemoteUpdatedAt) {
    lastUploadEl.textContent = `${UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX}${formatTimestamp(metadata.lastKnownRemoteUpdatedAt)}`;
  } else {
    lastUploadEl.textContent = UI_MESSAGES.CLOUD_SYNC.NEVER_UPLOADED;
  }
}

/**
 * 更新錯誤 banner
 *
 * @param {{ lastErrorCode?: string | null; lastErrorAt?: string | null }} metadata
 */
function _updateErrorBanner(metadata) {
  const hasError = Boolean(
    metadata?.lastErrorCode &&
    metadata.lastErrorCode !== DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER
  );
  const errorBanner = el(DOM.ERROR_BANNER);

  if (errorBanner) {
    errorBanner.style.display = hasError ? '' : 'none';
  }
  if (!hasError) {
    return;
  }

  const errorCodeEl = el(DOM.ERROR_CODE);
  const errorTimeEl = el(DOM.ERROR_TIME);
  if (errorCodeEl) {
    errorCodeEl.textContent = `${UI_MESSAGES.CLOUD_SYNC.SYNC_FAILED_PREFIX}${metadata.lastErrorCode}`;
  }
  if (errorTimeEl) {
    errorTimeEl.textContent = metadata.lastErrorAt
      ? `${UI_MESSAGES.CLOUD_SYNC.ERROR_TIME_PREFIX}${formatTimestamp(metadata.lastErrorAt)}`
      : '';
  }
}

/**
 * 更新自動同步狀態顯示
 *
 * @param {{
 *   frequency?: 'off' | 'daily' | 'weekly' | 'monthly';
 *   needsManualReview?: boolean;
 * }} metadata
 */
function _updateAutoSyncStatus(metadata) {
  const frequencySelect = el(DOM.FREQUENCY_SELECT);
  if (frequencySelect && metadata.frequency) {
    frequencySelect.value = metadata.frequency;
  }

  const statusDiv = el(DOM.AUTO_SYNC_STATUS);
  const statusText = el(DOM.AUTO_SYNC_STATUS_TEXT);

  if (!statusDiv || !statusText) {
    return;
  }

  if (metadata.frequency === 'off' || !metadata.frequency) {
    statusDiv.style.display = 'none';
    statusText.textContent = '';
    return;
  }

  if (metadata.needsManualReview) {
    statusDiv.style.display = '';
    statusText.textContent = UI_MESSAGES.CLOUD_SYNC.AUTO_SYNC_NEEDS_REVIEW;
  } else {
    statusDiv.style.display = 'none';
    statusText.textContent = '';
  }
}

/**
 * 判斷是否屬於跨安裝快照來源。
 *
 * @param {string | null | undefined} remoteId
 * @param {string | null | undefined} localId
 * @returns {boolean}
 */
function _isCrossInstall(remoteId, localId) {
  return (
    typeof remoteId === 'string' &&
    remoteId.length > 0 &&
    typeof localId === 'string' &&
    localId.length > 0 &&
    remoteId !== localId
  );
}

/**
 * 更新跨安裝來源警示 banner
 *
 * 僅在 remote sourceInstallationId 與 local installationId 同時存在且不同時顯示；
 * 其他情境一律隱藏。
 *
 * @param {{ sourceInstallationId?: string | null } | null} snapshotStatus
 * @param {string | null} localInstallationId
 */
function _updateSourceWarning(snapshotStatus, localInstallationId) {
  const warningEl = el(DOM.SOURCE_WARNING);
  if (!warningEl) {
    return;
  }

  const remoteId = snapshotStatus?.sourceInstallationId ?? null;
  const shouldShow = _isCrossInstall(remoteId, localInstallationId);

  if (shouldShow) {
    warningEl.textContent = UI_MESSAGES.CLOUD_SYNC.SOURCE_WARNING;
    warningEl.hidden = false;
  } else {
    warningEl.textContent = '';
    warningEl.hidden = true;
  }
}

/**
 * 根據 metadata 渲染 Cloud Sync card
 *
 * @param {{ connectionEmail?: string | null; lastSuccessfulUploadAt?: string | null; lastErrorCode?: string | null; lastErrorAt?: string | null; needsManualReview?: boolean; frequency?: string; installationId?: string | null }} metadata
 * @param {{ snapshotStatus?: { sourceInstallationId?: string | null } | null }} [options]
 */
export function renderCloudSyncCard(metadata, options = {}) {
  const transientAuthError = options.transientAuthError === true;
  const isConnected = !transientAuthError && Boolean(metadata?.connectionEmail);
  const needsReview = metadata?.needsManualReview ?? false;
  let panelState = 'disconnected';

  if (isConnected) {
    panelState = needsReview ? 'conflict' : 'connected';
  }

  _updateStatePanels(panelState);

  if (isConnected) {
    _updateConnectedInfo(metadata);
    _updateAutoSyncStatus(metadata);
    const snapshotStatus =
      options.snapshotStatus === undefined ? lastSnapshotStatus : options.snapshotStatus;
    _updateSourceWarning(snapshotStatus, metadata.installationId ?? null);
  } else {
    _updateSourceWarning(null, null);
  }

  _updateErrorBanner(metadata);

  if (transientAuthError) {
    showSyncStatus(UI_MESSAGES.CLOUD_SYNC.TRANSIENT_AUTH_ERROR, 'error');
    _setActionButtonsDisabled(true);
  }
}

function renderLoggedOutCloudSyncCard() {
  setCloudSyncCardVisibility(true);
  _updateStatePanels('logged_out');
  _updateSourceWarning(null, null);
  showSyncStatus('', '');
  hideLoading();

  const errorBanner = el(DOM.ERROR_BANNER);
  if (errorBanner) {
    errorBanner.style.display = 'none';
  }

  const errorCodeEl = el(DOM.ERROR_CODE);
  if (errorCodeEl) {
    errorCodeEl.textContent = '';
  }

  const errorTimeEl = el(DOM.ERROR_TIME);
  if (errorTimeEl) {
    errorTimeEl.textContent = '';
  }

  const loginPromptButton = el(DOM.BTN_LOGIN_PROMPT);
  if (loginPromptButton) {
    loginPromptButton.disabled = true;
  }
}

export function showCloudSyncLoadingState(message) {
  _updateStatePanels('loading');
  showLoading(message);
}

// =============================================================================
// Drive 操作 handlers
// =============================================================================

/**
 * Preflight 驗證：若遠端 snapshot 來自其他安裝，向使用者請求確認。
 *
 * @returns {Promise<boolean>} 若應繼續上傳回傳 true，如不應繼續回傳 false
 */
async function _checkCrossInstallAndConfirm() {
  try {
    const preflight = await syncRemoteSnapshotStatus({
      warnMessage: '[CloudSync] Upload preflight check failed, continuing upload',
      errorContext: 'drive_upload_preflight',
    });
    if (!preflight) {
      return true;
    }
    const metadata = await getDriveSyncMetadata();
    const localId = metadata.installationId ?? null;
    const remoteId = preflight.sourceInstallationId ?? null;
    const isCrossInstall = _isCrossInstall(remoteId, localId);
    if (isCrossInstall) {
      return globalThis.confirm(UI_MESSAGES.CLOUD_SYNC.CONFIRM_CROSS_INSTALL_UPLOAD);
    }
  } catch (preflightError) {
    // fail-open：preflight 失敗時只記錄 warn，不阻斷 upload
    Logger.warn('[CloudSync] Upload preflight check failed, continuing upload', {
      error: getSafeError(preflightError, 'drive_upload_preflight_metadata'),
    });
  }
  return true;
}

/**
 * 處理手動上傳
 *
 * 流程：
 * 1. force === true → 直接上傳（沿用既有 force confirm 流程）
 * 2. force === false → preflight 查詢 snapshot status；
 *    若偵測跨安裝則顯示二次確認，使用者取消則中止。
 *    preflight 失敗時記錄 warn 並繼續（fail-open）。
 *
 * @param {boolean} [force=false] - 強制覆蓋（conflict 後使用者確認時傳 true）
 */
async function handleUpload(force = false) {
  showLoading(
    force ? UI_MESSAGES.CLOUD_SYNC.LOADING_FORCE_UPLOAD : UI_MESSAGES.CLOUD_SYNC.LOADING_UPLOAD
  );

  // preflight 跨安裝檢查（僅在 force === false 時執行）
  if (force === false) {
    try {
      const shouldProceed = await _checkCrossInstallAndConfirm();
      if (shouldProceed === false) {
        hideLoading();
        return;
      }
    } catch (error) {
      hideLoading();
      throw error;
    }
  }

  let uploadSucceeded = false;
  let conflictDetected = false;
  try {
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
      force,
    });

    if (!response) {
      throw new Error(UI_MESSAGES.CLOUD_SYNC.BG_NO_RESPONSE);
    }

    if (response.success) {
      showSyncStatus(UI_MESSAGES.CLOUD_SYNC.UPLOAD_SUCCESS, 'success');
      uploadSucceeded = true;
    } else if (response.errorCode === DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER) {
      showSyncStatus('', '');
      conflictDetected = true;
    } else {
      throw new Error(
        response.error ?? response.errorCode ?? UI_MESSAGES.CLOUD_SYNC.UPLOAD_FAILED_GENERIC
      );
    }
  } catch (error) {
    Logger.error('[CloudSync] Upload failed', {
      error: getSafeError(error, 'drive_sync_upload'),
    });
    showSyncStatus(
      `${UI_MESSAGES.CLOUD_SYNC.UPLOAD_FAILED_PREFIX}${getUserFriendlyErrorMessage(error, 'drive_sync_upload')}`,
      'error'
    );
  } finally {
    hideLoading();
  }

  if (!uploadSucceeded && !conflictDetected) {
    return;
  }

  try {
    await refreshCloudSyncCard({ syncRemote: true });
  } catch (error) {
    Logger.error('[CloudSync] Upload UI refresh failed', {
      error: getSafeError(error, 'drive_sync_upload_ui_refresh'),
    });
  }
}

/**
 * 處理手動下載（含二次確認）
 */
async function handleDownload() {
  const confirmationMessage = await buildDownloadConfirmationMessage();
  const confirmed = globalThis.confirm(confirmationMessage);
  if (!confirmed) {
    return;
  }

  showLoading(UI_MESSAGES.CLOUD_SYNC.LOADING_DOWNLOAD);
  let downloadSucceeded = false;
  try {
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
    });

    if (!response) {
      throw new Error(UI_MESSAGES.CLOUD_SYNC.BG_NO_RESPONSE);
    }
    if (!response.success) {
      throw new Error(response.error ?? UI_MESSAGES.CLOUD_SYNC.DOWNLOAD_FAILED_GENERIC);
    }

    showSyncStatus(UI_MESSAGES.CLOUD_SYNC.DOWNLOAD_SUCCESS, 'success');
    downloadSucceeded = true;
  } catch (error) {
    Logger.error('[CloudSync] Download failed', {
      error: getSafeError(error, 'drive_sync_download'),
    });
    showSyncStatus(
      `${UI_MESSAGES.CLOUD_SYNC.DOWNLOAD_FAILED_PREFIX}${getUserFriendlyErrorMessage(error, 'drive_sync_download')}`,
      'error'
    );
  } finally {
    hideLoading();
  }

  if (!downloadSucceeded) {
    return;
  }

  try {
    await refreshCloudSyncCard({ syncRemote: true });
  } catch (error) {
    Logger.error('[CloudSync] Download UI refresh failed', {
      error: getSafeError(error, 'drive_sync_download_ui_refresh'),
    });
  }
}

async function buildDownloadConfirmationMessage() {
  const metadata = await getDriveSyncMetadata().catch(() => ({}));
  const status = await fetchDriveSnapshotStatus().catch(error => {
    Logger.warn('[CloudSync] Download preflight status failed, continuing with unknown summary', {
      error: getSafeError(error, 'drive_download_preflight'),
    });
    return null;
  });

  const remoteTime = status?.exists
    ? formatTimestamp(status.updatedAt)
    : UI_MESSAGES.CLOUD_SYNC.UNKNOWN_TIME;
  const sourceLabel = resolveSnapshotSourceLabel(
    status?.sourceInstallationId ?? null,
    metadata?.installationId ?? null
  );

  return UI_MESSAGES.CLOUD_SYNC.CONFIRM_DOWNLOAD_WITH_SUMMARY(remoteTime, sourceLabel);
}

function resolveSnapshotSourceLabel(remoteInstallationId, localInstallationId) {
  if (!remoteInstallationId) {
    return UI_MESSAGES.CLOUD_SYNC.SOURCE_UNKNOWN;
  }
  if (
    typeof localInstallationId === 'string' &&
    localInstallationId.length > 0 &&
    remoteInstallationId === localInstallationId
  ) {
    return UI_MESSAGES.CLOUD_SYNC.SOURCE_THIS_DEVICE;
  }
  return UI_MESSAGES.CLOUD_SYNC.SOURCE_OTHER_DEVICE;
}

/**
 * 處理 disconnect（含確認）
 */
async function handleDisconnect() {
  const confirmed = globalThis.confirm(UI_MESSAGES.CLOUD_SYNC.CONFIRM_DISCONNECT);
  if (!confirmed) {
    return;
  }

  showLoading(UI_MESSAGES.CLOUD_SYNC.LOADING_DISCONNECT);
  let disconnectSucceeded = false;
  try {
    await disconnectDrive();
    await clearDriveSyncMetadata();

    showSyncStatus(UI_MESSAGES.CLOUD_SYNC.DISCONNECT_SUCCESS, 'success');
    disconnectSucceeded = true;
  } catch (error) {
    Logger.error('[CloudSync] Disconnect failed', {
      error: getSafeError(error, 'drive_disconnect'),
    });
    showSyncStatus(UI_MESSAGES.CLOUD_SYNC.DISCONNECT_FAILED, 'error');
  } finally {
    hideLoading();
  }

  if (!disconnectSucceeded) {
    return;
  }

  try {
    const metadata = await getDriveSyncMetadata();
    renderCloudSyncCard(metadata);
  } catch (error) {
    Logger.warn('[CloudSync] Disconnect UI refresh failed', {
      error: getSafeError(error, 'drive_disconnect_ui_refresh'),
    });
  }
}

// =============================================================================
// 初始化（綁定事件 + 初次渲染）
// =============================================================================

/**
 * 綁定 Cloud Sync card 上所有按鈕的 click 監聽器。
 * 透過 AbortController 保證重複呼叫 initCloudSyncController 時不會疊加監聽器。
 */
function bindCloudSyncButtons() {
  if (buttonListenersController) {
    buttonListenersController.abort();
  }
  buttonListenersController = new AbortController();
  const { signal } = buttonListenersController;

  el(DOM.BTN_CONNECT)?.addEventListener(
    'click',
    () => {
      startDriveOAuthFlow().catch(error => {
        Logger.error('[CloudSync] Drive connect start failed', {
          error: getSafeError(error, 'drive_connect_start'),
        });
        showSyncStatus(
          `${UI_MESSAGES.CLOUD_SYNC.CONNECT_FAILED_PREFIX}${getUserFriendlyErrorMessage(error, 'drive_connect_start')}`,
          'error'
        );
      });
    },
    { signal }
  );

  el(DOM.BTN_UPLOAD)?.addEventListener(
    'click',
    () => {
      handleUpload(false).catch(() => {});
    },
    { signal }
  );

  el(DOM.BTN_DOWNLOAD)?.addEventListener(
    'click',
    () => {
      handleDownload().catch(() => {});
    },
    { signal }
  );

  el(DOM.BTN_DISCONNECT)?.addEventListener(
    'click',
    () => {
      handleDisconnect().catch(() => {});
    },
    { signal }
  );

  // 衝突 - 下載雲端版本
  el(DOM.BTN_CONFLICT_DOWNLOAD)?.addEventListener(
    'click',
    () => {
      handleDownload().catch(() => {});
    },
    { signal }
  );

  // 衝突 - 強制上傳
  el(DOM.BTN_CONFLICT_FORCE_UPLOAD)?.addEventListener(
    'click',
    () => {
      const confirmed = globalThis.confirm(UI_MESSAGES.CLOUD_SYNC.CONFIRM_FORCE_UPLOAD);
      if (confirmed) {
        handleUpload(true).catch(() => {});
      }
    },
    { signal }
  );

  // Phase B: 頻率 selector 變更
  el(DOM.FREQUENCY_SELECT)?.addEventListener(
    'change',
    event => {
      const frequency = event.target.value;
      handleFrequencyChange(frequency).catch(error => {
        Logger.warn('[CloudSync] Schedule change handler failed', {
          error: getSafeError(error, 'drive_sync_schedule_change'),
        });
      });
    },
    { signal }
  );
}

/**
 * 處理頻率 selector 變更：送出儲存請求、顯示狀態訊息，
 * 並在完成後重新渲染卡片以確保 UI 與真實儲存狀態一致。
 *
 * @param {string} frequency
 * @returns {Promise<void>}
 */
async function handleFrequencyChange(frequency) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED,
      frequency,
    });
    if (response?.success) {
      showSyncStatus(UI_MESSAGES.CLOUD_SYNC.FREQUENCY_SAVE_SUCCESS, 'success');
    } else {
      showSyncStatus(UI_MESSAGES.CLOUD_SYNC.FREQUENCY_SAVE_FAILED, 'error');
    }
  } catch {
    showSyncStatus(UI_MESSAGES.CLOUD_SYNC.FREQUENCY_SAVE_FAILED, 'error');
  } finally {
    try {
      await refreshCloudSyncCard();
    } catch (error) {
      Logger.warn('[CloudSync] Schedule refresh failed', {
        error: getSafeError(error, 'drive_sync_schedule_refresh'),
      });
    }
  }
}

/**
 * 初始化 Cloud Sync Controller
 *
 * @param {boolean} isLoggedIn - 是否已登入帳號
 * @param {{ transientAuthError?: boolean }} [options]
 */
export async function initCloudSyncController(isLoggedIn, options = {}) {
  const transientAuthError = options.transientAuthError === true;
  // 更新 card 顯示與否
  setCloudSyncCardVisibility(true);

  if (!isLoggedIn) {
    renderLoggedOutCloudSyncCard();
    return;
  }

  showLoading(UI_MESSAGES.CLOUD_SYNC.LOADING_STATUS_SYNC);

  try {
    await syncRemoteDriveConnectionSafely({ transientAuthError });
    installReturnSyncListeners();

    // 讀取 Drive metadata 並渲染
    const metadata = await getDriveSyncMetadata();
    renderCloudSyncCard(metadata, { transientAuthError });

    // 綁定按鈕事件（冪等，重複呼叫會先 abort 先前的 listener）
    bindCloudSyncButtons();
  } finally {
    hideLoading();
    if (transientAuthError) {
      _setActionButtonsDisabled(true);
    }
  }
}

/**
 * 刷新 Cloud Sync card（訊息更新後呼叫）
 *
 * @param {{ syncRemote?: boolean }} [options]
 */
export async function refreshCloudSyncCard(options = {}) {
  const transientAuthError = options.transientAuthError === true;
  if (options.syncRemote) {
    await syncRemoteDriveConnectionSafely({ transientAuthError });
  }
  const metadata = await getDriveSyncMetadata();
  renderCloudSyncCard(metadata, { transientAuthError });
}
