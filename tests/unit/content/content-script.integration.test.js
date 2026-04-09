/**
 * 在 jsdom 中載入 scripts/content.js 的整合式測試。
 * 使用最小化 mock（Readability、ImageUtils），並驗證它會產生
 * 合法的提取結果並暴露到 window.__notion_extraction_result。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execSync } = require('node:child_process');

describe('內容腳本整合測試', () => {
  let chromeMock;
  let loggerMock;

  beforeEach(() => {
    const sendMessage = jest.fn();
    const onMessageAddListener = jest.fn();
    const storageSyncGet = jest.fn((keys, cb) => {
      const result = {};
      cb(result);
    });
    const storageOnChangedAddListener = jest.fn();

    chromeMock = {
      runtime: {
        id: 'test-extension-id',
        getManifest: () => ({ version: '1.0.0-dev' }),
        sendMessage,
        onMessage: { addListener: onMessageAddListener },
      },
      storage: {
        sync: {
          get: storageSyncGet,
        },
        onChanged: {
          addListener: storageOnChangedAddListener,
        },
      },
    };

    loggerMock = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      success: jest.fn(),
    };

    globalThis.chrome = chromeMock;
    globalThis.Logger = loggerMock;

    if (globalThis.window) {
      globalThis.window.chrome = chromeMock;
      globalThis.window.Logger = loggerMock;
    }
  });

  afterEach(() => {
    jest.clearAllMocks();

    if (globalThis.window) {
      delete globalThis.window.chrome;
      delete globalThis.window.Logger;
    }

    delete globalThis.chrome;
    delete globalThis.Logger;
  });

  // 確保測試執行前已存在 bundle
  beforeAll(() => {
    const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');
    if (!fs.existsSync(scriptPath)) {
      try {
        // 在專案根目錄執行建置指令
        // eslint-disable-next-line sonarjs/no-os-command-from-path
        execSync('npm run build:content', {
          stdio: 'pipe',
          cwd: path.resolve(__dirname, '../../../'),
          encoding: 'utf8',
          shell: true,
        });
      } catch (error) {
        const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : '';
        const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : '';
        const details = [
          error.message,
          error.stack,
          stdout && `stdout:\n${stdout}`,
          stderr && `stderr:\n${stderr}`,
        ]
          .filter(Boolean)
          .join('\n\n');

        throw new Error(`建置 content bundle 失敗：\n${details}`, { cause: error });
      }
    }
  }, 60_000); // 提高建置逾時上限

  test('當 window.__UNIT_TESTING__ 為 true 時執行 content.js 並暴露提取結果', async () => {
    const html =
      '<!doctype html><html><head><title>Test Page</title></head><body><article><h1>Heading</h1><p>This is some long article content that should be picked up by Readability.</p></article></body></html>';

    document.documentElement.innerHTML = html;
    const window = globalThis.window;

    // 最小化的 Readability mock，回傳解析後內容
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

    // 確保存在 ImageUtils（若缺少，content.js 會提供後備實作）
    window.ImageUtils = {
      cleanImageUrl: url => url,
      isValidImageUrl: (..._args) => true,
      extractImageSrc: img => (img?.getAttribute ? img.getAttribute('src') || '' : null),
      generateImageCacheKey: img => (img?.getAttribute ? img.getAttribute('src') || '' : ''),
    };

    // 標記為單元測試模式，讓 content.js 將結果暴露到 window
    window.__UNIT_TESTING__ = true;

    // 載入腳本檔案內容並在 window 中執行
    const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');
    const scriptCode = fs.readFileSync(scriptPath, 'utf8');

    const executionContext = vm.createContext(
      Object.assign(Object.create(globalThis), {
        window,
        self: window,
        document: window.document,
        location: window.location,
        navigator: window.navigator,
        CustomEvent: window.CustomEvent,
        Event: window.Event,
        Node: window.Node,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        Document: window.Document,
        DOMParser: window.DOMParser,
        XMLSerializer: window.XMLSerializer,
        MutationObserver: window.MutationObserver,
        URL: window.URL,
        URLSearchParams: window.URLSearchParams,
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
        dispatchEvent: window.dispatchEvent.bind(window),
        getComputedStyle: window.getComputedStyle.bind(window),
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        chrome: chromeMock,
        Logger: loggerMock,
        Readability: window.Readability,
        ImageUtils: window.ImageUtils,
        __UNIT_TESTING__: true,
      })
    );
    vm.runInContext(scriptCode, executionContext, { filename: scriptPath });

    // 輪詢等待腳本執行完成，並設定 window.__notion_extraction_result
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
