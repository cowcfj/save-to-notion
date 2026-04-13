/**
 * StorageService 單元測試
 */

import {
  StorageService,
  normalizeUrl,
  URL_TRACKING_PARAMS,
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
  STORAGE_ERROR,
} from '../../../../scripts/background/services/StorageService.js';

jest.mock('../../../../scripts/utils/urlUtils.js', () => {
  const original = jest.requireActual('../../../../scripts/utils/urlUtils.js');
  return {
    ...original,
    computeStableUrl: jest.fn(url => `${url}_stable`),
  };
});

describe('normalizeUrl', () => {
  it('應該移除 hash', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('應該移除追蹤參數', () => {
    const url = 'https://example.com/page?utm_source=google&normal=keep';
    expect(normalizeUrl(url)).toBe('https://example.com/page?normal=keep');
  });

  it('應該移除所有追蹤參數', () => {
    URL_TRACKING_PARAMS.forEach(param => {
      const url = `https://example.com/page?${param}=value&normal=keep`;
      const result = normalizeUrl(url);
      expect(result).not.toContain(param);
      expect(result).toContain('normal=keep');
    });
  });

  it('應該標準化尾部斜線', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('應該處理相對 URL', () => {
    expect(normalizeUrl('/relative/path')).toBe('/relative/path');
  });

  it('應該處理空值', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl(null)).toBe('');
  });

  it('應該處理無效 URL', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });

  it('應該總是返回字串類型', () => {
    expect(normalizeUrl(123)).toBe('123');
    expect(normalizeUrl({ custom: 'obj' })).toBe('[object Object]');
    expect(normalizeUrl(['a', 'b'])).toBe('a,b');
    expect(normalizeUrl(true)).toBe('true');
  });
});

describe('StorageService', () => {
  let service = null;
  let mockStorage = null;
  let mockLogger = null;

  beforeEach(() => {
    mockStorage = {
      local: {
        get: jest.fn(() => Promise.resolve({})),
        set: jest.fn(() => Promise.resolve()),
        remove: jest.fn(() => Promise.resolve()),
      },
      sync: {
        get: jest.fn(() => Promise.resolve({})),
        set: jest.fn(() => Promise.resolve()),
      },
    };
    mockLogger = {
      log: jest.fn(),
      success: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    service = new StorageService({
      chromeStorage: mockStorage,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('_buildPageObject', () => {
    it('升級舊資料時不會把 lastVerifiedAt: 0 轉成 null', () => {
      const savedData = { title: 'Test', notionPageId: 'page', lastVerifiedAt: 0, savedAt: 0 };
      const result = service._buildPageObject(savedData, [], 'https://example.com/test');
      expect(result.notion.lastVerifiedAt).toBe(0);
      expect(result.notion.savedAt).toBe(0);
      expect(result.notion.pageId).toBe('page');
    });

    it('升級舊資料時不會把 metadata.createdAt 的 0 轉成現在時間', () => {
      const savedData = { title: 'Test', notionPageId: 'page', savedAt: 0, lastUpdated: 12_345 };
      const result = service._buildPageObject(savedData, [], 'https://example.com/test');

      expect(result.metadata.createdAt).toBe(0);
    });

    it('升級舊資料時會忽略空字串 notion 欄位並回退到有效值', () => {
      const savedData = {
        title: 'Test',
        notionPageId: '',
        pageId: 'legacy-page-id',
        notionUrl: '   ',
        url: 'https://www.notion.so/legacy-page-id',
      };

      const result = service._buildPageObject(savedData, [], 'https://example.com/test');

      expect(result.notion.pageId).toBe('legacy-page-id');
      expect(result.notion.url).toBe('https://www.notion.so/legacy-page-id');
    });
  });

  describe('getSavedPageData', () => {
    const setupLegacyReadPath = ({ url, savedData, highlightData = [] }) => {
      const normalizedUrl = normalizeUrl(url);
      const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
      const savedKey = `${SAVED_PREFIX}${normalizedUrl}`;
      const aliasKey = `${URL_ALIAS_PREFIX}${normalizedUrl}`;
      const highlightKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

      mockStorage.local.get.mockImplementation(keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result = {};

        // _getPageState 讀取：page_* / saved_* / url_alias_*
        if (keyList.includes(pageKey) && keyList.includes(savedKey) && keyList.includes(aliasKey)) {
          result[savedKey] = savedData;
        }

        // _triggerReadTimeUpgrade 讀取：page_* / highlights_*
        if (keyList.includes(pageKey) && keyList.includes(highlightKey)) {
          result[highlightKey] = highlightData;
        }

        return Promise.resolve(result);
      });

      return { normalizedUrl, pageKey, savedKey, highlightKey };
    };

    const flushReadTimeUpgrade = async () => {
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
    };

    it('應該正確獲取保存的頁面數據（page_* 新格式）', async () => {
      const notionData = { pageId: 'page-123', title: 'Test Page', savedAt: 12_345 };
      mockStorage.local.get.mockResolvedValue({
        [`${PAGE_PREFIX}https://example.com/page`]: {
          notion: notionData,
          highlights: [],
          metadata: { createdAt: 12_345, lastUpdated: 12_345 },
        },
      });

      const result = await service.getSavedPageData('https://example.com/page');
      // Phase 3: 返回映射後的 notion 子欄位 (notionPageId, notionUrl, etc.)
      expect(result).toEqual({
        notionPageId: 'page-123',
        notionUrl: null,
        title: 'Test Page',
        savedAt: 12_345,
        lastVerifiedAt: null,
      });
    });

    it('應該在沒有數據時返回 null', async () => {
      const result = await service.getSavedPageData('https://example.com/page');
      expect(result).toBeNull();
    });

    it('應該在 page_* 的 notion 為 null 時返回 null', async () => {
      mockStorage.local.get.mockResolvedValue({
        [`${PAGE_PREFIX}https://example.com/page`]: {
          notion: null,
          highlights: [{ id: 'h1', text: 'test' }],
          metadata: { createdAt: 12_345, lastUpdated: 12_345 },
        },
      });

      const result = await service.getSavedPageData('https://example.com/page');
      expect(result).toBeNull();
    });

    it('應在直接查找失敗時嘗試使用 alias 查找（page_* 格式）', async () => {
      const originalUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';
      const notionData = { pageId: 'page-abc', title: 'Test Page' };

      mockStorage.local.get.mockImplementation(keys => {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];

        keyList.forEach(k => {
          if (k === `${URL_ALIAS_PREFIX}${originalUrl}`) {
            result[k] = stableUrl;
          }
          if (k === `${PAGE_PREFIX}${stableUrl}`) {
            result[k] = { notion: notionData, highlights: [], metadata: {} };
          }
        });

        return Promise.resolve(result);
      });

      const result = await service.getSavedPageData(originalUrl);

      // Phase 3: 返回映射後的 notion 子欄位
      expect(result).toEqual({
        notionPageId: 'page-abc',
        notionUrl: null,
        title: 'Test Page',
        savedAt: null,
        lastVerifiedAt: null,
      });
    });

    it('讀時升級第一次失敗後，應記錄重試狀態與 nextRetryAt', async () => {
      const url = 'https://example.com/retry-first-failure';
      const savedData = { notionPageId: 'legacy-1', title: 'legacy title' };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      jest.spyOn(Math, 'random').mockReturnValue(0);
      mockStorage.local.set.mockRejectedValue(new Error('upgrade write failed'));

      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      expect(result).toEqual(savedData);
      const retryState = service._failedUpgradeAttempts.get(normalizedUrl);
      expect(retryState).toEqual({
        attempts: 1,
        firstFailureAt: 1_700_000_000_000,
        lastFailureAt: 1_700_000_000_000,
        nextRetryAt: 1_700_000_000_500,
      });
    });

    it('尚未到達 nextRetryAt 時，應跳過重試', async () => {
      const url = 'https://example.com/retry-skip-before-next-window';
      const savedData = { notionPageId: 'legacy-2', title: 'legacy title' };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      const now = 1_700_000_001_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      service._failedUpgradeAttempts.set(normalizedUrl, {
        attempts: 1,
        firstFailureAt: now - 1000,
        lastFailureAt: now - 1000,
        nextRetryAt: now + 30_000,
      });

      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      expect(result).toEqual(savedData);
      expect(mockStorage.local.set).not.toHaveBeenCalled();
      expect(mockStorage.local.remove).not.toHaveBeenCalled();
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual(
        expect.objectContaining({
          attempts: 1,
          nextRetryAt: now + 30_000,
        })
      );
    });

    it('超過 nextRetryAt 後，應允許再次嘗試讀時升級', async () => {
      const url = 'https://example.com/retry-after-next-window';
      const savedData = { notionPageId: 'legacy-3', title: 'legacy title' };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      const now = 1_700_000_002_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      jest.spyOn(Math, 'random').mockReturnValue(0);
      service._failedUpgradeAttempts.set(normalizedUrl, {
        attempts: 1,
        firstFailureAt: now - 2000,
        lastFailureAt: now - 1500,
        nextRetryAt: now - 1,
      });
      mockStorage.local.set.mockRejectedValue(new Error('upgrade write failed again'));

      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      expect(result).toEqual(savedData);
      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual({
        attempts: 2,
        firstFailureAt: now - 2000,
        lastFailureAt: now,
        nextRetryAt: now + 1000,
      });
    });

    it('讀時升級成功後，應清除失敗追蹤狀態', async () => {
      const url = 'https://example.com/retry-clear-on-success';
      const savedData = { notionPageId: 'legacy-4', title: 'legacy title' };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      const now = 1_700_000_003_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      service._failedUpgradeAttempts.set(normalizedUrl, {
        attempts: 2,
        firstFailureAt: now - 5000,
        lastFailureAt: now - 1000,
        nextRetryAt: now - 1,
      });
      mockStorage.local.set.mockResolvedValue();
      mockStorage.local.remove.mockResolvedValue();

      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      expect(result).toEqual(savedData);
      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(mockStorage.local.remove).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.has(normalizedUrl)).toBe(false);
    });

    it('達到 maxAttempts 且仍在 TTL 內時，應跳過重試', async () => {
      const url = 'https://example.com/retry-max-attempts';
      const savedData = { notionPageId: 'legacy-5', title: 'legacy title' };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      const now = 1_700_000_004_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      service._failedUpgradeAttempts.set(normalizedUrl, {
        attempts: 5,
        firstFailureAt: now - 10_000, // 仍在 30 分鐘 TTL 內
        lastFailureAt: now - 1000,
        nextRetryAt: now - 1,
      });

      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      expect(result).toEqual(savedData);
      expect(mockStorage.local.set).not.toHaveBeenCalled();
      expect(mockStorage.local.remove).not.toHaveBeenCalled();
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual(
        expect.objectContaining({
          attempts: 5,
        })
      );
    });

    it('應在第 5 次失敗時將 nextRetryAt 設為 firstFailureAt + TTL', async () => {
      const url = 'https://example.com/retry-hit-max-attempt';
      const savedData = { notionPageId: 'legacy-7', title: 'legacy title' };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      const now = 1_700_000_004_500;
      const ttlMs = 30 * 60 * 1000;
      const firstFailureAt = now - 20_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);

      service._failedUpgradeAttempts.set(normalizedUrl, {
        attempts: 4,
        firstFailureAt,
        lastFailureAt: now - 1000,
        nextRetryAt: now - 1,
      });
      mockStorage.local.set.mockRejectedValue(new Error('upgrade write failed at attempt 5'));

      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      expect(result).toEqual(savedData);
      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual({
        attempts: 5,
        firstFailureAt,
        lastFailureAt: now,
        nextRetryAt: firstFailureAt + ttlMs,
      });
    });

    it('超過 TTL 後，應重置並允許新一輪嘗試', async () => {
      const url = 'https://example.com/retry-reset-after-ttl';
      const savedData = { notionPageId: 'legacy-6', title: 'legacy title' };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      const now = 1_700_000_005_000;
      const ttlMs = 30 * 60 * 1000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      jest.spyOn(Math, 'random').mockReturnValue(0);
      service._failedUpgradeAttempts.set(normalizedUrl, {
        attempts: 5,
        firstFailureAt: now - ttlMs - 1,
        lastFailureAt: now - ttlMs - 1,
        nextRetryAt: now + 999_999,
      });
      mockStorage.local.set.mockRejectedValue(new Error('upgrade write failed after ttl'));

      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      expect(result).toEqual(savedData);
      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual({
        attempts: 1,
        firstFailureAt: now,
        lastFailureAt: now,
        nextRetryAt: now + 500,
      });
    });
  });

  describe('setSavedPageData', () => {
    it('應該正確設置頁面數據（Phase 3: page_*.notion partial update）', async () => {
      // 先設定無既有資料（新建路徑）
      mockStorage.local.get.mockResolvedValue({});
      const data = { title: 'Test Page', pageId: 'page-123' };
      await service.setSavedPageData('https://example.com/page', data);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`${PAGE_PREFIX}https://example.com/page`]: expect.objectContaining({
            notion: expect.objectContaining({ title: 'Test Page' }),
            metadata: expect.objectContaining({ lastUpdated: expect.any(Number) }),
          }),
        })
      );
    });

    it('應該在刪除舊 saved_* key 失敗時記錄 debug 日誌', async () => {
      mockStorage.local.get.mockResolvedValue({});
      mockStorage.local.remove.mockRejectedValue(new Error('Remove failed'));
      // 使用 optional chaining 的 mock
      mockLogger.debug = jest.fn();

      const data = { title: 'Test Page', pageId: 'page-123' };
      await service.setSavedPageData('https://example.com/page', data);

      // Verify that data was still set correctly despite the remove error
      expect(mockStorage.local.set).toHaveBeenCalled();

      // Since remove is non-blocking (Promise.catch), we might need to wait for the microtask queue
      await new Promise(process.nextTick);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StorageService] Failed to remove legacy keys',
        expect.objectContaining({ error: 'Remove failed' })
      );
    });

    it('應該在 page_* 不存在時，從舊格式 highlights_* 取回並保留標注', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      const hlKey = `${HIGHLIGHTS_PREFIX}https://example.com/page`;
      const legacyHighlights = [
        { id: 'h1', text: 'first highlight', color: 'yellow' },
        { id: 'h2', text: 'second highlight', color: 'green' },
      ];

      // page_* 不存在，highlights_* 存在（舊格式純陣列）
      mockStorage.local.get.mockResolvedValue({ [hlKey]: legacyHighlights });

      const data = { title: 'Test Page', notionPageId: 'page-abc', savedAt: 1000 };
      await service.setSavedPageData('https://example.com/page', data);

      const setPayload = mockStorage.local.set.mock.calls[0][0][pageKey];
      expect(setPayload.notion).toEqual(expect.objectContaining({ pageId: 'page-abc' }));
      expect(setPayload.highlights).toEqual([
        expect.objectContaining({
          id: 'h1',
          text: 'first highlight',
          color: 'yellow',
          rangeInfo: expect.any(Object),
          timestamp: expect.any(Number),
        }),
        expect.objectContaining({
          id: 'h2',
          text: 'second highlight',
          color: 'green',
          rangeInfo: expect.any(Object),
          timestamp: expect.any(Number),
        }),
      ]);
      // highlights_* 應被清理（已遷移到 page_*）
      expect(mockStorage.local.remove).toHaveBeenCalledWith(expect.arrayContaining([hlKey]));
    });

    it('應該在 page_* 已存在時，保留其 highlights 而非回退到 highlights_*', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      const hlKey = `${HIGHLIGHTS_PREFIX}https://example.com/page`;
      const existingHighlights = [
        {
          id: 'h3',
          text: 'existing in page_*',
          color: 'yellow',
          rangeInfo: { start: 0, end: 3 },
          timestamp: 1_700_000_000_001,
        },
      ];
      const staleHighlights = [{ id: 'h1', text: 'stale in highlights_*' }];

      // page_* 已存在（有自己的 highlights），highlights_* 也存在（舊資料）
      mockStorage.local.get.mockResolvedValue({
        [pageKey]: { highlights: existingHighlights, notion: null, metadata: {} },
        [hlKey]: staleHighlights,
      });

      const data = { title: 'Test', notionPageId: 'page-xyz' };
      await service.setSavedPageData('https://example.com/page', data);

      // 應使用 page_* 的 highlights，而非 highlights_* 的舊資料
      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [pageKey]: expect.objectContaining({
            highlights: existingHighlights,
          }),
        })
      );
    });

    it('應該在 current.highlights 非陣列時覆寫為合法 highlights 陣列', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      const hlKey = `${HIGHLIGHTS_PREFIX}https://example.com/page`;
      mockStorage.local.get.mockResolvedValue({
        [pageKey]: { highlights: { invalid: true }, notion: null, metadata: {} },
        [hlKey]: [{ id: 'legacy', text: 'legacy text', color: 'yellow' }],
      });

      const data = { title: 'Test', notionPageId: 'page-xyz' };
      await service.setSavedPageData('https://example.com/page', data);

      const setPayload = mockStorage.local.set.mock.calls[0][0][pageKey];
      expect(Array.isArray(setPayload.highlights)).toBe(true);
      expect(setPayload.highlights).toEqual([]);
    });

    it('寫入 { lastVerifiedAt: 0, savedAt: 0 } 等 falsy 值後可原值保留，不被轉為 null', async () => {
      mockStorage.local.get.mockResolvedValue({});
      const data = { title: 'Test Page', pageId: 'page-123', lastVerifiedAt: 0, savedAt: 0 };
      await service.setSavedPageData('https://example.com/page', data);

      const setPayload =
        mockStorage.local.set.mock.calls[0][0][`${PAGE_PREFIX}https://example.com/page`];
      expect(setPayload.notion.lastVerifiedAt).toBe(0);
      expect(setPayload.notion.savedAt).toBe(0);
    });

    it('遇到空字串 notion 欄位時應保留現有有效 pageId 與 url', async () => {
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      mockStorage.local.get.mockResolvedValue({
        [pageKey]: {
          highlights: [],
          notion: {
            pageId: 'existing-page-id',
            url: 'https://www.notion.so/existing-page-id',
            title: 'Existing Title',
            savedAt: 123,
            lastVerifiedAt: 456,
          },
          metadata: {},
        },
      });

      const data = {
        title: 'Updated Title',
        notionPageId: '',
        pageId: '   ',
        notionUrl: '',
        url: '   ',
      };

      await service.setSavedPageData('https://example.com/page', data);

      const setPayload = mockStorage.local.set.mock.calls[0][0][pageKey];
      expect(setPayload.notion.pageId).toBe('existing-page-id');
      expect(setPayload.notion.url).toBe('https://www.notion.so/existing-page-id');
      expect(setPayload.notion.title).toBe('Updated Title');
    });
  });

  describe('clearPageState', () => {
    it('應該清除頁面狀態（Phase 3: 刪除 page_* keys）', async () => {
      await service.clearPageState('https://example.com/page');

      // Phase 3: 同時刪除 page_* 新格式 key 和舊格式 saved_* key
      // Note: computeStableUrl is mocked to return url + '_stable'
      const removeCall = mockStorage.local.remove.mock.calls[0][0];
      expect(removeCall).toContain(`${PAGE_PREFIX}https://example.com/page`);
      expect(removeCall).toContain(`${PAGE_PREFIX}https://example.com/page_stable`);
      expect(removeCall).toContain(`${SAVED_PREFIX}https://example.com/page`);
      expect(mockLogger.log).toHaveBeenCalledWith('Cleared saved page metadata', {
        url: 'https://example.com/page',
      });
    });
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

      await expect(service.clearNotionState('https://example.com/page')).resolves.toBeUndefined();
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('應通過 URL alias 解析並清除 stableUrl 下的 key', async () => {
      const shortUrl = 'https://example.com/short';
      const stableUrl = 'https://example.com/stable/';
      const aliasKey = `${URL_ALIAS_PREFIX}${shortUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;

      mockStorage.local.get
        .mockResolvedValueOnce({
          // 第一次 get：[page_{short}, saved_{short}, url_alias_{short}]
          [aliasKey]: stableUrl,
        })
        .mockResolvedValueOnce({
          // 第二次 get：[page_{stable}, saved_{stable}]
          [stablePageKey]: {
            highlights: [{ id: '2', text: 'alias test' }],
            notion: { pageId: 'xyz', url: 'https://notion.so/xyz' },
            metadata: { lastUpdated: 200 },
          },
        });

      await service.clearNotionState(shortUrl);

      // 應寫入 stableUrl 下的 key，而非 shortUrl 的 key
      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [stablePageKey]: expect.objectContaining({
            highlights: [{ id: '2', text: 'alias test' }],
            notion: null,
          }),
        })
      );
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
  });

  describe('clearLegacyKeys', () => {
    it('應該清除 normalized URL 的三種 keys（Phase 3: page_* + saved_* + highlights_*）', async () => {
      await service.clearLegacyKeys('https://example.com/article?utm_source=test');

      // Phase 3: 刪除 page_*, saved_*, highlights_* 三種前綴
      expect(mockStorage.local.remove).toHaveBeenCalledWith([
        `${PAGE_PREFIX}https://example.com/article`,
        `${SAVED_PREFIX}https://example.com/article`,
        `${HIGHLIGHTS_PREFIX}https://example.com/article`,
      ]);

      const removeCall = mockStorage.local.remove.mock.calls[0][0];
      expect(removeCall).toHaveLength(3);
    });

    it('應該記錄成功日誌', async () => {
      await service.clearLegacyKeys('https://example.com/page');

      expect(mockLogger.log).toHaveBeenCalledWith('Cleared legacy keys', {
        url: 'https://example.com/page',
      });
    });

    it('應該處理錯誤', async () => {
      mockStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(service.clearLegacyKeys('https://example.com/page')).rejects.toThrow(
        'Remove failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[StorageService] clearLegacyKeys failed',
        expect.any(Object)
      );
    });
  });

  describe('savePageDataAndHighlights', () => {
    const sampleHighlight = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      text: 'Example highlight text',
      color: 'yellow',
      timestamp: 1_700_000_000_000,
      domPath: 'body > article > p:nth-child(2)',
    };

    it('應該以 page_* 格式原子寫入頁面數據和標註（Phase 3）', async () => {
      const pageData = { title: 'Test', pageId: 'page-123' };
      const highlights = [sampleHighlight];
      await service.savePageDataAndHighlights('https://example.com/page', pageData, highlights);

      const setCall = mockStorage.local.set.mock.calls[0][0];
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      expect(setCall[pageKey]).toBeDefined();
      expect(setCall[pageKey].notion).toBeDefined();
      expect(setCall[pageKey].highlights).toHaveLength(1);
      expect(setCall[pageKey].highlights[0].id).toBe(sampleHighlight.id);
      expect(setCall[pageKey].highlights[0].text).toBe(sampleHighlight.text);
      expect(setCall[pageKey].highlights[0].color).toBe(sampleHighlight.color);
      expect(setCall[pageKey].highlights[0].timestamp).toBe(sampleHighlight.timestamp);
      expect(setCall[pageKey].highlights[0].domPath).toBe(sampleHighlight.domPath);
      expect(setCall[pageKey].metadata).toBeDefined();
    });

    it('應該在 pageData 為 null 時仍寫入 highlights', async () => {
      const highlights = [
        sampleHighlight,
        {
          ...sampleHighlight,
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          text: 'Second highlight',
        },
      ];
      await service.savePageDataAndHighlights('https://example.com/page', null, highlights);

      const setCall = mockStorage.local.set.mock.calls[0][0];
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      expect(setCall[pageKey].notion).toBeNull();
      expect(setCall[pageKey].highlights).toHaveLength(2);
      expect(setCall[pageKey].highlights[0].id).toBe(sampleHighlight.id);
    });

    it('應該在 highlights 為 null 時仍寫入 pageData（notion = null 除外）', async () => {
      const pageData = { title: 'Test', pageId: 'page-123' };
      await service.savePageDataAndHighlights('https://example.com/page', pageData, null);

      const setCall = mockStorage.local.set.mock.calls[0][0];
      const pageKey = `${PAGE_PREFIX}https://example.com/page`;
      expect(setCall[pageKey].notion).toBeDefined();
      expect(setCall[pageKey].highlights).toEqual([]);
    });

    it('如果全部為 null 則不應調用 set', async () => {
      await service.savePageDataAndHighlights('https://example.com/page', null, null);
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('setUrlAlias', () => {
    it('應該設定 URL alias 映射', async () => {
      const originalUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';

      await service.setUrlAlias(originalUrl, stableUrl);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
      });
    });

    it('如果兩者相同則不應設定 alias', async () => {
      await service.setUrlAlias('https://example.com/same', 'https://example.com/same');
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('如果 URL 標準化後相同則不應設定 alias', async () => {
      const url1 = 'https://example.com/page?utm_source=test';
      const url2 = 'https://example.com/page';
      // normalizeUrl is the real implementation, so these URLs become identical, preventing alias creation
      await service.setUrlAlias(url1, url2);
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('應該處理無效輸入 (null/empty)', async () => {
      await service.setUrlAlias(null, 'stable');
      await service.setUrlAlias('original', null);
      await service.setUrlAlias('', 'stable');
      await service.setUrlAlias('original', '');
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('應該記錄並拋出存儲錯誤', async () => {
      mockStorage.local.set.mockRejectedValue(new Error('Storage Error'));
      const originalUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';

      await expect(service.setUrlAlias(originalUrl, stableUrl)).rejects.toThrow('Storage Error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[StorageService] setUrlAlias failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('getConfig', () => {
    it('應該從 sync storage 獲取配置', async () => {
      mockStorage.sync.get.mockResolvedValue({ apiKey: 'test-key' });

      const result = await service.getConfig(['apiKey']);
      expect(result).toEqual({ apiKey: 'test-key' });
    });
  });

  describe('setConfig', () => {
    it('應該正確設置配置', async () => {
      await service.setConfig({ apiKey: 'new-key' });
      expect(mockStorage.sync.set).toHaveBeenCalledWith({ apiKey: 'new-key' });
    });

    it('應該將 local key 儲存到 local storage', async () => {
      await service.setConfig({ notionDataSourceId: 'ds_local_123' });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        notionDataSourceId: 'ds_local_123',
      });
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('getAllSavedPageUrls', () => {
    it('應該返回所有已保存頁面的 URL（Phase 3: page_*.notion 非 null）', async () => {
      mockStorage.local.get.mockResolvedValue({
        [`${PAGE_PREFIX}https://example.com/page1`]: {
          notion: { pageId: 'p1' },
          highlights: [],
          metadata: {},
        },
        [`${PAGE_PREFIX}https://example.com/page2`]: {
          notion: { pageId: 'p2' },
          highlights: [],
          metadata: {},
        },
        // 無 notion 的 page_* 不應被計算
        [`${PAGE_PREFIX}https://example.com/page3`]: {
          notion: null,
          highlights: [],
          metadata: {},
        },
        // 過渡期：舊格式也要計算
        [`${SAVED_PREFIX}https://example.com/page4`]: {},
        other_key: 'value',
      });

      const result = await service.getAllSavedPageUrls();
      expect(result.toSorted((a, b) => a.localeCompare(b))).toEqual(
        [
          'https://example.com/page1',
          'https://example.com/page2',
          'https://example.com/page4',
        ].toSorted((a, b) => a.localeCompare(b))
      );
    });

    it('應在提供 allData 時直接使用該資料且不呼叫 storage.local.get', async () => {
      const allData = {
        [`${PAGE_PREFIX}https://example.com/all-data-page1`]: {
          notion: { pageId: 'p1' },
          highlights: [],
          metadata: {},
        },
        [`${PAGE_PREFIX}https://example.com/all-data-page2`]: {
          notion: null,
          highlights: [],
          metadata: {},
        },
        [`${SAVED_PREFIX}https://example.com/all-data-page3`]: {},
        other_key: 'value',
      };
      mockStorage.local.get.mockClear();

      const result = await service.getAllSavedPageUrls(allData);

      expect(mockStorage.local.get).not.toHaveBeenCalled();
      expect(result.toSorted((a, b) => a.localeCompare(b))).toEqual(
        ['https://example.com/all-data-page1', 'https://example.com/all-data-page3'].toSorted(
          (a, b) => a.localeCompare(b)
        )
      );
    });
  });

  describe('getAllHighlights', () => {
    it('應該返回所有 page_* 和 highlights_* 的標註資料（Phase 3）', async () => {
      mockStorage.local.get.mockResolvedValue({
        // 新格式（Phase 3）
        [`${PAGE_PREFIX}https://example.com/page1`]: {
          notion: { pageId: 'p1' },
          highlights: ['h1'],
          metadata: {},
        },
        // 舊格式（過渡期）
        [`${HIGHLIGHTS_PREFIX}https://example.com/page2`]: {
          url: 'https://example.com/page2',
          highlights: ['h2'],
        },
        // 同 URL 有 page_* 時，highlights_* 不應覆蓋
        [`${HIGHLIGHTS_PREFIX}https://example.com/page1`]: {
          url: 'https://example.com/page1',
          highlights: ['legacy-h1'],
        },
        other_key: 'value',
      });

      const result = await service.getAllHighlights();
      // page1 使用 page_* 資料（不被舊 highlights_* 覆蓋）
      expect(result['https://example.com/page1']).toEqual({
        url: 'https://example.com/page1',
        highlights: ['h1'],
      });
      // page2 使用 highlights_* 資料（尚未升級）
      expect(result['https://example.com/page2']).toEqual({
        url: 'https://example.com/page2',
        highlights: ['h2'],
      });
    });

    it('應在提供 allData 時直接使用該資料且不呼叫 storage.local.get', async () => {
      const allData = {
        [`${PAGE_PREFIX}https://example.com/all-data-page1`]: {
          notion: { pageId: 'p1' },
          highlights: ['new-h1'],
          metadata: {},
        },
        [`${HIGHLIGHTS_PREFIX}https://example.com/all-data-page1`]: {
          url: 'https://example.com/all-data-page1',
          highlights: ['legacy-h1'],
        },
        [`${HIGHLIGHTS_PREFIX}https://example.com/all-data-page2`]: {
          url: 'https://example.com/all-data-page2',
          highlights: ['legacy-h2'],
        },
        other_key: 'value',
      };
      mockStorage.local.get.mockClear();

      const result = await service.getAllHighlights(allData);

      expect(mockStorage.local.get).not.toHaveBeenCalled();
      expect(result['https://example.com/all-data-page1']).toEqual({
        url: 'https://example.com/all-data-page1',
        highlights: ['new-h1'],
      });
      expect(result['https://example.com/all-data-page2']).toEqual({
        url: 'https://example.com/all-data-page2',
        highlights: ['legacy-h2'],
      });
    });
  });

  describe('updateHighlights', () => {
    it('應該更新 page_* 的 highlights 欄位（Phase 3）', async () => {
      const existingPageData = {
        notion: { pageId: 'p123' },
        highlights: ['old-h1'],
        metadata: { createdAt: 1000, lastUpdated: 1000 },
      };
      mockStorage.local.get.mockResolvedValue({
        [`${PAGE_PREFIX}https://example.com/page`]: existingPageData,
      });

      const newHighlights = ['h1', 'h2'];
      await service.updateHighlights('https://example.com/page', newHighlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}https://example.com/page`]: expect.objectContaining({
          notion: { pageId: 'p123' },
          highlights: newHighlights,
          metadata: expect.objectContaining({ lastUpdated: expect.any(Number) }),
        }),
      });
    });

    it('如果沒有現有 page_* 資料，應該創建新的 page_* 結構（notion 為 null）', async () => {
      mockStorage.local.get.mockResolvedValue({});

      const newHighlights = ['h1'];
      await service.updateHighlights('https://example.com/page', newHighlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}https://example.com/page`]: expect.objectContaining({
          notion: null,
          highlights: newHighlights,
        }),
      });
    });

    it('如果有舊版 highlights_* 資料，應該升級到 page_* 格式並刪除舊 key', async () => {
      mockStorage.local.get.mockResolvedValue({
        [`${HIGHLIGHTS_PREFIX}https://example.com/page`]: ['old_h1'],
      });

      const newHighlights = ['h1'];
      await service.updateHighlights('https://example.com/page', newHighlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}https://example.com/page`]: expect.objectContaining({
          notion: null,
          highlights: newHighlights,
        }),
      });
      // 舊 key 應被非同步刪除（非同步，不一定即時呼叫）
    });

    it('應該在刪除舊 highlights_* key 失敗時記錄 debug 日誌', async () => {
      mockStorage.local.get.mockResolvedValue({
        [`${HIGHLIGHTS_PREFIX}https://example.com/page`]: ['old_h1'],
      });
      mockStorage.local.remove.mockRejectedValue(new Error('Remove highlights failed'));
      mockLogger.debug = jest.fn();

      await service.updateHighlights('https://example.com/page', ['h1']);

      // 確保 set 已經被呼叫
      expect(mockStorage.local.set).toHaveBeenCalled();

      // 等待微任務佇列清空，讓 .catch 執行
      await new Promise(process.nextTick);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StorageService] Failed to remove legacy highlights key',
        expect.objectContaining({ error: 'Remove highlights failed' })
      );
    });

    it('應該在 storage.local.set 失敗時記錄錯誤並拋出（寫入階段）', async () => {
      mockStorage.local.get.mockResolvedValue({
        [`${PAGE_PREFIX}https://example.com/page`]: {
          notion: null,
          highlights: ['old-h1'],
          metadata: {},
        },
      });

      mockStorage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(service.updateHighlights('https://example.com/page', ['h1'])).rejects.toThrow(
        'Write failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[StorageService] updateHighlights failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('error handling', () => {
    it('應該在沒有 storage 時拋出錯誤', async () => {
      const originalChrome = globalThis.chrome;
      delete globalThis.chrome;

      const serviceNoStorage = new StorageService({ chromeStorage: null });

      await expect(serviceNoStorage.getSavedPageData('url')).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.setSavedPageData('url', {})).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.clearPageState('url')).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.getConfig(['key'])).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.setConfig({ key: 'val' })).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.getAllSavedPageUrls()).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.getAllHighlights()).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.updateHighlights('url', [])).rejects.toThrow(STORAGE_ERROR);

      globalThis.chrome = originalChrome;
    });

    it('應該在 storage.local.get 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.getSavedPageData('url')).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.local.set 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.set.mockRejectedValue(new Error('Storage fail'));
      await expect(service.setSavedPageData('url', {})).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.local.remove 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.remove.mockRejectedValue(new Error('Storage fail'));
      await expect(service.clearPageState('url')).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.sync.get 失敗時記錄錯誤並拋出', async () => {
      mockStorage.sync.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.getConfig(['key'])).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.sync.set 失敗時記錄錯誤並拋出', async () => {
      mockStorage.sync.set.mockRejectedValue(new Error('Storage fail'));
      await expect(service.setConfig({ key: 'val' })).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 getAllSavedPageUrls 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.getAllSavedPageUrls()).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 getAllHighlights 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.getAllHighlights()).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 updateHighlights 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.updateHighlights('url', [])).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });
  });
});
