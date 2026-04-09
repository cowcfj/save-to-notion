/**
 * 在 jsdom 中載入 scripts/content.js 的整合式測試。
 * 使用最小化 mock（Readability、ImageUtils），並驗證它會產生
 * 合法的提取結果並暴露到 window.__notion_extraction_result。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execSync } = require('node:child_process');

const BUILD_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 10_000;
const POLL_RETRY_COUNT = 30;
const POLL_INTERVAL_MS = 200;

function createExecutionContext(
  browserWindow,
  chromeMock,
  loggerMock,
  readabilityMock,
  imageUtilsMock
) {
  return vm.createContext(
    Object.assign(Object.create(globalThis), {
      window: browserWindow,
      self: browserWindow,
      document: browserWindow.document,
      location: browserWindow.location,
      navigator: browserWindow.navigator,
      CustomEvent: browserWindow.CustomEvent,
      Event: browserWindow.Event,
      Node: browserWindow.Node,
      Element: browserWindow.Element,
      HTMLElement: browserWindow.HTMLElement,
      Document: browserWindow.Document,
      DOMParser: browserWindow.DOMParser,
      XMLSerializer: browserWindow.XMLSerializer,
      MutationObserver: browserWindow.MutationObserver,
      URL: browserWindow.URL,
      URLSearchParams: browserWindow.URLSearchParams,
      addEventListener: browserWindow.addEventListener.bind(browserWindow),
      removeEventListener: browserWindow.removeEventListener.bind(browserWindow),
      dispatchEvent: browserWindow.dispatchEvent.bind(browserWindow),
      getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
      setTimeout: browserWindow.setTimeout.bind(browserWindow),
      clearTimeout: browserWindow.clearTimeout.bind(browserWindow),
      chrome: chromeMock,
      Logger: loggerMock,
      Readability: readabilityMock,
      ImageUtils: imageUtilsMock,
      __UNIT_TESTING__: true,
    })
  );
}

async function waitForExtractionResult(executionContext, browserWindow) {
  for (let i = 0; i < POLL_RETRY_COUNT; i++) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    if (executionContext.__notion_extraction_result) {
      return executionContext.__notion_extraction_result;
    }

    if (browserWindow.__notion_extraction_result) {
      return browserWindow.__notion_extraction_result;
    }
  }

  return null;
}

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
  });

  afterEach(() => {
    jest.clearAllMocks();

    if (globalThis.window) {
      delete globalThis.window.__UNIT_TESTING__;
      delete globalThis.window.__notion_extraction_result;
      delete globalThis.window.Readability;
      delete globalThis.window.ImageUtils;
    }
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
  }, BUILD_TIMEOUT_MS);

  test(
    '當 window.__UNIT_TESTING__ 為 true 時執行 content.js 並暴露提取結果',
    async () => {
      const html =
        '<!doctype html><html><head><title>Test Page</title></head><body><article><h1>Heading</h1><p>This is some long article content that should be picked up by Readability.</p></article></body></html>';

      document.documentElement.innerHTML = html;
      const browserWindow = globalThis.window;

      const readabilityMock = function (doc) {
        const safeDoc = doc || browserWindow.document;

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

      const imageUtilsMock = {
        cleanImageUrl: url => url,
        isValidImageUrl: (..._args) => true,
        extractImageSrc: img => (img?.getAttribute ? img.getAttribute('src') || '' : null),
        generateImageCacheKey: img => (img?.getAttribute ? img.getAttribute('src') || '' : ''),
      };

      browserWindow.Readability = readabilityMock;
      browserWindow.ImageUtils = imageUtilsMock;
      browserWindow.__UNIT_TESTING__ = true;

      const scriptPath = path.resolve(__dirname, '../../../dist/content.bundle.js');
      const scriptCode = fs.readFileSync(scriptPath, 'utf8');
      const executionContext = createExecutionContext(
        browserWindow,
        chromeMock,
        loggerMock,
        readabilityMock,
        imageUtilsMock
      );

      vm.runInContext(scriptCode, executionContext, { filename: scriptPath });

      const result = await waitForExtractionResult(executionContext, browserWindow);

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Page');
      expect(Array.isArray(result.blocks)).toBe(true);
    },
    TEST_TIMEOUT_MS
  );
});
