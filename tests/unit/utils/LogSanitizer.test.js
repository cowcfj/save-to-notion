import { LogSanitizer } from '../../../scripts/utils/LogSanitizer.js';

describe('LogSanitizer', () => {
  describe('sanitize()', () => {
    test('should handle empty or null logs', () => {
      expect(LogSanitizer.sanitize([])).toEqual([]);
      expect(LogSanitizer.sanitize(null)).toEqual([]);
    });

    test('should sanitize message strings', () => {
      const logs = [
        { message: 'Token is secret_123abc' },
        { message: 'Contact user@example.com' },
        { message: 'ID: 550e8400-e29b-41d4-a716-446655440000' },
      ];

      const sanitized = LogSanitizer.sanitize(logs);

      expect(sanitized[0].message).toContain('[REDACTED_TOKEN]');
      expect(sanitized[0].message).not.toContain('secret_123abc');

      expect(sanitized[1].message).toContain('u***.com');
      expect(sanitized[1].message).not.toContain('user@example.com');

      expect(sanitized[2].message).toContain('550e8400***');
      expect(sanitized[2].message).not.toContain('446655440000');
    });

    test('should sanitize nested context objects', () => {
      const logs = [
        {
          message: 'Context check',
          context: {
            user: {
              email: 'admin@test.com',
              apiKey: 'secret_xyz',
            },
            url: 'https://notion.so/my-page-123',
            raw: 'some secret_token here',
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      const ctx = sanitized[0].context;

      expect(ctx.user.email).not.toContain('admin@test.com');
      expect(ctx.user.apiKey).toBe('[REDACTED_SENSITIVE_KEY]');
      expect(ctx.raw).toContain('[REDACTED_TOKEN]');
      // URL sanitization (from securityUtils)
      expect(ctx.url).toBe('https://notion.so/my-page-123'); // Path is preserved by default sanitizeUrl logic unless specific rules apply
    });

    test('should handle arrays in context', () => {
      const logs = [
        {
          context: {
            emails: ['a@b.com', 'c@d.com'],
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      expect(sanitized[0].context.emails[0]).not.toContain('a@b.com');
    });

    test('should not modify original logs (immutability)', () => {
      const logs = [{ message: 'secret_123' }];
      const sanitized = LogSanitizer.sanitize(logs);

      expect(logs[0].message).toBe('secret_123');
      expect(sanitized[0].message).toBe('[REDACTED_TOKEN]');
    });

    test('should handle circular references gracefully', () => {
      const obj = { a: 1 };
      obj.self = obj;
      const logs = [
        {
          message: 'Circular test',
          context: obj,
        },
      ];

      // Should not throw and should handle circularity
      let sanitized = null;
      expect(() => {
        sanitized = LogSanitizer.sanitize(logs);
      }).not.toThrow();

      // Ensure processed output is safe
      expect(sanitized).toHaveLength(1);
      const ctx = sanitized[0].context;
      expect(ctx.self).toBe('[Circular]');
      expect(ctx.a).toBe(1);
    });

    test('should preserve Error object properties', () => {
      const error = new Error('Something went wrong');
      error.stack = 'Error: Something went wrong\n    at Test (test.js:1:1)';
      error.code = 'ERR_TEST';
      error.details = 'Extra info';

      const logs = [
        {
          message: 'Error occurred',
          context: { error },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      const sanitizedError = sanitized[0].context.error;

      expect(sanitizedError).toHaveProperty('message', 'Something went wrong');
      expect(sanitizedError).toHaveProperty('stack');
      expect(sanitizedError).toHaveProperty('name', 'Error');

      // Verify custom properties
      expect(sanitizedError).toHaveProperty('code', 'ERR_TEST');
      expect(sanitizedError).toHaveProperty('details', 'Extra info');
    });

    test('should sanitize title and name fields', () => {
      const logs = [
        {
          context: {
            title: 'Sensitive Project Plan',
            Name: 'Confidential Client List',
            other: 'Safe content',
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      expect(sanitized[0].context.title).toBe('[REDACTED_TITLE]');
      expect(sanitized[0].context.Name).toBe('[REDACTED_TITLE]');
      expect(sanitized[0].context.other).toBe('Safe content');
    });

    test('should redact properties object entirely', () => {
      const logs = [
        {
          context: {
            properties: {
              'Schema Key 1': '[MAX_DEPTH]',
              'Schema Key 2': 'value',
            },
            other: 'Safe',
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      expect(sanitized[0].context.properties).toBe('[REDACTED_PROPERTIES]');
      expect(sanitized[0].context.other).toBe('Safe');
    });

    test('should redact authorization headers (Bearer/Basic)', () => {
      const logs = [
        {
          context: {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
              Cookie: 'session_id=abc123',
            },
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      const headers = sanitized[0].context.headers;

      // Content-Type 應保留
      expect(headers['Content-Type']).toBe('application/json');
      // Authorization 和 Cookie 應被脫敏
      expect(headers.Authorization).toBe('[REDACTED_HEADER]');
      expect(headers.Cookie).toBe('[REDACTED_HEADER]');
    });

    test('should redact sensitive key names', () => {
      const logs = [
        {
          context: {
            apiKey: 'my-secret-key-123',
            userToken: 'abc-xyz-999',
            session: 'session-data',
            normalField: 'safe-value',
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      expect(sanitized[0].context.apiKey).toBe('[REDACTED_SENSITIVE_KEY]');
      expect(sanitized[0].context.userToken).toBe('[REDACTED_SENSITIVE_KEY]');
      expect(sanitized[0].context.session).toBe('[REDACTED_SENSITIVE_KEY]');
      expect(sanitized[0].context.normalField).toBe('safe-value');
    });

    test('should redact Bearer token in string values', () => {
      const logs = [
        {
          message: 'Auth header is Bearer abc123xyz',
          context: {
            authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
            plainValue: 'Basic dXNlcjpwYXNz',
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      // 在 message 字串中，因為不是整個字串都是 Bearer token，所以不會被替換
      // authHeader 因為鍵名匹配而被脫敏
      expect(sanitized[0].context.authHeader).toBe('[REDACTED_SENSITIVE_KEY]');
      // plainValue 的鍵名安全，但值符合 Basic token 格式
      expect(sanitized[0].context.plainValue).toBe('[REDACTED_AUTH_HEADER]');
    });

    test('should handle nested sensitive objects', () => {
      const logs = [
        {
          context: {
            request: {
              headers: {
                Authorization: 'Basic dXNlcjpwYXNz',
                'User-Agent': 'Mozilla/5.0',
              },
              credentials: {
                apiKey: 'secret-123',
              },
            },
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      const req = sanitized[0].context.request;

      // Headers 應被清洗
      expect(req.headers.Authorization).toBe('[REDACTED_HEADER]');
      expect(req.headers['User-Agent']).toBe('Mozilla/5.0');

      // credentials 鍵名本身包含敏感關鍵字，整個物件被替換
      expect(req.credentials).toBe('[REDACTED_SENSITIVE_KEY]');
    });

    test('should sanitize Error stack traces to prevent path leakage', () => {
      const error = new Error('Test error');
      // 模擬真實的 Chrome Extension stack trace
      error.stack = `Error: Test error
    at LogExporter.exportLogs (chrome-extension://abcdefgh/scripts/utils/LogExporter.js:16:13)
    at exportDebugLogs (chrome-extension://abcdefgh/scripts/background.js:67:42)
    at chrome.runtime.sendMessage.then (chrome-extension://abcdefgh/options/options.js:330:15)`;

      const logs = [
        {
          message: 'Export failed',
          context: {
            error,
          },
        },
      ];

      const sanitized = LogSanitizer.sanitize(logs);
      const sanitizedStack = sanitized[0].context.error.stack;

      // 應該移除 Extension ID
      expect(sanitizedStack).toContain('chrome-extension://[ID]');
      expect(sanitizedStack).not.toContain('abcdefgh');

      // 應該移除內部路徑，只保留檔案名
      expect(sanitizedStack).toContain('LogExporter.js');
      expect(sanitizedStack).not.toContain('scripts/utils/LogExporter.js');
      expect(sanitizedStack).toContain('background.js');
      expect(sanitizedStack).not.toContain('scripts/background.js');

      // 應該移除精確的行號和列號
      expect(sanitizedStack).toContain('[位置已隱藏]');
      expect(sanitizedStack).not.toContain(':16:13');
      expect(sanitizedStack).not.toContain(':67:42');

      // 應該保留函數名稱（除錯用）
      expect(sanitizedStack).toContain('LogExporter.exportLogs');
      expect(sanitizedStack).toContain('exportDebugLogs');
    });

    test('should redact embedded Bearer tokens in strings', () => {
      const msg =
        'Request failed with token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const sanitized = LogSanitizer.sanitize([{ message: msg }]);
      expect(sanitized[0].message).not.toContain('eyJhbGci');
      expect(sanitized[0].message).toContain('[REDACTED_AUTH_HEADER]');
    });

    test('should redact raw JWT tokens without Bearer prefix', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const msg = `Token is ${jwt}`;
      const sanitized = LogSanitizer.sanitize([{ message: msg }]);
      expect(sanitized[0].message).not.toContain(jwt);
      expect(sanitized[0].message).toContain('[REDACTED_JWT]');
    });

    test('should redact query parameters in URLs embedded in strings', () => {
      const url = 'https://api.notion.com/v1/page?token=secret_12345&user_id=admins';
      const msg = `Fetcher failed for ${url}`;
      const sanitized = LogSanitizer.sanitize([{ message: msg }]);

      expect(sanitized[0].message).not.toContain('secret_12345');
      expect(sanitized[0].message).not.toContain('user_id=admins');
      // Real sanitizeUrlForLogging returns protocol+host+path
      expect(sanitized[0].message).toContain('https://api.notion.com/v1/page');
    });

    test('should redact Generic API Keys match specific patterns', () => {
      const apiKey = 'sk-1234567890abcdef1234567890abcdef'; // 32 chars
      const msg = `Using key ${apiKey} for request`;

      const sanitized = LogSanitizer.sanitize([{ message: msg }]);
      expect(sanitized[0].message).not.toContain(apiKey);
      expect(sanitized[0].message).toContain('[REDACTED_API_KEY]');
    });
  });
});
