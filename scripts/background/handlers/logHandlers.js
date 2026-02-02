import { LogExporter } from '../../utils/LogExporter.js';
import { ErrorHandler, ErrorTypes } from '../../utils/ErrorHandler.js';

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

export function createLogHandlers() {
  return {
    exportDebugLogs,
  };
}
