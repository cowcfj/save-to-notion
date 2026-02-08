/**
 * Integration Test Helper
 * Provides shared utilities for background script integration tests
 */

/**
 * Creates a mock event object with listener management and emission capabilities.
 * Simulates Chrome extension event API.
 *
 * @returns {object} Mock event object with addListener, removeListener, hasListener, and _emit
 */
export function createEvent() {
  const listeners = [];
  return {
    addListener: fn => listeners.push(fn),
    removeListener: fn => {
      const i = listeners.indexOf(fn);
      if (i !== -1) {
        listeners.splice(i, 1);
      }
    },
    hasListener: fn => listeners.includes(fn),
    _emit: (...args) =>
      listeners.forEach(fn => {
        try {
          fn(...args);
        } catch (error) {
          // Ignore listener errors to prevent test interruption,
          // matching Chrome's behavior where one listener failure doesn't stop others
          console.error('Test Execution Event Error (Ignored):', error);
        }
      }),
    _listeners: listeners,
  };
}

/**
 * Waits for a mock function to be called within a timeout.
 * Useful for testing async message passing or callbacks.
 *
 * @param {jest.Mock} mockFn - The mock function to wait for
 * @param {number} [maxWaitMs=1500] - Maximum wait time in milliseconds
 * @returns {Promise<void>} Resolves when called, rejects on timeout
 */
export function waitForSend(mockFn, maxWaitMs = 1500) {
  if (mockFn.mock.calls.length > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`waitForSend timeout: function was not called within ${maxWaitMs}ms`));
    }, maxWaitMs);

    // Capture the current implementation (if any) to pass-through
    const originalImpl = mockFn.getMockImplementation();

    mockFn.mockImplementationOnce(function (...args) {
      clearTimeout(timer);
      resolve();

      // Pass through to original implementation if it exists
      if (originalImpl) {
        return originalImpl.apply(this, args);
      }
      return undefined;
    });
  });
}

/**
 * Flushes the Promise microtask queue.
 * Useful for ensuring all pending promises verify before assertions.
 *
 * @param {number} [ticks=3] - Number of microtask ticks to flush
 */
export async function flushPromises(ticks = 3) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

/**
 * Creates a standard mock Logger for tests.
 *
 * @returns {object} Mock Logger object
 */
export function createMockLogger() {
  return {
    debugEnabled: false,
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    addLogToBuffer: jest.fn(),
    start: jest.fn(),
    success: jest.fn(),
  };
}

/**
 * Helper to setup common Chrome mocks for background tests.
 *
 * @param {object} [customStorageData={}] - Initial data for storage.local
 * @param {object} [customSyncStorageData={}] - Initial data for storage.sync
 * @returns {object} Object containing the mock chrome object and created events
 */
export function setupChromeMock(customStorageData = {}, customSyncStorageData = {}) {
  const onMessage = createEvent();
  const onInstalled = createEvent();
  const onUpdated = createEvent();
  const onActivated = createEvent();
  const onRemoved = createEvent();

  const storageData = { ...customStorageData };
  const syncStorageData = { ...customSyncStorageData };

  const chromeMock = {
    runtime: {
      id: 'test-id',
      lastError: null,
      getManifest: jest.fn(() => ({ version: '2.9.5' })),
      onMessage,
      onInstalled,
      getURL: jest.fn(path => `chrome-extension://test/${path}`),
    },
    tabs: {
      onUpdated,
      onActivated,
      onRemoved,
      get: jest.fn((tabId, mockCb) => {
        const result = { id: tabId, url: 'https://example.com' };
        mockCb?.(result);
        return Promise.resolve(result);
      }),
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn((props, mockCb) => {
        const result = { id: 101, ...props };
        // Support both promise and callback
        mockCb?.(result);
        return Promise.resolve(result);
      }),
      sendMessage: jest.fn((tabId, msg, mockCb) => {
        const result = { success: true };
        mockCb?.(result);
        return Promise.resolve(result);
      }),
    },
    action: {
      setBadgeText: jest.fn(),
      setBadgeBackgroundColor: jest.fn(),
    },
    scripting: {
      executeScript: jest.fn((opts, mockCb) => {
        const res = [{ result: undefined }];
        mockCb?.(res);
        return Promise.resolve(res);
      }),
    },
    storage: {
      local: {
        get: jest.fn((keys, mockCb) => {
          const res = {};
          if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (key in storageData) {
                res[key] = storageData[key];
              }
            });
          } else if (typeof keys === 'string') {
            if (keys in storageData) {
              res[keys] = storageData[keys];
            }
          } else if (typeof keys === 'object' && keys !== null) {
            for (const [key, defaultValue] of Object.entries(keys)) {
              res[key] = key in storageData ? storageData[key] : defaultValue;
            }
          } else if (!keys) {
            Object.assign(res, storageData);
          }
          mockCb?.(res);
          return Promise.resolve(res);
        }),
        set: jest.fn((items, mockCb) => {
          Object.assign(storageData, items);
          mockCb?.();
          return Promise.resolve();
        }),
        remove: jest.fn((keys, mockCb) => {
          (Array.isArray(keys) ? keys : [keys]).forEach(key => {
            delete storageData[key];
          });
          mockCb?.();
          return Promise.resolve();
        }),
      },
      sync: {
        get: jest.fn((keys, mockCb) => {
          const res = {};
          if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (key in syncStorageData) {
                res[key] = syncStorageData[key];
              }
            });
          } else if (typeof keys === 'string') {
            if (keys in syncStorageData) {
              res[keys] = syncStorageData[keys];
            }
          } else if (typeof keys === 'object' && keys !== null) {
            for (const [key, defaultValue] of Object.entries(keys)) {
              res[key] = key in syncStorageData ? syncStorageData[key] : defaultValue;
            }
          } else if (!keys) {
            Object.assign(res, syncStorageData);
          }
          mockCb?.(res);
          return Promise.resolve(res);
        }),
        set: jest.fn((items, mockCb) => {
          Object.assign(syncStorageData, items);
          mockCb?.();
          return Promise.resolve();
        }),
        remove: jest.fn((keys, mockCb) => {
          (Array.isArray(keys) ? keys : [keys]).forEach(key => {
            delete syncStorageData[key];
          });
          mockCb?.();
          return Promise.resolve();
        }),
      },
    },
  };

  return {
    chromeMock,
    events: {
      onMessage,
      onInstalled,
      onUpdated,
      onActivated,
      onRemoved,
    },
    storageData,
    syncStorageData,
  };
}
