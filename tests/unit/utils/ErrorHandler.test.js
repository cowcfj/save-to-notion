/**
 * ErrorHandler 測試套件
 * 測試簡化後的錯誤處理系統
 */
/* eslint-env jest */

import { ERROR_MESSAGES } from '../../../scripts/config/messages.js';
import {
  ErrorHandler,
  ErrorTypes,
  ErrorSeverity,
  AppError,
  Errors,
} from '../../../scripts/utils/ErrorHandler';

describe('ErrorHandler - 測試', () => {
  // 保存原始的 console 方法
  /** @type {object | null} */
  let originalConsole = null;

  beforeEach(() => {
    // Mock console 方法
    originalConsole = {
      error: console.error,
      warn: console.warn,
      info: console.info,
      log: console.log,
    };

    console.error = jest.fn();
    console.warn = jest.fn();
    console.info = jest.fn();
    console.log = jest.fn();

    // Mock Logger (used by ErrorHandler now)
    const mockLogger = {
      error: console.error,
      warn: console.warn,
      info: console.info,
      log: console.log,
      debug: console.log,
    };
    globalThis.Logger = mockLogger;
    if (globalThis.window !== undefined) {
      globalThis.Logger = mockLogger;
    }
  });

  afterEach(() => {
    // 恢復原始的 console 方法
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
  });

  describe('ErrorTypes 常量', () => {
    test('應該定義所有錯誤類型', () => {
      expect(ErrorTypes.EXTRACTION_FAILED).toBe('extraction_failed');
      expect(ErrorTypes.INVALID_URL).toBe('invalid_url');
      expect(ErrorTypes.NETWORK_ERROR).toBe('network_error');
      expect(ErrorTypes.PARSING_ERROR).toBe('parsing_error');
      expect(ErrorTypes.PERFORMANCE_WARNING).toBe('performance_warning');
      expect(ErrorTypes.DOM_ERROR).toBe('dom_error');
      expect(ErrorTypes.VALIDATION_ERROR).toBe('validation_error');
      expect(ErrorTypes.TIMEOUT_ERROR).toBe('timeout_error');
    });
  });

  describe('ErrorSeverity 常量', () => {
    test('應該定義所有嚴重程度', () => {
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('logError - 記錄錯誤', () => {
    test('應該記錄 error 級別的錯誤', () => {
      const errorInfo = {
        type: ErrorTypes.NETWORK_ERROR,
        context: 'fetch data',
        originalError: new Error('Network failed'),
      };

      ErrorHandler.logError(errorInfo);

      expect(console.error).toHaveBeenCalled();
    });

    test('應該記錄 warn 級別的錯誤', () => {
      const errorInfo = {
        type: ErrorTypes.EXTRACTION_FAILED,
        context: 'extract images',
        originalError: new Error('Extraction failed'),
      };

      ErrorHandler.logError(errorInfo);

      expect(console.warn).toHaveBeenCalled();
    });

    test('應該記錄 info 級別的錯誤', () => {
      const errorInfo = {
        type: ErrorTypes.PERFORMANCE_WARNING,
        context: 'performance check',
        originalError: new Error('Slow operation'),
      };

      ErrorHandler.logError(errorInfo);

      expect(console.info).toHaveBeenCalled();
    });

    test('應該處理沒有 originalError 的情況', () => {
      const errorInfo = {
        type: ErrorTypes.VALIDATION_ERROR,
        context: 'validate input',
      };

      ErrorHandler.logError(errorInfo);

      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('getLogLevel - 獲取日誌級別', () => {
    test('應該為不同錯誤類型返回正確的日誌級別', () => {
      expect(ErrorHandler.getLogLevel(ErrorTypes.NETWORK_ERROR)).toBe('error');
      expect(ErrorHandler.getLogLevel(ErrorTypes.TIMEOUT_ERROR)).toBe('error');
      expect(ErrorHandler.getLogLevel(ErrorTypes.EXTRACTION_FAILED)).toBe('warn');
      expect(ErrorHandler.getLogLevel(ErrorTypes.INVALID_URL)).toBe('warn');
      expect(ErrorHandler.getLogLevel(ErrorTypes.PERFORMANCE_WARNING)).toBe('info');
    });

    test('應該為未知錯誤類型返回默認級別', () => {
      expect(ErrorHandler.getLogLevel('unknown_error')).toBe('warn');
    });
  });

  describe('logger - 獲取 Logger', () => {
    test('應該返回 Logger 或 console', () => {
      const logger = ErrorHandler.logger;
      expect(logger).toBeDefined();
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
    });
  });

  describe('模塊導出', () => {
    test('應該正確導出所有類別和常量', () => {
      expect(ErrorHandler).toBeDefined();
      expect(ErrorTypes).toBeDefined();
      expect(ErrorSeverity).toBeDefined();
      expect(AppError).toBeDefined();
      expect(Errors).toBeDefined();
    });

    test('AppError 應該提供結構化錯誤信息', () => {
      const error = new AppError(ErrorTypes.NETWORK_ERROR, '網絡錯誤', { url: 'test.com' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AppError');
      expect(error.type).toBe(ErrorTypes.NETWORK_ERROR);
      expect(error.message).toBe('網絡錯誤');
      expect(error.details).toEqual({ url: 'test.com' });
      expect(error.timestamp).toBeDefined();
    });

    test('AppError.toResponse 應該返回標準響應格式', () => {
      const error = new AppError(ErrorTypes.STORAGE, '存儲錯誤');
      const response = error.toResponse();

      expect(response).toEqual({
        success: false,
        error: '存儲錯誤',
        errorType: ErrorTypes.STORAGE,
        details: {},
      });
    });

    test('Errors 工廠函數應該創建正確類型的 AppError', () => {
      expect(Errors.network('msg').type).toBe(ErrorTypes.NETWORK_ERROR);
      expect(Errors.storage('msg').type).toBe(ErrorTypes.STORAGE);
      expect(Errors.validation('msg').type).toBe(ErrorTypes.VALIDATION_ERROR);
      expect(Errors.notionApi('msg').type).toBe(ErrorTypes.NOTION_API);
      expect(Errors.injection('msg').type).toBe(ErrorTypes.INJECTION);
      expect(Errors.permission('msg').type).toBe(ErrorTypes.PERMISSION);
      expect(Errors.internal('msg').type).toBe(ErrorTypes.INTERNAL);
      expect(Errors.timeout('msg').type).toBe(ErrorTypes.TIMEOUT_ERROR);
    });
  });
});

// ===== MERGED FORMAT MESSAGE TESTS =====
{
  /**
   * ErrorHandler.formatUserMessage 測試套件
   */
  /* eslint-env jest */

  describe('ErrorHandler.formatUserMessage', () => {
    let mockLogger = null;

    beforeEach(() => {
      mockLogger = {
        debugEnabled: false,
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        log: jest.fn(),
        debug: jest.fn(),
      };
      globalThis.Logger = mockLogger;

      // 確保 jest.resetModules() 之後重新加載，或者直接控制 mock
      jest.spyOn(ErrorHandler, 'logger', 'get').mockReturnValue(mockLogger);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('精確匹配標準化的 Error Code 應返回友善訊息', () => {
      mockLogger.debugEnabled = true;
      // 現在只進行精確匹配，錯誤應先經過 sanitizeApiError 標準化
      expect(ErrorHandler.formatUserMessage('No tab with id')).toBe(
        ERROR_MESSAGES.PATTERNS['No tab with id']
      );
    });

    test('當為未知錯誤且 debugEnabled 為 true 時，應返回預設友善訊息', () => {
      mockLogger.debugEnabled = true;
      const secretError = 'Database connection failed with password: confirm_password';
      expect(ErrorHandler.formatUserMessage(secretError)).toBe(ERROR_MESSAGES.DEFAULT);
    });

    test('多個標準化 Error Code 應正確匹配', () => {
      mockLogger.debugEnabled = false;

      // 測試精確匹配 "No tab with id"（完全等於 PATTERNS 的 key）
      expect(ErrorHandler.formatUserMessage('No tab with id')).toBe(
        ERROR_MESSAGES.PATTERNS['No tab with id']
      );

      // 測試精確匹配 "API Key"
      expect(ErrorHandler.formatUserMessage('API Key')).toBe(ERROR_MESSAGES.PATTERNS['API Key']);

      // 測試精確匹配 "rate limit"
      expect(ErrorHandler.formatUserMessage('rate limit')).toBe(
        ERROR_MESSAGES.PATTERNS['rate limit']
      );
    });

    test('當為未知錯誤且 debugEnabled 為 false 時，應返回預設友善訊息', () => {
      mockLogger.debugEnabled = false;
      expect(ErrorHandler.formatUserMessage('Some cryptic internal system error')).toBe(
        ERROR_MESSAGES.DEFAULT
      );
    });

    test('應防禦性處理原始 Error 物件輸入', () => {
      mockLogger.debugEnabled = false;
      // 測試 formatUserMessage 對原始 Error 物件的防禦性處理
      // 注意：正規流程應先經過 sanitizeApiError 標準化，此測試驗證直接傳入 Error 物件時的容錯機制
      const error = new Error('Network error');
      expect(ErrorHandler.formatUserMessage(error)).toBe(ERROR_MESSAGES.PATTERNS['Network error']);
    });

    test('非精確匹配的訊息應返回預設錯誤（不再支援模糊匹配）', () => {
      mockLogger.debugEnabled = false;
      // 舊的模糊匹配邏輯已移除，非精確匹配的訊息會返回預設錯誤
      expect(ErrorHandler.formatUserMessage('NO TAB WITH ID: 999')).toBe(ERROR_MESSAGES.DEFAULT);
      expect(ErrorHandler.formatUserMessage('api key is missing')).toBe(ERROR_MESSAGES.DEFAULT);
    });

    describe('XSS 防護 (安全渲染策略)', () => {
      test('包含中文的惡意字串應保持原樣 (由 UI 層負責轉義)', () => {
        const malicious = '發生錯誤<script>alert("XSS")</script>';
        const result = ErrorHandler.formatUserMessage(malicious);
        // 驗證 ErrorHandler 不進行轉義，而是由這裡的 expect 確認它“未被轉義”
        // 實際的安全防護由 textContent 在 UI 層完成
        expect(result).toBe(malicious);
      });

      test('包含中文的 img onerror 攻擊應保持原樣 (由 UI 層負責轉義)', () => {
        const malicious = '請稍後再試<img src=x onerror=alert(1)>';
        const result = ErrorHandler.formatUserMessage(malicious);
        expect(result).toBe(malicious);
      });

      test('純中文字串應保持不變', () => {
        const chinese = '這是一段中文錯誤訊息';
        const result = ErrorHandler.formatUserMessage(chinese);
        expect(result).toBe(chinese);
      });

      test('含特殊字符的中文訊息應保持不變', () => {
        const withSpecialChars = '錯誤: "a" & "b"';
        const result = ErrorHandler.formatUserMessage(withSpecialChars);
        expect(result).toBe(withSpecialChars);
      });
    });
  });
}
