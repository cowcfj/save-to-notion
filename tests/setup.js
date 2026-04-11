/**
 * Jest 測試環境設置
 * 配置全局 mocks 和測試工具
 *
 * 注意：使用 jest.config.js 中的 testEnvironment: 'jsdom'
 * Jest 會自動提供 DOM 環境，無需手動創建 JSDOM
 */

// 確保 TextEncoder/TextDecoder 可用（某些 Node 版本需要）
if (globalThis.TextEncoder === undefined) {
  const { TextEncoder, TextDecoder } = require('node:util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

if (globalThis.structuredClone === undefined) {
  const { serialize, deserialize } = require('node:v8');
  globalThis.structuredClone = value => deserialize(serialize(value));
}

// 導入 Chrome API mock
const sharedChromeMock = require('./mocks/chrome');
const sharedRuntimeSendMessage = sharedChromeMock.runtime.sendMessage;

// Force Logger into dev mode for testing
globalThis.__FORCE_LOG__ = true;
globalThis.__LOGGER_DEV__ = true;

function restoreSharedChromeMock() {
  globalThis.chrome = sharedChromeMock;

  if (globalThis.chrome?.runtime) {
    // 對齊 Chrome 無錯誤時的預設行為，避免跨測試殘留 lastError
    globalThis.chrome.runtime.lastError = undefined;

    // 還原共用 mock 的雙模式契約，避免前一個測試留下 mockImplementation 或整個函式被覆寫
    sharedRuntimeSendMessage.mockImplementation((payload, callback) => {
      if (typeof callback === 'function') {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    });

    globalThis.chrome.runtime.sendMessage = sharedRuntimeSendMessage;
  }
}

restoreSharedChromeMock();

// [TECHNICAL DEBT]
// 這裡的 globalThis.Logger 會在所有測試中覆蓋真正的 utils/Logger.js
// 若測試需要驗證真實這 logger 行為，必須使用 `jest.isolateModules()` 搭配 `jest.resetModules()` 重新 import。
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
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  addLogToBuffer: jest.fn(),
};

// ImageUtils mock is handled in presetup.js
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
    // 輔助方法：取得所有資料
    _getAll: () => ({ ...store }),
    // 輔助方法：重設資料
    _reset: () => {
      store = {};
    },
    // 輔助方法：取得實際 store
    _getStore: () => store,
  };
})();

const shouldMockLocalStorage = !globalThis.window?.localStorage;

if (shouldMockLocalStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

// Mock console 方法（防止測試輸出過多）
globalThis.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// 每個測試前重置全局狀態與 Mocks
beforeEach(() => {
  jest.clearAllMocks();
  restoreSharedChromeMock();

  // 1. 清理 DOM 結構
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerHTML = '';
  }

  // 2. 清理全局 Logger mocks
  if (globalThis.Logger) {
    Object.keys(globalThis.Logger).forEach(method => {
      if (globalThis.Logger[method]?.mockClear) {
        globalThis.Logger[method].mockClear();
      }
    });
  }

  // 3. 清理 console mocks（防止各測試互相污染）
  if (globalThis.console) {
    Object.keys(globalThis.console).forEach(method => {
      if (globalThis.console[method]?.mockClear) {
        globalThis.console[method].mockClear();
      }
    });
  }

  // 4. 清理 fetch mock
  if (globalThis.fetch?.mockClear) {
    globalThis.fetch.mockClear();
  }

  // 5. 清理 localStorage
  if (globalThis.localStorage && typeof globalThis.localStorage._reset === 'function') {
    globalThis.localStorage._reset();
  }

  // 6. 清理 Chrome API storage mocks
  if (globalThis.chrome && typeof globalThis.chrome._clearStorage === 'function') {
    globalThis.chrome._clearStorage();
  }
});

afterEach(() => {
  jest.clearAllMocks();
  delete globalThis.chrome;
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
