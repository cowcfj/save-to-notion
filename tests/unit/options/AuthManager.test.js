/**
 * @jest-environment jsdom
 */
/* global document, chrome */
import { jest } from '@jest/globals';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import { NOTION_OAUTH } from '../../../scripts/config/extension/notionAuth.js';
import { DATA_SOURCE_KEYS } from '../../../scripts/config/shared/storage.js';

const mockBuildEnv = {
  ENABLE_OAUTH: true,
  OAUTH_SERVER_URL: 'https://test-server.example.com',
  OAUTH_CLIENT_ID: 'test-client-id',
  EXTENSION_API_KEY: 'test-api-key',
};

const mockConfirmDialog = jest.fn().mockResolvedValue(true);

const mockLogger = {
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

const mockEnvModule = {
  BUILD_ENV: mockBuildEnv,
  default: {
    BUILD_ENV: mockBuildEnv,
  },
};

jest.unstable_mockModule('../../../scripts/config/env/index.js', () => mockEnvModule);
jest.unstable_mockModule('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: mockConfirmDialog,
}));
jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: mockLogger,
}));

jest.mock('../../../scripts/config/env/index.js', () => mockEnvModule);
jest.mock('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: mockConfirmDialog,
}));
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: mockLogger,
}));

let AuthManager;
let UIManager;
let Logger;
let BUILD_ENV;

const OAUTH_REDIRECT_ORIGIN = 'https://mocked.chromiumapp.org/';

function createChromeStorageAreaMock() {
  return {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(),
    remove: jest.fn().mockResolvedValue(),
  };
}

function installChromeMock({ includeRuntime = false } = {}) {
  globalThis.chrome = {
    storage: {
      sync: createChromeStorageAreaMock(),
      local: createChromeStorageAreaMock(),
      session: createChromeStorageAreaMock(),
    },
    tabs: {
      create: jest.fn().mockResolvedValue(),
    },
    identity: {
      launchWebAuthFlow: jest.fn().mockResolvedValue(),
      getRedirectURL: jest.fn().mockReturnValue(OAUTH_REDIRECT_ORIGIN),
    },
    ...(includeRuntime
      ? {
          runtime: {
            lastError: null,
          },
        }
      : {}),
  };
}

function renderBasicAuthDom() {
  document.body.innerHTML = `
        <div id="auth-status"></div>
        <button id="oauth-button"></button>
        <button id="disconnect-button"></button>
        <input id="api-key" />
        <input id="database-id" />
        <button id="test-api-button"></button>
        <input type="checkbox" id="enable-debug-logs" />
    `;
}
function renderExtendedAuthDom() {
  document.body.innerHTML = `
      <div id="auth-status"></div>
      <div id="oauth-status"></div>
      <button id="oauth-button"></button>
      <button id="disconnect-button"></button>
      <input type="checkbox" id="oauth-connection-toggle" />
      <input id="api-key" />
      <input id="database-id" />
      <input id="title-template" />
      <input id="add-source" type="checkbox" />
      <input id="add-timestamp" type="checkbox" />
      <fieldset id="highlight-style-group">
        <input type="radio" name="highlightStyle" value="background" checked />
        <input type="radio" name="highlightStyle" value="underline" />
      </fieldset>
      <input id="floating-rail-enabled" type="checkbox" />
      <fieldset id="floating-rail-position-group">
        <input type="radio" name="floatingRailPosition" value="top" />
        <input type="radio" name="floatingRailPosition" value="middle" checked />
        <input type="radio" name="floatingRailPosition" value="bottom" />
      </fieldset>
      <fieldset id="floating-rail-size-group">
        <input type="radio" name="floatingRailSize" value="small" />
        <input type="radio" name="floatingRailSize" value="large" checked />
      </fieldset>
      <input id="enable-debug-logs" type="checkbox" />
      <button id="test-api-button"></button>
      <div id="connect-status"></div>
    `;
}

function createOptionsUiManagerMock() {
  const uiManager = new UIManager();
  uiManager.showStatus = jest.fn();
  uiManager.showDataSourceUpgradeNotice = jest.fn();
  uiManager.hideDataSourceUpgradeNotice = jest.fn();
  return uiManager;
}

async function createInitializedAuthManager(uiManager, loadDataSources) {
  const manager = new AuthManager(uiManager);
  await manager.init({ loadDataSources });
  return manager;
}

async function changeDebugLogsToggle(checked) {
  const toggle = document.querySelector('#enable-debug-logs');
  toggle.checked = checked;
  toggle.dispatchEvent(new Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
}

function setOAuthAuthStatusStorage({ local = {}, sync = {} } = {}) {
  chrome.storage.local.get.mockResolvedValue({
    notionAuthMode: 'oauth',
    notionOAuthToken: 'oauth_token_123',
    notionWorkspaceName: 'My Workspace',
    ...local,
  });
  chrome.storage.sync.get.mockResolvedValue(sync);
}

function setManualAuthStatusStorage(sync = {}) {
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.sync.get.mockResolvedValue({
    notionApiKey: 'secret_manual_key',
    ...sync,
  });
}

function arrangeOAuthCodeCallback({ state, code = 'oauth_code_abc' }) {
  jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(state);
  chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
    `${OAUTH_REDIRECT_ORIGIN}?code=${code}&state=${state}`
  );
  chrome.storage.session.get.mockResolvedValueOnce({ oauthState: state });
}

function arrangeOAuthErrorCallback({ state, error }) {
  jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(state);
  chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
    `${OAUTH_REDIRECT_ORIGIN}?error=${error}&state=${state}`
  );
  chrome.storage.session.get.mockResolvedValueOnce({ oauthState: state });
}

function mockTokenExchangeResponse(body, { ok = true, status } = {}) {
  globalThis.fetch.mockResolvedValueOnce({
    ok,
    ...(status ? { status } : {}),
    json: jest.fn().mockResolvedValue(body),
  });
}

beforeAll(async () => {
  const authManagerModule = await import('../../../pages/options/AuthManager.js');
  AuthManager = authManagerModule.AuthManager;
  const uiManagerModule = await import('../../../pages/options/UIManager.js');
  UIManager = uiManagerModule.UIManager;
  const loggerModule = await import('../../../scripts/utils/Logger.js');
  Logger = loggerModule.default;
  const envModule = await import('../../../scripts/config/env/index.js');
  BUILD_ENV = envModule.BUILD_ENV;
});

describe('AuthManager', () => {
  let authManager = null;
  let mockUiManager = null;
  let mockLoadDatabases = null;

  beforeEach(async () => {
    renderBasicAuthDom();
    mockUiManager = createOptionsUiManagerMock();
    mockLoadDatabases = jest.fn();

    installChromeMock();
    authManager = await createInitializedAuthManager(mockUiManager, mockLoadDatabases);
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
    chrome.storage.sync.set.mockResolvedValueOnce();

    await changeDebugLogsToggle(true);

    expect(mockUiManager.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.SETTINGS.DEBUG_LOGS_ENABLED,
      'success'
    );
  });

  test('除錯切換失敗顯示錯誤訊息', async () => {
    chrome.storage.sync.set.mockRejectedValueOnce(new Error('Storage error'));

    await changeDebugLogsToggle(true);

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

  beforeEach(async () => {
    renderExtendedAuthDom();
    mockUiManager = createOptionsUiManagerMock();
    mockLoadDatabases = jest.fn();

    installChromeMock({ includeRuntime: true });
    globalThis.fetch = jest.fn();

    authManager = await createInitializedAuthManager(mockUiManager, mockLoadDatabases);
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

    test('API Key 輸入應使用類別常數控制資料來源載入門檻與防抖延遲', () => {
      const originalMinLength = AuthManager.MIN_API_KEY_LENGTH_FOR_DATASOURCE_LOAD;
      const originalDebounceMs = AuthManager.API_KEY_INPUT_DEBOUNCE_MS;
      jest.useFakeTimers();

      try {
        AuthManager.MIN_API_KEY_LENGTH_FOR_DATASOURCE_LOAD = 3;
        AuthManager.API_KEY_INPUT_DEBOUNCE_MS = 25;
        const apiKeyInput = document.querySelector('#api-key');

        apiKeyInput.value = 'abc';
        apiKeyInput.dispatchEvent(new Event('input'));
        jest.advanceTimersByTime(AuthManager.API_KEY_INPUT_DEBOUNCE_MS);
        expect(mockLoadDatabases).not.toHaveBeenCalled();

        apiKeyInput.value = 'abcd';
        apiKeyInput.dispatchEvent(new Event('input'));
        jest.advanceTimersByTime(AuthManager.API_KEY_INPUT_DEBOUNCE_MS - 1);
        expect(mockLoadDatabases).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(mockLoadDatabases).toHaveBeenCalledWith('abcd');
      } finally {
        AuthManager.MIN_API_KEY_LENGTH_FOR_DATASOURCE_LOAD = originalMinLength;
        AuthManager.API_KEY_INPUT_DEBOUNCE_MS = originalDebounceMs;
        jest.useRealTimers();
      }
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
        'info'
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

    test('有效 API Key 驗證成功後應保存 notionApiKey 並顯示成功', async () => {
      document.querySelector('#api-key').value = 'secret_valid_key_1234567890';
      mockLoadDatabases.mockResolvedValueOnce([]);

      await authManager.testApiKey();

      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_valid_key_1234567890');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        notionApiKey: 'secret_valid_key_1234567890',
      });
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        UI_MESSAGES.SETTINGS.API_KEY_SAVE_SUCCESS,
        'success'
      );
    });

    test('API Key 驗證失敗時不應保存 notionApiKey', async () => {
      document.querySelector('#api-key').value = 'secret_invalid_key_1234567890';
      mockLoadDatabases.mockRejectedValueOnce(new Error('Unauthorized'));

      await authManager.testApiKey();

      expect(chrome.storage.sync.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ notionApiKey: expect.any(String) })
      );
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        UI_MESSAGES.SETTINGS.SAVE_FAILED,
        'error'
      );
    });

    test('API Key 格式錯誤時不應保存 notionApiKey', async () => {
      document.querySelector('#api-key').value = 'short';

      await authManager.testApiKey();

      expect(mockLoadDatabases).not.toHaveBeenCalled();
      expect(chrome.storage.sync.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ notionApiKey: expect.any(String) })
      );
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        UI_MESSAGES.SETTINGS.API_KEY_FORMAT_ERROR,
        'error'
      );
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
      expect(document.querySelector('#oauth-connection-toggle').checked).toBe(true);
      expect(document.querySelector('#oauth-connection-toggle').disabled).toBe(false);
      expect(mockLoadDatabases).toHaveBeenCalledWith('oauth_token_123');
      expect(document.querySelector('#database-id').value).toBe('ds_local_123');
      expect(document.querySelector('#title-template').value).toBe('{title} - custom');
      expect(document.querySelector('#add-source').checked).toBe(true);
      expect(document.querySelector('#add-timestamp').checked).toBe(false);
      expect(
        document.querySelector('input[name="highlightStyle"][value="underline"]').checked
      ).toBe(true);
      expect(document.querySelector('#enable-debug-logs').checked).toBe(true);
      expect(document.querySelector('#add-source').getAttribute('aria-checked')).toBe('true');
      expect(document.querySelector('#add-timestamp').getAttribute('aria-checked')).toBe('false');
      expect(document.querySelector('#floating-rail-enabled').getAttribute('aria-checked')).toBe(
        'true'
      );
      expect(document.querySelector('#enable-debug-logs').getAttribute('aria-checked')).toBe(
        'true'
      );
    });

    test('偏好設定 switch 變更時應同步 aria-checked', async () => {
      renderExtendedAuthDom();
      authManager = await createInitializedAuthManager(mockUiManager, mockLoadDatabases);

      const addSource = document.querySelector('#add-source');
      addSource.checked = true;
      addSource.dispatchEvent(new Event('change'));
      expect(addSource.getAttribute('aria-checked')).toBe('true');

      addSource.checked = false;
      addSource.dispatchEvent(new Event('change'));
      expect(addSource.getAttribute('aria-checked')).toBe('false');
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

    test.each([
      {
        mode: 'OAuth',
        setAuthStorage: setOAuthAuthStatusStorage,
        loadErrorMessage: 'oauth load failed',
        expectedAction: 'loadDataSourcesOAuth',
      },
      {
        mode: '手動',
        setAuthStorage: setManualAuthStatusStorage,
        loadErrorMessage: 'manual load failed',
        expectedAction: 'loadDataSourcesManual',
      },
    ])(
      '$mode 模式 loadDataSources 拋錯時應攔截並記錄',
      async ({ setAuthStorage, loadErrorMessage, expectedAction }) => {
        setAuthStorage();
        mockLoadDatabases.mockRejectedValueOnce(new Error(loadErrorMessage));

        await authManager.checkAuthStatus();
        await Promise.resolve();
        await Promise.resolve();

        expect(Logger.error).toHaveBeenCalledWith(
          '[Auth] 載入資料來源失敗',
          expect.objectContaining({
            action: expectedAction,
            error: expect.any(String),
          })
        );
      }
    );

    test('OAuth 模式 loadDataSources 同步拋錯時應由資料來源載入流程攔截', async () => {
      setOAuthAuthStatusStorage();
      mockLoadDatabases.mockImplementationOnce(() => {
        throw new Error('sync oauth load failed');
      });

      await authManager.checkAuthStatus();

      expect(Logger.error).toHaveBeenCalledWith('[Auth] 載入資料來源失敗', {
        action: 'loadDataSourcesOAuth',
        error: expect.any(String),
      });
      expect(Logger.error).not.toHaveBeenCalledWith('[Auth] 讀取授權狀態失敗', expect.any(Object));
    });

    test('OAuth 錯誤映射應忽略 prototype chain 上的 error code', () => {
      const message = authManager._resolveOAuthErrorMessage(
        new Error('invalid redirect_uri provided by OAuth server'),
        'constructor'
      );

      expect(message).toBe(UI_MESSAGES.AUTH.OAUTH_INVALID_REDIRECT_URI);
    });

    test('應從 sync storage 載入 floatingRailPosition 與 floatingRailSize', async () => {
      setManualAuthStatusStorage({
        floatingRailPosition: 'top',
        floatingRailSize: 'small',
      });

      await authManager.checkAuthStatus();

      expect(
        document.querySelector('input[name="floatingRailPosition"][value="top"]').checked
      ).toBe(true);
      expect(document.querySelector('input[name="floatingRailSize"][value="small"]').checked).toBe(
        true
      );
    });

    test('floatingRailPosition 與 floatingRailSize 缺值時應使用 middle/large 預設', async () => {
      setManualAuthStatusStorage();

      await authManager.checkAuthStatus();

      expect(
        document.querySelector('input[name="floatingRailPosition"][value="middle"]').checked
      ).toBe(true);
      expect(document.querySelector('input[name="floatingRailSize"][value="large"]').checked).toBe(
        true
      );
    });

    test('radio 類型設定為無效值時應回退至預設值', async () => {
      setManualAuthStatusStorage({
        floatingRailPosition: 'invalid',
        floatingRailSize: 'unknown',
        highlightStyle: 'foo',
      });

      await authManager.checkAuthStatus();

      expect(
        document.querySelector('input[name="floatingRailPosition"][value="middle"]').checked
      ).toBe(true);
      expect(document.querySelector('input[name="floatingRailSize"][value="large"]').checked).toBe(
        true
      );
      expect(
        document.querySelector('input[name="highlightStyle"][value="background"]').checked
      ).toBe(true);
    });
  });

  describe('startOAuthFlow', () => {
    test('成功流程應儲存 token 並更新狀態', async () => {
      const checkAuthStatusSpy = jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();
      arrangeOAuthCodeCallback({ state: 'state-123' });
      mockTokenExchangeResponse({
        access_token: 'oauth_access_token',
        refresh_token: 'oauth_refresh_token',
        workspace_id: 'workspace_id_1',
        workspace_name: 'Workspace A',
        bot_id: 'bot_1',
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
      expect(document.querySelector('#oauth-connection-toggle').disabled).toBe(false);
    });

    test.each([
      {
        missingField: 'access_token',
        state: 'state-no-access',
        tokenResponse: {
          refresh_token: 'oauth_refresh_token',
          workspace_name: 'Workspace A',
        },
      },
      {
        missingField: 'refresh_token',
        state: 'state-no-refresh',
        tokenResponse: {
          access_token: 'oauth_access_token',
          workspace_name: 'Workspace A',
        },
      },
    ])('token 回應缺少 $missingField 時應中止存儲並顯示錯誤', async ({ state, tokenResponse }) => {
      arrangeOAuthCodeCallback({ state });
      mockTokenExchangeResponse(tokenResponse);

      await authManager.startOAuthFlow();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('OAuth token 回應缺少必要欄位'),
        'error'
      );
    });

    test('清理舊 refresh_proof 失敗時仍應視為 OAuth 連接成功', async () => {
      arrangeOAuthCodeCallback({ state: 'state-remove-proof-failed' });
      chrome.storage.local.remove.mockRejectedValueOnce(new Error('remove proof failed'));
      mockTokenExchangeResponse({
        access_token: 'oauth_access_token',
        refresh_token: 'oauth_refresh_token',
        workspace_id: 'workspace_id',
        workspace_name: 'Workspace A',
        bot_id: 'bot_id',
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
        action: 'saveNotionOAuthToken',
        error: expect.any(String),
      });
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        '✅ 已成功連接 Notion — Workspace A',
        'success'
      );
    });

    test('token 回應包含 refresh_proof 時應持久化 refresh proof', async () => {
      arrangeOAuthCodeCallback({
        state: 'state-with-proof',
        code: 'oauth_code_with_proof',
      });
      mockTokenExchangeResponse({
        access_token: 'oauth_access_token_proof',
        refresh_token: 'oauth_refresh_token_proof',
        refresh_proof: 'oauth_refresh_proof_value',
        workspace_id: 'workspace_id_proof',
        workspace_name: 'Workspace Proof',
        bot_id: 'bot_id_proof',
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

    test.each([
      {
        errorCode: 'INVALID_REDIRECT_URI',
        state: 'state-invalid-redirect',
        code: 'oauth_code_invalid_redirect',
        status: 400,
        responseMessage: 'Invalid redirect_uri',
        expectedMessage: UI_MESSAGES.AUTH.OAUTH_INVALID_REDIRECT_URI,
      },
      {
        errorCode: 'SERVER_MISCONFIGURATION',
        state: 'state-server-misconfiguration',
        code: 'oauth_code_server_error',
        status: 500,
        responseMessage: 'Server misconfiguration: invalid NOTION_REDIRECT_URI',
        expectedMessage: UI_MESSAGES.AUTH.OAUTH_SERVER_MISCONFIGURATION,
      },
    ])(
      'token exchange 回傳 $errorCode 時應顯示對應錯誤訊息',
      async ({ errorCode, state, code, status, responseMessage, expectedMessage }) => {
        arrangeOAuthCodeCallback({ state, code });
        mockTokenExchangeResponse(
          {
            error_code: errorCode,
            message: responseMessage,
          },
          { ok: false, status }
        );

        await authManager.startOAuthFlow();

        expect(mockUiManager.showStatus).toHaveBeenCalledWith(
          `OAuth 連接失敗：${expectedMessage}`,
          'error'
        );
      }
    );

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
      expect(document.querySelector('#oauth-connection-toggle').disabled).toBe(false);
    });

    test('Identity API 不可用時應顯示明確錯誤且不進入 OAuth 流程', async () => {
      delete chrome.identity;

      await authManager.startOAuthFlow();

      expect(Logger.error).toHaveBeenCalledWith('[Auth] OAuth Identity API 不可用', {
        action: 'initiateNotionOAuth',
        missingIdentityApi: expect.arrayContaining(['getRedirectURL', 'launchWebAuthFlow']),
      });
      expect(chrome.storage.session.set).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        `OAuth 連接失敗：${UI_MESSAGES.AUTH.OAUTH_UNAVAILABLE}`,
        'error'
      );
      expect(document.querySelector('#oauth-connection-toggle').disabled).toBe(false);
    });

    test('缺少 OAUTH_CLIENT_ID 時應記錄錯誤、清理 state 並恢復按鈕', async () => {
      const originalOAuthClientId = BUILD_ENV.OAUTH_CLIENT_ID;
      BUILD_ENV.OAUTH_CLIENT_ID = '   ';

      try {
        await authManager.startOAuthFlow();

        expect(Logger.error).toHaveBeenCalledWith('[Auth] OAuth Client ID 未設定', {
          action: 'initiateNotionOAuth',
          missingBuildEnvKeys: ['OAUTH_CLIENT_ID'],
        });
        expect(mockUiManager.showStatus).toHaveBeenCalledWith(
          UI_MESSAGES.AUTH.MISSING_ENV_CONFIG,
          'error'
        );
        expect(chrome.storage.session.set).not.toHaveBeenCalled();
        expect(chrome.identity.launchWebAuthFlow).not.toHaveBeenCalled();
        expect(chrome.storage.session.remove).toHaveBeenCalledWith('oauthState');
        expect(document.querySelector('#oauth-connection-toggle').disabled).toBe(false);
      } finally {
        BUILD_ENV.OAUTH_CLIENT_ID = originalOAuthClientId;
      }
    });

    test('callback 帶 error=access_denied 時應顯示用戶取消文案', async () => {
      arrangeOAuthErrorCallback({ state: 'state-access-denied', error: 'access_denied' });

      await authManager.startOAuthFlow();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        `OAuth 連接失敗：${UI_MESSAGES.AUTH.OAUTH_USER_CANCELLED}`,
        'error'
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('callback 帶 error=canceled 時應顯示 redirect_uri 格式不符文案', async () => {
      arrangeOAuthErrorCallback({ state: 'state-canceled', error: 'canceled' });

      await authManager.startOAuthFlow();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        `OAuth 連接失敗：${UI_MESSAGES.AUTH.OAUTH_REDIRECT_URI_FORMAT_MISMATCH}`,
        'error'
      );
    });

    test('callback 帶其他 error 參數時應顯示通用 callback 失敗文案', async () => {
      arrangeOAuthErrorCallback({ state: 'state-misc', error: 'temporarily_unavailable' });

      await authManager.startOAuthFlow();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        `OAuth 連接失敗：${UI_MESSAGES.AUTH.OAUTH_CALLBACK_ERROR_GENERIC('temporarily_unavailable')}`,
        'error'
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

    test('取消斷開 OAuth 時應維持 toggle ON 且不執行清除', async () => {
      mockConfirmDialog.mockResolvedValueOnce(false);

      const checkAuthStatusSpy = jest.spyOn(authManager, 'checkAuthStatus').mockResolvedValue();

      await authManager.disconnectOAuth();

      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
      expect(checkAuthStatusSpy).not.toHaveBeenCalled();
      expect(document.querySelector('#oauth-connection-toggle').checked).toBe(true);
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
