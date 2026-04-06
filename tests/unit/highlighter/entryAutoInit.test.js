jest.mock('../../../scripts/highlighter/index.js', () => ({
  setupHighlighter: jest.fn(),
}));

jest.mock('../../../scripts/utils/securityUtils.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => `sanitized:${url}`),
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
  default: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  __esModule: true,
}));

describe('entryAutoInit', () => {
  let mockSetupHighlighter;
  let mockLogger;
  let runtimeMessageHandlers;
  let storageChangeHandlers;

  const flushAsyncSetup = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    delete globalThis.HighlighterV2;
    delete globalThis.__NOTION_STABLE_URL__;
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
  });

  afterEach(() => {
    jest.useRealTimers();
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
      skipToolbar: false,
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
    jest.runAllTimers(); // clear timeout
    await flushAsyncSetup();

    expect(mockSetupHighlighter).toHaveBeenCalledWith({
      skipRestore: true,
      skipToolbar: true,
      styleMode: 'background',
    });
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

  test('如果 setupHighlighter 拋錯應能捕獲', async () => {
    mockSetupHighlighter.mockImplementationOnce(() => {
      throw new Error('Initial fail');
    });
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers(); // clear timeout
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
    jest.runAllTimers();
    await flushAsyncSetup();

    expect(mockLogger.error).toHaveBeenCalledWith(
      '回退初始化失敗',
      expect.objectContaining({ action: 'setupHighlighter' })
    );
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
    const { sanitizeUrlForLogging } = require('../../../scripts/utils/securityUtils.js');

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
      '[Highlighter] Initialized with stable URL',
      expect.objectContaining({
        action: 'initializeExtension',
        stableUrl: `sanitized:${rawStableUrl}`,
      })
    );
    expect(globalThis.__NOTION_STABLE_URL__).toBe(rawStableUrl);
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
    globalThis.notionHighlighter = {
      createAndShowToolbar: jest.fn(),
    };
    const result2 = messageHandler({ action: 'showToolbar' }, {}, sendResponseMock2);
    expect(result2).toBe(true);
    expect(globalThis.notionHighlighter.createAndShowToolbar).toHaveBeenCalled();
    expect(sendResponseMock2).toHaveBeenCalledWith({ success: true });

    // showToolbar fail
    globalThis.notionHighlighter.createAndShowToolbar.mockImplementation(() => {
      throw new Error('boom');
    });
    messageHandler({ action: 'showToolbar' }, {}, sendResponseMock);
    expect(sendResponseMock).toHaveBeenCalledWith({ success: false, error: 'boom' });
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
});
