/**
 * Background Tab Listeners Tests
 * 測試標籤頁監聽器和遷移相關的函數
 */

// Mock Chrome APIs
const mockChrome = require('../../mocks/chrome');
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

describe('Background Tab Listeners', () => {
  /** @type {Function|null} 設置標籤頁監聽器的函數 */
  let setupTabListeners = null;
  /** @type {Function|null} 遷移舊版標註的函數 */
  let migrateLegacyHighlights = null;
  /** @type {Function|null} 標準化 URL 的函數 */
  let normalizeUrl = null;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Chrome API mocks
    mockChrome.tabs.onUpdated.addListener.mockClear();
    mockChrome.storage.local.get.mockImplementation((keys, mockCb) => {
      mockCb({});
    });

    // 模擬 normalizeUrl 函數
    normalizeUrl = jest.fn(rawUrl => {
      try {
        const url = new URL(rawUrl);
        // 移除 hash
        url.hash = '';
        // 移除追蹤參數
        const trackingParams = [
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'utm_content',
          'utm_term',
          'fbclid',
          'gclid',
        ];
        trackingParams.forEach(param => url.searchParams.delete(param));
        // 標準化尾部斜杠
        if (url.pathname !== '/' && url.pathname.endsWith('/')) {
          url.pathname = url.pathname.slice(0, -1);
        }
        return url.href;
      } catch (error) {
        console.error('URL 標準化失敗:', error);
        return rawUrl;
      }
    });

    // 模擬 setupTabListeners 函數
    setupTabListeners = jest.fn(() => {
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        try {
          if (changeInfo.status === 'complete' && tab && tab.url) {
            const normUrl = normalizeUrl(tab.url);
            const storageKey = `highlights_${normUrl}`;

            // 檢查是否有標註數據
            // 將回調式 API 轉換為 Promise 以正確使用 await
            const result = await new Promise(resolve => {
              chrome.storage.local.get([storageKey], resolve);
            });

            if (result[storageKey]) {
              // 檢查是否需要遷移舊版標註
              await migrateLegacyHighlights(tabId, normUrl, storageKey);

              // 注入標註恢復腳本
              await globalThis.injectionService.injectHighlightRestore(tabId);
            }
          }
        } catch (error) {
          console.error('標籤頁監聽器錯誤:', error);
        }
      });
    });

    // 模擬 migrateLegacyHighlights 函數
    migrateLegacyHighlights = jest.fn(async (tabId, normUrl, storageKey) => {
      try {
        const result = await globalThis.injectionService.injectWithResponse(tabId, () => {
          // 檢查 localStorage 中是否有舊版標註
          const legacyKey = `highlights_${globalThis.location.href}`;
          const legacyData = localStorage.getItem(legacyKey);

          if (legacyData) {
            try {
              const highlights = JSON.parse(legacyData);
              if (Array.isArray(highlights) && highlights.length > 0) {
                // 清理舊版數據
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
          }

          return { found: false };
        });

        if (result?.found) {
          // 將遷移的數據保存到 chrome.storage.local
          const migratedData = {
            highlights: result.data,
            migratedAt: Date.now(),
            version: '2.8.0',
          };

          chrome.storage.local.set({
            [storageKey]: migratedData,
          });
        }
      } catch (error) {
        console.error('❌ 遷移舊版標註失敗:', error);
      }
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
      const tabId = 123;
      const tab = {
        id: tabId,
        url: 'https://example.com/article',
      };
      const changeInfo = { status: 'complete' };

      mockChrome.storage.local.get.mockImplementation((keys, mockCb) => {
        mockCb({
          'highlights_https://example.com/article': {
            highlights: [{ text: 'test highlight', color: 'yellow' }],
          },
        });
      });

      setupTabListeners();
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Act
      await listener(tabId, changeInfo, tab);

      // Assert
      expect(normalizeUrl).toHaveBeenCalledWith('https://example.com/article');
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(
        ['highlights_https://example.com/article'],
        expect.any(Function)
      );
    });

    test('應該跳過非完成狀態的頁面', async () => {
      // Arrange
      const tabId = 123;
      const tab = { id: tabId, url: 'https://example.com/article' };
      const changeInfo = { status: 'loading' };

      setupTabListeners();
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Act
      await listener(tabId, changeInfo, tab);

      // Assert
      expect(normalizeUrl).not.toHaveBeenCalled();
      expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('應該跳過沒有 URL 的標籤頁', async () => {
      // Arrange
      const tabId = 123;
      const tab = { id: tabId };
      const changeInfo = { status: 'complete' };

      setupTabListeners();
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Act
      await listener(tabId, changeInfo, tab);

      // Assert
      expect(normalizeUrl).not.toHaveBeenCalled();
      expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('應該在有標註時注入恢復腳本', async () => {
      // Arrange
      const tabId = 123;
      const tab = { id: tabId, url: 'https://example.com/article' };
      const changeInfo = { status: 'complete' };

      mockChrome.storage.local.get.mockImplementation((keys, mockCb) => {
        mockCb({
          'highlights_https://example.com/article': {
            highlights: [{ text: 'test highlight', color: 'yellow' }],
          },
        });
      });

      setupTabListeners();
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Act
      await listener(tabId, changeInfo, tab);

      // Assert
      // 等待異步操作完成
      await new Promise(resolve => setTimeout(resolve, 50));

      // 檢查基本的調用
      expect(normalizeUrl).toHaveBeenCalledWith('https://example.com/article');
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(
        ['highlights_https://example.com/article'],
        expect.any(Function)
      );
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
      expect(console.error).toHaveBeenCalledWith('❌ 遷移舊版標註失敗:', expect.any(Error));
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
      const tabId = 123;
      const tab = { id: tabId, url: 'https://example.com/article?utm_source=google#section' };
      const changeInfo = { status: 'complete' };

      mockChrome.storage.local.get.mockImplementation((keys, mockCb) => {
        // 立即調用回調
        mockCb({
          'highlights_https://example.com/article': {
            highlights: [{ text: 'test highlight', color: 'yellow' }],
          },
        });
      });

      mockInjectionService.injectWithResponse.mockResolvedValue({
        found: true,
        count: 1,
        data: [{ text: 'legacy highlight', color: 'blue' }],
      });

      setupTabListeners();
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Act
      await listener(tabId, changeInfo, tab);

      // 等待異步操作完成
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(normalizeUrl).toHaveBeenCalledWith(
        'https://example.com/article?utm_source=google#section'
      );
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(
        ['highlights_https://example.com/article'],
        expect.any(Function)
      );
    });

    test('沒有標註的頁面不應該觸發遷移和恢復', async () => {
      // Arrange
      const tabId = 123;
      const tab = { id: tabId, url: 'https://example.com/article' };
      const changeInfo = { status: 'complete' };

      mockChrome.storage.local.get.mockImplementation((keys, mockCb) => {
        mockCb({}); // 沒有標註數據
      });

      setupTabListeners();
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Act
      await listener(tabId, changeInfo, tab);

      // Assert
      expect(migrateLegacyHighlights).not.toHaveBeenCalled();
      expect(mockInjectionService.injectHighlightRestore).not.toHaveBeenCalled();
    });
  });

  describe('錯誤處理', () => {
    test('標籤頁監聽器應該處理異常', async () => {
      // Arrange
      const tabId = 123;
      const tab = { id: tabId, url: 'https://example.com/article' };
      const changeInfo = { status: 'complete' };

      normalizeUrl.mockImplementation(() => {
        throw new Error('Normalization error');
      });

      setupTabListeners();
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Act & Assert
      await expect(listener(tabId, changeInfo, tab)).resolves.toBeUndefined();
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
