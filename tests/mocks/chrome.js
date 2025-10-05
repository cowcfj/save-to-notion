// Chrome API Mock
// 模擬 Chrome Extension API 供測試使用

const chrome = {
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        callback && callback({});
      }),
      set: jest.fn((items, callback) => {
        callback && callback();
      }),
      remove: jest.fn((keys, callback) => {
        callback && callback();
      }),
      clear: jest.fn((callback) => {
        callback && callback();
      })
    }
  },
  
  runtime: {
    lastError: null,
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    }
  },
  
  tabs: {
    query: jest.fn((queryInfo, callback) => {
      callback && callback([{ id: 1, url: 'https://example.com' }]);
    }),
    sendMessage: jest.fn(),
    create: jest.fn(),
    onUpdated: {
      addListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn()
    }
  },
  
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  }
};

global.chrome = chrome;

module.exports = chrome;
