const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('extract large list fallback (live gemini-cli page)', () => {
    // This test hits the live site; it's intended for local debugging and may be skipped in CI.
    test('should extract bulleted list items from the live gemini-cli docs page', async () => {
        const url = 'https://google-gemini.github.io/gemini-cli/docs/cli/';

        // Load the live page into JSDOM
        const dom = await JSDOM.fromURL(url, { runScripts: 'dangerously', resources: 'usable' });
        const { window } = dom;

        // Give the page some time to load dynamic content
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock Readability to return a short article so main path is rejected and our fallback is used
        window.Readability = function (doc) {
            return {
                parse: function () {
                    return { title: doc.title, content: '<p>short</p>', length: 10 };
                }
            };
        };

        // Ensure ImageUtils is present
        window.ImageUtils = {
            cleanImageUrl: url => url,
            isValidImageUrl: url => true,
            extractImageSrc: img => img && img.getAttribute ? (img.getAttribute('src') || '') : null,
            generateImageCacheKey: img => (img && img.getAttribute ? (img.getAttribute('src') || '') : '')
        };

        window.__UNIT_TESTING__ = true;

        // Inject our content script
        const scriptPath = path.resolve(__dirname, '../../../scripts/content.js');
        const scriptCode = fs.readFileSync(scriptPath, 'utf8');
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = scriptCode;
        window.document.body.appendChild(scriptEl);

        // Wait for content script to run (increased timeout for new dynamic loading logic)
        await new Promise(resolve => setTimeout(resolve, 2000));

        expect(window.__notion_extraction_result).toBeDefined();
        const blocks = window.__notion_extraction_result.blocks;
        expect(Array.isArray(blocks)).toBe(true);

        const bullets = blocks.filter(b => b.type === 'bulleted_list_item');
        // The live page contains many bulleted links; we expect at least a few to be extracted
        expect(bullets.length).toBeGreaterThanOrEqual(4);
    }, 20000);
});
