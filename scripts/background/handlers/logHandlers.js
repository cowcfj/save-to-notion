/**
 * Log Handlers
 *
 * 處理與日誌相關的訊息請求，如導出除錯日誌。
 *
 * @module handlers/logHandlers
 */

import { LogExporter } from '../../utils/LogExporter.js';
import { ErrorHandler, ErrorTypes } from '../../utils/ErrorHandler.js';
import {
  validateInternalRequest,
  validateContentScriptRequest,
} from '../../utils/securityUtils.js';
import Logger from '../../utils/Logger.js';

/**
 * 處理導出除錯日誌的請求
 *
 * @param {object} message - 訊息物件，包含導出格式
 * @param {object} sender - 訊息發送者資訊
 * @param {Function} sendResponse - 回應回調函數
 */
export const exportDebugLogs = (message, sender, sendResponse) => {
  // 安全性驗證：確保請求來自擴充功能內部 (Options)
  const validationError = validateInternalRequest(sender);
  if (validationError) {
    sendResponse(validationError);
    return;
  }

  try {
    // LogExporter.exportLogs 內含即時脫敏邏輯
    const result = LogExporter.exportLogs({ format: message.format });
    sendResponse({
      success: true,
      data: result,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: ErrorHandler.formatUserMessage(error),
      errorType: error.type || ErrorTypes.INTERNAL,
    });
  }
};

/**
 * 處理來自其他上下文（如 Popup/Options）的日誌匯入
 *
 * @param {object} message - 訊息物件
 * @param {object} sender - 發送者資訊
 * @param {Function} sendResponse - 回應回調
 */
export const handleDevLogSink = (message, sender, sendResponse) => {
  // 安全性驗證：確保請求來自擴充功能內部或 Content Script
  // 優先允許內部請求，如果不是內部請求則檢查是否為我們的 Content Script
  const internalError = validateInternalRequest(sender);
  if (internalError) {
    const csError = validateContentScriptRequest(sender);
    if (csError) {
      sendResponse(csError);
      return;
    }
  }

  try {
    const { level, message: logMessage, args } = message;

    // 解析上下文
    let context = {};
    if (args && Array.isArray(args) && args.length > 0) {
      if (typeof args[0] === 'object' && args[0] !== null) {
        context = args[0];
        // 如果有多個參數，將其餘放入 details
        if (args.length > 1) {
          context.details = args.slice(1);
        }
      } else {
        context = { details: args };
      }
    }

    Logger.addLogToBuffer({
      level,
      message: logMessage,
      context,
      source: sender.url ? new URL(sender.url).pathname : 'unknown_external',
      timestamp: new Date().toISOString(),
    });

    sendResponse({ success: true });
  } catch (error) {
    // 靜默失敗，避免日誌迴圈
    sendResponse({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 創建日誌處理程序物件
 *
 * @returns {object} 包含日誌處理函數的物件
 */
export function createLogHandlers() {
  return {
    exportDebugLogs,
    devLogSink: handleDevLogSink,
  };
}
