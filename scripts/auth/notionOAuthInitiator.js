/**
 * Notion OAuth Initiator
 *
 * 抽自 options/AuthManager.js 的 startOAuthFlow，作為 onboarding 與 options 共用入口。
 *
 * 純粹封裝 OAuth 「取得 authorization code」的流程：
 * 產生 CSRF state、組 auth URL、呼叫 chrome.identity.launchWebAuthFlow、
 * 解析 callback、驗證 state。
 *
 * Token 交換與儲存留給 caller 處理（caller 持有 worker URL 與 storage 寫入邏輯）。
 *
 * 設計理由：MV3 service worker 閒置 ~30 秒會被回收；OAuth 等待期間
 * 由頁面層直接呼叫 launchWebAuthFlow 較穩定（Promise 留在頁面 closure）。
 */

/* global chrome, crypto */

import Logger from '../utils/Logger.js';
import { isNonEmptyString } from '../utils/notionAuth.js';
import { BUILD_ENV } from '../config/env/index.js';

const OAUTH_STATE_STORAGE_KEY = 'oauthState';

/**
 * 檢查 chrome.identity API 是否可用。
 *
 * @throws {Error & { code: 'OAUTH_IDENTITY_UNAVAILABLE' }}
 */
function checkIdentityApi() {
  const missingIdentityApi = [];
  if (typeof chrome?.identity?.getRedirectURL !== 'function') {
    missingIdentityApi.push('getRedirectURL');
  }
  if (typeof chrome?.identity?.launchWebAuthFlow !== 'function') {
    missingIdentityApi.push('launchWebAuthFlow');
  }
  if (missingIdentityApi.length > 0) {
    Logger.error('[Auth] OAuth Identity API 不可用', {
      action: 'initiateNotionOAuth',
      missingIdentityApi,
    });
    const unavailableError = new Error(
      `OAuth Identity API unavailable: ${missingIdentityApi.join(', ')}`
    );
    unavailableError.code = 'OAUTH_IDENTITY_UNAVAILABLE';
    throw unavailableError;
  }
}

/**
 * @typedef {object} NotionOAuthAuthorizeResult
 * @property {string} code - Notion OAuth authorization code
 * @property {string} redirectUri - 用於後續 token 交換的 redirect URI
 * @property {string} csrfState - 已驗證通過的 CSRF state（caller 可用於後續清理）
 */

/**
 * 啟動 Notion OAuth 授權流程，取得 authorization code。
 *
 * Caller 應自行處理：
 * - UI loading 狀態
 * - 失敗時 UI 反應
 * - token 交換（將 code 送到 worker）
 * - token 落地（寫 chrome.storage.local）
 * - 清理 oauthState（chrome.storage.session）
 *
 * @returns {Promise<NotionOAuthAuthorizeResult>}
 * @throws {Error & { code: 'OAUTH_IDENTITY_UNAVAILABLE' | 'OAUTH_MISSING_CLIENT_ID' | 'OAUTH_FLOW_CANCELLED' | 'OAUTH_CSRF_MISMATCH' | 'OAUTH_CALLBACK_ERROR' }}
 *   `OAUTH_CALLBACK_ERROR` 會在 `error.cause` 帶上 callback URL 的 `error` 參數值（如 `'access_denied'`、`'canceled'`）。
 */
export async function initiateNotionOAuth() {
  checkIdentityApi();

  if (!isNonEmptyString(BUILD_ENV.OAUTH_CLIENT_ID)) {
    Logger.error('[Auth] OAuth Client ID 未設定', {
      action: 'initiateNotionOAuth',
      missingBuildEnvKeys: ['OAUTH_CLIENT_ID'],
    });
    const configError = new Error('OAUTH_CLIENT_ID is not configured');
    configError.code = 'OAUTH_MISSING_CLIENT_ID';
    throw configError;
  }

  // 1. 產生 CSRF state 並暫存
  const csrfState = crypto.randomUUID();
  await chrome.storage.session.set({ [OAUTH_STATE_STORAGE_KEY]: csrfState });

  // 2. 取得 redirect URI（Chrome 自動綁定 extension ID）
  const redirectUri = chrome.identity.getRedirectURL();

  // 3. 組成 Notion 授權 URL
  const authUrl =
    `https://api.notion.com/v1/oauth/authorize?` +
    `client_id=${encodeURIComponent(BUILD_ENV.OAUTH_CLIENT_ID)}&` +
    `response_type=code&owner=user&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=${encodeURIComponent(csrfState)}`;

  // 4. 啟動 OAuth 流程
  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!callbackUrl) {
    const cancelledError = new Error('OAuth flow cancelled or no callback URL returned');
    cancelledError.code = 'OAUTH_FLOW_CANCELLED';
    throw cancelledError;
  }

  // 5. 解析 callback URL
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  // 6. 驗證 CSRF state
  const storedState = await chrome.storage.session.get(OAUTH_STATE_STORAGE_KEY);
  if (returnedState !== storedState[OAUTH_STATE_STORAGE_KEY]) {
    const csrfError = new Error('CSRF state mismatch');
    csrfError.code = 'OAUTH_CSRF_MISMATCH';
    throw csrfError;
  }

  if (!code) {
    const errorParam = url.searchParams.get('error');
    Logger.error('[Auth] Notion OAuth callback 錯誤', {
      action: 'initiateNotionOAuth',
      oauthError: errorParam || 'no_error_param',
    });
    const callbackError = new Error(`Notion OAuth callback error: ${errorParam || 'unknown'}`);
    callbackError.code = 'OAUTH_CALLBACK_ERROR';
    callbackError.cause = errorParam || 'unknown';
    throw callbackError;
  }

  return { code, redirectUri, csrfState };
}
