const { RetryManager } = require('../../../scripts/utils/RetryManager');

// Mock Logger
const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
};

globalThis.Logger = mockLogger;

describe('RetryManager Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    // 驗證核心屬性存在
    expect(logMeta.error.message).toBe('API Error');
    expect(logMeta.error.name).toBe('APIResponseError');
    expect(logMeta.error.code).toBe('unauthorized');
    expect(logMeta.error.status).toBe(401);

    // 驗證敏感屬性被移除
    expect(logMeta.error).not.toHaveProperty('headers');
    expect(logMeta.error).not.toHaveProperty('request');
    expect(logMeta.error).not.toHaveProperty('response');
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
