import {
  StorageService,
  normalizeUrl,
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../../../scripts/background/services/StorageService.js';
import {
  buildDeletedState,
  buildHighlight,
  buildStaleStableState,
} from '../../../helpers/status-fixtures.js';
import {
  createStorageServiceHarness,
  mockStorageLookup,
  flushReadTimeUpgrade,
} from '../../../helpers/storageServiceTestHarness.js';

describe('StorageService - Read Write Upgrade', () => {
  let service = null;
  let mockStorage = null;
  let mockLogger = null;

  const buildOriginalStableUrls = () => ({
    originalUrl: 'https://example.com/original',
    stableUrl: 'https://example.com/stable',
  });

  const buildAliasPageStorage = ({
    originalUrl,
    stableUrl,
    notion,
    highlights = [],
    metadata = {},
  }) => ({
    [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
    [`${PAGE_PREFIX}${stableUrl}`]: { notion, highlights, metadata },
  });

  beforeEach(() => {
    ({ service, mockStorage, mockLogger } = createStorageServiceHarness(StorageService));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getSavedPageData', () => {
    const LEGACY_TITLE = 'legacy title';
    const READ_UPGRADE_FAILURE_TTL_MS = 30 * 60 * 1000;

    const buildSavedPageResult = ({
      notionPageId,
      title,
      savedAt = null,
      lastVerifiedAt = null,
      destinationProfileId = null,
      notionUrl = null,
    }) => ({
      notionPageId,
      notionUrl,
      title,
      savedAt,
      lastVerifiedAt,
      destinationProfileId,
    });

    const setupLegacyReadPath = ({ url, savedData, highlightData = [] }) => {
      const normalizedUrl = normalizeUrl(url);
      const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
      const savedKey = `${SAVED_PREFIX}${normalizedUrl}`;
      const highlightKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

      const legacyReadData = {
        [savedKey]: savedData,
        [highlightKey]: highlightData,
      };

      mockStorageLookup(mockStorage, legacyReadData);

      return { normalizedUrl, pageKey, savedKey, highlightKey };
    };

    const setupLegacySavedPageRead = ({ slug, notionPageId }) => {
      const url = `https://example.com/${slug}`;
      const savedData = { notionPageId, title: LEGACY_TITLE };
      const { normalizedUrl } = setupLegacyReadPath({ url, savedData });

      return { url, savedData, normalizedUrl };
    };

    const readOriginalSavedPageFromStorage = ({ originalUrl, storageData }) => {
      mockStorageLookup(mockStorage, storageData);

      return service.getSavedPageData(originalUrl);
    };

    const mockNow = now => {
      jest.spyOn(Date, 'now').mockReturnValue(now);
    };

    const mockUpgradeWriteFailure = message => {
      mockStorage.local.set.mockRejectedValue(new Error(message));
    };

    const mockUpgradeWriteSuccess = () => {
      mockStorage.local.set.mockResolvedValue();
      mockStorage.local.remove.mockResolvedValue();
    };

    const seedFailedUpgradeAttempt = (normalizedUrl, now, overrides = {}) => {
      service._failedUpgradeAttempts.set(normalizedUrl, {
        attempts: 1,
        firstFailureAt: now - 1000,
        lastFailureAt: now - 1000,
        nextRetryAt: now - 1,
        ...overrides,
      });
    };

    const readSavedPageAndFlushUpgrade = async url => {
      const result = await service.getSavedPageData(url);
      await flushReadTimeUpgrade();

      return result;
    };

    const mockOptionalRandom = random => {
      if (random === undefined) {
        return;
      }

      jest.spyOn(Math, 'random').mockReturnValue(random);
    };

    const seedOptionalFailedUpgradeAttempt = ({ normalizedUrl, now, retryState }) => {
      if (!retryState) {
        return;
      }

      seedFailedUpgradeAttempt(normalizedUrl, now, retryState);
    };

    const mockUpgradeWriteOutcome = ({ writeFailureMessage, writesSucceed }) => {
      if (writeFailureMessage) {
        mockUpgradeWriteFailure(writeFailureMessage);
      }
      if (writesSucceed) {
        mockUpgradeWriteSuccess();
      }
    };

    const runLegacyReadUpgradeScenario = async ({
      slug,
      notionPageId,
      now,
      random,
      retryState,
      writeFailureMessage,
      writesSucceed = false,
    }) => {
      const context = setupLegacySavedPageRead({ slug, notionPageId });

      mockNow(now);
      mockOptionalRandom(random);
      seedOptionalFailedUpgradeAttempt({ normalizedUrl: context.normalizedUrl, now, retryState });
      mockUpgradeWriteOutcome({ writeFailureMessage, writesSucceed });

      const result = await readSavedPageAndFlushUpgrade(context.url);
      expect(result).toEqual(context.savedData);

      return context;
    };

    const expectUpgradeWriteSkipped = (normalizedUrl, expectedRetryState) => {
      expect(mockStorage.local.set).not.toHaveBeenCalled();
      expect(mockStorage.local.remove).not.toHaveBeenCalled();
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual(
        expect.objectContaining(expectedRetryState)
      );
    };

    const skippedRetryScenarios = [
      {
        name: '尚未到達 nextRetryAt 時，應跳過重試',
        slug: 'retry-skip-before-next-window',
        notionPageId: 'legacy-2',
        now: 1_700_000_001_000,
        buildRetryState: now => ({
          nextRetryAt: now + 30_000,
        }),
        buildExpectedRetryState: now => ({
          attempts: 1,
          nextRetryAt: now + 30_000,
        }),
      },
      {
        name: '達到 maxAttempts 且仍在 TTL 內時，應跳過重試',
        slug: 'retry-max-attempts',
        notionPageId: 'legacy-5',
        now: 1_700_000_004_000,
        buildRetryState: now => ({
          attempts: 5,
          firstFailureAt: now - 10_000,
        }),
        buildExpectedRetryState: () => ({
          attempts: 5,
        }),
      },
    ];

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
      expect(result).toEqual(
        buildSavedPageResult({
          notionPageId: 'page-123',
          title: 'Test Page',
          savedAt: 12_345,
        })
      );
    });

    it('應該在沒有數據時返回 null', async () => {
      const result = await service.getSavedPageData('https://example.com/page');
      expect(result).toBeNull();
    });

    it('storage.local.get 回傳 null 時應視為空結果', async () => {
      mockStorage.local.get.mockResolvedValue(null);

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
      const { originalUrl, stableUrl } = buildOriginalStableUrls();
      const notionData = { pageId: 'page-abc', title: 'Test Page' };

      mockStorageLookup(
        mockStorage,
        buildAliasPageStorage({ originalUrl, stableUrl, notion: notionData })
      );

      const result = await service.getSavedPageData(originalUrl);

      expect(result).toEqual(
        buildSavedPageResult({
          notionPageId: 'page-abc',
          title: 'Test Page',
        })
      );
    });

    it('缺少 alias 時，不應把孤立的 stable page_* 視為 original URL 的已保存狀態', async () => {
      const urls = buildOriginalStableUrls();

      await expect(
        readOriginalSavedPageFromStorage({
          originalUrl: urls.originalUrl,
          storageData: buildStaleStableState({
            ...urls,
            includeAlias: false,
          }),
        })
      ).resolves.toBeNull();
    });

    it('alias 指向 notion:null 的 stable page_* 時，應回傳 null 而非已保存', async () => {
      const urls = buildOriginalStableUrls();

      await expect(
        readOriginalSavedPageFromStorage({
          originalUrl: urls.originalUrl,
          storageData: buildDeletedState({
            ...urls,
            highlights: [buildHighlight()],
          }),
        })
      ).resolves.toBeNull();
    });

    it('讀時升級第一次失敗後，應記錄重試狀態與 nextRetryAt', async () => {
      const now = 1_700_000_000_000;
      const { normalizedUrl } = await runLegacyReadUpgradeScenario({
        slug: 'retry-first-failure',
        notionPageId: 'legacy-1',
        now,
        random: 0,
        writeFailureMessage: 'upgrade write failed',
      });

      const retryState = service._failedUpgradeAttempts.get(normalizedUrl);
      expect(retryState).toEqual({
        attempts: 1,
        firstFailureAt: now,
        lastFailureAt: now,
        nextRetryAt: now + 500,
      });
    });

    it.each(skippedRetryScenarios)('$name', async scenario => {
      expect.hasAssertions();

      const { slug, notionPageId, now, buildRetryState, buildExpectedRetryState } = scenario;
      const { normalizedUrl } = await runLegacyReadUpgradeScenario({
        slug,
        notionPageId,
        now,
        retryState: buildRetryState(now),
      });

      expectUpgradeWriteSkipped(normalizedUrl, buildExpectedRetryState(now));
    });

    it('超過 nextRetryAt 後，應允許再次嘗試讀時升級', async () => {
      const now = 1_700_000_002_000;
      const { normalizedUrl } = await runLegacyReadUpgradeScenario({
        slug: 'retry-after-next-window',
        notionPageId: 'legacy-3',
        now,
        random: 0,
        retryState: {
          attempts: 1,
          firstFailureAt: now - 2000,
          lastFailureAt: now - 1500,
        },
        writeFailureMessage: 'upgrade write failed again',
      });

      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual({
        attempts: 2,
        firstFailureAt: now - 2000,
        lastFailureAt: now,
        nextRetryAt: now + 1000,
      });
    });

    it('讀時升級成功後，應清除失敗追蹤狀態', async () => {
      const now = 1_700_000_003_000;
      const { normalizedUrl } = await runLegacyReadUpgradeScenario({
        slug: 'retry-clear-on-success',
        notionPageId: 'legacy-4',
        now,
        retryState: {
          attempts: 2,
          firstFailureAt: now - 5000,
        },
        writesSucceed: true,
      });

      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(mockStorage.local.remove).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.has(normalizedUrl)).toBe(false);
    });

    it('應在第 5 次失敗時將 nextRetryAt 設為 firstFailureAt + TTL', async () => {
      const now = 1_700_000_004_500;
      const firstFailureAt = now - 20_000;
      const { normalizedUrl } = await runLegacyReadUpgradeScenario({
        slug: 'retry-hit-max-attempt',
        notionPageId: 'legacy-7',
        now,
        retryState: {
          attempts: 4,
          firstFailureAt,
          lastFailureAt: now - 1000,
        },
        writeFailureMessage: 'upgrade write failed at attempt 5',
      });

      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual({
        attempts: 5,
        firstFailureAt,
        lastFailureAt: now,
        nextRetryAt: firstFailureAt + READ_UPGRADE_FAILURE_TTL_MS,
      });
    });

    it('超過 TTL 後，應重置並允許新一輪嘗試', async () => {
      const now = 1_700_000_005_000;
      const { normalizedUrl } = await runLegacyReadUpgradeScenario({
        slug: 'retry-reset-after-ttl',
        notionPageId: 'legacy-6',
        now,
        random: 0,
        retryState: {
          attempts: 5,
          firstFailureAt: now - READ_UPGRADE_FAILURE_TTL_MS - 1,
          lastFailureAt: now - READ_UPGRADE_FAILURE_TTL_MS - 1,
          nextRetryAt: now + 999_999,
        },
        writeFailureMessage: 'upgrade write failed after ttl',
      });

      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
      expect(service._failedUpgradeAttempts.get(normalizedUrl)).toEqual({
        attempts: 1,
        firstFailureAt: now,
        lastFailureAt: now,
        nextRetryAt: now + 500,
      });
    });
  });

  describe('setSavedPageData destination profile metadata', () => {
    it('應寫入 page_* 的 notion.destinationProfileId', async () => {
      const url = 'https://example.com/page';

      await service.setSavedPageData(url, {
        notionPageId: 'page-1',
        notionUrl: 'https://www.notion.so/page-1',
        title: 'Saved Page',
        destinationProfileId: 'pid',
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}${url}`]: expect.objectContaining({
          notion: expect.objectContaining({
            pageId: 'page-1',
            destinationProfileId: 'pid',
          }),
        }),
      });
    });

    it('destinationProfileId 傳入 null 時應清除既有目的地欄位', async () => {
      const url = 'https://example.com/page';
      mockStorageLookup(mockStorage, {
        [`${PAGE_PREFIX}${url}`]: {
          notion: {
            pageId: 'page-1',
            title: 'Saved Page',
            destinationProfileId: 'pid',
          },
          highlights: [],
          metadata: {},
        },
      });

      await service.setSavedPageData(url, {
        notionPageId: 'page-1',
        destinationProfileId: null,
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}${url}`]: expect.objectContaining({
          notion: expect.objectContaining({
            destinationProfileId: null,
          }),
        }),
      });
    });

    it('直接 page_* 查找失敗但 alias 存在時，set/get 應使用 alias stable URL', async () => {
      const { originalUrl, stableUrl } = buildOriginalStableUrls();
      const storageData = buildAliasPageStorage({
        originalUrl,
        stableUrl,
        notion: {
          pageId: 'page-1',
          title: 'Stable Page',
          destinationProfileId: null,
        },
        highlights: [{ id: 'h1', text: 'highlight' }],
      });
      mockStorageLookup(mockStorage, storageData);

      await expect(service.getSavedPageData(originalUrl)).resolves.toEqual(
        expect.objectContaining({ notionPageId: 'page-1' })
      );
      await service.setSavedPageData(originalUrl, {
        notionPageId: 'page-1',
        destinationProfileId: 'pid',
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}${stableUrl}`]: expect.objectContaining({
          notion: expect.objectContaining({
            destinationProfileId: 'pid',
          }),
        }),
      });
    });

    it('alias 命中 legacy stable saved_* 時，set 應寫入 canonical stable page_* key', async () => {
      const { originalUrl, stableUrl } = buildOriginalStableUrls();
      const storageData = {
        [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
        [`${SAVED_PREFIX}${stableUrl}`]: {
          notionPageId: 'page-legacy',
          notionUrl: 'https://www.notion.so/page-legacy',
          title: 'Legacy Stable Page',
          savedAt: 1,
        },
        [`${HIGHLIGHTS_PREFIX}${stableUrl}`]: [{ id: 'h1', text: 'highlight' }],
      };
      mockStorageLookup(mockStorage, storageData);

      await service.setSavedPageData(originalUrl, {
        notionPageId: 'page-legacy',
        destinationProfileId: 'pid',
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}${stableUrl}`]: expect.objectContaining({
          notion: expect.objectContaining({
            pageId: 'page-legacy',
            destinationProfileId: 'pid',
          }),
        }),
      });
      expect(mockStorage.local.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          [`${PAGE_PREFIX}${originalUrl}`]: expect.anything(),
        })
      );
      expect(mockStorage.local.remove).toHaveBeenCalledWith(
        expect.arrayContaining([`${SAVED_PREFIX}${stableUrl}`])
      );
    });

    it('[CANONICAL] alias 命中且僅 page_<original> 有殘留時 MUST 寫入 page_<stableUrl> 並清掉 page_<original>', async () => {
      const originalUrl = 'https://example.com/article?utm=abc';
      const stableUrl = 'https://example.com/article';
      const aliasNormKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const originalPageKey = `${PAGE_PREFIX}${originalUrl}`;

      const storageData = {
        [aliasNormKey]: stableUrl,
        [originalPageKey]: {
          notion: { pageId: 'old', destinationProfileId: null },
          highlights: [{ id: 'h-stale', text: 'stale' }],
          metadata: { lastUpdated: 100 },
        },
      };
      mockStorageLookup(mockStorage, storageData);

      await service.setSavedPageData(originalUrl, {
        notionPageId: 'page-canonical',
        destinationProfileId: 'pid-1',
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [stablePageKey]: expect.objectContaining({
          notion: expect.objectContaining({
            pageId: 'page-canonical',
            destinationProfileId: 'pid-1',
          }),
        }),
      });
      expect(mockStorage.local.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ [originalPageKey]: expect.anything() })
      );
      const removedKeys = mockStorage.local.remove.mock.calls.flatMap(args => args[0]);
      expect(removedKeys).toEqual(expect.arrayContaining([originalPageKey]));
    });

    it('destinationProfileId 明確傳入 undefined 時應寫入 null', async () => {
      const url = 'https://example.com/page';

      await service.setSavedPageData(url, {
        notionPageId: 'page-1',
        destinationProfileId: undefined,
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${PAGE_PREFIX}${url}`]: expect.objectContaining({
          notion: expect.objectContaining({
            destinationProfileId: null,
          }),
        }),
      });
    });
  });

  describe('setSavedPageData', () => {
    it('應該正確設置頁面數據（Phase 3: page_*.notion partial update）', async () => {
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
      mockLogger.debug = jest.fn();

      const data = { title: 'Test Page', pageId: 'page-123' };
      await service.setSavedPageData('https://example.com/page', data);

      expect(mockStorage.local.set).toHaveBeenCalled();
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
        }),
        expect.objectContaining({
          id: 'h2',
          text: 'second highlight',
          color: 'green',
        }),
      ]);
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

      mockStorage.local.get.mockResolvedValue({
        [pageKey]: { highlights: existingHighlights, notion: null, metadata: {} },
        [hlKey]: staleHighlights,
      });

      const data = { title: 'Test', notionPageId: 'page-xyz' };
      await service.setSavedPageData('https://example.com/page', data);

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
});
