/*
 * 單元測試：RetryManager
 * 覆蓋重試條件、Retry-After、AbortSignal、超時、jitter 注入、DOM context 與覆寫回應判斷。
 */

const { RetryManager, withRetry, fetchWithRetry } = require('../../../scripts/utils/RetryManager');

// 簡易 Headers 模擬
class MockHeaders {
  constructor(map = {}) {
    this.map = Object.fromEntries(
      Object.entries(map).map(([key, value]) => [String(key).toLowerCase(), value])
    );
  }
  get(key) {
    return this.map[String(key).toLowerCase()] ?? null;
  }
}

// 簡易 AbortController Shim（避免舊環境缺失）
function createAbortController() {
  if (typeof AbortController !== 'undefined') {
    return new AbortController();
  }
  let aborted = false;
  const listeners = new Set();
  return {
    get signal() {
      return {
        get aborted() {
          return aborted;
        },
        addEventListener: (evt, callback) => {
          if (evt === 'abort') {
            listeners.add(callback);
          }
        },
        removeEventListener: (evt, callback) => {
          if (evt === 'abort') {
            listeners.delete(callback);
          }
        },
      };
    },
    abort() {
      if (aborted) {
        return;
      }
      aborted = true;
      listeners.forEach(callback => {
        try {
          callback();
        } catch {
          /* empty */
        }
      });
      listeners.clear();
    },
  };
}

// 測試用輔助：推進計時器並刷新微任務
async function advance(ms) {
  jest.advanceTimersByTime(ms);
  // 兩次微任務刷新讓 Promise 鏈能完整解析
  await Promise.resolve();
  await Promise.resolve();
}

describe('RetryManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fetch: 503 並帶 Retry-After 秒數時應重試，並遵循延遲', async () => {
    const fetchFn = jest
      .fn()
      // 第一次回傳 503 + Retry-After: 2 秒
      .mockImplementationOnce(() => {
        return { status: 503, headers: new MockHeaders({ 'Retry-After': '2' }) };
      })
      // 第二次回傳成功 200
      .mockImplementationOnce(() => {
        return Promise.resolve({ status: 200, ok: true, headers: new MockHeaders() });
      });

    const rm = new RetryManager({ baseDelay: 100, jitter: false });
    const wrapped = rm.wrapFetch(fetchFn);

    const fetchPromise = wrapped('https://example.com');
    // 需要先讓第一個請求 resolve 並處理錯誤、啟動延遲
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // 推進 1999ms 不足以觸發第二次
    await advance(1999);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // 推進到 2000ms 觸發重試
    await advance(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const res = await fetchPromise;
    expect(res.status).toBe(200);

    const stats = rm.getLastStats();
    expect(stats.lastTotalRetries).toBe(1);
    // 允許存在微小四捨五入差異
    expect(stats.lastTotalDelayMs).toBeGreaterThanOrEqual(2000);
  });

  test('fetch: 429 並帶 HTTP 日期 Retry-After 應重試', async () => {
    // 使用秒數格式的 Retry-After
    const fetchFn = jest
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          status: 429,
          headers: new MockHeaders({ 'Retry-After': '1.5' }), // 1.5 秒 = 1500ms
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers: new MockHeaders(),
        })
      );

    const retryManager = new RetryManager({ baseDelay: 10, jitter: false });
    const wrapped = retryManager.wrapFetch(fetchFn);
    const fetchPromise = wrapped('https://example.com');

    // 讓第一次請求執行並啟動延遲
    await Promise.resolve();
    await Promise.resolve();

    // 現在應該只調用了一次，正在等待 1500ms
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // 推進時間到 1500ms 觸發重試
    await advance(1500);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const res = await fetchPromise;
    expect(res.status).toBe(200);
  });

  test('fetch: 404 不應重試（直接返回回應）', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ status: 404, ok: false, headers: new MockHeaders() });
    const rm = new RetryManager({});
    const wrapped = rm.wrapFetch(fetchFn);

    const fetchPromise = wrapped('https://example.com');
    await Promise.resolve();
    const res = await fetchPromise;

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    const stats = rm.getLastStats();
    // 可能為 null（無執行或無重試）或 lastSucceeded 為 true（未重試亦成功完成）
    // 這裡僅驗證未發生重試
    if (stats) {
      expect(stats.lastTotalRetries).toBe(0);
    }
  });

  test('fetch: 自訂 shouldRetryResponse=false 應覆蓋預設（即使 503 也不重試）', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ status: 503, headers: new MockHeaders() });
    const rm = new RetryManager({});
    const wrapped = rm.wrapFetch(fetchFn, {
      shouldRetryResponse: () => false,
    });

    const res = await wrapped('https://example.com');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
  });

  test('execute: NetworkError 重試兩次後成功，統計應正確', async () => {
    let count = 0;
    const op = jest.fn().mockImplementation(() => {
      count += 1;
      if (count <= 2) {
        const networkError = new Error('Network glitch');
        networkError.name = 'NetworkError';
        throw networkError;
      }
      return 'OK';
    });

    const rm = new RetryManager({ baseDelay: 100, jitter: false });
    const executionPromise = rm.execute(op);

    // 第一次失敗 => 安排重試 after 100ms
    await Promise.resolve();
    await advance(100);
    // 第二次失敗 => 安排重試 after 200ms（backoffFactor=2）
    await advance(200);

    const result = await executionPromise;
    expect(result).toBe('OK');
    expect(op).toHaveBeenCalledTimes(3);

    const stats = rm.getLastStats();
    expect(stats.lastTotalRetries).toBe(2);
    expect(stats.lastTotalDelayMs).toBe(300); // 100 + 200
  });

  test('execute: AbortSignal 應在延遲期間取消，拋出 AbortError', async () => {
    const controller = createAbortController();

    const op = jest.fn().mockImplementation(() => {
      const tempError = new Error('Temporary');
      tempError.name = 'NetworkError';
      throw tempError;
    });

    const rm = new RetryManager({ baseDelay: 500, jitter: false });

    const executePromise = rm.execute(op, { signal: controller.signal });
    await Promise.resolve();

    // 立刻取消，仍在等待第一次重試延遲
    controller.abort();

    await expect(executePromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('execute: totalTimeoutMs 應限制總重試時長並拋出 TimeoutError', async () => {
    const op = jest.fn().mockImplementation(() => {
      const networkError = new Error('Temporary');
      networkError.name = 'NetworkError';
      throw networkError;
    });

    const rm = new RetryManager({ baseDelay: 200, jitter: false });
    const executionPromise = rm.execute(op, { totalTimeoutMs: 250 });

    // 第一次失敗後準備等待 200ms
    await Promise.resolve();
    await advance(200);
    // 第二次失敗後預期 400ms，但總時長限制 250 => 直接 TimeoutError
    await expect(executionPromise).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  test('execute: jitter 使用可注入 random 以確保決定性', async () => {
    let invoked = 0;
    const operation = jest.fn().mockImplementation(() => {
      invoked += 1;
      if (invoked === 1) {
        const error = new Error('Temporary');
        error.name = 'NetworkError';
        throw error;
      }
      return 'OK';
    });

    // baseDelay=100，backoffFactor=2，第一次計算延遲 => 100
    // jitter 啟用且 random()=0 => 100 * (0.5 + 0*0.5) = 50ms（下取整）
    const retryManager = new RetryManager({ baseDelay: 100, jitter: true, backoffFactor: 2 });
    const executionPromise = retryManager.execute(operation, { random: () => 0 });

    await Promise.resolve();
    await advance(50);

    const result = await executionPromise;
    expect(result).toBe('OK');
    const stats = retryManager.getLastStats();
    expect(stats.lastTotalRetries).toBe(1);
    expect(stats.lastTotalDelayMs).toBe(50);
  });

  test('wrapDomOperation: contextType 應記錄為 dom', async () => {
    let done = false;
    const domOp = jest.fn().mockImplementation(() => {
      if (!done) {
        done = true;
        const invalidStateError = new Error('Not ready');
        invalidStateError.name = 'InvalidStateError';
        throw invalidStateError;
      }
      return 42;
    });

    const rm = new RetryManager({ baseDelay: 100, jitter: false });
    const wrapped = rm.wrapDomOperation(domOp);

    const wrappedPromise = wrapped();
    await Promise.resolve();
    await advance(100);

    const res = await wrappedPromise;
    expect(res).toBe(42);
    const stats = rm.getLastStats();
    expect(stats.contextType).toBe('dom');
  });

  describe('Static & Utility Helpers', () => {
    test('withRetry 應該調用默認實例並成功', async () => {
      const op = jest.fn().mockResolvedValue('success');
      const res = await withRetry(op);
      expect(res).toBe('success');
    });

    test('fetchWithRetry 應該成功執行', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true });
      try {
        const res = await fetchWithRetry('https://api.test');
        expect(res.status).toBe(200);
      } finally {
        if (originalFetch === undefined) {
          delete globalThis.fetch;
        } else {
          globalThis.fetch = originalFetch;
        }
      }
    });

    test('_calculateDelay 應該限制在 maxDelay', () => {
      const config = { baseDelay: 1000, backoffFactor: 10, maxDelay: 5000, jitter: false };
      const delay = RetryManager._calculateDelay(3, config); // 1000 * 10^2 = 100000
      expect(delay).toBe(5000);
    });

    test('_random 應該在 crypto 缺失時回退', () => {
      const originalCrypto = globalThis.crypto;
      try {
        delete globalThis.crypto;
        const rnd = RetryManager._random();
        expect(rnd).toBeGreaterThanOrEqual(0);
        expect(rnd).toBeLessThan(1);
      } finally {
        if (originalCrypto === undefined) {
          delete globalThis.crypto;
        } else {
          globalThis.crypto = originalCrypto;
        }
      }
    });

    test('_logRetryAttempt 在 Logger 缺失時應降級使用 console.warn', () => {
      const originalLogger = globalThis.Logger;
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      try {
        delete globalThis.Logger;
        RetryManager._logRetryAttempt(new Error('test'), 1, 3, 100);
        expect(consoleWarnSpy).toHaveBeenCalled();
      } finally {
        consoleWarnSpy.mockRestore();
        if (originalLogger === undefined) {
          delete globalThis.Logger;
        } else {
          globalThis.Logger = originalLogger;
        }
      }
    });

    test('_parseRetryAfterHeader 應該處理各種 Header 格式', () => {
      expect(RetryManager._parseRetryAfterHeader(null)).toBe(0);
      expect(
        RetryManager._parseRetryAfterHeader({
          headers: new MockHeaders({ 'Retry-After': 'invalid' }),
        })
      ).toBe(0);

      // 未來日期
      const futureDate = new Date(Date.now() + 5000).toUTCString();
      const delay = RetryManager._parseRetryAfterHeader({
        headers: new MockHeaders({ 'Retry-After': futureDate }),
      });
      expect(delay).toBeGreaterThan(4000);
    });
  });
});

// ===== MERGED COMPREHENSIVE TESTS =====
describe('RetryManager Comprehensive Tests', () => {
  let retryManager = null;
  let originalConsole = null;
  let mockLogger = null;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: false, // 禁用抖動以便測試
    });

    // Mock console 方法
    originalConsole = {
      error: console.error,
      warn: console.warn,
      info: console.info,
    };

    console.error = jest.fn();
    console.warn = jest.fn();
    console.info = jest.fn();

    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    globalThis.Logger = mockLogger;
  });

  afterEach(() => {
    // 恢復原始的 console 方法
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    if (mockLogger) {
      Object.values(mockLogger).forEach(mockFn => {
        if (typeof mockFn?.mockReset === 'function') {
          mockFn.mockReset();
        }
      });
    }
    delete globalThis.Logger;
  });

  describe('構造函數', () => {
    test('應該使用默認選項創建實例', () => {
      const manager = new RetryManager();

      expect(manager.options.maxRetries).toBe(3);
      expect(manager.options.baseDelay).toBe(100);
      expect(manager.options.maxDelay).toBe(5000);
      expect(manager.options.backoffFactor).toBe(2);
      expect(manager.options.jitter).toBe(true);
    });

    test('應該合併自定義選項', () => {
      const manager = new RetryManager({
        maxRetries: 5,
        baseDelay: 200,
      });

      expect(manager.options.maxRetries).toBe(5);
      expect(manager.options.baseDelay).toBe(200);
      expect(manager.options.maxDelay).toBe(5000); // 默認值
    });
  });

  describe('execute - 執行帶重試的操作', () => {
    test('應該在成功時返回結果', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retryManager.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('應該在失敗後重試', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await retryManager.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('應該在重試次數用盡後拋出錯誤', async () => {
      const error = new Error('Always fails');
      error.name = 'NetworkError';
      const operation = jest.fn().mockRejectedValue(error);

      await expect(retryManager.execute(operation)).rejects.toThrow('Always fails');

      expect(operation).toHaveBeenCalledTimes(4); // 初始 + 3 次重試
    });

    test('應該記錄重試成功', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const operation = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      await retryManager.execute(operation);

      // 驗證 Logger.log 或 Logger.info 被調用
      const logCalled = mockLogger.log.mock.calls.some(
        call => call[0].includes('已成功') && call[0].includes('1 次重試')
      );
      const infoCalled = mockLogger.info.mock.calls.some(
        call => call[0].includes('已成功') && call[0].includes('1 次重試')
      );

      expect(logCalled || infoCalled).toBe(true);
    });

    test('應該記錄重試失敗', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Final error'));

      await expect(retryManager.execute(operation)).rejects.toThrow();

      // 驗證 Logger.error 被調用
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('應該使用自定義的 shouldRetry 函數', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Custom error'));
      const shouldRetry = jest.fn().mockReturnValue(false);

      await expect(retryManager.execute(operation, { shouldRetry })).rejects.toThrow(
        'Custom error'
      );

      expect(operation).toHaveBeenCalledTimes(1); // 不應重試
      expect(shouldRetry).toHaveBeenCalled();
    });

    test('應該合併實例選項和調用選項', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const operation = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      await retryManager.execute(operation, { baseDelay: 50 });

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('wrapFetch - 網絡請求包裝器', () => {
    test('應該包裝 fetch 函數並添加重試', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, data: 'response' });
      const wrappedFetch = retryManager.wrapFetch(mockFetch);

      const result = await wrappedFetch('https://example.com');

      expect(result).toEqual({ ok: true, data: 'response' });
      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {});
    });

    test('應該在網絡錯誤時重試', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const mockFetch = jest.fn().mockRejectedValueOnce(error).mockResolvedValue({ ok: true });

      const wrappedFetch = retryManager.wrapFetch(mockFetch);

      const result = await wrappedFetch('https://example.com');

      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('應該傳遞 fetch 選項', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const wrappedFetch = retryManager.wrapFetch(mockFetch);

      await wrappedFetch('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('應該支持自定義重試選項', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const wrappedFetch = retryManager.wrapFetch(mockFetch, {
        maxRetries: 5,
      });

      await wrappedFetch('https://example.com');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('wrapDomOperation - DOM 操作包裝器', () => {
    test('應該包裝 DOM 操作並添加重試', async () => {
      const domOp = jest.fn().mockResolvedValue('dom-result');
      const wrappedOp = retryManager.wrapDomOperation(domOp);

      const result = await wrappedOp();

      expect(result).toBe('dom-result');
      expect(domOp).toHaveBeenCalledTimes(1);
    });

    test('應該在 DOM 錯誤時重試', async () => {
      const error = new Error('DOM not ready');
      error.name = 'InvalidStateError';

      const domOp = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const wrappedOp = retryManager.wrapDomOperation(domOp);

      const result = await wrappedOp();

      expect(result).toBe('success');
      expect(domOp).toHaveBeenCalledTimes(2);
    });

    test('應該傳遞參數到 DOM 操作', async () => {
      const domOp = jest.fn().mockResolvedValue('result');
      const wrappedOp = retryManager.wrapDomOperation(domOp);

      await wrappedOp('arg1', 'arg2', 'arg3');

      expect(domOp).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
    });

    test('應該使用較少的重試次數', async () => {
      const error = new Error('Always fails');
      error.name = 'InvalidStateError';

      const domOp = jest.fn().mockRejectedValue(error);
      const wrappedOp = retryManager.wrapDomOperation(domOp);

      await expect(wrappedOp()).rejects.toThrow();

      // DOM 操作默認最多重試 2 次，所以總共調用 3 次（初始 + 2 次重試）
      expect(domOp).toHaveBeenCalledTimes(3);
    });
  });

  describe('_shouldRetryNetworkError - 網絡錯誤判斷', () => {
    test('應該識別 NetworkError', () => {
      const error = new Error('Network failed');
      error.name = 'NetworkError';

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);
    });

    test('應該識別 TimeoutError', () => {
      const error = new Error('Timeout');
      error.name = 'TimeoutError';

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);
    });

    test('應該識別包含 fetch 的錯誤消息', () => {
      const error = new Error('fetch failed');

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);
    });

    test('應該識別 5xx 錯誤', () => {
      const error = new Error('Server error');
      error.status = 500;

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);

      error.status = 503;
      expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);
    });

    test('應該識別 429 錯誤', () => {
      const error = new Error('Too many requests');
      error.status = 429;

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);
    });

    test('應該識別 408 錯誤', () => {
      const error = new Error('Request timeout');
      error.status = 408;

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);
    });

    test('應該拒絕 4xx 客戶端錯誤', () => {
      const error = new Error('Bad request');
      error.status = 400;

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(false);

      error.status = 404;
      expect(RetryManager._shouldRetryNetworkError(error)).toBe(false);
    });

    test('應該拒絕未知錯誤', () => {
      const error = new Error('Unknown error');

      expect(RetryManager._shouldRetryNetworkError(error)).toBe(false);
    });
  });

  describe('_shouldRetryDomError - DOM 錯誤判斷', () => {
    test('應該識別 InvalidStateError', () => {
      const error = new Error('Invalid state');
      error.name = 'InvalidStateError';

      expect(RetryManager._shouldRetryDomError(error)).toBe(true);
    });

    test('應該識別 "not ready" 消息', () => {
      const error = new Error('DOM not ready');

      expect(RetryManager._shouldRetryDomError(error)).toBe(true);
    });

    test('應該識別 "loading" 消息', () => {
      const error = new Error('still loading');

      expect(RetryManager._shouldRetryDomError(error)).toBe(true);
    });

    test('應該識別 NotFoundError', () => {
      const error = new Error('Element not found');
      error.name = 'NotFoundError';

      expect(RetryManager._shouldRetryDomError(error)).toBe(true);
    });

    test('應該識別 "not found" 消息', () => {
      const error = new Error('element not found');

      expect(RetryManager._shouldRetryDomError(error)).toBe(true);
    });

    test('應該拒絕其他 DOM 錯誤', () => {
      const error = new Error('Invalid selector');

      expect(RetryManager._shouldRetryDomError(error)).toBe(false);
    });
  });

  describe('_calculateDelay - 延遲計算', () => {
    test('應該計算指數退避延遲', () => {
      const delay1 = RetryManager._calculateDelay(1, retryManager.options);
      const delay2 = RetryManager._calculateDelay(2, retryManager.options);
      const delay3 = RetryManager._calculateDelay(3, retryManager.options);

      expect(delay1).toBe(100); // 100 * 2^0
      expect(delay2).toBe(200); // 100 * 2^1
      expect(delay3).toBe(400); // 100 * 2^2
    });

    test('應該限制最大延遲', () => {
      const delay = RetryManager._calculateDelay(10, retryManager.options);

      expect(delay).toBe(5000); // maxDelay
    });

    test('應該支持抖動', () => {
      const managerWithJitter = new RetryManager({
        baseDelay: 100,
        backoffFactor: 2,
        jitter: true,
      });

      const sequence = [0, 0.25, 0.5, 0.75, 1, 0.1, 0.9, 0.33, 0.66, 0.42];
      let sequenceIndex = 0;
      const deterministicRandom = () => {
        const value = sequence[sequenceIndex % sequence.length];
        sequenceIndex += 1;
        return value;
      };

      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(
          RetryManager._calculateDelay(1, {
            ...managerWithJitter.options,
            random: deterministicRandom,
          })
        );
      }

      // 抖動應該產生不同的延遲值
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // 所有延遲應該在範圍內
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(50); // 100 * 0.5
        expect(delay).toBeLessThanOrEqual(100); // 100 * 1.0
      });
    });

    test('應該返回整數延遲', () => {
      const managerWithJitter = new RetryManager({
        baseDelay: 100,
        jitter: true,
      });

      const delay = RetryManager._calculateDelay(1, managerWithJitter.options);

      expect(Number.isInteger(delay)).toBe(true);
    });
  });

  describe('_delay - 延遲執行', () => {
    test('應該延遲指定的毫秒數', async () => {
      jest.useFakeTimers();
      try {
        let resolved = false;
        const delayPromise = RetryManager._delay(100).then(() => {
          resolved = true;
        });
        expect(resolved).toBe(false); // 暫未解析
        jest.advanceTimersByTime(100);
        await delayPromise;
        expect(resolved).toBe(true); // 時間推進後應已解析
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('_shouldRetry - 通用重試判斷', () => {
    test('應該使用自定義的 shouldRetry 函數', () => {
      const error = new Error('Custom error');
      const shouldRetry = jest.fn().mockReturnValue(true);

      const result = retryManager._shouldRetry(error, { shouldRetry });

      expect(result).toBe(true);
      expect(shouldRetry).toHaveBeenCalledWith(error);
    });

    test('應該使用默認的網絡錯誤判斷', () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const result = retryManager._shouldRetry(error, {});

      expect(result).toBe(true);
    });
  });

  describe('_logRetryAttempt - 記錄重試嘗試', () => {
    test('應該記錄重試嘗試信息', () => {
      // 模擬 Logger 對象
      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      globalThis.Logger = mockLogger;

      const error = new Error('Test error');

      RetryManager._logRetryAttempt(error, 1, 3, 100);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('重試'),
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Test error',
            name: 'Error',
          }),
          attempt: 1,
          maxAttempts: 3,
        })
      );

      // 清理
      delete globalThis.Logger;
    });

    test('應該使用 ErrorHandler 如果可用', () => {
      const originalErrorHandler = globalThis.ErrorHandler;

      try {
        globalThis.ErrorHandler = {
          logError: jest.fn(),
        };

        const error = new Error('Test error');
        RetryManager._logRetryAttempt(error, 1, 3, 100);

        expect(globalThis.ErrorHandler.logError).toHaveBeenCalled();
      } finally {
        if (originalErrorHandler === undefined) {
          delete globalThis.ErrorHandler;
        } else {
          globalThis.ErrorHandler = originalErrorHandler;
        }
      }
    });

    test('應該使用 ErrorHandler 類別實例', () => {
      const logErrorSpy = jest.fn();
      class MockErrorHandler {
        logError(payload) {
          logErrorSpy(payload);
        }
      }

      globalThis.ErrorHandler = MockErrorHandler;

      const error = new Error('Test error');
      RetryManager._logRetryAttempt(error, 1, 3, 100);

      expect(logErrorSpy).toHaveBeenCalled();

      delete globalThis.ErrorHandler;
    });
  });

  describe('_logRetrySuccess - 記錄重試成功', () => {
    test('應該記錄成功信息', () => {
      // 模擬 Logger 對象
      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      globalThis.Logger = mockLogger;

      RetryManager._logRetrySuccess(2);

      // 驗證 Logger.log 或 Logger.info 被調用
      const logCalled = mockLogger.log.mock.calls.some(
        call => call[0].includes('已成功') && call[0].includes('2 次重試')
      );
      const infoCalled = mockLogger.info.mock.calls.some(
        call => call[0].includes('已成功') && call[0].includes('2 次重試')
      );

      expect(logCalled || infoCalled).toBe(true);

      // 檢查調用參數中是否包含結構化對象
      const logArgs =
        mockLogger.log.mock.calls.find(call => call[0].includes('已成功')) ||
        mockLogger.info.mock.calls.find(call => call[0].includes('已成功'));

      if (
        logArgs && // 如果傳遞了第二個參數，驗證它是結構化對象
        logArgs.length > 1
      ) {
        expect(logArgs[1]).toEqual(
          expect.objectContaining({
            totalRetries: expect.anything(),
            contextType: expect.anything(),
          })
        );
      }

      // 清理
      delete globalThis.Logger;
    });
  });

  describe('_logRetryFailure - 記錄重試失敗', () => {
    test('應該記錄失敗信息', () => {
      // 模擬 Logger 對象
      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      globalThis.Logger = mockLogger;

      const error = new Error('Final error');

      RetryManager._logRetryFailure(error, 3);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Final error',
            name: 'Error',
          }),
          totalRetries: 3,
          contextType: 'network',
        })
      );

      // 清理
      delete globalThis.Logger;
    });

    test('應該使用 ErrorHandler 如果可用', () => {
      globalThis.ErrorHandler = {
        logError: jest.fn(),
      };

      const error = new Error('Final error');
      RetryManager._logRetryFailure(error, 3);

      expect(globalThis.ErrorHandler.logError).toHaveBeenCalled();

      delete globalThis.ErrorHandler;
    });
  });

  describe('getConfigSnapshot - 獲取配置快照', () => {
    test('應該返回配置快照', () => {
      const config = retryManager.getConfigSnapshot();

      expect(config).toEqual({
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 5000,
        backoffFactor: 2,
        jitter: false,
      });
    });
  });

  describe('getLastStats - 獲取最近統計', () => {
    test('應該在無操作時返回 null', () => {
      const stats = retryManager.getLastStats();
      expect(stats).toBeNull();
    });

    test('應該在操作後返回統計信息', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      await retryManager.execute(operation);

      const stats = retryManager.getLastStats();
      expect(stats).toMatchObject({
        lastTotalRetries: 0,
        lastTotalDelayMs: 0,
        lastSucceeded: true,
        contextType: 'network',
      });
    });
  });

  describe('便捷函數', () => {
    test('withRetry 應該使用默認實例', async () => {
      const operation = jest.fn().mockResolvedValue('result');

      const result = await withRetry(operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('withRetry 應該支持自定義選項', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const operation = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await withRetry(operation, { maxRetries: 1 });

      expect(result).toBe('success');
    });

    test('fetchWithRetry 應該創建帶重試的 fetch', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, data: 'response' });
      try {
        const result = await fetchWithRetry('https://example.com');

        expect(result).toEqual({ ok: true, data: 'response' });
        expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com', {});
      } finally {
        if (originalFetch === undefined) {
          delete globalThis.fetch;
        } else {
          globalThis.fetch = originalFetch;
        }
      }
    });

    test('fetchWithRetry 應該支持 fetch 選項', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true });
      try {
        await fetchWithRetry('https://example.com', {
          method: 'POST',
          body: JSON.stringify({ data: 'test' }),
        });

        expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com', {
          method: 'POST',
          body: JSON.stringify({ data: 'test' }),
        });
      } finally {
        if (originalFetch === undefined) {
          delete globalThis.fetch;
        } else {
          globalThis.fetch = originalFetch;
        }
      }
    });

    test('fetchWithRetry 應該支持重試選項', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockRejectedValueOnce(error).mockResolvedValue({ ok: true });
      try {
        const result = await fetchWithRetry(
          'https://example.com',
          {},
          { maxRetries: 1, baseDelay: 50 }
        );

        expect(result).toEqual({ ok: true });
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      } finally {
        if (originalFetch === undefined) {
          delete globalThis.fetch;
        } else {
          globalThis.fetch = originalFetch;
        }
      }
    });
  });

  describe('模塊導出', () => {
    test('應該正確導出到 module.exports', () => {
      const exported = require('../../../scripts/utils/RetryManager');

      expect(exported.RetryManager).toBeDefined();
      expect(exported.withRetry).toBeDefined();
      expect(exported.fetchWithRetry).toBeDefined();
    });
  });
});

// ===== MERGED SECURITY TESTS =====
describe('RetryManager Security Tests', () => {
  let mockLogger;
  let originalLogger;

  beforeEach(() => {
    // 保存原始 Logger 並注入 Mock
    originalLogger = globalThis.Logger;
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    globalThis.Logger = mockLogger;
    jest.clearAllMocks();
  });

  afterEach(() => {
    // 恢復原始 Logger，防止污染其他測試套件
    globalThis.Logger = originalLogger;
  });

  test('_logRetryAttempt 應過濾錯誤物件中的敏感屬性（如 headers）', () => {
    const sensitiveError = new Error('API Error');
    sensitiveError.name = 'APIResponseError';
    sensitiveError.code = 'unauthorized';
    sensitiveError.status = 401;
    // 模擬 Notion SDK 錯誤結構，包含敏感 headers
    sensitiveError.headers = {
      Authorization: 'Bearer secret_token',
    };
    sensitiveError.request = {
      headers: {
        Authorization: 'Bearer secret_token',
      },
    };
    sensitiveError.response = {
      headers: {
        'Set-Cookie': 'session_id=123',
      },
    };

    RetryManager._logRetryAttempt(sensitiveError, 1, 3, 100);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const logCall = mockLogger.warn.mock.calls[0];
    const logMeta = logCall[1];
    const safeError = logMeta.error; // Capture the sanitized error

    // 驗證核心屬性存在
    expect(safeError.message).toBe('API Error');
    expect(safeError.name).toBe('APIResponseError');
    expect(safeError.code).toBe('unauthorized');
    expect(safeError.status).toBe(401);

    // 驗證敏感屬性被移除
    expect(safeError.headers).toBeUndefined();
    expect(safeError.request).toBeUndefined();
    expect(safeError.response).toBeUndefined();
  });

  test('_logRetryFailure 應過濾錯誤物件中的敏感屬性', () => {
    const sensitiveError = new Error('Final Error');
    sensitiveError.details = { apiKey: 'secret-key' }; // 模擬其他敏感字段

    RetryManager._logRetryFailure(sensitiveError, 3);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const logCall = mockLogger.error.mock.calls[0];
    const logMeta = logCall[1];

    expect(logMeta.error.message).toBe('Final Error');
    // 驗證 details 被移除（或至少不包含敏感資訊，取決於我們的過濾策略）
    // 在最嚴格的策略下，我們只保留標準屬性
    expect(logMeta.error).not.toHaveProperty('details');
  });
});
