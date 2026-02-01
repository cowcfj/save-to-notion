/* global Logger */
import { ERROR_MESSAGES } from '../config/constants.js';

/**
 * 統一錯誤處理系統
 * 提供標準化的錯誤類型和日誌記錄
 */

/**
 * 錯誤類型枚舉
 */
const ErrorTypes = {
  // 原有類型
  EXTRACTION_FAILED: 'extraction_failed',
  INVALID_URL: 'invalid_url',
  NETWORK_ERROR: 'network_error',
  PARSING_ERROR: 'parsing_error',
  PERFORMANCE_WARNING: 'performance_warning',
  DOM_ERROR: 'dom_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error',
  // 背景服務相關類型
  STORAGE: 'storage', // 存儲操作錯誤
  NOTION_API: 'notion_api', // Notion API 錯誤
  INJECTION: 'injection', // 腳本注入錯誤
  PERMISSION: 'permission', // 權限不足
  INTERNAL: 'internal', // 內部錯誤
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
 * 錯誤類型對應的日誌級別
 */
const LOG_LEVELS = {
  [ErrorTypes.EXTRACTION_FAILED]: 'warn',
  [ErrorTypes.INVALID_URL]: 'warn',
  [ErrorTypes.NETWORK_ERROR]: 'error',
  [ErrorTypes.PARSING_ERROR]: 'warn',
  [ErrorTypes.PERFORMANCE_WARNING]: 'info',
  [ErrorTypes.DOM_ERROR]: 'warn',
  [ErrorTypes.VALIDATION_ERROR]: 'warn',
  [ErrorTypes.TIMEOUT_ERROR]: 'error',
  // 新增類型的日誌級別
  [ErrorTypes.STORAGE]: 'error',
  [ErrorTypes.NOTION_API]: 'error',
  [ErrorTypes.INJECTION]: 'warn',
  [ErrorTypes.PERMISSION]: 'warn',
  [ErrorTypes.INTERNAL]: 'error',
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
   * 淨化日誌內容（防止日誌注入和敏感資訊外洩）
   * @param {string} str - 要淨化的字串
   * @param {number} maxLength - 最大長度
   * @returns {string} 淨化後的字串
   */
  static sanitizeLogContent(str, maxLength = 200) {
    if (!str) {
      return '';
    }
    return String(str)
      .replace(/[\r\n]+/g, ' ') // 移除換行防止日誌注入
      .slice(0, maxLength);
  }

  /**
   * 記錄錯誤信息
   * @param {Object} errorInfo - 錯誤信息對象
   * @param {string} errorInfo.type - 錯誤類型
   * @param {string} errorInfo.context - 錯誤上下文
   * @param {Error} [errorInfo.originalError] - 原始錯誤對象
   */
  static logError(errorInfo) {
    // 防禦性檢查：確保輸入有效
    if (!errorInfo || typeof errorInfo !== 'object') {
      this.logger.warn('[ErrorHandler] logError called with invalid input');
      return;
    }

    const { type = 'unknown', context = '', originalError } = errorInfo;

    // 淨化日誌內容
    const safeContext = this.sanitizeLogContent(context);
    const safeMessage = this.sanitizeLogContent(originalError?.message);

    // 根據錯誤類型選擇日誌級別
    const logLevel = this.getLogLevel(type);
    const message = `[${type}] ${safeContext}: ${safeMessage || 'Unknown error'}`;

    switch (logLevel) {
      case 'error':
        this.logger.error(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
      case 'info':
        this.logger.info(message);
        break;
      default:
        this.logger.warn(message);
    }
  }

  /**
   * 根據錯誤類型獲取日誌級別
   * @param {string} errorType - 錯誤類型
   * @returns {string} 日誌級別
   */
  static getLogLevel(errorType) {
    return LOG_LEVELS[errorType] || 'warn';
  }

  /**
   * 格式化用戶可見的錯誤訊息
   *
   * 實作分層架構下的錯誤翻譯邏輯：
   * 1. 兼容性檢查：如果訊息本身已包含中文字符，視為已翻譯訊息，直接返回。
   * 2. 精確匹配：優先查找是否為預定義的 Error Code 鍵（如 'rate_limit'）。
   * 3. 模式匹配：回退到傳統的關鍵字子字串匹配（如 'API Key'）。
   * 4. 兜底保護：若均未命中，返回統一的預設友善訊息。
   *
   * @param {Error|string} error - 原始錯誤物件或錯誤代碼字串
   * @returns {string} 格式化後的用戶友善錯誤訊息
   */
  static formatUserMessage(error) {
    if (!error) {
      return ERROR_MESSAGES.DEFAULT;
    }

    const message = error instanceof Error ? error.message : String(error);

    // [兼容性墊片]：如果訊息已經包含中文字符，說明已經是友善訊息，直接返回
    if (/[\u4e00-\u9fa5]/u.test(message)) {
      return message;
    }

    // [第一層：精確匹配]
    // 檢查 message 是否完全等於 PATTERNS 中的某個 Key (Error Code 模式)
    if (ERROR_MESSAGES.PATTERNS[message]) {
      return ERROR_MESSAGES.PATTERNS[message];
    }

    // [第二層：模式匹配]
    // 傳統的關鍵字子字串檢查 (Legacy 模式)
    const lowerMessage = message.toLowerCase();
    for (const [pattern, friendly] of Object.entries(ERROR_MESSAGES.PATTERNS)) {
      if (lowerMessage.includes(pattern.toLowerCase())) {
        return friendly;
      }
    }

    // [第三層：兜底保護]
    // 防止直接將技術代碼 (如 'unknown_api_response') 顯示給用戶
    return ERROR_MESSAGES.DEFAULT;
  }
}

/**
 * 應用錯誤類別
 * 提供結構化的錯誤信息，便於前端根據錯誤類型顯示適當的提示
 */
class AppError extends Error {
  /**
   * @param {string} type - 錯誤類型（使用 ErrorTypes）
   * @param {string} message - 錯誤訊息
   * @param {Object} details - 額外詳情
   */
  constructor(type, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.details = details;
    this.timestamp = Date.now();
  }

  /**
   * 轉換為 JSON 格式（用於 sendResponse）
   * @returns {Object}
   */
  toJSON() {
    return {
      type: this.type,
      message: this.message,
      details: this.details,
    };
  }

  /**
   * 轉換為標準響應格式
   * @returns {Object}
   */
  toResponse() {
    return {
      success: false,
      error: this.message,
      errorType: this.type,
      details: this.details,
    };
  }
}

/**
 * 便捷工廠函數
 * 用於快速創建特定類型的 AppError
 */
const Errors = {
  network: (msg, details) => new AppError(ErrorTypes.NETWORK_ERROR, msg, details),
  storage: (msg, details) => new AppError(ErrorTypes.STORAGE, msg, details),
  validation: (msg, details) => new AppError(ErrorTypes.VALIDATION_ERROR, msg, details),
  notionApi: (msg, details) => new AppError(ErrorTypes.NOTION_API, msg, details),
  injection: (msg, details) => new AppError(ErrorTypes.INJECTION, msg, details),
  permission: (msg, details) => new AppError(ErrorTypes.PERMISSION, msg, details),
  internal: (msg, details) => new AppError(ErrorTypes.INTERNAL, msg, details),
  timeout: (msg, details) => new AppError(ErrorTypes.TIMEOUT_ERROR, msg, details),
  extractionFailed: (msg, details) => new AppError(ErrorTypes.EXTRACTION_FAILED, msg, details),
  invalidUrl: (msg, details) => new AppError(ErrorTypes.INVALID_URL, msg, details),
  parsingError: (msg, details) => new AppError(ErrorTypes.PARSING_ERROR, msg, details),
  performanceWarning: (msg, details) => new AppError(ErrorTypes.PERFORMANCE_WARNING, msg, details),
  domError: (msg, details) => new AppError(ErrorTypes.DOM_ERROR, msg, details),
};

// 導出類和常量

export { ErrorHandler, ErrorTypes, ErrorSeverity, AppError, Errors };
