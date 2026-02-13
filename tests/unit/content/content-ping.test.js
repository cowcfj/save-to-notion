/**
 * @jest-environment jsdom
 */

describe('Content Script PING Handler', () => {
  let messageHandler;

  beforeEach(() => {
    jest.resetModules();

    // Mock chrome
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(handler => {
            messageHandler = handler;
          }),
        },
        sendMessage: jest.fn(),
      },
    };

    // Preloader cache can be set on globalThis
    // globalThis.__NOTION_PRELOADER_CACHE__ needs to be set BEFORE require
    globalThis.__NOTION_PRELOADER_CACHE__ = {
      article: {},
      timestamp: Date.now(),
    };

    // Mock document methods
    jest.spyOn(document, 'querySelector').mockImplementation(() => null);

    // Load module
    // We use require to force execution of the top-level code (like addListener)
    jest.isolateModules(() => {
      require('../../../scripts/content/index.js');
    });
  });

  afterEach(() => {
    delete globalThis.__NOTION_PRELOADER_CACHE__;
    delete globalThis.__NOTION_BUNDLE_READY__;
    delete globalThis.chrome;
    jest.restoreAllMocks();
  });

  test('PING 應該返回 shortlink 和 nextRouteInfo', () => {
    // Setup Preloader Cache
    globalThis.__NOTION_PRELOADER_CACHE__.nextRouteInfo = { page: '/test', query: { id: '1' } };
    globalThis.__NOTION_PRELOADER_CACHE__.shortlink = 'https://example.com/?p=7741';

    const sendResponse = jest.fn();
    const result = messageHandler({ action: 'PING' }, {}, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        shortlink: 'https://example.com/?p=7741',
        nextRouteInfo: { page: '/test', query: { id: '1' } },
      })
    );
  });

  test('當 Preloader Cache 缺失時，PING 應該返回 null 元數據', () => {
    // 重新初始化環境而不設定 cache
    jest.resetModules();
    delete globalThis.__NOTION_PRELOADER_CACHE__;

    // 清除之前的監聽器記錄，確保這次 require 是唯一的
    globalThis.chrome.runtime.onMessage.addListener.mockClear();

    jest.isolateModules(() => {
      require('../../../scripts/content/index.js');
    });

    // 從所有註冊的監聽器中找到 PING 處理程序
    const handlers = globalThis.chrome.runtime.onMessage.addListener.mock.calls.map(
      call => call[0]
    );
    const pingHandler = handlers.find(h => {
      // 模擬呼叫以找出回應 PING 的處理程序
      const mockSendResponse = jest.fn();
      return h({ action: 'PING' }, {}, mockSendResponse) === true;
    });

    expect(pingHandler).toBeDefined();
    const sendResponse = jest.fn();
    const result = pingHandler({ action: 'PING' }, {}, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        hasPreloaderCache: false,
        shortlink: null,
        nextRouteInfo: null,
      })
    );
  });

  test('當元數據部分缺失時，PING 應該正確返回', () => {
    // 只設定 shortlink
    globalThis.__NOTION_PRELOADER_CACHE__.nextRouteInfo = null;
    globalThis.__NOTION_PRELOADER_CACHE__.shortlink = 'https://example.com/?p=123';

    const sendResponse = jest.fn();
    const result = messageHandler({ action: 'PING' }, {}, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        shortlink: 'https://example.com/?p=123',
        nextRouteInfo: null,
      })
    );
  });

  test('應該忽略非 PING 的未知 Action', () => {
    const sendResponse = jest.fn();
    const result = messageHandler({ action: 'UNKNOWN_ACTION' }, {}, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
