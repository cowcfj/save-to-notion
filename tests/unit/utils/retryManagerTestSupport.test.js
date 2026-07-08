import {
  REQUIRED_LOGGER_METHODS,
  createLoggerWithMethods,
  expectStructuredRetryLog,
  withGlobalTestDouble,
} from './retryManagerTestSupport.js';

describe('RetryManager test support contracts', () => {
  const temporaryGlobalName = '__retryManagerTestDoubleContract__';

  afterEach(() => {
    delete globalThis[temporaryGlobalName];
  });

  test('withGlobalTestDouble 應保留 async assertion 期間的 global test double', async () => {
    const testDouble = { marker: 'active-test-double' };
    const observedValue = new Promise(resolve => {
      withGlobalTestDouble(temporaryGlobalName, testDouble, async () => {
        await Promise.resolve();
        resolve(globalThis[temporaryGlobalName]);
      });
    });

    await expect(observedValue).resolves.toBe(testDouble);
    expect(globalThis[temporaryGlobalName]).toBeUndefined();
  });

  test('withGlobalTestDouble 應在 async assertion reject 後還原 global test double', async () => {
    const expectedError = new Error('expected async assertion failure');

    await expect(
      withGlobalTestDouble(temporaryGlobalName, { marker: 'rejected-test-double' }, async () => {
        throw expectedError;
      })
    ).rejects.toBe(expectedError);
    expect(globalThis[temporaryGlobalName]).toBeUndefined();
  });

  test('createLoggerWithMethods 應建立完整 Logger mock surface', () => {
    const logger = createLoggerWithMethods(['warn']);

    for (const methodName of REQUIRED_LOGGER_METHODS) {
      expect(logger[methodName]).toEqual(expect.any(Function));
      expect(jest.isMockFunction(logger[methodName])).toBe(true);
    }
  });

  test('expectStructuredRetryLog 應接受包含額外欄位的 structured metadata', () => {
    const logMethod = jest.fn();
    logMethod('重試 attempt scheduled', {
      action: 'retry',
      result: 'scheduled',
      extraDiagnosticField: 'retained',
    });

    expect(() => {
      expectStructuredRetryLog(logMethod, '重試', {
        action: 'retry',
        result: 'scheduled',
      });
    }).not.toThrow();
  });
});
