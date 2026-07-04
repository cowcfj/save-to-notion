/**
 * @jest-environment jsdom
 *
 * 驗證 scripts/content/index.js 在 __UNIT_TESTING__ 模式下的 IIFE 自動執行行為：
 * - 載入時應透過 IIFE 將 extractPageContent() 的結果寫入 globalThis.__notion_extraction_result
 * - 即使預先存在過期的擷取結果，也應被新結果覆寫
 *
 * 註：原本載入 dist/content.bundle.js（commit e32fc8b1 引入），但 production build
 * 會把 globalThis.__UNIT_TESTING__ 替換成字面量 false，導致 IIFE 被消除、測試靜默 timeout。
 * 還原為直接 require source，bundle 層的整合驗證交由 tests/integration/content/ 處理。
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const contentExtractorMock = {
  ContentExtractor: {
    extractAsync: jest.fn(),
  },
};
const converterFactoryMock = {
  ConverterFactory: {
    getConverter: jest.fn(),
  },
};
const imageCollectorMock = {
  ImageCollector: {
    collectAdditionalImages: jest.fn(),
  },
};
const imageUtilsMock = {
  mergeUniqueImages: jest.fn(),
};
const loggerMock = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
};
const loggerMockModule = {
  __esModule: true,
  default: loggerMock,
  ...loggerMock,
};
const entryAutoInitMock = {};

const moduleUrl = relativePath => new URL(relativePath, import.meta.url).href;

const contentExtractorModule = moduleUrl(
  '../../../../scripts/content/extractors/ContentExtractor.js'
);
const converterFactoryModule = moduleUrl(
  '../../../../scripts/content/converters/ConverterFactory.js'
);
const imageCollectorModule = moduleUrl(
  '../../../../scripts/content/extractors/ImageCollector.js'
);
const imageUtilsModule = moduleUrl('../../../../scripts/utils/imageUtils.js');
const loggerModule = moduleUrl('../../../../scripts/utils/Logger.js');
const entryAutoInitModule = moduleUrl('../../../../scripts/highlighter/entryAutoInit.js');
const contentEntrypointModule = moduleUrl('../../../../scripts/content/index.js');

async function registerContentScriptMocks() {
  const mocks = [
    [contentExtractorModule, contentExtractorMock],
    [converterFactoryModule, converterFactoryMock],
    [imageCollectorModule, imageCollectorMock],
    [imageUtilsModule, imageUtilsMock],
    [loggerModule, loggerMockModule],
    [entryAutoInitModule, entryAutoInitMock],
  ];

  for (const [specifier, moduleFactory] of mocks) {
    await jest.unstable_mockModule(specifier, () => moduleFactory);
  }
}

async function loadFreshDeps() {
  await registerContentScriptMocks();
  const { ContentExtractor } = await import(contentExtractorModule);
  const { ConverterFactory } = await import(converterFactoryModule);
  const { ImageCollector } = await import(imageCollectorModule);
  const { mergeUniqueImages } = await import(imageUtilsModule);
  return { ContentExtractor, ConverterFactory, ImageCollector, mergeUniqueImages };
}

function setupExtractionMocks(deps, title) {
  deps.ContentExtractor.extractAsync.mockResolvedValue({
    content: '<div>Test content</div>',
    type: 'readability',
    metadata: { title },
    blocks: [],
  });

  deps.ConverterFactory.getConverter.mockReturnValue({
    convert: jest.fn().mockReturnValue([{ object: 'block', type: 'paragraph' }]),
    imageCount: 0,
  });

  deps.ImageCollector.collectAdditionalImages.mockResolvedValue({
    images: [],
    coverImage: null,
    metrics: null,
  });

  deps.mergeUniqueImages.mockReturnValue([]);
}

describe('content script source IIFE auto-execution', () => {
  beforeEach(() => {
    jest.resetModules();

    globalThis.chrome = {
      runtime: {
        onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
        sendMessage: jest.fn(),
        lastError: null,
        getManifest: () => ({ version_name: 'dev' }),
      },
    };

    globalThis.__UNIT_TESTING__ = true;
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.__UNIT_TESTING__;
    delete globalThis.__notion_extraction_result;
    delete globalThis.__notion_extraction_promise;
    delete globalThis.__NOTION_BUNDLE_READY__;
    delete globalThis.HighlighterV2;
  });

  test('載入 source 後 IIFE 應透過 promise 暴露擷取結果', async () => {
    const deps = await loadFreshDeps();
    setupExtractionMocks(deps, 'Source Require Test');

    await import(contentEntrypointModule);

    const result = await globalThis.__notion_extraction_promise;

    expect(result).toBeDefined();
    expect(result.title).toBe('Source Require Test');
    expect(globalThis.__notion_extraction_result).toBe(result);
  });

  test('應該在存在過期的擷取結果時覆寫並啟動', async () => {
    const deps = await loadFreshDeps();
    setupExtractionMocks(deps, 'Fresh Result');
    globalThis.__notion_extraction_result = { title: 'stale-result' };

    await import(contentEntrypointModule);

    const result = await globalThis.__notion_extraction_promise;

    expect(result).toBeDefined();
    expect(result.title).toBe('Fresh Result');
    expect(globalThis.__notion_extraction_result).toBe(result);
  });
});
