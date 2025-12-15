/**
 * @jest-environment jsdom
 */

/**
 * Logger.js 單元測試
 *
 * 測試統一日誌模組的各種功能：
 * - 日誌級別方法 (debug, log, info, warn, error)
 * - debugEnabled 狀態管理
 * - 消息格式化
 * - 錯誤過濾
 */

describe('Logger', () => {
  let Logger;
  let originalChrome;
  let consoleSpy;

  beforeEach(() => {
    // 清除所有模組快取
    jest.resetModules();

    // 清除全局 Logger（如果存在）
    delete global.Logger;
    delete global.window.Logger;
    delete global.self.Logger;

    // 保存原始 chrome 對象
    originalChrome = global.chrome;

    // Mock console 方法
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      log: jest.spyOn(console, 'log').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    // 恢復 chrome 對象
    global.chrome = originalChrome;

    // 恢復 console 方法
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());

    // 清除全局 Logger
    delete global.Logger;
    delete global.window.Logger;
    delete global.self.Logger;
  });

  describe('在非擴展環境中', () => {
    beforeEach(() => {
      // 模擬非擴展環境
      global.chrome = undefined;

      // 載入 Logger 模組
      require('../../../scripts/utils/Logger.js');
      Logger = global.window.Logger;
    });

    test('應該將 Logger 設置到 window', () => {
      expect(Logger).toBeDefined();
      expect(typeof Logger.debug).toBe('function');
      expect(typeof Logger.log).toBe('function');
      expect(typeof Logger.info).toBe('function');
      expect(typeof Logger.warn).toBe('function');
      expect(typeof Logger.error).toBe('function');
    });

    test('debugEnabled 應該返回 false（非擴展環境）', () => {
      expect(Logger.debugEnabled).toBe(false);
    });

    test('debug 不應該輸出（debugEnabled 為 false）', () => {
      Logger.debug('test message');
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    test('log 不應該輸出（debugEnabled 為 false）', () => {
      Logger.log('test message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    test('info 不應該輸出（debugEnabled 為 false）', () => {
      Logger.info('test message');
      expect(consoleSpy.info).not.toHaveBeenCalled();
    });

    test('warn 應該總是輸出', () => {
      Logger.warn('warning message');
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.warn.mock.calls[0][0]).toContain('[WARN]');
    });

    test('error 應該總是輸出', () => {
      Logger.error('error message');
      expect(consoleSpy.error).toHaveBeenCalled();
      expect(consoleSpy.error.mock.calls[0][0]).toContain('[ERROR]');
    });

    test('error 應該忽略 "Frame with ID 0 was removed" 錯誤', () => {
      Logger.error('Frame with ID 0 was removed');
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    test('error 應該處理 Error 對象中的忽略消息', () => {
      const error = new Error('Frame with ID 0 was removed');
      Logger.error(error);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });

  describe('在模擬擴展環境中（開發版本）', () => {
    beforeEach(() => {
      // 模擬 Chrome 擴展環境（開發版本）
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({
            version: '1.0.0',
            version_name: '1.0.0-dev',
          }),
          sendMessage: jest.fn((msg, callback) => {
            if (callback) {
              callback();
            }
          }),
          lastError: null,
        },
        storage: {
          sync: {
            get: jest.fn((_keys, callback) => callback({})),
          },
          onChanged: {
            addListener: jest.fn(),
          },
        },
      };

      // 載入 Logger 模組
      require('../../../scripts/utils/Logger.js');
      Logger = global.window.Logger;
    });

    test('debugEnabled 應該返回 true（開發版本）', () => {
      expect(Logger.debugEnabled).toBe(true);
    });

    test('debug 應該輸出（debugEnabled 為 true）', () => {
      Logger.debug('debug message');
      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.debug.mock.calls[0][0]).toContain('[DEBUG]');
    });

    test('log 應該輸出（debugEnabled 為 true）', () => {
      Logger.log('log message');
      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[LOG]');
    });

    test('info 應該輸出（debugEnabled 為 true）', () => {
      Logger.info('info message');
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('[INFO]');
    });

    test('日誌應該包含時間戳', () => {
      Logger.warn('test message');
      const output = consoleSpy.warn.mock.calls[0][0];
      // 檢查時間戳格式 HH:MM:SS.mmm
      expect(output).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    test('日誌應該傳遞額外參數', () => {
      const extraData = { key: 'value' };
      Logger.warn('message', extraData);
      expect(consoleSpy.warn.mock.calls[0]).toContain(extraData);
    });
  });

  describe('在模擬擴展環境中（生產版本）', () => {
    beforeEach(() => {
      // 模擬 Chrome 擴展環境（生產版本）
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({
            version: '2.0.0',
            version_name: '2.0.0',
          }),
          sendMessage: jest.fn(),
          lastError: null,
        },
        storage: {
          sync: {
            get: jest.fn((_keys, callback) => callback({})),
          },
          onChanged: {
            addListener: jest.fn(),
          },
        },
      };

      require('../../../scripts/utils/Logger.js');
      Logger = global.window.Logger;
    });

    test('debugEnabled 應該返回 false（生產版本）', () => {
      expect(Logger.debugEnabled).toBe(false);
    });
  });

  describe('Storage 配置覆蓋', () => {
    beforeEach(() => {
      // 模擬 Chrome 擴展環境，storage 配置啟用調試
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({
            version: '2.0.0',
          }),
          sendMessage: jest.fn(),
          lastError: null,
        },
        storage: {
          sync: {
            get: jest.fn((_keys, callback) => {
              callback({ enableDebugLogs: true });
            }),
          },
          onChanged: {
            addListener: jest.fn(),
          },
        },
      };

      require('../../../scripts/utils/Logger.js');
      Logger = global.window.Logger;
    });

    test('應該註冊 storage 變更監聽器', () => {
      expect(global.chrome.storage.onChanged.addListener).toHaveBeenCalled();
    });

    test('onChanged 回調應該更新 debugEnabled 狀態', () => {
      // 捕獲傳遞給 addListener 的回調函數
      const onChangedCallback = global.chrome.storage.onChanged.addListener.mock.calls[0][0];

      // 確認初始狀態為 true（來自 beforeEach 中的 mock）
      expect(Logger.debugEnabled).toBe(true);

      // 模擬 storage 變更事件：關閉 debug 模式
      onChangedCallback({ enableDebugLogs: { newValue: false } }, 'sync');
      expect(Logger.debugEnabled).toBe(false);

      // 模擬 storage 變更事件：開啟 debug 模式
      onChangedCallback({ enableDebugLogs: { newValue: true } }, 'sync');
      expect(Logger.debugEnabled).toBe(true);
    });

    test('onChanged 回調應該忽略非 sync 區域的變更', () => {
      const onChangedCallback = global.chrome.storage.onChanged.addListener.mock.calls[0][0];

      // 使用 sync 變更設置初始狀態為 true
      onChangedCallback({ enableDebugLogs: { newValue: true } }, 'sync');
      expect(Logger.debugEnabled).toBe(true);

      // 模擬 local storage 變更（不應影響 debugEnabled）
      onChangedCallback({ enableDebugLogs: { newValue: false } }, 'local');
      expect(Logger.debugEnabled).toBe(true);
    });
  });

  describe('防止重複初始化', () => {
    test('重複載入不應該覆蓋已存在的 Logger', () => {
      // 第一次載入
      global.chrome = undefined;
      require('../../../scripts/utils/Logger.js');
      const firstLogger = global.window.Logger;

      // 清除模組快取但保留 window.Logger
      jest.resetModules();

      // 第二次載入
      require('../../../scripts/utils/Logger.js');
      const secondLogger = global.window.Logger;

      expect(firstLogger).toBe(secondLogger);
    });
  });

  describe('消息格式化', () => {
    beforeEach(() => {
      global.chrome = undefined;
      require('../../../scripts/utils/Logger.js');
      Logger = global.window.Logger;
    });

    test('warn 消息應該包含警告圖標', () => {
      Logger.warn('test');
      expect(consoleSpy.warn.mock.calls[0][0]).toContain('⚠️');
    });

    test('error 消息應該包含錯誤圖標', () => {
      Logger.error('test');
      expect(consoleSpy.error.mock.calls[0][0]).toContain('❌');
    });
  });

  describe('sendToBackground 功能', () => {
    test('在擴展環境中應該發送消息到 background', () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({
            version_name: '1.0.0-dev',
          }),
          sendMessage: jest.fn((msg, callback) => {
            if (callback) {
              callback();
            }
          }),
          lastError: null,
        },
        storage: {
          sync: {
            get: jest.fn((_keys, callback) => callback({})),
          },
          onChanged: {
            addListener: jest.fn(),
          },
        },
      };

      require('../../../scripts/utils/Logger.js');
      Logger = global.window.Logger;

      Logger.warn('test message', { extra: 'data' });

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'devLogSink',
          level: 'warn',
          message: 'test message',
        }),
        expect.any(Function)
      );
    });

    test('應該正確序列化 Error 對象', () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({
            version_name: '1.0.0-dev',
          }),
          sendMessage: jest.fn((msg, callback) => {
            if (callback) {
              callback();
            }
          }),
          lastError: null,
        },
        storage: {
          sync: {
            get: jest.fn((_keys, callback) => callback({})),
          },
          onChanged: {
            addListener: jest.fn(),
          },
        },
      };

      require('../../../scripts/utils/Logger.js');
      Logger = global.window.Logger;

      const testError = new Error('Test error');
      Logger.warn('Error occurred', testError);

      const sentArgs = global.chrome.runtime.sendMessage.mock.calls[0][0].args;
      expect(sentArgs[0]).toEqual(
        expect.objectContaining({
          message: 'Test error',
          name: 'Error',
        })
      );
    });
  });

  describe('manifest 錯誤處理', () => {
    test('當 getManifest 拋出錯誤時應該優雅處理', () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockImplementation(() => {
            throw new Error('Manifest not available');
          }),
          sendMessage: jest.fn(),
          lastError: null,
        },
        storage: {
          sync: {
            get: jest.fn((_keys, callback) => callback({})),
          },
          onChanged: {
            addListener: jest.fn(),
          },
        },
      };

      // 不應該拋出錯誤
      expect(() => {
        require('../../../scripts/utils/Logger.js');
      }).not.toThrow();

      Logger = global.window.Logger;
      expect(Logger.debugEnabled).toBe(false);
    });
  });
});
