/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanupGlobals, makeDefaultChrome, makeLoggerMock } from './contentLifecycleHarness.mjs';

const loggerMock = makeLoggerMock();

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/highlighter/entryAutoInit.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

await jest.unstable_mockModule(
  '../../../scripts/highlighter/utils/floatingRailAvailability.js',
  () => ({
    formatRuntimeErrorMessage: jest.fn((_error, fallback) => fallback),
    revealFloatingRail: jest.fn(),
    withAvailableFloatingRail: jest.fn((sendResponse = jest.fn()) => {
      sendResponse({ success: false, error: 'unavailable' });
      return true;
    }),
  })
);

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

let preloaderHandler;

function findPingHandler() {
  const handlers = globalThis.chrome.runtime.onMessage.addListener.mock.calls.map(call => call[0]);
  return handlers.find(handler => {
    const sendResponse = jest.fn();
    const result = handler({ action: 'PING' }, {}, sendResponse);
    return result === true && sendResponse.mock.calls.length > 0;
  });
}

beforeEach(async () => {
  jest.resetModules();
  cleanupGlobals();

  globalThis.chrome = makeDefaultChrome();
  globalThis.__NOTION_PRELOADER_CACHE__ = {
    article: { title: 'X' },
    timestamp: Date.now(),
    shortlink: 'https://example.com/?p=12',
    nextRouteInfo: { page: '/test' },
  };

  preloaderHandler = () => {
    document.dispatchEvent(
      new CustomEvent('notion-preloader-response', {
        detail: globalThis.__NOTION_PRELOADER_CACHE__,
      })
    );
  };
  document.addEventListener('notion-preloader-request', preloaderHandler);

  await import('../../../scripts/content/index.js');
});

afterEach(() => {
  document.removeEventListener('notion-preloader-request', preloaderHandler);
  cleanupGlobals();
  delete globalThis.chrome;
  delete globalThis.__NOTION_PRELOADER_CACHE__;
  jest.restoreAllMocks();
});

describe('content ping native ESM', () => {
  test('returns bundle_ready and preloader cache fields', () => {
    const handler = findPingHandler();
    expect(typeof handler).toBe('function');

    const sendResponse = jest.fn();
    const result = handler({ action: 'PING' }, {}, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'bundle_ready',
        shortlink: 'https://example.com/?p=12',
        nextRouteInfo: { page: '/test' },
      })
    );
  });

  test('returns false for unknown action', () => {
    const handler = findPingHandler();
    expect(typeof handler).toBe('function');

    const sendResponse = jest.fn();
    const result = handler({ action: 'UNKNOWN' }, {}, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
