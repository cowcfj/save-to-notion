import {
  buildContentScriptGuardMeta,
  buildInternalGuardMeta,
  buildMigrationGuardMeta,
  buildSimpleGuardMeta,
  clearLegacyKeysWithStable,
  sendGuardFailure,
  sendStandardHandlerError,
  validateBatchUrls,
  validatePrivilegedRequest,
} from '../../../../scripts/background/handlers/handlerGuard.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/shared/messages.js';
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
import {
  isValidUrl,
  sanitizeApiError,
  sanitizeUrlForLogging,
  validateInternalRequest,
} from '../../../../scripts/utils/securityUtils.js';
import { computeStableUrl } from '../../../../scripts/utils/urlUtils.js';

jest.mock('../../../../scripts/utils/securityUtils.js', () => ({
  sanitizeApiError: jest.fn(),
  sanitizeUrlForLogging: jest.fn(url => `safe:${url}`),
  validateInternalRequest: jest.fn(),
  isValidUrl: jest.fn(url => typeof url === 'string' && url.startsWith('https://')),
}));

jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    formatUserMessage: jest.fn(),
  },
}));

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  computeStableUrl: jest.fn(),
}));

describe('handlerGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    computeStableUrl.mockReturnValue(null);
  });

  describe('validatePrivilegedRequest', () => {
    const senderError = { success: false, error: 'INTERNAL_ONLY' };

    it('sender 不合法時直接透傳 validateInternalRequest 錯誤，不檢查 URL', () => {
      validateInternalRequest.mockReturnValue(senderError);

      const result = validatePrivilegedRequest(
        { id: 'foreign-extension', tab: { id: 1 }, url: 'https://malicious.example' },
        'https://example.com'
      );

      expect(result).toBe(senderError);
      expect(isValidUrl).not.toHaveBeenCalled();
    });

    it('sender 合法但 URL 不合法時回傳 INVALID_URL_PROTOCOL', () => {
      validateInternalRequest.mockReturnValue(null);

      const result = validatePrivilegedRequest(
        { id: 'mock-extension-id' },
        'ftp://invalid.example'
      );

      expect(result).toEqual({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URL_PROTOCOL,
      });
      expect(isValidUrl).toHaveBeenCalledWith('ftp://invalid.example');
    });

    it('sender 與 URL 皆合法時回傳 null（success path）', () => {
      validateInternalRequest.mockReturnValue(null);

      expect(
        validatePrivilegedRequest({ id: 'mock-extension-id' }, 'https://example.com/article')
      ).toBeNull();
    });

    it('未提供 URL 時跳過 URL 驗證', () => {
      validateInternalRequest.mockReturnValue(null);

      expect(validatePrivilegedRequest({ id: 'mock-extension-id' })).toBeNull();
      expect(isValidUrl).not.toHaveBeenCalled();
    });
  });

  describe('sendGuardFailure', () => {
    it('記錄安全性阻擋並送出 validation error', () => {
      const validationError = { success: false, error: '拒絕訪問' };
      const logMeta = { action: 'migration_execute', error: validationError.error };
      const sendResponse = jest.fn();

      sendGuardFailure(validationError, sendResponse, logMeta);

      expect(globalThis.Logger.warn).toHaveBeenCalledWith('安全性阻擋', logMeta);
      expect(sendResponse).toHaveBeenCalledWith(validationError);
    });
  });

  describe('guard metadata builders', () => {
    const sender = { id: 'extension-id', tab: { id: 9 } };
    const validationError = { success: false, error: 'blocked' };

    it('buildMigrationGuardMeta 有 URL 時保留 migration log schema 並 sanitize URL', () => {
      const meta = buildMigrationGuardMeta({
        action: 'migration_execute',
        sender,
        validationError,
        url: 'https://example.com/private?token=secret',
      });

      expect(meta).toEqual({
        action: 'migration_execute',
        senderId: 'extension-id',
        url: 'safe:https://example.com/private?token=secret',
        error: 'blocked',
        result: 'blocked',
      });
      expect(sanitizeUrlForLogging).toHaveBeenCalledWith(
        'https://example.com/private?token=secret'
      );
    });

    it('buildMigrationGuardMeta 無 URL 時不新增 url 欄位', () => {
      expect(
        buildMigrationGuardMeta({
          action: 'migration_batch',
          sender,
          validationError,
        })
      ).toEqual({
        action: 'migration_batch',
        senderId: 'extension-id',
        error: 'blocked',
        result: 'blocked',
      });
    });

    it('buildContentScriptGuardMeta 保留 content script validation schema', () => {
      expect(
        buildContentScriptGuardMeta({ action: 'syncHighlights', sender, validationError })
      ).toEqual({
        action: 'syncHighlights',
        reason: 'invalid_content_script_request',
        error: 'blocked',
        senderId: 'extension-id',
        tabId: 9,
        result: 'blocked',
      });
    });

    it('buildInternalGuardMeta 保留 internal validation schema', () => {
      expect(buildInternalGuardMeta({ action: 'startHighlight', sender, validationError })).toEqual(
        {
          action: 'startHighlight',
          reason: 'invalid_internal_request',
          error: 'blocked',
          senderId: 'extension-id',
          tabId: 9,
          result: 'blocked',
        }
      );
    });

    it('buildSimpleGuardMeta 只輸出 simple log schema', () => {
      expect(
        buildSimpleGuardMeta({
          action: 'UPDATE_HIGHLIGHTS',
          reason: 'invalid_content_script_request',
          validationError,
        })
      ).toEqual({
        action: 'UPDATE_HIGHLIGHTS',
        reason: 'invalid_content_script_request',
        error: 'blocked',
        result: 'blocked',
      });
    });
  });

  describe('sendStandardHandlerError', () => {
    it('沿用 migration family 標準錯誤處理流程', () => {
      const error = new Error('raw token leak');
      const sendResponse = jest.fn();

      sanitizeApiError.mockReturnValue('safe-message');
      ErrorHandler.formatUserMessage.mockReturnValue('formatted-message');

      sendStandardHandlerError({
        error,
        logMessage: '遷移失敗',
        action: 'migration_execute',
        sanitizeContext: 'migration_execute',
        sendResponse,
      });

      expect(sanitizeApiError).toHaveBeenCalledWith(error, 'migration_execute');
      expect(globalThis.Logger.error).toHaveBeenCalledWith('遷移失敗', {
        action: 'migration_execute',
        error: 'safe-message',
        result: 'failed',
      });
      expect(ErrorHandler.formatUserMessage).toHaveBeenCalledWith('safe-message');
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'formatted-message',
      });
    });

    it('不會把 raw error.message 寫進 log', () => {
      const error = new Error('Bearer secret-token-abc-xyz');
      const sendResponse = jest.fn();

      sanitizeApiError.mockReturnValue('Authentication Error');
      ErrorHandler.formatUserMessage.mockReturnValue('formatted');

      sendStandardHandlerError({
        error,
        logMessage: '遷移失敗',
        action: 'migration_execute',
        sanitizeContext: 'migration_execute',
        sendResponse,
      });

      const logPayload = globalThis.Logger.error.mock.calls[0][1];
      expect(logPayload.error).toBe('Authentication Error');
      expect(logPayload.error).not.toContain('secret-token-abc-xyz');
    });
  });

  describe('validateBatchUrls', () => {
    it('空陣列回傳 MISSING_URL', () => {
      expect(validateBatchUrls([])).toEqual({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL,
      });
    });

    it('非陣列回傳 MISSING_URL', () => {
      expect(validateBatchUrls('https://example.com')).toEqual({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL,
      });
    });

    it('含 invalid URL 回傳 INVALID_URLS_IN_BATCH', () => {
      expect(validateBatchUrls(['https://valid.example', 'ftp://invalid.example'])).toEqual({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URLS_IN_BATCH,
      });
    });

    it('全部合法時回傳 null', () => {
      expect(validateBatchUrls(['https://a.example', 'https://b.example/path'])).toBeNull();
    });
  });

  describe('clearLegacyKeysWithStable', () => {
    it('原 URL 等於 stable URL 時只清理一次', async () => {
      const storageService = { clearLegacyKeys: jest.fn().mockResolvedValue() };
      computeStableUrl.mockReturnValue('https://example.com/article');

      await clearLegacyKeysWithStable(storageService, 'https://example.com/article');

      expect(storageService.clearLegacyKeys).toHaveBeenCalledWith('https://example.com/article');
      expect(storageService.clearLegacyKeys).toHaveBeenCalledTimes(1);
    });

    it('原 URL 不等於 stable URL 時清理兩個 key', async () => {
      const storageService = { clearLegacyKeys: jest.fn().mockResolvedValue() };
      computeStableUrl.mockReturnValue('https://example.com/stable');

      await clearLegacyKeysWithStable(storageService, 'https://example.com/original');

      expect(storageService.clearLegacyKeys).toHaveBeenCalledWith('https://example.com/original');
      expect(storageService.clearLegacyKeys).toHaveBeenCalledWith('https://example.com/stable');
      expect(storageService.clearLegacyKeys).toHaveBeenCalledTimes(2);
    });

    it('stable URL falsy 時只清理原 URL', async () => {
      const storageService = { clearLegacyKeys: jest.fn().mockResolvedValue() };
      computeStableUrl.mockReturnValue(null);

      await clearLegacyKeysWithStable(storageService, 'https://example.com/original');

      expect(storageService.clearLegacyKeys).toHaveBeenCalledWith('https://example.com/original');
      expect(storageService.clearLegacyKeys).toHaveBeenCalledTimes(1);
    });
  });
});
