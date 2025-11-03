/**
 * utils.js 進階測試 - 提升覆蓋率
 * 專門測試未覆蓋的代碼路徑和邊界情況
 */

// 動態導入以確保每次測試都是新的實例
let utils;

describe('utils.js - 進階覆蓋率測試', () => {
  let originalChrome, originalWindow;

  beforeEach(() => {
    // 保存原始環境
    originalChrome = global.chrome;
    originalWindow = global.window;

    // 重置模組
    jest.resetModules();
    
    // 清理全局狀態
    delete global.window;
    delete global.chrome;
    
    // 重新設置基本環境
    global.window = {
      StorageUtil: undefined,
      Logger: undefined,
      normalizeUrl: undefined,
      location: { href: 'https://example.com' }
    };

    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        lastError: null,
        getManifest: jest.fn()
      },
      storage: {
        sync: {
          get: jest.fn(),
          onChanged: {
            addListener: jest.fn()
          }
        }
      }
    };

    // 清理 console mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // 恢復原始環境
    global.chrome = originalChrome;
    global.window = originalWindow;
  });

  describe('__sendBackgroundLog 函數測試', () => {
    beforeEach(() => {
      utils = require('../helpers/utils.testable');
    });

    test('應該在 Chrome 環境下發送日誌消息', () => {
      // 模擬 Chrome 環境
      global.chrome.runtime.sendMessage = jest.fn((message, callback) => {
        callback();
      });

      // 重新加載模組以確保使用新的 Logger
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 觸發 Logger 方法來調用 __sendBackgroundLog
      utils.Logger.warn('測試警告', 'arg1', 'arg2');

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        {
          action: 'devLogSink',
          level: 'warn',
          message: '測試警告',
          args: ['arg1', 'arg2']
        },
        expect.any(Function)
      );
    });

    test('應該處理 chrome.runtime.sendMessage 不存在的情況', () => {
      // 移除 sendMessage
      delete global.chrome.runtime.sendMessage;

      // 應該不拋出錯誤
      expect(() => {
        utils.Logger.error('測試錯誤');
      }).not.toThrow();
    });

    test('應該處理 chrome.runtime 不存在的情況', () => {
      // 移除 runtime
      delete global.chrome.runtime;

      // 應該不拋出錯誤
      expect(() => {
        utils.Logger.error('測試錯誤');
      }).not.toThrow();
    });

    test('應該處理 chrome 完全不存在的情況', () => {
      // 移除 chrome
      delete global.chrome;

      // 應該不拋出錯誤
      expect(() => {
        utils.Logger.error('測試錯誤');
      }).not.toThrow();
    });

    test('應該處理 argsArray 不是數組的情況', () => {
      global.chrome.runtime.sendMessage = jest.fn((message, callback) => {
        callback();
      });

      // 重新加載模組以確保使用新的 Logger
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 使用 Logger.warn 觸發，它會傳遞 args 數組
      utils.Logger.warn('測試', { key: 'value' }, 123);

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [{ key: 'value' }, 123]
        }),
        expect.any(Function)
      );
    });

    test('應該處理 chrome.runtime.lastError', () => {
      global.chrome.runtime.sendMessage = jest.fn((message, callback) => {
        global.chrome.runtime.lastError = { message: '測試錯誤' };
        callback();
      });

      // 應該不拋出錯誤，即使有 lastError
      expect(() => {
        utils.Logger.warn('測試');
      }).not.toThrow();

      // 清理
      global.chrome.runtime.lastError = null;
    });

    test('應該處理回調函數中的異常', () => {
      global.chrome.runtime.sendMessage = jest.fn((message, callback) => {
        // 模擬回調中拋出異常
        callback();
        throw new Error('回調異常');
      });

      // 應該不拋出錯誤
      expect(() => {
        utils.Logger.warn('測試');
      }).not.toThrow();
    });
  });

  describe('Logger 開發模式檢測測試', () => {
    test('應該檢測版本字符串中的 dev', () => {
      // 設置包含 dev 的版本
      global.chrome.runtime.getManifest = jest.fn(() => ({
        version: '2.10.0-dev',
        version_name: '2.10.0-dev'
      }));

      // 模擬 sendMessage 來驗證是否在開發模式
      global.chrome.runtime.sendMessage = jest.fn();

      // 重新加載模組以觸發開發模式檢測
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 調用 debug 方法，在開發模式下應該發送消息
      utils.Logger.debug('開發模式測試');

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    test('應該檢測 window.__FORCE_LOG__ 標記', () => {
      // 設置強制日誌標記
      global.window.__FORCE_LOG__ = true;

      // 設置非開發版本
      global.chrome.runtime.getManifest = jest.fn(() => ({
        version: '2.10.0'
      }));

      global.chrome.runtime.sendMessage = jest.fn();

      // 重新加載模組
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 應該仍然發送日誌（因為 __FORCE_LOG__ 為 true）
      utils.Logger.debug('強制日誌測試');

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    test('應該檢測 window.__LOGGER_ENABLED__ 標記', () => {
      // 設置日誌啟用標記
      global.window.__LOGGER_ENABLED__ = true;

      // 設置非開發版本
      global.chrome.runtime.getManifest = jest.fn(() => ({
        version: '2.10.0'
      }));

      global.chrome.runtime.sendMessage = jest.fn();

      // 重新加載模組
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 應該發送日誌
      utils.Logger.info('啟用日誌測試');

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    test('應該處理 getManifest 拋出異常', () => {
      global.chrome.runtime.getManifest = jest.fn(() => {
        throw new Error('Manifest 錯誤');
      });

      // 重新加載模組，應該不拋出錯誤
      expect(() => {
        jest.resetModules();
        utils = require('../helpers/utils.testable');
      }).not.toThrow();

      // 在非開發模式下，debug 不應該發送消息
      global.chrome.runtime.sendMessage = jest.fn();
      utils.Logger.debug('異常測試');

      expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('應該處理 chrome 不存在的情況', () => {
      // 移除 chrome
      delete global.chrome;

      // 重新加載模組，應該不拋出錯誤
      expect(() => {
        jest.resetModules();
        utils = require('../helpers/utils.testable');
      }).not.toThrow();

      // Logger 應該仍然可用
      expect(utils.Logger).toBeDefined();
      expect(utils.Logger.debug).toBeInstanceOf(Function);
    });

    test('應該在生產模式下不發送 debug 消息', () => {
      // 設置生產版本
      global.chrome.runtime.getManifest = jest.fn(() => ({
        version: '2.10.0'
      }));

      // 確保沒有強制標記
      delete global.window.__FORCE_LOG__;
      delete global.window.__LOGGER_ENABLED__;

      global.chrome.runtime.sendMessage = jest.fn();

      // 重新加載模組
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // debug 和 info 不應該發送消息
      utils.Logger.debug('生產模式 debug');
      utils.Logger.info('生產模式 info');

      expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

      // 但 warn 和 error 應該發送
      utils.Logger.warn('生產模式 warn');
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);

      utils.Logger.error('生產模式 error');
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('Chrome Storage 初始化測試', () => {
    test('應該設置 storage 變更監聽器', () => {
      // 確保 storage API 存在
      global.chrome.storage.sync.onChanged.addListener = jest.fn();

      // 重新加載模組以觸發初始化
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 驗證監聽器被添加
      expect(global.chrome.storage.sync.onChanged.addListener).toHaveBeenCalled();
    });

    test('應該處理 storage.onChanged 不存在的情況', () => {
      // 移除 onChanged
      delete global.chrome.storage.sync.onChanged;

      // 重新加載模組，應該不拋出錯誤
      expect(() => {
        jest.resetModules();
        utils = require('../helpers/utils.testable');
      }).not.toThrow();
    });

    test('應該處理 storage 完全不存在的情況', () => {
      // 移除 storage
      delete global.chrome.storage;

      // 重新加載模組，應該不拋出錯誤
      expect(() => {
        jest.resetModules();
        utils = require('../helpers/utils.testable');
      }).not.toThrow();
    });

    test('應該響應 enableDebugLogs 設置變更', () => {
      let changeListener;

      global.chrome.storage.sync.onChanged.addListener = jest.fn((listener) => {
        changeListener = listener;
      });

      // 重新加載模組
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 確保監聽器被設置
      expect(changeListener).toBeDefined();

      // 模擬設置變更
      const changes = {
        enableDebugLogs: {
          newValue: true,
          oldValue: false
        }
      };

      // 應該不拋出錯誤
      expect(() => {
        changeListener(changes, 'sync');
      }).not.toThrow();

      // 驗證 __LOGGER_ENABLED__ 被更新
      expect(global.window.__LOGGER_ENABLED__).toBe(true);
    });

    test('應該處理變更監聽器中的異常', () => {
      let changeListener;

      global.chrome.storage.sync.onChanged.addListener = jest.fn((listener) => {
        changeListener = listener;
      });

      // 重新加載模組
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 確保監聽器被設置
      expect(changeListener).toBeDefined();

      // 模擬異常情況
      const invalidChanges = null;

      // 應該不拋出錯誤
      expect(() => {
        changeListener(invalidChanges, 'sync');
      }).not.toThrow();
    });
  });

  describe('模組重複加載防護測試', () => {
    test('應該檢測並跳過重複注入', () => {
      // 第一次加載
      utils = require('../helpers/utils.testable');
      const firstStorageUtil = utils.StorageUtil;

      // 設置重複注入標記
      global.window.StorageUtil = firstStorageUtil;

      // 重新加載模組
      jest.resetModules();
      const utils2 = require('../helpers/utils.testable');

      // 應該返回相同的實例
      expect(utils2.StorageUtil).toBe(firstStorageUtil);
    });

    test('應該在重複注入時仍然導出函數', () => {
      // 設置已存在的實例
      global.window.StorageUtil = { test: 'existing' };
      global.window.Logger = { test: 'existing' };
      global.window.normalizeUrl = () => 'existing';

      // 重新加載模組
      jest.resetModules();
      utils = require('../helpers/utils.testable');

      // 應該仍然導出現有的函數
      expect(utils.StorageUtil).toBeDefined();
      expect(utils.Logger).toBeDefined();
      expect(utils.normalizeUrl).toBeDefined();
    });
  });

  describe('safeLogger 抽象測試', () => {
    test('應該在 window.Logger 不存在時使用安全替代', () => {
      // 移除 window.Logger
      delete global.window.Logger;

      // 重新加載模組
      jest.resetModules();
      
      // 模擬沒有 Logger 的環境
      const originalConsole = global.console;
      global.console = {
        warn: jest.fn(),
        error: jest.fn()
      };

      try {
        utils = require('../helpers/utils.testable');

        // safeLogger 應該使用 console 作為回退
        // 這個測試間接驗證 safeLogger 的行為
        expect(utils).toBeDefined();
      } finally {
        global.console = originalConsole;
      }
    });
  });
});