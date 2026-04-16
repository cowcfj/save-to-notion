// @jest-environment jsdom
/* global document, chrome */
import { AuthManager } from '../../../options/AuthManager.js';
import { UIManager } from '../../../options/UIManager.js';
import Logger from '../../../scripts/utils/Logger.js';
import { UI_MESSAGES } from '../../../scripts/config/messages.js';
import { NOTION_OAUTH } from '../../../scripts/config/api.js';
import { BUILD_ENV } from '../../../scripts/config/env.js';
import { DATA_SOURCE_KEYS } from '../../../scripts/config/storageKeys.js';

// Mock dependencies
jest.mock('../../../scripts/config/env.js', () => ({
  ...jest.requireActual('../../../scripts/config/env.js'),
  BUILD_ENV: {
    ENABLE_OAUTH: true,
    OAUTH_SERVER_URL: 'https://test-server.example.com',
    OAUTH_CLIENT_ID: 'test-client-id',
    EXTENSION_API_KEY: 'test-api-key',
  },
}));
jest.mock('../../../options/UIManager.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('AuthManager', () => {
  let authManager = null;
  let mockUiManager = null;
  let mockLoadDatabases = null;

  beforeEach(() => {
    // DOM Setup
    document.body.innerHTML = `
        <div id="auth-status"></div>
        <button id="oauth-button"></button>
        <button id="disconnect-button"></button>
        <input id="api-key" />
        <input id="database-id" />
        <button id="test-api-button"></button>
        <input type="checkbox" id="enable-debug-logs" />
    `;

    mockUiManager = new UIManager();
    mockUiManager.showStatus = jest.fn();
    mockLoadDatabases = jest.fn();

    authManager = new AuthManager(mockUiManager);
    authManager.init({ loadDataSources: mockLoadDatabases });

    // Mock chrome storage
    globalThis.chrome = {
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
        session: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
      },
      tabs: {
        create: jest.fn().mockResolvedValue(),
      },
      identity: {
        launchWebAuthFlow: jest.fn().mockResolvedValue(),
        getRedirectURL: jest.fn().mockReturnValue('https://mocked.chromiumapp.org/'),
      },
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete globalThis.chrome;
  });

  test('checkAuthStatus updates UI when authenticated', async () => {
    const mockData = {
      notionApiKey: 'secret_123',
      notionDatabaseId: 'db_456',
    };

    chrome.storage.sync.get.mockResolvedValue(mockData);
    chrome.storage.local.get.mockResolvedValue({});

    await authManager.checkAuthStatus();

    expect(document.querySelector('#api-key').value).toBe('secret_123');
    expect(document.querySelector('#database-id').value).toBe('db_456');
    expect(document.querySelector('#auth-status').textContent).toContain('已連接');
    // Ensure mockLoadDatabases is called (might need setTimeout if inside checkAuthStatus it's async or complex)
    // Based on implementation, it calls loadDatabases immediately in handleConnectedState
    expect(mockLoadDatabases).toHaveBeenCalledWith('secret_123');
  });

  test('disconnectFromNotion clears storage and updates UI', async () => {
    chrome.storage.sync.remove.mockResolvedValue();
    chrome.storage.local.remove.mockResolvedValue();
    // Mock checkAuthStatus behavior (simulate disconnected state)
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.local.get.mockResolvedValue({});

    await authManager.disconnectFromNotion();

    expect(chrome.storage.sync.remove).toHaveBeenCalledWith(
      expect.arrayContaining(['notionApiKey'])
    );
    expect(mockUiManager.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('成功斷開'),
      'success'
    );
  });

  test('除錯切換成功顯示成功訊息', async () => {
    const toggle = document.querySelector('#enable-debug-logs');
    toggle.checked = true;
    chrome.storage.sync.set.mockResolvedValueOnce();

    toggle.dispatchEvent(new Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockUiManager.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.SETTINGS.DEBUG_LOGS_ENABLED,
      'success'
    );
  });

  test('除錯切換失敗顯示錯誤訊息', async () => {
    const toggle = document.querySelector('#enable-debug-logs');
    toggle.checked = true;
    chrome.storage.sync.set.mockRejectedValueOnce(new Error('Storage error'));

    toggle.dispatchEvent(new Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockUiManager.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('切換日誌模式失敗'),
      'error'
    );
  });
});

describe('AuthManager Extended', () => {
  let authManager = null;
  let mockUiManager = null;
  let mockLoadDatabases = null;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="auth-status"></div>
      <div id="oauth-status"></div>
      <button id="oauth-button"></button>
      <button id="oauth-connect-button">${UI_MESSAGES.AUTH.OAUTH_ACTION_CONNECT}</button>
      <button id="oauth-disconnect-button"></button>
      <button id="disconnect-button"></button>
      <input id="api-key" />
      <input id="database-id" />
      <input id="title-template" />
      <input id="add-source" type="checkbox" />
      <input id="add-timestamp" type="checkbox" />
      <select id="highlight-style">
        <option value="background">background</option>
        <option value="underline">underline</option>
      </select>
      <input id="enable-debug-logs" type="checkbox" />
      <button id="test-api-button"></button>
      <div id="connect-status"></div>
    `;

    mockUiManager = new UIManager();
    mockUiManager.showStatus = jest.fn();
    mockUiManager.showDataSourceUpgradeNotice = jest.fn();
    mockUiManager.hideDataSourceUpgradeNotice = jest.fn();
    mockLoadDatabases = jest.fn();

    globalThis.chrome = {
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
        session: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
      },
      tabs: {
        create: jest.fn().mockResolvedValue(),
      },
      identity: {
        launchWebAuthFlow: jest.fn().mockResolvedValue(),
        getRedirectURL: jest.fn().mockReturnValue('https://mocked.chromiumapp.org/'),
      },
      runtime: {
        lastError: null,
      },
    };

    globalThis.fetch = jest.fn();

    authManager = new AuthManager(mockUiManager);
    authManager.init({ loadDataSources: mockLoadDatabases });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.fetch;
  });

  describe('init', () => {
    test('應正確初始化元素', () => {
      expect(authManager.elements.oauthButton).toBeTruthy();
      expect(authManager.elements.disconnectButton).toBeTruthy();
      expect(authManager.elements.apiKeyInput).toBeTruthy();
    });

    test('應立即綁定事件，不受遷移流程阻塞', async () => {
      const setupSpy = jest.spyOn(authManager, 'setupEventListeners');

      const initPromise = authManager.init({ loadDataSources: mockLoadDatabases });

      expect(setupSpy).toHaveBeenCalledTimes(1);
      await initPromise;
    });
  });

  describe('handleConnectedState', () => {
    test('已連接狀態應顯示連接訊息', async () => {
      const result = {
        notionApiKey: 'secret_test',
        notionDatabaseId: 'db_123',
      };

      await authManager.handleConnectedState(result);

      expect(document.querySelector('#auth-status').textContent).toContain('已連接');
    });

    test('應調用 loadDatabases', async () => {
      const result = {
        notionApiKey: 'secret_test',
        notionDatabaseId: 'db_123',
      };

      await authManager.handleConnectedState(result);

      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_test');
    });

    test('讀取 local storage 失敗時應記錄錯誤', async () => {
      jest.spyOn(authManager, '_handleManualConnectedState').mockImplementationOnce(() => {
        throw new Error('storage read failed');
      });

      await authManager.handleConnectedState({ notionApiKey: 'secret_test' });

      expect(Logger.error).toHaveBeenCalledWith('[存儲] 讀取設定失敗', {
        action: 'handleConnectedState',
        error: expect.any(String),
      });
    });

    test('OAuth 已連接但缺少保存目標時應顯示引導訊息', async () => {
      chrome.storage.local.get.mockResolvedValue({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth-token',
        notionWorkspaceName: 'Test Workspace',
      });
      chrome.storage.sync.get.mockResolvedValue({});

      await authManager.checkAuthStatus();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('選擇保存目標'),
        expect.any(String)
      );
    });
  });

  describe('handleDisconnectedState', () => {
    test('未連接狀態應顯示連接按鈕', () => {
      authManager.handleDisconnectedState();

      expect(document.querySelector('#auth-status').textContent).toContain('未連接');
    });
  });

  describe('startNotionSetup', () => {
    test('應打開 Notion 授權頁面', () => {
      authManager.startNotionSetup();

      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('notion.so'),
        })
      );
    });
  });

  describe('testApiKey', () => {
    test('API Key 為空時應顯示錯誤', async () => {
      document.querySelector('#api-key').value = '';

      await authManager.testApiKey();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('API Key'),
        'error'
      );
    });

    test('有效 API Key 應調用 loadDatabases', async () => {
      document.querySelector('#api-key').value = 'secret_valid_key_1234567890';

      mockLoadDatabases.mockResolvedValueOnce([]);

      await authManager.testApiKey();

      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_valid_key_1234567890');
    });

    test('API 請求失敗應顯示錯誤', async () => {
      document.querySelector('#api-key').value = 'secret_invalid';

      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await authManager.testApiKey();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    test('網絡錯誤應顯示錯誤訊息', async () => {
      document.querySelector('#api-key').value = 'secret_test';

      globalThis.fetch.mockRejectedValueOnce(new Error('Network error'));

      await authManager.testApiKey();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    test('當 loadDatabases 不返回 Promise 時應處理按鈕狀態', async () => {
      document.querySelector('#api-key').value = 'secret_test_long_enough_12345';
      // Mock return non-promise
      mockLoadDatabases.mockReturnValueOnce();

      await authManager.testApiKey();

      const btn = document.querySelector('#test-api-button');
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toBe('測試 API Key');
    });
  });

  describe('checkAuthStatus', () => {
    test('無 API Key 時應顯示未連接', async () => {
      chrome.storage.sync.get.mockResolvedValue({});
      chrome.storage.local.get.mockResolvedValue({});

      await authManager.checkAuthStatus();

      expect(document.querySelector('#auth-status').textContent).toContain('未連接');
    });

    test('OAuth 已連接時應更新 OAuth 與通用設定', async () => {
      chrome.storage.local.get.mockResolvedValue({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_token_123',
        notionWorkspaceName: 'My Workspace',
        notionDataSourceId: 'ds_local_123',
      });
      chrome.storage.sync.get.mockResolvedValue({
        titleTemplate: '{title} - custom',
        addSource: true,
        addTimestamp: false,
        highlightStyle: 'underline',
        enableDebugLogs: true,
      });

      await authManager.checkAuthStatus();

      expect(authManager.currentAuthMode).toBe('oauth');
      expect(document.querySelector('#oauth-status').textContent).toContain(
        '已連接 — My Workspace'
      );
      expect(document.querySelector('#oauth-connect-button').style.display).toBe('none');
      expect(document.querySelector('#oauth-disconnect-button').style.display).toBe('inline-flex');
      expect(mockLoadDatabases).toHaveBeenCalledWith('oauth_token_123');
      expect(document.querySelector('#database-id').value).toBe('ds_local_123');
      expect(document.querySelector('#title-template').value).toBe('{title} - custom');
      expect(document.querySelector('#add-source').checked).toBe(true);
      expect(document.querySelector('#add-timestamp').checked).toBe(false);
      expect(document.querySelector('#highlight-style').value).toBe('underline');
      expect(document.querySelector('#enable-debug-logs').checked).toBe(true);
    });

    test('OAuth 模式缺 local 儲存時應備援至 sync 讀取保存目標', async () => {
      chrome.storage.local.get.mockResolvedValue({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_token_123',
      });
      chrome.storage.sync.get.mockResolvedValue({
        notionDataSourceId: 'ds_sync_123',
      });

      await authManager.checkAuthStatus();

      expect(document.querySelector('#database-id').value).toBe('ds_sync_123');
    });

    test('OAuth 模式缺 local 儲存時應等待非同步遷移完成', async () => {
      let migrationCompleted = false;

      chrome.storage.local.get.mockResolvedValue({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_token_123',
      });
      chrome.storage.sync.get.mockResolvedValue({
        notionDataSourceId: 'ds_sync_123',
      });
      chrome.storage.local.set.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              migrationCompleted = true;
              resolve();
            }, 0);
          })
      );

      await authManager.checkAuthStatus();

      expect(migrationCompleted).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notionDataSourceId: 'ds_sync_123',
        notionDatabaseId: 'ds_sync_123',
      });
      expect(Logger.success).toHaveBeenCalledWith(
        '[Settings] 已自動遷移 dataSourceId 從 sync 至 local',
        {
          action: 'checkAuthStatus',
          operation: 'migrateDataSourceKey',
        }
      );
    });

    test('OAuth 模式缺 notionDataSourceId 時應提示升級', async () => {
      chrome.storage.local.get.mockResolvedValue({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_token_123',
      });
      chrome.storage.sync.get.mockResolvedValue({
        notionDatabaseId: 'db_legacy_456',
      });

      await authManager.checkAuthStatus();

      expect(mockUiManager.showDataSourceUpgradeNotice).toHaveBeenCalledWith('db_legacy_456');
      expect(mockUiManager.hideDataSourceUpgradeNotice).not.toHaveBeenCalled();
    });

    test('OAuth 已連接但 workspaceName 缺失時應使用繁中預設值', async () => {
      chrome.storage.local.get.mockResolvedValue({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_token_123',
      });
      chrome.storage.sync.get.mockResolvedValue({});

      await authManager.checkAuthStatus();

      expect(document.querySelector('#oauth-status').textContent).toContain(
        '已連接 — Notion 工作區'
      );
    });

    test('手動模式應優先使用 local 的 notionDataSourceId', async () => {
      chrome.storage.local.get.mockResolvedValue({
        notionDataSourceId: 'ds_local_123',
      });
      chrome.storage.sync.get.mockResolvedValue({
        notionApiKey: 'secret_manual_key',
        notionDataSourceId: 'ds_sync_123',
        notionDatabaseId: 'db_legacy_456',
      });

      await authManager.checkAuthStatus();

      expect(document.querySelector('#database-id').value).toBe('ds_local_123');
      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_manual_key');
    });

    test('手動模式在缺 notionDataSourceId 時應回退 notionDatabaseId', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.sync.get.mockResolvedValue({
        notionApiKey: 'secret_manual_key',
        notionDatabaseId: 'db_legacy_456',
      });

      await authManager.checkAuthStatus();

      expect(document.querySelector('#database-id').value).toBe('db_legacy_456');
    });

    test('storage 讀取失敗時應回退未連接狀態並記錄錯誤', async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error('local storage failed'));

      await authManager.checkAuthStatus();

      expect(authManager.currentAuthMode).toBeNull();
      expect(document.querySelector('#auth-status').textContent).toContain('未連接');
      expect(Logger.error).toHaveBeenCalledWith('[Auth] 讀取授權狀態失敗', {
        action: 'checkAuthStatus',
        error: expect.any(String),
      });
    });

    test('OAuth 模式 loadDataSources 拋錯時應攔截並記錄', async () => {
      chrome.storage.local.get.mockResolvedValue({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_token_123',
        notionWorkspaceName: 'My Workspace',
      });
      chrome.storage.sync.get.mockResolvedValue({});
      mockLoadDatabases.mockRejectedValueOnce(new Error('oauth load failed'));

      await authManager.checkAuthStatus();
      await Promise.resolve();
      await Promise.resolve();

      expect(Logger.error).toHaveBeenCalledWith('[Auth] 載入資料來源失敗', {
        action: 'loadDataSourcesOAuth',
        error: expect.any(String),
      });
    });

    test('手動模式 loadDataSources 拋錯時應攔截並記錄', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.sync.get.mockResolvedValue({
        notionApiKey: 'secret_manual_key',
      });
      mockLoadDatabases.mockRejectedValueOnce(new Error('manual load failed'));

      await authManager.checkAuthStatus();
      await Promise.resolve();
      await Promise.resolve();

      expect(Logger.error).toHaveBeenCalledWith('[Auth] 載入資料來源失敗', {
        action: 'loadDataSourcesManual',
        error: expect.any(String),
      });
    });
  });

  describe('startOAuthFlow', () => {
    test('成功流程應儲存 token 並更新狀態', async () => {
      jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('state-123');
      const checkAuthStatusSpy = jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();
      chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
        'https://mocked.chromiumapp.org/?code=oauth_code_abc&state=state-123'
      );
      chrome.storage.session.get.mockResolvedValueOnce({ oauthState: 'state-123' });
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'oauth_access_token',
          refresh_token: 'oauth_refresh_token',
          workspace_id: 'workspace_id_1',
          workspace_name: 'Workspace A',
          bot_id: 'bot_1',
        }),
      });

      await authManager.startOAuthFlow();

      expect(chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(
            `client_id=${encodeURIComponent(BUILD_ENV.OAUTH_CLIENT_ID)}`
          ),
        })
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BUILD_ENV.OAUTH_SERVER_URL}${NOTION_OAUTH.TOKEN_ENDPOINT}`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"code":"oauth_code_abc"'),
        })
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"redirect_uri":"https://mocked.chromiumapp.org/"'),
        })
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_access_token',
        notionRefreshToken: 'oauth_refresh_token',
        notionRefreshProof: null,
        notionWorkspaceId: 'workspace_id_1',
        notionWorkspaceName: 'Workspace A',
        notionBotId: 'bot_1',
        notionAuthEpoch: 1,
      });
      expect(chrome.storage.session.remove).toHaveBeenCalledWith('oauthState');
      expect(checkAuthStatusSpy).toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('已成功連接 Notion'),
        'success'
      );
      expect(document.querySelector('#oauth-connect-button').disabled).toBe(false);
      expect(document.querySelector('#oauth-connect-button').textContent).toBe(
        UI_MESSAGES.AUTH.OAUTH_ACTION_CONNECT
      );
    });

    test('token 回應缺少 access_token 時應中止存儲並顯示錯誤', async () => {
      jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('state-no-access');
      chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
        'https://mocked.chromiumapp.org/?code=oauth_code_abc&state=state-no-access'
      );
      chrome.storage.session.get.mockResolvedValueOnce({ oauthState: 'state-no-access' });
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          refresh_token: 'oauth_refresh_token',
          workspace_name: 'Workspace A',
        }),
      });

      await authManager.startOAuthFlow();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('OAuth token 回應缺少必要欄位'),
        'error'
      );
    });

    test('token 回應缺少 refresh_token 時應中止存儲並顯示錯誤', async () => {
      jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('state-no-refresh');
      chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
        'https://mocked.chromiumapp.org/?code=oauth_code_abc&state=state-no-refresh'
      );
      chrome.storage.session.get.mockResolvedValueOnce({ oauthState: 'state-no-refresh' });
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'oauth_access_token',
          workspace_name: 'Workspace A',
        }),
      });

      await authManager.startOAuthFlow();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('OAuth token 回應缺少必要欄位'),
        'error'
      );
    });

    test('清理舊 refresh_proof 失敗時仍應視為 OAuth 連接成功', async () => {
      jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('state-remove-proof-failed');
      chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
        'https://mocked.chromiumapp.org/?code=oauth_code_abc&state=state-remove-proof-failed'
      );
      chrome.storage.session.get.mockResolvedValueOnce({ oauthState: 'state-remove-proof-failed' });
      chrome.storage.local.remove.mockRejectedValueOnce(new Error('remove proof failed'));
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'oauth_access_token',
          refresh_token: 'oauth_refresh_token',
          workspace_id: 'workspace_id',
          workspace_name: 'Workspace A',
          bot_id: 'bot_id',
        }),
      });
      jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();

      await authManager.startOAuthFlow();

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          notionOAuthToken: 'oauth_access_token',
          notionRefreshToken: 'oauth_refresh_token',
          notionRefreshProof: null,
          notionWorkspaceId: 'workspace_id',
          notionWorkspaceName: 'Workspace A',
          notionBotId: 'bot_id',
          notionAuthEpoch: expect.any(Number),
        })
      );
      expect(Logger.warn).toHaveBeenCalledWith('[存儲] 清理舊的 refresh_proof 失敗，將忽略並繼續', {
        action: '_saveOAuthTokenData',
        error: expect.any(String),
      });
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        '✅ 已成功連接 Notion — Workspace A',
        'success'
      );
    });

    test('token 回應包含 refresh_proof 時應持久化 refresh proof', async () => {
      jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('state-with-proof');
      chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
        'https://mocked.chromiumapp.org/?code=oauth_code_with_proof&state=state-with-proof'
      );
      chrome.storage.session.get.mockResolvedValueOnce({ oauthState: 'state-with-proof' });
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'oauth_access_token_proof',
          refresh_token: 'oauth_refresh_token_proof',
          refresh_proof: 'oauth_refresh_proof_value',
          workspace_id: 'workspace_id_proof',
          workspace_name: 'Workspace Proof',
          bot_id: 'bot_id_proof',
        }),
      });
      jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();

      await authManager.startOAuthFlow();

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          notionAuthMode: 'oauth',
          notionOAuthToken: 'oauth_access_token_proof',
          notionRefreshToken: 'oauth_refresh_token_proof',
          notionRefreshProof: 'oauth_refresh_proof_value',
          notionWorkspaceId: 'workspace_id_proof',
          notionWorkspaceName: 'Workspace Proof',
          notionBotId: 'bot_id_proof',
          notionAuthEpoch: expect.any(Number),
        })
      );
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        '✅ 已成功連接 Notion — Workspace Proof',
        'success'
      );
      expect(Logger.success).toHaveBeenCalledWith('Notion OAuth 連接成功', {
        action: 'startOAuthFlow',
        workspace: 'Workspace Proof',
      });
    });

    test('CSRF 驗證失敗時應顯示錯誤且恢復按鈕', async () => {
      jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('state-abc');
      chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
        'https://mocked.chromiumapp.org/?code=oauth_code_abc&state=state-mismatch'
      );
      chrome.storage.session.get.mockResolvedValueOnce({ oauthState: 'state-abc' });

      await authManager.startOAuthFlow();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('OAuth 連接失敗'),
        'error'
      );
      expect(Logger.error).toHaveBeenCalledWith('[錯誤] [Auth] Notion OAuth 流程失敗', {
        action: 'startOAuthFlow',
        error: expect.any(String),
      });
      expect(chrome.storage.session.remove).toHaveBeenCalledWith('oauthState');
      expect(document.querySelector('#oauth-connect-button').disabled).toBe(false);
      expect(document.querySelector('#oauth-connect-button').textContent).toBe(
        UI_MESSAGES.AUTH.OAUTH_ACTION_CONNECT
      );
    });

    test('Identity API 不可用時應顯示明確錯誤且不進入 OAuth 流程', async () => {
      delete chrome.identity;

      await authManager.startOAuthFlow();

      expect(Logger.error).toHaveBeenCalledWith('[Auth] OAuth Identity API 不可用', {
        action: 'startOAuthFlow',
        missingIdentityApi: expect.arrayContaining(['getRedirectURL', 'launchWebAuthFlow']),
      });
      expect(chrome.storage.session.set).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        `OAuth 連接失敗：${UI_MESSAGES.AUTH.OAUTH_UNAVAILABLE}`,
        'error'
      );
      expect(document.querySelector('#oauth-connect-button').disabled).toBe(false);
      expect(document.querySelector('#oauth-connect-button').textContent).toBe(
        UI_MESSAGES.AUTH.OAUTH_ACTION_CONNECT
      );
    });

    test('缺少 OAUTH_CLIENT_ID 時應記錄錯誤、清理 state 並恢復按鈕', async () => {
      BUILD_ENV.OAUTH_CLIENT_ID = '   ';

      await authManager.startOAuthFlow();

      expect(Logger.error).toHaveBeenCalledWith('[Auth] OAuth Client ID 未設定', {
        action: 'startOAuthFlow',
        missingBuildEnvKeys: ['OAUTH_CLIENT_ID'],
      });
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        UI_MESSAGES.AUTH.MISSING_ENV_CONFIG,
        'error'
      );
      expect(chrome.storage.session.set).not.toHaveBeenCalled();
      expect(chrome.identity.launchWebAuthFlow).not.toHaveBeenCalled();
      expect(chrome.storage.session.remove).toHaveBeenCalledWith('oauthState');
      expect(document.querySelector('#oauth-connect-button').disabled).toBe(false);
      expect(document.querySelector('#oauth-connect-button').textContent).toBe(
        UI_MESSAGES.AUTH.OAUTH_ACTION_CONNECT
      );
    });
  });

  describe('disconnectOAuth', () => {
    test('有手動 API Key 時應保留資料來源設定', async () => {
      const checkAuthStatusSpy = jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();
      chrome.storage.sync.get.mockResolvedValueOnce({ notionApiKey: 'secret_manual_fallback' });

      await authManager.disconnectOAuth();

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'notionAuthMode',
        'notionOAuthToken',
        'notionRefreshToken',
        'notionRefreshProof',
        'notionWorkspaceId',
        'notionWorkspaceName',
        'notionBotId',
      ]);
      expect(chrome.storage.sync.remove).not.toHaveBeenCalledWith([
        'notionDataSourceId',
        'notionDatabaseId',
      ]);
      expect(checkAuthStatusSpy).toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith('已斷開 OAuth 連接', 'success');
    });

    test('無手動 API Key 時應清除資料來源設定', async () => {
      const checkAuthStatusSpy = jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();
      chrome.storage.sync.get.mockResolvedValueOnce({});

      await authManager.disconnectOAuth();

      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(DATA_SOURCE_KEYS);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(DATA_SOURCE_KEYS);
      expect(checkAuthStatusSpy).toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith('已斷開 OAuth 連接', 'success');
    });

    test('斷開失敗時應顯示錯誤', async () => {
      chrome.storage.local.remove.mockRejectedValueOnce(new Error('remove failed'));

      await authManager.disconnectOAuth();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('斷開 OAuth 失敗'),
        'error'
      );
    });
  });

  describe('AuthManager static token methods', () => {
    test('getActiveNotionToken: OAuth 優先', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth_token',
      });

      const result = await AuthManager.getActiveNotionToken();

      expect(result).toEqual({ token: 'oauth_token', mode: 'oauth' });
    });

    test('getActiveNotionToken: fallback 到手動 API Key', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({
        notionAuthMode: 'manual',
        notionOAuthToken: null,
      });
      chrome.storage.sync.get.mockResolvedValueOnce({ notionApiKey: 'secret_manual_key' });

      const result = await AuthManager.getActiveNotionToken();

      expect(result).toEqual({ token: 'secret_manual_key', mode: 'manual' });
    });

    test('getActiveNotionToken: 無可用 token', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({});
      chrome.storage.sync.get.mockResolvedValueOnce({});

      const result = await AuthManager.getActiveNotionToken();

      expect(result).toEqual({ token: null, mode: null });
    });

    test('refreshOAuthToken: 缺少 refresh token 時回傳 null', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({});

      const result = await AuthManager.refreshOAuthToken();

      expect(result).toBeNull();
    });

    test('refreshOAuthToken: API 失敗時回傳 null', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({ notionRefreshToken: 'refresh_1' });
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await AuthManager.refreshOAuthToken();

      expect(result).toBeNull();
    });

    test('refreshOAuthToken: 成功刷新並回傳 access token', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({
        notionRefreshToken: 'refresh_2',
        notionRefreshProof: 'proof_2',
      });
      chrome.storage.local.get.mockResolvedValueOnce({
        notionAuthMode: 'oauth',
        notionRefreshToken: 'refresh_2',
      });
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          refresh_proof: 'proof_2_new',
        }),
      });

      const result = await AuthManager.refreshOAuthToken();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BUILD_ENV.OAUTH_SERVER_URL}${NOTION_OAUTH.REFRESH_ENDPOINT}`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Extension-Key': BUILD_ENV.EXTENSION_API_KEY,
          }),
          body: expect.stringContaining('"refresh_token":"refresh_2"'),
        })
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BUILD_ENV.OAUTH_SERVER_URL}${NOTION_OAUTH.REFRESH_ENDPOINT}`,
        expect.objectContaining({
          body: expect.stringContaining('"refresh_proof":"proof_2"'),
        })
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notionOAuthToken: 'new_access_token',
        notionRefreshToken: 'new_refresh_token',
        notionRefreshProof: 'proof_2_new',
        notionAuthEpoch: 1,
      });
      expect(result).toBe('new_access_token');
    });
  });

  describe('disconnectFromNotion extended', () => {
    test('斷開連接應清除 API Key 輸入', async () => {
      document.querySelector('#api-key').value = 'secret_test';

      chrome.storage.sync.remove.mockResolvedValue();
      chrome.storage.local.remove.mockResolvedValue();
      chrome.storage.sync.get.mockResolvedValue({});
      chrome.storage.local.get.mockResolvedValue({});

      await authManager.disconnectFromNotion();

      expect(document.querySelector('#api-key').value).toBe('');
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith([
        'notionApiKey',
        ...DATA_SOURCE_KEYS,
      ]);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(DATA_SOURCE_KEYS);
    });

    test('斷開連接失敗應處理錯誤', async () => {
      chrome.storage.sync.remove.mockRejectedValueOnce(new Error('Storage failure'));

      await authManager.disconnectFromNotion();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('斷開連接失敗'),
        'error'
      );
    });
  });
});
