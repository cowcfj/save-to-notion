/**
 * Jest 測試環境設置
 * 配置全局 mocks 和測試工具
 *
 * 注意：使用 jest.config.js 中的 testEnvironment: 'jsdom'
 * Jest 會自動提供 DOM 環境，無需手動創建 JSDOM
 */

// 確保 TextEncoder/TextDecoder 可用（某些 Node 版本需要）
if (globalThis.TextEncoder === undefined) {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// 導入 Chrome API mock
require('./mocks/chrome');

// Force Logger into dev mode for testing
globalThis.__FORCE_LOG__ = true;
globalThis.__LOGGER_DEV__ = true;

// Initialize runtime.lastError for ScriptInjector tests
globalThis.chrome.runtime.lastError = null;

// Mock Logger (used by scripts) - simulate dev mode behavior since __FORCE_LOG__ is set
// deepcode ignore UseConsoleLogInBrowser: Console usage is intentional in test environment for Logger mock
globalThis.Logger = {
  log: jest.fn((message, ...args) => {
    // Simulate dev mode: send background log and console.log
    if (globalThis.chrome?.runtime?.sendMessage) {
      globalThis.chrome.runtime.sendMessage(
        {
          action: 'devLogSink',
          level: 'log',
          message,
          args,
        },
        () => {
          /* no-op */
        }
      );
    }
    // deepcode ignore UseConsoleLogInBrowser: Test environment Logger mock
    // skipcq: JS-0002
    console.log(`[LOG] ${message}`, ...args); // Concatenate prefix with message
  }),
  debug: jest.fn((message, ...args) => {
    // Simulate dev mode: send background log and console.log
    if (globalThis.chrome?.runtime?.sendMessage) {
      globalThis.chrome.runtime.sendMessage(
        {
          action: 'devLogSink',
          level: 'debug',
          message,
          args,
        },
        () => {
          /* no-op */
        }
      );
    }
    try {
      // deepcode ignore UseConsoleLogInBrowser: Test environment Logger mock
      // skipcq: JS-0002
      console.log(`[DEBUG] ${message}`, ...args);
    } catch {
      // 忽略 console 錯誤
    }
  }),
  info: jest.fn((message, ...args) => {
    // Simulate dev mode: send background log and console.log
    if (globalThis.chrome?.runtime?.sendMessage) {
      globalThis.chrome.runtime.sendMessage(
        {
          action: 'devLogSink',
          level: 'info',
          message,
          args,
        },
        () => {
          /* no-op */
        }
      );
    }
    try {
      // deepcode ignore UseConsoleLogInBrowser: Test environment Logger mock
      // skipcq: JS-0002
      console.log(`[INFO] ${message}`, ...args);
    } catch {
      // 忽略 console 錯誤
    }
  }),
  warn: jest.fn((message, ...args) => {
    // Always send background log, optionally console.warn in dev mode
    if (globalThis.chrome?.runtime?.sendMessage) {
      try {
        globalThis.chrome.runtime.sendMessage(
          {
            action: 'devLogSink',
            level: 'warn',
            message,
            args,
          },
          () => {
            /* no-op */
          }
        );
      } catch {
        // Ignore sendMessage errors in tests
      }
    }
    if (globalThis.__LOGGER_DEV__) {
      // Tests expect console.warn with concatenated message
      try {
        console.warn(`[WARN] ${message}`, ...args); // deepcode ignore UseConsoleLogInBrowser: Test environment Logger mock
      } catch {
        // 忽略 console 錯誤
      }
    }
  }),
  error: jest.fn((message, ...args) => {
    // Always send background log and console.error
    if (globalThis.chrome?.runtime?.sendMessage) {
      globalThis.chrome.runtime.sendMessage(
        {
          action: 'devLogSink',
          level: 'error',
          message,
          args,
        },
        () => {
          /* no-op */
        }
      );
    }
    try {
      console.error(`[ERROR] ${message}`, ...args); // deepcode ignore UseConsoleLogInBrowser: Test environment Logger mock
    } catch {
      // 忽略 console 錯誤
    }
  }),
};

// ImageUtils mock is handled in presetup.js
// Mock chrome.runtime.sendMessage for Logger background logging
globalThis.chrome.runtime.sendMessage = jest.fn((payload, callback) => {
  if (typeof callback === 'function') {
    callback();
  }
});

// Mock fetch API
globalThis.fetch = jest.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: jest.fn(key => {
      return store[key] === undefined ? null : store[key];
    }),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn(index => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    // 輔助方法：獲取所有數據
    _getAll: () => ({ ...store }),
    // 輔助方法：重置數據
    _reset: () => {
      store = {};
    },
    // 輔助方法：獲取實際 store
    _getStore: () => store,
  };
})();

globalThis.localStorage = localStorageMock;

// Mock console 方法（防止測試輸出過多）
globalThis.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// 每個測試前清理 mocks（在 beforeEach 中已經有，但這裡確保 Logger 相關測試正常）
beforeEach(() => {
  // 清理 Logger mocks
  if (globalThis.Logger) {
    Object.keys(globalThis.Logger).forEach(method => {
      if (globalThis.Logger[method]?.mockClear) {
        globalThis.Logger[method].mockClear();
      }
    });
  }

  // 清理 console mocks（確保 Logger 測試不會受影響）
  if (globalThis.console) {
    ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
      if (globalThis.console[method]?.mockClear) {
        globalThis.console[method].mockClear();
      }
    });
  }
});

// 每個測試前重置 mocks
beforeEach(() => {
  // 清理 DOM
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerHTML = '';
  }

  // 清理 fetch mock
  if (globalThis.fetch?.mockClear) {
    globalThis.fetch.mockClear();
  }

  // 清理 localStorage
  if (globalThis.localStorage?._reset) {
    globalThis.localStorage._reset();
  }

  // 清理 Chrome storage
  if (globalThis.chrome?._clearStorage) {
    globalThis.chrome._clearStorage();
  }

  // 清理 console mocks
  Object.keys(console).forEach(method => {
    if (console[method]?.mockClear) {
      console[method].mockClear();
    }
  });
});

// 輔助函數：創建 mock Response
globalThis.createMockResponse = (data, status = 200, ok = true) => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  json: jest.fn().mockResolvedValue(data),
  text: jest.fn().mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data)),
  headers: new Map(),
});

// 輔助函數：等待 Promise 解析
globalThis.flushPromises = () => new Promise(resolve => setImmediate(resolve));

// 輔助函數：創建 DOM 元素
globalThis.createDOMElement = (tag, attributes = {}, textContent = '') => {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else {
      element.setAttribute(key, value);
    }
  });
  if (textContent) {
    element.textContent = textContent;
  }
  return element;
};

// 輔助函數：創建完整的 HTML 結構
globalThis.createDOMFromHTML = htmlString => {
  const container = document.createElement('div');
  container.innerHTML = htmlString;
  return container;
};

// 輔助函數：模擬圖片元素
globalThis.createMockImage = (src, attributes = {}) => {
  return globalThis.createDOMElement('img', { src, ...attributes });
};
