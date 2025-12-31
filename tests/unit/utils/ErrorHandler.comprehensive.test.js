/**
 * ErrorHandler 測試套件
 * 測試簡化後的錯誤處理系統
 */
/* eslint-env jest */

import {
  ErrorHandler,
  ErrorTypes,
  ErrorSeverity,
  AppError,
  Errors,
} from '../../../scripts/utils/ErrorHandler';

describe('ErrorHandler - 測試', () => {
  // 保存原始的 console 方法
  /** @type {Object|null} */
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
    global.Logger = mockLogger;
    if (typeof window !== 'undefined') {
      window.Logger = mockLogger;
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
