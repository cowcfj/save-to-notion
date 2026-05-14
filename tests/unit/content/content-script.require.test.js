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

jest.mock('../../../scripts/content/extractors/ContentExtractor.js');
jest.mock('../../../scripts/content/converters/ConverterFactory.js');
jest.mock('../../../scripts/content/extractors/ImageCollector.js');
jest.mock('../../../scripts/utils/imageUtils.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
}));

function requireFreshDeps() {
  const { ContentExtractor } = require('../../../scripts/content/extractors/ContentExtractor.js');
  const { ConverterFactory } = require('../../../scripts/content/converters/ConverterFactory.js');
  const { ImageCollector } = require('../../../scripts/content/extractors/ImageCollector.js');
  const { mergeUniqueImages } = require('../../../scripts/utils/imageUtils.js');
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

async function waitForResult(predicate, { intervalMs = 20, maxAttempts = 100 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    const value = predicate();
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
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
    delete globalThis.__NOTION_BUNDLE_READY__;
    delete globalThis.HighlighterV2;
  });

  test('載入 source 後 IIFE 應寫入 __notion_extraction_result', async () => {
    const deps = requireFreshDeps();
    setupExtractionMocks(deps, 'Source Require Test');

    require('../../../scripts/content/index.js');

    const result = await waitForResult(() => globalThis.__notion_extraction_result);

    expect(result).toBeDefined();
    expect(result.title).toBe('Source Require Test');
  }, 5000);

  test('應該在存在過期的擷取結果時覆寫並啟動', async () => {
    const deps = requireFreshDeps();
    setupExtractionMocks(deps, 'Fresh Result');
    globalThis.__notion_extraction_result = { title: 'stale-result' };

    require('../../../scripts/content/index.js');

    const result = await waitForResult(() =>
      globalThis.__notion_extraction_result?.title === 'stale-result'
        ? undefined
        : globalThis.__notion_extraction_result
    );

    expect(result).toBeDefined();
    expect(result.title).toBe('Fresh Result');
  }, 5000);
});
