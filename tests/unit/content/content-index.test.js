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

let extractPageContent;
let ContentExtractor;
let ConverterFactory;
let ImageCollector;
let mergeUniqueImages;
let Logger;
let CONTENT_QUALITY;
let DATA_SOURCE_MESSAGES;
let UI_MESSAGES;

const createLoggerMock = () => ({
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
});

const createContentMocks = () => {
  ContentExtractor = {
    extractAsync: jest.fn(),
  };
  ConverterFactory = {
    getConverter: jest.fn(),
  };
  ImageCollector = {
    collectAdditionalImages: jest.fn(),
  };
  mergeUniqueImages = jest.fn();
  Logger = createLoggerMock();
};

const registerContentMocks = async () => {
  const contentExtractorFactory = () => ({
    ContentExtractor,
  });
  const converterFactory = () => ({
    ConverterFactory,
  });
  const imageCollectorFactory = () => ({
    ImageCollector,
  });
  const imageUtilsFactory = () => ({
    mergeUniqueImages,
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

const prepareContentModuleMocks = async () => {
  jest.resetModules();
  createContentMocks();
  await registerContentMocks();
};

const importContentEntrypoint = async () => {
  const contentModule = await import(CONTENT_INDEX_MODULE);
  extractPageContent = contentModule.extractPageContent;
  return contentModule;
};

const loadContentEntrypoint = async ({ resetMocks = true } = {}) => {
  if (resetMocks) {
    await prepareContentModuleMocks();
  }
  const contentModule = await importContentEntrypoint();

  const allHandlers = globalThis.chrome.runtime.onMessage.addListener.mock.calls.map(c => c[0]);
  const messageHandler = allHandlers.find(h => {
    const mockSend = jest.fn();
    const result = h({ action: 'PING' }, {}, mockSend);
    return result === true && mockSend.mock.calls.length > 0;
  });

  return { contentModule, messageHandler };
};

function createDeferred() {
  let resolveDeferred;
  let rejectDeferred;
  const promise = new Promise((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

function createHandledRejectedPromise(error) {
  return Promise.reject(error);
}

async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function expectSendResponseFailure(sendResponse, error) {
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error,
  });
}

function mockReadabilityExtraction({
  title = 'Test Title',
  content = '<div>Test content</div>',
  blocks = [],
} = {}) {
  ContentExtractor.extractAsync.mockResolvedValue({
    content,
    type: 'readability',
    metadata: { title },
    blocks,
  });

  const mockConverter = {
    convert: jest.fn().mockReturnValue([{ object: 'block', type: 'paragraph' }]),
    imageCount: 0,
  };
  ConverterFactory.getConverter.mockReturnValue(mockConverter);

  return mockConverter;
}

describe('Content Script Entry (index.js)', () => {
  beforeAll(async () => {
    ({ CONTENT_QUALITY } = await import('../../../scripts/config/shared/content.js'));
    ({ DATA_SOURCE_MESSAGES } =
      await import('../../../scripts/config/messages/dataSourceMessages.js'));
    ({ UI_MESSAGES } = await import('../../../scripts/config/shared/messages.js'));
  });

  beforeEach(async () => {
    delete globalThis.HighlighterV2;
    delete globalThis.__NOTION_RAIL_READY__;
    delete globalThis.notionHighlighter;

    // Mock chrome (which might be used by index.js on load)
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(),
        },
        sendMessage: jest.fn(),
        lastError: null,
        getManifest: () => ({ version_name: 'dev' }),
      },
    };

    // Mock document.querySelector
    jest.spyOn(document, 'querySelector').mockImplementation(() => null);

    // Mock DOMParser
    globalThis.DOMParser = jest.fn().mockImplementation(() => ({
      parseFromString: jest.fn().mockImplementation(() => ({
        body: 'mock-body',
      })),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('content default page title uses centralized zh-TW fallback copy', () => {
    expect(CONTENT_QUALITY.DEFAULT_PAGE_TITLE).toBe(DATA_SOURCE_MESSAGES.UNTITLED_PAGE);
    expect(DATA_SOURCE_MESSAGES.UNTITLED_PAGE).toBe(UI_MESSAGES.DATA_SOURCE.UNTITLED_PAGE);
  });

  describe('Message Handlers & Side Effects', () => {
    let messageHandler;
    let sendMessageMock;
    let preloaderHandler;

    const showFloatingRailAction = 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL';
    const activateFloatingRailAction = 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT';
    const railOperationFailure = {
      success: false,
      error: '浮動側欄操作失敗',
    };
    const railInitializationFailure = {
      success: false,
      error: '浮動側欄初始化失敗',
    };
    const railNotInitializedFailure = {
      success: false,
      error: '浮動側欄尚未初始化',
    };

    beforeEach(async () => {
      sendMessageMock = jest.fn();
      globalThis.chrome.runtime.onMessage.addListener = jest.fn();
      globalThis.chrome.runtime.onMessage.removeListener = jest.fn();
      globalThis.chrome.runtime.sendMessage = sendMessageMock;

      // Setup event responder to simulate preloader cache
      preloaderHandler = () => {
        document.dispatchEvent(
          new CustomEvent('notion-preloader-response', {
            detail: {
              shortlink: 'https://wp.me/p1',
              nextRouteInfo: { page: '/p1' },
            },
          })
        );
      };
      document.addEventListener('notion-preloader-request', preloaderHandler);

      ({ messageHandler } = await loadContentEntrypoint());
    });

    afterEach(() => {
      document.removeEventListener('notion-preloader-request', preloaderHandler);
    });

    function dispatchMessage(message) {
      const sendResponse = jest.fn();
      const result = messageHandler(message, {}, sendResponse);

      return { result, sendResponse };
    }

    function dispatchAction(action, payload = {}) {
      return dispatchMessage({ action, ...payload });
    }

    function getReplayCallback() {
      const replayCall = sendMessageMock.mock.calls.find(
        call => call[0].action === 'REPLAY_BUFFERED_EVENTS'
      );

      expect(replayCall).toBeDefined();
      return replayCall[1];
    }

    test('PING 應該返回正確的元數據', () => {
      const sendResponse = jest.fn();
      messageHandler({ action: 'PING' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'bundle_ready',
          shortlink: 'https://wp.me/p1',
          nextRouteInfo: expect.objectContaining({ page: '/p1' }),
        })
      );
    });

    test('[REGRESSION] malformed runtime messages should be ignored without throwing', () => {
      const sendResponse = jest.fn();

      expect(() => {
        messageHandler(null, {}, sendResponse);
      }).not.toThrow();
      expect(messageHandler(null, {}, sendResponse)).toBe(false);
      expect(messageHandler(undefined, {}, sendResponse)).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    test('showHighlighter 應優先調用 rail.show', () => {
      const showMock = jest.fn();
      globalThis.HighlighterV2 = { rail: { show: showMock } };

      const { sendResponse } = dispatchAction('showHighlighter');

      expect(showMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      delete globalThis.HighlighterV2;
    });

    test('showHighlighter 在 rail.show 拋錯時應返回安全 fallback 訊息', () => {
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(() => {
            throw new Error('showHighlighter failed');
          }),
        },
      };

      const { sendResponse } = dispatchAction('showHighlighter');

      expect(sendResponse).toHaveBeenCalledWith(railOperationFailure);
    });

    test('[REGRESSION] showHighlighter 不應在無 rail 時 fallback 到 notionHighlighter toolbar', async () => {
      delete globalThis.HighlighterV2;
      const showMock = jest.fn();
      globalThis.notionHighlighter = { show: showMock };

      const { sendResponse } = dispatchAction('showHighlighter');
      await Promise.resolve();
      await Promise.resolve();

      expect(showMock).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(railNotInitializedFailure);
      delete globalThis.notionHighlighter;
    });

    test.each([
      {
        title: '[REGRESSION] showHighlighter 應等待 rail-ready 完成後才回應',
        action: 'showHighlighter',
      },
      {
        title: '[REGRESSION] content bridge SHOW_FLOATING_RAIL 應等待 rail-ready 完成後才回應',
        action: showFloatingRailAction,
      },
    ])('$title', async ({ action }) => {
      delete globalThis.HighlighterV2;
      const railReady = createDeferred();
      const showMock = jest.fn();
      globalThis.__NOTION_RAIL_READY__ = railReady.promise;

      const { result, sendResponse } = dispatchAction(action);

      expect(result).toBe(true);
      expect(showMock).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();

      railReady.resolve({
        success: true,
        rail: { show: showMock },
      });
      await flushPromises();

      expect(showMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      delete globalThis.__NOTION_RAIL_READY__;
    });

    test('SHOW_FLOATING_RAIL 應優先使用 undismiss 喚回 dismissed rail', () => {
      const undismissMock = jest.fn();
      const showMock = jest.fn();
      globalThis.HighlighterV2 = {
        rail: {
          stateManager: { isDismissed: true },
          undismiss: undismissMock,
          show: showMock,
        },
      };

      const { result, sendResponse } = dispatchAction(showFloatingRailAction);

      expect(result).toBe(true);
      expect(undismissMock).toHaveBeenCalledWith();
      expect(showMock).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('[REGRESSION] SHOW_FLOATING_RAIL 在 ready rail 缺少 show 時應返回初始化失敗', async () => {
      const undismissMock = jest.fn();
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({
        success: true,
        rail: { undismiss: undismissMock },
      });

      const { sendResponse } = dispatchAction(showFloatingRailAction);
      await flushPromises();

      expect(undismissMock).not.toHaveBeenCalled();
      expectSendResponseFailure(sendResponse, '浮動側欄缺少 show() 方法');
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
      delete globalThis.__NOTION_RAIL_READY__;
    });

    test.each([
      {
        title: '[REGRESSION] SHOW_FLOATING_RAIL 在現有 rail 顯示失敗時應返回安全 fallback 訊息',
        show: jest.fn(() => {
          throw new Error('rail show failed');
        }),
      },
      {
        title:
          '[REGRESSION] SHOW_FLOATING_RAIL 在現有 rail 的 async show reject 時應返回安全 fallback 訊息',
        show: jest.fn().mockRejectedValue(new Error('async rail show failed')),
      },
      {
        title:
          '[REGRESSION] SHOW_FLOATING_RAIL 在現有 rail 拋出無 message 的 Error 時應回傳安全 fallback 訊息',
        show: jest.fn(() => {
          const railError = new Error('unused');
          delete railError.message;
          railError.reason = 'rail show failed';
          throw railError;
        }),
      },
    ])('$title', async ({ show }) => {
      globalThis.HighlighterV2 = { rail: { show } };

      const { sendResponse } = dispatchAction(showFloatingRailAction);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith(railOperationFailure);
    });

    test('[REGRESSION] SHOW_FLOATING_RAIL 在 ready rail 缺少顯示方法時應返回明確錯誤', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({
        success: true,
        rail: {},
      });

      const { sendResponse } = dispatchAction(showFloatingRailAction);
      await flushPromises();

      expectSendResponseFailure(sendResponse, '浮動側欄缺少 show() 方法');
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('SHOW_FLOATING_RAIL 在 readyResult 未帶 error 時應返回通用初始化錯誤', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({ success: false });

      const { sendResponse } = dispatchAction(showFloatingRailAction);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith(railInitializationFailure);
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('SHOW_FLOATING_RAIL 在未初始化時應直接返回錯誤', () => {
      delete globalThis.HighlighterV2;
      delete globalThis.__NOTION_RAIL_READY__;

      const { sendResponse } = dispatchAction(showFloatingRailAction);

      expect(sendResponse).toHaveBeenCalledWith(railNotInitializedFailure);
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 應先喚回 dismissed 的 ready rail 再啟動標註', async () => {
      const railReady = createDeferred();
      const showMock = jest.fn();
      const undismissMock = jest.fn();
      const activateHighlightingMock = jest.fn();
      globalThis.__NOTION_RAIL_READY__ = railReady.promise;

      const { result, sendResponse } = dispatchAction(activateFloatingRailAction);

      expect(result).toBe(true);
      expect(showMock).not.toHaveBeenCalled();
      expect(activateHighlightingMock).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();

      railReady.resolve({
        success: true,
        rail: {
          stateManager: { isDismissed: true },
          undismiss: undismissMock,
          show: showMock,
          activateHighlighting: activateHighlightingMock,
        },
      });
      await flushPromises();

      expect(undismissMock).toHaveBeenCalledWith();
      expect(showMock).not.toHaveBeenCalled();
      expect(activateHighlightingMock).toHaveBeenCalledWith();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      delete globalThis.__NOTION_RAIL_READY__;
    });

    test('ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在現有 dismissed rail 可用時應先喚回再啟動標註', () => {
      const showMock = jest.fn();
      const undismissMock = jest.fn();
      const activateHighlightingMock = jest.fn();
      globalThis.HighlighterV2 = {
        rail: {
          stateManager: { isDismissed: true },
          undismiss: undismissMock,
          show: showMock,
          activateHighlighting: activateHighlightingMock,
        },
      };

      const { sendResponse } = dispatchAction(activateFloatingRailAction);

      expect(undismissMock).toHaveBeenCalledWith();
      expect(showMock).not.toHaveBeenCalled();
      expect(activateHighlightingMock).toHaveBeenCalledWith();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在現有 rail 啟動失敗時應返回安全 fallback 訊息', () => {
      const activateHighlightingMock = jest.fn(() => {
        throw new Error('activate failed');
      });
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(),
          activateHighlighting: activateHighlightingMock,
        },
      };

      const { sendResponse } = dispatchAction(activateFloatingRailAction);

      expect(activateHighlightingMock).toHaveBeenCalledWith();
      expect(sendResponse).toHaveBeenCalledWith(railOperationFailure);
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在現有 rail 缺少 activateHighlighting 時應回傳明確錯誤', () => {
      expect.hasAssertions();
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(),
        },
      };

      const { sendResponse } = dispatchAction(activateFloatingRailAction);

      expectSendResponseFailure(sendResponse, '浮動側欄缺少 activateHighlighting() 方法');
    });

    test.each([
      {
        title:
          '[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在 ready rail 初始化失敗時應回傳標準化初始化錯誤',
        createReadyPromise: () =>
          Promise.resolve({
            success: false,
            error: 'ready failed',
          }),
        response: railInitializationFailure,
      },
      {
        title:
          '[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在 ready rail 缺少 activateHighlighting 時應回傳明確錯誤',
        createReadyPromise: () =>
          Promise.resolve({
            success: true,
            rail: {
              show: jest.fn(),
            },
          }),
        response: {
          success: false,
          error: '浮動側欄缺少 activateHighlighting() 方法',
        },
      },
      {
        title:
          '[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在 ready rail 的 async activateHighlighting reject 時應回傳安全 fallback 訊息',
        createReadyPromise: () =>
          Promise.resolve({
            success: true,
            rail: {
              show: jest.fn(),
              activateHighlighting: jest.fn().mockRejectedValue(new Error('async activate failed')),
            },
          }),
        response: railOperationFailure,
      },
      {
        title:
          '[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在 ready promise reject 時應回傳通用錯誤',
        createReadyPromise: () => createHandledRejectedPromise(new Error('boom')),
        response: railInitializationFailure,
      },
    ])('$title', async ({ createReadyPromise, response }) => {
      globalThis.__NOTION_RAIL_READY__ = createReadyPromise();

      const { sendResponse } = dispatchAction(activateFloatingRailAction);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith(response);
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在未初始化時應直接返回錯誤', () => {
      delete globalThis.HighlighterV2;
      delete globalThis.__NOTION_RAIL_READY__;

      const { sendResponse } = dispatchAction(activateFloatingRailAction);

      expect(sendResponse).toHaveBeenCalledWith(railNotInitializedFailure);
    });

    test('REMOVE_HIGHLIGHT_DOM 應呼叫 manager.removeHighlight', () => {
      const removeHighlight = jest.fn().mockReturnValue(true);
      globalThis.HighlighterV2 = {
        manager: {
          removeHighlight,
        },
      };

      const sendResponse = jest.fn();
      const result = messageHandler(
        { action: 'REMOVE_HIGHLIGHT_DOM', highlightId: 'hl-123' },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(removeHighlight).toHaveBeenCalledWith('hl-123');
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      delete globalThis.HighlighterV2;
    });

    test('REMOVE_HIGHLIGHT_DOM 在 Highlighter 尚未初始化時應回傳錯誤', () => {
      delete globalThis.HighlighterV2;
      const sendResponse = jest.fn();

      messageHandler(
        { action: 'REMOVE_HIGHLIGHT_DOM', highlightId: 'hl-undefined' },
        {},
        sendResponse
      );

      expect(Logger.warn).toHaveBeenCalledWith(
        'Highlighter 尚未初始化，略過移除標註 DOM',
        expect.objectContaining({
          action: 'REMOVE_HIGHLIGHT_DOM',
          result: 'uninitialized',
          highlightId: 'hl-undefined',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Highlighter 尚未初始化',
      });
    });

    test('REMOVE_HIGHLIGHT_DOM 在 removeHighlight 拋錯時應回傳錯誤', () => {
      globalThis.HighlighterV2 = {
        manager: {
          removeHighlight: jest.fn(() => {
            throw new Error('remove failed');
          }),
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'REMOVE_HIGHLIGHT_DOM', highlightId: 'hl-error' }, {}, sendResponse);

      expect(Logger.error).toHaveBeenCalledWith(
        '移除標註 DOM 失敗',
        expect.objectContaining({
          action: 'REMOVE_HIGHLIGHT_DOM',
          result: 'failed',
          error: expect.any(Error),
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'remove failed',
      });
    });

    test('應該在載入時發送 REPLAY_BUFFERED_EVENTS 訊息', () => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        { action: 'REPLAY_BUFFERED_EVENTS' },
        expect.any(Function)
      );
    });

    test('REPLAY_BUFFERED_EVENTS callback 遇到 runtime.lastError 時應靜默忽略', () => {
      const replayCallback = getReplayCallback();
      globalThis.chrome.runtime.lastError = { message: 'preloader missing' };

      replayCallback({ events: [{ type: 'shortcut' }] });

      expect(Logger.warn).not.toHaveBeenCalledWith(
        'Highlighter 不可用，無法重放',
        expect.any(Object)
      );
      globalThis.chrome.runtime.lastError = null;
    });

    test('應該處理重放事件', async () => {
      const rail = {
        show: jest.fn(),
        activateHighlighting: jest.fn(),
      };
      globalThis.HighlighterV2 = { rail };

      const replayCallback = getReplayCallback();

      replayCallback({ events: [{ type: 'shortcut' }] });
      await flushPromises();

      expect(rail.show).toHaveBeenCalled();
      expect(rail.activateHighlighting).toHaveBeenCalledWith();

      delete globalThis.HighlighterV2;
    });

    test('重放 shortcut 事件時若 Highlighter 不可用應記錄警告', () => {
      delete globalThis.HighlighterV2;
      const replayCallback = getReplayCallback();

      replayCallback({ events: [{ type: 'shortcut' }] });

      expect(Logger.warn).toHaveBeenCalledWith(
        'Highlighter 不可用，無法重放',
        expect.objectContaining({ action: 'replayEvents' })
      );
    });

    test('重放 shortcut 事件應使用標準 rail reveal flow 喚回 dismissed rail', async () => {
      const rail = {
        stateManager: { isDismissed: true },
        undismiss: jest.fn(),
        show: jest.fn(),
        activateHighlighting: jest.fn(),
      };
      globalThis.HighlighterV2 = { rail };

      const replayCallback = getReplayCallback();

      replayCallback({ events: [{ type: 'shortcut' }] });
      await flushPromises();

      expect(rail.undismiss).toHaveBeenCalledWith();
      expect(rail.show).not.toHaveBeenCalled();
      expect(rail.activateHighlighting).toHaveBeenCalledWith();

      delete globalThis.HighlighterV2;
    });

    test('重放 shortcut 事件應等待 async rail reveal 後再啟動標註', async () => {
      const undismissDeferred = createDeferred();
      const rail = {
        stateManager: { isDismissed: true },
        undismiss: jest.fn(() => undismissDeferred.promise),
        activateHighlighting: jest.fn(),
      };
      globalThis.HighlighterV2 = { rail };

      const replayCallback = getReplayCallback();

      replayCallback({ events: [{ type: 'shortcut' }] });
      await flushPromises();

      expect(rail.undismiss).toHaveBeenCalledWith();
      expect(rail.activateHighlighting).not.toHaveBeenCalled();

      undismissDeferred.resolve();
      await flushPromises();

      expect(rail.activateHighlighting).toHaveBeenCalledWith();

      delete globalThis.HighlighterV2;
    });

    test('重放 shortcut 事件失敗時應記錄警告並繼續', async () => {
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(() => {
            throw new Error('shortcut failed');
          }),
          activateHighlighting: jest.fn(),
        },
      };

      const replayCallback = getReplayCallback();

      replayCallback({ events: [{ type: 'shortcut' }] });
      await flushPromises();

      expect(Logger.warn).toHaveBeenCalledWith(
        '重放快捷鍵事件失敗，繼續處理後續事件',
        expect.objectContaining({
          action: 'replayEvents',
          error: expect.objectContaining({ message: 'shortcut failed' }),
          safeRuntimeError: '重放快捷鍵事件失敗',
        })
      );
    });

    describe('SET_STABLE_URL', () => {
      beforeEach(() => {
        globalThis.__NOTION_STABLE_URL__ = undefined;
      });

      afterEach(() => {
        delete globalThis.__NOTION_STABLE_URL__;
      });

      test.each([
        ['應該接受帶有 query 參數的 URL', 'https://example.com/?p=123'],
        ['應該接受帶有具體路徑的 URL', 'https://example.com/posts/123/'],
      ])('%s', (_title, stableUrl) => {
        const { result, sendResponse } = dispatchAction('SET_STABLE_URL', { stableUrl });

        expect(result).toBe(true);
        expect(globalThis.__NOTION_STABLE_URL__).toBe(stableUrl);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      });

      test.each([
        {
          title: '應該拒絕純首頁（無路徑無 query）',
          stableUrl: 'https://example.com/',
          logMessage: '拒絕設置首頁 URL 為穩定 URL',
        },
        {
          title: '應該處理無效的 URL 字串',
          stableUrl: 'not-a-valid-url',
          logMessage: '拒絕設置無效 URL 為穩定 URL',
        },
      ])('$title', ({ stableUrl, logMessage }) => {
        globalThis.__NOTION_STABLE_URL__ = 'old-url';
        const { result, sendResponse } = dispatchAction('SET_STABLE_URL', { stableUrl });

        expect(result).toBe(true);
        expect(globalThis.__NOTION_STABLE_URL__).toBe('old-url'); // Unchanged
        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'INVALID_STABLE_URL',
        });
        expect(Logger.debug).toHaveBeenCalledWith(logMessage, expect.any(Object));
      });

      test('GET_STABLE_URL 應回傳目前 stableUrl', () => {
        globalThis.__NOTION_STABLE_URL__ = 'https://example.com/posts/123/';

        const { result, sendResponse } = dispatchAction('GET_STABLE_URL');

        expect(result).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({
          stableUrl: 'https://example.com/posts/123/',
        });
      });

      test('INIT_BUNDLE 應回傳 bundle ready 狀態與 bufferedEvents', () => {
        const { result, sendResponse } = dispatchAction('INIT_BUNDLE');

        expect(result).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({
          ready: true,
          bufferedEvents: expect.any(Number),
        });
      });
    });

    test('未知 action 應返回 false', () => {
      const sendResponse = jest.fn();

      const result = messageHandler({ action: 'UNKNOWN_ACTION' }, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('extractPageContent', () => {
    beforeEach(async () => {
      await prepareContentModuleMocks();
      extractPageContent = async (...args) => {
        const contentModule = await importContentEntrypoint();
        return contentModule.extractPageContent(...args);
      };
    });

    test('應該成功提取並轉換內容', async () => {
      mockReadabilityExtraction();

      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [{ type: 'image', image: { external: { url: 'img1' } } }],
        coverImage: 'https://example.com/cover.jpg',
        metrics: {
          candidateCount: 3,
          urlValidCount: 1,
          unknownSizeCount: 0,
          sizeResolveAttempted: 0,
          sizeResolveSuccess: 0,
          filteredBySize: 0,
          finalCount: 1,
          hasCoverImage: true,
          durationMs: 12,
        },
      });

      mergeUniqueImages.mockReturnValue([{ type: 'image', image: { external: { url: 'img1' } } }]);

      const result = await extractPageContent();

      expect(result.title).toBe('Test Title');
      expect(result.coverImage).toBe('https://example.com/cover.jpg');
      expect(result.extractionStatus).toBe('success');
      expect(result.debug.imageMetrics).toBeDefined();
      expect(result.debug.imageMetrics.candidateCount).toBe(3);
      expect(result.debug.imageMetrics.hasCoverImage).toBe(true);
      expect(result.debug.imageMetrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(Logger.info).toHaveBeenCalledWith('正在將內容轉換為 Notion 區塊', {
        action: 'extractPageContent',
        type: 'readability',
      });
      expect(Logger.info).toHaveBeenCalledWith('內容轉換完成', {
        action: 'extractPageContent',
        blockCount: 1,
      });
    });

    test.each([
      {
        title: '應該在圖片收集失敗時仍返回成功結果且 imageMetrics 為 null',
        arrangeImages: () => {
          ImageCollector.collectAdditionalImages.mockRejectedValue(
            new Error('Image collection failed')
          );
        },
      },
      {
        title: '應該在 imageResult 無 metrics 時 imageMetrics 為 null',
        arrangeImages: () => {
          ImageCollector.collectAdditionalImages.mockResolvedValue({
            images: [],
            coverImage: null,
          });
          mergeUniqueImages.mockReturnValue([]);
        },
      },
    ])('$title', async ({ arrangeImages }) => {
      mockReadabilityExtraction();
      arrangeImages();

      const result = await extractPageContent();

      expect(result.extractionStatus).toBe('success');
      expect(result.debug).toBeDefined();
      expect(result.debug.imageMetrics).toBeNull();
    });

    test('應該在正文無圖片時將首張額外圖片插入到開頭', async () => {
      mockReadabilityExtraction({
        content: '<div>No image</div>',
        title: 'No Image',
      });

      const leadImg = { type: 'image', image: { external: { url: 'lead-img' } } };
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [leadImg],
        coverImage: null,
      });

      mergeUniqueImages.mockReturnValue([leadImg]);

      const result = await extractPageContent();

      expect(result.blocks[0]).toEqual(leadImg);
      expect(Logger.log).toHaveBeenCalledWith(
        '正文無圖片，已將首張額外圖片插入文章開頭',
        expect.objectContaining({
          action: 'extractPageContent',
          hasLeadImage: true,
          sourceType: 'image',
        })
      );
      expect(Logger.log).not.toHaveBeenCalledWith(
        '正文無圖片，已將首張額外圖片插入文章開頭',
        expect.objectContaining({
          imageUrl: expect.any(String),
        })
      );
    });

    test('應優先使用預提取 blocks，並將 nextjs blocks 傳給 ImageCollector', async () => {
      const preExtractedBlocks = [
        { object: 'block', type: 'image' },
        { object: 'block', type: 'paragraph' },
      ];
      ContentExtractor.extractAsync.mockResolvedValue({
        content: '',
        type: 'nextjs',
        metadata: { title: 'Next.js Title' },
        blocks: preExtractedBlocks,
        debug: { complexity: 'low' },
      });
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
        metrics: { candidateCount: 0, finalCount: 0 },
      });
      mergeUniqueImages.mockReturnValue([]);

      const result = await extractPageContent();

      expect(ConverterFactory.getConverter).not.toHaveBeenCalled();
      expect(ImageCollector.collectAdditionalImages).toHaveBeenCalledWith(null, {
        nextJsBlocks: preExtractedBlocks,
        mainContentImageCount: 1,
      });
      expect(result.blocks).toEqual(preExtractedBlocks);
      expect(result.debug).toEqual(
        expect.objectContaining({
          contentType: 'nextjs',
          complexity: 'low',
          imageMetrics: { candidateCount: 0, finalCount: 0 },
        })
      );
      expect(Logger.info).toHaveBeenCalledWith('使用預提取的 Notion 區塊', {
        action: 'extractPageContent',
        type: 'nextjs',
        count: 2,
        imageCount: 1,
      });
    });

    test('應該在提取不到內容時返回後備區塊', async () => {
      ContentExtractor.extractAsync.mockResolvedValue({
        content: '',
        blocks: [],
      });

      const result = await extractPageContent();

      expect(result.blocks[0].paragraph.rich_text[0].text.content).toBe(
        '擷取內容失敗。頁面可能為空白或受保護。'
      );
      expect(result.extractionStatus).toBe('failed');
    });

    test('應該處理提取過程中的異常', async () => {
      ContentExtractor.extractAsync.mockRejectedValue(new Error('Unexpected crash'));

      const result = await extractPageContent();

      expect(result.blocks[0].paragraph.rich_text[0].text.content).toBe(
        '擷取發生錯誤，請稍後再試。'
      );
      expect(result).not.toHaveProperty('error');
      expect(result.title).toBe(CONTENT_QUALITY.DEFAULT_PAGE_TITLE);
      expect(JSON.stringify(result)).not.toContain('Unexpected crash');
      expect(result.extractionStatus).toBe('failed');
    });

    test('[REGRESSION] __UNIT_TESTING__ 模式載入時應自動暴露提取結果', async () => {
      globalThis.__UNIT_TESTING__ = true;
      delete globalThis.__notion_extraction_result;

      ContentExtractor.extractAsync.mockResolvedValue({
        content: '<div>Auto extract</div>',
        type: 'readability',
        metadata: { title: 'Auto Title' },
        blocks: [],
      });
      ConverterFactory.getConverter.mockReturnValue({
        convert: jest.fn().mockReturnValue([{ object: 'block', type: 'paragraph' }]),
        imageCount: 0,
      });
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
      });
      mergeUniqueImages.mockReturnValue([]);

      await loadContentEntrypoint({ resetMocks: false });
      await flushPromises();

      expect(globalThis.__notion_extraction_result).toEqual(
        expect.objectContaining({
          extractionStatus: 'success',
          title: 'Auto Title',
        })
      );

      delete globalThis.__UNIT_TESTING__;
      delete globalThis.__notion_extraction_result;
    });
  });

  describe('SHOW_TOAST handler', () => {
    let messageHandler;

    beforeEach(async () => {
      globalThis.chrome.runtime.onMessage.addListener = jest.fn();
      globalThis.chrome.runtime.sendMessage = jest.fn();

      ({ messageHandler } = await loadContentEntrypoint());
    });

    test('SHOW_TOAST 應呼叫 HighlighterV2.toast.show 並傳入 messageKey 與 level', () => {
      const showMock = jest.fn();
      globalThis.HighlighterV2 = { toast: { show: showMock } };
      const sendResponse = jest.fn();

      messageHandler(
        { action: 'SHOW_TOAST', messageKey: 'SYNC_FAILED_AUTH', level: 'error' },
        {},
        sendResponse
      );

      expect(showMock).toHaveBeenCalledWith('SYNC_FAILED_AUTH', { level: 'error' });
      delete globalThis.HighlighterV2;
    });

    test('SHOW_TOAST 在 toast 實例為 null 時 silent（不拋錯）', () => {
      globalThis.HighlighterV2 = { toast: null };
      const sendResponse = jest.fn();

      expect(() => {
        messageHandler(
          { action: 'SHOW_TOAST', messageKey: 'SYNC_FAILED_AUTH', level: 'error' },
          {},
          sendResponse
        );
      }).not.toThrow();

      delete globalThis.HighlighterV2;
    });
  });
});
