/**
 * Jest 測試環境設置
 * 配置全局 mocks 和測試工具
 */

// 導入 JSDOM 用於 DOM 測試
const { JSDOM } = require('jsdom');

// 創建一個基本的 DOM 環境
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://example.com',
  pretendToBeVisual: true,
  resources: 'usable'
});

// 將 DOM 全局對象暴露給測試
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;

// 導入 Chrome API mock
require('./mocks/chrome');

// Mock fetch API
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: jest.fn((key) => {
      return store[key] !== undefined ? store[key] : null;
    }),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index) => {
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
    _getStore: () => store
  };
})();

global.localStorage = localStorageMock;

// Mock console 方法（防止測試輸出過多）
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// 每個測試前重置 mocks
beforeEach(() => {
  // 清理 DOM
  if (document.body) {
    document.body.innerHTML = '';
  }
  
  // 清理 fetch mock
  if (global.fetch && global.fetch.mockClear) {
    global.fetch.mockClear();
  }
  
  // 清理 localStorage
  if (global.localStorage && global.localStorage._reset) {
    global.localStorage._reset();
  }
  
  // 清理 Chrome storage
  if (global.chrome && global.chrome._clearStorage) {
    global.chrome._clearStorage();
  }
  
  // 清理 console mocks
  Object.keys(console).forEach(method => {
    if (console[method] && console[method].mockClear) {
      console[method].mockClear();
    }
  });
});

// 輔助函數：創建 mock Response
global.createMockResponse = (data, status = 200, ok = true) => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  json: jest.fn().mockResolvedValue(data),
  text: jest.fn().mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data)),
  headers: new Map()
});

// 輔助函數：等待 Promise 解析
global.flushPromises = () => new Promise(resolve => setImmediate(resolve));

// 輔助函數：創建 DOM 元素
global.createDOMElement = (tag, attributes = {}, textContent = '') => {
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
global.createDOMFromHTML = (htmlString) => {
  const container = document.createElement('div');
  container.innerHTML = htmlString;
  return container;
};

// 輔助函數：模擬圖片元素
global.createMockImage = (src, attributes = {}) => {
  return createDOMElement('img', { src, ...attributes });
};
