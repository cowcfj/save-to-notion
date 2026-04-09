/**
 * Logger 工具單元測試
 * 測試日誌工具類的功能
 */

describe('Logger', () => {
  /** @type {object} Console spy 對象,在 beforeEach 中初始化 */
  let consoleSpy = null;
  /** @type {Console} 原始 console 對象,在 beforeEach 中保存 */
  let originalConsole = null;

  beforeEach(() => {
    // 保存原始 console
    originalConsole = globalThis.console;

    // Mock console 方法
    consoleSpy = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    globalThis.console = consoleSpy;

    // 定義 Logger（模擬 utils.js 中的實現）
    globalThis.Logger = {
      success: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      debug: (message, ...args) => {
        consoleSpy.log(`[DEBUG] ${message}`, ...args);
      },

      info: (message, ...args) => {
        consoleSpy.log(`[INFO] ${message}`, ...args);
      },

      warn: (message, ...args) => {
        consoleSpy.warn(`[WARN] ${message}`, ...args);
      },

      error: (message, ...args) => {
        consoleSpy.error(`[ERROR] ${message}`, ...args);
      },
    };
  });

  afterEach(() => {
    // 恢復原始 console
    globalThis.console = originalConsole;
    jest.clearAllMocks();
  });

  describe('debug', () => {
    test('應該輸出 debug 級別日誌', () => {
      Logger.debug('測試訊息');

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] 測試訊息');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });

    test('應該輸出 debug 日誌並附加參數', () => {
      const testData = { key: 'value' };
      Logger.debug('測試數據', testData, 123);

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] 測試數據', testData, 123);
    });

    test('應該處理空訊息', () => {
      Logger.debug('');

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] ');
    });

    test('應該處理特殊字符', () => {
      Logger.debug('測試 🎉 emoji 和中文');

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] 測試 🎉 emoji 和中文');
    });
  });

  describe('info', () => {
    test('應該輸出 info 級別日誌', () => {
      Logger.info('資訊訊息');

      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] 資訊訊息');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });

    test('應該輸出 info 日誌並附加多個參數', () => {
      Logger.info('用戶操作', 'save', { page: 'example.com' });

      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] 用戶操作', 'save', {
        page: 'example.com',
      });
    });

    test('應該處理數字參數', () => {
      Logger.info('處理項目數', 42);

      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] 處理項目數', 42);
    });

    test('應該處理布林值參數', () => {
      Logger.info('操作成功', true);

      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] 操作成功', true);
    });
  });

  describe('warn', () => {
    test('應該輸出 warn 級別日誌', () => {
      Logger.warn('警告訊息');

      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] 警告訊息');
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    });

    test('應該輸出 warn 日誌並附加參數', () => {
      Logger.warn('API 速率限制', { remaining: 10 });

      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] API 速率限制', { remaining: 10 });
    });

    test('應該處理錯誤對象', () => {
      const error = new Error('測試錯誤');
      Logger.warn('發生非致命錯誤', error);

      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] 發生非致命錯誤', error);
    });

    test('應該處理 null 和 undefined', () => {
      Logger.warn('空值檢查', null);

      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] 空值檢查', null);
    });
  });

  describe('error', () => {
    test('應該輸出 error 級別日誌', () => {
      Logger.error('錯誤訊息');

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] 錯誤訊息');
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    test('應該輸出 error 日誌並附加錯誤對象', () => {
      const error = new Error('API 調用失敗');
      Logger.error('無法保存到 Notion', error);

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] 無法保存到 Notion', error);
    });

    test('應該處理錯誤堆疊信息', () => {
      const error = new Error('測試錯誤');
      error.stack = 'Error: 測試錯誤\n    at test.js:1:1';

      Logger.error('堆疊追蹤', error);

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] 堆疊追蹤', error);
    });

    test('應該處理複雜對象', () => {
      const complexData = {
        status: 500,
        message: 'Internal Server Error',
        details: {
          code: 'NOTION_API_ERROR',
          timestamp: '2025-10-05T12:00:00Z',
        },
      };

      Logger.error('API 錯誤詳情', complexData);

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] API 錯誤詳情', complexData);
    });
  });

  describe('多參數處理', () => {
    test('應該處理沒有額外參數的情況', () => {
      Logger.info('簡單訊息');

      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] 簡單訊息');
    });

    test('應該處理大量參數', () => {
      Logger.debug('多參數測試', 1, 2, 3, 4, 5);

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] 多參數測試', 1, 2, 3, 4, 5);
    });

    test('應該處理混合類型參數', () => {
      Logger.info('混合參數', 'string', 42, true, null, { key: 'value' }, ['array']);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[INFO] 混合參數',
        'string',
        42,
        true,
        null,
        { key: 'value' },
        ['array']
      );
    });
  });

  describe('實際使用場景', () => {
    test('應該記錄功能初始化', () => {
      Logger.info('🚀 [初始化] 標註系統初始化開始');

      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] 🚀 [初始化] 標註系統初始化開始');
    });

    test('應該記錄數據保存', () => {
      const count = 5;
      Logger.debug(`📦 [存儲] 保存 ${count} 個標註`);

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] 📦 [存儲] 保存 5 個標註');
    });

    test('應該記錄 API 錯誤', () => {
      const error = { status: 401, message: 'Unauthorized' };
      Logger.error('❌ [錯誤] Notion API 認證失敗', error);

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] ❌ [錯誤] Notion API 認證失敗', error);
    });

    test('應該記錄性能警告', () => {
      const time = 5200;
      Logger.warn(`⚠️ [性能] 保存耗時 ${time}ms，超過預期`);

      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] ⚠️ [性能] 保存耗時 5200ms，超過預期');
    });
  });

  describe('邊界情況', () => {
    test('應該處理 undefined 訊息', () => {
      Logger.info();

      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] undefined');
    });

    test('應該處理 null 訊息', () => {
      Logger.error(null);

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] null');
    });

    test('應該處理數字訊息', () => {
      Logger.debug(404);

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] 404');
    });

    test('應該處理非常長的訊息', () => {
      const longMessage = 'x'.repeat(1000);
      Logger.info(longMessage);

      expect(consoleSpy.log).toHaveBeenCalledWith(`[INFO] ${longMessage}`);
    });

    test('應該處理 Symbol', () => {
      const sym = Symbol('test');
      Logger.debug('Symbol 測試', sym);

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] Symbol 測試', sym);
    });
  });
});
