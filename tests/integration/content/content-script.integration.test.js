/**
 * 在 jsdom 中載入 scripts/content.js 的整合式測試。
 * 使用最小化 mock（Readability、ImageUtils），並驗證它會產生
 * 合法的提取結果並暴露到 window.__notion_extraction_result。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const childProcess = require('node:child_process');

const BUILD_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 10_000;
const POLL_RETRY_COUNT = 30;
const POLL_INTERVAL_MS = 200;
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const CONTENT_BUNDLE_PATH = path.resolve(PROJECT_ROOT, 'dist/content.bundle.js');
const CONTENT_TEST_PAGE_FIXTURE_PATH = path.resolve(
  PROJECT_ROOT,
  'tests/fixtures/html/content-script.integration.test-page.html'
);

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

function ensureFreshContentBundle() {
  fs.rmSync(CONTENT_BUNDLE_PATH, { force: true });

  try {
    // 在專案根目錄執行建置指令
    // 不依賴 npm，直接呼叫專案內的 rollup
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    childProcess.execSync('node node_modules/.bin/rollup -c rollup.content.config.mjs', {
      stdio: 'pipe',
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: process.env,
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

function loadContentTestPageHtml() {
  return fs.readFileSync(CONTENT_TEST_PAGE_FIXTURE_PATH, 'utf8').trim();
}

describe('內容腳本整合測試輔助函式', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('ensureFreshContentBundle 應刪除舊 bundle 並重新建置', () => {
    const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => undefined);
    const execSyncSpy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => '');

    ensureFreshContentBundle();

    expect(rmSyncSpy).toHaveBeenCalledWith(CONTENT_BUNDLE_PATH, { force: true });
    expect(execSyncSpy).toHaveBeenCalledWith(
      'node node_modules/.bin/rollup -c rollup.content.config.mjs',
      expect.objectContaining({
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        shell: true,
        stdio: 'pipe',
      })
    );
  });

  test('loadContentTestPageHtml 應從 tests/fixtures/html 讀取 HTML', () => {
    expect(loadContentTestPageHtml()).toContain('<title>Test Page</title>');
  });
});

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
    ensureFreshContentBundle();
  }, BUILD_TIMEOUT_MS);

  test(
    '當 window.__UNIT_TESTING__ 為 true 時執行 content.js 並暴露提取結果',
    async () => {
      const html = loadContentTestPageHtml();

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

      // eslint-disable-next-line sonarjs/code-eval -- Intentional VM execution of local bundled content script in an isolated test context.
      vm.runInContext(scriptCode, executionContext, { filename: scriptPath });

      const result = await waitForExtractionResult(executionContext, browserWindow);

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Page');
      expect(Array.isArray(result.blocks)).toBe(true);
    },
    TEST_TIMEOUT_MS
  );
});
