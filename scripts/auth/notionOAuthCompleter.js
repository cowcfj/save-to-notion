/**
 * Notion OAuth Completer
 *
 * 抽自 options/AuthManager.js 的 _exchangeOAuthToken 與 _saveOAuthTokenData，
 * 作為 onboarding 與 options 共用的 OAuth 完成階段邏輯。
 *
 * 與 notionOAuthInitiator.js 形成成對：
 * - initiator：產 CSRF state、launchWebAuthFlow、解析 callback → 回傳 { code, redirectUri, csrfState }
 * - completer：exchange code → token，並落地 chrome.storage.local
 *
 * 設計理由：caller（AuthManager 或 onboarding）持有 worker URL 與 storage 寫入策略，
 * 但實際 fetch 與 storage 寫入是純邏輯，沒有 page-specific state，可以集中維護。
 */

/* global chrome */

import Logger from '../utils/Logger.js';
import { sanitizeApiError } from '../utils/ApiErrorSanitizer.js';
import { isNonEmptyString, getNextAuthEpoch } from '../utils/notionAuth.js';
import { AuthMode } from '../config/extension/authMode.js';
import { NOTION_OAUTH } from '../config/extension/notionAuth.js';
import { BUILD_ENV } from '../config/env/index.js';

const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;

/**
 * @typedef {object} NotionOAuthTokenData
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {string} [refresh_proof]
 * @property {string} [workspace_id]
 * @property {string} [workspace_name]
 * @property {string} [bot_id]
 */

/**
 * 把 authorization code 送到後端 worker 交換 access / refresh token。
 *
 * @param {{ code: string, redirectUri: string }} params
 * @returns {Promise<NotionOAuthTokenData>}
 * @throws {Error} 後端非 2xx 或 token 缺必要欄位時拋錯；若後端回傳 error_code 會掛在 error.code；逾時會拋 code='OAUTH_TOKEN_EXCHANGE_TIMEOUT'
 */
export async function exchangeNotionOAuthCode({ code, redirectUri }) {
  const serverUrl = `${BUILD_ENV.OAUTH_SERVER_URL}${NOTION_OAUTH.TOKEN_ENDPOINT}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT_MS);

  let tokenResponse;
  try {
    tokenResponse = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    Logger.warn('[Auth] Notion OAuth token 交換請求失敗', {
      action: 'exchangeNotionOAuthCode',
      result: isAbort ? 'blocked' : 'failed',
      error: sanitizeApiError(error, 'exchangeNotionOAuthCode'),
    });
    if (isAbort) {
      const timeoutError = new Error('Token exchange request timed out');
      timeoutError.code = 'OAUTH_TOKEN_EXCHANGE_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({}));
    const error = new Error(
      errorData.message || errorData.error || `Token 交換失敗 (${tokenResponse.status})`
    );
    if (typeof errorData.error_code === 'string' && errorData.error_code.trim()) {
      error.code = errorData.error_code;
    }
    throw error;
  }

  const tokenData = await tokenResponse.json();
  const hasAccessToken = isNonEmptyString(tokenData.access_token);
  const hasRefreshToken = isNonEmptyString(tokenData.refresh_token);

  if (!hasAccessToken || !hasRefreshToken) {
    throw new Error('OAuth token 回應缺少必要欄位');
  }

  return tokenData;
}

/**
 * 把交換到的 token 連同 workspace metadata 落地 chrome.storage.local。
 *
 * 缺 refresh_proof 時，會嘗試清掉 storage 裡的舊值（避免遺留前一次授權的 proof）；
 * 清理失敗只記 warn，不中斷流程。
 *
 * @param {NotionOAuthTokenData} tokenData
 * @returns {Promise<void>}
 */
export async function saveNotionOAuthToken(tokenData) {
  const hasRefreshProof = isNonEmptyString(tokenData.refresh_proof);
  const nextAuthEpoch = await getNextAuthEpoch();

  await chrome.storage.local.set({
    notionAuthMode: AuthMode.OAUTH,
    notionOAuthToken: tokenData.access_token,
    notionRefreshToken: tokenData.refresh_token,
    notionRefreshProof: hasRefreshProof ? tokenData.refresh_proof : null,
    notionWorkspaceId: tokenData.workspace_id,
    notionWorkspaceName: tokenData.workspace_name,
    notionBotId: tokenData.bot_id,
    notionAuthEpoch: nextAuthEpoch,
  });
  if (!hasRefreshProof) {
    try {
      await chrome.storage.local.remove(['notionRefreshProof']);
    } catch (error) {
      Logger.warn('[存儲] 清理舊的 refresh_proof 失敗，將忽略並繼續', {
        action: 'saveNotionOAuthToken',
        error: sanitizeApiError(error, 'saveNotionOAuthToken'),
      });
    }
  }
}
