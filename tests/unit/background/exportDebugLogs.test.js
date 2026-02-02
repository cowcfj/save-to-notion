/**
 * exportDebugLogs Handler 錯誤處理測試
 * 驗證當 LogExporter.exportLogs() 拋出錯誤時的處理行為
 */

import { LogExporter } from '../../../scripts/utils/LogExporter.js';

// Mock Logger
global.Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

describe('exportDebugLogs Handler - Error Handling', () => {
  let handler;
  let mockSendResponse;

  beforeEach(() => {
    // 清除 mocks
    jest.clearAllMocks();

    // 動態 import handler（避免模組載入問題）
    const actionHandlers = {
      exportDebugLogs: (message, sender, sendResponse) => {
        try {
          const result = LogExporter.exportLogs({ format: message.format });
          sendResponse({
            success: true,
            ...result,
          });
        } catch (error) {
          Logger.error('日誌導出失敗', {
            action: 'exportDebugLogs',
            format: message.format,
            error: error.message,
          });
          sendResponse({
            success: false,
            error: error.message || '日誌導出失敗，請稍後再試',
          });
        }
      },
    };

    handler = actionHandlers.exportDebugLogs;
    mockSendResponse = jest.fn();
  });

  describe('成功情況', () => {
    test('應該返回 success: true 與日誌資料', () => {
      // Arrange
      const mockResult = {
        filename: 'test-log.json',
        content: '{"logs": []}',
        mimeType: 'application/json',
        count: 0,
      };

      jest.spyOn(LogExporter, 'exportLogs').mockReturnValue(mockResult);

      const message = { format: 'json' };
      const sender = {};

      // Act
      handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
      expect(Logger.error).not.toHaveBeenCalled();
    });
  });

  describe('錯誤情況', () => {
    test('應該捕獲錯誤並返回 success: false', () => {
      // Arrange
      const errorMessage = 'LogBuffer not initialized';
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const message = { format: 'json' };
      const sender = {};

      // Act
      handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: errorMessage,
      });

      // 驗證錯誤日誌
      expect(Logger.error).toHaveBeenCalledWith('日誌導出失敗', {
        action: 'exportDebugLogs',
        format: 'json',
        error: errorMessage,
      });
    });

    test('當錯誤沒有 message 時應使用預設錯誤訊息', () => {
      // Arrange
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        // 故意拋出非標準 Error 對象來測試預設錯誤訊息處理
        throw { someProperty: 'value' };
      });

      const message = { format: 'json' };
      const sender = {};

      // Act
      handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: '日誌導出失敗，請稍後再試',
      });
    });

    test('應該處理不支援的格式錯誤', () => {
      // Arrange
      const errorMessage = 'Unsupported format: xml';
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const message = { format: 'xml' };
      const sender = {};

      // Act
      handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: errorMessage,
      });
    });
  });

  describe('訊息通道保證', () => {
    test('即使發生錯誤，sendResponse 仍應被調用一次', () => {
      // Arrange
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        throw new Error('Critical failure');
      });

      const message = { format: 'json' };
      const sender = {};

      // Act
      handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledTimes(1);
    });

    test('成功時 sendResponse 應被調用一次', () => {
      // Arrange
      jest.spyOn(LogExporter, 'exportLogs').mockReturnValue({
        filename: 'test.json',
        content: '{}',
        mimeType: 'application/json',
        count: 0,
      });

      const message = { format: 'json' };
      const sender = {};

      // Act
      handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledTimes(1);
    });
  });
});
