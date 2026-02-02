import { LogExporter } from '../../utils/LogExporter.js';

export const exportDebugLogs = (message, sender, sendResponse) => {
  // LogExporter.exportLogs 內含即時脫敏邏輯，MessageHandler 將處理任何未預期的拋錯
  const result = LogExporter.exportLogs({ format: message.format });
  sendResponse({
    success: true,
    data: result,
  });
  // 返回 true 以保持訊息通道，支持異步 sendResponse
  return true;
};

export function createLogHandlers() {
  return {
    exportDebugLogs,
  };
}
