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

import { RUNTIME_ACTIONS } from '../scripts/config/runtimeActions.js';
import { getDriveSyncMetadata, startDriveOAuthFlow } from '../scripts/auth/driveClient.js';
import Logger from '../scripts/utils/Logger.js';

// =============================================================================
// DOM ID 常量
// =============================================================================

const DOM = {
  CARD: '#cloud-sync-card',
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
  // Buttons
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
    return new Date(isoString).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
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

/**
 * 顯示 loading overlay
 *
 * @param {string} message
 */
function showLoading(message) {
  const overlay = el(DOM.LOADING_OVERLAY);
  const text = el(DOM.LOADING_TEXT);
  if (overlay) {
    overlay.style.display = '';
  }
  if (text) {
    text.textContent = message;
  }
  // 禁用所有操作按鈕防止重複點擊
  for (const selector of [
    DOM.BTN_UPLOAD,
    DOM.BTN_DOWNLOAD,
    DOM.BTN_DISCONNECT,
    DOM.BTN_CONNECT,
    DOM.BTN_CONFLICT_DOWNLOAD,
    DOM.BTN_CONFLICT_FORCE_UPLOAD,
  ]) {
    const btn = el(selector);
    if (btn) {
      btn.disabled = true;
    }
  }
}

/**
 * 隱藏 loading overlay
 */
function hideLoading() {
  const overlay = el(DOM.LOADING_OVERLAY);
  if (overlay) {
    overlay.style.display = 'none';
  }
  // 恢復按鈕
  for (const selector of [
    DOM.BTN_UPLOAD,
    DOM.BTN_DOWNLOAD,
    DOM.BTN_DISCONNECT,
    DOM.BTN_CONNECT,
    DOM.BTN_CONFLICT_DOWNLOAD,
    DOM.BTN_CONFLICT_FORCE_UPLOAD,
  ]) {
    const btn = el(selector);
    if (btn) {
      btn.disabled = false;
    }
  }
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
  statusEl.textContent = message;
  statusEl.className = type ? `status-message ${type}` : 'status-message';
  if (message && type !== 'error') {
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 4000);
  }
}

/**
 * 更新各狀態區塊的顯示（disconnected / connected / conflict）
 *
 * @param {boolean} isConnected
 * @param {boolean} needsReview
 */
function _updateStatePanels(isConnected, needsReview) {
  const stateDisconnected = el(DOM.STATE_DISCONNECTED);
  const stateConnected = el(DOM.STATE_CONNECTED);
  const stateConflict = el(DOM.STATE_CONFLICT);

  if (stateDisconnected) {
    stateDisconnected.style.display = isConnected ? 'none' : '';
  }
  if (stateConnected) {
    stateConnected.style.display = isConnected && !needsReview ? '' : 'none';
  }
  if (stateConflict) {
    stateConflict.style.display = isConnected && needsReview ? '' : 'none';
  }
}

/**
 * 更新已連線狀態的帳號資訊與上傳時間
 *
 * @param {{ connectionEmail?: string | null; lastSuccessfulUploadAt?: string | null }} metadata
 */
function _updateConnectedInfo(metadata) {
  const emailEl = el(DOM.CONNECTED_EMAIL);
  if (emailEl) {
    emailEl.textContent = metadata.connectionEmail ?? '';
  }

  const lastUploadEl = el(DOM.LAST_UPLOAD_TEXT);
  if (lastUploadEl) {
    lastUploadEl.textContent = metadata.lastSuccessfulUploadAt
      ? `上次上傳：${formatTimestamp(metadata.lastSuccessfulUploadAt)}`
      : '尚未上傳';
  }
}

/**
 * 更新錯誤 banner
 *
 * @param {{ lastErrorCode?: string | null; lastErrorAt?: string | null }} metadata
 */
function _updateErrorBanner(metadata) {
  const hasError = Boolean(
    metadata?.lastErrorCode && metadata.lastErrorCode !== 'REMOTE_SNAPSHOT_NEWER'
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
    errorCodeEl.textContent = `同步失敗：${metadata.lastErrorCode}`;
  }
  if (errorTimeEl) {
    errorTimeEl.textContent = metadata.lastErrorAt
      ? `發生時間：${formatTimestamp(metadata.lastErrorAt)}`
      : '';
  }
}

/**
 * 根據 metadata 渲染 Cloud Sync card
 *
 * @param {{ connectionEmail?: string | null; lastSuccessfulUploadAt?: string | null; lastErrorCode?: string | null; lastErrorAt?: string | null; needsManualReview?: boolean }} metadata
 */
export function renderCloudSyncCard(metadata) {
  const isConnected = Boolean(metadata?.connectionEmail);
  const needsReview = metadata?.needsManualReview ?? false;

  _updateStatePanels(isConnected, needsReview);

  if (isConnected) {
    _updateConnectedInfo(metadata);
  }

  _updateErrorBanner(metadata);
}

// =============================================================================
// Drive 操作 handlers
// =============================================================================

/**
 * 處理手動上傳
 *
 * @param {boolean} [force=false] - 強制覆蓋（conflict 後使用者確認時傳 true）
 */
async function handleUpload(force = false) {
  showLoading(force ? '強制上傳中...' : '上傳至雲端中...');
  try {
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
      force,
    });

    if (!response) {
      throw new Error('背景無回應');
    }

    if (!response.success) {
      if (response.errorCode === 'REMOTE_SNAPSHOT_NEWER') {
        // 進入衝突流程（UI 由 renderCloudSyncCard 處理）
        showSyncStatus('', '');
        return;
      }
      throw new Error(response.error ?? `上傳失敗：${response.errorCode}`);
    }

    showSyncStatus('上傳成功！', 'success');
    // 重新讀取 metadata 刷新 UI
    const metadata = await getDriveSyncMetadata();
    renderCloudSyncCard(metadata);
  } catch (error) {
    Logger.error('[CloudSync] Upload failed', { error });
    showSyncStatus(error instanceof Error ? `上傳失敗：${error.message}` : '上傳失敗', 'error');
  } finally {
    hideLoading();
  }
}

/**
 * 處理手動下載（含二次確認）
 */
async function handleDownload() {
  const confirmed = globalThis.confirm(
    '從 Google Drive 還原資料將覆蓋本地所有已儲存的標記與保存記錄。\n\n確定要繼續嗎？'
  );
  if (!confirmed) {
    return;
  }

  showLoading('從雲端還原中...');
  try {
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
    });

    if (!response) {
      throw new Error('背景無回應');
    }
    if (!response.success) {
      throw new Error(response.error ?? '下載失敗');
    }

    showSyncStatus('還原成功！頁面資料已從雲端更新。', 'success');
    const metadata = await getDriveSyncMetadata();
    renderCloudSyncCard(metadata);
  } catch (error) {
    Logger.error('[CloudSync] Download failed', { error });
    showSyncStatus(error instanceof Error ? `還原失敗：${error.message}` : '還原失敗', 'error');
  } finally {
    hideLoading();
  }
}

/**
 * 處理 disconnect（含確認）
 */
async function handleDisconnect() {
  const confirmed = globalThis.confirm(
    '確定要中斷 Google Drive 連線嗎？\n\n本地資料不受影響，但雲端同步功能將停用。'
  );
  if (!confirmed) {
    return;
  }

  showLoading('中斷連線中...');
  try {
    // 直接送 DRIVE_SYNC_MANUAL_UPLOAD 但 action 是 disconnect
    // 實際 disconnect 邏輯由 background 處理
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.DRIVE_CONNECTION_UPDATED,
      email: null,
      connectedAt: null,
    });
    // response 可能 undefined（廣播訊息），不需要確認
    Logger.info('[CloudSync] Disconnect broadcast sent', { response });
    showSyncStatus('已中斷 Google Drive 連線', 'success');
    const metadata = await getDriveSyncMetadata();
    renderCloudSyncCard(metadata);
  } catch (error) {
    Logger.error('[CloudSync] Disconnect failed', { error });
    showSyncStatus('中斷連線失敗，請重試', 'error');
  } finally {
    hideLoading();
  }
}

// =============================================================================
// 初始化（綁定事件 + 初次渲染）
// =============================================================================

/**
 * 初始化 Cloud Sync Controller
 *
 * @param {boolean} isLoggedIn - 是否已登入帳號
 */
export async function initCloudSyncController(isLoggedIn) {
  // 更新 card 顯示與否
  setCloudSyncCardVisibility(isLoggedIn);

  if (!isLoggedIn) {
    return;
  }

  // 讀取 Drive metadata 並渲染
  const metadata = await getDriveSyncMetadata();
  renderCloudSyncCard(metadata);

  // 綁定按鈕事件
  el(DOM.BTN_CONNECT)?.addEventListener('click', () => {
    startDriveOAuthFlow();
  });

  el(DOM.BTN_UPLOAD)?.addEventListener('click', () => {
    handleUpload(false).catch(() => {});
  });

  el(DOM.BTN_DOWNLOAD)?.addEventListener('click', () => {
    handleDownload().catch(() => {});
  });

  el(DOM.BTN_DISCONNECT)?.addEventListener('click', () => {
    handleDisconnect().catch(() => {});
  });

  // 衝突 - 下載雲端版本
  el(DOM.BTN_CONFLICT_DOWNLOAD)?.addEventListener('click', () => {
    handleDownload().catch(() => {});
  });

  // 衝突 - 強制上傳
  el(DOM.BTN_CONFLICT_FORCE_UPLOAD)?.addEventListener('click', () => {
    const confirmed = globalThis.confirm(
      '確定要強制上傳並覆蓋較新的雲端版本嗎？\n\n此操作無法還原。'
    );
    if (confirmed) {
      handleUpload(true).catch(() => {});
    }
  });
}

/**
 * 刷新 Cloud Sync card（訊息更新後呼叫）
 */
export async function refreshCloudSyncCard() {
  const metadata = await getDriveSyncMetadata();
  renderCloudSyncCard(metadata);
}
