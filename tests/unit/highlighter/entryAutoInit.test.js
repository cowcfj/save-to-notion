jest.mock('../../../scripts/highlighter/index.js', () => ({
  setupHighlighter: jest.fn(),
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

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    delete globalThis.HighlighterV2;
    delete globalThis.__NOTION_STABLE_URL__;

    globalThis.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      },
      storage: {
        sync: {
          get: jest.fn(),
        },
        onChanged: {
          addListener: jest.fn(),
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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockLogger.error).toHaveBeenCalledWith(
      '回退初始化失敗',
      expect.objectContaining({ action: 'setupHighlighter' })
    );
  });

  test('sendMessage 接收 SET_STABLE_URL 訊息 (waitForStableUrl 內)', async () => {
    // We want the Promise inside waitForStableUrl to resolve.
    // It's created inside the init execution.
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    let messageHandler;
    globalThis.chrome.runtime.onMessage.addListener.mockImplementation(handler => {
      messageHandler = handler;
    });

    require('../../../scripts/highlighter/entryAutoInit.js');

    // Simulate background worker sending the message quickly
    messageHandler({ action: 'SET_STABLE_URL', stableUrl: 'https://sent-from-bg.com' });
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://sent-from-bg.com');
  });

  test('sendMessage 接收 GET_STABLE_URL & showToolbar', async () => {
    globalThis.__NOTION_STABLE_URL__ = 'https://existing.com';
    globalThis.chrome.runtime.sendMessage.mockResolvedValueOnce(null);
    globalThis.chrome.storage.sync.get.mockResolvedValueOnce({});

    let messageHandler;
    globalThis.chrome.runtime.onMessage.addListener.mockImplementation(handler => {
      messageHandler = handler;
    });

    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
    let changedHandler;
    globalThis.chrome.storage.onChanged.addListener.mockImplementation(handler => {
      changedHandler = handler;
    });

    require('../../../scripts/highlighter/entryAutoInit.js');
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();

    globalThis.HighlighterV2 = {
      manager: {
        updateStyleMode: jest.fn(),
      },
    };

    changedHandler({ highlightStyle: { newValue: 'underline' } }, 'sync');
    expect(globalThis.HighlighterV2.manager.updateStyleMode).toHaveBeenCalledWith('underline');
  });
});
