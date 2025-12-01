// Chrome API Mock
// 模擬 Chrome Extension API 供測試使用

// 內存存儲模擬真實行為
const storageData = {};

const chrome = {
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        const result = {};
        if (typeof keys === 'string') {
          if (storageData[keys] !== undefined) {
            result[keys] = storageData[keys];
          }
        } else if (Array.isArray(keys)) {
          keys.forEach(key => {
            if (storageData[key] !== undefined) {
              result[key] = storageData[key];
            }
          });
        } else if (keys === null || keys === undefined) {
          Object.assign(result, storageData);
        }
        if (callback) {
          callback(result);
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(storageData, items);
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach(key => {
          delete storageData[key];
        });
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      clear: jest.fn(callback => {
        Object.keys(storageData).forEach(key => {
          delete storageData[key];
        });
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      getBytesInUse: jest.fn((keys, callback) => {
        const size = JSON.stringify(storageData).length;
        if (callback) {
          callback(size);
        }
        return Promise.resolve(size);
      }),
    },
    sync: {
      get: jest.fn((keys, callback) => {
        const result = {};
        if (typeof keys === 'string') {
          if (storageData[keys] !== undefined) {
            result[keys] = storageData[keys];
          }
        } else if (Array.isArray(keys)) {
          keys.forEach(key => {
            if (storageData[key] !== undefined) {
              result[key] = storageData[key];
            }
          });
        } else if (keys === null || keys === undefined) {
          Object.assign(result, storageData);
        }
        if (callback) {
          callback(result);
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(storageData, items);
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach(key => {
          delete storageData[key];
        });
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
    },
  },

  runtime: {
    lastError: null,
    sendMessage: jest.fn((message, callback) => {
      if (callback) {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    getURL: jest.fn(path => `chrome-extension://mock-id/${path}`),
    getManifest: jest.fn(() => ({
      version: '2.7.3',
      name: 'Notion Smart Clipper',
    })),
    id: 'mock-extension-id',
  },

  tabs: {
    query: jest.fn((queryInfo, callback) => {
      const tabs = [
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          active: true,
        },
      ];
      if (callback) {
        callback(tabs);
      }
      return Promise.resolve(tabs);
    }),
    sendMessage: jest.fn((tabId, message, callback) => {
      if (callback) {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    create: jest.fn((createProperties, callback) => {
      const tab = {
        id: Math.floor(Math.random() * 10000),
        ...createProperties,
      };
      if (callback) {
        callback(tab);
      }
      return Promise.resolve(tab);
    }),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onActivated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },

  action: {
    setBadgeText: jest.fn((details, callback) => {
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
    setBadgeBackgroundColor: jest.fn((details, callback) => {
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
  },

  // 輔助方法：清理存儲數據（測試用）
  _clearStorage: () => {
    Object.keys(storageData).forEach(key => {
      delete storageData[key];
    });
  },

  // 輔助方法：獲取存儲數據（測試用）
  _getStorage: () => ({ ...storageData }),
};

global.chrome = chrome;

module.exports = chrome;
