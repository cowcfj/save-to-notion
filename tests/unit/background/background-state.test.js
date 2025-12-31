// Mock dependencies
global.chrome = {
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

global.Logger = {
  log: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Mock other globals that might be used in background.js
global.ImageUtils = { cleanImageUrl: jest.fn(), isValidImageUrl: jest.fn() };
global.ErrorHandler = {};
global.PerformanceOptimizer = {};

// Import services directly
import { TabService } from '../../../scripts/background/services/TabService.js';
import { InjectionService } from '../../../scripts/background/services/InjectionService.js';

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
      logger: global.Logger,
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
      // keys is array check
      const k = Array.isArray(keys) ? keys[0] : keys;
      if (k === highlightsKey) {
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
});
