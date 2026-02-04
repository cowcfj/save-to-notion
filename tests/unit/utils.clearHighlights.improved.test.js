/**
 * 測試改進後的 clearHighlights 方法
 * 包含輸入驗證、並行清除、錯誤處理等新功能
 */

const chrome = require('../mocks/chrome');

// 設置全局環境
globalThis.chrome = chrome;
globalThis.localStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null;
  },
  setItem(key, value) {
    this.data[key] = value;
  },
  removeItem(key) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  },
};

jest.mock('../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ES Module 導入
import { StorageUtil } from '../../scripts/highlighter/utils/StorageUtil.js';
import Logger from '../../scripts/utils/Logger.js';

describe('StorageUtil.clearHighlights - 改進版測試', () => {
  beforeEach(() => {
    // 重置 chrome.storage mock
    chrome._clearStorage();
    chrome.storage.local.get.mockClear();
    chrome.storage.local.set.mockClear();
    chrome.storage.local.remove.mockClear();

    // 確保 remove 的默認實現是正確的
    chrome.storage.local.remove.mockImplementation((keys, callback) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      const storageData = chrome._getStorage();
      keysArray.forEach(key => {
        delete storageData[key];
      });
      if (callback) {
        callback();
      }
      return Promise.resolve();
    });

    chrome.runtime.lastError = null;

    // 重置 localStorage
    globalThis.localStorage.clear();

    // 重置 Logger mocks
    Logger.log.mockClear();
    Logger.debug.mockClear();
    Logger.info.mockClear();
    Logger.warn.mockClear();
    Logger.error.mockClear();
  });

  afterEach(() => {
    chrome.runtime.lastError = null;
  });

  describe('輸入驗證', () => {
    test('應該拒絕 null 或 undefined 的 URL', async () => {
      if (!StorageUtil) {
        console.warn('StorageUtil not available, skipping test');
        return;
      }
      await expect(StorageUtil.clearHighlights(null)).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      await expect(StorageUtil.clearHighlights()).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      expect(Logger.error).toHaveBeenCalled();
    });

    test('應該拒絕空字串 URL', async () => {
      if (!StorageUtil) {
        return;
      }
      await expect(StorageUtil.clearHighlights('')).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('應該拒絕非字串類型的 URL', async () => {
      if (!StorageUtil) {
        return;
      }
      await expect(StorageUtil.clearHighlights(123)).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      await expect(StorageUtil.clearHighlights({})).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      await expect(StorageUtil.clearHighlights([])).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('應該處理 URL 標準化', async () => {
      if (!StorageUtil) {
        return;
      }
      const validUrl = 'https://example.com/page';
      await expect(StorageUtil.clearHighlights(validUrl)).resolves.toBeUndefined();
    });
  });

  describe('並行清除操作', () => {
    test('應該同時清除 Chrome Storage 和 localStorage', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/test';
      const pageKey = 'highlights_https://example.com/test';

      await chrome.storage.local.set({ [pageKey]: [{ text: 'test' }] });
      globalThis.localStorage.setItem(pageKey, JSON.stringify([{ text: 'test' }]));

      await StorageUtil.clearHighlights(testUrl);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([pageKey], expect.any(Function));
      expect(globalThis.localStorage.getItem(pageKey)).toBeNull();
      expect(Logger.log).toHaveBeenCalledWith(
        '標註清除完成',
        expect.objectContaining({ action: 'clearHighlights' })
      );
    });

    test('應該記錄清除開始', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/test';

      await StorageUtil.clearHighlights(testUrl);

      expect(Logger.log).toHaveBeenCalledWith(
        '開始清除標註',
        expect.objectContaining({ action: 'clearHighlights' })
      );
    });
  });

  describe('錯誤處理', () => {
    test('當 Chrome Storage 失敗但 localStorage 成功時應該記錄警告', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/test';
      const pageKey = 'highlights_https://example.com/test';

      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        chrome.runtime.lastError = { message: 'Storage error' };
        callback();
      });

      globalThis.localStorage.setItem(pageKey, JSON.stringify([{ text: 'test' }]));

      await StorageUtil.clearHighlights(testUrl);

      expect(Logger.warn).toHaveBeenCalledWith(
        '部分存儲清除失敗',
        expect.objectContaining({ action: 'clearHighlights' })
      );
      expect(globalThis.localStorage.getItem(pageKey)).toBeNull();
    });

    test('當 Chrome Storage 不可用時應該只使用 localStorage', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/test';
      const pageKey = 'highlights_https://example.com/test';

      const originalChrome = globalThis.chrome;
      globalThis.chrome = {};

      globalThis.localStorage.setItem(pageKey, JSON.stringify([{ text: 'test' }]));

      await StorageUtil.clearHighlights(testUrl);

      expect(globalThis.localStorage.getItem(pageKey)).toBeNull();
      expect(Logger.warn).toHaveBeenCalledWith(
        '部分存儲清除失敗',
        expect.objectContaining({ action: 'clearHighlights' })
      );

      globalThis.chrome = originalChrome;
    });
  });

  describe('輔助方法測試', () => {
    describe('_clearFromChromeStorage', () => {
      test('應該成功清除 Chrome Storage', async () => {
        if (!StorageUtil) {
          return;
        }
        const testKey = 'test_key';
        chrome.runtime.lastError = null;

        await chrome.storage.local.set({ [testKey]: 'test_value' });
        await StorageUtil._clearFromChromeStorage(testKey);

        expect(chrome.storage.local.remove).toHaveBeenCalledWith([testKey], expect.any(Function));
      });

      test('當 Chrome Storage 不可用時應該拋出錯誤', async () => {
        if (!StorageUtil) {
          return;
        }
        const originalChrome = globalThis.chrome;
        globalThis.chrome = {};

        await expect(StorageUtil._clearFromChromeStorage('test_key')).rejects.toThrow(
          'Chrome storage not available'
        );

        globalThis.chrome = originalChrome;
      });

      test('當操作失敗時應該拋出包含錯誤信息的錯誤', async () => {
        if (!StorageUtil) {
          return;
        }
        chrome.storage.local.remove.mockImplementation((keys, callback) => {
          chrome.runtime.lastError = { message: 'Test error' };
          callback();
        });

        await expect(StorageUtil._clearFromChromeStorage('test_key')).rejects.toThrow(
          'Chrome storage error: Test error'
        );
      });
    });

    describe('_clearFromLocalStorage', () => {
      test('應該成功清除 localStorage', async () => {
        if (!StorageUtil) {
          return;
        }
        const testKey = 'test_key';
        globalThis.localStorage.setItem(testKey, 'test_value');

        await StorageUtil._clearFromLocalStorage(testKey);

        expect(globalThis.localStorage.getItem(testKey)).toBeNull();
      });

      test('正常操作應該成功完成', async () => {
        if (!StorageUtil) {
          return;
        }
        const testKey = 'test_error_key';
        globalThis.localStorage.setItem(testKey, 'test_value');

        await expect(StorageUtil._clearFromLocalStorage(testKey)).resolves.toBeUndefined();
        expect(globalThis.localStorage.getItem(testKey)).toBeNull();
      });
    });
  });

  describe('向後兼容性', () => {
    test('應該正確處理標準化 URL', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/page?utm_source=test#anchor';
      const expectedKey = 'highlights_https://example.com/page';

      await StorageUtil.clearHighlights(testUrl);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([expectedKey], expect.any(Function));
    });

    test('應該與現有代碼保持相同的介面', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/test';

      const result = StorageUtil.clearHighlights(testUrl);
      expect(result).toBeInstanceOf(Promise);

      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('性能測試', () => {
    test('應該在合理時間內完成清除操作', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/test';
      const startTime = Date.now();

      await StorageUtil.clearHighlights(testUrl);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    test('應該並行執行清除操作而非串行', async () => {
      if (!StorageUtil) {
        return;
      }
      const testUrl = 'https://example.com/test';

      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        setTimeout(() => {
          if (callback) {
            callback();
          }
        }, 10);
      });

      const originalRemoveItem = globalThis.localStorage.removeItem;
      globalThis.localStorage.removeItem = jest.fn();

      const startTime = Date.now();
      await StorageUtil.clearHighlights(testUrl);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(100);

      globalThis.localStorage.removeItem = originalRemoveItem;
    });
  });
});
