/* global chrome */
import Logger from './Logger.js';
import { AuthMode, NOTION_OAUTH } from '../config/constants.js';
import { sanitizeApiError } from './securityUtils.js';

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

/**
 * 刷新 OAuth Token
 *
 * @returns {Promise<string|null>} 新的 access_token 或 null
 */
export async function refreshOAuthToken() {
  try {
    const localData = await chrome.storage.local.get(['notionRefreshToken']);
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
      body: JSON.stringify({ refresh_token: localData.notionRefreshToken }),
    });

    if (!response.ok) {
      Logger.error('Token 刷新請求失敗', {
        action: 'refreshOAuthToken',
        status: response.status,
      });
      return null;
    }

    const data = await response.json();
    const hasValidAccessToken =
      typeof data?.access_token === 'string' && data.access_token.trim().length > 0;
    const hasValidRefreshToken =
      typeof data?.refresh_token === 'string' && data.refresh_token.trim().length > 0;

    if (!hasValidAccessToken || !hasValidRefreshToken) {
      Logger.error('OAuth Token 刷新回應缺少必要欄位', {
        action: 'refreshOAuthToken',
        error: sanitizeApiError('invalid_token_response', 'refreshOAuthToken'),
      });
      return null;
    }

    await chrome.storage.local.set({
      notionOAuthToken: data.access_token,
      notionRefreshToken: data.refresh_token,
    });

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
