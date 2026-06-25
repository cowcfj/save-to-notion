import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  error: jest.fn(),
  info: jest.fn(),
  start: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};

const sanitizeUrlForLoggingMock = jest.fn();
const isRootUrlMock = jest.fn();

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: sanitizeUrlForLoggingMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => ({
  computeStableUrl: jest.fn(url => `${String(url).split('?')[0]}#stable`),
  isRootUrl: isRootUrlMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/imageUtils.js', () => ({
  IMAGE_EXTENSIONS: /\.(?:avif|gif|jpe?g|png|svg|webp)$/i,
  IMAGE_PATH_PATTERNS: [/\/image\//i, /\/photo/i],
}));

const { ImageService, ImageUrlValidationCache } = await import(
  '../../../../scripts/background/services/ImageService.js'
);
const { MigrationService } = await import(
  '../../../../scripts/background/services/MigrationService.js'
);
const { PageContentService } = await import(
  '../../../../scripts/background/services/PageContentService.js'
);
const { resolveSaveStatus } = await import(
  '../../../../scripts/background/services/SaveStatusCoordinator.js'
);
const { StorageMigrationScanner } = await import(
  '../../../../scripts/background/services/StorageMigrationScanner.js'
);

const originalChrome = globalThis.chrome;

beforeEach(() => {
  jest.clearAllMocks();
  sanitizeUrlForLoggingMock.mockImplementation(url => `[safe]${url}`);
  isRootUrlMock.mockImplementation(url => url === 'https://example.com/');
});

afterEach(() => {
  globalThis.chrome = originalChrome;
});

describe('remaining background services native ESM diagnostics', () => {
  test('ImageService cache and local validation execute LRU, TTL, and fallback paths', () => {
    const cache = new ImageUrlValidationCache(2, 1000);
    cache.set('https://example.com/a.jpg', true);
    cache.set('https://example.com/b.jpg', false);
    expect(cache.get('https://example.com/a.jpg')).toBe(true);
    cache.set('https://example.com/c.jpg', true);
    expect(cache.get('https://example.com/b.jpg')).toBeNull();
    expect(cache.getStats()).toEqual(
      expect.objectContaining({
        evictions: 1,
        maxSize: 2,
        size: 2,
      })
    );

    const validator = jest.fn(url => url.endsWith('.png'));
    const service = new ImageService({
      cacheTtl: 60_000,
      logger: loggerMock,
      maxCacheSize: 4,
      validator,
    });
    expect(service.isValidImageUrl(' https://example.com/icon.png ')).toBe(true);
    expect(service.isValidImageUrl('https://example.com/icon.png')).toBe(true);
    expect(validator).toHaveBeenCalledTimes(1);

    const fallbackService = new ImageService({ logger: loggerMock });
    expect(fallbackService.isValidImageUrl('https://example.com/photo.webp')).toBe(true);
    expect(fallbackService.isValidImageUrl('ftp://example.com/photo.webp')).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  test('PageContentService handles injected success and invalid extraction payloads', async () => {
    const injectedResult = {
      blocks: [{ type: 'paragraph' }],
      coverImage: null,
      extractionStatus: 'success',
      siteIcon: 'https://example.com/favicon.ico',
      title: 'Extracted title',
    };
    const injectionService = {
      injectWithResponse: jest.fn(async () => injectedResult),
    };
    const service = new PageContentService({ injectionService, logger: loggerMock });

    await expect(service.extractContent(101)).resolves.toBe(injectedResult);
    expect(injectionService.injectWithResponse).toHaveBeenCalledWith(
      101,
      expect.any(Function),
      PageContentService.getRequiredScripts(),
      expect.any(Array)
    );
    expect(loggerMock.success).toHaveBeenCalledWith(
      '[PageContentService] 提取成功',
      expect.objectContaining({ blockCount: 1, title: 'Extracted title' })
    );

    const invalidResult = service._handleExtractionResult({ unexpected: true });
    expect(invalidResult).toEqual(
      expect.objectContaining({
        extractionStatus: 'failed',
        siteIcon: null,
        title: expect.any(String),
      })
    );
  });

  test('StorageMigrationScanner merges page and legacy storage snapshots', async () => {
    const snapshot = {
      'highlights_https://example.com/a': [{ id: 'legacy-a' }],
      'highlights_https://example.com/b': { highlights: [{ id: 'legacy-b' }] },
      'page_https://example.com/a': {
        highlights: [{ id: 'page-a' }],
        notion: { pageId: 'page-a' },
      },
      'page_https://example.com/c': {
        highlights: 'invalid',
      },
      'saved_https://example.com/legacy-saved': {
        notionPageId: 'legacy-page',
      },
    };
    const scanner = new StorageMigrationScanner({
      chromeStorage: { local: { get: jest.fn(async () => snapshot) } },
      logger: loggerMock,
    });

    await expect(scanner.getAllHighlights()).resolves.toEqual({
      'https://example.com/a': {
        highlights: [{ id: 'page-a' }],
        url: 'https://example.com/a',
      },
      'https://example.com/b': {
        highlights: [{ id: 'legacy-b' }],
        url: 'https://example.com/b',
      },
      'https://example.com/c': {
        highlights: [],
        url: 'https://example.com/c',
      },
    });
    await expect(scanner.getAllSavedPageUrls(snapshot)).resolves.toEqual([
      'https://example.com/a',
      'https://example.com/legacy-saved',
    ]);
  });

  test('SaveStatusCoordinator verifies saved pages and clears confirmed remote deletion', async () => {
    const deps = {
      getActiveToken: jest.fn(async () => ({ token: 'token-1' })),
      logger: loggerMock,
      notionService: {
        checkPageExists: jest.fn(async () => false),
      },
      now: 500_000,
      resolveCleanupUrl: jest.fn(async () => 'https://example.com/article'),
      storageService: {
        clearNotionStateWithRetry: jest.fn(async () => ({ attempts: 1, cleared: true })),
        getSavedPageData: jest.fn(async () => null),
        setSavedPageData: jest.fn(async () => {}),
      },
      tabService: {
        consumeDeletionConfirmation: jest.fn(() => ({
          deletionPending: false,
          shouldDelete: true,
        })),
      },
      wait: jest.fn(async () => {}),
    };
    const context = {
      forceRefresh: true,
      migratedFromOldKey: false,
      normUrl: 'https://example.com/article',
      resolvedUrl: 'https://example.com/article',
      savedData: {
        lastVerifiedAt: 0,
        notionPageId: 'page-1',
        notionUrl: 'https://notion.so/page-1',
        savedAt: 1,
        title: 'Saved page',
      },
    };

    await expect(resolveSaveStatus(context, deps)).resolves.toEqual(
      expect.objectContaining({
        isSaved: false,
        statusKind: 'deleted_remote',
        success: true,
        wasDeleted: true,
      })
    );
    expect(deps.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.objectContaining({ expectedPageId: 'page-1' })
    );
  });

  test('MigrationService normalizes highlights, supplements metadata, and finalizes batch data', async () => {
    const storageService = {
      clearLegacyKeys: jest.fn(async () => {}),
      getHighlights: jest.fn(async () => []),
      getSavedPageData: jest.fn(async url =>
        url.includes('#stable') ? null : { notionPageId: 'legacy-page', title: 'Legacy' }
      ),
      setSavedPageData: jest.fn(async () => {}),
      setUrlAlias: jest.fn(async () => {}),
      updateHighlights: jest.fn(async () => {}),
    };
    const service = new MigrationService(storageService, {}, {});

    expect(service._normalizeHighlights({ highlights: [{ id: 'h1' }] })).toEqual([{ id: 'h1' }]);
    expect(
      MigrationService._convertHighlightFormat([{ id: 'h1' }, { id: 'h2', rangeInfo: {} }])
    ).toEqual([
      { id: 'h1', needsRangeInfo: true },
      { id: 'h2', needsRangeInfo: false, rangeInfo: {} },
    ]);
    await expect(
      service._resolveMigratedHighlights({
        convertFormat: true,
        formatConverter: async highlights => highlights.map(highlight => ({ ...highlight, ok: true })),
        highlights: [{ id: 'h1' }],
        legacyUrl: 'https://example.com/article?utm=1',
        stableUrl: 'https://example.com/article#stable',
      })
    ).resolves.toEqual({
      formatConverted: true,
      migratedHighlights: [{ id: 'h1', ok: true }],
    });

    await expect(
      service._supplementStableNotionIfNeeded({
        legacySavedData: { notionPageId: 'legacy-page', title: 'Legacy' },
        legacyUrl: 'https://example.com/article?utm=1',
        stableSavedData: null,
        stableUrl: 'https://example.com/article#stable',
      })
    ).resolves.toBe(true);
    expect(storageService.setSavedPageData).toHaveBeenCalledWith(
      'https://example.com/article#stable',
      { notionPageId: 'legacy-page', title: 'Legacy' }
    );

    await expect(
      service._supplementBatchSavedMetadata(
        'https://example.com/article?utm=1',
        'https://example.com/article#stable'
      )
    ).resolves.toBe(true);
    expect(storageService.setUrlAlias).toHaveBeenCalledWith(
      'https://example.com/article?utm=1',
      'https://example.com/article#stable'
    );
  });
});
