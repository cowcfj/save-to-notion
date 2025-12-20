/* global chrome */
import { UIManager } from '../scripts/options/UIManager.js';
import { AuthManager } from '../scripts/options/AuthManager.js';
import { DataSourceManager } from '../scripts/options/DataSourceManager.js';
import { StorageManager } from '../scripts/options/StorageManager.js';
import { MigrationTool } from '../scripts/options/MigrationTool.js';

/**
 * Options Page Main Controller
 * 負責協調各个模組，處理全域事件與設置保存
 */
document.addEventListener('DOMContentLoaded', () => {
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
  chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
    if (request.action === 'oauth_success') {
      auth.checkAuthStatus();
      ui.showStatus('✅ Notion 連接成功！', 'success');
    } else if (request.action === 'oauth_failed') {
      ui.showStatus('❌ Notion 連接失敗，請重試。', 'error');
    }
  });

  // 5. 全域事件監聽：儲存使用量更新 (由 MigrationTool 觸發)
  document.addEventListener('storageUsageUpdate', () => {
    storage.updateStorageUsage();
  });

  // 6. 保存設置邏輯
  const saveButton = document.getElementById('save-button');
  if (saveButton) {
    saveButton.addEventListener('click', () => saveSettings(ui, auth));
  }

  // 7. 標題模板預覽邏輯
  setupTemplatePreview();
});

/**
 * 保存設置
 * @param {UIManager} ui
 * @param {AuthManager} auth
 */
export function saveSettings(ui, auth) {
  const apiKey = document.getElementById('api-key').value.trim();
  const databaseId = document.getElementById('database-id').value.trim();
  const titleTemplate = document.getElementById('title-template').value;
  const addSource = document.getElementById('add-source').checked;
  const addTimestamp = document.getElementById('add-timestamp').checked;
  const typeInput = document.getElementById('database-type');

  // 驗證
  if (!apiKey) {
    ui.showStatus('請輸入 API Key', 'error');
    return;
  }

  if (!databaseId) {
    ui.showStatus('請選擇或輸入資料來源 ID', 'error');
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

  // 單次原子操作保存所有設置
  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      ui.showStatus(`保存失敗: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      ui.showStatus('✅ 設置已成功保存！', 'success');

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

      previewDiv.innerHTML = `
                <strong>預覽結果：</strong><br>
                ${preview}
            `;
      previewDiv.style.display = 'block';
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
