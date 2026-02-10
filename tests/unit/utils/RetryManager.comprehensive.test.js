/**
 * RetryManager 全面測試套件
 * 測試重試管理器的所有功能
 */
/* eslint-env jest */

const { RetryManager, withRetry, fetchWithRetry } = require('../../../scripts/utils/RetryManager');

describe('RetryManager - 全面測試', () => {
  let retryManager = null;
  let originalConsole = null;

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
  });

  afterEach(() => {
    // 恢復原始的 console 方法
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;

    jest.clearAllTimers();
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
      // 模擬 Logger 對象
      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      globalThis.Logger = mockLogger;

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

      // 清理
      delete globalThis.Logger;
    });

    test('應該記錄重試失敗', async () => {
      // 模擬 Logger 對象
      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      globalThis.Logger = mockLogger;

      const operation = jest.fn().mockRejectedValue(new Error('Final error'));

      await expect(retryManager.execute(operation)).rejects.toThrow();

      // 驗證 Logger.error 被調用
      expect(mockLogger.error).toHaveBeenCalled();

      // 清理
      delete globalThis.Logger;
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

      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(RetryManager._calculateDelay(1, managerWithJitter.options));
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
      const startTime = Date.now();
      await RetryManager._delay(100);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // 考慮誤差
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
      globalThis.ErrorHandler = {
        logError: jest.fn(),
      };

      const error = new Error('Test error');
      RetryManager._logRetryAttempt(error, 1, 3, 100);

      expect(globalThis.ErrorHandler.logError).toHaveBeenCalled();

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
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, data: 'response' });

      const result = await fetchWithRetry('https://example.com');

      expect(result).toEqual({ ok: true, data: 'response' });
      expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com', {});

      delete globalThis.fetch;
    });

    test('fetchWithRetry 應該支持 fetch 選項', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true });

      await fetchWithRetry('https://example.com', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      delete globalThis.fetch;
    });

    test('fetchWithRetry 應該支持重試選項', async () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';

      globalThis.fetch = jest.fn().mockRejectedValueOnce(error).mockResolvedValue({ ok: true });

      const result = await fetchWithRetry(
        'https://example.com',
        {},
        { maxRetries: 1, baseDelay: 50 }
      );

      expect(result).toEqual({ ok: true });
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      delete globalThis.fetch;
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
