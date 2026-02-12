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
    // Setup DOM mocks
    document.querySelector.mockImplementation(selector => {
      if (selector === 'link[rel="shortlink"]') {
        return { href: 'https://example.com/?p=7741' };
      }
      if (selector === '#__NEXT_DATA__') {
        return { textContent: JSON.stringify({ page: '/test', query: { id: '1' } }) };
      }
      return null;
    });

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

  test('PING 應該處理無效的 Next.js JSON 並返回 null', () => {
    // Setup DOM with invalid JSON
    document.querySelector.mockImplementation(selector => {
      if (selector === '#__NEXT_DATA__') {
        return { textContent: '{ invalid json' };
      }
      return null;
    });

    const sendResponse = jest.fn();
    messageHandler({ action: 'PING' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        nextRouteInfo: null,
      })
    );
  });

  test('PING 應該處理無效的 NextJS 數據', () => {
    document.querySelector.mockImplementation(selector => {
      if (selector === '#__NEXT_DATA__') {
        return { textContent: 'invalid json' };
      }
      return null;
    });

    const sendResponse = jest.fn();
    messageHandler({ action: 'PING' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        nextRouteInfo: null,
      })
    );
  });

  test('PING 應該處理過大的 NextJS 數據', () => {
    document.querySelector.mockImplementation(selector => {
      if (selector === '#__NEXT_DATA__') {
        return { textContent: 'a'.repeat(1_048_577) };
      }
      return null;
    });

    const sendResponse = jest.fn();
    messageHandler({ action: 'PING' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        nextRouteInfo: null,
      })
    );
  });
});
