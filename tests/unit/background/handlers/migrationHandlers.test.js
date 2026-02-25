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
  let mockStorageService = null;

  beforeEach(() => {
    jest.clearAllMocks();
    computeStableUrl.mockReturnValue(null); // 預設不返回穩定 URL

    // StorageService mock（Phase 1+2 後所有 handler 均使用此服務）
    mockStorageService = {
      getHighlights: jest.fn().mockResolvedValue(null),
      getAllHighlights: jest.fn().mockResolvedValue({}),
      updateHighlights: jest.fn().mockResolvedValue(),
      clearLegacyKeys: jest.fn().mockResolvedValue(),
      savePageDataAndHighlights: jest.fn().mockResolvedValue(),
      getSavedPageData: jest.fn().mockResolvedValue(null),
    };

    mockServices = {
      migrationService: {
        executeContentMigration: jest.fn(),
      },
      storageService: mockStorageService,
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

        await handlers.migration_execute(request, sender, sendResponse);

        // 正面斷言：驗證成功路徑被執行
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

      // StorageService.getHighlights 回傳有資料
      mockStorageService.getHighlights.mockResolvedValue({ url, highlights: [{ id: '1' }] });

      await handlers.migration_delete({ url }, defaultSender, sendResponse);

      expect(mockStorageService.getHighlights).toHaveBeenCalledWith(url);
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(url);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('數據不存在時應返回成功訊息', async () => {
      const url = 'https://example.com/no-data';
      const sendResponse = jest.fn();

      // StorageService.getHighlights 回傳 null
      mockStorageService.getHighlights.mockResolvedValue(null);

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

      // chrome.storage.local.get 仍被 _migrateSingleUrl 內部直接呼叫（批量快照）
      chrome.storage.local.get.mockImplementation(keysArg => {
        const result = {};
        if (Array.isArray(keysArg) && keysArg.includes('highlights_https://a.com')) {
          result['highlights_https://a.com'] = { url: 'https://a.com', highlights: [{ id: '1' }] };
        }
        if (Array.isArray(keysArg) && keysArg.includes('highlights_https://b.com')) {
          result['highlights_https://b.com'] = { url: 'https://b.com', highlights: [{ id: '2' }] };
        }
        return Promise.resolve(result);
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      // 原地格式轉換：應呼叫 storageService.updateHighlights 兩次
      expect(mockStorageService.updateHighlights).toHaveBeenCalledTimes(2);
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

      // _migrateSingleUrl 批量快照讀取
      chrome.storage.local.get.mockResolvedValue({
        'highlights_https://a.com/original-slug': {
          url: 'https://a.com/original-slug',
          highlights: [{ id: '1' }],
        },
        // highlights_${stableUrl} 不存在 → 應觸發遷移
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      // 應呼叫 _migrateUrlKey（使用 savePageDataAndHighlights + clearLegacyKeys）
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        null, // 無 saved_ 資料
        expect.objectContaining({ url: stableUrl })
      );
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(
        'https://a.com/original-slug'
      );

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

    test('如果穩定 URL key 已經有數據，不應覆蓋它（原地轉換）', async () => {
      const urls = ['https://a.com/original-slug'];
      const stableUrl = 'https://a.com/stable-part';
      const sendResponse = jest.fn();

      computeStableUrl.mockReturnValue(stableUrl);

      chrome.storage.local.get.mockResolvedValue({
        'highlights_https://a.com/original-slug': { highlights: [{ id: '1' }] },
        [`highlights_${stableUrl}`]: [{ id: '2', isNew: true }], // 穩定 key 已存在數據
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      // 穩定 key 已存在 → shouldMigrateToStable = false → 原地轉換
      expect(mockStorageService.updateHighlights).toHaveBeenCalledTimes(1);
      expect(mockStorageService.savePageDataAndHighlights).not.toHaveBeenCalled();

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

      // 改用 storageService.getAllHighlights（Phase 1）
      mockStorageService.getAllHighlights.mockResolvedValue({
        'https://pending.com': { highlights: [{ id: 'p1', needsRangeInfo: true }] },
        'https://failed.com': { highlights: [{ id: 'f1', migrationFailed: true }] },
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

      // 改用 storageService.getHighlights（Phase 1）
      mockStorageService.getHighlights.mockResolvedValue(existingData);

      await handlers.migration_delete_failed({ url }, defaultSender, sendResponse);

      // 有剩餘標註 → 呼叫 updateHighlights（而非 clearLegacyKeys）
      expect(mockStorageService.updateHighlights).toHaveBeenCalledWith(url, [
        { id: 'good', text: 'ok' },
      ]);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, deletedCount: 1 })
      );
    });

    test('所有標註都失敗時應刪除整個 key', async () => {
      const url = 'https://example.com/all-failed';
      const sendResponse = jest.fn();
      const existingData = {
        url,
        highlights: [{ id: 'bad', migrationFailed: true }],
      };

      mockStorageService.getHighlights.mockResolvedValue(existingData);

      await handlers.migration_delete_failed({ url }, defaultSender, sendResponse);

      // 沒有剩餘標註 → 呼叫 clearLegacyKeys
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(url);
      expect(mockStorageService.updateHighlights).not.toHaveBeenCalled();
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

      // 改用 storageService.clearLegacyKeys （同時清理 highlights_ + saved_）
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith('https://del1.com');
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith('https://del2.com');
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

      mockServices.migrationService.executeContentMigration.mockResolvedValue(expectedResult);

      await handlers.migration_execute(request, defaultSender, sendResponse);

      expect(mockServices.migrationService.executeContentMigration).toHaveBeenCalledWith(
        request,
        defaultSender
      );
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
