/**
 * @jest-environment jsdom
 */

describe('Preloader Performance Script', () => {
  let mockChrome;
  let testListeners = [];
  let originalAdd;
  let originalRemove;

  const normalizeCapture = options => {
    if (typeof options === 'boolean') {
      return options;
    }

    return Boolean(options?.capture);
  };

  const removeTrackedDocumentListener = (type, listener, options) => {
    const expectedCapture = normalizeCapture(options);
    const index = testListeners.findIndex(
      l =>
        l.type === type &&
        l.listener === listener &&
        normalizeCapture(l.options) === expectedCapture
    );
    if (index !== -1) {
      testListeners.splice(index, 1);
    }
    originalRemove.call(document, type, listener, options);
  };

  const setupTrackedDocumentListeners = () => {
    originalAdd = document.addEventListener;
    originalRemove = document.removeEventListener;
    testListeners = [];

    document.addEventListener = jest.fn((type, listener, options) => {
      testListeners.push({ type, listener, options });
      originalAdd.call(document, type, listener, options);
    });

    document.removeEventListener = jest.fn(removeTrackedDocumentListener);
  };

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
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
        },
      },
    };
    globalThis.chrome = mockChrome;

    // Reset DOM
    document.body.innerHTML = '';

    setupTrackedDocumentListeners();
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
   * Helper to execute the preloader script via dynamic import.
   */
  const runPreloader = async () => {
    // jest.resetModules() in beforeEach ensures it re-runs
    await import('../../../scripts/performance/preloader.js');
  };

  describe('Initialization Check', () => {
    test('移除 listener 時應該比對 capture options，保留其他註冊', () => {
      const handler = jest.fn();

      document.addEventListener('click', handler, false);
      document.addEventListener('click', handler, true);

      document.removeEventListener('click', handler, false);

      expect(testListeners).toHaveLength(1);
      expect(testListeners[0]).toEqual(
        expect.objectContaining({
          type: 'click',
          listener: handler,
          options: true,
        })
      );
    });

    test('應該只初始化一次', async () => {
      await runPreloader();
      expect(globalThis.__NOTION_PRELOADER_INITIALIZED__).toBe(true);

      // Reset mock to verify it's not called again
      mockChrome.runtime.onMessage.addListener.mockClear();

      await runPreloader();
      expect(mockChrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
    });

    test('當 chrome.runtime 不可用時不應拋錯，且仍保留 preloader cache 事件', async () => {
      globalThis.chrome = {};

      await expect(runPreloader()).resolves.toBeUndefined();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', event => {
        responseDetail = event.detail;
      });

      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail).not.toBeNull();
      expect(responseDetail).toEqual(
        expect.objectContaining({
          article: null,
          mainContent: null,
          nextRouteInfo: null,
          shortlink: null,
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('Cache Retrieval via Event', () => {
    test('應該透過事件正確返回快取數據', async () => {
      const nextData = { page: '/test', query: { id: '123' }, buildId: 'abc' };
      document.body.innerHTML = `
          <article>Article Content</article>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
          <link rel="shortlink" href="https://example.com/?p=123" />
        `;

      await runPreloader();

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

    test('應該處理無效的 Next.js 數據 (缺少 page/query)', async () => {
      const invalidData = { foo: 'bar' }; // Missing page/query
      document.body.innerHTML = `
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(invalidData)}</script>
        `;

      await runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });
      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail.nextRouteInfo).toBeNull();
    });

    test('應該處理無效的 Next.js JSON (語法錯誤)', async () => {
      document.body.innerHTML = `
          <script id="__NEXT_DATA__" type="application/json">{ invalid json </script>
        `;

      await runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });
      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail.nextRouteInfo).toBeNull();
    });

    test('應該拒絕類型錯誤的 Next.js 數據 (page 不是字串 或 query 不是物件)', async () => {
      const invalidTypeData = { page: 123, query: 'invalid' };
      document.body.innerHTML = `
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(invalidTypeData)}</script>
        `;

      await runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });
      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail.nextRouteInfo).toBeNull();
    });

    test('應該拒絕沒有 query 參數的 shortlink (如首頁 URL)', async () => {
      document.body.innerHTML = `
          <link rel="shortlink" href="https://example.com/" />
        `;

      await runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });
      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail).not.toBeNull();
      expect(responseDetail.shortlink).toBeNull();
    });

    test('應該處理無效的 shortlink URL 格式 (catch 區塊)', async () => {
      document.body.innerHTML = `
          <link rel="shortlink" href="://invalid" />
        `;

      await runPreloader();

      let responseDetail = null;
      document.addEventListener('notion-preloader-response', e => {
        responseDetail = e.detail;
      });
      document.dispatchEvent(new CustomEvent('notion-preloader-request'));

      expect(responseDetail).not.toBeNull();
      expect(responseDetail.shortlink).toBeNull();
    });
  });

  describe('Keyboard Shortcut handling', () => {
    test.each([
      ['Ctrl+S', { ctrlKey: true, key: 's' }],
      ['Cmd+S', { metaKey: true, key: 's' }],
    ])('應該在按下 %s 時發送激活訊息', async (_shortcutLabel, keyboardOptions) => {
      await runPreloader();
      const event = new KeyboardEvent('keydown', keyboardOptions);
      document.dispatchEvent(event);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'USER_ACTIVATE_SHORTCUT' },
        expect.any(Function)
      );
    });

    test('Caps Lock 開啟時仍應該處理大寫 S 快捷鍵', async () => {
      await runPreloader();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 'S' });
      document.dispatchEvent(event);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'USER_ACTIVATE_SHORTCUT' },
        expect.any(Function)
      );
    });

    test('當 runtime.sendMessage 不可用時不應該發送快捷鍵訊息', async () => {
      const originalSendMessage = globalThis.chrome.runtime.sendMessage;

      try {
        delete globalThis.chrome.runtime.sendMessage;

        await runPreloader();
        const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 's' });

        expect(() => {
          document.dispatchEvent(event);
        }).not.toThrow();

        expect(testListeners).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'keydown',
            }),
          ])
        );
        expect(event.defaultPrevented).toBe(false);
        expect(originalSendMessage).not.toHaveBeenCalled();
      } finally {
        globalThis.chrome.runtime.sendMessage = originalSendMessage;
      }
    });

    test('應該處理快捷鍵發送訊息後的回調 (緩衝事件)', async () => {
      await runPreloader();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 's' });
      document.dispatchEvent(event);

      const shortcutCall = mockChrome.runtime.sendMessage.mock.calls.find(
        ([message]) => message.action === 'USER_ACTIVATE_SHORTCUT'
      );
      const callback = shortcutCall[1];

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

    test('應該處理快捷鍵發送訊息後的錯誤', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await runPreloader();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 's' });
      document.dispatchEvent(event);

      mockChrome.runtime.lastError = { message: 'Connection error' };
      const shortcutCall = mockChrome.runtime.sendMessage.mock.calls.find(
        ([message]) => message.action === 'USER_ACTIVATE_SHORTCUT'
      );
      const callback = shortcutCall[1];
      callback();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Notion Preloader] Failed to send shortcut message:'),
        'Connection error'
      );

      mockChrome.runtime.lastError = null;
    });

    test('當 Bundle 已就緒時不應該緩衝快捷鍵事件', async () => {
      globalThis.__NOTION_BUNDLE_READY__ = true;
      await runPreloader();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 's' });
      document.dispatchEvent(event);

      const shortcutCall = mockChrome.runtime.sendMessage.mock.calls.find(
        ([message]) => message.action === 'USER_ACTIVATE_SHORTCUT'
      );
      const callback = shortcutCall[1];
      callback({ success: true });

      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      onMessage({ action: 'REPLAY_BUFFERED_EVENTS' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ events: [] });
    });
  });

  describe('Message Handling', () => {
    test('應該正確執行 INIT_BUNDLE', async () => {
      await runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      onMessage({ action: 'INIT_BUNDLE' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ready: true }));
    });

    test('應該正確執行 REPLAY_BUFFERED_EVENTS', async () => {
      await runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      onMessage({ action: 'REPLAY_BUFFERED_EVENTS' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ events: expect.any(Array) })
      );
    });

    test('PING 應該在 Bundle 未準備好時響應', async () => {
      await runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      onMessage({ action: 'PING' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'preloader_only' })
      );
    });

    test('PING 不應該在 Bundle 已就緒時響應', async () => {
      globalThis.__NOTION_BUNDLE_READY__ = true;
      await runPreloader();
      const onMessage = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      const handled = onMessage({ action: 'PING' }, {}, sendResponse);
      expect(handled).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('Floating Rail auto-show performance boundary', () => {
    test('[REGRESSION] 初始化時不應讀取 chrome.storage.sync 設定', async () => {
      await runPreloader();

      await Promise.resolve();

      expect(mockChrome.storage.sync.get).not.toHaveBeenCalled();
    });

    test('[REGRESSION] 初始化時不應發送 SHOW_FLOATING_RAIL action（獨立於設定）', async () => {
      await runPreloader();
      await Promise.resolve();

      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        { action: 'SHOW_FLOATING_RAIL' },
        expect.any(Function)
      );
    });
  });
});
