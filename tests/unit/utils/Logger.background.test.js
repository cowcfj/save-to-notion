/**
 * @jest-environment node
 */

describe('Logger (背景環境整合測試)', () => {
  let mockAddEventListener;
  let consoleSpy;

  beforeEach(() => {
    jest.resetModules();

    // 在 Node 環境中，window 默認是 undefined，這符合 Logger.js 對 Background 環境的判斷條件
    // const isBackground = isExtensionContext && globalThis.window === undefined;

    // 模擬 self (Service Worker Global Scope)
    mockAddEventListener = jest.fn();
    globalThis.self = {
      addEventListener: mockAddEventListener,
    };

    // 模擬 chrome API
    globalThis.chrome = {
      runtime: {
        id: 'test-env',
        getManifest: jest.fn().mockReturnValue({ version: '1.0.0' }),
        sendMessage: jest.fn(),
      },
      storage: {
        sync: { get: jest.fn((_k, cb) => cb({})) },
        onChanged: { addListener: jest.fn() },
      },
    };

    // 模擬 console
    consoleSpy = {
      error: jest.spyOn(console, 'error').mockImplementation(),
    };

    // 載入 Logger 模組
    // 注意：這會執行模組頂層代碼，包括 initDebugState -> initGlobalErrorHandlers
    require('../../../scripts/utils/Logger.js');
  });

  afterEach(() => {
    delete globalThis.self;
    delete globalThis.chrome;
    // 清除全域 Logger
    delete globalThis.Logger;
    jest.restoreAllMocks();
  });

  test('應正確處理 unhandledrejection 事件 (當 reason 為 null 時)', () => {
    // 驗證是否註冊了 unhandledrejection 監聽器
    expect(mockAddEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    // 獲取監聽器回調
    const handler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'unhandledrejection'
    )[1];

    // 觸發事件：reason 為 null
    handler({ reason: null });

    // 驗證 console.error 被調用
    expect(consoleSpy.error).toHaveBeenCalled();
    const lastCall = consoleSpy.error.mock.calls.at(-1);

    // 驗證錯誤訊息包含 [Unhandled Rejection] 和 'null' 字串
    const fullMessage = lastCall.join(' ');
    expect(fullMessage).toContain('[Unhandled Rejection] null');

    // 驗證傳遞給 Logger 的上下文物件正確處理了 null
    const context = lastCall.find(
      arg => arg && typeof arg === 'object' && arg.reason !== undefined
    );
    expect(context).toBeDefined();
    expect(context.reason).toBe('null');
  });

  test('應正確處理 unhandledrejection 事件 (當 reason 為物件時)', () => {
    const handler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'unhandledrejection'
    )[1];
    const reasonObj = { error: 'test error', code: 500 };

    // 觸發事件：reason 為物件
    handler({ reason: reasonObj });

    const lastCall = consoleSpy.error.mock.calls.at(-1);
    const context = lastCall.find(
      arg => arg && typeof arg === 'object' && arg.reason !== undefined
    );

    // 驗證物件結構被保留 (不是字串化)
    expect(context.reason).toBe(reasonObj);
  });

  describe('addLogToBuffer (Background 模式)', () => {
    let TestLogger;

    beforeEach(() => {
      // 模擬在啟動時有開啟 debug mode 的標誌 (可透過 chrome storage get)
      globalThis.__NOTION_DEV_LOG_SINK = true;
      jest.isolateModules(() => {
        TestLogger = require('../../../scripts/utils/Logger.js').default;
      });
    });

    afterEach(() => {
      delete globalThis.__NOTION_DEV_LOG_SINK;
    });

    test('addLogToBuffer 正常運作：預設 source', () => {
      const buffer = TestLogger.getBuffer();
      expect(buffer).not.toBeNull();

      TestLogger.addLogToBuffer({ level: 'info', message: 'test msg 1', context: {} });
      const logs = buffer.getAll();
      const lastLog = logs.at(-1);

      expect(lastLog.message).toBe('test msg 1');
      expect(lastLog.source).toBe('unknown');
    });

    test('addLogToBuffer 正常運作：指定 source', () => {
      const buffer = TestLogger.getBuffer();
      TestLogger.addLogToBuffer({
        level: 'warn',
        message: 'test msg 2',
        context: {},
        source: '/test.html',
      });
      const logs = buffer.getAll();
      expect(logs.at(-1).source).toBe('/test.html');
    });

    test('addLogToBuffer 發生錯誤時應捕獲並記錄', () => {
      const buffer = TestLogger.getBuffer();
      const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});

      jest.spyOn(buffer, 'push').mockImplementationOnce(() => {
        throw new Error('Push exception');
      });

      TestLogger.addLogToBuffer({ level: 'error', message: 'err', context: {} });

      expect(spyError).toHaveBeenCalledWith(
        '添加外部日誌到緩衝區失敗',
        expect.objectContaining({ action: 'addLogToBuffer' })
      );
      spyError.mockRestore();
    });
  });
});
