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
        const html = "<!doctype html><html><head><title>Require Test</title></head><body><article><h1>Hi</h1><p>Some content to satisfy Readability.</p></article></body></html>";
        const dom = new JSDOM(html);
        // expose globals
        global.window = dom.window;
        global.document = dom.window.document;
        global.navigator = dom.window.navigator;

        // mocks
        global.Readability = function (doc) {
            return { parse: () => ({ title: doc.title, content: '<p>Parsed</p>', length: 300 }) };
        };

        global.ImageUtils = {
            cleanImageUrl: url => url,
            isValidImageUrl: (..._args) => true,
            extractImageSrc: img => img?.getAttribute ? (img.getAttribute('src') || '') : null,
            generateImageCacheKey: img => (img?.getAttribute ? (img.getAttribute('src') || '') : '')
        };

        // mark unit testing mode
        global.window.__UNIT_TESTING__ = true;

        const scriptPath = path.resolve(__dirname, '../../../scripts/content.js');

        // Ensure it's not cached
        delete require.cache[require.resolve(scriptPath)];

        // Require the script — it runs immediately and should set window.__notion_extraction_result
        require(scriptPath);

        // allow async operations to complete
        // Wait for the script to complete with polling
        let result;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (global.window.__notion_extraction_result) {
                result = global.window.__notion_extraction_result;
                break;
            }
        }

        expect(result).toBeDefined();
        expect(typeof result.title).toBe('string');
        expect(result.title.length).toBeGreaterThan(0);
        // cleanup
        delete global.window;
        delete global.document;
        delete global.navigator;
    }, 10000);
});
