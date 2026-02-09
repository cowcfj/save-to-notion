const { RetryManager } = require('../../../scripts/utils/RetryManager');

describe('RetryManager Security', () => {
  let mockLogger;
  let originalLogger;

  beforeAll(() => {
    // 保存原始 Logger 並注入 Mock
    originalLogger = globalThis.Logger;
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    globalThis.Logger = mockLogger;
  });

  afterAll(() => {
    // 恢復原始 Logger，防止污染其他測試套件
    globalThis.Logger = originalLogger;
  });

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
