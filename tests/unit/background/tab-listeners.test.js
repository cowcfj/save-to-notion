/**
 * Background Tab Listeners Tests
 * 測試標籤頁監聽器和遷移相關的函數
 */

// Mock Chrome APIs
import mockChrome from '../../mocks/chrome';

const DEFAULT_TAB_ID = 123;
const ARTICLE_URL = 'https://example.com/article';
const ARTICLE_STORAGE_KEY = `highlights_${ARTICLE_URL}`;
const DEFAULT_CHANGE_INFO = { status: 'complete' };
const DEFAULT_HIGHLIGHT = { text: 'test highlight', color: 'yellow' };
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
];

globalThis.chrome = mockChrome;

// Mock console methods
globalThis.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Mock InjectionService
const mockInjectionService = {
  injectWithResponse: jest.fn(),
  injectHighlightRestore: jest.fn(),
};

globalThis.injectionService = mockInjectionService;
globalThis.migrateLegacyHighlights = jest.fn();

function buildTab(overrides = {}) {
  return {
    id: DEFAULT_TAB_ID,
    url: ARTICLE_URL,
    ...overrides,
  };
}

function buildTabWithoutUrl(overrides = {}) {
  return {
    id: DEFAULT_TAB_ID,
    ...overrides,
  };
}

function buildHighlightStorageRecord({
  storageKey = ARTICLE_STORAGE_KEY,
  highlights = [DEFAULT_HIGHLIGHT],
} = {}) {
  return {
    [storageKey]: {
      highlights,
    },
  };
}

function mockStorageLookup(result = {}) {
  mockChrome.storage.local.get.mockImplementation((_keys, mockCb) => {
    mockCb(result);
  });
}

function mockStoredHighlights(options) {
  mockStorageLookup(buildHighlightStorageRecord(options));
}

function resetChromeMocks() {
  mockChrome._clearStorage();
  mockChrome.tabs.onUpdated.addListener.mockClear();
  mockStorageLookup();
  mockChrome.storage.local.set.mockImplementation((_items, mockCb) => {
    if (mockCb) {
      mockCb();
    }
    return Promise.resolve();
  });
}

function createNormalizeUrlMock() {
  return jest.fn(rawUrl => {
    try {
      const url = new URL(rawUrl);
      url.hash = '';
      TRACKING_PARAMS.forEach(param => url.searchParams.delete(param));
      if (url.pathname !== '/' && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }
      return url.href;
    } catch (error) {
      console.error('URL 標準化失敗:', error);
      return rawUrl;
    }
  });
}

function shouldProcessCompletedTab(changeInfo, tab) {
  return changeInfo?.status === 'complete' && tab?.url;
}

function getStoredHighlights(storageKey) {
  return new Promise(resolve => {
    chrome.storage.local.get([storageKey], resolve);
  });
}

async function restoreHighlightsForTab(tabId, tab, dependencies) {
  const normUrl = dependencies.normalizeUrl(tab.url);
  const storageKey = `highlights_${normUrl}`;
  const result = await getStoredHighlights(storageKey);

  if (!result[storageKey]) {
    return;
  }

  await dependencies.migrateLegacyHighlights(tabId, normUrl, storageKey);
  await globalThis.injectionService.injectHighlightRestore(tabId);
}

function createSetupTabListenersMock(dependencies) {
  return jest.fn(() => {
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      try {
        if (shouldProcessCompletedTab(changeInfo, tab)) {
          await restoreHighlightsForTab(tabId, tab, dependencies);
        }
      } catch (error) {
        console.error('標籤頁監聽器錯誤:', error);
      }
    });
  });
}

function readLegacyHighlightsFromPage() {
  const legacyKey = `highlights_${globalThis.location.href}`;
  const legacyData = localStorage.getItem(legacyKey);

  if (!legacyData) {
    return { found: false };
  }

  try {
    const highlights = JSON.parse(legacyData);
    if (Array.isArray(highlights) && highlights.length > 0) {
      localStorage.removeItem(legacyKey);

      return {
        found: true,
        count: highlights.length,
        data: highlights,
      };
    }
  } catch (parseError) {
    console.error('解析舊版標註數據失敗:', parseError);
  }

  return { found: false };
}

function buildMigratedHighlightRecord(result) {
  return {
    highlights: result.data,
    migratedAt: Date.now(),
    version: '2.8.0',
  };
}

function createMigrateLegacyHighlightsMock() {
  return jest.fn(async (tabId, normUrl, storageKey) => {
    try {
      const result = await globalThis.injectionService.injectWithResponse(
        tabId,
        readLegacyHighlightsFromPage
      );

      if (result?.found) {
        await chrome.storage.local.set({
          [storageKey]: buildMigratedHighlightRecord(result),
        });
      }
    } catch (error) {
      console.error('遷移舊版標註失敗:', error);
    }
  });
}

function getRegisteredTabUpdateListener(setupTabListeners) {
  setupTabListeners();
  return mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];
}

async function dispatchTabUpdate({
  setupTabListeners,
  tabId = DEFAULT_TAB_ID,
  changeInfo = DEFAULT_CHANGE_INFO,
  tab = buildTab(),
} = {}) {
  const listener = getRegisteredTabUpdateListener(setupTabListeners);
  return listener(tabId, changeInfo, tab);
}

describe('Background Tab Listeners', () => {
  /** @type {Function|null} 設置標籤頁監聽器的函數 */
  let setupTabListeners = null;
  /** @type {Function|null} 遷移舊版標註的函數 */
  let migrateLegacyHighlights = null;
  /** @type {Function|null} 標準化 URL 的函數 */
  let normalizeUrl = null;

  beforeEach(() => {
    jest.clearAllMocks();
    resetChromeMocks();

    normalizeUrl = createNormalizeUrlMock();
    migrateLegacyHighlights = createMigrateLegacyHighlightsMock();
    setupTabListeners = createSetupTabListenersMock({
      normalizeUrl,
      migrateLegacyHighlights,
    });
  });

  describe('setupTabListeners', () => {
    test('應該設置標籤頁更新監聽器', () => {
      // Act
      setupTabListeners();

      // Assert
      expect(mockChrome.tabs.onUpdated.addListener).toHaveBeenCalledTimes(1);
      expect(mockChrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('應該在頁面完成加載時檢查標註', async () => {
      // Arrange
      mockStoredHighlights();

      // Act
      await dispatchTabUpdate({ setupTabListeners });

      // Assert
      expect(normalizeUrl).toHaveBeenCalledWith(ARTICLE_URL);
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(
        [ARTICLE_STORAGE_KEY],
        expect.any(Function)
      );
    });

    test('應該跳過非完成狀態的頁面', async () => {
      // Arrange
      const changeInfo = { status: 'loading' };

      // Act
      await dispatchTabUpdate({ setupTabListeners, changeInfo });

      // Assert
      expect(normalizeUrl).not.toHaveBeenCalled();
      expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('應該跳過沒有 URL 的標籤頁', async () => {
      // Arrange
      const tab = buildTabWithoutUrl();

      // Act
      await dispatchTabUpdate({ setupTabListeners, tab });

      // Assert
      expect(normalizeUrl).not.toHaveBeenCalled();
      expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('應該在有標註時注入恢復腳本', async () => {
      // Arrange
      mockStoredHighlights();

      // Act
      await dispatchTabUpdate({ setupTabListeners });

      // Assert
      expect(normalizeUrl).toHaveBeenCalledWith(ARTICLE_URL);
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(
        [ARTICLE_STORAGE_KEY],
        expect.any(Function)
      );
      expect(mockInjectionService.injectHighlightRestore).toHaveBeenCalledWith(DEFAULT_TAB_ID);
    });
  });

  describe('migrateLegacyHighlights', () => {
    test('應該成功遷移舊版標註', async () => {
      // Arrange
      const tabId = 123;
      const normUrl = 'https://example.com/article';
      const storageKey = 'highlights_https://example.com/article';

      const legacyHighlights = [
        { text: 'highlight 1', color: 'yellow' },
        { text: 'highlight 2', color: 'green' },
      ];

      mockInjectionService.injectWithResponse.mockResolvedValue({
        found: true,
        count: 2,
        data: legacyHighlights,
      });

      // Act
      await migrateLegacyHighlights(tabId, normUrl, storageKey);

      // Assert
      expect(mockInjectionService.injectWithResponse).toHaveBeenCalledWith(
        tabId,
        expect.any(Function)
      );
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [storageKey]: {
          highlights: legacyHighlights,
          migratedAt: expect.any(Number),
          version: '2.8.0',
        },
      });
    });

    test('應該跳過沒有舊版標註的頁面', async () => {
      // Arrange
      const tabId = 123;
      const normUrl = 'https://example.com/article';
      const storageKey = 'highlights_https://example.com/article';

      mockInjectionService.injectWithResponse.mockResolvedValue({
        found: false,
      });

      // Act
      await migrateLegacyHighlights(tabId, normUrl, storageKey);

      // Assert
      expect(mockInjectionService.injectWithResponse).toHaveBeenCalledWith(
        tabId,
        expect.any(Function)
      );
      expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
    });

    test('應該處理腳本注入失敗', async () => {
      // Arrange
      const tabId = 123;
      const normUrl = 'https://example.com/article';
      const storageKey = 'highlights_https://example.com/article';

      mockInjectionService.injectWithResponse.mockRejectedValue(new Error('Injection failed'));

      // Act
      await migrateLegacyHighlights(tabId, normUrl, storageKey);

      // Assert
      expect(console.error).toHaveBeenCalledWith('遷移舊版標註失敗:', expect.any(Error));
    });

    test('應該處理空的遷移結果', async () => {
      // Arrange
      const tabId = 123;
      const normUrl = 'https://example.com/article';
      const storageKey = 'highlights_https://example.com/article';

      mockInjectionService.injectWithResponse.mockResolvedValue(null);

      // Act
      await migrateLegacyHighlights(tabId, normUrl, storageKey);

      // Assert
      expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('normalizeUrl', () => {
    test('應該標準化 URL 並移除 hash', () => {
      // Act
      const result = normalizeUrl('https://example.com/article#section1');

      // Assert
      expect(result).toBe('https://example.com/article');
    });

    test('應該移除追蹤參數', () => {
      // Act
      const result = normalizeUrl(
        'https://example.com/article?utm_source=google&utm_medium=cpc&normal=keep'
      );

      // Assert
      expect(result).toBe('https://example.com/article?normal=keep');
    });

    test('應該標準化尾部斜杠', () => {
      // Act
      const result1 = normalizeUrl('https://example.com/article/');
      const result2 = normalizeUrl('https://example.com/');

      // Assert
      expect(result1).toBe('https://example.com/article');
      expect(result2).toBe('https://example.com/'); // 根路徑保留斜杠
    });

    test('應該處理無效 URL', () => {
      // Act
      const result = normalizeUrl('invalid-url');

      // Assert
      expect(result).toBe('invalid-url');
      expect(console.error).toHaveBeenCalledWith(
        'URL 標準化失敗:',
        expect.objectContaining({
          name: 'TypeError',
        })
      );
    });

    test('應該處理複雜的 URL', () => {
      // Act
      const result = normalizeUrl(
        'https://example.com/article/?utm_source=test&fbclid=123&gclid=456&keep=this#hash'
      );

      // Assert
      expect(result).toBe('https://example.com/article?keep=this');
    });
  });

  describe('集成測試', () => {
    test('完整的標籤頁監聽流程應該正常工作', async () => {
      // Arrange
      const trackedArticleUrl = 'https://example.com/article?utm_source=google#section';
      const tab = buildTab({ url: trackedArticleUrl });
      mockStoredHighlights();

      mockInjectionService.injectWithResponse.mockResolvedValue({
        found: true,
        count: 1,
        data: [{ text: 'legacy highlight', color: 'blue' }],
      });

      // Act
      await dispatchTabUpdate({ setupTabListeners, tab });

      // Assert
      expect(normalizeUrl).toHaveBeenCalledWith(trackedArticleUrl);
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(
        [ARTICLE_STORAGE_KEY],
        expect.any(Function)
      );
    });

    test('沒有標註的頁面不應該觸發遷移和恢復', async () => {
      // Act
      await dispatchTabUpdate({ setupTabListeners });

      // Assert
      expect(migrateLegacyHighlights).not.toHaveBeenCalled();
      expect(mockInjectionService.injectHighlightRestore).not.toHaveBeenCalled();
    });
  });

  describe('錯誤處理', () => {
    test('標籤頁監聽器應該處理異常', async () => {
      normalizeUrl.mockImplementation(() => {
        throw new Error('Normalization error');
      });

      // Act & Assert
      await expect(dispatchTabUpdate({ setupTabListeners })).resolves.toBeUndefined();
    });

    test('遷移函數應該處理存儲錯誤', async () => {
      // Arrange
      const tabId = 123;
      const normUrl = 'https://example.com/article';
      const storageKey = 'highlights_https://example.com/article';

      mockInjectionService.injectWithResponse.mockResolvedValue({
        found: true,
        count: 1,
        data: [{ text: 'test', color: 'yellow' }],
      });

      mockChrome.storage.local.set.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Act & Assert
      await expect(migrateLegacyHighlights(tabId, normUrl, storageKey)).resolves.toBeUndefined();
    });
  });
});
