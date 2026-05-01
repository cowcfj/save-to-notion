/**
 * auth.js — Account Callback Bridge（auth.html 的主邏輯）
 *
 * 執行流程：
 * 1. 解析 URL query 中的 account_ticket
 * 2. POST /v1/account/session/exchange → 取得 tokens
 * 3. GET /v1/account/me → 取得 profile
 * 4. 成功：寫入 account session + profile，發送 account_session_updated，關閉頁面
 * 5. 任一步驟失敗：清除已取得的 token，顯示錯誤頁面，不關閉
 *
 * 設計原則（MUST NOT 違反）：
 * - 不使用任何 Notion OAuth 邏輯
 * - account/me 失敗時，採保守策略：清除所有 account keys，回退未登入狀態
 * - 成功時才寫入 storage，不留下半登入狀態
 *
 * @see docs/plans/2026-04-17-cloudflare-frontend-account-integration-plan.md §3.2、Task 4
 */

/* global chrome */

import { BUILD_ENV } from '../config/env/index.js';
import { ACCOUNT_API } from '../config/extension/accountApi.js';
import { UI_MESSAGES } from '../config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../config/shared/runtimeActions.js';
import { setAccountSession, setAccountProfile, clearAccountSession } from './accountSession.js';
import { buildAccountApiUrl } from './accountLogin.js';
import { showError, showLoading, showSuccess } from './callbackStatusView.js';

// =============================================================================
// Auth flow
// =============================================================================

/**
 * 解析 URL query 中的 account_ticket。
 * 若不存在，回傳 null。
 *
 * @returns {string | null}
 */
function parseAccountTicket() {
  const params = new URLSearchParams(globalThis.location.search);
  return params.get('account_ticket') ?? null;
}

/**
 * 驗證並正規化 account API base URL。
 *
 * @returns {string | null}
 */
function resolveAccountApiBaseUrl() {
  const baseUrl = BUILD_ENV.OAUTH_SERVER_URL;
  try {
    buildAccountApiUrl(baseUrl, ACCOUNT_API.ME);
    return baseUrl;
  } catch {
    return null;
  }
}

/**
 * 呼叫 POST /v1/account/session/exchange，以 account_ticket 換取 session tokens。
 *
 * @param {string} ticket
 * @param {string} baseUrl
 * @returns {Promise<{accessToken: string; refreshToken: string; expiresAt: number; userId: string}>}
 * @throws {Error} 若 HTTP 非 2xx 或回應格式不符
 */
async function exchangeTicket(ticket, baseUrl) {
  const url = buildAccountApiUrl(baseUrl, ACCOUNT_API.SESSION_EXCHANGE);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const detail = errText ? ` — ${errText}` : '';
    throw new Error(`Exchange failed: HTTP ${res.status}${detail}`);
  }

  const data = await res.json();

  // 驗證必要欄位
  if (!data.access_token) {
    throw new Error('Exchange response missing required field (access_token)');
  }

  const expiresAt = Number(data.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new Error('Exchange response contains invalid expires_at');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt,
    userId: data.user_id ?? '',
  };
}

/**
 * 呼叫 GET /v1/account/me 取得最小帳號資訊。
 *
 * @param {string} accessToken
 * @param {string} baseUrl
 * @returns {Promise<{userId: string; email: string; displayName: string | null; avatarUrl: string | null}>}
 * @throws {Error} 若 HTTP 非 2xx 或回應格式不符
 */
async function fetchAccountMe(accessToken, baseUrl) {
  const url = buildAccountApiUrl(baseUrl, ACCOUNT_API.ME);

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const detail = errText ? ` — ${errText}` : '';
    throw new Error(`Account/me failed: HTTP ${res.status}${detail}`);
  }

  const data = await res.json();

  if (!data.email) {
    throw new Error('Account/me response missing required field (email)');
  }

  const userId = data.user_id ?? data.userId;
  if (!userId) {
    throw new Error('Account/me response missing required field (user_id)');
  }

  return {
    userId,
    email: data.email,
    displayName: data.display_name ?? data.displayName ?? null,
    avatarUrl: data.avatar_url ?? data.avatarUrl ?? null,
  };
}

/**
 * 廣播 account_session_updated 給 extension 其他頁面（background / options）。
 *
 * @param {string} userId
 * @param {string} email
 */
function broadcastSessionUpdated(userId, email) {
  chrome.runtime
    .sendMessage({
      action: RUNTIME_ACTIONS.ACCOUNT_SESSION_UPDATED,
      userId,
      email,
    })
    .catch(() => {
      // background 若未就緒，忽略錯誤；options 頁自行監聽 storage 變化
    });
}

/**
 * 主邏輯：執行完整的 account callback bridge 流程。
 */
async function runAuthFlow() {
  const messages = UI_MESSAGES.AUTH_BRIDGE;

  // 步驟 1：解析 account_ticket
  const ticket = parseAccountTicket();
  if (!ticket) {
    showError(messages.TITLE_MISSING_TICKET, messages.DETAIL_MISSING_TICKET);
    return;
  }

  const baseUrl = resolveAccountApiBaseUrl();
  if (!baseUrl) {
    showError(messages.TITLE_MISCONFIGURED, messages.DETAIL_MISCONFIGURED);
    return;
  }

  showLoading(messages.STATUS_VERIFYING);

  let tokens;

  // 步驟 2：exchange ticket → tokens
  try {
    tokens = await exchangeTicket(ticket, baseUrl);
  } catch (error) {
    showError(
      messages.TITLE_EXCHANGE_FAILED,
      error instanceof Error ? error.message : String(error)
    );
    return; // 無 token，無需清理
  }

  showLoading(messages.STATUS_FETCHING_PROFILE);

  let profile;

  // 步驟 3：GET /v1/account/me
  try {
    profile = await fetchAccountMe(tokens.accessToken, baseUrl);
  } catch (error) {
    // Phase 1 保守策略：account/me 失敗 → 清除已取得的 token，回退未登入狀態
    // （token 尚未寫入 storage，此處僅做防禦性清除）
    await clearAccountSession().catch(() => {});
    showError(
      messages.TITLE_PROFILE_FAILED,
      error instanceof Error ? error.message : String(error)
    );
    return;
  }

  // 步驟 4：合併寫入 storage
  // 由於上方 account/me 已成功，此時可安全寫入，不留下半登入狀態
  try {
    const resolvedUserId = profile.userId || tokens.userId;

    await setAccountSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      userId: resolvedUserId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    await setAccountProfile({
      userId: resolvedUserId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    // 步驟 5：廣播 account_session_updated
    broadcastSessionUpdated(resolvedUserId, profile.email);
  } catch (error) {
    // 寫入 storage 失敗：清除確保不留下半登入狀態
    await clearAccountSession().catch(() => {});
    showError(
      messages.TITLE_STORAGE_FAILED,
      error instanceof Error ? error.message : String(error)
    );
    return;
  }

  // 步驟 6：顯示成功，自動關閉
  showSuccess(messages.STATUS_SUCCESS);

  // 延遲 1.5s 後自動關閉（讓使用者看到成功訊息）
  setTimeout(() => {
    globalThis.close();
  }, 1500);
}

// =============================================================================
// 入口
// =============================================================================

// DOM ready 後啟動 auth flow
document.addEventListener('DOMContentLoaded', () => {
  runAuthFlow().catch(error => {
    showError(
      UI_MESSAGES.AUTH_BRIDGE.TITLE_UNEXPECTED,
      error instanceof Error ? error.message : String(error)
    );
  });
});
