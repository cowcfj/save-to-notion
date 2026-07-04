/* eslint-disable unicorn/no-error-property-assignment, unicorn/no-global-object-property-assignment -- RetryManager logging tests intentionally construct named Error doubles and install global Logger doubles. */

import { RetryManager } from '../../../scripts/utils/RetryManager.js';
import {
  createLoggerWithMethods,
  expectStructuredRetryLog,
  withGlobalTestDouble,
} from './retryManagerTestSupport.js';

describe('RetryManager retry logging', () => {
  describe('_logRetryAttempt - 記錄重試嘗試', () => {
    test('應該記錄重試嘗試信息', () => {
      const logger = createLoggerWithMethods(['warn']);

      withGlobalTestDouble('Logger', logger, mockLogger => {
        const error = new Error('Test error');

        RetryManager._logRetryAttempt({ error, attempt: 1, maxAttempts: 3, delay: 100 });

        expectStructuredRetryLog(mockLogger.warn, '重試', {
          action: 'retryOperation',
          result: 'warning',
          error: expect.objectContaining({
            message: 'Test error',
            name: 'Error',
          }),
          attempt: 1,
          maxAttempts: 3,
          delay: 100,
          contextType: 'network',
        });
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('應該使用 ErrorHandler 如果可用', () => {
      const errorHandler = { logError: jest.fn() };

      withGlobalTestDouble('ErrorHandler', errorHandler, () => {
        const error = new Error('Test error');
        RetryManager._logRetryAttempt({ error, attempt: 1, maxAttempts: 3, delay: 100 });
      });

      expect(errorHandler.logError).toHaveBeenCalled();
    });

    test('應該使用 ErrorHandler 類別實例', () => {
      const logErrorSpy = jest.fn();
      class MockErrorHandler {
        logError(payload) {
          logErrorSpy(payload);
        }
      }

      withGlobalTestDouble('ErrorHandler', MockErrorHandler, () => {
        const error = new Error('Test error');
        RetryManager._logRetryAttempt({ error, attempt: 1, maxAttempts: 3, delay: 100 });

        expect(logErrorSpy).toHaveBeenCalled();
      });
    });

    test('ErrorHandler 不可用或不可建構時不應阻斷 retry logging', () => {
      expect.hasAssertions();

      const logger = createLoggerWithMethods(['warn']);
      const cases = [
        42,
        () => {},
        class ThrowingErrorHandler {
          constructor() {
            throw new Error('constructor failed');
          }
        },
      ];

      withGlobalTestDouble('Logger', logger, () => {
        for (const errorHandlerReference of cases) {
          withGlobalTestDouble('ErrorHandler', errorHandlerReference, () => {
            RetryManager._logRetryAttempt({
              error: new Error('Test error'),
              attempt: 1,
              maxAttempts: 3,
              delay: 100,
            });

            expect(logger.warn).toHaveBeenCalled();
          });
        }
      });
    });
  });

  describe('_logRetrySuccess - 記錄重試成功', () => {
    test('應該使用 success 或 info 記錄結構化成功日誌', () => {
      expect.hasAssertions();

      const cases = [
        {
          loggerMethod: 'success',
          contextType: 'dom',
          logger: createLoggerWithMethods(['success']),
        },
        {
          loggerMethod: 'info',
          contextType: 'network',
          logger: {
            ...createLoggerWithMethods(['info']),
            success: undefined,
          },
        },
      ];

      for (const { loggerMethod, contextType, logger } of cases) {
        withGlobalTestDouble('Logger', logger, mockLogger => {
          RetryManager._logRetrySuccess(2, contextType);

          expectStructuredRetryLog(mockLogger[loggerMethod], '已成功', {
            action: 'retryOperation',
            result: 'success',
            totalRetries: 2,
            contextType,
          });
        });

        expect(logger[loggerMethod]).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('_logRetryFailure - 記錄重試失敗', () => {
    test('應該記錄失敗信息', () => {
      const logger = createLoggerWithMethods(['error']);

      withGlobalTestDouble('Logger', logger, mockLogger => {
        const error = new Error('Final error');

        RetryManager._logRetryFailure(error, 3);

        expectStructuredRetryLog(mockLogger.error, '失敗', {
          action: 'retryOperation',
          result: 'failure',
          error: expect.objectContaining({
            message: 'Final error',
            name: 'Error',
          }),
          totalRetries: 3,
          contextType: 'network',
        });
      });

      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    test('shouldLogFailure 回傳 false 時不應記錄失敗或回報 ErrorHandler', () => {
      const logger = createLoggerWithMethods(['error']);
      const errorHandler = { logError: jest.fn() };

      withGlobalTestDouble('Logger', logger, mockLogger => {
        withGlobalTestDouble('ErrorHandler', errorHandler, () => {
          RetryManager._logRetryFailure(new Error('suppressed'), 1, 'network', {
            shouldLogFailure: () => false,
          });

          expect(mockLogger.error).not.toHaveBeenCalled();
          expect(errorHandler.logError).not.toHaveBeenCalled();
        });
      });
    });

    test('應該使用 ErrorHandler 如果可用', () => {
      const errorHandler = { logError: jest.fn() };

      withGlobalTestDouble('ErrorHandler', errorHandler, () => {
        const error = new Error('Final error');
        RetryManager._logRetryFailure(error, 3);
      });

      expect(errorHandler.logError).toHaveBeenCalled();
    });
  });
});

describe('RetryManager security logging', () => {
  let mockLogger;
  let originalLogger;

  beforeEach(() => {
    originalLogger = globalThis.Logger;
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    globalThis.Logger = mockLogger;
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.Logger = originalLogger;
  });

  test('_logRetryAttempt 應過濾錯誤物件中的敏感屬性（如 headers）', () => {
    const sensitiveError = new Error('API Error');
    sensitiveError.name = 'APIResponseError';
    sensitiveError.code = 'unauthorized';
    sensitiveError.status = 401;
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

    RetryManager._logRetryAttempt({
      error: sensitiveError,
      attempt: 1,
      maxAttempts: 3,
      delay: 100,
    });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const safeError = mockLogger.warn.mock.calls[0][1].error;

    expect(safeError.message).toBe('API Error');
    expect(safeError.name).toBe('APIResponseError');
    expect(safeError.code).toBe('unauthorized');
    expect(safeError.status).toBe(401);
    expect(safeError.headers).toBeUndefined();
    expect(safeError.request).toBeUndefined();
    expect(safeError.response).toBeUndefined();
  });

  test('_logRetryFailure 應過濾錯誤物件中的敏感屬性', () => {
    const sensitiveError = new Error('Final Error');
    sensitiveError.details = { apiKey: 'secret-key' };

    RetryManager._logRetryFailure(sensitiveError, 3);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const logMeta = mockLogger.error.mock.calls[0][1];

    expect(logMeta.error.message).toBe('Final Error');
    expect(logMeta.error).not.toHaveProperty('details');
  });
});
