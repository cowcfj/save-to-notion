/**
 * @jest-environment jsdom
 */

describe('Preloader Performance Script', () => {
  let mockChrome;
  let testListeners = [];
  let originalAdd;
  let originalRemove;

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

    // Track event listeners strictly for cleanup
    originalAdd = document.addEventListener;
    originalRemove = document.removeEventListener;
    testListeners = [];

    document.addEventListener = jest.fn((type, listener, options) => {
      testListeners.push({ type, listener, options });
      originalAdd.call(document, type, listener, options);
    });

    document.removeEventListener = jest.fn((type, listener, options) => {
      const index = testListeners.findIndex(l => l.type === type && l.listener === listener);
      if (index !== -1) {
        testListeners.splice(index, 1);
      }
      originalRemove.call(document, type, listener, options);
    });
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.__NOTION_PRELOADER_INITIALIZED__;
    delete globalThis.__NOTION_BUNDLE_READY__;

    // Clean up event listeners
    testListeners.forEach(({ type, listener, options }) => {
      originalRemove.call(document, type, listener, options);
    });
    testListeners = [];

    // Restore original methods
    document.addEventListener = originalAdd;
    document.removeEventListener = originalRemove;

    jest.restoreAllMocks();
  });

  /**
   * Helper to execute the preloader script via require
   */
  const runPreloader = () => {
    // Use require to execute the script in the current environment
    // jest.resetModules() in beforeEach ensures it re-runs
    require('../../../scripts/performance/preloader.js');
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

    test('應該拒絕類型錯誤的 Next.js 數據 (page 不是字串 或 query 不是物件)', () => {
      const invalidTypeData = { page: 123, query: 'invalid' };
      document.body.innerHTML = `
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(invalidTypeData)}</script>
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

  describe('Keyboard Shortcut handling', () => {
    test('應該在按下 Ctrl+S 時發送激活訊息', () => {
      runPreloader();
      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: 's',
      });
      document.dispatchEvent(event);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'USER_ACTIVATE_SHORTCUT' },
        expect.any(Function)
      );
    });

    test('應該在按下 Cmd+S 時發送激活訊息', () => {
      runPreloader();
      const event = new KeyboardEvent('keydown', {
        metaKey: true,
        key: 's',
      });
      document.dispatchEvent(event);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'USER_ACTIVATE_SHORTCUT' },
        expect.any(Function)
      );
    });

    test('應該處理快捷鍵發送訊息後的回調 (緩衝事件)', () => {
      runPreloader();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 's' });
      document.dispatchEvent(event);

      const callback = mockChrome.runtime.sendMessage.mock.calls[0][1];

      // 模擬回調運作：Bundle 尚未準備好，應該緩衝
      callback({ success: true });

      // 驗證緩衝：透過 REPLAY_BUFFERED_EVENTS 訊息獲取
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      onMessage({ action: 'REPLAY_BUFFERED_EVENTS' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [expect.objectContaining({ type: 'shortcut' })],
        })
      );
    });

    test('應該處理快捷鍵發送訊息後的錯誤', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      runPreloader();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 's' });
      document.dispatchEvent(event);

      mockChrome.runtime.lastError = { message: 'Connection error' };
      const callback = mockChrome.runtime.sendMessage.mock.calls[0][1];
      callback();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send shortcut message'),
        'Connection error'
      );

      mockChrome.runtime.lastError = null;
    });

    test('當 Bundle 已就緒時不應該緩衝快捷鍵事件', () => {
      globalThis.__NOTION_BUNDLE_READY__ = true;
      runPreloader();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 's' });
      document.dispatchEvent(event);

      const callback = mockChrome.runtime.sendMessage.mock.calls[0][1];
      callback({ success: true });

      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      onMessage({ action: 'REPLAY_BUFFERED_EVENTS' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ events: [] });
    });
  });

  describe('Message Handling', () => {
    test('應該正確執行 INIT_BUNDLE', () => {
      runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      onMessage({ action: 'INIT_BUNDLE' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ready: true }));
    });

    test('應該正確執行 REPLAY_BUFFERED_EVENTS', () => {
      runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      onMessage({ action: 'REPLAY_BUFFERED_EVENTS' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ events: expect.any(Array) })
      );
    });

    test('PING 應該在 Bundle 未準備好時響應', () => {
      runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      onMessage({ action: 'PING' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'preloader_only' })
      );
    });

    test('PING 不應該在 Bundle 已就緒時響應', () => {
      globalThis.__NOTION_BUNDLE_READY__ = true;
      runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      const handled = onMessage({ action: 'PING' }, {}, sendResponse);
      expect(handled).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});
