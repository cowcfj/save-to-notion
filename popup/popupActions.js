/**
 * Popup Actions 業務邏輯模組
 *
 * 封裝所有 Chrome API 調用，便於 Mock 和測試。
 */

/* global chrome */

import { isValidNotionUrl, sanitizeUrlForLogging } from '../scripts/utils/securityUtils.js';
import Logger from '../scripts/utils/Logger.js';
import { AuthMode } from '../scripts/config/api.js';
import { RUNTIME_ACTIONS } from '../scripts/config/runtimeActions.js';
import { ERROR_MESSAGES } from '../scripts/config/messages.js';
import { migrateDataSourceKeys } from '../scripts/utils/notionAuth.js';

/**
 * 檢查設置是否完整
 *
 * @returns {Promise<{valid: boolean, apiKey?: string, dataSourceId?: string}>}
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

    await migrateDataSourceKeys({
      localData: localResult,
      syncData: syncResult,
      storageArea: chrome.storage.local,
      logger: Logger,
      action: 'checkSettings',
      retryContext: 'popup',
    });

    return {
      valid: Boolean((syncResult.notionApiKey || isOAuth) && dataSourceId),
      apiKey: syncResult.notionApiKey,
      dataSourceId,
    };
  } catch (error) {
    Logger.warn('Failed to check settings:', error);
    return { valid: false };
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
 * @returns {Promise<object>} 保存結果，成功時包含 canonical save status 欄位
 */
export async function savePage() {
  try {
    const response = await chrome.runtime.sendMessage({ action: RUNTIME_ACTIONS.SAVE_PAGE });
    return response || { success: false, error: ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE };
  } catch (error) {
    Logger.warn('savePage failed:', error);
    return { success: false, error: '無法儲存頁面，請稍後再試' };
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
