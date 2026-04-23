/**
 * Log Handlers
 *
 * 處理與日誌相關的訊息請求，如導出除錯日誌。
 *
 * @module handlers/logHandlers
 */

import { LogExporter } from '../../utils/LogExporter.js';
import { RUNTIME_ACTIONS } from '../../config/shared/messaging/runtime/index.js';
import { ErrorHandler, ErrorTypes } from '../../utils/ErrorHandler.js';
import {
  validateInternalRequest,
  validateContentScriptRequest,
} from '../../utils/securityUtils.js';
import Logger, { parseArgsToContext } from '../../utils/Logger.js';

/** 接收端批量日誌的最大數量限制，防禦過量批次 */
const MAX_BATCH_SIZE = 20;

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
 * 驗證日誌來源請求的合法性
 * 允許來自擴充功能內部（Popup/Options）或 Content Script 的請求
 *
 * @param {object} sender - 訊息發送者資訊
 * @returns {object|null} 驗證失敗時回傳錯誤物件，成功時回傳 null
 */
function validateLogSourceRequest(sender) {
  const internalError = validateInternalRequest(sender);
  if (internalError) {
    const csError = validateContentScriptRequest(sender);
    if (csError) {
      return csError;
    }
  }
  return null;
}

/**
 * 處理來自其他上下文（如 Popup/Options）的日誌匯入
 *
 * @param {object} message - 訊息物件
 * @param {object} sender - 發送者資訊
 * @param {Function} sendResponse - 回應回調
 */
export const handleDevLogSink = (message, sender, sendResponse) => {
  const validationError = validateLogSourceRequest(sender);
  if (validationError) {
    sendResponse(validationError);
    return;
  }

  try {
    const { level, message: logMessage, args } = message;
    const context = parseArgsToContext(args);

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
 * 處理來自 Content Script 的批量日誌嵌入（devLogSinkBatch）
 * 將多條日誌一次寫入 LogBuffer，減少 IPC 次數。
 *
 * @param {object} message - 訊息物件，包含 logs 陣列
 * @param {object} sender - 發送者資訊
 * @param {Function} sendResponse - 回應回調函數
 */
export const handleDevLogSinkBatch = (message, sender, sendResponse) => {
  const validationError = validateLogSourceRequest(sender);
  if (validationError) {
    sendResponse(validationError);
    return;
  }

  try {
    const { logs } = message;
    if (!Array.isArray(logs)) {
      sendResponse({ success: false, error: 'Invalid batch format' });
      return;
    }

    // 防禦性限制：截斷超過 MAX_BATCH_SIZE 的批次，避免處理過量日誌
    const safeLogs = logs.length > MAX_BATCH_SIZE ? logs.slice(0, MAX_BATCH_SIZE) : logs;

    const sourcePath = sender.url ? new URL(sender.url).pathname : 'unknown_external';

    for (const entry of safeLogs) {
      const { level, message: logMessage, args = [] } = entry;
      const context = parseArgsToContext(args);

      Logger.addLogToBuffer({
        level,
        message: String(logMessage),
        context,
        source: sourcePath,
        timestamp: new Date().toISOString(),
      });
    }

    sendResponse({ success: true });
  } catch (error) {
    // 靜默失敗，避免日誌迴圈
    sendResponse({ success: false, error: error.message });
  }
};

/**
 * 創建日誌處理程序物件
 *
 * @returns {object} 包含日誌處理函數的物件
 */
export function createLogHandlers() {
  return {
    [RUNTIME_ACTIONS.EXPORT_DEBUG_LOGS]: exportDebugLogs,
    [RUNTIME_ACTIONS.DEV_LOG_SINK]: handleDevLogSink,
    [RUNTIME_ACTIONS.DEV_LOG_SINK_BATCH]: handleDevLogSinkBatch,
  };
}
