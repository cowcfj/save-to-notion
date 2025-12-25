/* global Logger */
/**
 * 統一錯誤處理系統
 * 提供標準化的錯誤類型和日誌記錄
 */

/**
 * 錯誤類型枚舉
 */
const ErrorTypes = {
  EXTRACTION_FAILED: 'extraction_failed',
  INVALID_URL: 'invalid_url',
  NETWORK_ERROR: 'network_error',
  PARSING_ERROR: 'parsing_error',
  PERFORMANCE_WARNING: 'performance_warning',
  DOM_ERROR: 'dom_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error',
};

/**
 * 錯誤嚴重程度
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * 統一錯誤處理器
 * 提供標準化的錯誤日誌記錄
 */
class ErrorHandler {
  /**
   * 獲取 Logger 實例 (安全回退)
   * @returns {Object} Logger 實例
   */
  static get logger() {
    if (typeof Logger !== 'undefined') {
      return Logger;
    }
    if (typeof window !== 'undefined' && window.Logger) {
      return window.Logger;
    }
    if (typeof self !== 'undefined' && self.Logger) {
      return self.Logger;
    }
    return console;
  }

  /**
   * 記錄錯誤信息
   * @param {Object} errorInfo - 錯誤信息對象
   * @param {string} errorInfo.type - 錯誤類型
   * @param {string} errorInfo.context - 錯誤上下文
   * @param {Error} [errorInfo.originalError] - 原始錯誤對象
   */
  static logError(errorInfo) {
    const { type, context, originalError } = errorInfo;

    // 根據錯誤類型選擇日誌級別
    const logLevel = this.getLogLevel(type);
    const message = `[${type}] ${context}: ${originalError?.message || 'Unknown error'}`;

    switch (logLevel) {
      case 'error':
        this.logger.error(message, originalError);
        break;
      case 'warn':
        this.logger.warn(message, originalError);
        break;
      case 'info':
        this.logger.info(message, originalError);
        break;
      default:
        this.logger.warn(message, originalError);
    }
  }

  /**
   * 根據錯誤類型獲取日誌級別
   * @param {string} errorType - 錯誤類型
   * @returns {string} 日誌級別
   */
  static getLogLevel(errorType) {
    const logLevels = {
      [ErrorTypes.EXTRACTION_FAILED]: 'warn',
      [ErrorTypes.INVALID_URL]: 'warn',
      [ErrorTypes.NETWORK_ERROR]: 'error',
      [ErrorTypes.PARSING_ERROR]: 'warn',
      [ErrorTypes.PERFORMANCE_WARNING]: 'info',
      [ErrorTypes.DOM_ERROR]: 'warn',
      [ErrorTypes.VALIDATION_ERROR]: 'warn',
      [ErrorTypes.TIMEOUT_ERROR]: 'error',
    };

    return logLevels[errorType] || 'warn';
  }
}

// 導出類和常量

export { ErrorHandler, ErrorTypes, ErrorSeverity };

// CommonJS 兼容（用於測試環境）
// TEST_EXPOSURE_START
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ErrorHandler, ErrorTypes, ErrorSeverity };
}
// TEST_EXPOSURE_END
