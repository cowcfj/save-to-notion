/**
 * Integration-style test that loads scripts/content.js inside jsdom with
 * minimal mocks (Readability, ImageUtils) and asserts that it produces a
 * valid extraction result exposed to window.__notion_extraction_result.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('content script integration test', () => {
    test('runs content.js and exposes result when window.__UNIT_TESTING__ is true', async () => {
        const html = `<!doctype html><html><head><title>Test Page</title></head><body><article><h1>Heading</h1><p>This is some long article content that should be picked up by Readability.</p></article></body></html>`;

        const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });
        const { window } = dom;

        // Minimal Readability mock that returns an object with parsed content
        window.Readability = function (doc) {
            return {
                parse: function () {
                    return { title: doc.title, content: '<p>Mock content</p>', length: 300 };
                }
            };
        };

        // Ensure ImageUtils is present (content.js will provide fallback if missing)
        window.ImageUtils = {
            cleanImageUrl: url => url,
            isValidImageUrl: url => true,
            extractImageSrc: img => img && img.getAttribute ? (img.getAttribute('src') || '') : null,
            generateImageCacheKey: img => (img && img.getAttribute ? (img.getAttribute('src') || '') : '')
        };

        // Indicate unit testing mode so content.js exposes result to window
        window.__UNIT_TESTING__ = true;

        // Load the script file content and evaluate it in the window
        const scriptPath = path.resolve(__dirname, '../../../scripts/content.js');
        const scriptCode = fs.readFileSync(scriptPath, 'utf8');

        // Evaluate the content script inside the jsdom window
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = scriptCode;
        window.document.body.appendChild(scriptEl);

        // Wait for the script to execute and set window.__notion_extraction_result with polling
        let result;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            if (window.__notion_extraction_result) {
                result = window.__notion_extraction_result;
                break;
            }
        }

        expect(result).toBeDefined();
        expect(result.title).toBe('Test Page');
        expect(Array.isArray(result.blocks)).toBe(true);
    }, 10000);
});
