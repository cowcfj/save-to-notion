// Mock dependencies
globalThis.chrome = {
  tabs: {
    onUpdated: { addListener: jest.fn() },
    onActivated: { addListener: jest.fn() },
    get: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    sync: {
      get: jest.fn(),
    },
  },
  scripting: {
    executeScript: jest.fn(),
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ version: '2.13.0' }),
    onMessage: { addListener: jest.fn() },
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
  },
};

globalThis.Logger = {
  log: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Mock other globals that might be used in background.js
globalThis.ImageUtils = { cleanImageUrl: jest.fn(), isValidImageUrl: jest.fn() };
globalThis.ErrorHandler = {};
globalThis.PerformanceOptimizer = {};

// Import services directly
import { TabService } from '../../../scripts/background/services/TabService.js';
import { InjectionService } from '../../../scripts/background/services/InjectionService.js';
import { buildHighlight, buildPageRecord } from '../../helpers/status-fixtures.js';

describe('Background State Updates', () => {
  let tabService = null;
  let injectionService = null;
  let mockGetSavedPageData = null;
  let mockNormalizeUrl = null;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock injectionService
    injectionService = new InjectionService();
    // Spy and mock methods
    jest.spyOn(injectionService, 'injectHighlighter').mockResolvedValue();
    jest.spyOn(injectionService, 'ensureBundleInjected').mockResolvedValue(true);
    // Needed for internal calls
    injectionService.injectWithResponse = jest.fn().mockResolvedValue({ migrated: false });
    injectionService.injectHighlightRestore = jest.fn().mockResolvedValue();

    // Mock dependencies for TabService
    mockGetSavedPageData = jest.fn().mockResolvedValue(null);
    mockNormalizeUrl = jest.fn(url => url);

    // Instantiate TabService
    tabService = new TabService({
      logger: globalThis.Logger,
      injectionService,
      normalizeUrl: mockNormalizeUrl,
      getSavedPageData: mockGetSavedPageData,
      isRestrictedUrl: () => false,
      isRecoverableError: () => false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('tabService.updateTabStatus should update badge and inject highlighter when page is saved and has highlights', async () => {
    const tabId = 123;
    const url = 'https://example.com/page';
    const normUrl = 'https://example.com/page';

    // Setup mocks
    mockGetSavedPageData.mockResolvedValue({ savedAt: Date.now(), notionPageId: 'page-id' });

    // Mock highlights in storage
    const highlightsKey = `highlights_${normUrl}`;
    chrome.storage.local.get.mockImplementation((keys, sendResult) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      // 使用 includes 而非 keys[0] 直接比對，
      // 以相容 HighlightLookupResolver 的 lookupOrder（page_* 在前，highlights_* 在後）
      if (keyList.includes(highlightsKey)) {
        const res = { [highlightsKey]: [{ id: 1, text: 'highlight' }] };
        sendResult?.(res);
        return Promise.resolve(res);
      }
      sendResult?.({});
      return Promise.resolve({});
    });

    // Mock chrome.tabs.get to return complete status
    chrome.tabs.get.mockImplementation((tabId, callback) => {
      const tab = { id: tabId, status: 'complete', url };
      callback?.(tab);
      return Promise.resolve(tab);
    });

    await tabService.updateTabStatus(tabId, url);

    // Verify badge update
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#48bb78', tabId });

    // Verify highlighter injection
    expect(injectionService.ensureBundleInjected).toHaveBeenCalledWith(tabId);
  });

  test('tabService.updateTabStatus should clear badge when page is not saved', async () => {
    const tabId = 123;
    const url = 'https://example.com/unsaved';

    // Setup mocks
    mockGetSavedPageData.mockResolvedValue(null);

    // Mock chrome.storage.local.get (no highlights)
    chrome.storage.local.get.mockImplementation((keys, sendResult) => {
      sendResult?.({});
      return Promise.resolve({});
    });

    await tabService.updateTabStatus(tabId, url);

    // Verify badge cleared
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId });

    // Verify no injection if no highlights
    expect(injectionService.injectHighlighter).not.toHaveBeenCalled();
  });

  test('tabService.updateTabStatus should ignore non-http URLs', async () => {
    await tabService.updateTabStatus(123, 'chrome://extensions');
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  test('tabService.updateTabStatus 在 refresh 後解析出 stableUrl 且只有 highlights 時應保持未保存', async () => {
    const tabId = 123;
    const originalUrl = 'https://example.com/articles/slug';
    const stableUrl = 'https://example.com/?p=2928';

    jest
      .spyOn(tabService, 'resolveTabUrl')
      .mockResolvedValueOnce({
        stableUrl: originalUrl,
        originalUrl,
        hasStableUrl: false,
      })
      .mockResolvedValueOnce({
        stableUrl,
        originalUrl,
        hasStableUrl: true,
      });
    mockGetSavedPageData.mockResolvedValue(null);

    chrome.storage.local.get.mockImplementation((keys, sendResult) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const result = {};

      if (keyList.includes(`page_${stableUrl}`)) {
        result[`page_${stableUrl}`] = buildPageRecord({
          notion: null,
          highlights: [buildHighlight()],
        });
      }

      sendResult?.(result);
      return Promise.resolve(result);
    });

    chrome.tabs.get.mockImplementation((requestedTabId, callback) => {
      const tab = { id: requestedTabId, status: 'complete', url: stableUrl };
      callback?.(tab);
      return Promise.resolve(tab);
    });

    await tabService.updateTabStatus(tabId, originalUrl);
    await tabService.updateTabStatus(tabId, originalUrl);

    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId });
    expect(injectionService.ensureBundleInjected).toHaveBeenCalledWith(tabId);
  });
});
