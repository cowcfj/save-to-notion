import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { makeDefaultChrome } from './backgroundLifecycleHarness.mjs';

await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(url => url),
  computeStableUrl: jest.fn(url => url),
  resolveStorageUrl: jest.fn(url => url),
  isRootUrl: jest.fn(() => false),
  isSafeStableUrl: jest.fn(() => true),
}));

function buildPageRecord({
  notion = {
    notionPageId: 'page-123',
    notionUrl: 'https://www.notion.so/page-123',
    title: 'Test Page',
    savedAt: 12_345,
    lastVerifiedAt: 12_345,
  },
  highlights = [],
  metadata = {},
} = {}) {
  const notionRecord = notion
    ? {
        pageId: notion.notionPageId ?? notion.pageId ?? null,
        url: notion.notionUrl ?? notion.url ?? null,
        title: notion.title ?? null,
        savedAt: notion.savedAt ?? null,
        lastVerifiedAt: notion.lastVerifiedAt ?? null,
      }
    : null;

  return {
    notion: notionRecord,
    highlights,
    metadata: {
      createdAt: 12_345,
      lastUpdated: 12_345,
      ...metadata,
    },
  };
}

function buildHighlight(overrides = {}) {
  return {
    id: 'highlight-1',
    text: 'Test highlight',
    color: 'yellow',
    rangeInfo: {},
    timestamp: 12_345,
    ...overrides,
  };
}

await jest.unstable_mockModule('../../../scripts/background/services/InjectionService.js', () => ({
  InjectionService: class {
    injectHighlighter = jest.fn(async () => undefined);
    injectWithResponse = jest.fn(async () => ({ migrated: false }));
    injectHighlightRestore = jest.fn(async () => undefined);
    ensureBundleInjected = jest.fn(async () => true);
  },
}));

let tabService;

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.chrome = {
    ...makeDefaultChrome(),
    tabs: {
      ...makeDefaultChrome().tabs,
      get: jest.fn(async () => ({ status: 'complete', url: 'https://example.com/page' })),
    },
    action: { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
      },
      sync: { get: jest.fn().mockResolvedValue({}) },
    },
    scripting: { executeScript: jest.fn() },
    runtime: {
      lastError: null,
      onMessage: { addListener: jest.fn() },
      onInstalled: { addListener: jest.fn() },
      onStartup: { addListener: jest.fn() },
      getManifest: () => ({ version: '2.13.0' }),
    },
  };
  globalThis.ImageUtils = { cleanImageUrl: jest.fn(), isValidImageUrl: jest.fn() };
});

describe('background state native ESM', () => {
  test('updates tab state badge based on highlights presence', async () => {
    const { TabService } = await import('../../../scripts/background/services/TabService.js');

    const mockGetSavedPageData = jest.fn(async () => ({
      notionPageId: 'page-id',
      savedAt: Date.now(),
      notionUrl: 'https://notion.so/page-id',
    }));
    const injectionService = {
      ensureBundleInjected: jest.fn().mockResolvedValue(true),
      injectWithResponse: jest.fn(async () => ({ migrated: false })),
      injectHighlightRestore: jest.fn(async () => undefined),
    };

    const service = new TabService({
      logger: {
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
        start: jest.fn(),
        log: jest.fn(),
        info: jest.fn(),
      },
      injectionService,
      normalizeUrl: jest.fn(url => url),
      computeStableUrl: jest.fn(url => url),
      getSavedPageData: mockGetSavedPageData,
      isRestrictedUrl: jest.fn(() => false),
      isRecoverableError: jest.fn(() => false),
      checkPageExists: jest.fn(async () => true),
      getApiKey: async () => 'token',
      clearPageState: jest.fn(async () => ({})),
      clearNotionState: jest.fn(async () => ({})),
      clearNotionStateWithRetry: jest.fn(async () => ({})),
      setSavedPageData: jest.fn(async () => ({})),
    });

    chrome.storage.local.get.mockImplementation(async keys => {
      const key = Array.isArray(keys) ? keys[0] : keys;
      if (key === 'highlights_https://example.com/page') {
        return { 'highlights_https://example.com/page': [buildHighlight()] };
      }
      if (key === 'page_https://example.com/page') {
        return {
          'page_https://example.com/page': buildPageRecord({
            notion: { title: 'Page', pageId: 'page-id' },
            highlights: [buildHighlight()],
            highlightsKey: 'highlights_https://example.com/page',
          }),
        };
      }
      return {};
    });

    await service.updateTabStatus(123, 'https://example.com/page');

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 123 });
    expect(injectionService.ensureBundleInjected).toHaveBeenCalledWith(123);
  });

  test('clears badge when no saved page', async () => {
    const { TabService } = await import('../../../scripts/background/services/TabService.js');

    const service = new TabService({
      logger: {
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
        start: jest.fn(),
        log: jest.fn(),
        info: jest.fn(),
      },
      injectionService: { ensureBundleInjected: jest.fn() },
      normalizeUrl: jest.fn(url => url),
      computeStableUrl: jest.fn(url => url),
      getSavedPageData: jest.fn(async () => null),
      isRestrictedUrl: jest.fn(() => false),
      isRecoverableError: jest.fn(() => false),
      checkPageExists: jest.fn(async () => true),
      getApiKey: async () => 'token',
      clearPageState: jest.fn(async () => ({})),
      clearNotionState: jest.fn(async () => ({})),
      clearNotionStateWithRetry: jest.fn(async () => ({})),
      setSavedPageData: jest.fn(async () => ({})),
    });

    await service.updateTabStatus(123, 'https://example.com/unsaved');
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 123 });
  });
});
