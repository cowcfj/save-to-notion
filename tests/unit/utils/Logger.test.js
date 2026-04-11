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

function loadInDevelopmentMode(loader) {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    return loader();
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
}

describe('Logger', () => {
  let Logger = null;
  let originalChrome = null;
  let consoleSpy = null;

  beforeEach(() => {
    // 清除所有模組快取
    jest.resetModules();

    // 清除全局 Logger（如果存在）
    delete globalThis.Logger;
    if (globalThis.window) {
      delete globalThis.window.Logger;
    }
    if (globalThis.self) {
      delete globalThis.self.Logger;
    }

    // 保存原始 chrome 對象
    originalChrome = globalThis.chrome;

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
    globalThis.chrome = originalChrome;

    // 恢復 console 方法
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());

    // 清除全局 Logger
    delete globalThis.Logger;
    if (globalThis.window) {
      delete globalThis.window.Logger;
    }
    if (globalThis.self) {
      delete globalThis.self.Logger;
    }
  });

  describe('在非擴展環境中', () => {
    beforeEach(() => {
      // 模擬非擴展環境
      globalThis.chrome = undefined;

      // 載入 Logger 模組
      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;
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

    test('error 應該忽略包裝過的 Frame 移除錯誤', () => {
      Logger.error('Function execution failed: Frame with ID 0 was removed.');
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    test('error 應該忽略任何 Frame ID 的移除錯誤', () => {
      Logger.error('Frame with ID 123 was removed');
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
      globalThis.chrome = {
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
      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;
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

    test('日誌不應該包含時間戳（由 DevTools 提供）', () => {
      Logger.warn('test message');
      const output = consoleSpy.warn.mock.calls[0][0];
      // 確認不包含時間戳格式 HH:MM:SS.mmm
      expect(output).not.toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    test('日誌應該傳遞額外參數（保留物件原生形式）', () => {
      const extraData = { key: 'value' };
      Logger.warn('message', extraData);
      // 修正後：物件以原生形式傳遞，提供更好的 DevTools 互動式檢查體驗
      expect(consoleSpy.warn.mock.calls[0]).toContain(extraData);
    });
  });

  describe('在模擬擴展環境中（生產版本）', () => {
    beforeEach(() => {
      // 模擬 Chrome 擴展環境（生產版本）
      globalThis.chrome = {
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

      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;
    });

    test('debugEnabled 應該返回 false（生產版本）', () => {
      expect(Logger.debugEnabled).toBe(false);
    });
  });

  describe('Storage 配置覆蓋', () => {
    beforeEach(() => {
      // 模擬 Chrome 擴展環境，storage 配置啟用調試
      globalThis.chrome = {
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
            get: jest.fn((_keys, callback) => {
              callback({ enableDebugLogs: true });
            }),
          },
          onChanged: {
            addListener: jest.fn(),
          },
        },
      };

      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;
    });

    test('應該註冊 storage 變更監聽器', () => {
      expect(globalThis.chrome.storage.onChanged.addListener).toHaveBeenCalled();
    });

    test('onChanged 回調應該更新 debugEnabled 狀態', () => {
      // 捕獲傳遞給 addListener 的回調函數
      const onChangedCallback = globalThis.chrome.storage.onChanged.addListener.mock.calls[0][0];

      // 確認初始狀態為 true（來自 beforeEach 中的 mock）
      expect(Logger.debugEnabled).toBe(true);

      // 模擬 storage 變更事件：關閉 debug 模式
      onChangedCallback({ enableDebugLogs: { newValue: false } }, 'sync');
      expect(Logger.debugEnabled).toBe(false);

      // 模擬 storage 變更事件：開啟 debug 模式
      onChangedCallback({ enableDebugLogs: { newValue: true } }, 'sync');
      expect(Logger.debugEnabled).toBe(true);
    });

    test('onChanged 回調應該忽略 non-sync 區域的變更', () => {
      const onChangedCallback = globalThis.chrome.storage.onChanged.addListener.mock.calls[0][0];

      // 使用 sync 變更設置初始狀態為 true
      onChangedCallback({ enableDebugLogs: { newValue: true } }, 'sync');
      expect(Logger.debugEnabled).toBe(true);

      // 模擬 local storage 變更（不應影響 debugEnabled）
      onChangedCallback({ enableDebugLogs: { newValue: false } }, 'local');
      expect(Logger.debugEnabled).toBe(true);
    });
  });

  describe('消息格式化', () => {
    beforeEach(() => {
      globalThis.chrome = undefined;
      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;
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
    beforeEach(() => {
      // Setup default mock specifically for this suite
      globalThis.chrome = {
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

      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;
    });

    test('在擴展環境中應該發送消息到 background', () => {
      Logger.warn('test message', { extra: 'data' });

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'devLogSink',
          level: 'warn',
          message: 'test message',
        }),
        expect.any(Function)
      );
    });

    test('應該正確序列化 Error 對象', () => {
      const testError = new Error('Test error');
      Logger.warn('Error occurred', testError);

      const sentArgs = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].args;
      expect(sentArgs[0]).toEqual(
        expect.objectContaining({
          message: 'Test error',
          name: 'Error',
        })
      );
    });

    test('應該正確處理純量參數 (數字, 字串)', () => {
      // warn/error 使用即時發送路徑（sendToBackground），適合此測試
      // info/log/debug 使用批量模式（_queueForBackground），不會立即觸發 sendMessage
      Logger.warn('Scalar test', 123, 'test-string');

      const sentArgs = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].args;
      expect(sentArgs).toEqual([123, 'test-string']);
    });

    test('應該優雅處理無法序列化的對象 (Circular Reference)', () => {
      const circular = {};
      circular.myself = circular;

      Logger.warn('Circular test', circular);

      const sentArgs = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].args;
      // structuredClone 成功複製 Circular Reference
      // 複製後 myself 指向自身，形成自參照
      expect(sentArgs[0]).toBeTruthy();
      expect(sentArgs[0].myself).toBe(sentArgs[0]);
    });

    test('應該將 function 參數序列化為 "[Function]"', () => {
      Logger.warn('Function test', () => {});

      const sentArgs = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].args;
      expect(sentArgs[0]).toBe('[Function]');
    });

    test('應該將 symbol 參數序列化為 toString 結果', () => {
      Logger.warn('Symbol test', Symbol('mySymbol'));

      const sentArgs = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].args;
      expect(sentArgs[0]).toBe('Symbol(mySymbol)');
    });
  });

  describe('語法糖方法 (success, start, ready)', () => {
    beforeEach(() => {
      globalThis.chrome = undefined;
      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;
    });

    test('應該正確加上特定的 LOG_ICONS', () => {
      const infoSpy = jest.spyOn(Logger, 'info').mockImplementation(() => {});

      Logger.success('Success message');
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Success message'));

      Logger.start('Start message');
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('🚀 Start message'));

      Logger.ready('Ready message');
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('📦 Ready message'));

      infoSpy.mockRestore();
    });
  });

  describe('批量轉發機制 (_queueForBackground & _flushToBackground)', () => {
    beforeEach(() => {
      globalThis.chrome = {
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

      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      Logger = globalThis.window.Logger;

      jest.useFakeTimers();
      globalThis.chrome.runtime.sendMessage.mockClear();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('應該將 info/log/debug 日誌加入佇列並在超時後發送', () => {
      Logger.info('Queue message 1', { data: 1 });
      Logger.debug('Queue message 2');

      // 尚未觸發計時器，不應發送
      expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();

      // 快進 500ms
      jest.advanceTimersByTime(500);

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      const args = globalThis.chrome.runtime.sendMessage.mock.calls[0][0];
      expect(args.action).toBe('devLogSinkBatch');
      expect(args.logs).toHaveLength(2);
      expect(args.logs[0].message).toBe('Queue message 1');
      expect(args.logs[1].message).toBe('Queue message 2');
    });

    test('當達到 MAX_BATCH_SIZE (20) 時應該立即發送', () => {
      for (let i = 0; i < 20; i++) {
        Logger.info(`Msg ${i}`);
      }
      // 不須等到 advanceTimersByTime 就應觸發 send
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      const args = globalThis.chrome.runtime.sendMessage.mock.calls[0][0];
      expect(args.logs).toHaveLength(20);

      // 不會再次觸發
      jest.advanceTimersByTime(500);
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    test('_queueForBackground 發生不可序列化參數時會 fallback', () => {
      const circular = {};
      circular.myself = circular;

      Logger.info('Circular test', circular);
      jest.advanceTimersByTime(500);

      const sentLogs = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].logs;
      // structuredClone 成功複製 Circular Reference
      // 複製後 myself 指向自身，形成自參照
      expect(sentLogs[0].args[0]).toBeTruthy();
      expect(sentLogs[0].args[0].myself).toBe(sentLogs[0].args[0]);
    });

    test('在 sendMessage 失敗時應優雅忽略', () => {
      globalThis.chrome.runtime.sendMessage.mockImplementationOnce((msg, cb) => {
        if (cb) {
          cb();
        }
        throw new Error('IPC failed');
      });

      Logger.info('Fail safe test');
      expect(() => {
        jest.advanceTimersByTime(500);
      }).not.toThrow();
    });
  });

  describe('Buffer 寫入操作 (addLogToBuffer & getBuffer)', () => {
    test('getBuffer 應該返回 null (在預設無 DEV_LOG_SINK 的情況下)', () => {
      const buffer = Logger.getBuffer();
      expect(buffer).toBeNull();
    });
  });

  describe('parseArgsToContext 直接匯出函數', () => {
    let parseArgsToContext;

    beforeEach(() => {
      globalThis.chrome = undefined;
      const mod = loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      parseArgsToContext = mod.parseArgsToContext;
    });

    test('空陣列應返回空物件', () => {
      expect(parseArgsToContext([])).toEqual({});
    });

    test('非陣列 (null, undefined) 應返回空物件', () => {
      expect(parseArgsToContext(null)).toEqual({});
      expect(parseArgsToContext(undefined)).toEqual({});
    });

    test('第一個參數為物件且有多個參數時應展開為 context 並包含 details', () => {
      expect(parseArgsToContext([{ key: 'val' }, 'extra', 42])).toEqual({
        key: 'val',
        details: ['extra', 42],
      });
    });

    test('第一個參數非物件時應將所有參數放入 details', () => {
      expect(parseArgsToContext(['a', 'b', 123])).toEqual({
        details: ['a', 'b', 123],
      });
    });

    test('第一個參數為 Error 時應提取 message、stack、name', () => {
      const err = new Error('something failed');
      const result = parseArgsToContext([err]);
      expect(result.message).toBe('something failed');
      expect(result.name).toBe('Error');
      expect(typeof result.stack).toBe('string');
    });

    test('Error 帶有自訂屬性時應一併保留', () => {
      const err = new Error('api error');
      err.code = 'ERR_NETWORK';
      err.statusCode = 500;
      const result = parseArgsToContext([err]);
      expect(result.message).toBe('api error');
      expect(result.code).toBe('ERR_NETWORK');
      expect(result.statusCode).toBe(500);
    });

    test('Error 加上額外參數時應存入 details', () => {
      const err = new TypeError('type mismatch');
      const result = parseArgsToContext([err, 'extra', 42]);
      expect(result.message).toBe('type mismatch');
      expect(result.name).toBe('TypeError');
      expect(result.details).toEqual(['extra', 42]);
    });
  });

  describe('manifest 錯誤處理', () => {
    test('當 getManifest 拋出錯誤時應該優雅處理', () => {
      globalThis.chrome = {
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
        loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      }).not.toThrow();

      Logger = globalThis.window.Logger;
      expect(Logger.debugEnabled).toBe(false);
    });
  });

  describe('頁面卸載沖刷機制 (visibilitychange & beforeunload)', () => {
    test('應在非 Background 環境中註冊 visibilitychange 與 beforeunload 監聽器', () => {
      const docSpy = jest.spyOn(document, 'addEventListener');
      const winSpy = jest.spyOn(globalThis, 'addEventListener');

      globalThis.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({ version_name: '1.0.0-dev' }),
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

      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));

      const visibilityCall = docSpy.mock.calls.find(call => call[0] === 'visibilitychange');
      expect(visibilityCall).toBeDefined();

      const beforeunloadCall = winSpy.mock.calls.find(call => call[0] === 'beforeunload');
      expect(beforeunloadCall).toBeDefined();

      docSpy.mockRestore();
      winSpy.mockRestore();
    });

    test('visibilitychange 回調在頁面隱藏時應觸發批量發送', () => {
      const docSpy = jest.spyOn(document, 'addEventListener');

      globalThis.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({ version_name: '1.0.0-dev' }),
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

      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      const LoadedLogger = globalThis.window.Logger;

      // 將一條日誌加入佇列
      LoadedLogger.info('flush on hidden');

      // 找到 visibilitychange 回調並觸發
      const visibilityCallback = docSpy.mock.calls.find(call => call[0] === 'visibilitychange')[1];

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      visibilityCallback();

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'devLogSinkBatch' }),
        expect.any(Function)
      );

      // 清理
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      docSpy.mockRestore();
    });

    test('beforeunload 回調應觸發批量發送', () => {
      const winSpy = jest.spyOn(globalThis, 'addEventListener');

      globalThis.chrome = {
        runtime: {
          id: 'test-extension-id',
          getManifest: jest.fn().mockReturnValue({ version_name: '1.0.0-dev' }),
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

      loadInDevelopmentMode(() => require('../../../scripts/utils/Logger.js'));
      const LoadedLogger = globalThis.window.Logger;

      // 將一條日誌加入佇列
      LoadedLogger.info('flush on unload');

      // 找到 beforeunload 回調並觸發
      const beforeunloadCallback = winSpy.mock.calls.find(call => call[0] === 'beforeunload')[1];
      beforeunloadCallback();

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'devLogSinkBatch' }),
        expect.any(Function)
      );

      winSpy.mockRestore();
    });
  });
});
