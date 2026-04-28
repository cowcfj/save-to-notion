/**
 * Popup Actions 業務邏輯模組
 *
 * 封裝所有 Chrome API 調用，便於 Mock 和測試。
 */

/* global chrome */

import { isValidNotionUrl, sanitizeUrlForLogging } from '../scripts/utils/securityUtils.js';
import Logger from '../scripts/utils/Logger.js';
import { AuthMode } from '../scripts/config/extension/authMode.js';
import { BUILD_ENV } from '../scripts/config/env/index.js';
import { RUNTIME_ACTIONS } from '../scripts/config/shared/runtimeActions.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../scripts/config/shared/messages.js';
import { getAccountAccessToken, getAccountProfile } from '../scripts/auth/accountSession.js';
import { buildAccountLoginStartUrl, getOptionsAdvancedUrl } from '../scripts/auth/accountLogin.js';
import { migrateDataSourceKeys } from '../scripts/utils/notionAuth.js';
import {
  AccountGatedDestinationEntitlementProvider,
  DestinationProfileService,
  LocalDestinationProfileRepository,
} from '../scripts/background/services/DestinationProfileService.js';

/**
 * 檢查設置是否完整
 *
 * @returns {Promise<{
 *   valid: boolean,
 *   apiKey?: string,
 *   dataSourceId?: string,
 *   authMode?: string|null,
 *   hasOAuthToken?: boolean,
 *   hasManualApiKey?: boolean,
 *   missingReason?: 'missing_auth'|'missing_data_source'|'unknown'
 * }>}
 */
export async function checkSettings() {
  try {
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(['notionApiKey', 'notionDataSourceId', 'notionDatabaseId']),
      chrome.storage.local.get([
        'notionAuthMode',
        'notionOAuthToken',
        'notionDataSourceId',
        'notionDatabaseId',
      ]),
    ]);
    const isOAuth = localResult.notionAuthMode === AuthMode.OAUTH && localResult.notionOAuthToken;

    // Local 優先，sync 回退（向後兼容 v2.47.0 前僅存於 sync 的升級用戶）
    const localDataSourceId = localResult.notionDataSourceId || localResult.notionDatabaseId;
    const syncDataSourceId = syncResult.notionDataSourceId || syncResult.notionDatabaseId;
    const dataSourceId = localDataSourceId || syncDataSourceId;
    const hasManualApiKey = Boolean(syncResult.notionApiKey);
    const hasAuth = Boolean(hasManualApiKey || isOAuth);
    const valid = Boolean(hasAuth && dataSourceId);

    await migrateDataSourceKeys({
      localData: localResult,
      syncData: syncResult,
      storageArea: chrome.storage.local,
      logger: Logger,
      action: 'checkSettings',
      retryContext: 'popup',
    });

    let authMode = null;
    if (isOAuth) {
      authMode = AuthMode.OAUTH;
    } else if (hasManualApiKey) {
      authMode = AuthMode.MANUAL;
    }

    let missingReason;
    if (!valid) {
      if (hasAuth) {
        missingReason = 'missing_data_source';
      } else {
        missingReason = 'missing_auth';
      }
    }

    return {
      valid,
      apiKey: syncResult.notionApiKey,
      dataSourceId,
      authMode,
      hasOAuthToken: Boolean(isOAuth),
      hasManualApiKey,
      missingReason,
    };
  } catch (error) {
    Logger.warn('Failed to check settings:', error);
    return { valid: false, missingReason: 'unknown' };
  }
}

/**
 * 檢查頁面狀態
 *
 * @param {object} [options={}] - 額外選項
 * @returns {Promise<{
 *   success: boolean,
 *   statusKind?: string,
 *   isSaved?: boolean,
 *   canSave?: boolean,
 *   canSyncHighlights?: boolean,
 *   notionUrl?: string,
 *   notionPageId?: string,
 *   stableUrl?: string,
 *   wasDeleted?: boolean,
 *   deletionPending?: boolean
 * }>}
 */
export async function checkPageStatus(options = {}) {
  try {
    // Security: Validate and sanitize input options before passing to background
    // Ensure forceRefresh is strictly a boolean to prevent injection or unexpected behavior
    const safeOptions = {
      forceRefresh: Boolean(options?.forceRefresh),
    };

    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.CHECK_PAGE_STATUS,
      forceRefresh: safeOptions.forceRefresh,
    });
    return response || { success: false };
  } catch (error) {
    // 當 background 未準備好或連接失敗時
    Logger.warn('checkPageStatus failed:', error);
    return { success: false };
  }
}

/**
 * 保存頁面到 Notion
 *
 * @param {string} [profileId] - 保存目標 profile id
 * @returns {Promise<object>} 保存結果，成功時包含 canonical save status 欄位
 */
export async function savePage(profileId) {
  try {
    const payload = { action: RUNTIME_ACTIONS.SAVE_PAGE };
    if (typeof profileId === 'string' && profileId.trim()) {
      payload.profileId = profileId;
    }
    const response = await chrome.runtime.sendMessage(payload);
    return response || { success: false, error: ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE };
  } catch (error) {
    Logger.warn('savePage failed:', error);
    return { success: false, error: '無法儲存頁面，請稍後再試' };
  }
}

/**
 * 讀取 popup 保存目標狀態。
 *
 * @returns {Promise<{profiles: Array<object>, selectedProfileId: string|null, entitlement: object}>}
 */
export async function getDestinationState() {
  try {
    const service = new DestinationProfileService({
      repository: new LocalDestinationProfileRepository(),
      entitlementProvider: new AccountGatedDestinationEntitlementProvider(),
    });
    const [profiles, selectedProfile, entitlement] = await Promise.all([
      service.listProfiles(),
      service.getLastUsedProfile(),
      service.getDestinationEntitlement(),
    ]);

    return {
      profiles,
      selectedProfileId: selectedProfile?.id ?? profiles[0]?.id ?? null,
      entitlement,
    };
  } catch (error) {
    Logger.warn('getDestinationState failed:', error);
    return { profiles: [], selectedProfileId: null, entitlement: { maxProfiles: 1 } };
  }
}

/**
 * 啟動標記模式
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function startHighlight() {
  try {
    const response = await chrome.runtime.sendMessage({ action: RUNTIME_ACTIONS.START_HIGHLIGHT });
    return response || { success: false, error: ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE };
  } catch (error) {
    Logger.warn('startHighlight failed:', error);
    return { success: false, error: '無法啟動標記模式，請稍後再試' };
  }
}

/**
 * 打開 Notion 頁面
 *
 * @param {string} url - Notion 頁面 URL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openNotionPage(url) {
  // 驗證 URL 安全性
  if (!isValidNotionUrl(url)) {
    Logger.warn('Blocked invalid URL:', sanitizeUrlForLogging(url));
    return { success: false, error: '無效的 Notion URL' };
  }

  try {
    const tab = await chrome.tabs.create({ url });
    return { success: true, tab };
  } catch (error) {
    Logger.warn('openNotionPage failed:', error);
    return { success: false, error: '無法開啟 Notion 頁面' };
  }
}

/**
 * 獲取當前活動標籤頁
 *
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
export async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0] || null;
  } catch (error) {
    Logger.warn('getActiveTab failed:', error);
    return null;
  }
}

/**
 * 讀取 popup account 狀態。
 *
 * @returns {Promise<{
 *   enabled: boolean,
 *   isLoggedIn: boolean,
 *   profile: object|null,
 *   transientRefreshError: boolean
 * }>}
 */
export async function getPopupAccountState() {
  if (!BUILD_ENV.ENABLE_ACCOUNT) {
    return {
      enabled: false,
      isLoggedIn: false,
      profile: null,
      transientRefreshError: false,
    };
  }

  const profile = await getAccountProfile();
  if (!profile) {
    return {
      enabled: true,
      isLoggedIn: false,
      profile: null,
      transientRefreshError: false,
    };
  }

  try {
    const accessToken = await getAccountAccessToken();
    return {
      enabled: true,
      isLoggedIn: Boolean(accessToken),
      profile,
      transientRefreshError: false,
    };
  } catch {
    return {
      enabled: true,
      isLoggedIn: true,
      profile,
      transientRefreshError: true,
    };
  }
}

/**
 * 啟動 account Google login flow。
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function startAccountLogin() {
  const startUrlResult = buildAccountLoginStartUrl();
  if (!startUrlResult.success) {
    return { success: false, error: startUrlResult.error };
  }

  try {
    await chrome.tabs.create({ url: startUrlResult.url });
    return { success: true };
  } catch (error) {
    Logger.warn('startAccountLogin failed', {
      action: 'startAccountLogin',
      error,
    });
    return { success: false, error: UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED };
  }
}

/**
 * 開啟 options advanced section 的 account 管理頁。
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function openAccountManagement() {
  try {
    await chrome.tabs.create({ url: getOptionsAdvancedUrl() });
    return { success: true };
  } catch (error) {
    Logger.warn('openAccountManagement failed', {
      action: 'openAccountManagement',
      error,
    });
    return { success: false, error: UI_MESSAGES.ACCOUNT.ACCOUNT_MANAGEMENT_OPEN_FAILED };
  }
}
