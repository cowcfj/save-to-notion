/**
 * @jest-environment jsdom
 */

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

// Mock chrome API

const defaultSender = {
  id: 'mock-extension-id',
  url: 'chrome-extension://mock-extension-id/popup.html',
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
      setSavedPageData: jest.fn().mockResolvedValue(),
      setUrlAlias: jest.fn().mockResolvedValue(),
    };

    mockServices = {
      migrationService: {
        executeContentMigration: jest.fn(),
        migrateStorageKey: jest.fn().mockResolvedValue(true),
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
          id: 'mock-extension-id',
          // tab undefined
        },
      },
      {
        scenario: '來自 Options Page (在 Tab 中打開)',
        sender: {
          id: 'mock-extension-id',
          tab: { id: 123 },
          url: 'chrome-extension://mock-extension-id/options.html',
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
          id: 'mock-extension-id',
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
          id: 'mock-extension-id',
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

      // highlights_ 和 saved_ 均為 null
      mockStorageService.getHighlights.mockResolvedValue(null);
      mockStorageService.getSavedPageData.mockResolvedValue(null);

      await handlers.migration_delete({ url }, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ message: '數據不存在，無需刪除' })
      );
    });

    test('仅有 saved_ 資料時也應識別為「存在」並清理', async () => {
      const url = 'https://example.com/saved-only';
      const sendResponse = jest.fn();

      // highlights_ 為 null，但 saved_ 有資料
      mockStorageService.getHighlights.mockResolvedValue(null);
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-abc',
        notionUrl: 'https://notion.so/page-abc',
        title: 'My Page',
        lastUpdated: Date.now(),
        savedAt: Date.now(),
      });

      await handlers.migration_delete({ url }, defaultSender, sendResponse);

      // 應識別為存在並執行刪除（不應回傳「不存在」）
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: '成功刪除標註數據' })
      );
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(url);
    });

    test('應該同時檢查並清理原始 URL 和穩定 URL 的數據', async () => {
      const originalUrl = 'https://example.com/old-path';
      const stableUrl = 'https://example.com/stable-path';
      const sendResponse = jest.fn();

      computeStableUrl.mockReturnValue(stableUrl);

      // 原始 URL 有數據、穩定 URL 也有數據
      mockStorageService.getHighlights
        .mockResolvedValueOnce({ url: originalUrl, highlights: [{ id: '1' }] })
        .mockResolvedValueOnce({ url: stableUrl, highlights: [{ id: '2' }] });

      await handlers.migration_delete({ url: originalUrl }, defaultSender, sendResponse);

      // 驗證 getHighlights 被呼叫兩次（原始 + 穩定 URL）
      expect(mockStorageService.getHighlights).toHaveBeenCalledWith(originalUrl);
      expect(mockStorageService.getHighlights).toHaveBeenCalledWith(stableUrl);

      // 驗證 clearLegacyKeys 同時清理兩個 URL
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(originalUrl);
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(stableUrl);
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledTimes(2);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: '成功刪除標註數據' })
      );
    });
  });

  describe('migration_batch', () => {
    beforeEach(() => {
      // 新增 migrateBatchUrl mock（業務邏輯已移入 MigrationService）
      mockServices.migrationService.migrateBatchUrl = jest
        .fn()
        .mockImplementation(url =>
          Promise.resolve({ status: 'success', url, count: 1, pending: 1 })
        );
    });

    test('應該成功批量遷移並回傳結果', async () => {
      const urls = ['https://a.com', 'https://b.com'];
      const sendResponse = jest.fn();

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      expect(mockServices.migrationService.migrateBatchUrl).toHaveBeenCalledTimes(2);
      expect(mockServices.migrationService.migrateBatchUrl).toHaveBeenCalledWith('https://a.com');
      expect(mockServices.migrationService.migrateBatchUrl).toHaveBeenCalledWith('https://b.com');
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          results: expect.objectContaining({ success: 2 }),
        })
      );
    });

    test('委託路徑：migrateBatchUrl 回傳 stable URL 時應上報 stable URL', async () => {
      const urls = ['https://a.com/original-slug'];
      const stableUrl = 'https://a.com/stable-part';
      const sendResponse = jest.fn();

      computeStableUrl.mockReturnValue(stableUrl);
      mockServices.migrationService.migrateBatchUrl.mockResolvedValueOnce({
        status: 'success',
        url: stableUrl,
        count: 1,
        pending: 1,
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      expect(mockServices.migrationService.migrateBatchUrl).toHaveBeenCalledWith(
        'https://a.com/original-slug'
      );
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

    test('migrateBatchUrl 拋錯時應標記為 failed item', async () => {
      const oldUrl = 'https://a.com/original-slug';
      const sendResponse = jest.fn();

      mockServices.migrationService.migrateBatchUrl.mockRejectedValueOnce(
        new Error('set saved metadata failed')
      );

      await handlers.migration_batch({ urls: [oldUrl] }, defaultSender, sendResponse);

      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.results.success).toBe(0);
      expect(response.results.failed).toBe(1);
      expect(response.results.details[0]).toEqual(
        expect.objectContaining({
          status: 'failed',
          reason: 'set saved metadata failed',
        })
      );
      expect(Logger.error).toHaveBeenCalledWith(
        '批量遷移失敗',
        expect.objectContaining({ action: 'migration_batch' })
      );
    });

    test('應將單一 URL 嚴格委託給 migrateBatchUrl 並回傳原始 detail', async () => {
      const url = 'https://strict.com/article';
      const sendResponse = jest.fn();
      const delegatedResult = { status: 'success', url, count: 3, pending: 1 };

      mockServices.migrationService.migrateBatchUrl.mockResolvedValueOnce(delegatedResult);

      await handlers.migration_batch({ urls: [url] }, defaultSender, sendResponse);

      expect(mockServices.migrationService.migrateBatchUrl).toHaveBeenCalledTimes(1);
      expect(mockServices.migrationService.migrateBatchUrl).toHaveBeenCalledWith(url);
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        results: {
          success: 1,
          failed: 0,
          details: [delegatedResult],
        },
      });
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
    test('安全性驗證失敗時應回傳錯誤', async () => {
      const sendResponse = jest.fn();
      await handlers.migration_get_pending({}, { id: 'invalid-sender' }, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

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

    test('如果 getAllHighlights 拋出錯誤，應該捕捉並回傳錯誤訊息', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getAllHighlights.mockRejectedValue(new Error('Storage Error'));

      await handlers.migration_get_pending({}, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('發生未知錯誤'),
        })
      );
    });
  });

  describe('migration_delete_failed', () => {
    test('安全性驗證失敗時應回傳錯誤', async () => {
      const sendResponse = jest.fn();
      await handlers.migration_delete_failed(
        { url: 'https://example.com' },
        { id: 'invalid-sender' },
        sendResponse
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

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

    test('所有標註都失敗時應清空 highlights_ key（保留 saved_）', async () => {
      const url = 'https://example.com/all-failed';
      const sendResponse = jest.fn();
      const existingData = {
        url,
        highlights: [{ id: 'bad', migrationFailed: true }],
      };

      mockStorageService.getHighlights.mockResolvedValue(existingData);

      await handlers.migration_delete_failed({ url }, defaultSender, sendResponse);

      // 沒有剩餘標註 → 用空陣列更新 highlights（不調用 clearLegacyKeys 以保留 saved_）
      expect(mockStorageService.updateHighlights).toHaveBeenCalledWith(url, []);
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, deletedCount: 1 })
      );
    });

    test('如果沒有提供 url 應回傳錯誤', async () => {
      const sendResponse = jest.fn();
      await handlers.migration_delete_failed({}, defaultSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('缺少 URL') })
      );
    });

    test('如果找不到對應的標註資料應回傳錯誤', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getHighlights.mockResolvedValue(null);

      await handlers.migration_delete_failed(
        { url: 'https://no.data' },
        defaultSender,
        sendResponse
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('標註數據') })
      );
    });

    test('如果存儲服務拋出錯誤，應該捕捉並回傳錯誤訊息', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getHighlights.mockRejectedValue(new Error('Storage exception'));

      await handlers.migration_delete_failed(
        { url: 'https://error.com' },
        defaultSender,
        sendResponse
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('發生未知錯誤') })
      );
    });
  });

  describe('migration_batch_delete', () => {
    test('安全性驗證失敗時應回傳錯誤', async () => {
      const sendResponse = jest.fn();
      await handlers.migration_batch_delete(
        { urls: ['https://example.com'] },
        { id: 'invalid-sender' },
        sendResponse
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

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

    test('應該同時清理原始 URL 和穩定 URL 的數據', async () => {
      const originalUrl = 'https://example.com/original-path';
      const stableUrl = 'https://example.com/stable-path';
      const sendResponse = jest.fn();

      computeStableUrl.mockReturnValue(stableUrl);

      await handlers.migration_batch_delete({ urls: [originalUrl] }, defaultSender, sendResponse);

      // 驗證 clearLegacyKeys 同時被呼叫（對原始和穩定 URL 都呼叫）
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(originalUrl);
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(stableUrl);
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledTimes(2);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 1 })
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
