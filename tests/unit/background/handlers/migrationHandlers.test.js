/**
 * @jest-environment jsdom
 */

/* global chrome */

/* skipcq: JS-0255 */

/**
 * migrationHandlers.js 單元測試
 *
 * 重點測試安全性驗證邏輯 validatePrivilegedRequest
 */

import { createMigrationHandlers } from '../../../../scripts/background/handlers/migrationHandlers.js';
import { computeStableUrl } from '../../../../scripts/utils/urlUtils.js';

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  computeStableUrl: jest.fn(),
}));

// Mock Logger
globalThis.Logger = {
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock chrome API
globalThis.chrome = {
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

const defaultSender = {
  id: 'test-extension-id',
  url: 'chrome-extension://test-extension-id/popup.html',
};

describe('migrationHandlers', () => {
  let handlers = null;
  let mockServices = null;

  beforeEach(() => {
    jest.clearAllMocks();
    computeStableUrl.mockReturnValue(null); // 預設不返回穩定 URL
    mockServices = {
      migrationService: {
        executeContentMigration: jest.fn(),
      },
      // ...other services if needed
    };
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

        // 正面斷言：驗證成功路徑被執行
        // 如果安全性檢查通過，應該會調用 executeContentMigration
        expect(mockServices.migrationService.executeContentMigration).toHaveBeenCalled();

        // 負面斷言：確認沒有返回拒絕訪問錯誤
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

  describe('migration_delete', () => {
    test('應該成功刪除現有數據', async () => {
      const url = 'https://example.com/data';
      const sendResponse = jest.fn();

      chrome.storage.local.get.mockResolvedValue({ [`highlights_${url}`]: [{ id: '1' }] });
      chrome.storage.local.remove.mockResolvedValue();

      await handlers.migration_delete({ url }, defaultSender, sendResponse);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(`highlights_${url}`);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('數據不存在時應返回成功訊息', async () => {
      const url = 'https://example.com/no-data';
      const sendResponse = jest.fn();

      chrome.storage.local.get.mockResolvedValue({});

      await handlers.migration_delete({ url }, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ message: '數據不存在，無需刪除' })
      );
    });
  });

  describe('migration_batch', () => {
    test('應該成功批量遷移數據並轉換格式', async () => {
      const urls = ['https://a.com', 'https://b.com'];
      const sendResponse = jest.fn();

      chrome.storage.local.get.mockImplementation(keysArg => {
        // keysArg 現在是陣列，需要回傳對應的 key 值
        const result = {};
        if (Array.isArray(keysArg) && keysArg.includes('highlights_https://a.com')) {
          result['highlights_https://a.com'] = [{ id: '1' }];
        }
        if (Array.isArray(keysArg) && keysArg.includes('highlights_https://b.com')) {
          result['highlights_https://b.com'] = [{ id: '2' }];
        }
        return Promise.resolve(result);
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          results: expect.objectContaining({ success: 2 }),
        })
      );
    });

    test('應該在計算出穩定 URL 時，將數據遷移到穩定 URL key 並刪除原始 key', async () => {
      const urls = ['https://a.com/original-slug'];
      const stableUrl = 'https://a.com/stable-part';
      const sendResponse = jest.fn();

      computeStableUrl.mockReturnValue(stableUrl);

      // 使用 mockResolvedValue 以支援批量 get([pageKey, stableKey])
      chrome.storage.local.get.mockResolvedValue({
        'highlights_https://a.com/original-slug': [{ id: '1' }],
        // highlights_${stableUrl} 不存在 → 應觸發遷移
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      // 只寫入穩定 key（不再重複寫原始 key）
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`highlights_${stableUrl}`]: expect.objectContaining({
            url: stableUrl,
          }),
        })
      );

      // 刪除原始 key 以避免 migration_get_pending 重複計算
      // _removeLegacyKeys 現在傳入陣列（keysToRemove），而非單個字串
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'highlights_https://a.com/original-slug',
      ]);

      // 確保回報的 url 是 stableUrl
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          results: expect.objectContaining({
            details: expect.arrayContaining([
              expect.objectContaining({ url: expect.stringContaining(stableUrl) }),
            ]),
          }),
        })
      );
    });

    test('如果穩定 URL key 已經有數據，不應覆蓋它', async () => {
      const urls = ['https://a.com/original-slug'];
      const stableUrl = 'https://a.com/stable-part';
      const sendResponse = jest.fn();

      computeStableUrl.mockReturnValue(stableUrl);

      chrome.storage.local.get.mockResolvedValue({
        'highlights_https://a.com/original-slug': [{ id: '1' }],
        [`highlights_${stableUrl}`]: [{ id: '2', isNew: true }], // 穩定 key 已存在數據
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      // 只會寫入一次（原來的 key），不會寫入穩定的 key
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ['highlights_https://a.com/original-slug']: expect.anything(),
        })
      );

      // 驗證回報的是原始 URL（非穩定 URL，因為穩定 key 已存在，不觸發遷移）
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          results: expect.objectContaining({
            details: expect.arrayContaining([
              expect.objectContaining({ url: expect.stringContaining('original-slug') }),
            ]),
          }),
        })
      );
    });

    test('應該拒絕無效的 URLs', async () => {
      const urls = ['invalid-url'];
      const sendResponse = jest.fn();

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('拒絕訪問') })
      );
    });
  });

  describe('migration_get_pending', () => {
    test('應該正確回收待處理和失敗的項目', async () => {
      const sendResponse = jest.fn();
      chrome.storage.local.get.mockResolvedValue({
        'highlights_https://pending.com': { highlights: [{ id: 'p1', needsRangeInfo: true }] },
        'highlights_https://failed.com': { highlights: [{ id: 'f1', migrationFailed: true }] },
        other_key: 'random',
      });

      await handlers.migration_get_pending({}, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          totalPages: 1,
          totalPending: 1,
          totalFailed: 1,
        })
      );
    });
  });

  describe('migration_delete_failed', () => {
    test('應該只刪除標記為失敗的標註', async () => {
      const url = 'https://example.com/mixed';
      const sendResponse = jest.fn();
      const existingData = {
        url,
        highlights: [
          { id: 'good', text: 'ok' },
          { id: 'bad', migrationFailed: true },
        ],
      };

      chrome.storage.local.get.mockResolvedValue({ [`highlights_${url}`]: existingData });

      await handlers.migration_delete_failed({ url }, defaultSender, sendResponse);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`highlights_${url}`]: expect.objectContaining({
            highlights: [{ id: 'good', text: 'ok' }],
          }),
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, deletedCount: 1 })
      );
    });
  });

  describe('migration_batch_delete', () => {
    test('應該成功批量刪除多個 URL 的數據', async () => {
      const urls = ['https://del1.com', 'https://del2.com'];
      const sendResponse = jest.fn();

      await handlers.migration_batch_delete({ urls }, defaultSender, sendResponse);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'highlights_https://del1.com',
        'highlights_https://del2.com',
      ]);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 2 })
      );
    });
  });

  describe('migration_execute (Delegation to Service)', () => {
    const request = { url: 'https://example.com' };

    test('應該將請求委託給 MigrationService', async () => {
      const sendResponse = jest.fn();
      const expectedResult = { success: true, count: 5 };

      // Mock service method
      mockServices.migrationService.executeContentMigration.mockResolvedValue(expectedResult);

      // Execute handler
      await handlers.migration_execute(request, defaultSender, sendResponse);

      // Verify service call
      expect(mockServices.migrationService.executeContentMigration).toHaveBeenCalledWith(
        request,
        defaultSender
      );

      // Verify response
      expect(sendResponse).toHaveBeenCalledWith(expectedResult);
    });

    test('應該處理 MigrationService 拋出的錯誤', async () => {
      const sendResponse = jest.fn();
      const errorMsg = 'Service Failure';

      mockServices.migrationService.executeContentMigration.mockRejectedValue(new Error(errorMsg));

      await handlers.migration_execute(request, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('發生未知錯誤'), // sanitizes error
        })
      );
    });
  });
});
