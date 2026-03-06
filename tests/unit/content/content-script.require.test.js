/**
 * Require-style test: set up jsdom globals then require the content script file
 * so Jest's coverage instrumentation picks up content.js execution.
 */
const path = require('path');

describe('content script require test', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete globalThis.Readability;
    delete globalThis.ImageUtils;
    delete globalThis.chrome;
    if ('__UNIT_TESTING__' in globalThis) {
      delete globalThis.__UNIT_TESTING__;
    }
    if ('__notion_extraction_result' in globalThis) {
      delete globalThis.__notion_extraction_result;
    }
  });

  test('require scripts/content.js with jsdom globals', async () => {
    const html =
      '<!doctype html><html><head><title>Require Test</title></head><body><article><h1>Hi</h1><p>Some content to satisfy Readability.</p></article></body></html>';
    document.documentElement.innerHTML = html;

    // mocks
    globalThis.Readability = function (doc) {
      return { parse: () => ({ title: doc.title, content: '<p>Parsed</p>', length: 300 }) };
    };

    globalThis.ImageUtils = {
      cleanImageUrl: url => url,
      isValidImageUrl: (..._args) => true,
      extractImageSrc: img => (img?.getAttribute ? img.getAttribute('src') || '' : null),
      generateImageCacheKey: img => (img?.getAttribute ? img.getAttribute('src') || '' : ''),
    };

    // mark unit testing mode
    globalThis.__UNIT_TESTING__ = true;

    const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');

    // Ensure it's not cached
    delete require.cache[require.resolve(scriptPath)];

    // 載入此腳本 — 會立即執行並應設定 globalThis.__notion_extraction_result
    require(scriptPath);

    // allow async operations to complete
    // Wait for the script to complete with polling
    let result = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (globalThis.__notion_extraction_result) {
        result = globalThis.__notion_extraction_result;
        break;
      }
    }

    expect(result).toBeDefined();
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
  }, 10_000);

  test('應該在沒有過期的擷取結果時啟動', async () => {
    const html =
      '<!doctype html><html><head><title>Stale Result Test</title></head><body><article><h1>Hi</h1><p>Some content to satisfy Readability.</p></article></body></html>';
    document.documentElement.innerHTML = html;

    globalThis.Readability = function (doc) {
      return { parse: () => ({ title: doc.title, content: '<p>Parsed</p>', length: 300 }) };
    };

    globalThis.ImageUtils = {
      cleanImageUrl: url => url,
      isValidImageUrl: (..._args) => true,
      extractImageSrc: img => (img?.getAttribute ? img.getAttribute('src') || '' : null),
      generateImageCacheKey: img => (img?.getAttribute ? img.getAttribute('src') || '' : ''),
    };

    globalThis.__UNIT_TESTING__ = true;
    globalThis.__notion_extraction_result = { title: 'stale-result' };
    globalThis.chrome = require('../../mocks/chrome.js');

    const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');
    delete require.cache[require.resolve(scriptPath)];
    require(scriptPath);

    let result = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (globalThis.__notion_extraction_result?.title !== 'stale-result') {
        result = globalThis.__notion_extraction_result;
        break;
      }
    }

    expect(result).toBeDefined();
    expect(result.title).not.toBe('stale-result');
    expect(typeof result.title).toBe('string');
  });
});
