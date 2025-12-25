/**
 * ErrorHandler 測試套件
 * 測試簡化後的錯誤處理系統
 */
/* eslint-env jest */

const { ErrorHandler, ErrorTypes, ErrorSeverity } = require('../../../scripts/utils/ErrorHandler');

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

    // 重置錯誤統計
    ErrorHandler.errorStats = new Map();
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
        timestamp: Date.now(),
      };

      ErrorHandler.logError(errorInfo);

      expect(console.error).toHaveBeenCalled();
    });

    test('應該記錄 warn 級別的錯誤', () => {
      const errorInfo = {
        type: ErrorTypes.EXTRACTION_FAILED,
        context: 'extract images',
        originalError: new Error('Extraction failed'),
        timestamp: Date.now(),
      };

      ErrorHandler.logError(errorInfo);

      expect(console.warn).toHaveBeenCalled();
    });

    test('應該記錄 info 級別的錯誤', () => {
      const errorInfo = {
        type: ErrorTypes.PERFORMANCE_WARNING,
        context: 'performance check',
        originalError: new Error('Slow operation'),
        timestamp: Date.now(),
      };

      ErrorHandler.logError(errorInfo);

      expect(console.info).toHaveBeenCalled();
    });

    test('應該處理沒有 originalError 的情況', () => {
      const errorInfo = {
        type: ErrorTypes.VALIDATION_ERROR,
        context: 'validate input',
        timestamp: Date.now(),
      };

      ErrorHandler.logError(errorInfo);

      expect(console.warn).toHaveBeenCalled();
    });

    test('應該更新錯誤統計', () => {
      const errorInfo = {
        type: ErrorTypes.DOM_ERROR,
        context: 'DOM operation',
        originalError: new Error('DOM error'),
        timestamp: Date.now(),
      };

      ErrorHandler.logError(errorInfo);

      expect(ErrorHandler.errorStats.get(ErrorTypes.DOM_ERROR)).toBe(1);
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

  describe('updateErrorStats - 錯誤統計', () => {
    test('應該正確統計錯誤次數', () => {
      ErrorHandler.updateErrorStats(ErrorTypes.NETWORK_ERROR);
      ErrorHandler.updateErrorStats(ErrorTypes.NETWORK_ERROR);
      ErrorHandler.updateErrorStats(ErrorTypes.DOM_ERROR);

      expect(ErrorHandler.errorStats.get(ErrorTypes.NETWORK_ERROR)).toBe(2);
      expect(ErrorHandler.errorStats.get(ErrorTypes.DOM_ERROR)).toBe(1);
    });

    test('應該在 errorStats 不存在時初始化它', () => {
      ErrorHandler.errorStats = null;
      ErrorHandler.updateErrorStats(ErrorTypes.PARSING_ERROR);

      expect(ErrorHandler.errorStats).toBeDefined();
      expect(ErrorHandler.errorStats.get(ErrorTypes.PARSING_ERROR)).toBe(1);
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
    test('應該正確導出到 module.exports', () => {
      const exported = require('../../../scripts/utils/ErrorHandler');

      expect(exported.ErrorHandler).toBeDefined();
      expect(exported.ErrorTypes).toBeDefined();
      expect(exported.ErrorSeverity).toBeDefined();
    });
  });
});
