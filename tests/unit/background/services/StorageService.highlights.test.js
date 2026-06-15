import {
  StorageService,
  PAGE_PREFIX,
  HIGHLIGHTS_PREFIX,
  URL_ALIAS_PREFIX,
  STORAGE_ERROR,
} from '../../../../scripts/background/services/StorageService.js';
import {
  createStorageServiceHarness,
  mockStorageLookup,
} from '../../../helpers/storageServiceTestHarness.js';

describe('StorageService - Highlights', () => {
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

  describe('getHighlights', () => {
    const NORM_URL = 'https://example.com/posts/hello';
    const RAW_URL = 'https://example.com/posts/hello?utm_source=twitter#frag';
    const STABLE_URL = 'https://example.com/?p=123';
    const PAGE_NORM = `${PAGE_PREFIX}${NORM_URL}`;
    const PAGE_STABLE = `${PAGE_PREFIX}${STABLE_URL}`;
    const HL_NORM = `${HIGHLIGHTS_PREFIX}${NORM_URL}`;
    const ALIAS_NORM = `${URL_ALIAS_PREFIX}${NORM_URL}`;
    const ALIAS_RAW = `${URL_ALIAS_PREFIX}${RAW_URL}`;
    const SAMPLE_HIGHLIGHTS = [{ id: 'h1', text: 'Hello', color: 'yellow' }];

    it('無 alias：命中 page_<normalizedUrl>，回傳 highlights', async () => {
      mockStorageLookup(mockStorage, {
        [PAGE_NORM]: { highlights: SAMPLE_HIGHLIGHTS, notion: null },
      });
      const result = await service.getHighlights(NORM_URL);
      expect(result).toEqual(SAMPLE_HIGHLIGHTS);
    });

    it('無 alias：page_* 不存在，fallback 到 highlights_<normalizedUrl>（純陣列）', async () => {
      mockStorageLookup(mockStorage, { [HL_NORM]: SAMPLE_HIGHLIGHTS });
      const result = await service.getHighlights(NORM_URL);
      expect(result).toEqual(SAMPLE_HIGHLIGHTS);
    });

    it('無 alias：所有 key 均不存在，回傳 null', async () => {
      mockStorageLookup(mockStorage, {});
      const result = await service.getHighlights(NORM_URL);
      expect(result).toBeNull();
    });

    it('有 alias：alias 指向 STABLE_URL，優先命中 page_<stableUrl>', async () => {
      mockStorageLookup(mockStorage, {
        [ALIAS_NORM]: STABLE_URL,
        [PAGE_STABLE]: { highlights: SAMPLE_HIGHLIGHTS, notion: { pageId: 'abc' } },
        [PAGE_NORM]: { highlights: [{ id: 'stale' }], notion: null },
      });
      const result = await service.getHighlights(NORM_URL);
      expect(result).toEqual(SAMPLE_HIGHLIGHTS);
    });

    it('有 alias：page_<stableUrl> miss，fallback 到 page_<normalizedUrl>', async () => {
      const normHighlights = [{ id: 'hn', text: 'norm', color: 'green' }];
      mockStorageLookup(mockStorage, {
        [ALIAS_NORM]: STABLE_URL,
        [PAGE_NORM]: { highlights: normHighlights, notion: null },
      });
      const result = await service.getHighlights(NORM_URL);
      expect(result).toEqual(normHighlights);
    });

    it('有 alias 但非法（非 http）：退回無 alias 路徑，命中 page_<normalizedUrl>', async () => {
      mockStorageLookup(mockStorage, {
        [ALIAS_NORM]: 'ftp://example.com/file',
        [PAGE_NORM]: { highlights: SAMPLE_HIGHLIGHTS, notion: null },
      });
      const result = await service.getHighlights(NORM_URL);
      expect(result).toEqual(SAMPLE_HIGHLIGHTS);
    });

    it('page_* highlights 欄位損壞（非陣列）：fallback 到 highlights_*', async () => {
      mockStorageLookup(mockStorage, {
        [PAGE_NORM]: { highlights: 'corrupted', notion: null },
        [HL_NORM]: SAMPLE_HIGHLIGHTS,
      });
      const result = await service.getHighlights(NORM_URL);
      expect(result).toEqual(SAMPLE_HIGHLIGHTS);
    });

    it('有 alias：page_* miss，fallback 到 highlights_<stableUrl>（alias 舊格式）', async () => {
      const HL_STABLE = `${HIGHLIGHTS_PREFIX}${STABLE_URL}`;
      const stableHlHighlights = [{ id: 'hs', text: 'stable legacy', color: 'blue' }];
      mockStorageLookup(mockStorage, {
        [ALIAS_NORM]: STABLE_URL,
        [HL_STABLE]: stableHlHighlights,
        [HL_NORM]: [{ id: 'hn', text: 'norm legacy', color: 'red' }],
      });
      const result = await service.getHighlights(NORM_URL);
      expect(result).toEqual(stableHlHighlights);
    });

    it('[REGRESSION] rawUrl alias key 存在時，應能透過 alias 命中 page_<stableUrl>', async () => {
      mockStorageLookup(mockStorage, {
        [ALIAS_RAW]: STABLE_URL,
        [PAGE_STABLE]: { highlights: SAMPLE_HIGHLIGHTS, notion: { pageId: 'abc' } },
      });

      const result = await service.getHighlights(RAW_URL);

      expect(result).toEqual(SAMPLE_HIGHLIGHTS);
      expect(mockStorage.local.get).toHaveBeenCalledWith(
        expect.arrayContaining([
          ALIAS_NORM,
          ALIAS_RAW,
          PAGE_NORM,
          `${PAGE_PREFIX}${RAW_URL}`,
          HL_NORM,
          `${HIGHLIGHTS_PREFIX}${RAW_URL}`,
        ])
      );
    });

    it('storage 不可用時應拋出 STORAGE_ERROR', async () => {
      service.storage = null;
      await expect(service.getHighlights(NORM_URL)).rejects.toThrow(STORAGE_ERROR);
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
    });

    it('應該在 pageData 為 null時仍寫入 highlights', async () => {
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

    it('[CANONICAL] alias 命中時應該寫入 page_<stableUrl> 並清理 page_<original> 與 highlights_<original>', async () => {
      const originalUrl = 'https://example.com/article?ref=xyz';
      const stableUrl = 'https://example.com/article';
      const aliasNormKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const originalPageKey = `${PAGE_PREFIX}${originalUrl}`;
      const originalLegacyKey = `${HIGHLIGHTS_PREFIX}${originalUrl}`;

      mockStorageLookup(mockStorage, {
        [aliasNormKey]: stableUrl,
        [originalPageKey]: { notion: { pageId: 'old' }, highlights: ['stale'], metadata: {} },
        [originalLegacyKey]: ['legacy-h'],
      });

      const pageData = { title: 'Article', pageId: 'page-new' };
      const highlights = [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          text: 'fresh highlight',
          color: 'yellow',
          timestamp: 1_700_000_000_000,
          domPath: 'body > p',
        },
      ];

      await service.savePageDataAndHighlights(originalUrl, pageData, highlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [stablePageKey]: expect.objectContaining({
          notion: expect.objectContaining({ pageId: 'page-new' }),
          highlights: expect.arrayContaining([expect.objectContaining({ id: highlights[0].id })]),
        }),
      });
      expect(mockStorage.local.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ [originalPageKey]: expect.anything() })
      );
      const removedKeys = mockStorage.local.remove.mock.calls.flatMap(args => args[0]);
      expect(removedKeys).toEqual(expect.arrayContaining([originalPageKey, originalLegacyKey]));
    });

    it('legacy cleanup MUST 清理 value 為 null 的歷史毀損 key（key 存在性而非 truthiness）', async () => {
      const originalUrl = 'https://example.com/article?ref=xyz';
      const stableUrl = 'https://example.com/article';
      const aliasNormKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const originalPageKey = `${PAGE_PREFIX}${originalUrl}`;

      mockStorageLookup(mockStorage, {
        [aliasNormKey]: stableUrl,
        [originalPageKey]: null,
      });

      const pageData = { title: 'Article', pageId: 'page-new' };
      const highlights = [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          text: 'fresh highlight',
          color: 'yellow',
          timestamp: 1_700_000_000_000,
          domPath: 'body > p',
        },
      ];

      await service.savePageDataAndHighlights(originalUrl, pageData, highlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [stablePageKey]: expect.any(Object),
      });
      const removedKeys = mockStorage.local.remove.mock.calls.flatMap(args => args[0]);
      expect(removedKeys).toEqual(expect.arrayContaining([originalPageKey]));
    });
  });

  describe('updateHighlights', () => {
    it('應該更新 page_* 的 highlights 欄位（Phase 3）', async () => {
      const existingPageData = {
        notion: { pageId: 'p123' },
        highlights: ['old-h1'],
        metadata: { createdAt: 1000, lastUpdated: 1000 },
      };
      mockStorageLookup(mockStorage, {
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
      mockStorageLookup(mockStorage, {});

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
      const legacyKey = `${HIGHLIGHTS_PREFIX}https://example.com/page`;
      mockStorageLookup(mockStorage, {
        [legacyKey]: ['old_h1'],
      });

      const newHighlights = ['h1'];
      await service.updateHighlights('https://example.com/page', newHighlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}https://example.com/page`]: expect.objectContaining({
          notion: null,
          highlights: newHighlights,
        }),
      });

      await new Promise(process.nextTick);

      const removedKeys = mockStorage.local.remove.mock.calls.flatMap(args => args[0]);
      expect(removedKeys).toContain(legacyKey);
    });

    it('應該在刪除舊 highlights_* key 失敗時記錄 debug 日誌', async () => {
      mockStorageLookup(mockStorage, {
        [`${HIGHLIGHTS_PREFIX}https://example.com/page`]: ['old_h1'],
      });
      mockStorage.local.remove.mockRejectedValue(new Error('Remove highlights failed'));
      mockLogger.debug = jest.fn();

      await service.updateHighlights('https://example.com/page', ['h1']);

      expect(mockStorage.local.set).toHaveBeenCalled();
      await new Promise(process.nextTick);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StorageService] Failed to remove legacy keys',
        expect.objectContaining({
          error: 'Remove highlights failed',
          keys: expect.arrayContaining([`${HIGHLIGHTS_PREFIX}https://example.com/page`]),
        })
      );
    });

    it('應該在 storage.local.set 失敗時記錄錯誤並拋出（寫入階段）', async () => {
      mockStorageLookup(mockStorage, {
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

    it('alias 命中時應該寫入 page_<stableUrl> 並 cleanup legacy keys', async () => {
      const originalUrl = 'https://example.com/article?ref=abc';
      const stableUrl = 'https://example.com/article';
      const aliasNormKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const originalPageKey = `${PAGE_PREFIX}${originalUrl}`;
      const originalLegacyKey = `${HIGHLIGHTS_PREFIX}${originalUrl}`;
      const stableLegacyKey = `${HIGHLIGHTS_PREFIX}${stableUrl}`;

      mockStorageLookup(mockStorage, {
        [aliasNormKey]: stableUrl,
        [stablePageKey]: {
          notion: { pageId: 'stable-pid' },
          highlights: ['old-stable-h1'],
          metadata: { createdAt: 1000, lastUpdated: 1500 },
        },
        [originalPageKey]: {
          notion: null,
          highlights: ['old-original-h1'],
          metadata: { createdAt: 800, lastUpdated: 900 },
        },
        [originalLegacyKey]: ['old-legacy-h1'],
      });

      const newHighlights = ['h1', 'h2'];
      await service.updateHighlights(originalUrl, newHighlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [stablePageKey]: expect.objectContaining({
          notion: { pageId: 'stable-pid' },
          highlights: newHighlights,
          metadata: expect.objectContaining({ lastUpdated: expect.any(Number) }),
        }),
      });
      expect(mockStorage.local.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ [originalPageKey]: expect.anything() })
      );

      await new Promise(process.nextTick);

      const removeCalls = mockStorage.local.remove.mock.calls.map(args => args[0]);
      const removedKeys = removeCalls.flat();
      expect(removedKeys).toEqual(expect.arrayContaining([originalPageKey, originalLegacyKey]));
      expect(removedKeys).not.toContain(stablePageKey);
      expect(removedKeys).not.toContain(stableLegacyKey);
    });

    it('並發 update：以 stable / original 兩個 pageUrl 同時呼叫應序列化於同一 canonical lock', async () => {
      const originalUrl = 'https://example.com/post?utm=x';
      const stableUrl = 'https://example.com/post';
      const aliasNormKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;

      let setInFlight = 0;
      let maxConcurrent = 0;
      const setOrder = [];

      mockStorage.local.get.mockImplementation(async keys => {
        await new Promise(resolve => setTimeout(resolve, 5));
        const all = {
          [aliasNormKey]: stableUrl,
          [`${URL_ALIAS_PREFIX}${stableUrl}`]: stableUrl,
        };
        if (setOrder.length > 0) {
          all[stablePageKey] = {
            notion: null,
            highlights: setOrder.at(-1),
            metadata: { createdAt: 1, lastUpdated: 2 },
          };
        }
        const requested = Array.isArray(keys) ? keys : [keys];
        const acc = {};
        for (const k of requested) {
          if (k in all) {
            acc[k] = all[k];
          }
        }
        return acc;
      });

      mockStorage.local.set.mockImplementation(async payload => {
        setInFlight++;
        maxConcurrent = Math.max(maxConcurrent, setInFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        const value = payload[stablePageKey];
        setOrder.push(value.highlights);
        setInFlight--;
      });

      await Promise.all([
        service.updateHighlights(stableUrl, ['from-stable']),
        service.updateHighlights(originalUrl, ['from-original']),
      ]);

      expect(maxConcurrent).toBe(1);
      expect(setOrder).toHaveLength(2);
      const setKeys = mockStorage.local.set.mock.calls.map(c => Object.keys(c[0])[0]);
      expect(setKeys.every(k => k === stablePageKey)).toBe(true);
    });

    it('[CANONICAL] legacy cleanup MUST 在 updateHighlights 回傳前完成（不依賴 process.nextTick）', async () => {
      const originalUrl = 'https://example.com/article?ref=abc';
      const stableUrl = 'https://example.com/article';
      const aliasNormKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const originalPageKey = `${PAGE_PREFIX}${originalUrl}`;
      const originalLegacyKey = `${HIGHLIGHTS_PREFIX}${originalUrl}`;

      mockStorageLookup(mockStorage, {
        [aliasNormKey]: stableUrl,
        [stablePageKey]: { notion: { pageId: 'p1' }, highlights: [], metadata: {} },
        [originalPageKey]: { notion: null, highlights: ['old'], metadata: {} },
        [originalLegacyKey]: ['legacy-h'],
      });

      let resolveRemove;
      const removePending = new Promise(resolve => {
        resolveRemove = resolve;
      });
      mockStorage.local.remove.mockImplementation(() => removePending);

      let updateResolved = false;
      const updatePromise = service.updateHighlights(originalUrl, ['h1']).then(() => {
        updateResolved = true;
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(updateResolved).toBe(false);

      resolveRemove();
      await updatePromise;
      expect(updateResolved).toBe(true);

      const removedKeys = mockStorage.local.remove.mock.calls.flatMap(args => args[0]);
      expect(removedKeys).toEqual(expect.arrayContaining([originalPageKey, originalLegacyKey]));
    });
  });
});
