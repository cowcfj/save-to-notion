/* global chrome */
import Logger from './Logger.js';
import { AuthMode, NOTION_OAUTH } from '../config/constants.js';
import { sanitizeApiError } from './securityUtils.js';

/**
 * 檢查值是否為有效的非空字串
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

let refreshInFlightPromise = null;

async function clearStoredRefreshProof(action) {
  try {
    await chrome.storage.local.remove(['notionRefreshProof']);
  } catch (error) {
    Logger.warn('清理舊的 refresh_proof 失敗，將忽略並繼續', {
      action,
      error: sanitizeApiError(error, action),
    });
  }
}

/**
 * 取得目前有效的 Notion API Token（不論模式）
 * 優先讀取 OAuth Token（local），若無則讀取手動 API Key（sync）
 *
 * @returns {Promise<{token: string|null, mode: 'oauth'|'manual'|null}>}
 */
export async function getActiveNotionToken() {
  const localData = await chrome.storage.local.get(['notionAuthMode', 'notionOAuthToken']);
  if (localData.notionAuthMode === AuthMode.OAUTH && localData.notionOAuthToken) {
    return { token: localData.notionOAuthToken, mode: AuthMode.OAUTH };
  }

  const syncData = await chrome.storage.sync.get(['notionApiKey']);
  if (syncData.notionApiKey) {
    return { token: syncData.notionApiKey, mode: AuthMode.MANUAL };
  }

  return { token: null, mode: null };
}

async function performRefreshOAuthToken() {
  try {
    const localData = await chrome.storage.local.get(['notionRefreshToken', 'notionRefreshProof']);
    if (!localData.notionRefreshToken) {
      Logger.error('無法刷新 Token：缺少 refresh_token', {
        action: 'refreshOAuthToken',
      });
      return null;
    }

    const serverUrl = `${NOTION_OAUTH.SERVER_URL}${NOTION_OAUTH.REFRESH_ENDPOINT}`;
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Key': NOTION_OAUTH.EXTENSION_API_KEY,
      },
      body: JSON.stringify({
        refresh_token: localData.notionRefreshToken,
        ...(isNonEmptyString(localData.notionRefreshProof)
          ? { refresh_proof: localData.notionRefreshProof }
          : {}),
      }),
    });

    if (!response.ok) {
      let errorCode = null;
      try {
        const errorData = await response.json();
        errorCode = errorData?.error_code ?? null;
      } catch {
        errorCode = null;
      }

      if (errorCode === 'INVALID_REFRESH_PROOF') {
        await clearStoredRefreshProof('refreshOAuthToken');
      }

      Logger.error('Token 刷新請求失敗', {
        action: 'refreshOAuthToken',
        status: response.status,
      });
      return null;
    }

    const data = await response.json();
    const hasValidAccessToken = isNonEmptyString(data?.access_token);
    const hasValidRefreshToken = isNonEmptyString(data?.refresh_token);

    if (!hasValidAccessToken || !hasValidRefreshToken) {
      Logger.error('OAuth Token 刷新回應缺少必要欄位', {
        action: 'refreshOAuthToken',
        error: sanitizeApiError('invalid_token_response', 'refreshOAuthToken'),
      });
      return null;
    }

    const hasValidRefreshProof = isNonEmptyString(data?.refresh_proof);

    const nextStorage = {
      notionOAuthToken: data.access_token,
      notionRefreshToken: data.refresh_token,
      ...(hasValidRefreshProof ? { notionRefreshProof: data.refresh_proof } : {}),
    };

    await chrome.storage.local.set(nextStorage);
    if (!hasValidRefreshProof) {
      await clearStoredRefreshProof('refreshOAuthToken');
    }

    Logger.success('OAuth Token 已刷新', { action: 'refreshOAuthToken' });
    return data.access_token;
  } catch (error) {
    Logger.error('OAuth Token 刷新失敗', {
      action: 'refreshOAuthToken',
      error: sanitizeApiError(error, 'refreshOAuthToken'),
    });
    return null;
  }
}

/**
 * 刷新 OAuth Token
 *
 * @returns {Promise<string|null>} 新的 access_token 或 null
 */
export async function refreshOAuthToken() {
  if (refreshInFlightPromise) {
    return refreshInFlightPromise;
  }

  refreshInFlightPromise = performRefreshOAuthToken().finally(() => {
    refreshInFlightPromise = null;
  });

  return refreshInFlightPromise;
}
