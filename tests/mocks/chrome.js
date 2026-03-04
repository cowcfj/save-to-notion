// Chrome API Mock
// 模擬 Chrome Extension API 供測試使用

// 內存存儲模擬真實行為
const localStorageData = {};
const syncStorageData = {};
let mockTabIdCounter = 1000;

const chrome = {
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        const result = {};
        if (typeof keys === 'string') {
          if (localStorageData[keys] !== undefined) {
            result[keys] = localStorageData[keys];
          }
        } else if (Array.isArray(keys)) {
          keys.forEach(key => {
            if (localStorageData[key] !== undefined) {
              result[key] = localStorageData[key];
            }
          });
        } else if (keys === null || keys === undefined) {
          Object.assign(result, localStorageData);
        }
        if (callback) {
          callback(result);
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(localStorageData, items);
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach(key => {
          delete localStorageData[key];
        });
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      clear: jest.fn(callback => {
        Object.keys(localStorageData).forEach(key => {
          delete localStorageData[key];
        });
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      getBytesInUse: jest.fn((keys, callback) => {
        const size = JSON.stringify(localStorageData).length;
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
          if (syncStorageData[keys] !== undefined) {
            result[keys] = syncStorageData[keys];
          }
        } else if (Array.isArray(keys)) {
          keys.forEach(key => {
            if (syncStorageData[key] !== undefined) {
              result[key] = syncStorageData[key];
            }
          });
        } else if (keys === null || keys === undefined) {
          Object.assign(result, syncStorageData);
        }
        if (callback) {
          callback(result);
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(syncStorageData, items);
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach(key => {
          delete syncStorageData[key];
        });
        if (callback) {
          callback();
        }
        return Promise.resolve();
      }),
      clear: jest.fn(callback => {
        Object.keys(syncStorageData).forEach(key => {
          delete syncStorageData[key];
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
    onConnect: {
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
        id: mockTabIdCounter++,
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

  scripting: {
    executeScript: jest.fn((injection, callback) => {
      const results = [{ result: 5 }]; // 默認模擬清除 5 個標記
      if (callback) {
        callback(results);
      }
      return Promise.resolve(results);
    }),
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

  sidePanel: {
    setOptions: jest.fn(() => Promise.resolve()),
    setPanelBehavior: jest.fn(() => Promise.resolve()),
    open: jest.fn(() => Promise.resolve()),
  },

  notifications: {
    create: jest.fn((id, options, callback) => {
      if (callback) {
        callback(id || 'mock-notification-id');
      }
      return Promise.resolve(id || 'mock-notification-id');
    }),
    clear: jest.fn((id, callback) => {
      if (callback) {
        callback(true);
      }
      return Promise.resolve(true);
    }),
    onClicked: { addListener: jest.fn(), removeListener: jest.fn() },
    onClosed: { addListener: jest.fn(), removeListener: jest.fn() },
  },

  // 輔助方法：清理存儲數據（測試用）
  _clearStorage: () => {
    Object.keys(localStorageData).forEach(key => {
      delete localStorageData[key];
    });
    Object.keys(syncStorageData).forEach(key => {
      delete syncStorageData[key];
    });
    mockTabIdCounter = 1000;
  },

  // 輔助方法：獲取存儲數據（測試用）
  _getStorage: () => ({
    local: { ...localStorageData },
    sync: { ...syncStorageData },
  }),
};

globalThis.chrome = chrome;

module.exports = chrome;
