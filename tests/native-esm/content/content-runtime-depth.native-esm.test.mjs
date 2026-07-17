/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { CONTENT_BRIDGE_ACTIONS } from '../../../scripts/config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../../../scripts/config/runtimeActions/highlighterActions.js';

describe('content runtime message handler native ESM depth coverage', () => {
  let activateFloatingRailHighlighting;
  let createContentRuntimeMessageHandler;
  let dependencies;
  let logger;
  let stableUrl;

  beforeEach(async () => {
    ({ activateFloatingRailHighlighting, createContentRuntimeMessageHandler } =
      await import('../../../scripts/content/runtimeMessageHandlers.js'));
    stableUrl = undefined;
    logger = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    dependencies = {
      getPreloaderCache: jest.fn(() => ({
        nextRouteInfo: { page: '/posts/[slug]' },
        shortlink: 'https://example.com/?p=1',
      })),
      isBundleReady: jest.fn(() => true),
      getStableUrl: jest.fn(() => stableUrl),
      setStableUrl: jest.fn(value => {
        stableUrl = value;
      }),
      getHighlighterRuntime: jest.fn(() => ({
        toast: { show: jest.fn() },
        manager: { removeHighlight: jest.fn(() => true) },
      })),
      logger,
      withAvailableFloatingRail: jest.fn((sendResponse, action, options) => {
        action?.({ activateHighlighting: jest.fn() });
        sendResponse({ success: true, options });
      }),
      revealFloatingRail: jest.fn(),
    };
  });

  test('dispatches known actions and ignores malformed or unknown messages', () => {
    const handler = createContentRuntimeMessageHandler(dependencies);
    const response = jest.fn();

    expect(handler(null, {}, response)).toBe(false);
    expect(handler({ action: 'UNKNOWN' }, {}, response)).toBe(false);

    expect(handler({ action: CONTENT_BRIDGE_ACTIONS.PING }, {}, response)).toBe(true);
    expect(response).toHaveBeenLastCalledWith({
      status: 'bundle_ready',
      hasCache: true,
      hasPreloaderCache: true,
      nextRouteInfo: { page: '/posts/[slug]' },
      shortlink: 'https://example.com/?p=1',
    });

    expect(handler({ action: CONTENT_BRIDGE_ACTIONS.INIT_BUNDLE }, {}, response)).toBe(true);
    expect(response).toHaveBeenLastCalledWith({ ready: true, bufferedEvents: 0 });
  });

  test('handles floating rail, toast, remove highlight, and stable URL actions', () => {
    const runtime = {
      toast: { show: jest.fn() },
      manager: { removeHighlight: jest.fn(() => false) },
    };
    dependencies.getHighlighterRuntime.mockReturnValue(runtime);
    const handler = createContentRuntimeMessageHandler(dependencies);
    const response = jest.fn();

    expect(
      handler(
        { action: HIGHLIGHTER_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT, sessionOverride: true },
        {},
        response
      )
    ).toBe(true);
    expect(dependencies.withAvailableFloatingRail).toHaveBeenLastCalledWith(
      response,
      expect.any(Function),
      { sessionOverride: true }
    );

    expect(
      handler(
        { action: CONTENT_BRIDGE_ACTIONS.SHOW_TOAST, messageKey: 'saved', level: 'info' },
        {},
        response
      )
    ).toBe(false);
    expect(runtime.toast.show).toHaveBeenCalledWith('saved', { level: 'info' });

    expect(
      handler({ action: HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM, highlightId: 'h1' }, {}, response)
    ).toBe(true);
    expect(response).toHaveBeenLastCalledWith({ success: false });

    expect(
      handler(
        { action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, stableUrl: 'https://example.com/post' },
        {},
        response
      )
    ).toBe(true);
    expect(dependencies.setStableUrl).toHaveBeenCalledWith('https://example.com/post');
    expect(response).toHaveBeenLastCalledWith({ success: true });

    expect(handler({ action: CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL }, {}, response)).toBe(true);
    expect(response).toHaveBeenLastCalledWith({ stableUrl: 'https://example.com/post' });
  });

  test('returns guarded responses for unavailable highlighter, removal failures, and invalid stable URLs', () => {
    const handler = createContentRuntimeMessageHandler(dependencies);
    const response = jest.fn();

    dependencies.getHighlighterRuntime.mockReturnValueOnce(null);
    expect(
      handler(
        { action: HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM, highlightId: 'missing' },
        {},
        response
      )
    ).toBe(true);
    expect(response).toHaveBeenLastCalledWith({
      success: false,
      error: 'Highlighter 尚未初始化',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Highlighter 尚未初始化，略過移除標註 DOM',
      expect.objectContaining({ result: 'uninitialized' })
    );

    dependencies.getHighlighterRuntime.mockReturnValueOnce({
      manager: {
        removeHighlight: jest.fn(() => {
          throw new Error('remove failed');
        }),
      },
    });
    expect(
      handler(
        { action: HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM, highlightId: 'boom' },
        {},
        response
      )
    ).toBe(true);
    expect(response).toHaveBeenLastCalledWith({ success: false, error: 'remove failed' });
    expect(logger.error).toHaveBeenCalledWith(
      '移除標註 DOM 失敗',
      expect.objectContaining({ result: 'failed' })
    );

    expect(
      handler(
        { action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, stableUrl: 'https://example.com/' },
        {},
        response
      )
    ).toBe(true);
    expect(response).toHaveBeenLastCalledWith({ success: false, error: 'INVALID_STABLE_URL' });

    expect(
      handler(
        { action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, stableUrl: 'not a url' },
        {},
        response
      )
    ).toBe(true);
    expect(response).toHaveBeenLastCalledWith({ success: false, error: 'INVALID_STABLE_URL' });
  });

  test('activates floating rail after sync or async reveal and rejects missing activation method', async () => {
    const rail = { activateHighlighting: jest.fn() };
    const revealFloatingRail = jest.fn();
    activateFloatingRailHighlighting(rail, { revealFloatingRail });
    expect(revealFloatingRail).toHaveBeenCalledWith(rail);
    expect(rail.activateHighlighting).toHaveBeenCalledTimes(1);

    const asyncRail = { activateHighlighting: jest.fn() };
    const asyncReveal = jest.fn(() => Promise.resolve());
    await activateFloatingRailHighlighting(asyncRail, { revealFloatingRail: asyncReveal });
    expect(asyncRail.activateHighlighting).toHaveBeenCalledTimes(1);

    expect(() => activateFloatingRailHighlighting({}, { revealFloatingRail })).toThrow(
      '浮動側欄缺少 activateHighlighting() 方法'
    );
  });
});

describe('content index listener native ESM depth coverage', () => {
  const loggerMock = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const runtimeHandlerMock = jest.fn((_request, _sender, sendResponse) => {
    sendResponse({ status: 'bundle_ready' });
    return true;
  });
  const createRuntimeHandlerMock = jest.fn(() => runtimeHandlerMock);
  const entryAutoInitMock = jest.fn();
  const activateFloatingRailHighlightingMock = jest.fn();
  const contentExtractorMock = { extractAsync: jest.fn() };
  const converterMock = { convert: jest.fn(), imageCount: 0 };
  const converterFactoryMock = { getConverter: jest.fn(() => converterMock) };
  const imageCollectorMock = { collectAdditionalImages: jest.fn() };
  const mergeUniqueImagesMock = jest.fn(() => []);

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    contentExtractorMock.extractAsync.mockReset();
    converterMock.convert.mockReset();
    converterMock.imageCount = 0;
    converterFactoryMock.getConverter.mockClear();
    imageCollectorMock.collectAdditionalImages.mockReset();
    mergeUniqueImagesMock.mockReset().mockReturnValue([]);
    activateFloatingRailHighlightingMock.mockReset();
    globalThis.chrome = {
      runtime: {
        onMessage: { addListener: jest.fn() },
        sendMessage: jest.fn((_message, callback) => callback?.({ events: [] })),
        lastError: null,
      },
    };
    globalThis.chrome.sendMessage = globalThis.chrome.runtime.sendMessage;
    document.body.innerHTML = '';
    jest.spyOn(document, 'dispatchEvent');
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.HighlighterV2;
    delete globalThis.__NOTION_BUNDLE_READY__;
    delete globalThis.__NOTION_PRELOADER_CACHE__;
    delete globalThis.__NOTION_STABLE_URL__;
    jest.restoreAllMocks();
  });

  async function mockContentIndexDependencies() {
    await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
      __esModule: true,
      default: loggerMock,
      ...loggerMock,
    }));
    await jest.unstable_mockModule('../../../scripts/highlighter/entryAutoInit.js', () => ({
      __esModule: true,
      default: entryAutoInitMock,
    }));
    await jest.unstable_mockModule(
      '../../../scripts/content/extractors/ContentExtractor.js',
      () => ({
        ContentExtractor: contentExtractorMock,
      })
    );
    await jest.unstable_mockModule(
      '../../../scripts/content/converters/ConverterFactory.js',
      () => ({
        ConverterFactory: converterFactoryMock,
      })
    );
    await jest.unstable_mockModule('../../../scripts/content/extractors/ImageCollector.js', () => ({
      ImageCollector: imageCollectorMock,
    }));
    await jest.unstable_mockModule('../../../scripts/utils/imageUtils.js', () => ({
      mergeUniqueImages: mergeUniqueImagesMock,
    }));
    await jest.unstable_mockModule('../../../scripts/content/runtimeMessageHandlers.js', () => ({
      createContentRuntimeMessageHandler: createRuntimeHandlerMock,
      activateFloatingRailHighlighting: activateFloatingRailHighlightingMock,
    }));
  }

  async function importContentIndex() {
    await mockContentIndexDependencies();
    return import('../../../scripts/content/index.js');
  }

  test('registers the runtime handler and requests buffered event replay', async () => {
    await mockContentIndexDependencies();

    await import('../../../scripts/content/index.js');

    expect(globalThis.__NOTION_BUNDLE_READY__).toBe(true);
    expect(createRuntimeHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        getPreloaderCache: expect.any(Function),
        isBundleReady: expect.any(Function),
        getStableUrl: expect.any(Function),
        setStableUrl: expect.any(Function),
      })
    );
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(runtimeHandlerMock);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { action: CONTENT_BRIDGE_ACTIONS.REPLAY_BUFFERED_EVENTS },
      expect.any(Function)
    );
  });

  test('stores preloader cache responses and exposes stable URL dependency wiring', async () => {
    const preloaderCache = {
      article: document.createElement('article'),
      mainContent: document.createElement('main'),
      timestamp: Date.now(),
    };
    document.addEventListener(
      'notion-preloader-request',
      () => {
        document.dispatchEvent(
          new CustomEvent('notion-preloader-response', { detail: preloaderCache })
        );
      },
      { once: true }
    );

    await importContentIndex();

    expect(globalThis.__NOTION_PRELOADER_CACHE__).toBe(preloaderCache);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      '偵測到 Preloader 快取',
      expect.objectContaining({
        action: 'initializeContentBundle',
        hasArticle: true,
        hasMainContent: true,
      })
    );

    const runtimeDependencies = createRuntimeHandlerMock.mock.calls[0][0];
    runtimeDependencies.setStableUrl('https://example.com/stable');
    expect(runtimeDependencies.getStableUrl()).toBe('https://example.com/stable');
    expect(runtimeDependencies.getPreloaderCache()).toBe(preloaderCache);
  });

  test('replays shortcut buffered events through the floating rail and logs replay failures', async () => {
    const rail = { activateHighlighting: jest.fn() };
    globalThis.HighlighterV2 = { rail };
    chrome.runtime.sendMessage
      .mockImplementationOnce((_message, callback) => {
        callback?.({ events: [{ type: 'shortcut' }] });
      })
      .mockImplementationOnce((_message, callback) => {
        callback?.({ events: [{ type: 'shortcut' }] });
      });
    activateFloatingRailHighlightingMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('replay failed'));

    await importContentIndex();
    await Promise.resolve();

    expect(activateFloatingRailHighlightingMock).toHaveBeenCalledWith(rail);
    expect(loggerMock.log).toHaveBeenCalledWith(
      '重放快捷鍵事件，啟動浮動側欄標註',
      expect.objectContaining({ action: 'replayEvents', result: 'started' })
    );

    jest.resetModules();
    await importContentIndex();
    await Promise.resolve();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      '重放快捷鍵事件失敗，繼續處理後續事件',
      expect.objectContaining({
        action: 'replayEvents',
        result: 'failed',
        safeRuntimeError: expect.any(String),
      })
    );
  });

  test('ignores replay callback runtime lastError without processing buffered events', async () => {
    chrome.runtime.lastError = { message: 'context invalidated' };
    chrome.runtime.sendMessage.mockImplementationOnce((_message, callback) => {
      callback?.({ events: [{ type: 'shortcut' }] });
    });
    globalThis.HighlighterV2 = { rail: { activateHighlighting: jest.fn() } };

    await importContentIndex();
    await Promise.resolve();

    expect(activateFloatingRailHighlightingMock).not.toHaveBeenCalled();
  });

  test('returns empty and error fallback extraction results', async () => {
    document.title = 'Fallback title';
    contentExtractorMock.extractAsync.mockResolvedValueOnce({
      content: '',
      type: 'html',
      metadata: {},
      blocks: [],
    });
    let { extractPageContent } = await importContentIndex();

    await expect(extractPageContent()).resolves.toEqual(
      expect.objectContaining({
        extractionStatus: 'failed',
        title: 'Fallback title',
        additionalImages: [],
        coverImage: null,
        blocks: [
          expect.objectContaining({
            type: 'paragraph',
            paragraph: expect.objectContaining({
              rich_text: [
                expect.objectContaining({
                  text: expect.objectContaining({ content: expect.any(String) }),
                }),
              ],
            }),
          }),
        ],
      })
    );

    jest.resetModules();
    contentExtractorMock.extractAsync.mockRejectedValueOnce(new Error('extract failed'));
    ({ extractPageContent } = await importContentIndex());

    await expect(extractPageContent()).resolves.toEqual(
      expect.objectContaining({
        extractionStatus: 'failed',
        title: 'Fallback title',
        additionalImages: [],
        coverImage: null,
      })
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      '內容提取發生異常',
      expect.objectContaining({ action: 'extractPageContent', result: 'failed' })
    );
  });

  test('uses pre-extracted blocks, promotes a lead image, and handles image collection failure', async () => {
    const preExtractedBlocks = [{ object: 'block', type: 'paragraph' }];
    const leadImage = { object: 'block', type: 'image', image: { external: { url: 'photo.jpg' } } };
    contentExtractorMock.extractAsync.mockResolvedValueOnce({
      content: '<article><p>Hello</p></article>',
      type: 'html',
      metadata: { title: 'Article' },
      blocks: preExtractedBlocks,
      debug: { complexity: 'low' },
    });
    imageCollectorMock.collectAdditionalImages.mockResolvedValueOnce({
      images: [leadImage],
      coverImage: 'cover.jpg',
      metrics: { scanned: 1 },
    });
    mergeUniqueImagesMock.mockReturnValueOnce([leadImage]);
    let { extractPageContent } = await importContentIndex();

    await expect(extractPageContent()).resolves.toEqual(
      expect.objectContaining({
        extractionStatus: 'success',
        title: 'Article',
        blocks: [leadImage, ...preExtractedBlocks],
        additionalImages: [],
        coverImage: 'cover.jpg',
      })
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      '使用預提取的 Notion 區塊',
      expect.objectContaining({ count: 1, imageCount: 0 })
    );
    expect(loggerMock.log).toHaveBeenCalledWith(
      '正文無圖片，已將首張額外圖片插入文章開頭',
      expect.objectContaining({ hasLeadImage: true })
    );

    jest.resetModules();
    contentExtractorMock.extractAsync.mockResolvedValueOnce({
      content: '<article><p>Hello</p></article>',
      type: 'html',
      metadata: { title: 'Article' },
      blocks: [],
      debug: {},
    });
    converterMock.convert.mockReturnValueOnce([{ object: 'block', type: 'paragraph' }]);
    converterMock.imageCount = 0;
    imageCollectorMock.collectAdditionalImages.mockRejectedValueOnce(new Error('images failed'));
    ({ extractPageContent } = await importContentIndex());

    await expect(extractPageContent()).resolves.toEqual(
      expect.objectContaining({
        extractionStatus: 'success',
        additionalImages: [],
        coverImage: null,
        debug: expect.objectContaining({ imageMetrics: null }),
      })
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '圖片收集失敗',
      expect.objectContaining({ action: 'extractPageContent', result: 'failed' })
    );
  });
});
