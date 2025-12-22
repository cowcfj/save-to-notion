/**
 * @jest-environment jsdom
 */

/* skipcq: JS-0255 */

/**
 * migrationHandlers.js 單元測試
 *
 * 重點測試安全性驗證邏輯 validatePrivilegedRequest
 */

// Mock Logger
global.Logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock chrome API
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    lastError: null,
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn(),
    },
    get: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  scripting: {
    executeScript: jest.fn(),
  },
};

import { createMigrationHandlers } from '../../../../scripts/background/handlers/migrationHandlers.js';

describe('migrationHandlers', () => {
  let handlers = null;
  let mockServices = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServices = {}; // 目前 migrationHandlers 不依賴具體 services
    handlers = createMigrationHandlers(mockServices);
  });

  describe('validatePrivilegedRequest Security Checks', () => {
    // 應該允許的請求場景
    describe.each([
      {
        scenario: '來自 Popup/Background (無 tab 對象)',
        sender: {
          id: 'test-extension-id',
          // tab undefined
        },
      },
      {
        scenario: '來自 Options Page (在 Tab 中打開)',
        sender: {
          id: 'test-extension-id',
          tab: { id: 123 },
          url: 'chrome-extension://test-extension-id/options.html',
        },
      },
    ])('應該允許: $scenario', ({ sender }) => {
      test('安全性檢查通過', async () => {
        const sendResponse = jest.fn();
        const request = { url: 'https://example.com' };

        chrome.storage.local.get.mockResolvedValue({});

        await handlers.migration_execute(request, sender, sendResponse);

        // 如果通過了安全性檢查，它會嘗試讀取 storage
        // 如果被拒絕，它會直接調用 sendResponse with error '拒絕訪問...'
        expect(sendResponse).not.toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
        );
      });
    });

    // 應該拒絕的請求場景
    describe.each([
      {
        scenario: '來自 Content Script',
        sender: {
          id: 'test-extension-id',
          tab: { id: 456 },
          url: 'https://malicious-site.com',
        },
      },
      {
        scenario: '來自其他擴充功能',
        sender: {
          id: 'other-extension-id',
        },
      },
      {
        scenario: '來自 Content Script (sender.url 為網頁 URL)',
        sender: {
          id: 'test-extension-id',
          tab: { id: 789 },
          url: 'https://google.com',
        },
      },
    ])('應該拒絕: $scenario', ({ sender }) => {
      test('安全性檢查失敗', async () => {
        const sendResponse = jest.fn();
        const request = { url: 'https://example.com' };

        await handlers.migration_execute(request, sender, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({ error: '拒絕訪問：此操作僅限擴充功能內部調用' })
        );
      });
    });
  });
});
