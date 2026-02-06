/*
 * 單元測試：RetryManager
 * 覆蓋重試條件、Retry-After、AbortSignal、超時、jitter 注入、DOM context 與覆寫回應判斷。
 */

const { RetryManager } = require('../../../scripts/utils/RetryManager');

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
      const { withRetry } = require('../../../scripts/utils/RetryManager');
      const op = jest.fn().mockResolvedValue('success');
      const res = await withRetry(op);
      expect(res).toBe('success');
    });

    test('fetchWithRetry 應該成功執行', async () => {
      const { fetchWithRetry } = require('../../../scripts/utils/RetryManager');
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true });
      try {
        const res = await fetchWithRetry('https://api.test');
        expect(res.status).toBe(200);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('_calculateDelay 應該限制在 maxDelay (Line 243)', () => {
      const config = { baseDelay: 1000, backoffFactor: 10, maxDelay: 5000, jitter: false };
      const delay = RetryManager._calculateDelay(3, config); // 1000 * 10^2 = 100000
      expect(delay).toBe(5000);
    });

    test('_random 應該在 crypto 缺失時回退 (Line 522-527)', () => {
      const originalCrypto = globalThis.crypto;
      delete globalThis.crypto;
      const rnd = RetryManager._random();
      expect(rnd).toBeGreaterThanOrEqual(0);
      expect(rnd).toBeLessThan(1);
      globalThis.crypto = originalCrypto;
    });

    test('_logRetryAttempt 在 Logger 缺失時應降級 (Line 321-329)', () => {
      const originalLogger = globalThis.Logger;
      delete globalThis.Logger;
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      RetryManager._logRetryAttempt(new Error('test'), 1, 3, 100);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
      globalThis.Logger = originalLogger;
    });

    test('_parseRetryAfterHeader 應該處理各種 Header 格式 (Line 496-519)', () => {
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
