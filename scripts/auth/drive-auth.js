/**
 * drive-auth.js — Drive OAuth Callback Bridge（drive-auth.html 的主邏輯）
 *
 * 執行流程：
 * 1. 解析 URL query 中的 drive_email 與 connected_at（後端回傳）
 * 2. 呼叫 setDriveConnection() 寫入 metadata
 * 3. 廣播 DRIVE_CONNECTION_UPDATED 給 extension 其他頁面
 * 4. 成功後自動關閉頁面
 * 5. 任一步驟失敗時顯示錯誤，不自動關閉
 *
 * 設計原則（MUST NOT 違反）：
 * - 不使用任何 account session 或 Notion OAuth 邏輯
 * - 不修改 account* / notion* storage keys
 * - 此頁面只負責 Drive 連線 metadata 的寫入與廣播
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-a-manual-sync-plan.md §6 Step 1
 */

/* global chrome */

import { RUNTIME_ACTIONS } from '../config/runtimeActions.js';
import { setDriveConnection } from './driveClient.js';
import { showError, showLoading, showSuccess } from './callbackStatusView.js';

// =============================================================================
// Drive Auth Bridge 邏輯
// =============================================================================

/**
 * 解析 URL query 中後端回傳的 Drive 連線資訊。
 * 後端在授權完成後應回傳 ?drive_email=xxx&connected_at=ISO8601
 * 或以 ?error=xxx 表示失敗。
 *
 * @returns {{ connection: { email: string; connectedAt: string | null } | null; error: string | null }}
 */
function parseDriveCallbackParams() {
  const params = new URLSearchParams(globalThis.location.search);

  const error = params.get('error');
  if (error) {
    return { connection: null, error };
  }

  const email = params.get('drive_email');
  const connectedAt = params.get('connected_at') ?? null;

  if (!email) {
    return { connection: null, error: null };
  }

  return { connection: { email, connectedAt }, error: null };
}

/**
 * 廣播 DRIVE_CONNECTION_UPDATED 給 extension 其他頁面。
 *
 * @param {string | null} email - 連線帳號 email
 * @param {string | null} connectedAt - ISO 8601 timestamp
 */
function broadcastDriveConnectionUpdated(email, connectedAt) {
  chrome.runtime
    .sendMessage({
      action: RUNTIME_ACTIONS.DRIVE_CONNECTION_UPDATED,
      email,
      connectedAt,
    })
    .catch(() => {
      // background 若未就緒，忽略錯誤；options 頁自行監聽 storage 變化
    });
}

/**
 * 主邏輯：執行 Drive OAuth callback bridge 流程。
 */
async function runDriveAuthFlow() {
  showLoading('正在完成 Google Drive 授權...');

  // 步驟 1：解析後端回傳的 Drive 連線資訊
  const { connection, error } = parseDriveCallbackParams();

  if (error) {
    showError('Google Drive 授權失敗', error);
    return;
  }

  if (!connection) {
    showError('Google Drive 授權失敗：缺少連線資訊', '未在 URL 中找到 drive_email，請重新連接。');
    return;
  }

  showLoading('正在儲存連線資訊...');

  // 步驟 2：寫入 drive connection metadata
  try {
    await setDriveConnection(connection);
  } catch (error_) {
    showError('儲存連線資訊失敗', error_ instanceof Error ? error_.message : String(error_));
    return;
  }

  // 步驟 3：廣播連線更新事件
  broadcastDriveConnectionUpdated(connection.email, connection.connectedAt);

  // 步驟 4：顯示成功，延遲關閉
  showSuccess('Google Drive 連接成功！');

  setTimeout(() => {
    globalThis.close();
  }, 1500);
}

// =============================================================================
// 入口
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  runDriveAuthFlow().catch(error => {
    showError('發生未預期錯誤', error instanceof Error ? error.message : String(error));
  });
});
