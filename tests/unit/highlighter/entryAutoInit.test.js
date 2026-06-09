const fs = require('node:fs');
const path = require('node:path');

jest.mock('../../../scripts/highlighter/index.js', () => ({
  setupHighlighter: jest.fn(),
}));

jest.mock('../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => `sanitized:${url}`),
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
  default: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  },
  __esModule: true,
}));

jest.mock('../../../scripts/highlighter/ui/FloatingRail.js', () => ({
  FloatingRail: jest.fn(),
  __esModule: true,
}));

const ENTRY_AUTO_INIT_PATH = path.resolve(
  __dirname,
  '../../../scripts/highlighter/entryAutoInit.js'
);
const PERSISTENT_LISTENERS_PATH = path.resolve(
  __dirname,
  '../../../scripts/highlighter/autoInit/persistentListeners.js'
);
const ASYNC_AUTO_INIT_IIFE_PATTERN = /\bvoid[ \t]*\([ \t]*async[ \t]*\([ \t]*\)[ \t]*=>[ \t]*\{/;
const CHANNEL_SPECIFIC_REGISTER_HELPER_PATTERN =
  /function registerPersistent(?:Message|StorageChange)Listener\b/;

const readEntryAutoInitSource = () => fs.readFileSync(ENTRY_AUTO_INIT_PATH, 'utf8');
const readPersistentListenersSource = () => fs.readFileSync(PERSISTENT_LISTENERS_PATH, 'utf8');

const sourceLines = source => source.split(/\r?\n/);

const hasAsyncAutoInitIife = source =>
  sourceLines(source).some(line => ASYNC_AUTO_INIT_IIFE_PATTERN.test(line));

const hasTopLevelInitializeAwait = source =>
  sourceLines(source).some(line => line.trim() === 'await initializeExtension();');

describe('entryAutoInit', () => {
  let mockSetupHighlighter;
  let mockLogger;
  let mockFloatingRail;
  let runtimeMessageHandlers;
  let storageChangeHandlers;

  const flushAsyncSetup = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  const createPersistentListenersController = ({
    onMessage,
    storage = {},
    getStableUrl = jest.fn(),
    onSetStableUrl = jest.fn(),
    onShowToolbar = jest.fn(),
  }) => {
    const {
      createPersistentListeners,
    } = require('../../../scripts/highlighter/autoInit/persistentListeners.js');

    return createPersistentListeners({
      globalScope: {
        chrome: {
          runtime: { onMessage },
          storage,
        },
      },
      getStableUrl,
      onSetStableUrl,
      onShowToolbar,
    });
  };

  const initializeEntryAutoInit = async ({
    pageStatus = {
      isSaved: true,
      stableUrl: 'https://example.com/original',
    },
    settings = {},
  } = {}) => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(pageStatus);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce(settings);

    require('../../../scripts/highlighter/entryAutoInit.js');
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    return runtimeMessageHandlers.at(-1);
  };

  const installLateStableUrlHighlighter = ({
    restore = jest.fn().mockResolvedValue(undefined),
    highlightCount = 0,
    skipRestore = false,
    wasDeleted = false,
  } = {}) => {
    globalThis.HighlighterV2 = {
      skipRestore,
      wasDeleted,
      manager: {
        getCount: jest.fn().mockReturnValue(highlightCount),
      },
      restoreManager: {
        restore,
      },
    };

    return restore;
  };

  const sendLateStableUrl = ({
    handler = runtimeMessageHandlers.at(-1),
    stableUrl = 'https://example.com/stable',
    sendResponse = jest.fn(),
  } = {}) => {
    const result = handler(
      {
        action: 'SET_STABLE_URL',
        stableUrl,
      },
      {},
      sendResponse
    );

    return { result, sendResponse };
  };

  test('[REGRESSION] content-script entry should avoid top-level await during auto-init', () => {
    const source = readEntryAutoInitSource();

    expect(hasAsyncAutoInitIife(source)).toBe(true);
    expect(hasTopLevelInitializeAwait(source)).toBe(false);
  });

  test('[REGRESSION] async auto-init check should not match across lines', () => {
    const source = 'void (\n  async () => {';

    expect(hasAsyncAutoInitIife(source)).toBe(false);
    expect(hasAsyncAutoInitIife('void (async () => {')).toBe(true);
  });

  test('[REGRESSION] top-level await check should stay line-based', () => {
    const source = 'const marker = true;\n  await initializeExtension();';

    expect(hasTopLevelInitializeAwait(source)).toBe(true);
    expect(hasTopLevelInitializeAwait('await initializeExtension();')).toBe(true);
  });

  test('[REGRESSION] persistent listener registration should use a shared lifecycle controller', () => {
    const source = readPersistentListenersSource();

    expect(source).toContain('function createPersistentListenerController');
    expect(source).not.toMatch(CHANNEL_SPECIFIC_REGISTER_HELPER_PATTERN);
  });

  test('[REGRESSION] persistent listener registration should tolerate invalidated addListener', () => {
    const onMessage = {
      addListener: jest.fn(() => {
        throw new Error('Extension context invalidated');
      }),
      removeListener: jest.fn(),
    };
    const controller = createPersistentListenersController({ onMessage });

    expect(() => controller.register()).not.toThrow();

    onMessage.addListener.mockImplementation(jest.fn());
    controller.register();

    expect(onMessage.addListener).toHaveBeenCalledTimes(2);
  });

  test('[REGRESSION] persistent listener unregister should tolerate invalidated removeListener', () => {
    const onMessage = {
      addListener: jest.fn(),
      removeListener: jest.fn(() => {
        throw new Error('Extension context invalidated');
      }),
    };
    const controller = createPersistentListenersController({ onMessage });

    controller.register();

    expect(() => controller.unregister()).not.toThrow();

    controller.register();

    expect(onMessage.addListener).toHaveBeenCalledTimes(2);
    expect(onMessage.removeListener).toHaveBeenCalledTimes(1);
  });

  test('[REGRESSION] persistent message handler should ignore invalid request payloads', () => {
    let messageHandler;
    const sendResponse = jest.fn();
    const controller = createPersistentListenersController({
      onMessage: {
        addListener: jest.fn(handler => {
          messageHandler = handler;
        }),
        removeListener: jest.fn(),
      },
    });

    controller.register();

    expect(messageHandler(null, {}, sendResponse)).toBeUndefined();
    expect(messageHandler(undefined, {}, sendResponse)).toBeUndefined();
    expect(messageHandler({ action: '__proto__' }, {}, sendResponse)).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    delete globalThis.HighlighterV2;
    delete globalThis.__NOTION_STABLE_URL__;
    delete globalThis.__NOTION_RAIL_READY__;
    runtimeMessageHandlers = [];
    storageChangeHandlers = [];

    globalThis.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn(handler => {
            runtimeMessageHandlers.push(handler);
          }),
          removeListener: jest.fn(handler => {
            runtimeMessageHandlers = runtimeMessageHandlers.filter(
              registeredHandler => registeredHandler !== handler
            );
          }),
        },
      },
      storage: {
        sync: {
          get: jest.fn(),
        },
        onChanged: {
          addListener: jest.fn(handler => {
            storageChangeHandlers.push(handler);
          }),
          removeListener: jest.fn(handler => {
            storageChangeHandlers = storageChangeHandlers.filter(
              registeredHandler => registeredHandler !== handler
            );
          }),
        },
      },
    };

    const indexMock = require('../../../scripts/highlighter/index.js');
    mockSetupHighlighter = indexMock.setupHighlighter;
    mockLogger = require('../../../scripts/utils/Logger.js').default;
    mockFloatingRail = require('../../../scripts/highlighter/ui/FloatingRail.js').FloatingRail;
    mockFloatingRail.mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      hide: jest.fn(),
      show: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    delete globalThis.chrome;
    delete globalThis.notionHighlighter;
    delete globalThis.HighlighterV2;
    delete globalThis.__NOTION_STABLE_URL__;
    delete globalThis.__NOTION_RAIL_READY__;
  });

  test('正常初始化 (無 stableUrl, chrome API 返回正確值)', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({
      isSaved: true,
      stableUrl: 'https://test.com',
    });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({ highlightStyle: 'underline' });

    // SET_STABLE_URL 不會被觸發，所以 `waitForStableUrl` 會超時
    // Timeout behavior
    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers(); // trigger settimeout manually
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: false,
      skipToolbar: true,
      styleMode: 'underline',
    });
    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://test.com');
  });

  test('被刪除的頁面應 skipRestore', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({
      isSaved: false,
      wasDeleted: true,
    });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({}); // default

    require('../../../scripts/highlighter/entryAutoInit.js');
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: true,
      skipToolbar: true,
      styleMode: 'background',
    });
  });

  test('[REGRESSION] skipRestore 時 rail-ready promise 應回傳失敗 contract 而非 pending', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({
      isSaved: false,
      wasDeleted: true,
    });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    const capturedPromise = globalThis.__NOTION_RAIL_READY__;
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    const result = await capturedPromise;

    expect(result).toEqual({
      success: false,
      error: '浮動側欄初始化已略過',
    });
    expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
  });

  test('[REGRESSION] setup 後沒有 manager 時 rail-ready promise 應回傳失敗 contract', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({ isSaved: true });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    const capturedPromise = globalThis.__NOTION_RAIL_READY__;
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    const result = await capturedPromise;

    expect(result).toEqual({
      success: false,
      error: '浮動側欄初始化缺少 manager',
    });
    expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
  });

  test('不應等待 waitForStableUrl 超時才完成初始化', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({
      isSaved: true,
      stableUrl: 'https://fast-page-status.com',
    });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({ highlightStyle: 'underline' });

    require('../../../scripts/highlighter/entryAutoInit.js');
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: false,
      skipToolbar: true,
      styleMode: 'underline',
    });
    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://fast-page-status.com');
  });

  test('當 chrome API 拋出錯誤時安全回退', async () => {
    globalThis.chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('no pageStatus'));
    globalThis.chrome.storage.sync.get.mockRejectedValueOnce(new Error('no storage sync'));

    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers(); // clear timeout
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: false,
      skipToolbar: true,
      styleMode: 'background', // fallback
    });
  });

  test('highlightStyle 無效時應使用 background 並記錄 warning', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({ isSaved: true });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({ highlightStyle: 'invalid-style' });

    require('../../../scripts/highlighter/entryAutoInit.js');
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: false,
      skipToolbar: true,
      styleMode: 'background',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Highlighter] highlightStyle 設定值無效',
      expect.objectContaining({
        action: 'initializeExtension',
        value: 'invalid-style',
      })
    );
  });

  test('chrome status 與 sync API 不可用時應以預設值初始化', async () => {
    globalThis.chrome.runtime.sendMessage = undefined;
    globalThis.chrome.storage.sync = undefined;

    require('../../../scripts/highlighter/entryAutoInit.js');
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: false,
      skipToolbar: true,
      styleMode: 'background',
    });
  });

  test('如果 setupHighlighter 拋錯應能捕獲', async () => {
    mockSetupHighlighter.mockImplementationOnce(() => {
      throw new Error('Initial fail');
    });
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    const capturedPromise = globalThis.__NOTION_RAIL_READY__;
    await jest.runAllTimersAsync(); // clear timeout and promise chain
    await flushAsyncSetup();

    // 應該調用兩次: 一次正常，一次 fallback
    expect(mockSetupHighlighter).toHaveBeenCalledTimes(2);
    expect(mockSetupHighlighter).toHaveBeenNthCalledWith(2, {
      skipRestore: true,
      skipToolbar: true,
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      '初始化失敗',
      expect.objectContaining({ action: 'initializeExtension' })
    );

    const result = await capturedPromise;

    expect(result).toEqual({
      success: false,
      error: '浮動側欄初始化失敗',
    });
    expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
  });

  test('fallbackInitialize 成功時應同步標記 HighlighterV2 skipRestore', async () => {
    mockSetupHighlighter
      .mockImplementationOnce(() => {
        throw new Error('Initial fail');
      })
      .mockImplementationOnce(() => {
        globalThis.HighlighterV2 = {};
      });
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    expect(globalThis.HighlighterV2.skipRestore).toBe(true);
  });

  test('[REGRESSION] fallbackInitialize 成功時 rail-ready promise 應回傳失敗 contract', async () => {
    mockSetupHighlighter.mockImplementationOnce(() => {
      throw new Error('Initial fail');
    });
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    const capturedPromise = globalThis.__NOTION_RAIL_READY__;
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenNthCalledWith(2, {
      skipRestore: true,
      skipToolbar: true,
    });

    const result = await capturedPromise;

    expect(result).toEqual({
      success: false,
      error: '浮動側欄初始化失敗',
    });
    expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
  });

  test('如果 fallback setupHighlighter 也拋錯應記錄 setupHighlighter action', async () => {
    mockSetupHighlighter
      .mockImplementationOnce(() => {
        throw new Error('Initial fail');
      })
      .mockImplementationOnce(() => {
        throw new Error('Fallback fail');
      });
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    const capturedPromise = globalThis.__NOTION_RAIL_READY__;
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    expect(mockLogger.error).toHaveBeenCalledWith(
      '回退初始化失敗',
      expect.objectContaining({ action: 'setupHighlighter' })
    );

    const result = await capturedPromise;

    expect(result).toEqual({
      success: false,
      error: '浮動側欄初始化失敗',
    });
    expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
  });

  test('初始化完成前只註冊 waitForStableUrl 臨時監聽器', () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');

    expect(globalThis.chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(globalThis.chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
  });

  test('完成初始化後才註冊永久監聽器', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');

    jest.runAllTimers();
    await flushAsyncSetup();

    expect(globalThis.chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(2);
    expect(runtimeMessageHandlers).toHaveLength(1);
    expect(globalThis.chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(storageChangeHandlers).toHaveLength(1);
  });

  test('初始化失敗後不應保留永久監聽器', async () => {
    mockSetupHighlighter.mockImplementation(() => {
      throw new Error('setup failed');
    });
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');

    jest.runAllTimers();
    await flushAsyncSetup();

    expect(runtimeMessageHandlers).toHaveLength(0);
    expect(storageChangeHandlers).toHaveLength(0);
  });

  test('初始化 stableUrl 日誌應使用脫敏後的 URL', async () => {
    const rawStableUrl = 'https://test.com/post?id=123#token=secret';
    const { sanitizeUrlForLogging } = require('../../../scripts/utils/LogSanitizer.js');

    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({
      isSaved: true,
      stableUrl: rawStableUrl,
    });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');

    jest.runAllTimers();
    await flushAsyncSetup();

    expect(sanitizeUrlForLogging).toHaveBeenCalledWith(rawStableUrl);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[Highlighter] 已使用穩定 URL 完成初始化',
      expect.objectContaining({
        action: 'initializeExtension',
        stableUrl: `sanitized:${rawStableUrl}`,
      })
    );
    expect(globalThis.__NOTION_STABLE_URL__).toBe(rawStableUrl);
  });

  test('applyResolvedStableUrl 應只在 HighlighterAPI.setStableUrl 是函式時呼叫', () => {
    const {
      applyResolvedStableUrl,
    } = require('../../../scripts/highlighter/autoInit/stableUrlResolution.js');
    const setStableUrl = jest.fn();
    const globalScope = {
      HighlighterAPI: {
        setStableUrl,
      },
    };

    applyResolvedStableUrl({
      globalScope,
      resolvedStableUrl: 'https://example.com/stable',
      stableUrlSource: 'SET_STABLE_URL',
      logger: mockLogger,
      sanitizeUrlForLogging: url => url,
    });

    expect(globalScope.__NOTION_STABLE_URL__).toBe('https://example.com/stable');
    expect(setStableUrl).toHaveBeenCalledWith('https://example.com/stable');
  });

  test('applyResolvedStableUrl 遇到非函式 HighlighterAPI.setStableUrl 不應中斷初始化', () => {
    const {
      applyResolvedStableUrl,
    } = require('../../../scripts/highlighter/autoInit/stableUrlResolution.js');
    const globalScope = {
      HighlighterAPI: {
        setStableUrl: 'not-a-function',
      },
    };

    expect(() => {
      applyResolvedStableUrl({
        globalScope,
        resolvedStableUrl: 'https://example.com/stable',
        stableUrlSource: 'SET_STABLE_URL',
        logger: mockLogger,
        sanitizeUrlForLogging: url => url,
      });
    }).not.toThrow();
    expect(globalScope.__NOTION_STABLE_URL__).toBe('https://example.com/stable');
  });

  test('applyResolvedStableUrl 無 stableUrl 時應記錄 fallback 到原始 URL', () => {
    const {
      applyResolvedStableUrl,
    } = require('../../../scripts/highlighter/autoInit/stableUrlResolution.js');
    const globalScope = {};

    applyResolvedStableUrl({
      globalScope,
      resolvedStableUrl: null,
      stableUrlSource: 'checkPageStatus',
      logger: mockLogger,
      sanitizeUrlForLogging: url => url,
    });

    expect(globalScope.__NOTION_STABLE_URL__).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[Highlighter] Background 返回無效的 stable URL，將使用原始 URL',
      {
        action: 'initialization_complete_no_stable_url',
      }
    );
  });

  test('waitForStableUrl 應由臨時 SET_STABLE_URL 監聽器處理訊息', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');

    const waitForStableUrlHandler = runtimeMessageHandlers[0];
    waitForStableUrlHandler({
      action: 'SET_STABLE_URL',
      stableUrl: 'https://sent-from-bg.com',
    });
    jest.runAllTimers();
    await flushAsyncSetup();

    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://sent-from-bg.com');
  });

  test('晚到的 SET_STABLE_URL 不應在 skipRestore 情況下重試 restore', async () => {
    await initializeEntryAutoInit({
      pageStatus: {
        isSaved: false,
        wasDeleted: true,
      },
    });

    const restore = installLateStableUrlHighlighter({
      wasDeleted: true,
    });

    const { sendResponse } = sendLateStableUrl({
      stableUrl: 'https://late-arrival.com',
    });

    expect(restore).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('未保存頁面晚到的 SET_STABLE_URL 只能更新 stableUrl，不應重新建立 saved UI', async () => {
    await initializeEntryAutoInit({
      pageStatus: {
        isSaved: false,
        stableUrl: 'https://example.com/original',
      },
    });

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: false,
      skipToolbar: true,
      styleMode: 'background',
    });

    const { sendResponse } = sendLateStableUrl();

    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://example.com/stable');
    expect(mockSetupHighlighter).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('晚到的 SET_STABLE_URL 可在尚無 highlights 時重試 restore', async () => {
    await initializeEntryAutoInit();
    const restore = installLateStableUrlHighlighter();

    const { result, sendResponse } = sendLateStableUrl();
    await flushAsyncSetup();

    expect(result).toBe(true);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://example.com/stable');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('晚到的 SET_STABLE_URL restore 失敗時應回傳錯誤並記錄 warning', async () => {
    await initializeEntryAutoInit();
    const restoreError = new Error('restore failed');
    installLateStableUrlHighlighter({
      restore: jest.fn().mockRejectedValue(restoreError),
    });

    const { sendResponse } = sendLateStableUrl();
    await flushAsyncSetup();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Highlighter] 延後收到穩定 URL，重試恢復標註失敗',
      expect.objectContaining({
        action: 'SET_STABLE_URL',
        error: restoreError,
      })
    );
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: String(restoreError),
    });
  });

  test('晚到的 SET_STABLE_URL 已重試一次後不應再次 restore', async () => {
    await initializeEntryAutoInit();
    const restore = installLateStableUrlHighlighter();

    sendLateStableUrl({ stableUrl: 'https://example.com/first-stable' });
    await flushAsyncSetup();

    const { sendResponse } = sendLateStableUrl({
      stableUrl: 'https://example.com/second-stable',
    });

    expect(restore).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('晚到的 SET_STABLE_URL 已有 highlights 時不應重試 restore', async () => {
    await initializeEntryAutoInit();
    const restore = installLateStableUrlHighlighter({
      highlightCount: 1,
    });

    const { sendResponse } = sendLateStableUrl();

    expect(restore).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('sendMessage 接收 GET_STABLE_URL & showToolbar', async () => {
    globalThis.__NOTION_STABLE_URL__ = 'https://existing.com';
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers();
    await flushAsyncSetup();

    const messageHandler = runtimeMessageHandlers.at(-1);

    // Test GET_STABLE_URL
    const sendResponseMock = jest.fn();
    const result1 = messageHandler({ action: 'GET_STABLE_URL' }, {}, sendResponseMock);
    expect(result1).toBe(true);
    expect(sendResponseMock).toHaveBeenCalledWith({ stableUrl: 'https://existing.com' });

    // Test showToolbar
    const sendResponseMock2 = jest.fn();
    globalThis.HighlighterV2 = {
      rail: {
        show: jest.fn(),
      },
    };
    const result2 = messageHandler({ action: 'showToolbar' }, {}, sendResponseMock2);
    expect(result2).toBe(true);
    expect(globalThis.HighlighterV2.rail.show).toHaveBeenCalled();
    expect(sendResponseMock2).toHaveBeenCalledWith({ success: true });

    delete globalThis.HighlighterV2;

    // showToolbar without rail should no longer fallback to toolbar
    messageHandler({ action: 'showToolbar' }, {}, sendResponseMock);
    expect(sendResponseMock).toHaveBeenCalledWith({
      success: false,
      error: '浮動側欄尚未初始化',
    });
  });

  test('[REGRESSION] showToolbar 應等待 rail-ready 完成後才回應', async () => {
    globalThis.__NOTION_STABLE_URL__ = 'https://existing.com';
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers();
    await flushAsyncSetup();

    const messageHandler = runtimeMessageHandlers.at(-1);
    const railReady = {};
    railReady.promise = new Promise(resolve => {
      railReady.resolve = resolve;
    });

    delete globalThis.HighlighterV2;
    globalThis.__NOTION_RAIL_READY__ = railReady.promise;

    const sendResponseMock = jest.fn();
    const showMock = jest.fn();
    const result = messageHandler({ action: 'showToolbar' }, {}, sendResponseMock);

    expect(result).toBe(true);
    expect(showMock).not.toHaveBeenCalled();
    expect(sendResponseMock).not.toHaveBeenCalled();

    railReady.resolve({
      success: true,
      rail: { show: showMock },
    });
    await flushAsyncSetup();

    expect(showMock).toHaveBeenCalled();
    expect(sendResponseMock).toHaveBeenCalledWith({ success: true });
  });

  test('setupHighlighter 建立 manager 時應初始化 floating rail 並套用 disabled 設定', async () => {
    const railInstance = {
      initialize: jest.fn().mockResolvedValue(undefined),
      hide: jest.fn(),
      show: jest.fn(),
    };
    mockFloatingRail.mockImplementationOnce(() => railInstance);
    const manager = { getCount: jest.fn().mockReturnValue(0) };
    mockSetupHighlighter.mockImplementationOnce(() => {
      globalThis.HighlighterV2 = { manager };
    });
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({ isSaved: true });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({
      floatingRailEnabled: false,
    });

    require('../../../scripts/highlighter/entryAutoInit.js');
    const capturedPromise = globalThis.__NOTION_RAIL_READY__;
    await jest.runAllTimersAsync();
    await flushAsyncSetup();

    await expect(capturedPromise).resolves.toEqual({
      success: true,
      rail: railInstance,
    });
    expect(mockFloatingRail).toHaveBeenCalledWith(manager);
    expect(railInstance.initialize).toHaveBeenCalledTimes(1);
    expect(railInstance.hide).toHaveBeenCalledTimes(1);
    expect(globalThis.HighlighterV2).toEqual(
      expect.objectContaining({
        manager,
        rail: railInstance,
        skipRestore: false,
        wasDeleted: false,
      })
    );
  });

  test('chrome.storage.onChanged 更新標籤樣式', async () => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers();
    await flushAsyncSetup();

    globalThis.HighlighterV2 = {
      manager: {
        updateStyleMode: jest.fn(),
      },
    };

    const changedHandler = storageChangeHandlers.at(-1);
    changedHandler({ highlightStyle: { newValue: 'underline' } }, 'sync');
    expect(globalThis.HighlighterV2.manager.updateStyleMode).toHaveBeenCalledWith('underline');
  });

  // ─── Step 0.3 Regression Tests ───────────────────────────────────────────
  // 驗證：SET_STABLE_URL 先到時，checkPageStatus 回傳的 stableUrl 不應覆蓋它。
  // 修復前此測試應 FAIL，因為 resolvedStableUrl = pageStatus?.stableUrl || stableUrlState.value
  // 讓 pageStatus 的值優先。
  test('[REGRESSION] SET_STABLE_URL 已到達時，checkPageStatus 的 stableUrl 不應覆蓋', async () => {
    const stableUrlFromRuntime = 'https://example.com/runtime-stable'; // 較早到達的 runtime 訊息
    const stableUrlFromPageStatus = 'https://example.com/page-status-stable'; // 較弱的 checkPageStatus 來源

    // 模擬 checkPageStatus 同步返回，並有 stableUrl
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({
      isSaved: true,
      stableUrl: stableUrlFromPageStatus,
    });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({ highlightStyle: 'background' });

    require('../../../scripts/highlighter/entryAutoInit.js');

    // 在 Promise.all 之前模擬 SET_STABLE_URL 先到
    const waitForStableUrlHandler = runtimeMessageHandlers[0];
    waitForStableUrlHandler({
      action: 'SET_STABLE_URL',
      stableUrl: stableUrlFromRuntime,
    });

    jest.runAllTimers();
    await flushAsyncSetup();

    // 修復後：應使用 stableUrlFromRuntime（SET_STABLE_URL 優先）
    // 修復前：會使用 stableUrlFromPageStatus（pageStatus 優先）
    expect(globalThis.__NOTION_STABLE_URL__).toBe(stableUrlFromRuntime);
  });

  test('[REGRESSION] SET_STABLE_URL 未到達時，應 fallback 到 checkPageStatus 的 stableUrl', async () => {
    // 這個測試確保移除優先權不會破壞基本 fallback 邏輯
    const stableUrlFromPageStatus = 'https://example.com/page-status-only';

    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce({
      isSaved: true,
      stableUrl: stableUrlFromPageStatus,
    });
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    // 不觸發 SET_STABLE_URL 訊息
    jest.runAllTimers();
    await flushAsyncSetup();

    // 應使用 pageStatus.stableUrl 作為 fallback
    expect(globalThis.__NOTION_STABLE_URL__).toBe(stableUrlFromPageStatus);
  });
});
