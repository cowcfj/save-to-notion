/* global chrome */
import Logger from '../utils/Logger.js';

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
   * @param {Object} dependencies - 依賴項 { loadDatabases }
   */
  init(dependencies = {}) {
    this.dependencies = dependencies;

    // 快取 DOM 元素
    this.elements.apiKeyInput = document.getElementById('api-key');
    this.elements.databaseIdInput = document.getElementById('database-id');
    this.elements.oauthButton = document.getElementById('oauth-button');
    this.elements.disconnectButton = document.getElementById('disconnect-button');
    this.elements.testApiButton = document.getElementById('test-api-button');
    this.elements.authStatus = document.getElementById('auth-status');
    // 其他相關設定
    this.elements.titleTemplateInput = document.getElementById('title-template');
    this.elements.addSourceCheckbox = document.getElementById('add-source');
    this.elements.addTimestampCheckbox = document.getElementById('add-timestamp');
    this.elements.highlightStyleSelect = document.getElementById('highlight-style');
    this.elements.debugToggle = document.getElementById('enable-debug-logs');

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
                  ? '已啟用偵錯日誌（前端日誌將轉送到背景頁）'
                  : '已停用偵錯日誌',
                'success'
              );
            }
          );
        } catch (error) {
          this.ui.showStatus(`切換日誌模式失敗: ${error.message}`, 'error');
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
      this.elements.authStatus.textContent = '✅ 已連接到 Notion';
      this.elements.authStatus.className = 'auth-status success';
    }
    if (this.elements.oauthButton) {
      this.elements.oauthButton.innerHTML = '<span class="notion-icon">🔄</span>重新設置';
    }
    if (this.elements.disconnectButton) {
      this.elements.disconnectButton.style.display = 'inline-block';
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
      this.elements.authStatus.textContent = '未連接到 Notion';
      this.elements.authStatus.className = 'auth-status';
    }
    if (this.elements.oauthButton) {
      this.elements.oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
    }
    if (this.elements.disconnectButton) {
      this.elements.disconnectButton.style.display = 'none';
    }
    this.ui.hideDataSourceUpgradeNotice();
  }

  async startNotionSetup() {
    try {
      this.elements.oauthButton.disabled = true;
      this.elements.oauthButton.innerHTML = '<span class="loading"></span>正在打開 Notion...';

      // 打開 Notion 集成頁面
      const integrationUrl = 'https://www.notion.so/my-integrations';
      await chrome.tabs.create({ url: integrationUrl });

      // 顯示設置指南
      this.ui.showSetupGuide();

      setTimeout(() => {
        if (this.elements.oauthButton) {
          this.elements.oauthButton.disabled = false;
          this.elements.oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
        }
      }, 2000);
    } catch (error) {
      if (this.elements.oauthButton) {
        this.elements.oauthButton.disabled = false;
        this.elements.oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
      }
      this.ui.showStatus(`打開 Notion 頁面失敗: ${error.message}`, 'error');
    }
  }

  async disconnectFromNotion() {
    try {
      Logger.info('🔌 [斷開連接] 開始斷開 Notion 連接');

      await chrome.storage.sync.remove(['notionApiKey', 'notionDataSourceId', 'notionDatabaseId']);

      Logger.info('✅ [斷開連接] 已清除授權數據');

      this.checkAuthStatus();

      if (this.elements.apiKeyInput) {
        this.elements.apiKeyInput.value = '';
      }
      if (this.elements.databaseIdInput) {
        this.elements.databaseIdInput.value = '';
      }

      this.ui.showStatus('已成功斷開與 Notion 的連接。', 'success');
      Logger.info('🔄 [斷開連接] UI 已更新為未連接狀態');
    } catch (error) {
      Logger.error('❌ [斷開連接] 斷開連接失敗:', error);
      this.ui.showStatus(`斷開連接失敗: ${error.message}`, 'error');
    }
  }

  testApiKey() {
    const apiKey = this.elements.apiKeyInput?.value.trim();
    if (!apiKey) {
      this.ui.showStatus('請先輸入 API Key', 'error');
      return;
    }

    if (apiKey.length < 20) {
      this.ui.showStatus('API Key 格式不正確，長度太短', 'error');
      return;
    }

    this.elements.testApiButton.disabled = true;
    this.elements.testApiButton.textContent = '測試中...';

    // 使用 loadDatabases 進行測試
    const promise = this.dependencies.loadDatabases?.(apiKey);

    // 如果返回 Promise 則等待
    if (promise && typeof promise.then === 'function') {
      promise.finally(() => {
        if (this.elements.testApiButton) {
          this.elements.testApiButton.disabled = false;
          this.elements.testApiButton.textContent = '測試 API Key';
        }
      });
    } else if (this.elements.testApiButton) {
      // Fallback if not promise
      this.elements.testApiButton.disabled = false;
      this.elements.testApiButton.textContent = '測試 API Key';
    }
  }
}
