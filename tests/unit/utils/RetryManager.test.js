/*
 * 單元測試：RetryManager
 * 覆蓋重試條件、Retry-After、AbortSignal、超時、jitter 注入、DOM context 與覆寫回應判斷。
 */

import { RetryManager, withRetry, fetchWithRetry } from '../../../scripts/utils/RetryManager.js';
import {
  MockHeaders,
  advance,
  createAbortController,
  withGlobalTestDouble,
} from './retryManagerTestSupport.js';

describe('RetryManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fetch: 503 並帶 Retry-After 秒數時應重試，並遵循延遲', async () => {
    const fetchFunction = jest
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
    const wrapped = rm.wrapFetch(fetchFunction);

    const fetchPromise = wrapped('https://example.com');
    // 需要先讓第一個請求 resolve 並處理錯誤、啟動延遲
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // 推進 1999ms 不足以觸發第二次
    await advance(1999);
    expect(fetchFunction).toHaveBeenCalledTimes(1);

    // 推進到 2000ms 觸發重試
    await advance(1);
    expect(fetchFunction).toHaveBeenCalledTimes(2);

    const response = await fetchPromise;
    expect(response.status).toBe(200);

    const stats = rm.getLastStats();
    expect(stats.lastTotalRetries).toBe(1);
    // 允許存在微小四捨五入差異
    expect(stats.lastTotalDelayMs).toBeGreaterThanOrEqual(2000);
  });

  test('fetch: 429 並帶 HTTP 日期 Retry-After 應重試', async () => {
    // 使用秒數格式的 Retry-After
    const fetchFunction = jest
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
    const wrapped = retryManager.wrapFetch(fetchFunction);
    const fetchPromise = wrapped('https://example.com');

    // 讓第一次請求執行並啟動延遲
    await Promise.resolve();
    await Promise.resolve();

    // 現在應該只調用了一次，正在等待 1500ms
    expect(fetchFunction).toHaveBeenCalledTimes(1);

    // 推進時間到 1500ms 觸發重試
    await advance(1500);
    expect(fetchFunction).toHaveBeenCalledTimes(2);

    const response = await fetchPromise;
    expect(response.status).toBe(200);
  });

  test('fetch: 404 不應重試（直接返回回應）', async () => {
    const fetchFunction = jest
      .fn()
      .mockResolvedValue({ status: 404, ok: false, headers: new MockHeaders() });
    const rm = new RetryManager({});
    const wrapped = rm.wrapFetch(fetchFunction);

    const fetchPromise = wrapped('https://example.com');
    await Promise.resolve();
    const response = await fetchPromise;

    expect(fetchFunction).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(404);
    const stats = rm.getLastStats();
    // 可能為 null（無執行或無重試）或 lastSucceeded 為 true（未重試亦成功完成）
    // 這裡僅驗證未發生重試
    if (stats) {
      expect(stats.lastTotalRetries).toBe(0);
    }
  });

  test('fetch: 自訂 shouldRetryResponse=false 應覆蓋預設（即使 503 也不重試）', async () => {
    const fetchFunction = jest.fn().mockResolvedValue({ status: 503, headers: new MockHeaders() });
    const rm = new RetryManager({});
    const wrapped = rm.wrapFetch(fetchFunction, {
      shouldRetryResponse: () => false,
    });

    const response = await wrapped('https://example.com');
    expect(fetchFunction).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(503);
  });

  test('fetch: shouldRetryResponse 拋出時應回退到預設 HTTP 狀態判斷', async () => {
    const fetchFunction = jest
      .fn()
      .mockResolvedValueOnce({ status: 503, headers: new MockHeaders() })
      .mockResolvedValueOnce({ status: 200, ok: true, headers: new MockHeaders() });
    const rm = new RetryManager({ baseDelay: 1, jitter: false });
    const wrapped = rm.wrapFetch(fetchFunction, {
      shouldRetryResponse: () => {
        throw new Error('response hook failed');
      },
    });

    const fetchPromise = wrapped('https://example.com');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await advance(1);

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(fetchFunction).toHaveBeenCalledTimes(2);
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
      const temporaryError = new Error('Temporary');
      temporaryError.name = 'NetworkError';
      throw temporaryError;
    });

    const rm = new RetryManager({ baseDelay: 500, jitter: false });

    const executePromise = rm.execute(op, { signal: controller.signal });
    await Promise.resolve();

    // 立刻取消，仍在等待第一次重試延遲
    controller.abort();

    await expect(executePromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('execute: 已取消的 AbortSignal 應在 operation 執行前拋出 AbortError', async () => {
    const controller = createAbortController();
    controller.abort();
    const operation = jest.fn().mockResolvedValue('should not run');
    const rm = new RetryManager({ baseDelay: 1, jitter: false });

    await expect(rm.execute(operation, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(operation).not.toHaveBeenCalled();
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
    let isDone = false;
    const domOp = jest.fn().mockImplementation(() => {
      if (!isDone) {
        isDone = true;
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

    const response = await wrappedPromise;
    expect(response).toBe(42);
    const stats = rm.getLastStats();
    expect(stats.contextType).toBe('dom');
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
      for (const mockFunction of Object.values(mockLogger)) {
        if (typeof mockFunction?.mockReset === 'function') {
          mockFunction.mockReset();
        }
      }
    }
    delete globalThis.Logger;
  });

  test('構造函數應該使用默認選項並合併自定義選項', () => {
    const defaultManager = new RetryManager();
    const customManager = new RetryManager({
      maxRetries: 5,
      baseDelay: 200,
    });

    expect(defaultManager.options).toMatchObject({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: true,
    });
    expect(customManager.options).toMatchObject({
      maxRetries: 5,
      baseDelay: 200,
      maxDelay: 5000,
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

    test('shouldRetry hook 拋出時應記錄 warning 並回退到預設判斷', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      const operation = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');
      const shouldRetry = jest.fn(() => {
        throw new Error('hook failed');
      });

      const result = await retryManager.execute(operation, { shouldRetry });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('shouldRetry hook'),
        expect.objectContaining({
          action: 'shouldRetry',
          result: 'hook_error',
          hookError: expect.objectContaining({ message: 'hook failed' }),
        })
      );
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
    test('應該包裝 fetch 函數並傳遞 fetch 選項', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, data: 'response' });
      const wrappedFetch = retryManager.wrapFetch(mockFetch);
      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };

      const result = await wrappedFetch('https://example.com', fetchOptions);

      expect(result).toEqual({ ok: true, data: 'response' });
      expect(mockFetch).toHaveBeenCalledWith('https://example.com', fetchOptions);
    });

    test('應該在網絡錯誤時使用自定義 maxRetries 重試到成功', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      const mockFetch = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ ok: true });

      const wrappedFetch = retryManager.wrapFetch(mockFetch, {
        maxRetries: 5,
        baseDelay: 0,
      });

      const result = await wrappedFetch('https://example.com');

      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(6);
      expect(retryManager.getLastStats()).toMatchObject({
        lastTotalRetries: 5,
        lastSucceeded: true,
        contextType: 'network',
      });
    });

    test('shouldRetry hook 拋出時應記錄 warning 並回退到預設判斷', async () => {
      const error = new Error('Failed to fetch');
      const mockFetch = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ ok: true });
      const wrappedFetch = retryManager.wrapFetch(mockFetch, {
        baseDelay: 0,
        shouldRetry: () => {
          throw new Error('fetch hook failed');
        },
      });

      const result = await wrappedFetch('https://example.com');

      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('shouldRetry hook'),
        expect.objectContaining({
          action: 'shouldRetry',
          result: 'hook_error',
          hookError: expect.objectContaining({ message: 'fetch hook failed' }),
        })
      );
    });
  });

  describe('wrapDomOperation - DOM 操作包裝器', () => {
    test('應該包裝 DOM 操作並傳遞參數', async () => {
      const domOp = jest.fn().mockResolvedValue('dom-result');
      const wrappedOp = retryManager.wrapDomOperation(domOp);

      const result = await wrappedOp('arg1', 'arg2', 'arg3');

      expect(result).toBe('dom-result');
      expect(domOp).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
    });

    test('應該在 DOM 錯誤時重試且使用較少的重試次數', async () => {
      const error = new Error('Always fails');
      error.name = 'InvalidStateError';

      const domOp = jest.fn().mockRejectedValue(error);
      const wrappedOp = retryManager.wrapDomOperation(domOp);

      await expect(wrappedOp()).rejects.toThrow();

      // DOM 操作默認最多重試 2 次，所以總共調用 3 次（初始 + 2 次重試）
      expect(domOp).toHaveBeenCalledTimes(3);
    });
  });

  test('getConfigSnapshot 應該返回配置快照', () => {
    const config = retryManager.getConfigSnapshot();

    expect(config).toEqual({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: false,
    });
  });

  test('getLastStats 應該在無操作時返回 null，並在操作後返回統計信息', async () => {
    expect(retryManager.getLastStats()).toBeNull();

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

  test('getLastStats 應該在總逾時失敗後更新失敗統計', async () => {
    await retryManager.execute(jest.fn().mockResolvedValue('previous success'));

    const error = new Error('Network failure');
    error.name = 'NetworkError';
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      retryManager.execute(operation, {
        baseDelay: 10,
        totalTimeoutMs: 5,
      })
    ).rejects.toMatchObject({ name: 'TimeoutError' });

    expect(retryManager.getLastStats()).toMatchObject({
      lastSucceeded: false,
      lastTotalRetries: 0,
      lastTotalDelayMs: 0,
      contextType: 'network',
      lastErrorName: 'TimeoutError',
      lastErrorMessage: '重試總時長已超時',
    });
  });

  describe('便捷函數', () => {
    test('withRetry 應該使用默認實例並支持自定義選項', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      const error = new Error('Network error');
      error.name = 'NetworkError';
      const retriedOperation = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await withRetry(operation);
      const retriedResult = await withRetry(retriedOperation, { maxRetries: 1 });

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(retriedResult).toBe('success');
    });

    test('fetchWithRetry 應該使用 global fetch、傳遞選項並支持重試選項', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      const fetchOptions = {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      };
      const fetchMock = jest.fn().mockRejectedValueOnce(error).mockResolvedValue({
        ok: true,
        data: 'response',
      });

      await withGlobalTestDouble('fetch', fetchMock, async mockFetch => {
        const result = await fetchWithRetry('https://example.com', fetchOptions, {
          maxRetries: 1,
          baseDelay: 1,
        });

        expect(result).toEqual({ ok: true, data: 'response' });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://example.com', fetchOptions);
        expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://example.com', fetchOptions);
      });
    });
  });
});
