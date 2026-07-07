/*
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 *
 * TabService URL resolution and preloader tests
 */

import { jest } from '@jest/globals';
import {
  URL_ALIAS_PREFIX,
  createTabService,
  mockLogger,
  resetTabServiceTestState,
  urlUtils,
} from './tabServiceTestHarness.js';

describe('TabService URL resolution and preloader behavior', () => {
  let service = null;

  beforeEach(() => {
    resetTabServiceTestState();
    service = createTabService();
  });

  describe('resolveTabUrl edges', () => {
    afterEach(() => {
      urlUtils.resolveStorageUrl.mockRestore?.();
      urlUtils.isRootUrl.mockRestore?.();
    });

    it('應處理 isRootUrl 為 true 的情況', async () => {
      urlUtils.resolveStorageUrl.mockReturnValueOnce('https://example.com/');
      urlUtils.isRootUrl.mockReturnValueOnce(true);

      const res = await service.resolveTabUrl(1, 'https://example.com/?some=param');

      expect(res.hasStableUrl).toBe(false);
      expect(res.stableUrl).toBe('https://example.com/?some=param'); // fallbacks to originalUrl
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Blocked root URL as stableUrl'),
        expect.anything()
      );
    });

    it('應執行 migrationService.migrateStorageKey', async () => {
      urlUtils.resolveStorageUrl.mockReturnValueOnce('https://example.com/stable');
      urlUtils.isRootUrl.mockReturnValueOnce(false);

      const mockMigrationService = { migrateStorageKey: jest.fn().mockResolvedValue(true) };
      const res = await service.resolveTabUrl(1, 'https://example.com/?a=1', mockMigrationService);

      expect(res.hasStableUrl).toBe(true);
      expect(res.migrated).toBe(true);
      expect(mockMigrationService.migrateStorageKey).toHaveBeenCalledWith(
        'https://example.com/stable',
        'https://example.com/?a=1'
      );
    });
  });

  describe('_sendStableUrl behavior', () => {
    it('_sendStableUrl 應阻擋 root url 寫入', () => {
      urlUtils.isRootUrl.mockReturnValueOnce(true);

      service._sendStableUrl(1, 'https://example.com/');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Blocked SET_STABLE_URL'),
        expect.anything()
      );
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('_sendStableUrl 應正常發送訊息', () => {
      urlUtils.isRootUrl.mockReturnValueOnce(false);
      chrome.tabs.sendMessage.mockReturnValue(Promise.resolve());

      service._sendStableUrl(1, 'https://example.com/page');
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        action: 'SET_STABLE_URL',
        stableUrl: 'https://example.com/page',
      });
    });
  });

  describe('Coverage Improvements', () => {
    it('_waitForTabCompilation should return null if chrome.tabs.get fails', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Get tab failed'));
      const res = await service._waitForTabCompilation(999);
      expect(res).toBeNull();
    });

    it('_waitForTabCompilation should return null if tab is discarded', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 999, discarded: true });
      const res = await service._waitForTabCompilation(999);
      expect(res).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('discarded'));
    });

    it('updateTabStatus should log specific message for "No tab with id" error', async () => {
      service._verifyAndUpdateStatus = jest
        .fn()
        .mockRejectedValue(new Error('No tab with id: 999'));
      await service.updateTabStatus(999, 'https://example.com');
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Tab closed/missing'));
    });

    it('updateTabStatus should log specific message for "The tab was closed" error', async () => {
      service._verifyAndUpdateStatus = jest
        .fn()
        .mockRejectedValue(new Error('The tab was closed.'));
      await service.updateTabStatus(999, 'https://example.com');
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Tab closed/missing'));
    });
  });
  describe('Stable URL Fallback Logic', () => {
    test('應正確執行回退查找 (Stable URL Miss -> Original URL Hit)', async () => {
      /**
       * 此測試旨在驗證 _updateTabStatusInternal 的「雙查/回退」邏輯：
       * 當為頁面計算出穩定 URL (Stable URL) 時，應優先查詢該 URL 的標註；
       * 若穩定 URL 下無數據，應回退到原始 URL (Original URL) 查詢，以確保向後兼容。
       */
      const mockTabId = 999;
      const mockRawUrl = 'https://example.com/?slug=test';
      const mockStableUrl = 'https://example.com/stable';
      const mockOriginalUrl = 'https://example.com/';

      // 1. Mock 外部工具函數以模擬 Phase 1 為該頁面生成了不同的穩定 URL
      // 使用 import 的 mock 對象，避免 require 與手動還原
      // 重要：在測試結束後還原 mock，避免影響後續測試 (如 getPreloaderData edge cases)
      const originalImpl = urlUtils.resolveStorageUrl.getMockImplementation();
      urlUtils.resolveStorageUrl.mockReturnValue(mockStableUrl);

      try {
        // 2. 配置 service 的 URL 標準化行為
        service.normalizeUrl = jest.fn().mockReturnValue(mockOriginalUrl);

        // 3. Mock 外部儲存 API：穩定 URL 為空，原始 URL 的 highlights_* key 有數據
        chrome.storage.local.get.mockImplementation(async keys => {
          // 穩定 URL 的新舊格式都沒有數據
          if (
            keys.includes(`highlights_${mockStableUrl}`) ||
            keys.includes(`page_${mockStableUrl}`)
          ) {
            return {};
          }
          // 原始 URL 的舊格式有數據
          if (keys.includes(`highlights_${mockOriginalUrl}`)) {
            return { [`highlights_${mockOriginalUrl}`]: [{ text: 'fallback-highlight' }] };
          }
          return {};
        });

        // 4. Mock 其他無關此測試邏輯的內部步驟，以隔離並專注於回退邏輯檢測
        service.getPreloaderData = jest.fn().mockResolvedValue(null);
        service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
        service._waitForTabCompilation = jest.fn().mockResolvedValue({ id: mockTabId });
        service.injectionService = { ensureBundleInjected: jest.fn().mockResolvedValue() };

        // 5. 執行測試
        await service._updateTabStatusInternal(mockTabId, mockRawUrl);

        // 6. 驗證：Phase 4 (tighten) 在 _persistUrlAliasIfNeeded 加入 evidence check 為第 1 個 get；
        //         resolver 隨後對 stable / original 各做一次 get（第 2、3 個）。
        expect(chrome.storage.local.get).toHaveBeenNthCalledWith(
          1,
          expect.arrayContaining([`page_${mockStableUrl}`, `highlights_${mockStableUrl}`])
        );
        // 第 2 個 get：resolver 優先查 stable URL 的所有 keys
        expect(chrome.storage.local.get).toHaveBeenNthCalledWith(
          2,
          expect.arrayContaining([
            `${URL_ALIAS_PREFIX}${mockStableUrl}`,
            `page_${mockStableUrl}`,
            `highlights_${mockStableUrl}`,
          ])
        );
        // 第 3 個 get：stable miss 後回退到 original URL 的所有 keys
        expect(chrome.storage.local.get).toHaveBeenNthCalledWith(
          3,
          expect.arrayContaining([
            `${URL_ALIAS_PREFIX}${mockOriginalUrl}`,
            `page_${mockOriginalUrl}`,
            `highlights_${mockOriginalUrl}`,
          ])
        );

        // 驗證最終成功觸發了注入
        expect(service.injectionService.ensureBundleInjected).toHaveBeenCalledWith(mockTabId);
      } finally {
        // 還原 Mock
        if (originalImpl) {
          urlUtils.resolveStorageUrl.mockImplementation(originalImpl);
        } else {
          urlUtils.resolveStorageUrl.mockReset(); // 或者 mockBack to default implementation if needed
          urlUtils.resolveStorageUrl.mockImplementation(url => url); // Restore default mock behavior defined at top of file
        }
      }
    });
  });

  describe('getPreloaderData', () => {
    it('應該成功獲取 Preloader 數據', async () => {
      const mockData = { shortlink: 'https://example.com/p=1', nextRouteInfo: null };
      chrome.tabs.sendMessage.mockImplementation((_tabId, _msg, cb) => cb(mockData));

      const result = await service.getPreloaderData(1);
      expect(result).toEqual(mockData);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { action: 'PING' },
        expect.any(Function)
      );
    });

    it('應該在超時後返回 null', async () => {
      jest.useFakeTimers();
      try {
        chrome.tabs.sendMessage.mockImplementation(() => {
          // 不調用 callback，模擬無響應
        });

        const promise = service.getPreloaderData(1);
        jest.advanceTimersByTime(1000); // 超過 500ms
        const result = await promise;

        expect(result).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('應該在 runtime.lastError 時返回 null', async () => {
      chrome.tabs.sendMessage.mockImplementation((_tabId, _msg, cb) => {
        chrome.runtime.lastError = { message: 'Port closed' };
        cb();
      });

      const result = await service.getPreloaderData(1);
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get preloader data')
      );

      // 測試結束後清理，避免污染後續測試
      delete chrome.runtime.lastError;
    });

    it('應該在 sendMessage 拋出異常時返回 null', async () => {
      chrome.tabs.sendMessage.mockImplementation(() => {
        throw new Error('API Error');
      });

      const result = await service.getPreloaderData(1);
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get preloader data')
      );
    });

    describe('Coverage Improvements (Edge Cases)', () => {
      test('應正確處理 getPreloaderData 返回 null 的情況 (回退到 normalizeUrl)', async () => {
        service.getPreloaderData = jest.fn().mockResolvedValue(null);
        // Ensure normalizeUrl uses default behavior or specific mock
        service.normalizeUrl = jest.fn(url => url);

        const url = 'https://example.com/test';
        // resolveStorageUrl util will return normalizeUrl(url) if preloaderData is null
        // We need to ensure resolveStorageUrl is not mocked to return something else from previous tests OR restore it
        // The previous test mocked resolveStorageUrl, so we must ensure it's restored.
        // The previous test does restore it in 'finally' logical block (lines 635-637 of original file)

        const result = await service.resolveTabUrl(999, url);

        expect(result.stableUrl).toBe(url); // resolveStorageUrl fallback
        expect(result.originalUrl).toBe(url);
        expect(result.hasStableUrl).toBe(false);
      });

      test('應正確執行 _verifyAndUpdateStatus 的回退查詢邏輯 (Stable URL Miss -> Original URL Hit)', async () => {
        const tabId = 999;
        const normUrl = 'https://example.com/stable';
        const fallbackUrl = 'https://example.com/';

        // Setup mocks
        service.getSavedPageData = jest
          .fn()
          .mockResolvedValueOnce(null) // First call for normUrl returns null
          .mockResolvedValueOnce({ notionPageId: 'page-123', lastVerifiedAt: Date.now() }); // Second call for fallbackUrl returns data

        service._updateBadgeStatus = jest.fn().mockResolvedValue();

        // Execute private method
        await service._verifyAndUpdateStatus(tabId, normUrl, fallbackUrl);

        // Verify
        expect(service.getSavedPageData).toHaveBeenNthCalledWith(1, normUrl);
        expect(service.getSavedPageData).toHaveBeenNthCalledWith(2, fallbackUrl);
        expect(service._updateBadgeStatus).toHaveBeenCalledWith(
          tabId,
          expect.objectContaining({ notionPageId: 'page-123' })
        );
      });
    });
  });
});
