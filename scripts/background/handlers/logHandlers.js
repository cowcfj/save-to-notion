/**
 * Log Handlers
 *
 * 處理與日誌相關的訊息請求，如導出除錯日誌。
 *
 * @module handlers/logHandlers
 */

import { LogExporter } from '../../utils/LogExporter.js';
import { ErrorHandler, ErrorTypes } from '../../utils/ErrorHandler.js';

/**
 * 處理導出除錯日誌的請求
 *
 * @param {object} message - 訊息物件，包含導出格式
 * @param {object} sender - 訊息發送者資訊
 * @param {Function} sendResponse - 回應回調函數
 * @returns {boolean} 返回 true 以支援並行非同步回應
 */
export const exportDebugLogs = (message, sender, sendResponse) => {
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
  // 返回 true 以保持訊息通道，支持潛在的異步擴展
  return true;
};

/**
 * 創建日誌處理程序物件
 *
 * @returns {object} 包含日誌處理函數的物件
 */
export function createLogHandlers() {
  return {
    exportDebugLogs,
  };
}
