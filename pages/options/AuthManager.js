/* global chrome */
import Logger from '../../scripts/utils/Logger.js';
import { createSafeIcon } from '../../scripts/utils/securityUtils.js';
import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';
import { ErrorHandler } from '../../scripts/utils/ErrorHandler.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { UI_ICONS } from '../../scripts/config/shared/ui.js';
import { AuthMode } from '../../scripts/config/extension/authMode.js';
import {
  getActiveNotionToken,
  refreshOAuthToken,
  getNextAuthEpoch,
  migrateDataSourceKeys,
} from '../../scripts/utils/notionAuth.js';
import {
  AUTH_LOCAL_KEYS,
  DATA_SOURCE_KEYS,
  SYNC_CONFIG_KEYS,
  mergeDataSourceConfig,
} from '../../scripts/config/shared/storage.js';
import { initiateNotionOAuth } from '../../scripts/auth/notionOAuthInitiator.js';
import {
  exchangeNotionOAuthCode,
  saveNotionOAuthToken,
} from '../../scripts/auth/notionOAuthCompleter.js';

/**
 * AuthManager.js
 * 負責 Notion 授權流程（OAuth + 手動 API Key）與狀態管理
 */

export class AuthManager {
  // 將常數綁定到類別上供實例使用
  static CLASS_AUTH_SUCCESS = 'auth-status success';
  static CLASS_AUTH_STATUS = 'auth-status';
  static MIN_API_KEY_LENGTH_FOR_DATASOURCE_LOAD = 20;
  static API_KEY_INPUT_DEBOUNCE_MS = 1000;

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
    this.elements.floatingRailCheckbox = document.querySelector('#floating-rail-enabled');
    this.elements.floatingRailPositionSelect = document.querySelector('#floating-rail-position');
    this.elements.floatingRailSizeSelect = document.querySelector('#floating-rail-size');

    // 綁定事件
    this.setupEventListeners();
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
    this._bindAuthActionButtons();
    this._bindApiKeyDataSourceLoader();
    this._bindDebugToggle();
  }

  /**
   * 綁定授權相關按鈕事件
   *
   * @private
   */
  _bindAuthActionButtons() {
    const clickBindings = [
      [this.elements.oauthConnectButton, () => this.startOAuthFlow()],
      [this.elements.oauthDisconnectButton, () => this.disconnectOAuth()],
      [this.elements.oauthButton, () => this.startNotionSetup()],
      [this.elements.disconnectButton, () => this.disconnectFromNotion()],
      [this.elements.testApiButton, () => this.testApiKey()],
    ];

    for (const [element, handler] of clickBindings) {
      this._bindClickListener(element, handler);
    }
  }

  /**
   * 綁定 click listener，缺少元素時略過
   *
   * @private
   * @param {HTMLElement|null} element
   * @param {Function} handler
   */
  _bindClickListener(element, handler) {
    if (!element) {
      return;
    }

    element.addEventListener('click', handler);
  }

  /**
   * 綁定 API Key 輸入防抖動資料來源載入
   *
   * @private
   */
  _bindApiKeyDataSourceLoader() {
    const apiKeyInput = this.elements.apiKeyInput;
    if (!apiKeyInput) {
      return;
    }

    let timeout = null;
    const handleInput = () => {
      timeout = this._clearPendingDataSourceLoad(timeout);
      const apiKey = apiKeyInput.value.trim();

      if (this._shouldLoadDataSourcesForApiKey(apiKey)) {
        timeout = setTimeout(
          () => this._loadDataSourcesFromApiKey(apiKey),
          AuthManager.API_KEY_INPUT_DEBOUNCE_MS
        );
      }
    };

    apiKeyInput.addEventListener('input', handleInput);
    apiKeyInput.addEventListener('blur', handleInput);
  }

  /**
   * 清除待執行的資料來源載入 timer
   *
   * @private
   * @param {number|null} timeout
   * @returns {null}
   */
  _clearPendingDataSourceLoad(timeout) {
    if (timeout) {
      clearTimeout(timeout);
    }

    return null;
  }

  /**
   * 判斷 API Key 是否足以觸發資料來源載入
   *
   * @private
   * @param {string} apiKey
   * @returns {boolean}
   */
  _shouldLoadDataSourcesForApiKey(apiKey) {
    return apiKey.length > AuthManager.MIN_API_KEY_LENGTH_FOR_DATASOURCE_LOAD;
  }

  /**
   * 依 API Key 載入資料來源
   *
   * @private
   * @param {string} apiKey
   */
  _loadDataSourcesFromApiKey(apiKey) {
    this.dependencies.loadDataSources?.(apiKey);
  }

  /**
   * 綁定 debug log toggle
   *
   * @private
   */
  _bindDebugToggle() {
    const debugToggle = this.elements.debugToggle;
    if (!debugToggle) {
      return;
    }

    debugToggle.addEventListener('change', () => this._handleDebugToggleChange(debugToggle));
  }

  /**
   * 處理 debug log toggle 變更
   *
   * @private
   * @param {HTMLInputElement} debugToggle
   */
  async _handleDebugToggleChange(debugToggle) {
    try {
      await chrome.storage.sync.set({
        enableDebugLogs: Boolean(debugToggle.checked),
      });

      this._showDebugToggleStatus(debugToggle.checked);
    } catch (error) {
      this._handleDebugToggleFailure(error);
    }
  }

  /**
   * 顯示 debug log toggle 成功狀態
   *
   * @private
   * @param {boolean} enabled
   */
  _showDebugToggleStatus(enabled) {
    const message = enabled
      ? UI_MESSAGES.SETTINGS.DEBUG_LOGS_ENABLED
      : UI_MESSAGES.SETTINGS.DEBUG_LOGS_DISABLED;

    this.ui.showStatus(message, 'success');
  }

  /**
   * 顯示 debug log toggle 失敗狀態
   *
   * @private
   * @param {Error} error
   */
  _handleDebugToggleFailure(error) {
    Logger.error('[存儲] 切換日誌模式失敗', {
      action: 'toggleDebugLogs',
      error: sanitizeApiError(error, 'toggle_debug_logs'),
    });
    const safeMessage = sanitizeApiError(error, 'toggle_debug_logs');
    const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
    this.ui.showStatus(UI_MESSAGES.SETTINGS.DEBUG_LOGS_TOGGLE_FAILED(errorMsg), 'error');
  }

  // ==========================================
  // 認證狀態檢查
  // ==========================================

  /**
   * 檢查授權狀態和載入設置（支援 OAuth + 手動雙模式）
   */
  async checkAuthStatus() {
    try {
      // 同時讀取 local 和 sync
      const [localData, syncData] = await Promise.all([
        chrome.storage.local.get([...AUTH_LOCAL_KEYS, ...DATA_SOURCE_KEYS]),
        chrome.storage.sync.get([...SYNC_CONFIG_KEYS, ...DATA_SOURCE_KEYS]),
      ]);

      const sourceData = mergeDataSourceConfig(localData, syncData);
      await migrateDataSourceKeys({
        localData,
        syncData,
        storageArea: chrome.storage.local,
        logger: Logger,
        action: 'checkAuthStatus',
        retryContext: 'options',
      });

      // 判斷認證模式
      if (localData.notionAuthMode === AuthMode.OAUTH && localData.notionOAuthToken) {
        this.currentAuthMode = AuthMode.OAUTH;
        this._handleOAuthConnectedState(localData, sourceData);
      } else if (syncData.notionApiKey) {
        this.currentAuthMode = AuthMode.MANUAL;
        this._handleManualConnectedState(syncData, sourceData);
      } else {
        this.currentAuthMode = null;
        this.handleDisconnectedState();
      }

      // 載入通用設置（不論認證模式）
      this._loadGeneralSettings(syncData);
    } catch (error) {
      this.currentAuthMode = null;
      this.handleDisconnectedState();
      Logger.error('[Auth] 讀取授權狀態失敗', {
        action: 'checkAuthStatus',
        error: sanitizeApiError(error, 'check_auth_status'),
      });
    }
  }

  /**
   * 渲染連接成功的狀態
   *
   * @private
   * @param {HTMLElement} element - 狀態元素
   * @param {string} text - 顯示文字
   */
  _renderConnectedStatus(element, text) {
    if (!element) {
      return;
    }
    element.textContent = '';
    element.append(createSafeIcon(UI_ICONS.SUCCESS));
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    element.append(textSpan);
    element.className = AuthManager.CLASS_AUTH_SUCCESS;
  }

  /**
   * 解析已儲存的資料來源 ID
   *
   * @private
   * @param {object} sourceData
   * @returns {{storedDataSourceId: string, storedLegacyId: string, resolvedId: string}}
   */
  _resolveStoredDataSourceIds(sourceData) {
    const data = sourceData || {};
    const storedDataSourceId = data.notionDataSourceId || '';
    const storedLegacyId = data.notionDatabaseId || '';

    return {
      storedDataSourceId,
      storedLegacyId,
      resolvedId: storedDataSourceId || storedLegacyId,
    };
  }

  /**
   * 同步資料來源輸入欄位的顯示值
   *
   * @private
   * @param {string} resolvedId
   */
  _syncDataSourceInputValue(resolvedId) {
    if (this.elements.databaseIdInput) {
      this.elements.databaseIdInput.value = resolvedId;
    }
  }

  /**
   * 根據 legacy data source 狀態更新升級提示
   *
   * @private
   * @param {string} storedLegacyId
   * @param {string} storedDataSourceId
   */
  _updateDataSourceUpgradeNotice(storedLegacyId, storedDataSourceId) {
    if (storedLegacyId && !storedDataSourceId) {
      this.ui.showDataSourceUpgradeNotice?.(storedLegacyId);
      return;
    }

    this.ui.hideDataSourceUpgradeNotice?.();
  }

  /**
   * 解析資料來源 ID 並處理升級提示與輸入值
   *
   * @private
   * @param {object} sourceData
   * @returns {string} 解析出的資料來源 ID
   */
  _resolveDataSourceIdAndNotice(sourceData) {
    const { storedDataSourceId, storedLegacyId, resolvedId } =
      this._resolveStoredDataSourceIds(sourceData);

    this._syncDataSourceInputValue(resolvedId);
    this._updateDataSourceUpgradeNotice(storedLegacyId, storedDataSourceId);

    return resolvedId;
  }

  /**
   * 載入資料來源並記錄錯誤
   *
   * @private
   * @param {string} token
   * @param {string} action
   * @param {string} errorType
   * @returns {Promise<void>}
   */
  async _loadDataSourcesSafely(token, action, errorType) {
    if (!token) {
      return;
    }
    try {
      await this.dependencies.loadDataSources?.(token);
    } catch (error) {
      Logger.error('[Auth] 載入資料來源失敗', {
        action,
        error: sanitizeApiError(error, errorType),
      });
    }
  }

  /**
   * OAuth 已連接的 UI 狀態
   *
   * @param {object} localData - 本地存儲的資料
   * @param {object} [sourceData=localData] - 資料來源資料 (local with sync fallback)
   * @private
   */
  _handleOAuthConnectedState(localData, sourceData = localData) {
    const workspaceName = localData.notionWorkspaceName || 'Notion 工作區';

    // 更新 OAuth 狀態區域
    this._renderConnectedStatus(this.elements.oauthStatus, `已連接 — ${workspaceName}`);

    // OAuth 按鈕切換為已連接狀態
    if (this.elements.oauthConnectButton) {
      this.elements.oauthConnectButton.classList.add('hidden');
    }
    if (this.elements.oauthDisconnectButton) {
      this.elements.oauthDisconnectButton.classList.remove('hidden');
    }

    // 手動模式區域顯示提示（OAuth 已連接）
    this._renderConnectedStatus(this.elements.authStatus, UI_MESSAGES.AUTH.STATUS_CONNECTED);

    const resolvedId = this._resolveDataSourceIdAndNotice(sourceData);

    if (!resolvedId) {
      this.ui.showStatus(UI_MESSAGES.AUTH.OAUTH_TARGET_REQUIRED, 'info');
    }

    // 載入 OAuth 模式的資料來源
    this._loadDataSourcesSafely(
      localData.notionOAuthToken,
      'loadDataSourcesOAuth',
      'load_datasources_oauth'
    );
  }

  /**
   * 手動 API Key 已連接的 UI 狀態
   *
   * @param {object} syncData - 遠端同步的資料
   * @param {object} [sourceData=syncData] - 資料來源資料 (local with sync fallback)
   * @private
   */
  _handleManualConnectedState(syncData, sourceData = syncData) {
    // 沿用原本的 handleConnectedState 邏輯
    this._renderConnectedStatus(this.elements.authStatus, UI_MESSAGES.AUTH.STATUS_CONNECTED);
    this._updateButtonContent(
      this.elements.oauthButton,
      UI_ICONS.REFRESH,
      UI_MESSAGES.AUTH.ACTION_RECONNECT
    );
    if (this.elements.disconnectButton) {
      this.elements.disconnectButton.classList.remove('hidden');
    }

    if (this.elements.apiKeyInput) {
      this.elements.apiKeyInput.value = syncData.notionApiKey;
    }

    this._resolveDataSourceIdAndNotice(sourceData);

    // OAuth 區域顯示未連接
    if (this.elements.oauthStatus) {
      this.elements.oauthStatus.textContent = '未連接 OAuth';
      this.elements.oauthStatus.className = AuthManager.CLASS_AUTH_STATUS;
    }
    if (this.elements.oauthConnectButton) {
      this.elements.oauthConnectButton.classList.remove('hidden');
    }
    if (this.elements.oauthDisconnectButton) {
      this.elements.oauthDisconnectButton.classList.add('hidden');
    }

    // 載入資料來源列表
    this._loadDataSourcesSafely(
      syncData.notionApiKey,
      'loadDataSourcesManual',
      'load_datasources_manual'
    );
  }

  /**
   * 載入通用設置（模板、timestamp 等）
   *
   * @param {object} syncData - 遠端同步的資料
   * @private
   */
  _loadGeneralSettings(syncData) {
    const data = syncData || {};
    const settings = [
      { key: 'titleTemplateInput', prop: 'titleTemplate', type: 'value', def: '{title}' },
      { key: 'addSourceCheckbox', prop: 'addSource', type: 'bool-true' },
      { key: 'addTimestampCheckbox', prop: 'addTimestamp', type: 'bool-true' },
      { key: 'highlightStyleSelect', prop: 'highlightStyle', type: 'value', def: 'background' },
      { key: 'floatingRailCheckbox', prop: 'floatingRailEnabled', type: 'bool-true' },
      {
        key: 'floatingRailPositionSelect',
        prop: 'floatingRailPosition',
        type: 'value',
        def: 'middle',
      },
      { key: 'floatingRailSizeSelect', prop: 'floatingRailSize', type: 'value', def: 'large' },
      { key: 'debugToggle', prop: 'enableDebugLogs', type: 'bool-false' },
    ];

    for (const setting of settings) {
      const el = this.elements[setting.key];
      if (!el) {
        continue;
      }

      const rawVal = data[setting.prop];
      if (setting.type === 'value') {
        el.value = rawVal || setting.def;
      } else if (setting.type === 'bool-true') {
        el.checked = rawVal !== false;
      } else {
        el.checked = Boolean(rawVal);
      }
    }
  }

  // 保留向後相容
  async handleConnectedState(result) {
    try {
      this._handleManualConnectedState(result);
    } catch (error) {
      Logger.error('[存儲] 讀取設定失敗', {
        action: 'handleConnectedState',
        error: sanitizeApiError(error, 'handle_connected_state'),
      });
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
      this.elements.disconnectButton.classList.add('hidden');
    }

    // OAuth 區域也顯示未連接
    if (this.elements.oauthStatus) {
      this.elements.oauthStatus.textContent = '未連接';
      this.elements.oauthStatus.className = AuthManager.CLASS_AUTH_STATUS;
    }
    if (this.elements.oauthConnectButton) {
      this.elements.oauthConnectButton.classList.remove('hidden');
    }
    if (this.elements.oauthDisconnectButton) {
      this.elements.oauthDisconnectButton.classList.add('hidden');
    }

    this.ui.hideDataSourceUpgradeNotice();
  }

  // ==========================================
  // OAuth 流程
  // ==========================================

  /**
   * 清理 OAuth 流程產生的暫存 State 與還原 UI 按鈕
   *
   * @private
   * @param {boolean} shouldRemoveState - 是否移除 session 中的 oauthState
   */
  async _cleanupOAuthState(shouldRemoveState) {
    if (shouldRemoveState) {
      try {
        await chrome.storage.session.remove('oauthState');
      } catch (cleanupError) {
        Logger.warn('[Auth] 清理 OAuth state 失敗', {
          action: 'startOAuthFlow',
          error: sanitizeApiError(cleanupError, 'oauth_state_cleanup'),
        });
      }
    }
    this._restoreOAuthConnectButton();
  }

  /**
   * 還原 OAuth 連接按鈕至預設狀態
   *
   * @private
   */
  _restoreOAuthConnectButton() {
    if (this.elements.oauthConnectButton) {
      this.elements.oauthConnectButton.disabled = false;
      this.elements.oauthConnectButton.textContent = UI_MESSAGES.AUTH.OAUTH_ACTION_CONNECT;
    }
  }

  /**
   * 處理 OAuth 流程中的錯誤並顯示給使用者
   *
   * @private
   * @param {Error} error - 錯誤物件
   */
  _handleOAuthError(error) {
    Logger.error('[錯誤] [Auth] Notion OAuth 流程失敗', {
      action: 'startOAuthFlow',
      error: sanitizeApiError(error, 'oauth_flow'),
    });

    const errorCode = typeof error?.code === 'string' ? error.code : '';
    const errorMsg = this._resolveOAuthErrorMessage(error, errorCode);

    // 缺 OAUTH_CLIENT_ID 為環境設定錯誤，沿用獨立 MISSING_ENV_CONFIG 文案（不加 prefix）
    if (errorCode === 'OAUTH_MISSING_CLIENT_ID') {
      this.ui.showStatus(UI_MESSAGES.AUTH.MISSING_ENV_CONFIG, 'error');
      return;
    }

    this.ui.showStatus(`OAuth 連接失敗：${errorMsg}`, 'error');
  }

  /**
   * 映射 OAuth Callback Error
   *
   * @private
   * @param {object} error
   * @returns {string}
   */
  _mapCallbackError(error) {
    const cause = error?.cause;
    const oauthError = typeof cause === 'string' ? cause : '';

    if (oauthError === 'access_denied') {
      return UI_MESSAGES.AUTH.OAUTH_USER_CANCELLED;
    }
    if (oauthError === 'canceled' || oauthError === 'cancelled') {
      return UI_MESSAGES.AUTH.OAUTH_REDIRECT_URI_FORMAT_MISMATCH;
    }
    return UI_MESSAGES.AUTH.OAUTH_CALLBACK_ERROR_GENERIC(oauthError || 'unknown');
  }

  /**
   * 處理未知的 OAuth 錯誤
   *
   * @private
   * @param {object} error
   * @returns {string}
   */
  _fallbackOAuthErrorMessage(error) {
    const msg = error?.message || '';
    const msgLower = msg.toLowerCase();

    if (msgLower.includes('redirect_uri') || msgLower.includes('invalid redirect')) {
      return UI_MESSAGES.AUTH.OAUTH_INVALID_REDIRECT_URI;
    }
    return ErrorHandler.formatUserMessage(sanitizeApiError(error, 'oauth_flow'));
  }

  /**
   * 將 OAuth 錯誤映射為使用者可見的文案。主分派走 `error.code`；
   * 對於沒有 code 但 message 仍透露 redirect 線索的舊路徑保留 fallback heuristic。
   *
   * @private
   * @param {Error} error
   * @param {string} errorCode
   * @returns {string}
   */
  _resolveOAuthErrorMessage(error, errorCode) {
    const errorMap = {
      OAUTH_IDENTITY_UNAVAILABLE: UI_MESSAGES.AUTH.OAUTH_UNAVAILABLE,
      OAUTH_FLOW_CANCELLED: UI_MESSAGES.AUTH.OAUTH_USER_CANCELLED,
      SERVER_MISCONFIGURATION: UI_MESSAGES.AUTH.OAUTH_SERVER_MISCONFIGURATION,
      INVALID_REDIRECT_URI: UI_MESSAGES.AUTH.OAUTH_INVALID_REDIRECT_URI,
    };

    if (Object.hasOwn(errorMap, errorCode)) {
      return errorMap[errorCode];
    }

    if (errorCode === 'OAUTH_CALLBACK_ERROR') {
      return this._mapCallbackError(error);
    }

    return this._fallbackOAuthErrorMessage(error);
  }

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

      // 取得 authorization code（CSRF state、authUrl、launchWebAuthFlow、callback 解析、state 驗證皆在共用 initiator 中）
      const { code, redirectUri } = await initiateNotionOAuth();

      // 將 code 送到後端交換 Token，並落地 chrome.storage.local
      const tokenData = await exchangeNotionOAuthCode({ code, redirectUri });
      await saveNotionOAuthToken(tokenData);

      Logger.success('Notion OAuth 連接成功', {
        action: 'startOAuthFlow',
        workspace: tokenData.workspace_name,
      });

      this.ui.showStatus(`✅ 已成功連接 Notion — ${tokenData.workspace_name}`, 'success');

      // 更新 UI
      await this.checkAuthStatus();
    } catch (error) {
      this._handleOAuthError(error);
    } finally {
      // initiator 可能在拋錯前已寫入 CSRF state，總是清理；若無則為 idempotent no-op
      await this._cleanupOAuthState(true);
    }
  }

  /**
   * 斷開 OAuth 連接
   */
  async disconnectOAuth() {
    try {
      Logger.start('開始斷開 OAuth 連接', { action: 'disconnectOAuth' });
      const syncData = await chrome.storage.sync.get(['notionApiKey']);
      const nextAuthEpoch = await getNextAuthEpoch();

      await chrome.storage.local.remove([
        'notionAuthMode',
        'notionOAuthToken',
        'notionRefreshToken',
        'notionRefreshProof',
        'notionWorkspaceId',
        'notionWorkspaceName',
        'notionBotId',
      ]);
      await chrome.storage.local.set({ notionAuthEpoch: nextAuthEpoch });
      if (syncData.notionApiKey) {
        Logger.info('[Auth] 已清除 OAuth 資料（保留手動資料來源設定）', {
          action: 'disconnectOAuth',
        });
        Logger.info('[Auth] 偵測到手動 API Key，自動切回手動模式', {
          action: 'disconnectOAuth',
        });
      } else {
        await chrome.storage.sync.remove(DATA_SOURCE_KEYS);
        await chrome.storage.local.remove(DATA_SOURCE_KEYS);
        Logger.info('[Auth] 已清除 OAuth 資料與資料來源設定', {
          action: 'disconnectOAuth',
        });
      }

      await this.checkAuthStatus();
      this.ui.showStatus('已斷開 OAuth 連接', 'success');
    } catch (error) {
      Logger.error('[Auth] 斷開 OAuth 失敗', {
        action: 'disconnectOAuth',
        error: sanitizeApiError(error, 'disconnect_oauth'),
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
        error: sanitizeApiError(error, 'open_notion_page'),
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

      // 清除 sync 中的手動 Key 與資料來源
      await chrome.storage.sync.remove(['notionApiKey', ...DATA_SOURCE_KEYS]);
      await chrome.storage.local.remove(DATA_SOURCE_KEYS);

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
        error: sanitizeApiError(error, 'disconnect'),
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
      Logger.error('[Auth] API 測試失敗', {
        action: 'testApiKey',
        error: sanitizeApiError(error, 'test_api_key'),
      });
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
