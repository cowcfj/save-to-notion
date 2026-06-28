/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanupGlobals, makeDefaultChrome, makeLoggerMock } from './contentLifecycleHarness.mjs';

const loggerMock = makeLoggerMock();

await jest.unstable_mockModule('../../../scripts/highlighter/entryAutoInit.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

await jest.unstable_mockModule(
  '../../../scripts/highlighter/utils/floatingRailAvailability.js',
  () => ({
    formatRuntimeErrorMessage: jest.fn((_error, fallback) => fallback),
    revealFloatingRail: jest.fn(),
    withAvailableFloatingRail: jest.fn(),
  })
);

beforeEach(() => {
  jest.resetModules();
  cleanupGlobals();
  globalThis.chrome = makeDefaultChrome();
  globalThis.__UNIT_TESTING__ = true;
  globalThis.__NOTION_PRELOADER_CACHE__ = {
    article: {},
    timestamp: Date.now(),
  };

  jest.spyOn(document, 'querySelector').mockReturnValue(null);
  jest.unstable_mockModule('../../../scripts/content/extractors/ContentExtractor.js', () => ({
    ContentExtractor: {
      extractAsync: jest.fn().mockResolvedValue({
        content: '<p>x</p>',
        type: 'readability',
        metadata: { title: 'Title' },
        blocks: [],
      }),
    },
  }));
  jest.unstable_mockModule('../../../scripts/content/converters/ConverterFactory.js', () => ({
    ConverterFactory: {
      getConverter: jest.fn(() => ({
        convert: jest.fn(() => [{ object: 'block', type: 'paragraph' }]),
        imageCount: 0,
      })),
    },
  }));
  jest.unstable_mockModule('../../../scripts/content/extractors/ImageCollector.js', () => ({
    ImageCollector: {
      collectAdditionalImages: jest.fn(async () => ({
        images: [],
        coverImage: null,
        metrics: null,
      })),
    },
  }));
  jest.unstable_mockModule('../../../scripts/utils/imageUtils.js', () => ({
    mergeUniqueImages: jest.fn(() => []),
  }));

  jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
    default: loggerMock,
  }));
});

afterEach(() => {
  cleanupGlobals();
  delete globalThis.chrome;
  delete globalThis.__UNIT_TESTING__;
  delete globalThis.__NOTION_PRELOADER_CACHE__;
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('content script require native ESM', () => {
  test('native ESM require-like import can run extraction auto-execution', async () => {
    const preloaderHandler = event => {
      event?.detail;
    };
    document.addEventListener('notion-preloader-response', preloaderHandler);

    const ContentExtractor =
      await import('../../../scripts/content/extractors/ContentExtractor.js');
    const ConverterFactory =
      await import('../../../scripts/content/converters/ConverterFactory.js');
    const ImageCollector = await import('../../../scripts/content/extractors/ImageCollector.js');

    ContentExtractor.ContentExtractor.extractAsync.mockResolvedValue({
      content: '<div>hello</div>',
      type: 'readability',
      metadata: { title: 'Hello' },
      blocks: [],
    });
    ConverterFactory.ConverterFactory.getConverter.mockReturnValue({
      convert: jest.fn(() => [{ object: 'block', type: 'paragraph' }]),
      imageCount: 0,
    });
    ImageCollector.ImageCollector.collectAdditionalImages.mockResolvedValue({
      images: [],
      coverImage: null,
      metrics: null,
    });

    const module = await import('../../../scripts/content/index.js');

    document.dispatchEvent(
      new CustomEvent('notion-preloader-response', {
        detail: {
          ...globalThis.__NOTION_PRELOADER_CACHE__,
          shortlink: 'https://x',
          nextRouteInfo: null,
        },
      })
    );

    const result = await globalThis.__notion_extraction_promise;
    expect(result).toBeDefined();
    expect(module.extractPageContent).toBeDefined();
    expect(result).toEqual(expect.objectContaining({ extractionStatus: 'success' }));
  });
});
