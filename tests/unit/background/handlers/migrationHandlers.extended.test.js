import { createMigrationHandlers } from '../../../../scripts/background/handlers/migrationHandlers.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/messages.js';

describe('migrationHandlers Extended Coverage', () => {
  let handlers;
  let mockServices;
  let mockSender;
  let sendResponse;

  beforeEach(() => {
    mockServices = {
      migrationService: {
        executeContentMigration: jest.fn(),
      },
    };
    handlers = createMigrationHandlers(mockServices);
    mockSender = {
      id: 'test-extension-id',
      url: 'chrome-extension://test-extension-id/options.html',
    };
    sendResponse = jest.fn();

    // Mock global chrome
    globalThis.chrome = {
      runtime: {
        id: 'test-extension-id',
        getURL: path => `chrome-extension://test-extension-id/${path}`,
      },
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
    };

    // Mock Logger
    globalThis.Logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('migration_delete_failed', () => {
    const validRequest = { url: 'https://example.com' };

    test('如果無法檢索存儲數據，應正確處理錯誤', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await handlers.migration_delete_failed(validRequest, mockSender, sendResponse);

      expect(Logger.error).toHaveBeenCalledWith('刪除失敗標註失敗', expect.anything());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '發生未知錯誤，請稍後再試',
      });
    });

    test('如果刪除操作失敗，應正確處理錯誤', async () => {
      const key = 'highlights_https://example.com';
      chrome.storage.local.get.mockResolvedValue({
        [key]: { highlights: [] }, // 空數組導致刪除嘗試
      });
      chrome.storage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await handlers.migration_delete_failed(validRequest, mockSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '發生未知錯誤，請稍後再試',
      });
    });

    test('如果保存操作失敗，應正確處理錯誤', async () => {
      const key = 'highlights_https://example.com';
      chrome.storage.local.get.mockResolvedValue({
        [key]: {
          url: 'https://example.com',
          highlights: [
            { id: 1, migrationFailed: false },
            { id: 2, migrationFailed: true },
          ],
        },
      });
      // 剩餘標註導致更新嘗試
      chrome.storage.local.set.mockRejectedValue(new Error('Set failed'));

      await handlers.migration_delete_failed(validRequest, mockSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '發生未知錯誤，請稍後再試',
      });
    });
  });

  describe('migration_execute (Security)', () => {
    test('應拒絕無效的 URL 協議', async () => {
      const invalidRequest = { url: 'ftp://example.com' };
      await handlers.migration_execute(invalidRequest, mockSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URL_PROTOCOL,
      });
    });
  });
});
