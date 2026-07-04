/* eslint-disable unicorn/no-error-property-assignment, unicorn/no-global-object-property-assignment, unicorn/prefer-await -- RetryManager helper tests intentionally construct named Error doubles, install global browser/runtime doubles, and preserve timer helper behavior. */

import { RetryManager, withRetry, fetchWithRetry } from '../../../scripts/utils/RetryManager.js';
import {
  MockHeaders,
  createAbortController,
  createLoggerWithMethods,
  withGlobalTestDouble,
} from './retryManagerTestSupport.js';

describe('RetryManager static and utility helpers', () => {
  let retryManager = null;

  beforeEach(() => {
    retryManager = new RetryManager({ jitter: false });
  });

  describe('convenience helpers', () => {
    test('withRetry 應該調用默認實例並成功', async () => {
      const op = jest.fn().mockResolvedValue('success');
      const response = await withRetry(op);
      expect(response).toBe('success');
    });

    test('fetchWithRetry 應該成功執行', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true });
      try {
        const response = await fetchWithRetry('https://api.test');
        expect(response.status).toBe(200);
      } finally {
        if (originalFetch === undefined) {
          delete globalThis.fetch;
        } else {
          globalThis.fetch = originalFetch;
        }
      }
    });
  });

  describe('response and console fallbacks', () => {
    test('_calculateDelay 應該限制在 maxDelay', () => {
      const config = { baseDelay: 1000, backoffFactor: 10, maxDelay: 5000, jitter: false };
      const delay = RetryManager._calculateDelay(3, config);
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

    test('_random 應該在 crypto.getRandomValues 缺失時回退', () => {
      withGlobalTestDouble('crypto', {}, () => {
        const randomValue = RetryManager._random();

        expect(randomValue).toBeGreaterThanOrEqual(0);
        expect(randomValue).toBeLessThan(1);
      });
    });

    test('_logRetryAttempt 在 Logger 缺失時應降級使用 console.warn', () => {
      const originalLogger = globalThis.Logger;
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      try {
        delete globalThis.Logger;
        RetryManager._logRetryAttempt({
          error: new Error('test'),
          attempt: 1,
          maxAttempts: 3,
          delay: 100,
        });
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

    test('_logToConsoleInDev 應在 production 或缺少 env 時保持靜默', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const originalNodeEnvironment = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'production';
        RetryManager._logToConsoleInDev('should not log in production');

        withGlobalTestDouble('process', undefined, () => {
          RetryManager._logToConsoleInDev('should not log without process');
        });

        withGlobalTestDouble('process', {}, () => {
          RetryManager._logToConsoleInDev('should not log without process.env');
        });

        expect(consoleWarnSpy).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalNodeEnvironment;
        consoleWarnSpy.mockRestore();
      }
    });

    test('_parseRetryAfterHeader 應該處理各種 Header 格式', () => {
      expect(RetryManager._parseRetryAfterHeader(null)).toBe(0);
      expect(RetryManager._parseRetryAfterHeader({})).toBe(0);
      expect(RetryManager._parseRetryAfterHeader({ headers: {} })).toBe(0);
      expect(
        RetryManager._parseRetryAfterHeader({
          headers: new MockHeaders({ 'Retry-After': 'invalid' }),
        })
      ).toBe(0);

      const futureDate = new Date(Date.now() + 5000).toUTCString();
      const delay = RetryManager._parseRetryAfterHeader({
        headers: new MockHeaders({ 'Retry-After': futureDate }),
      });
      expect(delay).toBeGreaterThan(4000);
    });

    test('_parseRetryAfterHeader 應在 headers.get 拋出時回傳 0', () => {
      const response = {
        headers: {
          get() {
            throw new Error('header read failed');
          },
        },
      };

      expect(RetryManager._parseRetryAfterHeader(response)).toBe(0);
    });
  });

  describe('retry predicates and defensive helpers', () => {
    test('應該識別可重試網絡錯誤', () => {
      const cases = [
        { message: 'Network failed', name: 'NetworkError' },
        { message: 'Timeout', name: 'TimeoutError' },
        { message: 'fetch failed' },
        { message: 'Server error', status: 500 },
        { message: 'Service unavailable', status: 503 },
        { message: 'Too many requests', status: 429 },
        { message: 'Request timeout', status: 408 },
      ];

      for (const { message, name, status } of cases) {
        const error = new Error(message);
        if (name) {
          error.name = name;
        }
        if (status !== undefined) {
          error.status = status;
        }
        expect(RetryManager._shouldRetryNetworkError(error)).toBe(true);
      }
    });

    test('應該拒絕不可重試網絡錯誤', () => {
      const cases = [
        { value: null },
        { message: 'Bad request', status: 400 },
        { message: 'Not found', status: 404 },
        { message: 'Unknown error' },
      ];

      for (const { value, message, status } of cases) {
        const error = value === null ? null : new Error(message);
        if (status !== undefined) {
          error.status = status;
        }
        expect(RetryManager._shouldRetryNetworkError(error)).toBe(false);
      }
    });

    test('應該識別可重試 DOM 錯誤', () => {
      const cases = [
        { message: 'Invalid state', name: 'InvalidStateError' },
        { message: 'DOM not ready' },
        { message: 'still loading' },
        { message: 'Element not found', name: 'NotFoundError' },
        { message: 'element not found' },
      ];

      for (const { message, name } of cases) {
        const error = new Error(message);
        if (name) {
          error.name = name;
        }
        expect(RetryManager._shouldRetryDomError(error)).toBe(true);
      }
    });

    test('應該拒絕其他 DOM 錯誤', () => {
      expect(RetryManager._shouldRetryDomError(new Error('Invalid selector'))).toBe(false);
    });

    test('應該計算指數退避延遲', () => {
      const delay1 = RetryManager._calculateDelay(1, retryManager.options);
      const delay2 = RetryManager._calculateDelay(2, retryManager.options);
      const delay3 = RetryManager._calculateDelay(3, retryManager.options);

      expect(delay1).toBe(100);
      expect(delay2).toBe(200);
      expect(delay3).toBe(400);
    });

    test('應該限制最大延遲', () => {
      const delay = RetryManager._calculateDelay(10, retryManager.options);

      expect(delay).toBe(5000);
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
      for (let index = 0; index < 10; index++) {
        delays.push(
          RetryManager._calculateDelay(1, {
            ...managerWithJitter.options,
            random: deterministicRandom,
          })
        );
      }

      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(50);
        expect(delay).toBeLessThanOrEqual(100);
      }
    });

    test('應該返回整數延遲', () => {
      const managerWithJitter = new RetryManager({
        baseDelay: 100,
        jitter: true,
      });

      const delay = RetryManager._calculateDelay(1, managerWithJitter.options);

      expect(Number.isSafeInteger(delay)).toBe(true);
    });

    test('_delay 應該延遲指定的毫秒數', async () => {
      jest.useFakeTimers();
      try {
        let isResolved = false;
        const delayPromise = RetryManager._delay(100).then(() => {
          isResolved = true;
        });
        expect(isResolved).toBe(false);
        jest.advanceTimersByTime(100);
        await delayPromise;
        expect(isResolved).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    test('_delay 應在已取消 signal 傳入時直接拒絕並清理 timer', async () => {
      jest.useFakeTimers();
      try {
        const controller = createAbortController();
        controller.abort();

        await expect(RetryManager._delay(100, controller.signal)).rejects.toMatchObject({
          name: 'AbortError',
        });
      } finally {
        jest.useRealTimers();
      }
    });

    test('_shouldRetry 應該使用自定義 shouldRetry 函數或默認網絡錯誤判斷', () => {
      const error = new Error('Custom error');
      const shouldRetry = jest.fn().mockReturnValue(true);
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';

      const result = retryManager._shouldRetry(error, { shouldRetry });
      const defaultResult = retryManager._shouldRetry(networkError, {});

      expect(result).toBe(true);
      expect(shouldRetry).toHaveBeenCalledWith(error);
      expect(defaultResult).toBe(true);
    });

    test('防禦性 options 處理缺少 options 時應使用安全預設值', () => {
      const error = new Error('Failed to fetch');

      const retryable = RetryManager._shouldRetryFetchResponse({ status: 503 }, 503);
      const notRetryable = RetryManager._shouldRetryFetchResponse({ status: 404 }, 404);

      expect(retryManager._shouldRetryFetchError(error)).toBe(true);
      expect(RetryManager._shouldLogRetryFailure(new Error('Final error'))).toBe(true);
      expect(retryable).toBe(true);
      expect(notRetryable).toBe(false);
    });

    test('_shouldRetryFetchError 的 shouldRetry hook 拋出時應記錄 warning 並回退', () => {
      const error = new Error('Failed to fetch');
      const warningLogger = createLoggerWithMethods(['warn']);

      withGlobalTestDouble('Logger', warningLogger, mockWarningLogger => {
        const result = retryManager._shouldRetryFetchError(error, {
          shouldRetry: () => {
            throw new Error('fetch hook failed');
          },
        });

        expect(result).toBe(true);
        expect(mockWarningLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('shouldRetry hook'),
          expect.objectContaining({
            action: 'shouldRetryFetchError',
            result: 'hook_error',
            hookError: expect.objectContaining({ message: 'fetch hook failed' }),
          })
        );
      });
    });

    test('防禦性 helper 應覆蓋 guard 與 fallback 分支', () => {
      const warningLogger = createLoggerWithMethods(['warn']);
      const finalError = new Error('Final error');

      withGlobalTestDouble('Logger', warningLogger, mockWarningLogger => {
        expect(
          RetryManager._shouldLogRetryFailure(finalError, { shouldLogFailure: () => false })
        ).toBe(false);
        expect(
          RetryManager._shouldLogRetryFailure(finalError, {
            shouldLogFailure: () => {
              throw new Error('failure hook failed');
            },
          })
        ).toBe(true);

        expect(mockWarningLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('shouldLogFailure hook'),
          expect.objectContaining({
            action: 'shouldLogFailure',
            result: 'hook_error',
            hookError: expect.objectContaining({ message: 'failure hook failed' }),
          })
        );
      });

      expect(RetryManager._resolveErrorHandlerType('dom')).toBe('dom_error');
      expect(RetryManager._resolveRandomValue({})).toBeGreaterThanOrEqual(0);
      expect(RetryManager._getResponseStatus(null)).toBeNull();
      expect(RetryManager._getResponseStatus({ status: '503' })).toBeNull();
      expect(RetryManager._sanitizeErrorForLog(null)).toEqual({ message: 'null' });
      expect(RetryManager._sanitizeErrorForLog('plain failure')).toEqual({
        message: 'plain failure',
      });
      expect(
        RetryManager._sanitizeErrorForLog({ message: 'typed failure', type: 'network' })
      ).toEqual({
        name: 'Error',
        message: 'typed failure',
        type: 'network',
      });
    });
  });
});
