/**
 * @jest-environment jsdom
 */
/* global document */
import { AuthManager } from '../../../scripts/options/AuthManager.js';
import { UIManager } from '../../../scripts/options/UIManager.js';

// Mock dependencies
jest.mock('../../../scripts/options/UIManager.js');

describe('AuthManager', () => {
  let authManager;
  let mockUiManager;
  let mockLoadDatabases;

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

    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback(mockData);
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
    chrome.storage.sync.remove.mockImplementation((keys, callback) => {
      if (callback) {
        callback();
      }
    });
    // Mock checkAuthStatus behavior (simulate disconnected state)
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({}); // Empty result
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
