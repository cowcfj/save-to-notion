/**
 * exportDebugLogs Handler 錯誤處理測試
 * 驗證當 LogExporter.exportLogs() 拋出錯誤時的處理行為
 */

import { LogExporter } from '../../../scripts/utils/LogExporter.js';
import { exportDebugLogs } from '../../../scripts/background/handlers/logHandlers.js';

// Mock Logger
globalThis.Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
};

// Mock Chrome API
globalThis.chrome = {
  runtime: {
    id: 'mock-extension-id',
    getManifest: jest.fn(() => ({ version: '1.0.0' })),
  },
};

describe('exportDebugLogs Handler - Error Handling', () => {
  let handler = null;
  let mockSendResponse = null;

  beforeEach(() => {
    // 清除 mocks
    jest.clearAllMocks();

    // 直接測試 handlers/logHandlers.js 中的 exportDebugLogs
    // 它已經包含 try/catch 區塊
    handler = exportDebugLogs;

    mockSendResponse = jest.fn();
  });

  describe('成功情況', () => {
    test('應該返回 success: true 與日誌資料', async () => {
      // Arrange
      const mockResult = {
        filename: 'test-log.json',
        content: '{"logs": []}',
        mimeType: 'application/json',
        count: 0,
      };

      jest.spyOn(LogExporter, 'exportLogs').mockReturnValue(mockResult);

      const message = { format: 'json' };
      const sender = { id: 'mock-extension-id' };

      // Act
      await handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
      });
      expect(Logger.error).not.toHaveBeenCalled();
    });
  });

  describe('錯誤情況', () => {
    test('應該捕獲錯誤並返回 success: false', async () => {
      // Arrange
      const errorMessage = 'LogBuffer not initialized';
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const message = { format: 'json' };
      const sender = { id: 'mock-extension-id' };

      // Act
      await handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('操作失敗'),
          errorType: 'internal',
        })
      );
    });

    test('當錯誤沒有 message 時應使用預設錯誤訊息', async () => {
      // Arrange
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        // 故意拋出缺乏 message 的 Error 對象來測試預設錯誤訊息處理
        const error = new Error('Test error');
        error.message = undefined;
        throw error;
      });

      const message = { format: 'json' };
      const sender = { id: 'mock-extension-id' };

      // Act
      await handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('操作失敗'),
          errorType: 'internal',
        })
      );
    });

    test('應該處理不支援的格式錯誤', async () => {
      // Arrange
      const errorMessage = 'Unsupported format: xml';
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const message = { format: 'xml' };
      const sender = { id: 'mock-extension-id' };

      // Act
      await handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('操作失敗'), // 預設錯誤訊息
          errorType: 'internal',
        })
      );
    });
  });

  describe('訊息通道保證', () => {
    test('即使發生錯誤，sendResponse 仍應被調用一次', async () => {
      // Arrange
      jest.spyOn(LogExporter, 'exportLogs').mockImplementation(() => {
        throw new Error('Critical failure');
      });

      const message = { format: 'json' };
      const sender = { id: 'mock-extension-id' };

      // Act
      await handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledTimes(1);
    });

    test('成功時 sendResponse 應被調用一次', async () => {
      // Arrange
      jest.spyOn(LogExporter, 'exportLogs').mockReturnValue({
        filename: 'test.json',
        content: '{}',
        mimeType: 'application/json',
        count: 0,
      });

      const message = { format: 'json' };
      const sender = { id: 'mock-extension-id' };

      // Act
      await handler(message, sender, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledTimes(1);
    });
  });
});
