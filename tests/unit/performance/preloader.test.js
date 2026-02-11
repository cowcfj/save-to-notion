/**
 * @jest-environment jsdom
 */

describe('Preloader Performance Script', () => {
  let mockChrome;

  beforeAll(() => {
    // No need to read file manually anymore
  });

  beforeEach(() => {
    // Reset global state
    jest.resetModules();
    delete globalThis.__NOTION_PRELOADER_INITIALIZED__;
    delete globalThis.__NOTION_BUNDLE_READY__;

    // Mock chrome API
    mockChrome = {
      runtime: {
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn(),
        },
        lastError: null,
      },
    };
    globalThis.chrome = mockChrome;

    // Reset DOM
    document.body.innerHTML = '';
    jest.restoreAllMocks();

    // Track event listeners strictly for cleanup
    const originalAdd = document.addEventListener;
    const originalRemove = document.removeEventListener;
    const listeners = [];

    document.addEventListener = jest.fn((type, listener, options) => {
      listeners.push({ type, listener, options });
      originalAdd.call(document, type, listener, options);
    });

    document.removeEventListener = jest.fn((type, listener, options) => {
      const index = listeners.findIndex(l => l.type === type && l.listener === listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      originalRemove.call(document, type, listener, options);
    });

    // Store cleanup in global or accessible scope?
    // Actually easier: just attach to test context or rely on jest.restoreAllMocks?
    // jest.restoreAllMocks restores implementations but does NOT remove listeners added to real DOM objects!
    // So we must manually remove them.
    globalThis.__test_listeners__ = listeners;
    globalThis.__test_original_remove__ = originalRemove;
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.__NOTION_PRELOADER_INITIALIZED__;

    // Clean up event listeners
    if (globalThis.__test_listeners__) {
      globalThis.__test_listeners__.forEach(({ type, listener, options }) => {
        globalThis.__test_original_remove__.call(document, type, listener, options);
      });
      delete globalThis.__test_listeners__;
      delete globalThis.__test_original_remove__;
    }
  });

  /**
   * Helper to execute the preloader script via require
   */
  const runPreloader = () => {
    try {
      // Use require to execute the script in the current environment
      // jest.resetModules() in beforeEach ensures it re-runs
      require('../../../scripts/performance/preloader.js');
    } catch (error) {
      console.error('Error executing preloader script:', error);
    }
  };

  describe('Initialization Check', () => {
    test('應該只初始化一次', () => {
      runPreloader();
      expect(globalThis.__NOTION_PRELOADER_INITIALIZED__).toBe(true);

      // Reset mock to verify it's not called again
      mockChrome.runtime.onMessage.addListener.mockClear();

      runPreloader();
      expect(mockChrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
    });
  });

  describe('Cache Retrieval via Event', () => {
    test('應該透過事件正確返回快取數據', () => {
      const nextData = { page: '/test', query: { id: '123' }, buildId: 'abc' };
      document.body.innerHTML = `
          <article>Article Content</article>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
          <link rel="shortlink" href="https://example.com/?p=123" />
        `;

      runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });

      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail).not.toBeNull();
      expect(responseDetail.article).not.toBeNull();
      expect(responseDetail.nextRouteInfo).toEqual(nextData);
      expect(responseDetail.shortlink).toBe('https://example.com/?p=123');
    });

    test('應該處理無效的 Next.js 數據 (缺少 page/query)', () => {
      const invalidData = { foo: 'bar' }; // Missing page/query
      document.body.innerHTML = `
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(invalidData)}</script>
        `;

      runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });
      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail.nextRouteInfo).toBeNull();
    });

    test('應該處理無效的 Next.js JSON (語法錯誤)', () => {
      document.body.innerHTML = `
          <script id="__NEXT_DATA__" type="application/json">{ invalid json </script>
        `;

      runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });
      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail.nextRouteInfo).toBeNull();
    });
  });
});
