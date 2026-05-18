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
 * @throws {Error & { code: 'oauth_identity_unavailable' }}
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
    unavailableError.code = 'oauth_identity_unavailable';
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
 * @throws {Error} 缺 OAUTH_CLIENT_ID、Identity API 不可用、用戶取消、CSRF 驗證失敗等
 */
export async function initiateNotionOAuth() {
  checkIdentityApi();

  if (!isNonEmptyString(BUILD_ENV.OAUTH_CLIENT_ID)) {
    Logger.error('[Auth] OAuth Client ID 未設定', {
      action: 'initiateNotionOAuth',
      missingBuildEnvKeys: ['OAUTH_CLIENT_ID'],
    });
    const configError = new Error('OAUTH_CLIENT_ID is not configured');
    configError.code = 'oauth_missing_client_id';
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
    throw new Error('OAuth 流程被取消或未回傳 URL');
  }

  // 5. 解析 callback URL
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  // 6. 驗證 CSRF state
  const storedState = await chrome.storage.session.get(OAUTH_STATE_STORAGE_KEY);
  if (returnedState !== storedState[OAUTH_STATE_STORAGE_KEY]) {
    throw new Error('CSRF state 驗證失敗，請重試');
  }

  if (!code) {
    const errorParam = url.searchParams.get('error');
    Logger.error('[Auth] Notion OAuth callback 錯誤', {
      action: 'initiateNotionOAuth',
      oauthError: errorParam || 'no_error_param',
    });
    throw new Error(`Notion 授權失敗: ${errorParam || '未知錯誤'}`);
  }

  return { code, redirectUri, csrfState };
}
