/**
 * Preloader 單元測試
 *
 * 測試 scripts/performance/preloader.js 的功能
 * - 初始化防護
 * - 快捷鍵監聽
 * - 消息監聽
 * - 快取機制
 */

describe('Preloader', () => {
  /** @type {Object} */
  let originalWindow;
  /** @type {Object} */
  let mockChrome;
  /** @type {Function|null} */
  let keydownHandler = null;
  /** @type {Function|null} */
  let messageHandler = null;

  beforeEach(() => {
    // 保存原始狀態
    originalWindow = { ...global.window };

    // 重置全域變數
    delete global.window.__NOTION_PRELOADER_INITIALIZED__;
    delete global.window.__NOTION_PRELOADER_CACHE__;
    delete global.window.__NOTION_BUNDLE_READY__;

    // 捕獲事件監聽器
    keydownHandler = null;
    messageHandler = null;

    // Mock document
    document.addEventListener = jest.fn((event, handler) => {
      if (event === 'keydown') {
        keydownHandler = handler;
      }
    });

    document.querySelector = jest.fn(selector => {
      if (selector === 'article') {
        return { tagName: 'ARTICLE' };
      }
      if (selector.includes('main')) {
        return { tagName: 'MAIN' };
      }
      return null;
    });

    // Mock chrome API
    mockChrome = {
      runtime: {
        // Chrome API callback - 非 Node.js error-first 模式
        sendMessage: jest.fn((message, callback) => {
          if (callback) {
            callback({ success: true }); // skipcq: JS-0255
          }
        }),
        onMessage: {
          addListener: jest.fn(handler => {
            messageHandler = handler;
          }),
        },
        lastError: null,
      },
    };

    global.chrome = mockChrome;
    global.window = global.window || {};
  });

  afterEach(() => {
    global.window = originalWindow;
    jest.clearAllMocks();
  });

  /**
   * 執行實際的 preloader.js 腳本
   * 通過讀取並執行實際文件，確保測試與實現同步
   */
  function executePreloader() {
    // 使用 require 加載文件系統模組
    const fs = require('fs');
    const path = require('path');

    // 讀取實際的 preloader.js 腳本
    const preloaderPath = path.resolve(__dirname, '../../../scripts/performance/preloader.js');
    const preloaderCode = fs.readFileSync(preloaderPath, 'utf8');

    // 抑制 console.log 輸出（preloader 會輸出載入日誌）
    const originalConsoleLog = console.log;
    console.log = jest.fn();

    try {
      // 執行腳本（IIFE 會立即執行）

      eval(preloaderCode);
    } finally {
      // 恢復 console.log
      console.log = originalConsoleLog;
    }
  }

  describe('初始化防護', () => {
    test('應該正確初始化並設置標記', () => {
      executePreloader();

      expect(window.__NOTION_PRELOADER_INITIALIZED__).toBe(true);
    });

    test('應該阻止重複初始化', () => {
      // 第一次初始化
      executePreloader();

      // 模擬第二次呼叫
      window.__NOTION_PRELOADER_CACHE__ = null;
      executePreloader();

      // 快取不應被重新創建（因為已初始化標記存在）
      expect(window.__NOTION_PRELOADER_CACHE__).toBeNull();
    });

    test('應該正確創建預載快取', () => {
      executePreloader();

      expect(window.__NOTION_PRELOADER_CACHE__).toBeDefined();
      expect(window.__NOTION_PRELOADER_CACHE__.article).toBeDefined();
      expect(window.__NOTION_PRELOADER_CACHE__.mainContent).toBeDefined();
      expect(window.__NOTION_PRELOADER_CACHE__.timestamp).toBeDefined();
    });
  });

  describe('快捷鍵監聽', () => {
    test('應該註冊 keydown 事件監聽器', () => {
      executePreloader();

      expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    test('Ctrl+S 應該觸發 USER_ACTIVATE_SHORTCUT 消息', () => {
      executePreloader();

      const mockEvent = {
        ctrlKey: true,
        metaKey: false,
        key: 's',
        preventDefault: jest.fn(),
      };

      keydownHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'USER_ACTIVATE_SHORTCUT' },
        expect.any(Function)
      );
    });

    test('Cmd+S (macOS) 應該觸發 USER_ACTIVATE_SHORTCUT 消息', () => {
      executePreloader();

      const mockEvent = {
        ctrlKey: false,
        metaKey: true,
        key: 's',
        preventDefault: jest.fn(),
      };

      keydownHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'USER_ACTIVATE_SHORTCUT' },
        expect.any(Function)
      );
    });

    test('普通按鍵不應觸發消息發送', () => {
      executePreloader();

      const mockEvent = {
        ctrlKey: false,
        metaKey: false,
        key: 'a',
        preventDefault: jest.fn(),
      };

      keydownHandler(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('Ctrl+其他鍵不應觸發消息發送', () => {
      executePreloader();

      const mockEvent = {
        ctrlKey: true,
        metaKey: false,
        key: 'a',
        preventDefault: jest.fn(),
      };

      keydownHandler(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('消息監聽', () => {
    test('應該註冊消息監聽器', () => {
      executePreloader();

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('PING 應該在 Bundle 未載入時由 Preloader 響應', () => {
      executePreloader();

      const sendResponse = jest.fn();
      const result = messageHandler({ action: 'PING' }, {}, sendResponse);

      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({
        status: 'preloader_only',
        hasCache: true,
      });
    });

    test('PING 在 Bundle 已載入時不應響應', () => {
      executePreloader();
      window.__NOTION_BUNDLE_READY__ = true;

      const sendResponse = jest.fn();
      const result = messageHandler({ action: 'PING' }, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    test('INIT_BUNDLE 應該返回 ready 狀態', () => {
      executePreloader();

      const sendResponse = jest.fn();
      const result = messageHandler({ action: 'INIT_BUNDLE' }, {}, sendResponse);

      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({
        ready: true,
        bufferedEvents: 0,
      });
    });

    test('REPLAY_BUFFERED_EVENTS 應該清空並返回緩衝事件', () => {
      executePreloader();

      const sendResponse = jest.fn();
      const result = messageHandler({ action: 'REPLAY_BUFFERED_EVENTS' }, {}, sendResponse);

      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({
        events: [],
      });
    });

    test('未知消息不應需要異步響應', () => {
      executePreloader();

      const sendResponse = jest.fn();
      const result = messageHandler({ action: 'UNKNOWN_ACTION' }, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('快取結構', () => {
    test('快取應包含正確的結構', () => {
      executePreloader();

      const cache = window.__NOTION_PRELOADER_CACHE__;
      expect(cache).toHaveProperty('article');
      expect(cache).toHaveProperty('mainContent');
      expect(cache).toHaveProperty('timestamp');
      expect(typeof cache.timestamp).toBe('number');
    });

    test('快取應正確識別 article 元素', () => {
      executePreloader();

      expect(window.__NOTION_PRELOADER_CACHE__.article.tagName).toBe('ARTICLE');
    });

    test('快取應正確識別 main content 元素', () => {
      executePreloader();

      expect(window.__NOTION_PRELOADER_CACHE__.mainContent.tagName).toBe('MAIN');
    });
  });

  describe('錯誤處理', () => {
    test('sendMessage 錯誤時應優雅處理', () => {
      chrome.runtime.lastError = { message: 'Connection error' };

      executePreloader();

      const mockEvent = {
        ctrlKey: true,
        metaKey: false,
        key: 's',
        preventDefault: jest.fn(),
      };

      // 不應拋出錯誤
      expect(() => keydownHandler(mockEvent)).not.toThrow();
    });
  });
});
