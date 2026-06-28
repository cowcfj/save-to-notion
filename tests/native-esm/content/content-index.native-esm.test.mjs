/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  cleanupGlobals,
  makeDefaultChrome,
  makeLoggerMock,
  installNoOpDOMParser,
  resetRuntimeListeners,
} from './contentLifecycleHarness.mjs';

const loggerMock = makeLoggerMock();

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

await jest.unstable_mockModule('../../../scripts/highlighter/entryAutoInit.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

await jest.unstable_mockModule('../../../scripts/content/extractors/ContentExtractor.js', () => ({
  ContentExtractor: {
    extractAsync: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../../scripts/content/converters/ConverterFactory.js', () => ({
  ConverterFactory: {
    getConverter: jest.fn(() => ({
      convert: jest.fn(() => []),
      imageCount: 0,
    })),
  },
}));

await jest.unstable_mockModule('../../../scripts/content/extractors/ImageCollector.js', () => ({
  ImageCollector: {
    collectAdditionalImages: jest.fn(async () => ({ images: [], coverImage: null, metrics: null })),
  },
}));

await jest.unstable_mockModule('../../../scripts/utils/imageUtils.js', () => ({
  mergeUniqueImages: jest.fn(() => []),
}));

await jest.unstable_mockModule('../../../scripts/content/runtimeMessageHandlers.js', () => ({
  createContentRuntimeMessageHandler: jest.fn(dependencies => (request, _sender, sendResponse) => {
    if (request?.action !== 'PING') {
      return false;
    }

    const preloaderCache = dependencies.getPreloaderCache();
    sendResponse({
      status: dependencies.isBundleReady() ? 'bundle_ready' : 'preloader_only',
      hasCache: Boolean(preloaderCache),
      hasPreloaderCache: Boolean(preloaderCache),
      nextRouteInfo: preloaderCache?.nextRouteInfo || null,
      shortlink: preloaderCache?.shortlink || null,
    });
    return true;
  }),
  activateFloatingRailHighlighting: jest.fn(),
}));

beforeEach(() => {
  jest.resetModules();
  cleanupGlobals();
  globalThis.chrome = makeDefaultChrome();
  globalThis.chrome.runtime.sendMessage = jest.fn();
  globalThis.chrome.sendMessage = globalThis.chrome.runtime.sendMessage;
  globalThis.__UNIT_TESTING__ = false;
  installNoOpDOMParser();
  resetRuntimeListeners();
  jest.spyOn(document, 'querySelector').mockReturnValue(null);
  jest.spyOn(document, 'addEventListener');
});

afterEach(() => {
  cleanupGlobals();
  delete globalThis.chrome;
  delete globalThis.__UNIT_TESTING__;
  jest.restoreAllMocks();
});

describe('content index native ESM', () => {
  test('registers PING listener and replay buffered events on import', async () => {
    const { chrome } = globalThis;

    chrome.sendMessage.mockImplementation((_msg, cb) => cb({ events: [{ type: 'shortcut' }] }));
    const preloaderHandler = jest.fn(event => {
      globalThis.__NOTION_PRELOADER_CACHE__ = event?.detail;
    });
    document.addEventListener('notion-preloader-response', preloaderHandler);

    await import('../../../scripts/content/index.js');

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0];
    const resp = jest.fn();
    const result = messageHandler({ action: 'PING' }, {}, resp);
    expect(result).toBe(true);

    expect(resp).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        hasCache: expect.any(Boolean),
      })
    );
    expect(chrome.sendMessage).toHaveBeenCalledWith(
      { action: 'REPLAY_BUFFERED_EVENTS' },
      expect.any(Function)
    );
  });

  test('exports extractPageContent and __UNIT_TESTING__ flow when enabled', async () => {
    const { ContentExtractor } =
      await import('../../../scripts/content/extractors/ContentExtractor.js');
    const { ConverterFactory } =
      await import('../../../scripts/content/converters/ConverterFactory.js');
    const { ImageCollector } =
      await import('../../../scripts/content/extractors/ImageCollector.js');

    ContentExtractor.extractAsync.mockResolvedValue({
      content: '<p>hello</p>',
      type: 'readability',
      metadata: { title: 'native esm' },
      blocks: [],
    });
    ConverterFactory.getConverter.mockReturnValue({
      convert: jest.fn(() => [{ object: 'block', type: 'paragraph' }]),
      imageCount: 0,
    });

    ImageCollector.collectAdditionalImages.mockResolvedValue({
      images: [],
      coverImage: null,
      metrics: null,
    });

    globalThis.__UNIT_TESTING__ = true;
    const imported = await import('../../../scripts/content/index.js');

    const result = await globalThis.__notion_extraction_promise;
    expect(imported.extractPageContent).toBeDefined();
    expect(result).toBeDefined();
    expect(result.extractionStatus).toBe('success');
    expect(globalThis.__notion_extraction_result).toBe(result);
  });
});
