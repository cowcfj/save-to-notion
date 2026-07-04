/**
 * @jest-environment node
 */

import { afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { AppError, ErrorHandler, ErrorTypes, Errors } from '../../../scripts/utils/ErrorHandler.js';
import { LogBuffer } from '../../../scripts/utils/LogBuffer.js';
import { LogSanitizer, sanitizeUrlForLogging } from '../../../scripts/utils/LogSanitizer.js';

const loggerMock = {
  getBuffer: jest.fn(),
};

jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: loggerMock,
  ...loggerMock,
}));

let LogExporter;

beforeAll(async () => {
  ({ LogExporter } = await import('../../../scripts/utils/LogExporter.js'));
});

beforeEach(() => {
  loggerMock.getBuffer.mockReset();
  globalThis.chrome = {
    runtime: {
      getManifest: jest.fn().mockReturnValue({ version: '9.8.7' }),
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'NativeLoggingDepth/1.0' },
    configurable: true,
  });
});

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.navigator;
  jest.restoreAllMocks();
});

describe('LogBuffer native ESM depth coverage', () => {
  test('evicts oldest entries by capacity and returns defensive entry copies', () => {
    const buffer = new LogBuffer(2);

    buffer.push({ level: 'info', message: 'first', source: 'native' });
    buffer.push({ level: 'warn', message: 'second', source: 'native' });
    buffer.push({ level: 'error', message: 'third', source: 'native' });

    const entries = buffer.getAll();
    expect(entries.map(entry => entry.message)).toEqual(['second', 'third']);
    entries[0].message = 'mutated outside';
    expect(buffer.getAll()[0].message).toBe('second');
    expect(buffer.getStats()).toEqual({ count: 2, capacity: 2 });
  });

  test('tracks dirty state across clean, clear, restore, and pending restore writes', () => {
    const buffer = new LogBuffer(3);
    buffer.push({ level: 'info', message: 'original', source: 'native' });
    expect(buffer.isDirty()).toBe(true);

    buffer.markClean();
    expect(buffer.isDirty()).toBe(false);

    buffer.prepareRestore();
    buffer.push({ level: 'warn', message: 'pending', source: 'native' });
    expect(buffer.getAll()).toEqual([{ level: 'info', message: 'original', source: 'native' }]);

    buffer.restoreFrom([{ level: 'debug', message: 'restored', source: 'snapshot' }]);
    expect(buffer.getAll().map(entry => entry.message)).toEqual(['pending', 'restored']);
    expect(buffer.isDirty()).toBe(true);

    buffer.markClean();
    buffer.prepareRestore();
    buffer.push({ level: 'error', message: 'drained after invalid restore', source: 'native' });
    buffer.restoreFrom(null);
    expect(buffer.getAll().map(entry => entry.message)).toEqual([
      'pending',
      'restored',
      'drained after invalid restore',
    ]);
  });

  test('truncates oversized entries and records serialization fallback metadata', () => {
    const buffer = new LogBuffer(4);
    buffer.push({
      level: 'info',
      message: 'x'.repeat(30_000),
      source: 'native',
      context: { action: 'oversized' },
    });

    const circularContext = { action: 'circular' };
    circularContext.self = circularContext;
    buffer.push({
      level: 'warn',
      message: 'circular payload',
      source: 'native',
      context: circularContext,
    });

    const [oversized, circular] = buffer.getAll();
    expect(oversized.message).toContain('[截斷]');
    expect(oversized.context).toEqual(
      expect.objectContaining({
        truncated: true,
        reason: 'entry_exceeds_size_limit',
        originalSize: expect.any(Number),
        originalMessageLength: 30_000,
      })
    );
    expect(circular.context).toEqual(
      expect.objectContaining({
        error: 'serialization_failed',
        reason: expect.stringContaining('circular'),
      })
    );
  });

  test('suppresses repeated fingerprints and emits one anomaly entry', () => {
    const buffer = new LogBuffer(40);
    for (let index = 0; index < 31; index += 1) {
      buffer.push({
        level: 'info',
        message: 'looping',
        source: 'native',
        context: { action: 'repeat-action' },
      });
    }

    const entries = buffer.getAll();
    expect(entries.filter(entry => entry.message === 'looping')).toHaveLength(10);
    expect(entries.at(9).context.repeatCount).toBe(31);
    expect(entries.at(10)).toEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('[ANOMALY] message looped 30'),
        context: expect.objectContaining({
          anomaly: true,
          repeatedAction: 'repeat-action',
          repeatCount: 30,
        }),
      })
    );
  });
});

describe('LogSanitizer native ESM depth coverage', () => {
  test('sanitizes tokens, headers, titles, URLs, nested objects, arrays, and circular references', () => {
    const circular = { token: 'secret-token-value' };
    circular.self = circular;

    const sanitized = LogSanitizer.sanitizeEntry('Bearer abc.def.ghi secret_abc123', {
      title: 'Private title',
      url: 'https://user:pass@example.com/path?utm_source=x&token=abc#frag',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer secret',
      },
      nested: {
        email: 'reader@example.com',
        array: ['ghp_123456789012345678901234', circular],
      },
      callback() {},
    });

    expect(sanitized.message).toBe('[REDACTED_AUTH_HEADER] [REDACTED_TOKEN]');
    expect(sanitized.context).toEqual({
      title: '[REDACTED_TITLE]',
      url: 'https://example.com/path?token=[REDACTED_TOKEN]',
      headers: {
        Accept: 'application/json',
        Authorization: '[REDACTED_HEADER]',
      },
      nested: {
        email: '[REDACTED_SENSITIVE_KEY]',
        array: [
          'ghp_123456789012345678901234',
          { token: '[REDACTED_SENSITIVE_KEY]', self: '[MAX_DEPTH_REACHED]' },
        ],
      },
      callback: '[Function]',
    });
  });

  test('handles invalid inputs, local files, sensitive query parts, and depth limits', () => {
    expect(LogSanitizer.sanitize(null)).toEqual([]);
    expect(sanitizeUrlForLogging('file:///Users/dev/private.txt')).toBe('file://[local-file]');
    expect(sanitizeUrlForLogging('/relative?auth_code=abc', 'not a url')).toBe(
      'http://localhost/relative?auth_code=[REDACTED_TOKEN]'
    );
    expect(sanitizeUrlForLogging('not-a-url')).toBe('[invalid-url]');

    const deep = { a: { b: { c: { d: { e: 'hidden' } } } } };
    expect(LogSanitizer.sanitizeEntry('ok', deep).context.a.b.c.d).toBe('[MAX_DEPTH_REACHED]');
  });

  test('sanitizes Error objects while preserving custom safe properties', () => {
    const error = new TypeError('secret_abc123 failed');
    error.publicId = '42';
    error.password = 'do-not-log';
    error.stack =
      'TypeError: secret_abc123 failed\n    at fn (/Users/dev/project/scripts/file.js:10:20)';

    const sanitized = LogSanitizer.sanitizeEntry('error', { error }).context.error;
    expect(sanitized).toEqual(
      expect.objectContaining({
        name: 'TypeError',
        message: '[REDACTED_TOKEN] failed',
        publicId: '42',
        password: 'do-not-log',
      })
    );
    expect(sanitized.stack).toContain('file.js:10:20');
    expect(sanitized.stack).not.toContain('/Users/dev/project/scripts/');
  });
});

describe('ErrorHandler native ESM depth coverage', () => {
  test('normalizes AppError envelopes and user-message fallbacks', () => {
    const appError = Errors.validation('VALIDATION_ERROR', { field: 'url' }, 'VALIDATION_ERROR');

    expect(appError).toBeInstanceOf(AppError);
    expect(appError.toJSON()).toEqual({
      type: ErrorTypes.VALIDATION_ERROR,
      message: 'VALIDATION_ERROR',
      details: { field: 'url' },
      errorCode: 'VALIDATION_ERROR',
    });
    expect(appError.toResponse()).toEqual(
      expect.objectContaining({
        success: false,
        errorType: ErrorTypes.VALIDATION_ERROR,
        errorCode: 'VALIDATION_ERROR',
        details: { field: 'url' },
      })
    );
    expect(ErrorHandler.formatUserMessage('直接顯示中文錯誤')).toBe('直接顯示中文錯誤');
    expect(ErrorHandler.formatUserMessage('UNMAPPED_TECHNICAL_TOKEN')).not.toBe(
      'UNMAPPED_TECHNICAL_TOKEN'
    );
  });

  test('classifies log levels and sanitizes invalid or unsafe log inputs', () => {
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    };
    globalThis.Logger = logger;

    ErrorHandler.logError({
      type: ErrorTypes.NETWORK_ERROR,
      context: 'line1\nline2',
      originalError: new Error('boom\r\nnext'),
    });
    ErrorHandler.logError({
      type: ErrorTypes.PERFORMANCE_WARNING,
      context: 'slow path',
      originalError: new Error('took too long'),
    });
    ErrorHandler.logError(null);

    expect(logger.error).toHaveBeenCalledWith(
      `[${ErrorTypes.NETWORK_ERROR}] line1 line2: boom next`
    );
    expect(logger.info).toHaveBeenCalledWith(
      `[${ErrorTypes.PERFORMANCE_WARNING}] slow path: took too long`
    );
    expect(logger.warn).toHaveBeenCalledWith('[ErrorHandler] logError called with invalid input');
    expect(ErrorHandler.getLogLevel('unknown')).toBe('warn');

    delete globalThis.Logger;
  });
});

describe('LogExporter native ESM depth coverage', () => {
  test('exports JSON and plain text payloads from the current buffer', () => {
    loggerMock.getBuffer.mockReturnValue({
      getAll: jest.fn().mockReturnValue([
        { timestamp: 1, level: 'info', message: 'ready' },
        { level: 'warn', message: 'missing timestamp' },
      ]),
    });

    const json = LogExporter.exportLogs();
    expect(json).toEqual(
      expect.objectContaining({
        filename: 'notion-debug.json',
        mimeType: 'application/json',
        count: 2,
      })
    );
    expect(JSON.parse(json.content)).toEqual({
      version: '1.0',
      extensionVersion: '9.8.7',
      userAgent: 'NativeLoggingDepth/1.0',
      logCount: 2,
      logs: [
        { timestamp: 1, level: 'info', message: 'ready' },
        { level: 'warn', message: 'missing timestamp' },
      ],
    });

    const text = LogExporter.exportLogs({ format: 'txt' });
    expect(text).toEqual({
      filename: 'logs.txt',
      content: '1\tinfo\tready\nwarn\tmissing timestamp',
      mimeType: 'text/plain',
      count: 2,
    });
  });

  test('fails safely for missing buffer, unsupported format, and circular JSON payloads', () => {
    loggerMock.getBuffer.mockReturnValue(null);
    expect(() => LogExporter.exportLogs()).toThrow('LogBuffer not initialized');

    loggerMock.getBuffer.mockReturnValue({ getAll: jest.fn().mockReturnValue([]) });
    expect(() => LogExporter.exportLogs({ format: 'yaml' })).toThrow('Unsupported format: yaml');

    const circular = { level: 'error' };
    circular.self = circular;
    loggerMock.getBuffer.mockReturnValue({ getAll: jest.fn().mockReturnValue([circular]) });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = LogExporter.exportLogs();
    expect(consoleSpy).toHaveBeenCalledWith('Log serialization failed:', expect.any(Error));
    expect(result.filename).toBe('notion-debug-error.json');
    expect(JSON.parse(result.content)).toEqual(
      expect.objectContaining({
        error: 'Log_Serialization_Failed',
        extensionVersion: '9.8.7',
      })
    );
  });
});
