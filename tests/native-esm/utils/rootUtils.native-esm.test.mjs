import { describe, expect, jest, test, beforeAll } from '@jest/globals';

// 1. 在動態導入任何模組之前，先建立 global Mocks
beforeAll(() => {
  globalThis.chrome = {
    runtime: {
      id: 'test-extension-id',
      sendMessage: jest.fn(),
      getManifest: jest.fn().mockReturnValue({ version: '1.0.0' }),
    },
    alarms: {
      onAlarm: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      create: jest.fn(),
      clear: jest.fn(),
    },
    storage: {
      local: {
        get: jest.fn().mockImplementation(() => Promise.resolve({})),
        set: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    },
  };
  globalThis.analytics = {
    track: jest.fn(),
  };

  // 模擬 DOM 與全域事件
  globalThis.addEventListener = jest.fn();
  globalThis.removeEventListener = jest.fn();
  
  globalThis.document = {
    createElementNS: jest.fn().mockImplementation(() => ({
      classList: { add: jest.fn() },
      setAttribute: jest.fn(),
      append: jest.fn(),
    })),
    createElement: jest.fn().mockImplementation(() => ({
      append: jest.fn(),
    })),
    body: {
      append: jest.fn(),
    },
    addEventListener: jest.fn(),
  };
  globalThis.window = {
    addEventListener: jest.fn(),
  };
});

describe('Root utils native ESM diagnostics', () => {
  // 1. esm-safe-now pure utils tests
  test('accountDisplayUtils: resolveAccountDisplayProfile', async () => {
    const { resolveAccountDisplayProfile } = await import('../../../scripts/utils/accountDisplayUtils.js');
    const result = resolveAccountDisplayProfile({
      email: 'test@example.com',
      displayName: ' Test User ',
    });
    expect(result).toEqual({
      normalizedDisplayName: 'Test User',
      email: 'test@example.com',
      displayLabel: 'Test User',
      avatarFallbackInitial: 'T',
    });
  });

  test('concurrencyUtils: pMap limitConcurrency', async () => {
    const { pMap } = await import('../../../scripts/utils/concurrencyUtils.js');
    const result = await pMap([1, 2, 3], async (x) => x * 2, { concurrency: 2 });
    expect(result).toEqual([2, 4, 6]);
  });

  test('contentUtils: isTitleConsistent', async () => {
    const { isTitleConsistent } = await import('../../../scripts/utils/contentUtils.js');
    expect(isTitleConsistent('News Title', 'News Title | HK01')).toBe(true);
    expect(isTitleConsistent('Short', 'Short Title')).toBe(true); // 太短直接放行
  });

  test('keyOrdering: compareKeysAlphabetically', async () => {
    const { compareKeysAlphabetically } = await import('../../../scripts/utils/keyOrdering.js');
    const list = ['key_b', 'key_a'];
    list.sort(compareKeysAlphabetically);
    expect(list).toEqual(['key_a', 'key_b']);
  });

  test('temporaryImageUrl: isTemporaryImageUrl', async () => {
    const { isTemporaryImageUrl } = await import('../../../scripts/utils/temporaryImageUrl.js');
    expect(isTemporaryImageUrl('https://sub.patreonusercontent.com/avatar?token-time=123')).toBe(true);
    expect(isTemporaryImageUrl('https://example.com/avatar')).toBe(false);
  });

  test('urlUtils: normalizeUrl', async () => {
    const { normalizeUrl, hasSameOrigin, isRootUrl } = await import('../../../scripts/utils/urlUtils.js');
    expect(normalizeUrl('https://example.com/page?utm_source=test')).toBe('https://example.com/page');
    expect(hasSameOrigin('https://example.com/a', 'https://example.com/b')).toBe(true);
    expect(isRootUrl('https://example.com')).toBe(true);
    expect(isRootUrl('https://example.com/page')).toBe(false);
  });

  test('ApiErrorSanitizer: sanitizeApiError', async () => {
    const { sanitizeApiError } = await import('../../../scripts/utils/ApiErrorSanitizer.js');
    const result = sanitizeApiError(new Error('something went wrong'), 'fetchDatabase');
    expect(result).toBe('UNKNOWN_ERROR');
  });

  test('ErrorHandler: errors and AppError instantiation', async () => {
    const { AppError, Errors } = await import('../../../scripts/utils/ErrorHandler.js');
    const err = Errors.internal('Failed operation', { traceId: '123' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('Failed operation');
  });

  test('LogBuffer: basic push and properties', async () => {
    const { LogBuffer } = await import('../../../scripts/utils/LogBuffer.js');
    const buffer = new LogBuffer(10);
    buffer.push({ message: 'log 1', level: 'info' });
    const logs = buffer.getAll();
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('log 1');
  });

  test('LogExportValidator: validateLogExportData', async () => {
    const { validateLogExportData } = await import('../../../scripts/utils/LogExportValidator.js');
    const validData = {
      content: '[]',
      filename: 'notion_chrome_logs_2026-06-26.json',
      mimeType: 'application/json',
    };
    expect(() => validateLogExportData(validData)).not.toThrow();
  });

  test('LogExporter: plain text serialization', async () => {
    const LoggerModule = await import('../../../scripts/utils/Logger.js');
    const Logger = LoggerModule.default;
    const { LogExporter } = await import('../../../scripts/utils/LogExporter.js');
    
    const mockBuffer = {
      getAll: () => [{ timestamp: '2026-06-26T12:00:00.000Z', level: 'info', message: 'Hello' }]
    };
    const spy = jest.spyOn(Logger, 'getBuffer').mockReturnValue(mockBuffer);
    
    const exportResult = LogExporter.exportLogs({ format: 'txt' });
    expect(exportResult.mimeType).toBe('text/plain');
    expect(exportResult.content).toContain('Hello');
    
    spy.mockRestore();
  });

  test('LogSanitizer: maskSensitiveString & sanitizeUrlForLogging', async () => {
    const { maskSensitiveString, sanitizeUrlForLogging } = await import('../../../scripts/utils/LogSanitizer.js');
    expect(maskSensitiveString('secret_token123', 0, 0)).toBe('***');
    expect(sanitizeUrlForLogging('https://example.com/page?utm_source=123&token=abc')).toBe('https://example.com/page?token=[REDACTED_TOKEN]');
  });

  test('Logger: static methods and dispatching', async () => {
    const { default: Logger } = await import('../../../scripts/utils/Logger.js');
    Logger.info('Info message');
    Logger.warn('Warning message');
    expect(Logger).toBeDefined();
  });

  test('notionAuth: ensureNotionApiKey & isNonEmptyString', async () => {
    const { ensureNotionApiKey, isNonEmptyString } = await import('../../../scripts/utils/notionAuth.js');
    expect(isNonEmptyString('token')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
  });

  test('pageComplexityDetector: selectExtractor', async () => {
    const { selectExtractor } = await import('../../../scripts/utils/pageComplexityDetector.js');
    expect(selectExtractor).toBeDefined();
  });

  test('securityUtils: validateSafeSvg & separateIconAndText', async () => {
    const { separateIconAndText, validateSafeSvg } = await import('../../../scripts/utils/securityUtils.js');
    expect(separateIconAndText('🚀 Hello')).toEqual({ icon: '🚀', text: ' Hello' });
    expect(validateSafeSvg('<svg></svg>')).toBe(true);
  });

  test('uiUtils: createSpriteIcon', async () => {
    const { createSpriteIcon } = await import('../../../scripts/utils/uiUtils.js');
    const icon = createSpriteIcon('save');
    expect(icon).toBeDefined();
  });

  test('LogBufferPersistence: flush and restore', async () => {
    const { LogBufferPersistence } = await import('../../../scripts/utils/LogBufferPersistence.js');
    expect(LogBufferPersistence.flush).toBeDefined();
    expect(LogBufferPersistence.restore).toBeDefined();
  });

  test('imageUtils: named exports availability', async () => {
    const { cleanImageUrl, isValidImageUrl } = await import('../../../scripts/utils/imageUtils.js');
    expect(cleanImageUrl).toBeDefined();
    expect(isValidImageUrl).toBeDefined();
  });

  test('RetryManager: withRetry execution', async () => {
    const { withRetry, RetryManager } = await import('../../../scripts/utils/RetryManager.js');
    expect(RetryManager).toBeDefined();
    const result = await withRetry(async () => 'success_data');
    expect(result).toBe('success_data');
  });
});

