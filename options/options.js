/* global chrome */
import { UIManager } from '../scripts/options/UIManager.js';
import { AuthManager } from '../scripts/options/AuthManager.js';
import { DataSourceManager } from '../scripts/options/DataSourceManager.js';
import { StorageManager } from '../scripts/options/StorageManager.js';
import { MigrationTool } from '../scripts/options/MigrationTool.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../scripts/config/messages.js';
import { UI_ICONS } from '../scripts/config/icons.js';
import { injectIcons } from '../scripts/utils/uiUtils.js';
import Logger from '../scripts/utils/Logger.js';

import { sanitizeApiError, validateLogExportData } from '../scripts/utils/securityUtils.js';
import { ErrorHandler } from '../scripts/utils/ErrorHandler.js';

/**
 * Options Page Main Controller
 * 負責協調各个模組，處理全域事件與設置保存
 */
export function initOptions() {
  // 1. 初始化各管理器
  injectIcons(UI_ICONS); // Inject SVG sprites (Shared System)
  const ui = new UIManager();

  const auth = new AuthManager(ui);
  const dataSource = new DataSourceManager(ui);
  const storage = new StorageManager(ui);
  const migration = new MigrationTool(ui);

  // 2. 注入依賴並啟動
  ui.init();

  // AuthManager 需要 DataSourceManager 來載入資料庫列表
  auth.init({
    loadDatabases: dataSource.loadDataSources.bind(dataSource),
  });

  dataSource.init();
  storage.init();
  migration.init();

  // 3. 初始狀態檢查
  auth.checkAuthStatus();

  // 4. 全域事件監聽：OAuth 回調
  chrome.runtime.onMessage.addListener(request => {
    if (request.action === 'oauth_success') {
      auth.checkAuthStatus();
      ui.showStatus(UI_MESSAGES.AUTH.NOTIFY_SUCCESS, 'success');
    } else if (request.action === 'oauth_failed') {
      ui.showStatus(UI_MESSAGES.AUTH.NOTIFY_ERROR, 'error');
    }
  });

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
}

document.addEventListener('DOMContentLoaded', initOptions);

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
          element: item,
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
export function saveSettings(ui, auth, statusId = 'status') {
  const apiKey = document.querySelector('#api-key').value.trim();
  const rawDatabaseId = document.querySelector('#database-id').value;
  const titleTemplate = document.querySelector('#title-template').value;
  const addSource = document.querySelector('#add-source').checked;
  const addTimestamp = document.querySelector('#add-timestamp').checked;
  const typeInput = document.querySelector('#database-type');

  // 驗證
  if (!apiKey) {
    ui.showStatus(UI_MESSAGES.SETTINGS.KEY_INPUT_REQUIRED, 'error', statusId);
    return;
  }

  // 清理並驗證 Database ID
  const databaseId = cleanDatabaseId(rawDatabaseId);
  if (!databaseId) {
    ui.showStatus(UI_MESSAGES.SETTINGS.INVALID_ID, 'error', statusId);
    return;
  }

  // 構建完整的設置對象
  const settings = {
    notionApiKey: apiKey,

    // 為了兼容性，同時保存兩種 ID 格式
    // notionDatabaseId 是舊版 (僅支援 Database)
    // notionDataSourceId 是新版 (支援 Page 和 Database)
    notionDatabaseId: databaseId,
    notionDataSourceId: databaseId, // 統一存到兩個欄位，確保兼容

    titleTemplate,
    addSource,
    addTimestamp,
  };

  // 如果類型欄位存在，一併保存
  if (typeInput?.value) {
    settings.notionDataSourceType = typeInput.value;
  }

  // 保存標註樣式
  const highlightStyle = document.querySelector('#highlight-style');
  if (highlightStyle) {
    settings.highlightStyle = highlightStyle.value;
  }

  // 單次原子操作保存所有設置
  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      Logger.error('Settings save failed:', chrome.runtime.lastError);
      ui.showStatus(UI_MESSAGES.SETTINGS.SAVE_FAILED, 'error', statusId);
    } else {
      ui.showStatus(UI_MESSAGES.SETTINGS.SAVE_SUCCESS, 'success', statusId);

      // 刷新認證狀態以更新 UI
      auth.checkAuthStatus();
    }
  });
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
          action: 'exportDebugLogs',
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
        statusEl.className = 'status-message success';

        // 3秒後清除成功訊息
        setTimeout(() => {
          statusEl.textContent = '';
          statusEl.className = 'status-message';
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
        statusEl.className = 'status-message error';

        // 5秒後清除錯誤訊息（給用戶更多時間閱讀）
        setTimeout(() => {
          statusEl.textContent = '';
          statusEl.className = 'status-message';
        }, 5000);
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
}
