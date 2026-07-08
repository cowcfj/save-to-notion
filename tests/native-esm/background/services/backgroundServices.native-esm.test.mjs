import { afterEach, describe, expect, jest, test } from '@jest/globals';

const clientMock = jest.fn().mockImplementation(options => ({ options }));
const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  start: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};

await jest.unstable_mockModule('@notionhq/client', () => ({
  Client: clientMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => `[safe]${url}`),
}));

await jest.unstable_mockModule('../../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: jest.fn(error => error?.message || error || 'UNKNOWN_ERROR'),
}));

await jest.unstable_mockModule('../../../../scripts/utils/temporaryImageUrl.js', () => ({
  isTemporaryImageUrl: jest.fn(() => false),
}));

await jest.unstable_mockModule('../../../../scripts/utils/RetryManager.js', () => ({
  RetryManager: jest.fn().mockImplementation(() => ({
    execute: jest.fn(async operation => operation()),
  })),
}));

await jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(async () => ({ token: null })),
  refreshOAuthToken: jest.fn(async () => null),
}));

await jest.unstable_mockModule('../../../../scripts/utils/keyOrdering.js', () => ({
  compareKeysAlphabetically: (left, right) => String(left).localeCompare(String(right)),
}));

await jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => ({
  TRACKING_PARAMS: new Set(['utm_source']),
  computeStableUrl: url => `${url}#stable`,
  isRootUrl: url => url === 'https://example.com/',
  normalizeUrl: url => String(url || '').replace(/#.*$/, ''),
  resolveStorageUrl: jest.fn(async ({ url }) => ({ normalizedUrl: url, resolvedUrl: url })),
}));

await jest.unstable_mockModule(
  '../../../../scripts/highlighter/core/HighlightLookupResolver.js',
  () => ({
    KEY_PREFIX: {
      HIGHLIGHTS: 'highlights_',
      PAGE: 'page_',
    },
    getAliasLookupKeys: (normalizedUrl, rawUrl) =>
      rawUrl && rawUrl !== normalizedUrl ? [`url_alias_${normalizedUrl}`] : [],
    pickAliasCandidate: result => Object.values(result || {})[0] || null,
    pickHighlightsFromStorage: (_contract, storageData) => ({
      highlights: storageData.highlights || null,
    }),
    resolveKeys: (normalizedUrl, aliasCandidate) => ({
      legacyCleanupKeys: [`saved_${normalizedUrl}`],
      mutationTargetKey: `page_${aliasCandidate || normalizedUrl}`,
    }),
  })
);

const {
  InjectionService,
  getRuntimeErrorMessage,
  isRecoverableInjectionError,
  isRestrictedInjectionUrl,
} = await import('../../../../scripts/background/services/InjectionService.js');
const { NotionService } = await import('../../../../scripts/background/services/NotionService.js');
const { StorageService } =
  await import('../../../../scripts/background/services/StorageService.js');
const { TabService } = await import('../../../../scripts/background/services/TabService.js');

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('background services native ESM diagnostics', () => {
  test('InjectionService helpers classify restricted URLs and cache bundle path', async () => {
    expect(isRestrictedInjectionUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedInjectionUrl('https://www.notion.so/workspace/page')).toBe(true);
    expect(isRestrictedInjectionUrl('https://example.com/article')).toBe(false);
    expect(isRestrictedInjectionUrl('not a url')).toBe(true);
    expect(getRuntimeErrorMessage({ message: 'No tab with id 1' })).toBe('No tab with id 1');
    expect(isRecoverableInjectionError('No tab with id 1')).toBe(true);

    const service = new InjectionService({ logger: loggerMock });
    await expect(service._resolveHighlighterPath()).resolves.toBe('dist/content.bundle.js');
    await expect(service._resolveHighlighterPath()).resolves.toBe('dist/content.bundle.js');
  });

  test('StorageService builds page-state keys, legacy state, highlights, and retry windows', () => {
    const service = new StorageService({
      chromeStorage: { local: { get: jest.fn(async () => ({})) } },
      logger: loggerMock,
    });

    expect(service._buildPageStateKeys('https://example.com/article')).toEqual({
      aliasKey: 'url_alias:https://example.com/article',
      pageKey: 'page_https://example.com/article',
      savedKey: 'saved_https://example.com/article',
    });
    expect(
      service._buildLegacyPageState('saved_url', { title: 'Old' }, 'https://stable.test')
    ).toEqual({
      format: 'legacy',
      savedKey: 'saved_url',
      savedData: { title: 'Old' },
      resolvedUrl: 'https://stable.test',
    });
    expect(service._buildPageHighlights([{ id: 'h1' }])).toEqual([{ id: 'h1' }]);
    expect(service._buildPageHighlights({ highlights: [{ id: 'h2' }] })).toEqual([{ id: 'h2' }]);

    const pageObject = service._buildPageObject(
      {
        notionPageId: 'page-id',
        notionUrl: 'https://notion.so/page-id',
        savedAt: 100,
        title: 'Saved title',
      },
      [{ id: 'h3' }],
      'https://example.com/article',
      'saved_https://example.com/article'
    );
    expect(pageObject).toEqual({
      highlights: [{ id: 'h3' }],
      metadata: {
        createdAt: 100,
        lastUpdated: expect.any(Number),
        migratedFrom: 'saved_https://example.com/article',
      },
      notion: {
        lastVerifiedAt: null,
        pageId: 'page-id',
        savedAt: 100,
        title: 'Saved title',
        url: 'https://notion.so/page-id',
      },
    });

    service._failedUpgradeAttempts.set('https://example.com/article', {
      attempts: 5,
      firstFailureAt: 1_000,
      nextRetryAt: 3_000,
    });
    expect(service._canRetryUpgrade('https://example.com/article', 2_000)).toBe(false);
    expect(service._canRetryUpgrade('https://example.com/article', 3_000)).toBe(false);
  });

  test('TabService applies two-step remote deletion confirmation', () => {
    const service = new TabService({ logger: loggerMock });
    jest.spyOn(Date, 'now').mockReturnValue(10_000);

    expect(service.consumeDeletionConfirmation('', false)).toEqual({
      deletionPending: false,
      shouldDelete: false,
    });
    expect(service.confirmRemotePageMissing('notion-page-id')).toEqual({
      deletionPending: true,
      shouldDelete: false,
    });
    expect(service.confirmRemotePageMissing('notion-page-id')).toEqual({
      deletionPending: false,
      shouldDelete: true,
    });
    expect(service.resetRemotePageMissingState('notion-page-id')).toEqual({
      deletionPending: false,
      shouldDelete: false,
    });
  });

  test('NotionService initializes scoped clients and classifies retryable errors', () => {
    const service = new NotionService({ apiKey: 'secret_test' });

    expect(clientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: 'secret_test',
        retry: { retries: 0 },
      })
    );
    service.setApiKey('secret_next');
    expect(clientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: 'secret_next',
        retry: { retries: 0 },
      })
    );
    expect(service._getScopedClient({ client: { direct: true } })).toEqual({ direct: true });
    expect(service._getScopedClient({ apiKey: 'temporary_key' })).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({ auth: 'temporary_key' }),
      })
    );

    expect(service._isNotionRetriableError(null)).toBe(false);
    expect(service._isNotionRetriableError({ status: 429 })).toBe(true);
    expect(service._isNotionRetriableError({ code: 'conflict_error' })).toBe(true);
    expect(service._isNotionRetriableError({ message: 'unsaved transactions' })).toBe(true);
    expect(service._isUnauthorizedError({ status: 401 })).toBe(true);
    expect(service._isUnauthorizedError({ code: 'unauthorized' })).toBe(true);
  });
});
