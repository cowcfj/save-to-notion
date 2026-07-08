import { describe, expect, jest, test } from '@jest/globals';

describe('root utility behavior native ESM siblings', () => {
  test('ApiErrorSanitizer normalizes SDK and classified API errors', async () => {
    const { sanitizeApiError } = await import('../../../scripts/utils/ApiErrorSanitizer.js');

    expect(sanitizeApiError({ code: 'object_not_found', message: 'missing page' })).toBe(
      'OBJECT_NOT_FOUND'
    );
    expect(
      sanitizeApiError({
        code: 'validation_error',
        message: 'Image URL is invalid or unsupported',
      })
    ).toBe('IMAGE_VALIDATION_ERROR');
    expect(sanitizeApiError(new Error('database permission denied'))).toBe('INTEGRATION_FORBIDDEN');
  });

  test('ErrorHandler keeps user-facing messages behind stable error-code mapping', async () => {
    const { AppError, ErrorHandler, ErrorTypes, Errors } =
      await import('../../../scripts/utils/ErrorHandler.js');

    const appError = Errors.validation('API_KEY_NOT_CONFIGURED', { source: 'native' });

    expect(appError).toBeInstanceOf(AppError);
    expect(appError.type).toBe(ErrorTypes.VALIDATION_ERROR);
    expect(ErrorHandler.formatUserMessage('API_KEY_NOT_CONFIGURED')).not.toBe(
      'API_KEY_NOT_CONFIGURED'
    );
    expect(ErrorHandler.formatUserMessage('未知錯誤訊息')).toBe('未知錯誤訊息');
  });

  test('LogExportValidator enforces filename, content, and MIME contracts', async () => {
    const { validateLogExportData } = await import('../../../scripts/utils/LogExportValidator.js');

    expect(() =>
      validateLogExportData({
        filename: 'notion-debug.json',
        content: '[]',
        mimeType: 'application/json',
      })
    ).not.toThrow();
    expect(() =>
      validateLogExportData({
        filename: '../debug.json',
        content: '[]',
        mimeType: 'application/json',
      })
    ).toThrow(/Invalid filename/);
    expect(() =>
      validateLogExportData({
        filename: 'notion-debug.txt',
        content: 'logs',
        mimeType: 'application/json',
      })
    ).toThrow(/Invalid MIME type/);
  });

  test('LogSanitizer redacts sensitive values while preserving safe headers', async () => {
    const { LogSanitizer, sanitizeUrlForLogging } =
      await import('../../../scripts/utils/LogSanitizer.js');

    const sanitized = LogSanitizer.sanitizeEntry('Bearer secret_abc123', {
      url: 'https://example.com/page?token=abc&utm_source=x',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer secret',
      },
      title: 'Private title',
    });

    expect(sanitized.message).toContain('[REDACTED_AUTH_HEADER]');
    expect(sanitized.context).toEqual({
      url: 'https://example.com/page?token=[REDACTED_TOKEN]',
      headers: {
        Accept: 'application/json',
        Authorization: '[REDACTED_HEADER]',
      },
      title: '[REDACTED_TITLE]',
    });
    expect(sanitizeUrlForLogging('not a url')).toBe('[invalid-url]');
  });

  test('account, content, temporary image, and concurrency utilities preserve production semantics', async () => {
    const { resolveAccountDisplayProfile } =
      await import('../../../scripts/utils/accountDisplayUtils.js');
    const { isTitleConsistent } = await import('../../../scripts/utils/contentUtils.js');
    const { isTemporaryImageUrl } = await import('../../../scripts/utils/temporaryImageUrl.js');
    const { pMap } = await import('../../../scripts/utils/concurrencyUtils.js');

    expect(
      resolveAccountDisplayProfile({
        email: 'fallback@example.com',
        displayName: ' Native User ',
      })
    ).toEqual({
      normalizedDisplayName: 'Native User',
      email: 'fallback@example.com',
      displayLabel: 'Native User',
      avatarFallbackInitial: 'N',
    });
    expect(isTitleConsistent('Native ESM Guide', 'Native ESM Guide | Docs')).toBe(true);
    expect(
      isTemporaryImageUrl(
        'https://cdn.patreonusercontent.com/image.png?token-time=123&token-hash=abc'
      )
    ).toBe(true);

    let active = 0;
    let maxActive = 0;
    const results = await pMap(
      [1, 2, 3, 4],
      async value => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return value * 2;
      },
      { concurrency: 2 }
    );

    expect(results).toEqual([2, 4, 6, 8]);
    expect(maxActive).toBeLessThanOrEqual(2);
    await expect(pMap([], jest.fn(), { concurrency: 0 })).rejects.toThrow(/positive integer/);
  });
});
