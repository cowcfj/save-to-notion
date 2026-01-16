/**
 * @jest-environment jsdom
 */
/* global document, chrome */
import { AuthManager } from '../../../scripts/options/AuthManager.js';
import { UIManager } from '../../../scripts/options/UIManager.js';

// Mock dependencies
jest.mock('../../../scripts/options/UIManager.js');

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
    authManager.init({ loadDatabases: mockLoadDatabases });

    // Mock chrome storage
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
      tabs: {
        create: jest.fn(),
      },
    };

    // Mock Logger
    window.Logger = {
      info: jest.fn(),
      error: jest.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('checkAuthStatus updates UI when authenticated', () => {
    const mockData = {
      notionApiKey: 'secret_123',
      notionDatabaseId: 'db_456',
    };

    chrome.storage.sync.get.mockImplementation((keys, sendResponse) => {
      sendResponse(mockData);
    });

    authManager.checkAuthStatus();

    expect(document.getElementById('api-key').value).toBe('secret_123');
    expect(document.getElementById('database-id').value).toBe('db_456');
    expect(document.getElementById('auth-status').textContent).toContain('已連接');
    // Ensure mockLoadDatabases is called (might need setTimeout if inside checkAuthStatus it's async or complex)
    // Based on implementation, it calls loadDatabases immediately in handleConnectedState
    expect(mockLoadDatabases).toHaveBeenCalledWith('secret_123');
  });

  test('disconnectFromNotion clears storage and updates UI', async () => {
    chrome.storage.sync.remove.mockImplementation((keys, sendResponse) => {
      if (sendResponse) {
        sendResponse();
      }
    });
    // Mock checkAuthStatus behavior (simulate disconnected state)
    chrome.storage.sync.get.mockImplementation((keys, sendResponse) => {
      sendResponse({}); // Empty result
    });

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
      <button id="oauth-button"></button>
      <button id="disconnect-button"></button>
      <input id="api-key" />
      <input id="database-id" />
      <button id="test-api-button"></button>
      <div id="connect-status"></div>
    `;

    mockUiManager = new UIManager();
    mockUiManager.showStatus = jest.fn();
    mockLoadDatabases = jest.fn();

    global.chrome = {
      storage: {
        sync: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
      tabs: {
        create: jest.fn(),
      },
      runtime: {
        lastError: null,
      },
    };

    global.fetch = jest.fn();

    window.Logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    authManager = new AuthManager(mockUiManager);
    authManager.init({ loadDatabases: mockLoadDatabases });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('init', () => {
    test('應正確初始化元素', () => {
      expect(authManager.elements.oauthButton).toBeTruthy();
      expect(authManager.elements.disconnectButton).toBeTruthy();
      expect(authManager.elements.apiKeyInput).toBeTruthy();
    });
  });

  describe('handleConnectedState', () => {
    test('已連接狀態應顯示連接訊息', () => {
      const result = {
        notionApiKey: 'secret_test',
        notionDatabaseId: 'db_123',
      };

      authManager.handleConnectedState(result);

      expect(document.getElementById('auth-status').textContent).toContain('已連接');
    });

    test('應調用 loadDatabases', () => {
      const result = {
        notionApiKey: 'secret_test',
        notionDatabaseId: 'db_123',
      };

      authManager.handleConnectedState(result);

      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_test');
    });
  });

  describe('handleDisconnectedState', () => {
    test('未連接狀態應顯示連接按鈕', () => {
      authManager.handleDisconnectedState();

      expect(document.getElementById('auth-status').textContent).toContain('未連接');
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
      document.getElementById('api-key').value = '';

      await authManager.testApiKey();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('API Key'),
        'error'
      );
    });

    test('有效 API Key 應調用 loadDatabases', async () => {
      document.getElementById('api-key').value = 'secret_valid_key_1234567890';

      mockLoadDatabases.mockResolvedValueOnce([]);

      await authManager.testApiKey();

      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_valid_key_1234567890');
    });

    test('API 請求失敗應顯示錯誤', async () => {
      document.getElementById('api-key').value = 'secret_invalid';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await authManager.testApiKey();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    test('網絡錯誤應顯示錯誤訊息', async () => {
      document.getElementById('api-key').value = 'secret_test';

      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await authManager.testApiKey();

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    test('當 loadDatabases 不返回 Promise 時應處理按鈕狀態', () => {
      document.getElementById('api-key').value = 'secret_test_long_enough_12345';
      // Mock return non-promise
      mockLoadDatabases.mockReturnValueOnce();

      authManager.testApiKey();

      const btn = document.getElementById('test-api-button');
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toBe('測試 API Key');
    });
  });

  describe('checkAuthStatus', () => {
    test('無 API Key 時應顯示未連接', () => {
      chrome.storage.sync.get.mockImplementation((keys, sendResponse) => {
        sendResponse({});
      });

      authManager.checkAuthStatus();

      expect(document.getElementById('auth-status').textContent).toContain('未連接');
    });
  });

  describe('disconnectFromNotion extended', () => {
    test('斷開連接應清除 API Key 輸入', async () => {
      document.getElementById('api-key').value = 'secret_test';

      chrome.storage.sync.remove.mockImplementation((keys, sendResponse) => {
        if (sendResponse) {
          sendResponse();
        }
      });
      chrome.storage.sync.get.mockImplementation((keys, sendResponse) => {
        sendResponse({});
      });

      await authManager.disconnectFromNotion();

      expect(document.getElementById('api-key').value).toBe('');
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
