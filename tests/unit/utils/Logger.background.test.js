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
});
