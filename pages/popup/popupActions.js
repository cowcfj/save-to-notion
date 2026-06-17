/**
 * Popup Actions 業務邏輯模組
 *
 * 封裝所有 Chrome API 調用，便於 Mock 和測試。
 */

/* global chrome */

import { isValidNotionUrl } from '../../scripts/utils/securityUtils.js';
import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';
import { sanitizeUrlForLogging } from '../../scripts/utils/LogSanitizer.js';
import Logger from '../../scripts/utils/Logger.js';
import { AuthMode } from '../../scripts/config/extension/authMode.js';
import { BUILD_ENV } from '../../scripts/config/env/index.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { getAccountAccessToken, getAccountProfile } from '../../scripts/auth/accountSession.js';
import { getOptionsAdvancedUrl } from '../../scripts/auth/accountLogin.js';
export { startAccountLogin } from '../../scripts/auth/accountLoginInitiator.js';
import { migrateDataSourceKeys } from '../../scripts/utils/notionAuth.js';
import {
  AccountGatedDestinationEntitlementProvider,
  LocalDestinationProfileRepository,
} from '../../scripts/destinations/ProfileStore.js';
import { ProfileManager } from '../../scripts/destinations/ProfileManager.js';

const POPUP_TEMP_PROFILE_SESSION_KEY = 'popupTempDestinationProfileId';

function getPopupSessionStorage() {
  return globalThis.chrome?.storage?.session || null;
}

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
    const { syncResult, localResult } = await readSettingsStorage();
    const authState = resolveSettingsAuthState(syncResult, localResult);
    const dataSourceId = await resolveSettingsDataSourceId(syncResult, localResult);

    await migratePopupDataSourceKeys(syncResult, localResult);

    return buildSettingsCheckResult({
      syncResult,
      dataSourceId,
      authState,
    });
  } catch (error) {
    Logger.warn('Failed to check settings:', error);
    return { valid: false, missingReason: 'unknown' };
  }
}

/**
 * 讀取設置存儲
 *
 * @returns {Promise<{syncResult: object, localResult: object}>}
 */
async function readSettingsStorage() {
  const [syncResult, localResult] = await Promise.all([
    chrome.storage.sync.get(['notionApiKey', 'notionDataSourceId', 'notionDatabaseId']),
    chrome.storage.local.get([
      'notionAuthMode',
      'notionOAuthToken',
      'notionDataSourceId',
      'notionDatabaseId',
    ]),
  ]);
  return { syncResult, localResult };
}

/**
 * 解析設置授權狀態
 *
 * @param {object} syncResult - 同步存儲讀取結果
 * @param {object} localResult - 本地存儲讀取結果
 * @returns {{isOAuth: boolean, hasManualApiKey: boolean, hasAuth: boolean}}
 */
function resolveSettingsAuthState(syncResult, localResult) {
  const isOAuth = Boolean(
    localResult.notionAuthMode === AuthMode.OAUTH && localResult.notionOAuthToken
  );
  const hasManualApiKey = Boolean(syncResult.notionApiKey);
  const hasAuth = Boolean(hasManualApiKey || isOAuth);
  return { isOAuth, hasManualApiKey, hasAuth };
}

/**
 * 解析設置中的數據源 ID
 *
 * @param {object} syncResult - 同步存儲讀取結果
 * @param {object} localResult - 本地存儲讀取結果
 * @returns {Promise<string|null>}
 */
async function resolveSettingsDataSourceId(syncResult, localResult) {
  const activeProfileDataSourceId = await resolveActiveProfileDataSourceId();
  const legacyDataSourceId = resolveLegacyDataSourceId(syncResult, localResult);
  return activeProfileDataSourceId || legacyDataSourceId;
}

/**
 * 解析當前活動配置文件的數據源 ID
 *
 * @returns {Promise<string|null>}
 */
async function resolveActiveProfileDataSourceId() {
  try {
    const service = new ProfileManager({ repository: new LocalDestinationProfileRepository() });
    const activeProfile = await service.getActiveProfile();
    return activeProfile?.notionDataSourceId || null;
  } catch (error) {
    Logger.warn('checkSettings: failed to resolve active profile', {
      action: 'checkSettings',
      error: sanitizeApiError(error, 'checkSettings.getActiveProfile'),
    });
    return null;
  }
}

/**
 * 解析舊版數據源 ID
 *
 * @param {object} syncResult - 同步存儲讀取結果
 * @param {object} localResult - 本地存儲讀取結果
 * @returns {string|null}
 */
function resolveLegacyDataSourceId(syncResult, localResult) {
  return (
    localResult.notionDataSourceId ||
    localResult.notionDatabaseId ||
    syncResult.notionDataSourceId ||
    syncResult.notionDatabaseId ||
    null
  );
}

/**
 * 遷移彈出窗口數據源密鑰
 *
 * @param {object} syncResult - 同步存儲讀取結果
 * @param {object} localResult - 本地存儲讀取結果
 * @returns {Promise<void>}
 */
async function migratePopupDataSourceKeys(syncResult, localResult) {
  await migrateDataSourceKeys({
    localData: localResult,
    syncData: syncResult,
    storageArea: chrome.storage.local,
    logger: Logger,
    action: 'checkSettings',
    retryContext: 'popup',
  });
}

/**
 * 構建設置檢查結果
 *
 * @param {object} params - 參數對象
 * @param {object} params.syncResult - 同步結果
 * @param {string|null} params.dataSourceId - 數據源 ID
 * @param {object} params.authState - 授權狀態
 * @returns {object}
 */
function buildSettingsCheckResult({ syncResult, dataSourceId, authState }) {
  const { isOAuth, hasManualApiKey, hasAuth } = authState;
  const valid = Boolean(hasAuth && dataSourceId);

  let authMode = null;
  if (isOAuth) {
    authMode = AuthMode.OAUTH;
  } else if (hasManualApiKey) {
    authMode = AuthMode.MANUAL;
  }

  const missingReason = resolveMissingSettingsReason(valid, hasAuth);

  return {
    valid,
    apiKey: syncResult.notionApiKey,
    dataSourceId,
    authMode,
    hasOAuthToken: Boolean(isOAuth),
    hasManualApiKey,
    missingReason,
  };
}

/**
 * 解析缺失設置的原因
 *
 * @param {boolean} valid - 是否有效
 * @param {boolean} hasAuth - 是否有授權
 * @returns {'missing_data_source'|'missing_auth'|undefined}
 */
function resolveMissingSettingsReason(valid, hasAuth) {
  if (valid) {
    return undefined;
  }
  return hasAuth ? 'missing_data_source' : 'missing_auth';
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
    const service = createDestinationProfileService();
    const profiles = await readDestinationProfiles(service);
    const tempProfileId = await readPopupTempProfileId();
    const activeProfile = await readActiveDestinationProfile(service);
    const entitlement = await readDestinationEntitlement(service);
    const selectedProfileId = resolveSelectedDestinationProfileId({
      profiles,
      entitlement,
      tempProfileId,
      activeProfile,
    });

    return { profiles, selectedProfileId, entitlement };
  } catch (error) {
    Logger.warn({
      action: 'getDestinationState',
      operation: 'getDestinationState',
      error: sanitizeApiError(error, 'getDestinationState'),
    });
    return { profiles: [], selectedProfileId: null, entitlement: { maxProfiles: 1 } };
  }
}

/**
 * 創建目標配置文件服務
 *
 * @returns {ProfileManager}
 */
function createDestinationProfileService() {
  return new ProfileManager({
    repository: new LocalDestinationProfileRepository(),
    entitlementProvider: new AccountGatedDestinationEntitlementProvider(),
  });
}

/**
 * 記錄目標狀態警告日誌
 *
 * @param {string} operation - 操作名稱
 * @param {Error|any} error - 錯誤對象
 */
function logDestinationStateWarning(operation, error) {
  Logger.warn({
    action: 'getDestinationState',
    operation,
    error: sanitizeApiError(error, `getDestinationState.${operation}`),
  });
}

/**
 * 讀取保存目標列表
 *
 * @param {ProfileManager} service - 配置文件服務實例
 * @returns {Promise<Array<object>>}
 */
async function readDestinationProfiles(service) {
  try {
    return await service.listProfiles();
  } catch (error) {
    logDestinationStateWarning('listProfiles', error);
    return [];
  }
}

/**
 * 讀取彈出窗口臨時配置文件 ID
 *
 * @returns {Promise<string|null>}
 */
async function readPopupTempProfileId() {
  const sessionStorage = getPopupSessionStorage();
  if (typeof sessionStorage?.get !== 'function') {
    return null;
  }

  try {
    const tempResult = await sessionStorage.get(POPUP_TEMP_PROFILE_SESSION_KEY);
    return tempResult?.[POPUP_TEMP_PROFILE_SESSION_KEY] || null;
  } catch (error) {
    logDestinationStateWarning('getSessionTempProfile', error);
    return null;
  }
}

/**
 * 讀取活動目標配置文件
 *
 * @param {ProfileManager} service - 配置文件服務實例
 * @returns {Promise<object|null>}
 */
async function readActiveDestinationProfile(service) {
  try {
    return await service.getActiveProfile();
  } catch (error) {
    logDestinationStateWarning('getActiveProfile', error);
    return null;
  }
}

/**
 * 讀取目標權益資訊
 *
 * @param {ProfileManager} service - 配置文件服務實例
 * @returns {Promise<{maxProfiles: number}>}
 */
async function readDestinationEntitlement(service) {
  try {
    return await service.getDestinationEntitlement();
  } catch (error) {
    logDestinationStateWarning('getDestinationEntitlement', error);
    return { maxProfiles: 1 };
  }
}

/**
 * 解析已選擇的目標配置文件 ID
 *
 * @param {object} params - 參數對象
 * @param {Array<object>} params.profiles - 配置文件列表
 * @param {object} params.entitlement - 權益資訊
 * @param {string|null} params.tempProfileId - 臨時配置文件 ID
 * @param {object|null} params.activeProfile - 活動配置文件
 * @returns {string|null}
 */
function resolveSelectedDestinationProfileId({
  profiles,
  entitlement,
  tempProfileId,
  activeProfile,
}) {
  const allowedProfiles = profiles.slice(0, entitlement.maxProfiles);
  const tempIsValid = allowedProfiles.some(profile => profile.id === tempProfileId);
  if (tempIsValid) {
    return tempProfileId;
  }
  if (allowedProfiles.some(profile => profile.id === activeProfile?.id)) {
    return activeProfile.id;
  }
  return allowedProfiles[0]?.id ?? null;
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

/**
 * 設定 popup 臨時選擇的保存目標，存入 session storage 中。
 *
 * @param {string} profileId - 臨時選取的保存目標 ID
 * @returns {Promise<void>}
 */
export async function setPopupTempProfile(profileId) {
  const sessionStorage = getPopupSessionStorage();
  if (typeof sessionStorage?.set !== 'function') {
    return;
  }

  try {
    await sessionStorage.set({ [POPUP_TEMP_PROFILE_SESSION_KEY]: profileId });
  } catch (error) {
    Logger.warn('Failed to persist popup temp profile selection:', error);
  }
}
