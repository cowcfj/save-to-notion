/**
 * MessageHandler - 消息路由處理器
 *
 * 職責：統一處理來自 popup/content script 的消息
 * - 按 action 分派到對應的處理函數
 * - 統一錯誤處理（支持結構化的 AppError）
 * - 支持異步響應
 *
 * @module handlers/MessageHandler
 */

/* global chrome */

import { ErrorHandler, AppError, ErrorTypes } from '../../utils/ErrorHandler.js';

/**
 * MessageHandler 類
 */
class MessageHandler {
  /**
   * @param {object} options - 配置選項
   * @param {object} options.logger - 日誌對象
   * @param {object} options.handlers - 處理函數映射
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.handlers = new Map();

    // 註冊傳入的處理函數
    if (options.handlers) {
      Object.entries(options.handlers).forEach(([action, handler]) => {
        this.register(action, handler);
      });
    }
  }

  /**
   * 註冊消息處理函數
   *
   * @param {string} action - 動作名稱
   * @param {Function} handler - 處理函數
   */
  register(action, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler for action '${action}' must be a function`);
    }
    this.handlers.set(action, handler);
  }

  /**
   * 批量註冊處理函數
   *
   * @param {object} handlersMap - 處理函數映射
   */
  registerAll(handlersMap) {
    Object.entries(handlersMap).forEach(([action, handler]) => {
      this.register(action, handler);
    });
  }

  /**
   * 格式化錯誤響應
   * 支持結構化的 AppError 和普通 Error
   * 注意：為防止敏感資訊洩漏，非 AppError 類型的錯誤會返回通用訊息
   *
   * @param {Error} error - 錯誤對象
   * @param {string} action - 動作名稱
   * @returns {object} 格式化的錯誤響應
   * @private
   */
  static _formatError(error, action) {
    if (error instanceof AppError) {
      // AppError 的訊息由開發者控制，視為安全
      return error.toResponse();
    }

    // 對於非 AppError：使用 ErrorHandler 進行格式化
    // 完整錯誤細節已由調用方（handle 方法）記錄到日誌
    return {
      success: false,
      error: ErrorHandler.formatUserMessage(error),
      errorType: ErrorTypes.INTERNAL,
      action,
    };
  }

  /**
   * 處理消息
   *
   * @param {object} request - 請求對象
   * @param {object} sender - 發送者信息
   * @param {Function} sendResponse - 響應函數
   * @returns {boolean} 是否為異步處理
   */
  handle(request, sender, sendResponse) {
    const { action } = request;

    try {
      // 檢查是否有對應的處理函數
      if (!this.handlers.has(action)) {
        sendResponse({ success: false, error: `Unknown action: ${action}` });
        return false;
      }

      const handler = this.handlers.get(action);

      // 執行處理函數，支持 Promise
      Promise.resolve(handler(request, sender, sendResponse)).catch(error => {
        const errorResponse = MessageHandler._formatError(error, action);
        this.logger.error?.(`Handler error for action '${action}':`, error);
        try {
          sendResponse(errorResponse);
        } catch {
          /* 忽略 sendResponse 錯誤 */
        }
      });

      return true; // 表示異步響應
    } catch (error) {
      const errorResponse = MessageHandler._formatError(error, action);
      this.logger.error?.('MessageHandler error:', error);
      sendResponse(errorResponse);
      return false;
    }
  }

  /**
   * 設置為 Chrome 運行時監聽器
   */
  setupListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        return this.handle(request, sender, sendResponse);
      });
      this.logger.log?.('✅ MessageHandler listener setup complete');
    }
  }

  /**
   * 獲取已註冊的動作列表
   *
   * @returns {string[]}
   */
  getRegisteredActions() {
    return Array.from(this.handlers.keys());
  }
}

// 導出
export { MessageHandler };
