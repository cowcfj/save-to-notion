import {
  StorageService,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../../../scripts/background/services/StorageService.js';
import { buildHighlight, buildSavedPageData } from '../../../helpers/status-fixtures.js';
import {
  createStorageServiceHarness,
  mockStorageLookup,
} from '../../../helpers/storageServiceTestHarness.js';

describe('StorageService - Notion State', () => {
  let service = null;
  let mockStorage = null;
  let mockLogger = null;

  beforeEach(() => {
    ({ service, mockStorage, mockLogger } = createStorageServiceHarness(StorageService));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('clearNotionState', () => {
    it('應清除 notion 欄位但保留 highlights', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      mockStorage.local.get.mockResolvedValue({
        [pageKey]: {
          highlights: [{ id: '1', text: 'test' }],
          notion: { pageId: 'abc123', url: 'https://notion.so/abc' },
          metadata: { lastUpdated: 100 },
        },
      });

      await service.clearNotionState('https://example.com/page');

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [pageKey]: expect.objectContaining({
            highlights: [{ id: '1', text: 'test' }],
            notion: null,
          }),
        })
      );
    });

    it('page_* 不存在時不應呼叫 set', async () => {
      mockStorage.local.get.mockResolvedValue({});

      await expect(service.clearNotionState('https://example.com/page')).resolves.toEqual({
        cleared: true,
      });
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('應通過 URL alias 解析並清除 stableUrl 下的 key', async () => {
      const shortUrl = 'https://example.com/short';
      const stableUrl = 'https://example.com/stable/';
      const aliasKey = `${URL_ALIAS_PREFIX}${shortUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;

      mockStorageLookup(mockStorage, {
        [aliasKey]: stableUrl,
        [stablePageKey]: {
          highlights: [{ id: '2', text: 'alias test' }],
          notion: { pageId: 'xyz', url: 'https://notion.so/xyz' },
          metadata: { lastUpdated: 200 },
        },
      });

      await service.clearNotionState(shortUrl);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [stablePageKey]: expect.objectContaining({
            highlights: [{ id: '2', text: 'alias test' }],
            notion: null,
          }),
        })
      );
    });

    it('expectedPageId 不匹配時應跳過清除並記錄 warn', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      mockStorage.local.get.mockResolvedValue({
        [pageKey]: {
          highlights: [{ id: '1' }],
          notion: { pageId: 'correct-id-xyz', url: 'https://notion.so/x' },
          metadata: { lastUpdated: 100 },
        },
      });

      await expect(
        service.clearNotionState('https://example.com/page', {
          expectedPageId: 'wrong-id-abc',
        })
      ).resolves.toEqual({
        skipped: true,
        reason: 'pageId_mismatch',
      });

      expect(mockStorage.local.set).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[StorageService] clearNotionState skipped: pageId mismatch',
        expect.objectContaining({
          expectedPageId: 'wron',
          foundPageId: 'corr',
        })
      );
    });

    it('expectedPageId 匹配時應正常清除 notion 欄位', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      mockStorage.local.get.mockResolvedValue({
        [pageKey]: {
          highlights: [{ id: '1' }],
          notion: { pageId: 'match-id-xyz', url: 'https://notion.so/x' },
          metadata: { lastUpdated: 100 },
        },
      });

      await service.clearNotionState('https://example.com/page', {
        expectedPageId: 'match-id-xyz',
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [pageKey]: expect.objectContaining({ notion: null }),
        })
      );
    });

    it('未傳 expectedPageId 時行為與舊版相同（無條件清除）', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      mockStorage.local.get.mockResolvedValue({
        [pageKey]: {
          highlights: [],
          notion: { pageId: 'any-id', url: 'https://notion.so/x' },
          metadata: { lastUpdated: 100 },
        },
      });

      await service.clearNotionState('https://example.com/page');

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [pageKey]: expect.objectContaining({ notion: null }),
        })
      );
    });

    it('clearNotionState 後，original URL 與 stable URL 都不應再回傳 saved data', async () => {
      const originalUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';
      const pageKey = `${PAGE_PREFIX}${stableUrl}`;
      const aliasKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
      const storageData = {
        [aliasKey]: stableUrl,
        [pageKey]: {
          notion: {
            pageId: 'page-123',
            url: 'https://www.notion.so/page-123',
            title: 'Saved page',
            savedAt: 100,
            lastVerifiedAt: 100,
          },
          highlights: [buildHighlight()],
          metadata: { createdAt: 100, lastUpdated: 100 },
        },
      };

      mockStorageLookup(mockStorage, storageData);
      mockStorage.local.set.mockImplementation(async payload => {
        Object.assign(storageData, payload);
      });
      mockStorage.local.remove.mockImplementation(async keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(key => {
          delete storageData[key];
        });
      });

      await service.clearNotionState(originalUrl, {
        expectedPageId: buildSavedPageData().notionPageId,
      });

      const originalResult = await service.getSavedPageData(originalUrl);
      const stableResult = await service.getSavedPageData(stableUrl);

      expect(originalResult).toBeNull();
      expect(stableResult).toBeNull();
      expect(storageData[pageKey].highlights).toHaveLength(1);
      expect(storageData[pageKey].notion).toBeNull();
    });
  });

  describe('clearNotionStateWithRetry', () => {
    it('第一次失敗後應重試一次並回報 recovered', async () => {
      const clearSpy = jest
        .spyOn(service, 'clearNotionState')
        .mockRejectedValueOnce(new Error('temporary storage failure'))
        .mockResolvedValueOnce();

      const result = await service.clearNotionStateWithRetry('https://example.com/page', {
        source: 'highlightHandlers',
        retryDelayMs: 0,
      });

      expect(clearSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        cleared: true,
        attempts: 2,
        recovered: true,
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[StorageService] clearNotionState 嘗試失敗，準備重試',
        expect.objectContaining({
          action: 'clearNotionStateWithRetry',
          source: 'highlightHandlers',
          attempt: 1,
          url: 'https://example.com/page',
        })
      );
      expect(mockLogger.success).toHaveBeenCalledWith(
        '[StorageService] clearNotionState 重試成功',
        expect.objectContaining({
          action: 'clearNotionStateWithRetry',
          source: 'highlightHandlers',
          attempts: 2,
          recovered: true,
          url: 'https://example.com/page',
        })
      );
    });

    it('兩次嘗試皆失敗時應回傳 cleared: false 並記錄 error 日誌', async () => {
      const clearSpy = jest
        .spyOn(service, 'clearNotionState')
        .mockRejectedValueOnce(new Error('first failure'))
        .mockRejectedValueOnce(new Error('second failure'));

      const result = await service.clearNotionStateWithRetry('https://example.com/page', {
        source: 'testSource',
        retryDelayMs: 0,
      });

      expect(clearSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        cleared: false,
        attempts: 2,
        error: expect.any(Error),
      });
      expect(result.error.message).toBe('second failure');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[StorageService] clearNotionState 嘗試失敗，準備重試',
        expect.objectContaining({
          action: 'clearNotionStateWithRetry',
          source: 'testSource',
          attempt: 1,
          error: expect.any(Error),
        })
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[StorageService] clearNotionState 重試最終失敗',
        expect.objectContaining({
          action: 'clearNotionStateWithRetry',
          source: 'testSource',
          attempts: 2,
          recovered: false,
          error: expect.any(Error),
        })
      );
    });

    it('clearNotionState 回傳 skipped 時應保留 skipped 狀態而非轉成 cleared', async () => {
      const clearSpy = jest.spyOn(service, 'clearNotionState').mockResolvedValueOnce({
        skipped: true,
        reason: 'pageId_mismatch',
      });

      const result = await service.clearNotionStateWithRetry('https://example.com/page', {
        source: 'testSource',
        retryDelayMs: 0,
        expectedPageId: 'expected-page-id',
      });

      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        cleared: false,
        skipped: true,
        reason: 'pageId_mismatch',
        attempts: 1,
        recovered: false,
      });
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        '[StorageService] clearNotionState 嘗試失敗，準備重試',
        expect.anything()
      );
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        '[StorageService] clearNotionState 重試最終失敗',
        expect.anything()
      );
    });
  });
});
