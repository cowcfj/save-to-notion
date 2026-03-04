// @jest-environment jsdom
/* global document, chrome */
import { AuthManager } from '../../../options/AuthManager.js';
import { UIManager } from '../../../options/UIManager.js';
import Logger from '../../../scripts/utils/Logger.js';
import { UI_MESSAGES } from '../../../scripts/config/messages.js';
import { NOTION_OAUTH } from '../../../scripts/config/constants.js';

// Mock dependencies
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
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
      jest.spyOn(authManager, '_handleManualConnectedState').mockImplementationOnce(() => {
        throw new Error('storage read failed');
      });

      await authManager.handleConnectedState({ notionApiKey: 'secret_test' });

      expect(loggerErrorSpy).toHaveBeenCalledWith('[存儲] 讀取設定失敗', {
        action: 'handleConnectedState',
        error: expect.any(String),
      });
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
      expect(document.querySelector('#title-template').value).toBe('{title} - custom');
      expect(document.querySelector('#add-source').checked).toBe(true);
      expect(document.querySelector('#add-timestamp').checked).toBe(false);
      expect(document.querySelector('#highlight-style').value).toBe('underline');
      expect(document.querySelector('#enable-debug-logs').checked).toBe(true);
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

    test('手動模式應優先使用 sync 的 notionDataSourceId', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.sync.get.mockResolvedValue({
        notionApiKey: 'secret_manual_key',
        notionDataSourceId: 'ds_sync_123',
        notionDatabaseId: 'db_legacy_456',
      });

      await authManager.checkAuthStatus();

      expect(document.querySelector('#database-id').value).toBe('ds_sync_123');
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

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${NOTION_OAUTH.SERVER_URL}${NOTION_OAUTH.TOKEN_ENDPOINT}`,
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
        notionWorkspaceId: 'workspace_id_1',
        notionWorkspaceName: 'Workspace A',
        notionBotId: 'bot_1',
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
  });

  describe('disconnectOAuth', () => {
    test('應清理 OAuth 資料並更新 UI', async () => {
      const checkAuthStatusSpy = jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();
      chrome.storage.sync.get.mockResolvedValueOnce({ notionApiKey: 'secret_manual_fallback' });

      await authManager.disconnectOAuth();

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'notionAuthMode',
        'notionOAuthToken',
        'notionRefreshToken',
        'notionWorkspaceId',
        'notionWorkspaceName',
        'notionBotId',
      ]);
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith([
        'notionDataSourceId',
        'notionDatabaseId',
      ]);
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
      chrome.storage.local.get.mockResolvedValueOnce({ notionRefreshToken: 'refresh_2' });
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
        }),
      });

      const result = await AuthManager.refreshOAuthToken();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${NOTION_OAUTH.SERVER_URL}${NOTION_OAUTH.REFRESH_ENDPOINT}`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"refresh_token":"refresh_2"'),
        })
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notionOAuthToken: 'new_access_token',
        notionRefreshToken: 'new_refresh_token',
      });
      expect(result).toBe('new_access_token');
    });
  });

  describe('disconnectFromNotion extended', () => {
    test('斷開連接應清除 API Key 輸入', async () => {
      document.querySelector('#api-key').value = 'secret_test';

      chrome.storage.sync.remove.mockResolvedValue();
      chrome.storage.sync.get.mockResolvedValue({});
      chrome.storage.local.get.mockResolvedValue({});

      await authManager.disconnectFromNotion();

      expect(document.querySelector('#api-key').value).toBe('');
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(
        expect.arrayContaining(['notionApiKey', 'notionDatabaseId', 'notionDataSourceId'])
      );
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
