/* global chrome */
import Logger from './Logger.js';
import { AuthMode } from '../config/extension/authMode.js';
import { NOTION_OAUTH } from '../config/extension/notionAuth.js';
import { BUILD_ENV } from '../config/env.js';
import { RUNTIME_ACTIONS } from '../config/runtimeActions.js';
import { sanitizeApiError } from './securityUtils.js';
import { ERROR_MESSAGES } from '../config/messages.js';

const AUTH_EPOCH_KEY = 'notionAuthEpoch';

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

function normalizeAuthEpoch(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isBackgroundContext() {
  return globalThis.window === undefined;
}

async function getAuthMutationState() {
  return chrome.storage.local.get(['notionAuthMode', 'notionRefreshToken', AUTH_EPOCH_KEY]);
}

export async function getNextAuthEpoch() {
  const authState = await chrome.storage.local.get([AUTH_EPOCH_KEY]);
  return normalizeAuthEpoch(authState[AUTH_EPOCH_KEY]) + 1;
}

async function shouldAbortRefreshMutation(oldRefreshToken, startAuthEpoch) {
  const latestAuthState = await getAuthMutationState();

  return (
    latestAuthState.notionAuthMode !== AuthMode.OAUTH ||
    latestAuthState.notionRefreshToken !== oldRefreshToken ||
    normalizeAuthEpoch(latestAuthState[AUTH_EPOCH_KEY]) !== startAuthEpoch
  );
}

async function clearStoredRefreshProof(action, nextAuthEpoch = null) {
  try {
    const nextState = { notionRefreshProof: null };
    if (nextAuthEpoch !== null) {
      nextState[AUTH_EPOCH_KEY] = nextAuthEpoch;
    }

    await chrome.storage.local.set(nextState);
    await chrome.storage.local.remove(['notionRefreshProof']);
  } catch (error) {
    Logger.warn('[存儲] 清理舊的 refresh_proof 失敗，將忽略並繼續', {
      action,
      phase: 'cleanup',
      error: sanitizeApiError(error, action),
    });
  }
}

function getMissingRefreshBuildEnvKeys(buildEnv) {
  const missingBuildEnvKeys = [];

  if (!isNonEmptyString(buildEnv.OAUTH_SERVER_URL)) {
    missingBuildEnvKeys.push('OAUTH_SERVER_URL');
  }
  if (!isNonEmptyString(buildEnv.EXTENSION_API_KEY)) {
    missingBuildEnvKeys.push('EXTENSION_API_KEY');
  }

  return missingBuildEnvKeys;
}

async function getRefreshErrorCode(response) {
  try {
    const errorData = await response.json();
    return errorData?.error_code ?? null;
  } catch {
    return null;
  }
}

async function handleFailedRefreshResponse(response, oldRefreshToken, startAuthEpoch) {
  const errorCode = await getRefreshErrorCode(response);

  if (errorCode === 'INVALID_REFRESH_PROOF') {
    if (await shouldAbortRefreshMutation(oldRefreshToken, startAuthEpoch)) {
      return;
    }

    await clearStoredRefreshProof('refreshOAuthToken', startAuthEpoch + 1);
  }

  Logger.error('Token 刷新請求失敗', {
    action: 'refreshOAuthToken',
    phase: 'request',
    status: response.status,
  });
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

/**
 * 確保 Notion API Key 存在並返回
 *
 * @returns {Promise<string>} API Key
 * @throws {Error} 如果 API Key 未設置
 */
export async function ensureNotionApiKey() {
  const { token } = await getActiveNotionToken();
  if (!token) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED);
  }
  return token;
}

async function performRefreshOAuthToken() {
  try {
    const localData = await chrome.storage.local.get([
      'notionAuthMode',
      'notionRefreshToken',
      'notionRefreshProof',
      AUTH_EPOCH_KEY,
    ]);
    const oldRefreshToken = localData.notionRefreshToken;
    const startAuthEpoch = normalizeAuthEpoch(localData[AUTH_EPOCH_KEY]);

    if (!oldRefreshToken) {
      Logger.error('無法刷新 Token：缺少 refresh_token', {
        action: 'refreshOAuthToken',
        phase: 'preflight',
      });
      return null;
    }

    const missingBuildEnvKeys = getMissingRefreshBuildEnvKeys(BUILD_ENV);
    if (missingBuildEnvKeys.length > 0) {
      Logger.error('無法刷新 Token：缺少 OAuth 建置環境設定', {
        action: 'refreshOAuthToken',
        phase: 'preflight',
        missingBuildEnvKeys,
      });
      return null;
    }

    const serverUrl = `${BUILD_ENV.OAUTH_SERVER_URL}${NOTION_OAUTH.REFRESH_ENDPOINT}`;
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Key': BUILD_ENV.EXTENSION_API_KEY,
      },
      body: JSON.stringify({
        refresh_token: localData.notionRefreshToken,
        ...(isNonEmptyString(localData.notionRefreshProof)
          ? { refresh_proof: localData.notionRefreshProof }
          : {}),
      }),
    });

    if (!response.ok) {
      await handleFailedRefreshResponse(response, oldRefreshToken, startAuthEpoch);
      return null;
    }

    const data = await response.json();
    const hasValidAccessToken = isNonEmptyString(data?.access_token);
    const hasValidRefreshToken = isNonEmptyString(data?.refresh_token);

    if (!hasValidAccessToken || !hasValidRefreshToken) {
      Logger.error('OAuth Token 刷新回應缺少必要欄位', {
        action: 'refreshOAuthToken',
        phase: 'validate',
        error: sanitizeApiError('invalid_token_response', 'refreshOAuthToken'),
      });
      return null;
    }

    const hasValidRefreshProof = isNonEmptyString(data?.refresh_proof);

    const nextStorage = {
      notionOAuthToken: data.access_token,
      notionRefreshToken: data.refresh_token,
      notionRefreshProof: hasValidRefreshProof ? data.refresh_proof : null,
      [AUTH_EPOCH_KEY]: startAuthEpoch + 1,
    };

    if (await shouldAbortRefreshMutation(oldRefreshToken, startAuthEpoch)) {
      return null;
    }

    await chrome.storage.local.set(nextStorage);
    if (!hasValidRefreshProof) {
      await clearStoredRefreshProof('refreshOAuthToken');
    }

    Logger.success('OAuth Token 已刷新', {
      action: 'refreshOAuthToken',
      phase: 'commit',
      nextAuthEpoch: nextStorage[AUTH_EPOCH_KEY],
    });
    return data.access_token;
  } catch (error) {
    Logger.error('OAuth Token 刷新失敗', {
      action: 'refreshOAuthToken',
      phase: 'request',
      error: sanitizeApiError(error, 'refreshOAuthToken'),
    });
    return null;
  }
}

async function requestBackgroundRefreshOAuthToken() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.REFRESH_OAUTH_TOKEN,
    });

    return response?.success ? (response.token ?? null) : null;
  } catch (error) {
    Logger.error('[Auth] 委派 Background 刷新 OAuth Token 失敗', {
      action: 'refreshOAuthToken',
      phase: 'delegate',
      error: sanitizeApiError(error, 'refresh_oauth_token_delegate'),
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
  if (!isBackgroundContext() && chrome.runtime?.sendMessage) {
    return requestBackgroundRefreshOAuthToken();
  }

  if (refreshInFlightPromise) {
    return refreshInFlightPromise;
  }

  refreshInFlightPromise = performRefreshOAuthToken().finally(() => {
    refreshInFlightPromise = null;
  });

  return refreshInFlightPromise;
}

/**
 * 將僅存在 sync 的資料來源設定透明遷移至 local。
 *
 * @param {object} options - 遷移選項
 * @param {object} [options.localData={}] - local storage 讀取結果
 * @param {object} [options.syncData={}] - sync storage 讀取結果
 * @param {{set: Function}} options.storageArea - 目標 storage area，通常為 chrome.storage.local
 * @param {object} [options.logger] - Logger 實例
 * @param {string} options.action - 呼叫來源，用於日誌 metadata
 * @param {string} options.retryContext - 失敗提示中的重試場景，例如 popup 或 options
 * @returns {Promise<boolean>} 是否實際執行了遷移
 */
export async function migrateDataSourceKeys({
  localData = {},
  syncData = {},
  storageArea,
  logger,
  action,
  retryContext,
}) {
  const localDataSourceId = localData.notionDataSourceId || localData.notionDatabaseId;
  const syncDataSourceId = syncData.notionDataSourceId || syncData.notionDatabaseId;

  if (localDataSourceId || !syncDataSourceId || !storageArea?.set) {
    return false;
  }

  try {
    await storageArea.set({
      notionDataSourceId: syncDataSourceId,
      notionDatabaseId: syncDataSourceId,
    });

    logger?.success?.('[Settings] 已自動遷移 dataSourceId 從 sync 至 local', {
      action,
      operation: 'migrateDataSourceKey',
    });
    return true;
  } catch (error) {
    logger?.warn?.(`[Settings] dataSourceId 遷移失敗，下次開啟 ${retryContext} 會重試`, {
      action,
      operation: 'migrateDataSourceKey',
      error,
    });
    return false;
  }
}
