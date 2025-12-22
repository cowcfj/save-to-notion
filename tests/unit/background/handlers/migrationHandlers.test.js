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
  let handlers;
  let mockServices;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServices = {}; // 目前 migrationHandlers 不依賴具體 services
    handlers = createMigrationHandlers(mockServices);
  });

  describe('validatePrivilegedRequest Security Checks', () => {
    // 測試場景 1: 來自 Popup/Background (無 tab 對象) - 應該允許
    test('應該允許來自 Popup/Background 的請求 (無 tab)', async () => {
      const sendResponse = jest.fn();
      const sender = {
        id: 'test-extension-id',
        // tab undefined
      };
      const request = { url: 'https://example.com' };

      // Mock storage to proceed a bit further or fail at data check, but NOT at security check
      chrome.storage.local.get.mockResolvedValue({});

      await handlers.migration_execute(request, sender, sendResponse);

      // 如果通過了安全性檢查，它會嘗試讀取 storage
      // 如果被拒絕，它會直接調用 sendResponse with error '拒絕訪問...'
      // 這裡我們期望它通過安全性檢查
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    // 測試場景 2: 來自 Options Page (在 Tab 中打開) - 應該允許
    // 這是本修復的核心驗證點
    test('應該允許來自 Options Page (在 Tab 中) 的請求', async () => {
      const sendResponse = jest.fn();
      const sender = {
        id: 'test-extension-id',
        tab: { id: 123 },
        url: 'chrome-extension://test-extension-id/options.html',
      };
      const request = { url: 'https://example.com' };

      chrome.storage.local.get.mockResolvedValue({});

      await handlers.migration_execute(request, sender, sendResponse);

      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    // 測試場景 3: 來自 Content Script - 應該拒絕
    test('應該拒絕來自 Content Script 的請求', async () => {
      const sendResponse = jest.fn();
      const sender = {
        id: 'test-extension-id',
        tab: { id: 456 },
        url: 'https://malicious-site.com',
      };
      const request = { url: 'https://example.com' };

      await handlers.migration_execute(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: '拒絕訪問：此操作僅限擴充功能內部調用' })
      );
    });

    // 測試場景 4: 來自其他擴充功能 - 應該拒絕
    test('應該拒絕來自其他擴充功能的請求', async () => {
      const sendResponse = jest.fn();
      const sender = {
        id: 'other-extension-id',
        // tab matches logic doesn't matter if ID mismatch
      };
      const request = { url: 'https://example.com' };

      await handlers.migration_execute(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: '拒絕訪問：此操作僅限擴充功能內部調用' })
      );
    });

    // 測試場景 5: 來自 Content Script 但偽造 Extension ID - 應該拒絕
    // 注意：Content Script 的 sender.id 確實是 extension id，所以依靠 url 或 tab 區分
    test('應該拒絕來自 Content Script (sender.url 為網頁 URL)', async () => {
      const sendResponse = jest.fn();
      const sender = {
        id: 'test-extension-id',
        tab: { id: 789 },
        url: 'https://google.com',
      };
      const request = { url: 'https://example.com' };

      await handlers.migration_execute(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: '拒絕訪問：此操作僅限擴充功能內部調用' })
      );
    });
  });
});
