/**
 * @jest-environment jsdom
 */

const CONTENT_INDEX_MODULE = '../../../scripts/content/index.js';
const CONTENT_EXTRACTOR_MODULE = '../../../scripts/content/extractors/ContentExtractor.js';
const CONVERTER_FACTORY_MODULE = '../../../scripts/content/converters/ConverterFactory.js';
const IMAGE_COLLECTOR_MODULE = '../../../scripts/content/extractors/ImageCollector.js';
const IMAGE_UTILS_MODULE = '../../../scripts/utils/imageUtils.js';
const LOGGER_MODULE = '../../../scripts/utils/Logger.js';
const HIGHLIGHTER_ENTRY_AUTO_INIT_MODULE = '../../../scripts/highlighter/entryAutoInit.js';

describe('Content Script PING Handler', () => {
  let preloaderHandler;

  const Logger = {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };

  const registerContentEntrypointMocks = async () => {
    const contentExtractorFactory = () => ({
      ContentExtractor: {
        extractAsync: jest.fn(),
      },
    });
    const converterFactory = () => ({
      ConverterFactory: {
        getConverter: jest.fn(),
      },
    });
    const imageCollectorFactory = () => ({
      ImageCollector: {
        collectAdditionalImages: jest.fn(),
      },
    });
    const imageUtilsFactory = () => ({
      mergeUniqueImages: jest.fn(),
    });
    const loggerFactory = () => ({
      default: Logger,
      ...Logger,
      __esModule: true,
    });
    const highlighterEntryAutoInitFactory = () => ({});

    jest.doMock(CONTENT_EXTRACTOR_MODULE, contentExtractorFactory);
    jest.doMock(CONVERTER_FACTORY_MODULE, converterFactory);
    jest.doMock(IMAGE_COLLECTOR_MODULE, imageCollectorFactory);
    jest.doMock(IMAGE_UTILS_MODULE, imageUtilsFactory);
    jest.doMock(LOGGER_MODULE, loggerFactory);
    jest.doMock(HIGHLIGHTER_ENTRY_AUTO_INIT_MODULE, highlighterEntryAutoInitFactory);
    jest.unstable_mockModule(CONTENT_EXTRACTOR_MODULE, contentExtractorFactory);
    jest.unstable_mockModule(CONVERTER_FACTORY_MODULE, converterFactory);
    jest.unstable_mockModule(IMAGE_COLLECTOR_MODULE, imageCollectorFactory);
    jest.unstable_mockModule(IMAGE_UTILS_MODULE, imageUtilsFactory);
    jest.unstable_mockModule(LOGGER_MODULE, loggerFactory);
    jest.unstable_mockModule(HIGHLIGHTER_ENTRY_AUTO_INIT_MODULE, highlighterEntryAutoInitFactory);
  };

  const createPreloaderCache = () => ({
    article: {},
    timestamp: Date.now(),
  });

  const loadContentPingEntrypoint = async ({ preloaderCache = createPreloaderCache() } = {}) => {
    jest.resetModules();
    jest.clearAllMocks();
    await registerContentEntrypointMocks();

    // Mock chrome
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(),
        },
        sendMessage: jest.fn(),
      },
    };

    if (preloaderHandler) {
      document.removeEventListener('notion-preloader-request', preloaderHandler);
      preloaderHandler = null;
    }

    if (preloaderCache == null) {
      delete globalThis.__NOTION_PRELOADER_CACHE__;
    } else {
      // Preloader cache can be set on globalThis
      // globalThis.__NOTION_PRELOADER_CACHE__ needs to be set BEFORE import
      globalThis.__NOTION_PRELOADER_CACHE__ = preloaderCache;
    }

    // Respond to preloader requests with the global cache object
    // This perfectly emulates the decouple phase logic that sends the cache
    preloaderHandler = () => {
      document.dispatchEvent(
        new CustomEvent('notion-preloader-response', {
          detail: globalThis.__NOTION_PRELOADER_CACHE__,
        })
      );
    };
    document.addEventListener('notion-preloader-request', preloaderHandler);

    // Mock document methods
    if (jest.isMockFunction(document.querySelector)) {
      document.querySelector.mockImplementation(() => null);
    } else {
      jest.spyOn(document, 'querySelector').mockImplementation(() => null);
    }

    await jest.isolateModulesAsync(async () => {
      await import(CONTENT_INDEX_MODULE);
    });
    return globalThis.chrome.runtime.onMessage.addListener.mock.calls.map(c => c[0]);
  };

  const dispatchPreloaderResponse = metadata => {
    document.dispatchEvent(
      new CustomEvent('notion-preloader-response', {
        detail: {
          ...globalThis.__NOTION_PRELOADER_CACHE__,
          ...metadata,
        },
      })
    );
  };

  const getRegisteredMessageHandlers = () =>
    globalThis.chrome.runtime.onMessage.addListener.mock.calls.map(c => c[0]);

  const sendRuntimeActionToHandlers = (handlers, action) => {
    const sendResponse = jest.fn();
    const results = handlers.map(h => h({ action }, {}, sendResponse));

    return { results, sendResponse };
  };

  beforeEach(() => {
    preloaderHandler = null;
  });

  afterEach(() => {
    document.removeEventListener('notion-preloader-request', preloaderHandler);
    delete globalThis.__NOTION_PRELOADER_CACHE__;
    delete globalThis.__NOTION_BUNDLE_READY__;
    delete globalThis.chrome;
    jest.restoreAllMocks();
  });

  test('PING 應該返回 shortlink 和 nextRouteInfo', async () => {
    await loadContentPingEntrypoint();

    dispatchPreloaderResponse({
      nextRouteInfo: { page: '/test', query: { id: '1' } },
      shortlink: 'https://example.com/?p=7741',
    });

    const handlers = getRegisteredMessageHandlers();
    expect(handlers.length).toBeGreaterThan(0);

    const { results, sendResponse } = sendRuntimeActionToHandlers(handlers, 'PING');

    expect(results).toContain(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        shortlink: 'https://example.com/?p=7741',
        nextRouteInfo: { page: '/test', query: { id: '1' } },
      })
    );
  });

  test('當 Preloader Cache 缺失時，PING 應該返回 null 元數據', async () => {
    // 重新初始化環境而不設定 cache
    await loadContentPingEntrypoint({ preloaderCache: null });

    // 從所有註冊的監聽器中找到 PING 處理程序
    // 由於引入了 highlighter runtime entry，可能會有其他監聽器被註冊 (例如 entryAutoInit.js)
    // 因此我們不能假設只有一個監聽器，也不能假設第一個就是我們的。
    // 我們遍歷所有監聽器，並確保其中 *有一個* 正確處理了 PING 請求。

    const handlers = getRegisteredMessageHandlers();
    expect(handlers.length).toBeGreaterThan(0);

    const { results, sendResponse } = sendRuntimeActionToHandlers(handlers, 'PING');

    // 驗證是否有 handler 返回了 true (表示異步處理)
    const handled = results.includes(true);
    expect(handled).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        hasPreloaderCache: false,
        shortlink: null,
        nextRouteInfo: null,
      })
    );
  });

  test('當元數據部分缺失時，PING 應該正確返回', async () => {
    await loadContentPingEntrypoint();

    dispatchPreloaderResponse({
      nextRouteInfo: null,
      shortlink: 'https://example.com/?p=123',
    });

    const handlers = getRegisteredMessageHandlers();
    const { results, sendResponse } = sendRuntimeActionToHandlers(handlers, 'PING');

    expect(results).toContain(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        shortlink: 'https://example.com/?p=123',
        nextRouteInfo: null,
      })
    );
  });

  test('應該忽略非 PING 的未知 Action', async () => {
    await loadContentPingEntrypoint();

    const handlers = getRegisteredMessageHandlers();
    const { results, sendResponse } = sendRuntimeActionToHandlers(handlers, 'UNKNOWN_ACTION');

    // 所有 handlers 都應該返回 falsy (undefined, false, 等)
    results.forEach(result => {
      expect(Boolean(result)).toBe(false);
    });
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
