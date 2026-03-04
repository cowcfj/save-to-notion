/* global chrome */
import Logger from '../scripts/utils/Logger.js';
import { sanitizeApiError, createSafeIcon } from '../scripts/utils/securityUtils.js';
import { ErrorHandler } from '../scripts/utils/ErrorHandler.js';
import { UI_MESSAGES } from '../scripts/config/messages.js';
import { UI_ICONS } from '../scripts/config/icons.js';
import { AuthMode, NOTION_OAUTH } from '../scripts/config/constants.js';
import { getActiveNotionToken, refreshOAuthToken } from '../scripts/utils/notionAuth.js';

/**
 * AuthManager.js
 * 負責 Notion 授權流程（OAuth + 手動 API Key）與狀態管理
 */

export class AuthManager {
  // 將常數綁定到類別上供實例使用
  static CLASS_AUTH_SUCCESS = 'auth-status success';
  static CLASS_AUTH_STATUS = 'auth-status';
  static STYLE_INLINE_FLEX = 'inline-flex';

  /**
   * @param {import('./UIManager.js').UIManager} uiManager
   */
  constructor(uiManager) {
    this.ui = uiManager;
    this.elements = {};
    this.dependencies = {};
    /** @type {'oauth' | 'manual' | null} 目前的認證模式 */
    this.currentAuthMode = null;
  }

  /**
   * 初始化認證管理器
   *
   * @param {object} dependencies - 依賴項 { loadDataSources }
   */
  async init(dependencies = {}) {
    this.dependencies = dependencies;

    // 快取 DOM 元素
    this.elements.apiKeyInput = document.querySelector('#api-key');
    this.elements.databaseIdInput = document.querySelector('#database-id');
    this.elements.oauthButton = document.querySelector('#oauth-button');
    this.elements.disconnectButton = document.querySelector('#disconnect-button');
    this.elements.testApiButton = document.querySelector('#test-api-button');
    this.elements.authStatus = document.querySelector('#auth-status');
    // OAuth 專用元素
    this.elements.oauthConnectButton = document.querySelector('#oauth-connect-button');
    this.elements.oauthDisconnectButton = document.querySelector('#oauth-disconnect-button');
    this.elements.oauthStatus = document.querySelector('#oauth-status');
    // 其他相關設定
    this.elements.titleTemplateInput = document.querySelector('#title-template');
    this.elements.addSourceCheckbox = document.querySelector('#add-source');
    this.elements.addTimestampCheckbox = document.querySelector('#add-timestamp');
    this.elements.highlightStyleSelect = document.querySelector('#highlight-style');
    this.elements.debugToggle = document.querySelector('#enable-debug-logs');

    // 執行 storage 遷移（sync → local）
    await this._migrateDataSourceId();

    // 綁定事件
    this.setupEventListeners();
  }

  // ==========================================
  // Storage 遷移
  // ==========================================

  /**
   * 一次性遷移：將 notionDataSourceId 從 sync 搬到 local
   *
   * @private
   */
  async _migrateDataSourceId() {
    try {
      const localData = await chrome.storage.local.get('notionDataSourceId');
      if (localData.notionDataSourceId) {
        return; // 已遷移
      }

      const syncData = await chrome.storage.sync.get(['notionDataSourceId', 'notionDatabaseId']);
      const id = syncData.notionDataSourceId || syncData.notionDatabaseId;
      if (id) {
        await chrome.storage.local.set({ notionDataSourceId: id });
        Logger.info('已完成 notionDataSourceId 遷移 (sync → local)', {
          action: 'migrateDataSourceId',
        });
      }
    } catch (error) {
      Logger.error('遷移 notionDataSourceId 失敗', {
        action: 'migrateDataSourceId',
        error,
      });
    }
  }

  // ==========================================
  // 統一 Token 取得
  // ==========================================

  /**
   * 取得目前有效的 Notion API Token（不論模式）
   * 優先讀取 OAuth Token（local），若無則讀取手動 API Key（sync）
   *
   * @returns {Promise<{token: string|null, mode: string|null}>}
   */
  static async getActiveNotionToken() {
    return getActiveNotionToken();
  }

  // ==========================================
  // 事件設定
  // ==========================================

  /**
   * 更新按鈕內容（圖標 + 文字）
   *
   * @param {HTMLElement} button - 按鈕元素
   * @param {string} icon - 圖標名稱
   * @param {string} text - 按鈕文字
   * @private
   */
  _updateButtonContent(button, icon, text) {
    if (!button) {
      return;
    }
    button.textContent = '';
    button.append(createSafeIcon(icon));
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    button.append(textSpan);
  }

  setupEventListeners() {
    // OAuth 一鍵連接按鈕
    this.elements.oauthConnectButton?.addEventListener('click', () => this.startOAuthFlow());

    // OAuth 斷開按鈕
    this.elements.oauthDisconnectButton?.addEventListener('click', () => this.disconnectOAuth());

    // 手動模式：保留現有的設定指南按鈕
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
            this.dependencies.loadDataSources?.(apiKey);
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

  // ==========================================
  // 認證狀態檢查
  // ==========================================

  /**
   * 檢查授權狀態和載入設置（支援 OAuth + 手動雙模式）
   */
  async checkAuthStatus() {
    // 同時讀取 local 和 sync
    const [localData, syncData] = await Promise.all([
      chrome.storage.local.get([
        'notionAuthMode',
        'notionOAuthToken',
        'notionWorkspaceName',
        'notionDataSourceId',
      ]),
      chrome.storage.sync.get([
        'notionApiKey',
        'notionDatabaseId',
        'titleTemplate',
        'addSource',
        'addTimestamp',
        'highlightStyle',
        'enableDebugLogs',
      ]),
    ]);

    // 判斷認證模式
    if (localData.notionAuthMode === AuthMode.OAUTH && localData.notionOAuthToken) {
      this.currentAuthMode = AuthMode.OAUTH;
      this._handleOAuthConnectedState(localData);
    } else if (syncData.notionApiKey) {
      this.currentAuthMode = AuthMode.MANUAL;
      this._handleManualConnectedState(syncData, localData);
    } else {
      this.currentAuthMode = null;
      this.handleDisconnectedState();
    }

    // 載入通用設置（不論認證模式）
    this._loadGeneralSettings(syncData);
  }

  /**
   * OAuth 已連接的 UI 狀態
   *
   * @param {object} localData - 本地存儲的資料
   * @private
   */
  _handleOAuthConnectedState(localData) {
    const workspaceName = localData.notionWorkspaceName || 'Notion Workspace';

    // 更新 OAuth 狀態區域
    if (this.elements.oauthStatus) {
      this.elements.oauthStatus.textContent = '';
      this.elements.oauthStatus.append(createSafeIcon(UI_ICONS.SUCCESS));
      const textSpan = document.createElement('span');
      textSpan.textContent = `已連接 — ${workspaceName}`;
      this.elements.oauthStatus.append(textSpan);
      this.elements.oauthStatus.className = AuthManager.CLASS_AUTH_SUCCESS;
    }

    // OAuth 按鈕切換為已連接狀態
    if (this.elements.oauthConnectButton) {
      this.elements.oauthConnectButton.style.display = 'none';
    }
    if (this.elements.oauthDisconnectButton) {
      this.elements.oauthDisconnectButton.style.display = AuthManager.STYLE_INLINE_FLEX;
    }

    // 手動模式區域顯示提示（OAuth 已連接）
    if (this.elements.authStatus) {
      this.elements.authStatus.textContent = '';
      this.elements.authStatus.append(createSafeIcon(UI_ICONS.SUCCESS));
      const textSpan = document.createElement('span');
      textSpan.textContent = UI_MESSAGES.AUTH.STATUS_CONNECTED;
      this.elements.authStatus.append(textSpan);
      this.elements.authStatus.className = AuthManager.CLASS_AUTH_SUCCESS;
    }

    // 載入 OAuth 模式的資料來源
    const token = localData.notionOAuthToken;
    if (token) {
      this.dependencies.loadDataSources?.(token);
    }
  }

  /**
   * 手動 API Key 已連接的 UI 狀態
   *
   * @param {object} syncData - 遠端同步的資料
   * @param {object} localData - 本地存儲的資料
   * @private
   */
  _handleManualConnectedState(syncData, localData) {
    // 沿用原本的 handleConnectedState 邏輯
    if (this.elements.authStatus) {
      this.elements.authStatus.textContent = '';
      this.elements.authStatus.append(createSafeIcon(UI_ICONS.SUCCESS));
      const textSpan = document.createElement('span');
      textSpan.textContent = UI_MESSAGES.AUTH.STATUS_CONNECTED;
      this.elements.authStatus.append(textSpan);
      this.elements.authStatus.className = AuthManager.CLASS_AUTH_SUCCESS;
    }
    this._updateButtonContent(
      this.elements.oauthButton,
      UI_ICONS.REFRESH,
      UI_MESSAGES.AUTH.ACTION_RECONNECT
    );
    if (this.elements.disconnectButton) {
      this.elements.disconnectButton.style.display = AuthManager.STYLE_INLINE_FLEX;
    }

    if (this.elements.apiKeyInput) {
      this.elements.apiKeyInput.value = syncData.notionApiKey;
    }

    // 資料來源 ID 從 local 讀取（遷移後統一在 local）
    const storedDataSourceId = localData.notionDataSourceId || '';
    const storedLegacyId = syncData.notionDatabaseId || '';
    const resolvedId = storedDataSourceId || storedLegacyId;

    if (this.elements.databaseIdInput) {
      this.elements.databaseIdInput.value = resolvedId || '';
    }

    if (storedLegacyId && !storedDataSourceId) {
      this.ui.showDataSourceUpgradeNotice(storedLegacyId);
    } else {
      this.ui.hideDataSourceUpgradeNotice();
    }

    // OAuth 區域顯示未連接
    if (this.elements.oauthStatus) {
      this.elements.oauthStatus.textContent = '未連接 OAuth';
      this.elements.oauthStatus.className = AuthManager.CLASS_AUTH_STATUS;
    }
    if (this.elements.oauthConnectButton) {
      this.elements.oauthConnectButton.style.display = AuthManager.STYLE_INLINE_FLEX;
    }
    if (this.elements.oauthDisconnectButton) {
      this.elements.oauthDisconnectButton.style.display = 'none';
    }

    // 載入資料來源列表
    this.dependencies.loadDataSources?.(syncData.notionApiKey);
  }

  /**
   * 載入通用設置（模板、timestamp 等）
   *
   * @param {object} syncData - 遠端同步的資料
   * @private
   */
  _loadGeneralSettings(syncData) {
    if (this.elements.titleTemplateInput) {
      this.elements.titleTemplateInput.value = syncData.titleTemplate || '{title}';
    }
    if (this.elements.addSourceCheckbox) {
      this.elements.addSourceCheckbox.checked = syncData.addSource !== false;
    }
    if (this.elements.addTimestampCheckbox) {
      this.elements.addTimestampCheckbox.checked = syncData.addTimestamp !== false;
    }
    if (this.elements.highlightStyleSelect) {
      this.elements.highlightStyleSelect.value = syncData.highlightStyle || 'background';
    }
    if (this.elements.debugToggle) {
      this.elements.debugToggle.checked = Boolean(syncData.enableDebugLogs);
    }
  }

  // 保留向後相容
  async handleConnectedState(result) {
    try {
      const localData = await chrome.storage.local.get(['notionDataSourceId']);
      this._handleManualConnectedState(result, localData);
    } catch (error) {
      Logger.error('讀取 local storage 失敗', { action: 'handleConnectedState', error });
    }
  }

  handleDisconnectedState() {
    if (this.elements.authStatus) {
      this.elements.authStatus.textContent = UI_MESSAGES.AUTH.STATUS_DISCONNECTED;
      this.elements.authStatus.className = AuthManager.CLASS_AUTH_STATUS;
    }
    this._updateButtonContent(
      this.elements.oauthButton,
      UI_ICONS.LINK,
      UI_MESSAGES.AUTH.ACTION_CONNECT
    );
    if (this.elements.disconnectButton) {
      this.elements.disconnectButton.style.display = 'none';
    }

    // OAuth 區域也顯示未連接
    if (this.elements.oauthStatus) {
      this.elements.oauthStatus.textContent = '未連接';
      this.elements.oauthStatus.className = AuthManager.CLASS_AUTH_STATUS;
    }
    if (this.elements.oauthConnectButton) {
      this.elements.oauthConnectButton.style.display = AuthManager.STYLE_INLINE_FLEX;
    }
    if (this.elements.oauthDisconnectButton) {
      this.elements.oauthDisconnectButton.style.display = 'none';
    }

    this.ui.hideDataSourceUpgradeNotice();
  }

  // ==========================================
  // OAuth 流程
  // ==========================================

  /**
   * 啟動 Notion OAuth 授權流程
   * 使用 chrome.identity.launchWebAuthFlow
   */
  async startOAuthFlow() {
    try {
      Logger.start('開始 Notion OAuth 流程', { action: 'startOAuthFlow' });

      // 更新按鈕為載入狀態
      if (this.elements.oauthConnectButton) {
        this.elements.oauthConnectButton.disabled = true;
        this.elements.oauthConnectButton.textContent = UI_MESSAGES.AUTH.OAUTH_CONNECTING;
      }

      // 1. 產生 CSRF state 並暫存
      const csrfState = crypto.randomUUID();
      await chrome.storage.session.set({ oauthState: csrfState });

      // 2. 取得 redirect URI（Chrome 自動綁定 extension ID）
      const redirectUri = chrome.identity.getRedirectURL();

      // 3. 組成 Notion 授權 URL
      const authUrl =
        `https://api.notion.com/v1/oauth/authorize?` +
        `client_id=${encodeURIComponent(NOTION_OAUTH.CLIENT_ID)}&` +
        `response_type=code&owner=user&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${encodeURIComponent(csrfState)}`;

      // 4. 啟動 OAuth 流程
      const callbackUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      });

      if (!callbackUrl) {
        throw new Error('OAuth 流程被取消或未回傳 URL');
      }

      // 5. 解析 callback URL
      const url = new URL(callbackUrl);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      // 6. 驗證 CSRF state
      const storedState = await chrome.storage.session.get('oauthState');
      if (returnedState !== storedState.oauthState) {
        throw new Error('CSRF state 驗證失敗，請重試');
      }

      if (!code) {
        const errorParam = url.searchParams.get('error');
        throw new Error(`Notion 授權失敗: ${errorParam || '未知錯誤'}`);
      }

      // 7. 將 code 送到後端交換 Token
      const serverUrl = `${NOTION_OAUTH.SERVER_URL}${NOTION_OAUTH.TOKEN_ENDPOINT}`;
      const tokenResponse = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Token 交換失敗 (${tokenResponse.status})`);
      }

      const tokenData = await tokenResponse.json();

      // 8. 存儲 Token 及相關資料到 chrome.storage.local
      await chrome.storage.local.set({
        notionAuthMode: AuthMode.OAUTH,
        notionOAuthToken: tokenData.access_token,
        notionRefreshToken: tokenData.refresh_token,
        notionWorkspaceId: tokenData.workspace_id,
        notionWorkspaceName: tokenData.workspace_name,
        notionBotId: tokenData.bot_id,
      });

      // 9. 清除 CSRF state
      await chrome.storage.session.remove('oauthState');

      Logger.success('Notion OAuth 連接成功', {
        action: 'startOAuthFlow',
        workspace: tokenData.workspace_name,
      });

      this.ui.showStatus(`✅ 已成功連接 Notion — ${tokenData.workspace_name}`, 'success');

      // 10. 更新 UI
      await this.checkAuthStatus();
    } catch (error) {
      Logger.error('Notion OAuth 流程失敗', {
        action: 'startOAuthFlow',
        error: error.message || error,
      });
      const safeMessage = sanitizeApiError(error, 'oauth_flow');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.ui.showStatus(`OAuth 連接失敗：${errorMsg}`, 'error');
    } finally {
      if (this.elements.oauthConnectButton) {
        this.elements.oauthConnectButton.disabled = false;
        this.elements.oauthConnectButton.textContent = UI_MESSAGES.AUTH.OAUTH_ACTION_CONNECT;
      }
    }
  }

  /**
   * 斷開 OAuth 連接
   */
  async disconnectOAuth() {
    try {
      Logger.start('開始斷開 OAuth 連接', { action: 'disconnectOAuth' });

      await chrome.storage.local.remove([
        'notionAuthMode',
        'notionOAuthToken',
        'notionRefreshToken',
        'notionWorkspaceId',
        'notionWorkspaceName',
        'notionBotId',
        'notionDataSourceId',
      ]);

      Logger.info('已清除 OAuth 資料', { action: 'disconnectOAuth' });

      // 檢查是否有手動 Key 可自動切回
      const syncData = await chrome.storage.sync.get(['notionApiKey']);
      if (syncData.notionApiKey) {
        Logger.info('偵測到手動 API Key，自動切回手動模式', { action: 'disconnectOAuth' });
      }

      await this.checkAuthStatus();
      this.ui.showStatus('已斷開 OAuth 連接', 'success');
    } catch (error) {
      Logger.error('斷開 OAuth 失敗', {
        action: 'disconnectOAuth',
        error: error.message || error,
      });
      const safeMessage = sanitizeApiError(error, 'disconnect_oauth');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.ui.showStatus(`斷開 OAuth 失敗：${errorMsg}`, 'error');
    }
  }

  // ==========================================
  // 手動模式（保留現有邏輯）
  // ==========================================

  async startNotionSetup() {
    try {
      Logger.start('開始 Notion 授權流程', { action: 'startNotionSetup' });

      // 更新按鈕狀態為載入中
      if (this.elements.oauthButton) {
        this.elements.oauthButton.disabled = true;
        this.elements.oauthButton.textContent = '';
        const loadingSpan = document.createElement('span');
        loadingSpan.className = 'loading';
        this.elements.oauthButton.append(loadingSpan);
        const textSpan = document.createElement('span');
        textSpan.textContent = UI_MESSAGES.AUTH.OPENING_NOTION;
        this.elements.oauthButton.append(textSpan);
      }

      // 打開 Notion 集成頁面
      const integrationUrl = 'https://www.notion.so/my-integrations';
      await chrome.tabs.create({ url: integrationUrl });

      // 顯示設置指南
      this.ui.showSetupGuide();

      setTimeout(() => {
        if (this.elements.oauthButton) {
          this.elements.oauthButton.disabled = false;
        }
        this._updateButtonContent(
          this.elements.oauthButton,
          UI_ICONS.LINK,
          UI_MESSAGES.AUTH.ACTION_CONNECT
        );
      }, 2000);
    } catch (error) {
      if (this.elements.oauthButton) {
        this.elements.oauthButton.disabled = false;
      }
      this._updateButtonContent(
        this.elements.oauthButton,
        UI_ICONS.LINK,
        UI_MESSAGES.AUTH.ACTION_CONNECT
      );
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
      Logger.start('開始斷開手動 Notion 連接', {
        action: 'disconnect',
        phase: 'start',
      });

      // 清除 sync 中的手動 Key
      await chrome.storage.sync.remove(['notionApiKey', 'notionDatabaseId']);
      // 清除 local 中的 dataSourceId（如果當前是手動模式）
      if (this.currentAuthMode === AuthMode.MANUAL) {
        await chrome.storage.local.remove(['notionDataSourceId']);
      }

      Logger.info('已清除手動授權數據', {
        action: 'disconnect',
        phase: 'clearData',
      });

      await this.checkAuthStatus();

      if (this.elements.apiKeyInput) {
        this.elements.apiKeyInput.value = '';
      }
      if (this.elements.databaseIdInput) {
        this.elements.databaseIdInput.value = '';
      }

      this.ui.showStatus(UI_MESSAGES.SETTINGS.DISCONNECT_SUCCESS, 'success');
      Logger.success('UI 已更新為未連接狀態', {
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
      Logger.start('開始測試 API Key', { action: 'testApiKey' });
      // 使用 loadDataSources 進行測試
      await this.dependencies.loadDataSources?.(apiKey);
      Logger.success('API Key 測試成功', { action: 'testApiKey' });
    } catch (error) {
      Logger.error('API 測試失敗', { action: 'testApiKey', error });
    } finally {
      const btn = this.elements.testApiButton;
      if (btn) {
        btn.disabled = false;
        btn.textContent = UI_MESSAGES.SETTINGS.TEST_API_LABEL;
      }
    }
  }

  // ==========================================
  // Token 刷新（供外部呼叫）
  // ==========================================

  /**
   * 刷新 OAuth Token
   *
   * @returns {Promise<string|null>} 新的 access_token 或 null
   */
  static async refreshOAuthToken() {
    return refreshOAuthToken();
  }
}
