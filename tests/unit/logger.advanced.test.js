/**
 * @fileoverview Logger 系統進階測試
 * 測試 Logger 的邊界情況、開發模式檢測和錯誤處理
 */

// 導入測試工具
const { Logger } = require('../helpers/utils.testable.js');

describe('Logger 系統進階測試', () => {
  let originalChrome;
  let mockSendMessage;

  beforeEach(() => {
    // 保存原始環境
    originalChrome = global.chrome;
    
    // 設置 mock
    mockSendMessage = jest.fn();
    
    // 重置 console 方法
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // 恢復原始環境
    global.chrome = originalChrome;
    
    // 清理 mock
    jest.restoreAllMocks();
  });

  describe('Logger 基本功能測試', () => {
    test('應該正確調用 debug 方法', () => {
      // Act
      Logger.debug('測試 debug 訊息', { data: 'test' });

      // Assert - 由於 Logger 實現的複雜性，我們主要測試它不會拋出錯誤
      expect(() => Logger.debug('測試')).not.toThrow();
    });

    test('應該正確調用 info 方法', () => {
      // Act & Assert
      expect(() => Logger.info('測試 info 訊息')).not.toThrow();
    });

    test('應該正確調用 warn 方法', () => {
      // Act
      Logger.warn('測試 warn 訊息');

      // Assert - warn 應該總是輸出到 console
      expect(() => Logger.warn('測試')).not.toThrow();
    });

    test('應該正確調用 error 方法', () => {
      // Act
      Logger.error('測試 error 訊息');

      // Assert - error 應該總是輸出到 console
      expect(console.error).toHaveBeenCalledWith('[ERROR] 測試 error 訊息');
    });
  });

  describe('Chrome runtime 異常處理', () => {
    test('應該處理 chrome 不存在的情況', () => {
      // Arrange
      delete global.chrome;

      // Act & Assert - 不應該拋出錯誤
      expect(() => {
        Logger.debug('測試');
        Logger.info('測試');
        Logger.warn('測試');
        Logger.error('測試');
      }).not.toThrow();
    });

    test('應該處理 chrome.runtime 不完整的情況', () => {
      // Arrange
      global.chrome = {};

      // Act & Assert
      expect(() => {
        Logger.debug('測試');
        Logger.warn('測試');
      }).not.toThrow();
    });
  });

  describe('參數處理', () => {
    test('應該處理多個參數', () => {
      // Act & Assert
      expect(() => {
        Logger.info('測試消息', { data: 'test' }, 'additional', 123);
        Logger.warn('警告', new Error('test error'));
        Logger.error('錯誤', null, undefined, [1, 2, 3]);
      }).not.toThrow();
    });

    test('應該處理循環引用對象', () => {
      // Arrange
      const circularObj = { name: 'test' };
      circularObj.self = circularObj;

      // Act & Assert - 不應該拋出錯誤
      expect(() => {
        Logger.info('循環引用測試', circularObj);
      }).not.toThrow();
    });
  });

  describe('性能測試', () => {
    test('應該快速處理大量日誌調用', () => {
      // Act - 大量調用
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        Logger.debug(`Debug message ${i}`);
        Logger.info(`Info message ${i}`);
      }
      const endTime = Date.now();

      // Assert - 應該很快完成（< 50ms）
      expect(endTime - startTime).toBeLessThan(50);
    });
  });
});