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
    ({ activateFloatingRailHighlighting, createContentRuntimeMessageHandler } = await import(
      '../../../scripts/content/runtimeMessageHandlers.js'
    ));
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

    expect(handler({ action: HIGHLIGHTER_ACTIONS.SHOW_HIGHLIGHTER }, {}, response)).toBe(true);
    expect(dependencies.withAvailableFloatingRail).toHaveBeenCalledWith(
      response,
      dependencies.revealFloatingRail
    );

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
    warn: jest.fn(),
    error: jest.fn(),
  };
  const runtimeHandlerMock = jest.fn((_request, _sender, sendResponse) => {
    sendResponse({ status: 'bundle_ready' });
    return true;
  });
  const createRuntimeHandlerMock = jest.fn(() => runtimeHandlerMock);
  const entryAutoInitMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
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
    delete globalThis.__NOTION_BUNDLE_READY__;
    delete globalThis.__NOTION_PRELOADER_CACHE__;
    jest.restoreAllMocks();
  });

  test('registers the runtime handler and requests buffered event replay', async () => {
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
        ContentExtractor: { extractAsync: jest.fn() },
      })
    );
    await jest.unstable_mockModule(
      '../../../scripts/content/converters/ConverterFactory.js',
      () => ({
        ConverterFactory: { getConverter: jest.fn() },
      })
    );
    await jest.unstable_mockModule('../../../scripts/content/extractors/ImageCollector.js', () => ({
      ImageCollector: { collectAdditionalImages: jest.fn() },
    }));
    await jest.unstable_mockModule('../../../scripts/utils/imageUtils.js', () => ({
      mergeUniqueImages: jest.fn(() => []),
    }));
    await jest.unstable_mockModule('../../../scripts/content/runtimeMessageHandlers.js', () => ({
      createContentRuntimeMessageHandler: createRuntimeHandlerMock,
      activateFloatingRailHighlighting: jest.fn(),
    }));

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
});
