/* global chrome */
import { UIManager } from '../scripts/options/UIManager.js';
import { AuthManager } from '../scripts/options/AuthManager.js';
import { DataSourceManager } from '../scripts/options/DataSourceManager.js';
import { StorageManager } from '../scripts/options/StorageManager.js';
import { MigrationTool } from '../scripts/options/MigrationTool.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../scripts/config/messages.js';
import { escapeHtml } from '../scripts/utils/securityUtils.js';
import Logger from '../scripts/utils/Logger.js';

/**
 * Options Page Main Controller
 * 負責協調各个模組，處理全域事件與設置保存
 */
export function initOptions() {
  // 1. 初始化各管理器
  const ui = new UIManager();
  const auth = new AuthManager(ui);
  const dataSource = new DataSourceManager(ui);
  const storage = new StorageManager(ui);
  const migration = new MigrationTool(ui);

  // 2. 注入依賴並啟動
  ui.init();

  // AuthManager 需要 DataSourceManager 來載入資料庫列表
  auth.init({
    loadDatabases: dataSource.loadDatabases.bind(dataSource),
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
      ui.showStatus('Notion 連接成功！', 'success');
    } else if (request.action === 'oauth_failed') {
      ui.showStatus('Notion 連接失敗，請重試。', 'error');
    }
  });

  // 5. 全域事件監聽：儲存使用量更新 (由 MigrationTool 觸發)
  document.addEventListener('storageUsageUpdate', () => {
    storage.updateStorageUsage();
  });

  // 6. 保存設置邏輯
  const saveButton = document.getElementById('save-button');
  if (saveButton) {
    saveButton.addEventListener('click', () => saveSettings(ui, auth, 'status'));
  }

  const saveTemplatesButton = document.getElementById('save-templates-button');
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
  const urlMatch = cleaned.match(
    /([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
  );
  if (urlMatch) {
    cleaned = urlMatch[0];
  }

  // 移除所有連字符
  cleaned = cleaned.replace(/-/g, '');

  // 驗證格式：應該是 32 字符的十六進制字符串
  if (!/^[a-f0-9]{32}$/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * 保存設置
 * @param {UIManager} ui
 * @param {AuthManager} auth
 * @param {string} [statusId='status']
 */
export function saveSettings(ui, auth, statusId = 'status') {
  const apiKey = document.getElementById('api-key').value.trim();
  const rawDatabaseId = document.getElementById('database-id').value;
  const titleTemplate = document.getElementById('title-template').value;
  const addSource = document.getElementById('add-source').checked;
  const addTimestamp = document.getElementById('add-timestamp').checked;
  const typeInput = document.getElementById('database-type');

  // 驗證
  if (!apiKey) {
    ui.showStatus(UI_MESSAGES.SETTINGS.MISSING_API_KEY, 'error', statusId);
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
  const highlightStyle = document.getElementById('highlight-style');
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
  const previewButton = document.getElementById('preview-template');
  const templateInput = document.getElementById('title-template');
  const previewDiv = document.getElementById('template-preview');

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

      previewDiv.appendChild(strong);
      previewDiv.appendChild(br);
      previewDiv.appendChild(previewText);
      previewDiv.classList.remove('hidden');
    });
  }
}

/**
 * 格式化標題
 * @param {string} template
 * @param {Object} variables
 */
export function formatTitle(template, variables) {
  return template.replace(/{(\w+)}/g, (match, key) => {
    return variables[key] || match;
  });
}

/**
 * 動態顯示應用程式版本號
 * 從 manifest.json 讀取版本號並顯示到側邊欄底部
 */
function displayAppVersion() {
  const versionElement = document.getElementById('app-version');
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
  const exportBtn = document.getElementById('export-logs-button');
  const statusEl = document.getElementById('export-status');

  if (exportBtn && statusEl) {
    exportBtn.addEventListener('click', async () => {
      let originalBtnHTML = null;
      try {
        exportBtn.disabled = true;
        originalBtnHTML = exportBtn.innerHTML; // 保存原始按鈕內容
        exportBtn.textContent = '導出中...';

        // 發送訊息給 Background
        const response = await chrome.runtime.sendMessage({
          action: 'exportDebugLogs',
          format: 'json',
        });

        if (!response) {
          throw new Error('未收到 Background 回應');
        }

        // 檢查 error 屬性 (優先處理明確的錯誤訊息)
        if (response.error) {
          throw new Error(response.error);
        }

        // 檢查 success 欄位
        if (!response.success) {
          throw new Error('日誌導出失敗');
        }

        const { filename, content, mimeType, count } = response.data;

        // 觸發下載
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(url), 100);

        statusEl.innerHTML = UI_MESSAGES.LOGS.EXPORT_SUCCESS(count);
        statusEl.className = 'status-message success';

        // 3秒後清除成功訊息
        setTimeout(() => {
          statusEl.innerHTML = '';
          statusEl.className = 'status-message';
        }, 3000);
      } catch (err) {
        Logger.error('Log export failed', err);
        // 顯示具體錯誤訊息（如果有的話），否則顯示通用錯誤
        // [Security] 轉義動態錯誤訊息以防止 XSS
        const safeErrorMessage = escapeHtml(err.message);
        const errorMessage = UI_MESSAGES.LOGS.EXPORT_FAILED(safeErrorMessage);
        statusEl.innerHTML = errorMessage;
        statusEl.className = 'status-message error';

        // 5秒後清除錯誤訊息（給用戶更多時間閱讀）
        setTimeout(() => {
          statusEl.innerHTML = '';
          statusEl.className = 'status-message';
        }, 5000);
      } finally {
        exportBtn.disabled = false;
        // 恢復按鈕內容
        if (originalBtnHTML !== null) {
          exportBtn.innerHTML = originalBtnHTML;
        }
      }
    });
  }
}
