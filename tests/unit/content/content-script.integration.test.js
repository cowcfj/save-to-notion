/**
 * Integration-style test that loads scripts/content.js inside jsdom with
 * minimal mocks (Readability, ImageUtils) and asserts that it produces a
 * valid extraction result exposed to window.__notion_extraction_result.
 */
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

describe('content script integration test', () => {
  // Ensure bundle exists before running tests
  beforeAll(() => {
    const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');
    if (!fs.existsSync(scriptPath)) {
      console.log('⚠️ Content bundle not found. Building it now for integration test...');
      try {
        // Execute build command in project root
        // eslint-disable-next-line sonarjs/no-os-command-from-path
        execSync('npm run build:content', {
          stdio: 'inherit',
          cwd: path.resolve(__dirname, '../../../'),
          shell: true,
        });
        console.log('✅ Content bundle built successfully.');
      } catch (error) {
        console.error('❌ Failed to build content bundle:', error);
        throw error;
      }
    }
  }, 60_000); // Increase timeout for build

  test('runs content.js and exposes result when window.__UNIT_TESTING__ is true', async () => {
    const html =
      '<!doctype html><html><head><title>Test Page</title></head><body><article><h1>Heading</h1><p>This is some long article content that should be picked up by Readability.</p></article></body></html>';

    const virtualConsole = new jsdom.VirtualConsole();
    // 新版 jsdom 的 VirtualConsole 使用 on() 而非 sendTo()
    virtualConsole.on('error', () => {
      // 忽略虛擬控制台錯誤
    });

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
      virtualConsole,
    });
    const { window } = dom;

    // Inject chrome mock into JSDOM window to enable Logger
    window.chrome = {
      runtime: {
        id: 'test-extension-id',
        getManifest: () => ({ version: '1.0.0-dev' }), // Enable debug logs
        sendMessage: jest.fn(),
        onMessage: { addListener: jest.fn() },
      },
      storage: {
        sync: {
          get: (keys, cb) => {
            const result = {};
            cb(result);
          },
          onChanged: { addListener: jest.fn() },
        },
      },
    };

    // Minimal Readability mock that returns an object with parsed content
    window.Readability = function (doc) {
      // Null 安全：使用傳入的 doc 或 fallback 到 window.document
      const safeDoc = doc || window.document;

      return {
        parse() {
          return {
            title: safeDoc.title || 'Test Page',
            content: '<p>Mock content</p>',
            length: 300,
          };
        },
      };
    };

    // Ensure ImageUtils is present (content.js will provide fallback if missing)
    window.ImageUtils = {
      cleanImageUrl: url => url,
      isValidImageUrl: (..._args) => true,
      extractImageSrc: img => (img?.getAttribute ? img.getAttribute('src') || '' : null),
      generateImageCacheKey: img => (img?.getAttribute ? img.getAttribute('src') || '' : ''),
    };

    // Indicate unit testing mode so content.js exposes result to window
    window.__UNIT_TESTING__ = true;

    // Load Logger.js first (content.js depends on it)
    const loggerPath = path.resolve(__dirname, '../../../scripts/utils/Logger.js');
    const loggerCode = fs.readFileSync(loggerPath, 'utf8');
    const loggerEl = window.document.createElement('script');
    loggerEl.textContent = loggerCode;
    window.document.body.append(loggerEl);

    // Load the script file content and evaluate it in the window
    const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');
    const scriptCode = fs.readFileSync(scriptPath, 'utf8');

    // Evaluate the content script inside the jsdom window
    const scriptEl = window.document.createElement('script');
    scriptEl.textContent = scriptCode;
    window.document.body.append(scriptEl);

    // Wait for the script to execute and set window.__notion_extraction_result with polling
    /** @type {*} 提取結果,在輪詢循環中初始化 */
    let result = null;
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
  }, 10_000);
});
