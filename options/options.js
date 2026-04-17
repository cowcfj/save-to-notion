/* global chrome */
import { UIManager } from './UIManager.js';
import { AuthManager } from './AuthManager.js';
import { DataSourceManager } from './DataSourceManager.js';
import { StorageManager } from './StorageManager.js';
import { MigrationTool } from './MigrationTool.js';
import { AuthMode } from '../scripts/config/api.js';
import { BUILD_ENV } from '../scripts/config/env.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../scripts/config/messages.js';
import { UI_ICONS } from '../scripts/config/icons.js';
import { RUNTIME_ACTIONS } from '../scripts/config/runtimeActions.js';
import { injectIcons } from '../scripts/utils/uiUtils.js';
import Logger from '../scripts/utils/Logger.js';

import { sanitizeApiError, validateLogExportData } from '../scripts/utils/securityUtils.js';
import { ErrorHandler, ErrorTypes } from '../scripts/utils/ErrorHandler.js';
import { DATA_SOURCE_KEYS } from '../scripts/config/storageKeys.js';
import { getAccountProfile, clearAccountSession } from '../scripts/auth/accountSession.js';

const UI_CLASS_STATUS_MSG = 'status-message';

/**
 * Options Page Main Controller
 * 負責協調各个模組，處理全域事件與設置保存
 */
export function initOptions() {
  // 1. 初始化各管理器
  injectIcons(UI_ICONS); // Inject SVG sprites (Shared System)
  const ui = new UIManager();

  const auth = new AuthManager(ui);
  const dataSource = new DataSourceManager(ui, async () => {
    const activeAuth = await AuthManager.getActiveNotionToken();
    if (activeAuth?.token) {
      return activeAuth.token;
    }
    return document.querySelector('#api-key')?.value || '';
  });
  const storage = new StorageManager(ui);
  const migration = new MigrationTool(ui);

  // 2. 注入依賴並啟動
  ui.init();

  // OAuth 功能開關：OSS 版本隱藏 OAuth UI
  if (!BUILD_ENV.ENABLE_OAUTH) {
    const oauthConnectBtn = document.querySelector('#oauth-connect-button');
    const oauthDisconnectBtn = document.querySelector('#oauth-disconnect-button');
    if (oauthConnectBtn) {
      oauthConnectBtn.style.display = 'none';
    }
    if (oauthDisconnectBtn) {
      oauthDisconnectBtn.style.display = 'none';
    }
  }

  // AuthManager 需要 DataSourceManager 來載入資料來源列表
  auth.init({
    loadDataSources: dataSource.loadDataSources.bind(dataSource),
  });

  dataSource.init();
  storage.init();
  migration.init();

  // 3. 初始狀態檢查
  auth.checkAuthStatus();

  // 4. 全域事件監聽：OAuth 回調
  chrome.runtime.onMessage.addListener(request => {
    switch (request.action) {
      case RUNTIME_ACTIONS.OAUTH_SUCCESS: {
        auth.checkAuthStatus();
        ui.showStatus(UI_MESSAGES.AUTH.NOTIFY_SUCCESS, 'success');
        break;
      }
      case RUNTIME_ACTIONS.OAUTH_FAILED: {
        ui.showStatus(UI_MESSAGES.AUTH.NOTIFY_ERROR, 'error');
        break;
      }
      case RUNTIME_ACTIONS.ACCOUNT_SESSION_UPDATED:
      case RUNTIME_ACTIONS.ACCOUNT_SESSION_CLEARED: {
        // account session 已更新或清除，重新讀取 profile 刷新 UI
        renderAccountUI().catch(() => {});
        break;
      }
      default: {
        break;
      }
    }
  });

  // 4.1 初始化 account UI（與 Notion OAuth UI 完整分開）
  initAccountUI();

  // 5. 全域事件監聽：儲存使用量更新 (由 MigrationTool 觸發)
  document.addEventListener('storageUsageUpdate', () => {
    storage.updateStorageUsage();
  });

  // 6. 保存設置邏輯
  const saveButton = document.querySelector('#save-button');
  if (saveButton) {
    saveButton.addEventListener('click', () => saveSettings(ui, auth, 'status'));
  }

  const saveTemplatesButton = document.querySelector('#save-templates-button');
  if (saveTemplatesButton) {
    saveTemplatesButton.addEventListener('click', () => saveSettings(ui, auth, 'template-status'));
  }

  // 7. 標題模板預覽邏輯
  setupTemplatePreview();

  // 8. 側邊欄導航邏輯
  setupSidebarNavigation();

  // 9. 顯示動態版本號
  displayAppVersion();

  // 10. 設置日誌導出
  setupLogExport();

  // 11. 初始化介面縮放
  const zoomSelect = document.querySelector('#ui-zoom-level');
  if (zoomSelect) {
    // 讀取設定
    chrome.storage.sync.get(['uiZoomLevel'], result => {
      const zoom = String(result.uiZoomLevel || '1');
      document.body.style.zoom = zoom;
      zoomSelect.value = zoom;
    });

    // 即時預覽
    zoomSelect.addEventListener('change', () => {
      document.body.style.zoom = zoomSelect.value;
    });
  }

  // 12. 初始化 Notion 同步樣式選單
  const highlightContentStyleSelect = document.querySelector('#highlight-content-style');
  if (highlightContentStyleSelect) {
    chrome.storage.sync.get({ highlightContentStyle: 'COLOR_SYNC' }, result => {
      highlightContentStyleSelect.value = result.highlightContentStyle;
    });
  }
}

document.addEventListener('DOMContentLoaded', initOptions);

// =============================================================================
// Account UI（Cloudflare-native Google 帳號）
// 與既有 Notion OAuth UI 完整分開，禁止共用 DOM 或 storage
// =============================================================================

/**
 * 根據 storage 中的 account profile 更新 account card UI。
 * 可被 accounts_session_updated 、accounts_session_cleared 訊息以及 initAccountUI 呼叫。
 *
 * @returns {Promise<void>}
 */
async function renderAccountUI() {
  const profile = await getAccountProfile();

  const loggedOutEl = document.querySelector('#account-logged-out');
  const loggedInEl = document.querySelector('#account-logged-in');
  const accountInfoEl = document.querySelector('#account-info');

  if (profile) {
    // 已登入狀態
    if (loggedOutEl) {
      loggedOutEl.style.display = 'none';
    }
    if (loggedInEl) {
      loggedInEl.style.display = '';
    }
    if (accountInfoEl) {
      const name = profile.displayName ?? profile.email;
      accountInfoEl.textContent = `已登入：${name}`;
    }
  } else {
    // 未登入狀態
    if (loggedOutEl) {
      loggedOutEl.style.display = '';
    }
    if (loggedInEl) {
      loggedInEl.style.display = 'none';
    }
    if (accountInfoEl) {
      accountInfoEl.textContent = '';
    }
  }
}

/**
 * 初始化 account UI。
 *
 * - 若 BUILD_ENV.ENABLE_ACCOUNT === false，閱藏整個 account card
 * - 設置登入 / 登出按鈕的事件監聽
 * - 讀取目前登入狀態並更新 UI
 */
function initAccountUI() {
  const accountCard = document.querySelector('#account-card');
  if (!accountCard) {
    return;
  }

  // feature flag 檢查
  if (!BUILD_ENV.ENABLE_ACCOUNT) {
    accountCard.style.display = 'none';
    return;
  }

  // 顯示 account card
  accountCard.style.display = '';

  // 登入按鈕：開新 tab 到 /v1/account/google/start?ext_id=<chrome.runtime.id>
  const loginBtn = document.querySelector('#account-login-button');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const extId = chrome.runtime.id;
      const baseUrl = BUILD_ENV.OAUTH_SERVER_URL;
      const startUrl = `${baseUrl}/v1/account/google/start?ext_id=${extId}`;
      chrome.tabs.create({ url: startUrl });
    });
  }

  // 登出按鈕：local-only clear
  const logoutBtn = document.querySelector('#account-logout-button');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const statusEl = document.querySelector('#account-status');
      try {
        await clearAccountSession();
        chrome.runtime
          .sendMessage({
            action: RUNTIME_ACTIONS.ACCOUNT_SESSION_CLEARED,
          })
          .catch(() => {});
        await renderAccountUI();
        if (statusEl) {
          statusEl.textContent = '已成功登出';
          statusEl.className = `${UI_CLASS_STATUS_MSG} success`;
          setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = UI_CLASS_STATUS_MSG;
          }, 3000);
        }
      } catch (error) {
        Logger.error('Account logout failed', { error });
        if (statusEl) {
          statusEl.textContent = '登出失敗，請重試';
          statusEl.className = `${UI_CLASS_STATUS_MSG} error`;
        }
      }
    });
  }

  // 讀取目前登入狀態
  renderAccountUI().catch(() => {});
}

/**
 * 設置側邊欄導航
 */
function setupSidebarNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.settings-section');

  if (navItems.length === 0 || sections.length === 0) {
    Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_MISSING_ITEMS, {
      action: 'setupSidebarNavigation',
      reason: 'missing_dom_elements',
    });
    return;
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionName = item.dataset.section;
      if (!sectionName) {
        Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_MISSING_ATTR, {
          action: 'setupSidebarNavigation',
          tagName: item.tagName,
          targetId: item.id || null,
          sectionName: item.dataset?.section || null,
        });
        return;
      }

      const targetSectionId = `section-${sectionName}`;
      // 驗證目標區塊是否存在
      const targetExists = Array.from(sections).some(section => section.id === targetSectionId);

      if (!targetExists) {
        Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_TARGET_NOT_FOUND, {
          action: 'setupSidebarNavigation',
          targetId: targetSectionId,
        });
        return;
      }

      // 1. 更新當前導航項目
      navItems.forEach(nav => {
        nav.classList.remove('active');
        nav.setAttribute('aria-selected', 'false');
      });
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');

      // 2. 顯示目標區塊
      sections.forEach(section => {
        if (section.id === targetSectionId) {
          section.classList.add('active');
          section.setAttribute('aria-hidden', 'false');
        } else {
          section.classList.remove('active');
          section.setAttribute('aria-hidden', 'true');
        }
      });
    });
  });
}

/**
 * 清理並標準化 Database/Page ID
 * - 移除 URL 前綴和查詢參數
 * - 移除連字符
 * - 提取純 32 字符的 ID
 *
 * @param {string} input - 使用者輸入的 ID 或 URL
 * @returns {string} 清理後的 ID，格式無效時返回空字符串
 */
export function cleanDatabaseId(input) {
  if (!input) {
    return '';
  }

  let cleaned = input.trim();

  // 如果是完整 URL，提取 ID 部分
  // 例如: https://www.notion.so/workspace/a1b2c3d4e5f67890abcdef1234567890?v=123
  // 使用非正則方式解析以徹底消除 ESLint 的所有正則相關警告 (Unsafe/Optimization)

  // Notion ID 可能是 32 位純字串或 36 位帶橫線的 UUID
  // 我們從路徑中尋找長度匹配的片段
  const pathParts = cleaned.split(/[#?]/)[0].split('/');
  const lastPathPart = pathParts.at(-1);

  if (lastPathPart && (lastPathPart.length === 36 || lastPathPart.length === 32)) {
    cleaned = lastPathPart;
  }

  // 移除所有連字符
  cleaned = cleaned.replaceAll('-', '');

  // 驗證格式：應該是 32 字符的十六進制字符串
  if (!/^[\da-f]{32}$/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * 保存設置
 *
 * @param {UIManager} ui
 * @param {AuthManager} auth
 * @param {string} [statusId='status']
 */
export async function saveSettings(ui, auth, statusId = 'status') {
  const apiKey = document.querySelector('#api-key').value.trim();
  const rawDatabaseId = document.querySelector('#database-id').value;
  const titleTemplate = document.querySelector('#title-template').value;
  const addSource = document.querySelector('#add-source').checked;
  const addTimestamp = document.querySelector('#add-timestamp').checked;
  const typeInput = document.querySelector('#database-type');
  const uiZoomLevel = document.querySelector('#ui-zoom-level')?.value;

  // 驗證 API Key，但如果是在 OAuth 模式下就忽略 API Key 檢查
  if (!apiKey && auth.currentAuthMode !== AuthMode.OAUTH) {
    ui.showStatus(UI_MESSAGES.SETTINGS.KEY_INPUT_REQUIRED, 'error', statusId);
    return;
  }

  // 清理並驗證 Database ID
  const databaseId = cleanDatabaseId(rawDatabaseId);
  if (!databaseId) {
    ui.showStatus(UI_MESSAGES.SETTINGS.INVALID_ID, 'error', statusId);
    return;
  }

  // 從集中配置取得 storage key 名稱
  const [dataSourceIdKey, databaseIdKey, dataSourceTypeKey] = DATA_SOURCE_KEYS;

  // 構建完整的設置對象
  const localSettings = {
    // 為了兼容性，同時保存兩種 ID 格式
    // notionDatabaseId 是舊版 (僅支援 Database)
    // notionDataSourceId 是新版 (支援 Page 和 Database)
    [databaseIdKey]: databaseId,
    [dataSourceIdKey]: databaseId, // 統一存到兩個欄位，確保兼容
  };

  const syncSettings = {
    notionApiKey: apiKey,
    titleTemplate,
    addSource,
    addTimestamp,
    uiZoomLevel: uiZoomLevel || '1',
  };

  // 如果類型欄位存在，一併保存並驗證
  const allowedDataSourceTypes = ['database', 'page'];
  const rawDataSourceType = typeInput?.value;
  localSettings[dataSourceTypeKey] = allowedDataSourceTypes.includes(rawDataSourceType)
    ? rawDataSourceType
    : 'database';

  // 保存標註樣式
  const highlightStyle = document.querySelector('#highlight-style');
  if (highlightStyle) {
    syncSettings.highlightStyle = highlightStyle.value;
  }

  // 保存 Notion 同步樣式
  const highlightContentStyle = document.querySelector('#highlight-content-style');
  if (highlightContentStyle) {
    syncSettings.highlightContentStyle = highlightContentStyle.value;
  }

  // 分離儲存至 local 與 sync（同時清除 sync 中的舊資料來源 key，防止跨裝置同步汙染）
  try {
    await Promise.all([
      chrome.storage.local.set(localSettings),
      chrome.storage.sync.set(syncSettings),
      chrome.storage.sync.remove(DATA_SOURCE_KEYS),
    ]);

    ui.showStatus(UI_MESSAGES.SETTINGS.SAVE_SUCCESS, 'success', statusId);

    // 刷新認證狀態以更新 UI
    auth.checkAuthStatus();
  } catch (error) {
    const safeMessage = sanitizeApiError(error, 'save_settings');
    const errorMessage =
      typeof safeMessage === 'string' ? safeMessage : JSON.stringify(safeMessage);
    const safeError = safeMessage instanceof Error ? safeMessage : new Error(errorMessage);
    ErrorHandler.logError({
      type: ErrorTypes.STORAGE,
      context: 'save_settings',
      originalError: safeError,
    });

    ui.showStatus(UI_MESSAGES.SETTINGS.SAVE_FAILED, 'error', statusId);
  }
}

/**
 * 設置標題模板預覽功能
 */
export function setupTemplatePreview() {
  const previewButton = document.querySelector('#preview-template');
  const templateInput = document.querySelector('#title-template');
  const previewDiv = document.querySelector('#template-preview');

  if (previewButton && templateInput && previewDiv) {
    previewButton.addEventListener('click', () => {
      const template = templateInput.value;
      const now = new Date();

      const variables = {
        title: '範例網頁標題 - Notion Clipper',
        date: now.toLocaleDateString('zh-TW'),
        time: now.toLocaleTimeString('zh-TW'),
        datetime: now.toLocaleString('zh-TW'),
        url: 'https://example.com/article',
        domain: 'example.com',
      };

      const preview = formatTitle(template, variables);

      // 安全地構建 DOM 以防止 XSS
      previewDiv.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = '預覽結果：';
      const br = document.createElement('br');
      const previewText = document.createTextNode(preview);

      previewDiv.append(strong);
      previewDiv.append(br);
      previewDiv.append(previewText);
      previewDiv.classList.remove('hidden');
    });
  }
}

/**
 * 格式化標題
 *
 * @param {string} template
 * @param {object} variables
 * @returns {string} 格式化後的標題
 */
export function formatTitle(template, variables) {
  return template.replaceAll(/{(\w+)}/g, (match, key) => {
    return variables[key] || match;
  });
}

/**
 * 動態顯示應用程式版本號
 * 從 manifest.json 讀取版本號並顯示到側邊欄底部
 */
function displayAppVersion() {
  const versionElement = document.querySelector('#app-version');
  if (!versionElement) {
    return;
  }

  try {
    const manifest = chrome.runtime.getManifest();
    versionElement.textContent = `v${manifest.version}`;
  } catch (error) {
    // 如果無法獲取版本號，保持元素隱藏
    Logger.warn(ERROR_MESSAGES.TECHNICAL.GET_VERSION_FAILED, {
      action: 'displayAppVersion',
      error,
    });
  }
}

/**
 * 設置日誌導出
 */
function setupLogExport() {
  const exportBtn = document.querySelector('#export-logs-button');
  const statusEl = document.querySelector('#export-status');

  if (exportBtn && statusEl) {
    exportBtn.addEventListener('click', async () => {
      try {
        exportBtn.disabled = true;

        // 發送訊息給 Background
        const response = await chrome.runtime.sendMessage({
          action: RUNTIME_ACTIONS.EXPORT_DEBUG_LOGS,
          format: 'json',
        });

        if (!response) {
          throw new Error(ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE);
        }

        // 檢查 error 屬性 (優先處理明確的錯誤訊息)
        if (response.error) {
          throw new Error(response.error);
        }

        // 檢查 success 欄位
        if (!response.success) {
          throw new Error(ERROR_MESSAGES.TECHNICAL.LOG_EXPORT_FAILED);
        }

        // 審核要求：驗證外部輸入 (Security-First Input Validation)
        const data = response.data;

        // 使用 securityUtils 中的集中驗證邏輯
        validateLogExportData(data);

        const { filename, content, mimeType, count } = data;

        // 觸發下載
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.append(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);

        statusEl.textContent = UI_MESSAGES.LOGS.EXPORT_SUCCESS(count);
        statusEl.className = `${UI_CLASS_STATUS_MSG} success`;

        // 3秒後清除成功訊息
        setTimeout(() => {
          statusEl.textContent = '';
          statusEl.className = UI_CLASS_STATUS_MSG;
        }, 3000);
      } catch (error) {
        Logger.error('Log export failed', {
          action: 'setupLogExport',
          error: error.message || error,
          stack: error.stack,
        });

        // 使用標準化的錯誤處理機制
        const safeReason = sanitizeApiError(error, 'export_debug_logs');
        const userFriendlyMsg = ErrorHandler.formatUserMessage(safeReason);

        // 組合最終訊息
        const errorMessage = `${UI_MESSAGES.LOGS.EXPORT_FAILED_PREFIX}${userFriendlyMsg}`;

        statusEl.textContent = errorMessage;
        statusEl.className = `${UI_CLASS_STATUS_MSG} error`;

        // 5秒後清除錯誤訊息（給用戶更多時間閱讀）
        setTimeout(() => {
          statusEl.textContent = '';
          statusEl.className = UI_CLASS_STATUS_MSG;
        }, 5000);
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
}
