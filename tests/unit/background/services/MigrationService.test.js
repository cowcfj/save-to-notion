/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

const mockLoggerModule = {
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
  },
};

const mockLogSanitizerModule = {
  __esModule: true,
  sanitizeUrlForLogging: jest.fn(url => `safe://${url}`),
};

const mockUrlUtilsModule = {
  __esModule: true,
  isRootUrl: jest.fn(() => false),
  computeStableUrl: jest.fn(url => url),
};

const mockMigrationMetadataUtilsModule = {
  __esModule: true,
  hasNotionData: jest.fn(),
  isSameNotionPage: jest.fn(),
};

if (process.env.NODE_OPTIONS?.includes('--experimental-vm-modules')) {
  jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => mockLoggerModule);
  jest.unstable_mockModule(
    '../../../../scripts/utils/LogSanitizer.js',
    () => mockLogSanitizerModule
  );
  jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => mockUrlUtilsModule);
  jest.unstable_mockModule(
    '../../../../scripts/background/utils/migrationMetadataUtils.js',
    () => mockMigrationMetadataUtilsModule
  );
} else {
  jest.mock('../../../../scripts/utils/Logger.js', () => mockLoggerModule);
  jest.mock('../../../../scripts/utils/LogSanitizer.js', () => mockLogSanitizerModule);
  jest.mock('../../../../scripts/utils/urlUtils.js', () => mockUrlUtilsModule);
  jest.mock(
    '../../../../scripts/background/utils/migrationMetadataUtils.js',
    () => mockMigrationMetadataUtilsModule
  );
}

let MigrationService;
let Logger;
let urlUtils;
let migrationMetadataUtils;

beforeAll(async () => {
  ({ MigrationService } =
    await import('../../../../scripts/background/services/MigrationService.js'));
  ({ default: Logger } = await import('../../../../scripts/utils/Logger.js'));
  urlUtils = await import('../../../../scripts/utils/urlUtils.js');
  migrationMetadataUtils =
    await import('../../../../scripts/background/utils/migrationMetadataUtils.js');
});

function getMetadataUtils() {
  return migrationMetadataUtils;
}

function getUrlUtils() {
  return urlUtils;
}

describe('MigrationService', () => {
  let service;
  let mockStorageService;
  let mockTabService;
  let mockInjectionService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStorageService = {
      getSavedPageData: jest.fn(),
      setSavedPageData: jest.fn(),
      setUrlAlias: jest.fn(),
      clearPageState: jest.fn(),
      clearLegacyKeys: jest.fn(),
      getHighlights: jest.fn(),
      updateHighlights: jest.fn(),
      savePageDataAndHighlights: jest.fn(),
    };

    mockTabService = {
      queryTabs: jest.fn().mockResolvedValue([]),
      createTab: jest.fn().mockResolvedValue({ id: 999 }),
      removeTab: jest.fn().mockResolvedValue(),
      waitForTabComplete: jest.fn().mockResolvedValue(),
    };
    mockInjectionService = {
      injectAndExecute: jest.fn(),
      injectWithResponse: jest.fn(),
    };

    globalThis.chrome = {
      tabs: {
        query: jest.fn(),
        create: jest.fn(),
        remove: jest.fn().mockResolvedValue(),
        get: jest.fn(),
        onUpdated: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      },
      runtime: {
        lastError: null,
      },
      scripting: {
        executeScript: jest.fn(),
      },
    };

    service = new MigrationService(mockStorageService, mockTabService, mockInjectionService);
  });

  describe('migrateStorageKey', () => {
    const stableUrl = 'https://example.com/stable';
    const legacyUrl = 'https://example.com/legacy';
    const pageData = { notionPageId: 'page-123', title: 'Test Page' };

    function mockMigrationSourceData({
      sourcePageData = pageData,
      sourceHighlights = null,
      targetPageData = null,
      targetHighlights = null,
    } = {}) {
      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve(sourcePageData);
        }
        if (url === stableUrl) {
          return Promise.resolve(targetPageData);
        }
        return Promise.resolve(null);
      });
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve(sourceHighlights);
        }
        if (url === stableUrl) {
          return Promise.resolve(targetHighlights);
        }
        return Promise.reject(new Error(`Unexpected highlights URL: ${url}`));
      });
    }

    test('should return false if URLs are missing or identical', async () => {
      expect(await service.migrateStorageKey(null, legacyUrl)).toBe(false);
      expect(await service.migrateStorageKey(stableUrl, null)).toBe(false);
      expect(await service.migrateStorageKey(stableUrl, stableUrl)).toBe(false);
    });

    test('should block migration to root URL', async () => {
      const { isRootUrl } = getUrlUtils();
      isRootUrl.mockReturnValueOnce(true);
      expect(await service.migrateStorageKey('https://example.com/', legacyUrl)).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Blocked migration'),
        expect.anything()
      );
    });

    test('should return false if no legacy data exists', async () => {
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockStorageService.getHighlights.mockResolvedValue(null);

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(false);
      expect(mockStorageService.getSavedPageData).toHaveBeenCalledWith(legacyUrl);
      expect(mockStorageService.setSavedPageData).not.toHaveBeenCalled();
    });

    test('should perform atomic migration (copy then delete) when legacy data exists', async () => {
      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockResolvedValue(null);
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      // 1. Verify read
      expect(mockStorageService.getSavedPageData).toHaveBeenCalledWith(legacyUrl);
      // 2. Verify write new key via atomic method
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        []
      );
      // 3. Verify delete old key using clearLegacyKeys (不會誤刪 stable URL)
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(legacyUrl);
    });

    test('should normalize wrapped legacy highlights object before migration', async () => {
      const legacyHighlights = [{ id: 'legacy-1' }];

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl
          ? Promise.resolve({ highlights: legacyHighlights })
          : Promise.resolve(null)
      );
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        legacyHighlights
      );
    });

    test('should supplement notion metadata when target already has highlights', async () => {
      const { hasNotionData } = getMetadataUtils();
      // legacyData is pageData, stableData is null. we want legacy to have notion, stable to not have notion.
      hasNotionData.mockImplementation(data => data === pageData);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve([]);
        }
        if (url === stableUrl) {
          return Promise.resolve({ highlights: [{ id: 'existing-1' }] });
        }
        return Promise.resolve(null);
      });

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.setSavedPageData).toHaveBeenCalledWith(stableUrl, pageData);
      expect(mockStorageService.savePageDataAndHighlights).not.toHaveBeenCalled();
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
    });

    test('should migrate legacy highlights when stable side only has saved metadata', async () => {
      const legacyHighlights = [{ id: 'legacy-highlight' }];
      const stablePageData = { notionPageId: 'stable-page-id', title: 'Stable Page' };

      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve(pageData);
        }
        if (url === stableUrl) {
          return Promise.resolve(stablePageData);
        }
        return Promise.resolve(null);
      });
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve(legacyHighlights);
        }
        if (url === stableUrl) {
          return Promise.resolve([]);
        }
        return Promise.resolve(null);
      });
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        stablePageData,
        legacyHighlights
      );
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(legacyUrl);
      expect(Logger.warn).not.toHaveBeenCalledWith(
        'Migration target already has data, skipping highlight overwrite',
        expect.anything()
      );
    });

    test('should report partial migration when cleanup fails after stable write', async () => {
      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockResolvedValue(null);
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockRejectedValue(new Error('cleanup failed'));

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        []
      );
      expect(Logger.warn).toHaveBeenCalledWith(
        'Migration stable write completed but legacy cleanup failed',
        expect.objectContaining({
          action: 'migrate:clear-legacy',
          result: 'failure',
          error: 'cleanup failed',
        })
      );
    });

    test('should complete cleanup on retry when stable highlights already match migrated legacy highlights', async () => {
      const legacyHighlights = [{ id: 'legacy-highlight', text: 'same' }];
      const stablePageData = { notionPageId: 'stable-page-id' };

      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve(pageData);
        }
        return Promise.resolve(stablePageData);
      });
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve(legacyHighlights);
        }
        if (url === stableUrl) {
          return Promise.resolve([...legacyHighlights]);
        }
        return Promise.resolve(null);
      });
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.savePageDataAndHighlights).not.toHaveBeenCalled();
      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(legacyUrl, stableUrl);
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(legacyUrl);
    });

    test('should not treat same highlight ids with different payloads as completed migration', async () => {
      const legacyHighlights = [{ id: 'legacy-highlight', text: 'new payload' }];
      const stableHighlights = [{ id: 'legacy-highlight', text: 'old payload' }];

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve(legacyHighlights);
        }
        if (url === stableUrl) {
          return Promise.resolve(stableHighlights);
        }
        return Promise.resolve(null);
      });

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
      expect(Logger.warn).toHaveBeenCalledWith(
        'Migration target already has data, skipping highlight overwrite',
        expect.objectContaining({
          action: 'migrate:skip-overwrite',
          supplementedNotion: true,
        })
      );
    });

    test.each([
      {
        name: 'should log conflict warning when stable/legacy notion are determined as different pages',
        samePageResult: false,
        sourcePageData: pageData,
        targetPageData: { notionPageId: 'other' },
        shouldLogConflict: true,
      },
      {
        name: 'should not log conflict warning when stable/legacy notion cannot be determined as same page',
        samePageResult: null,
        sourcePageData: { notionUrl: 'https://notion.so/legacy-only-url' },
        targetPageData: { notionPageId: 'stable-only-page-id' },
        shouldLogConflict: false,
      },
    ])('$name', async ({ samePageResult, sourcePageData, targetPageData, shouldLogConflict }) => {
      const { hasNotionData, isSameNotionPage } = getMetadataUtils();
      hasNotionData.mockReturnValue(true);
      isSameNotionPage.mockReturnValue(samePageResult);
      mockMigrationSourceData({
        sourcePageData,
        sourceHighlights: [],
        targetPageData,
        targetHighlights: { highlights: [{ id: 'existing-1' }] },
      });

      await service.migrateStorageKey(stableUrl, legacyUrl);

      if (shouldLogConflict) {
        expect(Logger.warn).toHaveBeenCalledWith(
          'Stable/legacy notion metadata conflict, keeping stable data',
          expect.anything()
        );
      } else {
        expect(Logger.warn).not.toHaveBeenCalledWith(
          'Stable/legacy notion metadata conflict, keeping stable data',
          expect.anything()
        );
      }
    });

    test('should not throw if setUrlAlias is not a function or throws', async () => {
      mockStorageService.setUrlAlias = undefined;
      const { hasNotionData } = getMetadataUtils();
      hasNotionData.mockReturnValue(false);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockResolvedValue(null);
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      let result = await service.migrateStorageKey(stableUrl, legacyUrl);
      expect(result).toBe(true);

      // Now test the catch block
      mockStorageService.setUrlAlias = jest.fn().mockRejectedValue(new Error('alias err'));
      result = await service.migrateStorageKey(stableUrl, legacyUrl);
      expect(result).toBe(true);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set URL alias'),
        expect.anything()
      );
    });

    test('should not throw when setUrlAlias throws synchronously', async () => {
      mockStorageService.setUrlAlias.mockImplementation(() => {
        throw new Error('sync alias fail');
      });

      await expect(service._setUrlAliasSafe(legacyUrl, stableUrl)).resolves.toBeUndefined();
      expect(Logger.warn).toHaveBeenCalledWith(
        'Failed to set URL alias during migration',
        expect.objectContaining({
          action: 'migrate:set-alias',
          result: 'failure',
          legacy: `safe://${legacyUrl}`,
          stable: `safe://${stableUrl}`,
          error: 'sync alias fail',
        })
      );
    });

    test.each([
      {
        name: 'should convert highlights format when convertFormat is enabled',
        legacyHighlights: [{ id: 'h-1' }],
        expectedSavedHighlights: [{ id: 'h-1', needsRangeInfo: true }],
        formatConverterFactory: expectedSavedHighlights =>
          jest.fn().mockReturnValue(expectedSavedHighlights),
        options: formatConverter => ({ convertFormat: true, formatConverter }),
        expectedResult: true,
      },
      {
        name: 'should support async format converter when convertFormat is enabled',
        legacyHighlights: [{ id: 'h-1a' }],
        expectedSavedHighlights: [{ id: 'h-1a', needsRangeInfo: true }],
        formatConverterFactory: expectedSavedHighlights =>
          jest.fn().mockResolvedValue(expectedSavedHighlights),
        options: formatConverter => ({ convertFormat: true, formatConverter }),
        expectedResult: true,
      },
      {
        name: 'should skip conversion if formatConverter is active but not a function',
        legacyHighlights: [{ id: 'h-2' }],
        expectedSavedHighlights: [{ id: 'h-2' }],
        formatConverterFactory: () => 'not-a-fn',
        options: formatConverter => ({ convertFormat: true, formatConverter }),
        expectedResult: true,
      },
      {
        name: 'should keep original highlights when convertFormat is disabled',
        legacyHighlights: [{ id: 'h-2' }],
        expectedSavedHighlights: [{ id: 'h-2' }],
        formatConverterFactory: () => jest.fn().mockReturnValue([{ id: 'converted' }]),
        options: formatConverter => ({ convertFormat: false, formatConverter }),
        expectedResult: true,
      },
      {
        name: 'should return false and NOT delete legacy data if format conversion fails',
        legacyHighlights: [{ id: 'h-3' }],
        expectedSavedHighlights: null,
        formatConverterFactory: () =>
          jest.fn(() => {
            throw new Error('Convert failed');
          }),
        options: formatConverter => ({ convertFormat: true, formatConverter }),
        expectedResult: false,
      },
      {
        name: 'should return false and NOT delete legacy data if format converter returns non-array',
        legacyHighlights: [{ id: 'h-4' }],
        expectedSavedHighlights: null,
        formatConverterFactory: () => jest.fn().mockReturnValue('not-an-array'),
        options: formatConverter => ({ convertFormat: true, formatConverter }),
        expectedResult: false,
      },
    ])(
      '$name',
      async ({
        legacyHighlights,
        expectedSavedHighlights,
        formatConverterFactory,
        options,
        expectedResult,
      }) => {
        mockMigrationSourceData({ sourceHighlights: legacyHighlights });
        const formatConverter = formatConverterFactory(expectedSavedHighlights);
        const migrateOptions = options(formatConverter);

        if (expectedResult) {
          mockStorageService.savePageDataAndHighlights.mockResolvedValue();
          mockStorageService.clearLegacyKeys.mockResolvedValue();
        }

        const result = await service.migrateStorageKey(stableUrl, legacyUrl, migrateOptions);

        expect(result).toBe(expectedResult);

        if (typeof formatConverter === 'function' && migrateOptions.convertFormat) {
          expect(formatConverter).toHaveBeenCalledWith(legacyHighlights);
        }
        if (expectedResult) {
          expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
            stableUrl,
            pageData,
            expectedSavedHighlights ?? legacyHighlights
          );
          expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(legacyUrl);
        } else {
          expect(mockStorageService.savePageDataAndHighlights).not.toHaveBeenCalled();
          expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
        }
      }
    );

    test('should return false and NOT delete legacy data if write fails', async () => {
      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockResolvedValue(null); // Explicit mock
      mockStorageService.savePageDataAndHighlights.mockRejectedValue(new Error('Write failed'));

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(false);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalled();
      // Critical: Should NOT clear old data if write failed
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
    });
  });

  describe('migrateBatchUrl', () => {
    const url = 'https://example.com/article';

    function mockBatchLegacyLookup(legacyData) {
      const { computeStableUrl } = getUrlUtils();
      computeStableUrl.mockReturnValueOnce(url);
      mockStorageService.getHighlights.mockResolvedValueOnce(legacyData);
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();
    }

    test('should normalize wrapped legacy highlights object before batch migration', async () => {
      const { computeStableUrl } = getUrlUtils();
      const oldHighlights = [{ id: 'legacy-1' }];

      computeStableUrl.mockReturnValueOnce(url);
      mockStorageService.getHighlights.mockResolvedValueOnce({ highlights: oldHighlights });
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service.migrateBatchUrl(url);

      expect(service._applyInPlaceConversion).toHaveBeenCalledWith(url, oldHighlights);
      expect(result).toEqual({
        status: 'success',
        url: `safe://${url}`,
        count: 1,
        pending: 1,
      });
    });

    test.each([
      {
        name: 'should skip batch migration when no legacy data exists',
        legacyData: null,
        expectedReason: '無數據',
      },
      {
        name: 'should skip batch migration when legacy data has no highlights',
        legacyData: { foo: 'bar' },
        expectedReason: '無標註',
      },
    ])('$name', async ({ legacyData, expectedReason }) => {
      mockBatchLegacyLookup(legacyData);

      const result = await service.migrateBatchUrl(url);

      expect(result).toEqual({
        status: 'skipped',
        reason: expectedReason,
        url: `safe://${url}`,
      });
      expect(service._applyInPlaceConversion).not.toHaveBeenCalled();
    });

    test('should call _tryBatchStableMigration when shouldMigrateToStable is true', async () => {
      const { computeStableUrl } = getUrlUtils();
      const stableUrl = 'https://example.com/stable';
      const oldHighlights = [{ id: 'legacy-1' }];

      computeStableUrl.mockReturnValueOnce(stableUrl);
      mockStorageService.getHighlights
        .mockResolvedValueOnce(oldHighlights)
        // stable key 不存在（null）→ shouldMigrateToStable = true
        // 注意：{ highlights: [] } 代表「已存在但空」，不觸發遷移
        .mockResolvedValueOnce(null);
      service._tryBatchStableMigration = jest.fn().mockResolvedValue(stableUrl);

      const result = await service.migrateBatchUrl(url);

      expect(service._tryBatchStableMigration).toHaveBeenCalledWith({
        url,
        stableUrl,
        oldHighlights,
      });
      expect(result).toEqual({
        status: 'success',
        url: `safe://${stableUrl}`,
        count: 1,
        pending: 1,
      });
    });

    test('should update reportUrl to stableUrl when hasStableUrl and supplemented is true', async () => {
      const { computeStableUrl } = getUrlUtils();
      const stableUrl = 'https://example.com/stable';
      const oldHighlights = [{ id: 'legacy-2', rangeInfo: { start: 1 } }];

      computeStableUrl.mockReturnValueOnce(stableUrl);
      mockStorageService.getHighlights
        .mockResolvedValueOnce(oldHighlights)
        .mockResolvedValueOnce({ highlights: [{ id: 'already-stable' }] });
      service._supplementBatchSavedMetadata = jest.fn().mockResolvedValue(true);
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service.migrateBatchUrl(url);

      expect(service._supplementBatchSavedMetadata).toHaveBeenCalledWith(url, stableUrl);
      expect(result).toEqual({
        status: 'success',
        url: `safe://${stableUrl}`,
        count: 1,
        pending: 0,
      });
    });

    test('should migrate batch highlights when stable side only has saved metadata', async () => {
      const { computeStableUrl } = getUrlUtils();
      const stableUrl = 'https://example.com/stable';
      const oldHighlights = [{ id: 'legacy-3', rangeInfo: { start: 1 } }];
      const stablePageData = { notionPageId: 'stable-page-id' };

      computeStableUrl.mockReturnValueOnce(stableUrl);
      mockStorageService.getHighlights.mockImplementation(lookupUrl => {
        if (lookupUrl === url) {
          return Promise.resolve(oldHighlights);
        }
        if (lookupUrl === stableUrl) {
          return Promise.resolve([]);
        }
        return Promise.resolve(null);
      });
      mockStorageService.getSavedPageData.mockImplementation(lookupUrl => {
        if (lookupUrl === stableUrl) {
          return Promise.resolve(stablePageData);
        }
        return Promise.resolve(null);
      });
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service.migrateBatchUrl(url);

      expect(result).toEqual({
        status: 'success',
        url: `safe://${stableUrl}`,
        count: 1,
        pending: 0,
      });
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        stablePageData,
        [{ id: 'legacy-3', rangeInfo: { start: 1 }, needsRangeInfo: false }]
      );
      expect(service._applyInPlaceConversion).not.toHaveBeenCalled();
    });
  });

  describe('_supplementBatchSavedMetadata', () => {
    const originalUrl = 'https://example.com/original';
    const stableUrl = 'https://example.com/stable';

    test('should supplement batch metadata via shared helper and keep batch log context', async () => {
      const { hasNotionData } = getMetadataUtils();
      const legacySavedData = { notionPageId: 'legacy-page-id' };

      hasNotionData.mockImplementation(data => Boolean(data?.notionPageId));
      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === stableUrl) {
          return Promise.resolve(null);
        }
        if (url === originalUrl) {
          return Promise.resolve(legacySavedData);
        }
        return Promise.resolve(null);
      });

      const result = await service._supplementBatchSavedMetadata(originalUrl, stableUrl);

      expect(result).toBe(true);
      expect(mockStorageService.setSavedPageData).toHaveBeenCalledWith(stableUrl, legacySavedData);
      expect(Logger.info).toHaveBeenCalledWith(
        '已補遷移 saved metadata 到穩定 URL',
        expect.objectContaining({
          action: 'migration_batch',
          stable: `safe://${stableUrl}`,
          legacy: `safe://${originalUrl}`,
        })
      );
      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(originalUrl, stableUrl);
    });

    test('should log conflict with batch context when notion metadata conflicts', async () => {
      const { hasNotionData, isSameNotionPage } = getMetadataUtils();
      const stableSavedData = { notionPageId: 'stable-page-id' };
      const legacySavedData = { notionPageId: 'legacy-page-id' };

      hasNotionData.mockReturnValue(true);
      isSameNotionPage.mockReturnValue(false);
      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === stableUrl) {
          return Promise.resolve(stableSavedData);
        }
        if (url === originalUrl) {
          return Promise.resolve(legacySavedData);
        }
        return Promise.resolve(null);
      });

      const result = await service._supplementBatchSavedMetadata(originalUrl, stableUrl);

      expect(result).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        'stable/legacy notion 衝突，保留 stable 資料',
        expect.objectContaining({
          action: 'migration_batch',
          stable: `safe://${stableUrl}`,
          legacy: `safe://${originalUrl}`,
        })
      );
      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(originalUrl, stableUrl);
    });

    test('should still set alias when supplement logic throws', async () => {
      const { hasNotionData } = getMetadataUtils();
      const legacySavedData = { notionPageId: 'legacy-page-id' };

      hasNotionData.mockImplementation(data => Boolean(data?.notionPageId));
      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === stableUrl) {
          return Promise.resolve(null);
        }
        if (url === originalUrl) {
          return Promise.resolve(legacySavedData);
        }
        return Promise.resolve(null);
      });
      mockStorageService.setSavedPageData.mockRejectedValueOnce(new Error('set failed'));

      await expect(service._supplementBatchSavedMetadata(originalUrl, stableUrl)).rejects.toThrow(
        'set failed'
      );
      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(originalUrl, stableUrl);
    });

    test('should return false when stableUrl is empty or equal to originalUrl', async () => {
      expect(await service._supplementBatchSavedMetadata(originalUrl, '')).toBe(false);
      expect(await service._supplementBatchSavedMetadata(originalUrl, originalUrl)).toBe(false);
      expect(mockStorageService.getSavedPageData).not.toHaveBeenCalled();
      expect(mockStorageService.setUrlAlias).not.toHaveBeenCalled();
    });

    test('should return false and skip metadata/alias when stableUrl is root URL', async () => {
      const { isRootUrl } = getUrlUtils();
      isRootUrl.mockReturnValueOnce(true);

      const result = await service._supplementBatchSavedMetadata(
        originalUrl,
        'https://example.com/'
      );

      expect(result).toBe(false);
      expect(mockStorageService.getSavedPageData).not.toHaveBeenCalled();
      expect(mockStorageService.setSavedPageData).not.toHaveBeenCalled();
      expect(mockStorageService.setUrlAlias).not.toHaveBeenCalled();
    });
  });

  describe('_applyInPlaceConversion', () => {
    test('should convert rangeInfo to needsRangeInfo and update storage', async () => {
      const url = 'https://example.com/article';
      const oldHighlights = [{ id: 'h-1' }, { id: 'h-2', rangeInfo: { start: 1 } }];

      await service._applyInPlaceConversion(url, oldHighlights);

      expect(mockStorageService.updateHighlights).toHaveBeenCalledWith(url, [
        { id: 'h-1', needsRangeInfo: true },
        { id: 'h-2', rangeInfo: { start: 1 }, needsRangeInfo: false },
      ]);
    });
  });

  describe('_tryBatchStableMigration', () => {
    const url = 'https://example.com/original';
    const stableUrl = 'https://example.com/stable';
    const oldHighlights = [{ id: 'legacy-1' }];

    test('should return stableUrl when migrateStorageKey succeeds', async () => {
      service.migrateStorageKey = jest.fn().mockResolvedValue(true);

      const result = await service._tryBatchStableMigration({ url, stableUrl, oldHighlights });

      expect(service.migrateStorageKey).toHaveBeenCalledWith(stableUrl, url, {
        convertFormat: true,
        formatConverter: MigrationService._convertHighlightFormat,
      });
      expect(result).toBe(stableUrl);
    });

    test('should return stableUrl when stable highlights already win without metadata supplement', async () => {
      const migratedHighlights = [{ id: 'legacy-1', needsRangeInfo: true }];

      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockStorageService.getHighlights.mockImplementation(lookupUrl => {
        if (lookupUrl === url) {
          return Promise.resolve(oldHighlights);
        }
        if (lookupUrl === stableUrl) {
          return Promise.resolve(migratedHighlights);
        }
        return Promise.resolve(null);
      });
      mockStorageService.clearLegacyKeys.mockResolvedValue();
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service._tryBatchStableMigration({ url, stableUrl, oldHighlights });

      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(url, stableUrl);
      expect(service._applyInPlaceConversion).not.toHaveBeenCalled();
      expect(result).toBe(stableUrl);
    });

    test('should return stableUrl when migrateStorageKey fails but metadata is supplemented', async () => {
      service.migrateStorageKey = jest.fn().mockResolvedValue(false);
      service._supplementBatchSavedMetadata = jest.fn().mockResolvedValue(true);
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service._tryBatchStableMigration({ url, stableUrl, oldHighlights });

      expect(service._supplementBatchSavedMetadata).toHaveBeenCalledWith(url, stableUrl);
      expect(service._applyInPlaceConversion).not.toHaveBeenCalled();
      expect(result).toBe(stableUrl);
    });

    test('should fallback to in-place conversion when migrateStorageKey and supplement both fail', async () => {
      service.migrateStorageKey = jest.fn().mockResolvedValue(false);
      service._supplementBatchSavedMetadata = jest.fn().mockResolvedValue(false);
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service._tryBatchStableMigration({ url, stableUrl, oldHighlights });

      expect(service._applyInPlaceConversion).toHaveBeenCalledWith(url, oldHighlights);
      expect(result).toBe(url);
    });

    test('should fallback to in-place conversion when migrateStorageKey throws', async () => {
      service.migrateStorageKey = jest.fn().mockRejectedValue(new Error('migrate failed'));
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service._tryBatchStableMigration({ url, stableUrl, oldHighlights });

      expect(Logger.warn).toHaveBeenCalledWith(
        '遷移至穩定 URL 失敗，回退為原地轉換',
        expect.objectContaining({
          action: 'migration_batch',
          url: `safe://${url}`,
          error: 'migrate failed',
        })
      );
      expect(service._applyInPlaceConversion).toHaveBeenCalledWith(url, oldHighlights);
      expect(result).toBe(url);
    });

    test('should fallback without alias when stableUrl is root URL and migrateStorageKey returns false', async () => {
      const { isRootUrl } = getUrlUtils();
      const rootStableUrl = 'https://example.com/';

      isRootUrl.mockReturnValueOnce(true);
      service.migrateStorageKey = jest.fn().mockResolvedValue(false);
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service._tryBatchStableMigration({
        url,
        stableUrl: rootStableUrl,
        oldHighlights,
      });

      expect(service._applyInPlaceConversion).toHaveBeenCalledWith(url, oldHighlights);
      expect(mockStorageService.setUrlAlias).not.toHaveBeenCalled();
      expect(result).toBe(url);
    });
  });

  describe('executeContentMigration', () => {
    const targetUrl = 'https://example.com/target';
    const sender = { id: 'sender-123' };

    function mockExistingTabMigrationFailure(tabId, migrationResponse) {
      const existingTab = { id: tabId, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockInjectionService.injectAndExecute.mockResolvedValue();
      mockInjectionService.injectWithResponse
        .mockResolvedValueOnce({ ready: true })
        .mockResolvedValueOnce(migrationResponse);
    }

    test('should return error if URL is missing', async () => {
      const result = await service.executeContentMigration({}, sender);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return success if no highlights exist (early exit)', async () => {
      mockStorageService.getHighlights.mockResolvedValue(null);

      const result = await service.executeContentMigration({ url: targetUrl }, sender);

      expect(result.success).toBe(true);
      expect(result.message).toBe('沒有可遷移的資料');
      expect(mockStorageService.getHighlights).toHaveBeenCalledWith(targetUrl);
      expect(mockTabService.queryTabs).not.toHaveBeenCalled();
    });

    test('should reuse existing tab if available', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([existingTab]); // Mock mockTabService directly
      mockInjectionService.injectAndExecute.mockResolvedValue(); // script injection
      mockInjectionService.injectWithResponse
        // Script readiness check
        .mockResolvedValueOnce({ ready: true })
        // Migration execution
        .mockResolvedValueOnce({
          success: true,
          statistics: { newHighlightsCreated: 5 },
        });

      const result = await service.executeContentMigration({ url: targetUrl }, sender);

      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
      expect(result.message).toBe('已成功遷移 5 筆標註');
      expect(mockTabService.queryTabs).toHaveBeenCalledWith({}); // Verify precise match logic
      expect(mockTabService.createTab).not.toHaveBeenCalled();

      // Verify script injection
      expect(mockInjectionService.injectAndExecute).toHaveBeenCalledWith(
        existingTab.id,
        expect.arrayContaining(['dist/migration-executor.js']),
        null,
        expect.anything()
      );
      expect(mockTabService.removeTab).not.toHaveBeenCalled();
    });

    test('should wait for an existing tab to complete before injecting migration executor', async () => {
      const existingTab = { id: 889, status: 'loading', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockInjectionService.injectAndExecute.mockResolvedValue();
      mockInjectionService.injectWithResponse
        .mockResolvedValueOnce({ ready: true })
        .mockResolvedValueOnce({
          success: true,
          statistics: { newHighlightsCreated: 1 },
        });

      const result = await service.executeContentMigration({ url: targetUrl }, sender);

      expect(result.success).toBe(true);
      expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(existingTab.id);
      expect(mockInjectionService.injectAndExecute).toHaveBeenCalledWith(
        existingTab.id,
        expect.arrayContaining(['dist/migration-executor.js']),
        null,
        expect.anything()
      );
    });

    test('should create new tab if none exists and clean it up', async () => {
      const newTab = { id: 999 };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([]); // No existing tabs
      mockTabService.createTab.mockResolvedValue(newTab);

      // Setup waitForTabComplete
      mockTabService.waitForTabComplete.mockResolvedValue();

      mockInjectionService.injectAndExecute.mockResolvedValue();
      mockInjectionService.injectWithResponse
        .mockResolvedValueOnce({ ready: true }) // Ready check
        .mockResolvedValueOnce({
          success: true,
          statistics: { newHighlightsCreated: 3 },
        });

      const result = await service.executeContentMigration({ url: targetUrl }, sender);

      expect(result.success).toBe(true);
      expect(mockTabService.queryTabs).toHaveBeenCalledWith({}); // Verify precise match logic
      expect(mockTabService.createTab).toHaveBeenCalledWith({ url: targetUrl, active: false });
      expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(newTab.id);

      // Cleanup verification
      expect(mockTabService.removeTab).toHaveBeenCalledWith(newTab.id);
    });

    test.each([
      {
        name: 'should handle migration execution failure and cleanup',
        tabId: 777,
        migrationResponse: { error: 'Migration Failed' },
        expectedMessage: 'Migration Failed',
      },
      {
        name: 'should treat nested migration outcome error as failure',
        tabId: 778,
        migrationResponse: {
          success: true,
          result: { error: 'Migration failed after max retries' },
          statistics: { newHighlightsCreated: 0 },
        },
        expectedMessage: 'Migration failed after max retries',
      },
      {
        name: 'should treat rolled back migration result as failure',
        tabId: 779,
        migrationResponse: {
          success: true,
          result: { rolledBack: true, reason: 'verification_failed' },
          statistics: { newHighlightsCreated: 0 },
        },
        expectedMessage: 'Migration rolled back: verification_failed',
      },
    ])('$name', async ({ tabId, migrationResponse, expectedMessage }) => {
      mockExistingTabMigrationFailure(tabId, migrationResponse);

      await expect(service.executeContentMigration({ url: targetUrl }, sender)).rejects.toThrow(
        expectedMessage
      );
      expect(mockTabService.removeTab).not.toHaveBeenCalled();
    });

    test('should execute the injectWithResponse callbacks properly for coverage', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockStorageService.getHighlights.mockResolvedValue(['hi']);

      // We will actually execute the callback passed to injectWithResponse
      mockInjectionService.injectWithResponse.mockImplementation(async (_tabId, cb) => {
        // Setup global mock state for _waitForScriptReady
        globalThis.MigrationExecutor = class {
          migrate() {
            return Promise.resolve({ rolledBack: false });
          }
          getStatistics() {
            return { newHighlightsCreated: 1 };
          }
        };
        globalThis.HighlighterV2 = { manager: {} };

        try {
          return cb('exec_err', 'mgr_err');
        } finally {
          delete globalThis.MigrationExecutor;
          delete globalThis.HighlighterV2;
        }
      });

      const result = await service.executeContentMigration({ url: targetUrl }, sender);
      expect(result.success).toBe(true);
    });

    test('should handle execution failure in injectWithResponse cb', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockStorageService.getHighlights.mockResolvedValue(['hi']);

      mockInjectionService.injectWithResponse.mockImplementation(async (_tabId, cb) => {
        try {
          delete globalThis.MigrationExecutor;
          delete globalThis.HighlighterV2;
          return cb('exec_err', 'mgr_err');
        } finally {
          delete globalThis.MigrationExecutor;
          delete globalThis.HighlighterV2;
        }
      });

      await expect(service.executeContentMigration({ url: targetUrl }, sender)).rejects.toThrow();
    });

    test('should timeout _waitForScriptReady if ready check fails', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockStorageService.getHighlights.mockResolvedValue(['hi']);

      // Always return ready: false
      mockInjectionService.injectWithResponse.mockResolvedValue({ ready: false });

      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = jest.fn(cb => cb());

      const promise = service.executeContentMigration({ url: targetUrl }, sender);
      await expect(promise).rejects.toThrow(/timeout/);

      globalThis.setTimeout = originalSetTimeout;
    });
  });
});
