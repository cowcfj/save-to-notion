/* global chrome */
import Logger from '../utils/Logger.js';
import { sanitizeApiError } from '../utils/securityUtils.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { UI_MESSAGES, UI_ICONS } from '../config/index.js';

/**
 * AuthManager.js
 * 負責 Notion 授權流程與狀態管理
 */

export class AuthManager {
  /**
   * @param {import('./UIManager.js').UIManager} uiManager
   */
  constructor(uiManager) {
    this.ui = uiManager;
    this.elements = {};
    this.dependencies = {};
  }

  /**
   * 初始化認證管理器
   *
   * @param {object} dependencies - 依賴項 { loadDatabases }
   */
  init(dependencies = {}) {
    this.dependencies = dependencies;

    // 快取 DOM 元素
    this.elements.apiKeyInput = document.querySelector('#api-key');
    this.elements.databaseIdInput = document.querySelector('#database-id');
    this.elements.oauthButton = document.querySelector('#oauth-button');
    this.elements.disconnectButton = document.querySelector('#disconnect-button');
    this.elements.testApiButton = document.querySelector('#test-api-button');
    this.elements.authStatus = document.querySelector('#auth-status');
    // 其他相關設定
    this.elements.titleTemplateInput = document.querySelector('#title-template');
    this.elements.addSourceCheckbox = document.querySelector('#add-source');
    this.elements.addTimestampCheckbox = document.querySelector('#add-timestamp');
    this.elements.highlightStyleSelect = document.querySelector('#highlight-style');
    this.elements.debugToggle = document.querySelector('#enable-debug-logs');

    // 綁定事件
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.elements.oauthButton?.addEventListener('click', () => this.startNotionSetup());
    this.elements.disconnectButton?.addEventListener('click', () => this.disconnectFromNotion());
    this.elements.testApiButton?.addEventListener('click', () => this.testApiKey());

    // API Key 輸入防抖動處理
    if (this.elements.apiKeyInput) {
      let timeout = null;
      /**
       * 處理 API Key 輸入變更（防抖動）
       */
      const handleInput = () => {
        const apiKey = this.elements.apiKeyInput.value.trim();
        if (timeout) {
          clearTimeout(timeout);
        }

        if (apiKey && apiKey.length > 20) {
          timeout = setTimeout(() => {
            this.dependencies.loadDatabases?.(apiKey);
          }, 1000);
        }
      };

      this.elements.apiKeyInput.addEventListener('input', handleInput);
      this.elements.apiKeyInput.addEventListener('blur', handleInput);
    }

    // 日誌模式切換
    if (this.elements.debugToggle) {
      this.elements.debugToggle.addEventListener('change', () => {
        try {
          chrome.storage.sync.set(
            { enableDebugLogs: Boolean(this.elements.debugToggle.checked) },
            () => {
              this.ui.showStatus(
                this.elements.debugToggle.checked
                  ? UI_MESSAGES.SETTINGS.DEBUG_LOGS_ENABLED
                  : UI_MESSAGES.SETTINGS.DEBUG_LOGS_DISABLED,
                'success'
              );
            }
          );
        } catch (error) {
          Logger.error('切換日誌模式失敗', {
            action: 'toggleDebugLogs',
            error,
          });
          const safeMessage = sanitizeApiError(error, 'toggle_debug_logs');
          const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
          this.ui.showStatus(UI_MESSAGES.SETTINGS.DEBUG_LOGS_TOGGLE_FAILED(errorMsg), 'error');
        }
      });
    }
  }

  /**
   * 檢查授權狀態和載入設置
   */
  checkAuthStatus() {
    chrome.storage.sync.get(
      [
        'notionApiKey',
        'notionDataSourceId',
        'notionDatabaseId',
        'titleTemplate',
        'addSource',
        'addTimestamp',
        'highlightStyle',
        'enableDebugLogs',
      ],
      result => {
        if (result.notionApiKey) {
          this.handleConnectedState(result);
        } else {
          this.handleDisconnectedState();
        }

        // 載入模板設置
        if (this.elements.titleTemplateInput) {
          this.elements.titleTemplateInput.value = result.titleTemplate || '{title}';
        }
        if (this.elements.addSourceCheckbox) {
          this.elements.addSourceCheckbox.checked = result.addSource !== false;
        }
        if (this.elements.addTimestampCheckbox) {
          this.elements.addTimestampCheckbox.checked = result.addTimestamp !== false;
        }
        if (this.elements.highlightStyleSelect) {
          this.elements.highlightStyleSelect.value = result.highlightStyle || 'background';
        }
        if (this.elements.debugToggle) {
          this.elements.debugToggle.checked = Boolean(result.enableDebugLogs);
        }
      }
    );
  }

  handleConnectedState(result) {
    if (this.elements.authStatus) {
      this.elements.authStatus.innerHTML = `${UI_ICONS.SUCCESS}<span>${UI_MESSAGES.AUTH.STATUS_CONNECTED}</span>`;
      this.elements.authStatus.className = 'auth-status success';
    }
    if (this.elements.oauthButton) {
      this.elements.oauthButton.innerHTML = `<span class="icon">${UI_ICONS.REFRESH}</span><span>${UI_MESSAGES.AUTH.ACTION_RECONNECT}</span>`;
    }
    if (this.elements.disconnectButton) {
      this.elements.disconnectButton.style.display = 'inline-flex';
    }

    if (this.elements.apiKeyInput) {
      this.elements.apiKeyInput.value = result.notionApiKey;
    }

    const storedLegacyId = result.notionDatabaseId || '';
    const storedDataSourceId = result.notionDataSourceId || '';
    const resolvedId = storedDataSourceId || storedLegacyId;

    if (this.elements.databaseIdInput) {
      this.elements.databaseIdInput.value = resolvedId || '';
    }

    if (storedLegacyId && !storedDataSourceId) {
      this.ui.showDataSourceUpgradeNotice(storedLegacyId);
    } else {
      this.ui.hideDataSourceUpgradeNotice();
    }

    // 載入資料來源列表
    this.dependencies.loadDatabases?.(result.notionApiKey);
  }

  handleDisconnectedState() {
    if (this.elements.authStatus) {
      this.elements.authStatus.textContent = UI_MESSAGES.AUTH.STATUS_DISCONNECTED;
      this.elements.authStatus.className = 'auth-status';
    }
    if (this.elements.oauthButton) {
      this.elements.oauthButton.innerHTML = `<span class="icon">${UI_ICONS.LINK}</span><span>${UI_MESSAGES.AUTH.ACTION_CONNECT}</span>`;
    }
    if (this.elements.disconnectButton) {
      this.elements.disconnectButton.style.display = 'none';
    }
    this.ui.hideDataSourceUpgradeNotice();
  }

  async startNotionSetup() {
    try {
      this.elements.oauthButton.disabled = true;
      this.elements.oauthButton.innerHTML = `<span class="loading"></span><span>${UI_MESSAGES.AUTH.OPENING_NOTION}</span>`;

      // 打開 Notion 集成頁面
      const integrationUrl = 'https://www.notion.so/my-integrations';
      await chrome.tabs.create({ url: integrationUrl });

      // 顯示設置指南
      this.ui.showSetupGuide();

      setTimeout(() => {
        if (this.elements.oauthButton) {
          this.elements.oauthButton.disabled = false;
          this.elements.oauthButton.innerHTML = `<span class="icon">${UI_ICONS.LINK}</span><span>${UI_MESSAGES.AUTH.ACTION_CONNECT}</span>`;
        }
      }, 2000);
    } catch (error) {
      if (this.elements.oauthButton) {
        this.elements.oauthButton.disabled = false;
        this.elements.oauthButton.innerHTML = `<span class="icon">${UI_ICONS.LINK}</span><span>${UI_MESSAGES.AUTH.ACTION_CONNECT}</span>`;
      }
      const safeMessage = sanitizeApiError(error, 'open_notion_page');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      Logger.error('打開 Notion 頁面失敗', {
        action: 'startNotionSetup',
        error,
      });
      this.ui.showStatus(UI_MESSAGES.AUTH.OPEN_NOTION_FAILED(errorMsg), 'error');
    }
  }

  async disconnectFromNotion() {
    try {
      Logger.info('開始斷開 Notion 連接', {
        action: 'disconnect',
        phase: 'start',
      });

      await chrome.storage.sync.remove(['notionApiKey', 'notionDataSourceId', 'notionDatabaseId']);

      Logger.info('已清除授權數據', {
        action: 'disconnect',
        phase: 'clearData',
      });

      this.checkAuthStatus();

      if (this.elements.apiKeyInput) {
        this.elements.apiKeyInput.value = '';
      }
      if (this.elements.databaseIdInput) {
        this.elements.databaseIdInput.value = '';
      }

      this.ui.showStatus(UI_MESSAGES.SETTINGS.DISCONNECT_SUCCESS, 'success');
      Logger.info('UI 已更新為未連接狀態', {
        action: 'disconnect',
        phase: 'uiUpdate',
      });
    } catch (error) {
      Logger.error('斷開連接失敗', {
        action: 'disconnect',
        error: error.message || error,
      });
      const safeMessage = sanitizeApiError(error, 'disconnect');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.ui.showStatus(UI_MESSAGES.SETTINGS.DISCONNECT_FAILED(errorMsg), 'error');
    }
  }

  async testApiKey() {
    const apiKey = this.elements.apiKeyInput?.value.trim();
    if (!apiKey) {
      this.ui.showStatus(UI_MESSAGES.SETTINGS.KEY_INPUT_REQUIRED, 'error');
      return;
    }

    if (apiKey.length < 20) {
      this.ui.showStatus(UI_MESSAGES.SETTINGS.API_KEY_FORMAT_ERROR, 'error');
      return;
    }

    this.elements.testApiButton.disabled = true;
    this.elements.testApiButton.textContent = UI_MESSAGES.SETTINGS.TESTING_LABEL;

    try {
      // 使用 loadDatabases 進行測試
      await this.dependencies.loadDatabases?.(apiKey);
    } catch (error) {
      Logger.error('API 測試失敗', { action: 'testApiKey', error });
    } finally {
      const btn = this.elements.testApiButton;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '測試 API Key';
      }
    }
  }
}
