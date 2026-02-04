/**
 * Require-style test: set up jsdom globals then require the content script file
 * so Jest's coverage instrumentation picks up content.js execution.
 */
const { JSDOM } = require('jsdom');
const path = require('path');

describe('content script require test', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('require scripts/content.js with jsdom globals', async () => {
    const html =
      '<!doctype html><html><head><title>Require Test</title></head><body><article><h1>Hi</h1><p>Some content to satisfy Readability.</p></article></body></html>';
    const dom = new JSDOM(html);
    // expose globals
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;

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
    globalThis.window.__UNIT_TESTING__ = true;

    const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');

    // Ensure it's not cached
    delete require.cache[require.resolve(scriptPath)];

    // Require the script — it runs immediately and should set window.__notion_extraction_result
    require(scriptPath);

    // allow async operations to complete
    // Wait for the script to complete with polling
    let result = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (globalThis.window.__notion_extraction_result) {
        result = globalThis.window.__notion_extraction_result;
        break;
      }
    }

    expect(result).toBeDefined();
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    // cleanup
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
  }, 10_000);
});
