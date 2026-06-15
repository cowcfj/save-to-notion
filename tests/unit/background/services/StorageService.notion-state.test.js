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
  const TEST_PAGE_URL = 'https://example.com/page';
  const CLEAR_RETRY_ACTION = 'clearNotionStateWithRetry';
  const CLEAR_RETRY_WARNING_MESSAGE = '[StorageService] clearNotionState 嘗試失敗，準備重試';
  const CLEAR_RETRY_SUCCESS_MESSAGE = '[StorageService] clearNotionState 重試成功';
  const CLEAR_RETRY_FAILURE_MESSAGE = '[StorageService] clearNotionState 重試最終失敗';

  let service = null;
  let mockStorage = null;
  let mockLogger = null;

  const pageKeyFor = url => `${PAGE_PREFIX}${url}`;

  const buildPageState = ({
    highlights = [{ id: '1' }],
    pageId = 'page-id',
    notionUrl = 'https://notion.so/x',
    metadata = { lastUpdated: 100 },
  } = {}) => ({
    highlights,
    notion: { pageId, url: notionUrl },
    metadata,
  });

  const mockPageState = ({ url = TEST_PAGE_URL, pageState = buildPageState() } = {}) => {
    const pageKey = pageKeyFor(url);
    mockStorage.local.get.mockResolvedValue({ [pageKey]: pageState });
    return pageKey;
  };

  const buildNotionClearedPayload = (pageKey, expectedState = {}) =>
    expect.objectContaining({
      [pageKey]: expect.objectContaining({
        ...expectedState,
        notion: null,
      }),
    });

  const mockClearNotionStateSequence = (...results) => {
    const clearSpy = jest.spyOn(service, 'clearNotionState');
    results.forEach(result => {
      if (result instanceof Error) {
        clearSpy.mockRejectedValueOnce(result);
        return;
      }

      clearSpy.mockResolvedValueOnce(result);
    });
    return clearSpy;
  };

  const clearNotionStateWithRetry = (options = {}) =>
    service.clearNotionStateWithRetry(TEST_PAGE_URL, {
      retryDelayMs: 0,
      ...options,
    });

  const expectRetryLog = (loggerMethod, message, expectedMetadata) => {
    expect(loggerMethod).toHaveBeenCalledWith(
      message,
      expect.objectContaining({
        action: CLEAR_RETRY_ACTION,
        ...expectedMetadata,
      })
    );
  };

  beforeEach(() => {
    ({ service, mockStorage, mockLogger } = createStorageServiceHarness(StorageService));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('clearNotionState', () => {
    it('應清除 notion 欄位但保留 highlights', async () => {
      const highlights = [{ id: '1', text: 'test' }];
      const pageKey = mockPageState({
        pageState: buildPageState({
          highlights,
          pageId: 'abc123',
          notionUrl: 'https://notion.so/abc',
        }),
      });

      await service.clearNotionState(TEST_PAGE_URL);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        buildNotionClearedPayload(pageKey, { highlights })
      );
    });

    it('page_* 不存在時不應呼叫 set', async () => {
      mockStorage.local.get.mockResolvedValue({});

      await expect(service.clearNotionState(TEST_PAGE_URL)).resolves.toEqual({
        cleared: true,
      });
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('應通過 URL alias 解析並清除 stableUrl 下的 key', async () => {
      const shortUrl = 'https://example.com/short';
      const stableUrl = 'https://example.com/stable/';
      const aliasKey = `${URL_ALIAS_PREFIX}${shortUrl}`;
      const stablePageKey = pageKeyFor(stableUrl);
      const highlights = [{ id: '2', text: 'alias test' }];

      mockStorageLookup(mockStorage, {
        [aliasKey]: stableUrl,
        [stablePageKey]: buildPageState({
          highlights,
          pageId: 'xyz',
          notionUrl: 'https://notion.so/xyz',
          metadata: { lastUpdated: 200 },
        }),
      });

      await service.clearNotionState(shortUrl);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        buildNotionClearedPayload(stablePageKey, { highlights })
      );
    });

    it('expectedPageId 不匹配時應跳過清除並記錄 warn', async () => {
      mockPageState({
        pageState: buildPageState({
          pageId: 'correct-id-xyz',
        }),
      });

      await expect(
        service.clearNotionState(TEST_PAGE_URL, {
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
      const pageKey = mockPageState({
        pageState: buildPageState({
          pageId: 'match-id-xyz',
        }),
      });

      await service.clearNotionState(TEST_PAGE_URL, {
        expectedPageId: 'match-id-xyz',
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith(buildNotionClearedPayload(pageKey));
    });

    it('未傳 expectedPageId 時行為與舊版相同（無條件清除）', async () => {
      const pageKey = mockPageState({
        pageState: buildPageState({
          highlights: [],
          pageId: 'any-id',
        }),
      });

      await service.clearNotionState(TEST_PAGE_URL);

      expect(mockStorage.local.set).toHaveBeenCalledWith(buildNotionClearedPayload(pageKey));
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
      const clearSpy = mockClearNotionStateSequence(
        new Error('temporary storage failure'),
        undefined
      );

      const result = await clearNotionStateWithRetry({
        source: 'highlightHandlers',
      });

      expect(clearSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        cleared: true,
        attempts: 2,
        recovered: true,
      });
      expectRetryLog(mockLogger.warn, CLEAR_RETRY_WARNING_MESSAGE, {
        attempt: 1,
        source: 'highlightHandlers',
        url: TEST_PAGE_URL,
      });
      expectRetryLog(mockLogger.success, CLEAR_RETRY_SUCCESS_MESSAGE, {
        attempts: 2,
        recovered: true,
        source: 'highlightHandlers',
        url: TEST_PAGE_URL,
      });
    });

    it('兩次嘗試皆失敗時應回傳 cleared: false 並記錄 error 日誌', async () => {
      const clearSpy = mockClearNotionStateSequence(
        new Error('first failure'),
        new Error('second failure')
      );

      const result = await clearNotionStateWithRetry({
        source: 'testSource',
      });

      expect(clearSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        cleared: false,
        attempts: 2,
        error: expect.any(Error),
      });
      expect(result.error.message).toBe('second failure');
      expectRetryLog(mockLogger.warn, CLEAR_RETRY_WARNING_MESSAGE, {
        attempt: 1,
        source: 'testSource',
        error: expect.any(Error),
      });
      expectRetryLog(mockLogger.error, CLEAR_RETRY_FAILURE_MESSAGE, {
        attempts: 2,
        recovered: false,
        source: 'testSource',
        error: expect.any(Error),
      });
    });

    it('clearNotionState 回傳 skipped 時應保留 skipped 狀態而非轉成 cleared', async () => {
      const clearSpy = mockClearNotionStateSequence({
        skipped: true,
        reason: 'pageId_mismatch',
      });

      const result = await clearNotionStateWithRetry({
        source: 'testSource',
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
        CLEAR_RETRY_WARNING_MESSAGE,
        expect.anything()
      );
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        CLEAR_RETRY_FAILURE_MESSAGE,
        expect.anything()
      );
    });
  });
});
