/**
 * 測試改進後的 clearHighlights 方法
 * 包含輸入驗證、並行清除、錯誤處理等新功能
 */

const chrome = require('../../../mocks/chrome');

// Phase 3: 模擬 chrome.runtime.sendMessage（預設返回失敗以測試 Fallback 路徑）
if (!chrome.runtime) {
  chrome.runtime = {};
}
if (!chrome.runtime.sendMessage) {
  chrome.runtime.sendMessage = jest.fn(() =>
    Promise.reject(new Error('sendMessage disabled in test'))
  );
}
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

jest.mock('../../../../scripts/utils/Logger.js', () => ({
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
import { HighlightStorageGateway } from '../../../../scripts/highlighter/core/HighlightStorageGateway.js';
import Logger from '../../../../scripts/utils/Logger.js';

describe('HighlightStorageGateway.clearHighlights - 改進版測試', () => {
  beforeEach(() => {
    globalThis.chrome = chrome;

    // 重置 chrome.storage mock
    chrome._clearStorage();
    chrome.storage.local.get.mockClear();
    chrome.storage.local.set.mockClear();
    chrome.storage.local.remove.mockClear();

    // Phase 3：模擬 sendMessage 預設失敗（測試 Fallback 路徑）
    if (!globalThis.chrome.runtime) {
      globalThis.chrome.runtime = {};
    }
    globalThis.chrome.runtime.sendMessage = jest.fn(() =>
      Promise.reject(new Error('sendMessage disabled in test'))
    );

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
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    delete globalThis.chrome;
  });

  describe('輸入驗證', () => {
    test('應該拒絕 null 或 undefined 的 URL', async () => {
      if (!HighlightStorageGateway) {
        console.warn('HighlightStorageGateway not available, skipping test');
        return;
      }
      await expect(HighlightStorageGateway.clearHighlights(null)).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      await expect(HighlightStorageGateway.clearHighlights()).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      expect(Logger.error).toHaveBeenCalled();
    });

    test('應該拒絕空字串 URL', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      await expect(HighlightStorageGateway.clearHighlights('')).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('應該拒絕非字串類型的 URL', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      await expect(HighlightStorageGateway.clearHighlights(123)).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      await expect(HighlightStorageGateway.clearHighlights({})).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      await expect(HighlightStorageGateway.clearHighlights([])).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('應該處理 URL 標準化', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const validUrl = 'https://example.com/page';
      await expect(HighlightStorageGateway.clearHighlights(validUrl)).resolves.toBeUndefined();
    });
  });

  describe('並行清除操作', () => {
    test('應該清除 Chrome Storage 和 localStorage（Fallback 路徑）', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/test';
      // Phase 3 Fallback 路徑：清除 highlights_* 和 page_* keys
      const legacyKey = 'highlights_https://example.com/test';

      await chrome.storage.local.set({ [legacyKey]: [{ text: 'test' }] });
      globalThis.localStorage.setItem(legacyKey, JSON.stringify([{ text: 'test' }]));

      // sendMessage 已在 beforeEach 設為失敗，測試 Fallback 路徑
      await HighlightStorageGateway.clearHighlights(testUrl);

      // Fallback 路徑會嘗試清理 page_* 和 highlights_* keys
      const removeCall = chrome.storage.local.remove.mock.calls;
      const allRemovedKeys = removeCall.flatMap(call => {
        const keys = call[0];
        return Array.isArray(keys) ? keys : [keys];
      });
      expect(allRemovedKeys).toContain(legacyKey);
    });

    test('sendMessage 回傳 { success: false } 時應同樣觸發 Fallback 清除邏輯', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/test';
      const legacyKey = 'highlights_https://example.com/test';

      await chrome.storage.local.set({ [legacyKey]: [{ text: 'test' }] });
      globalThis.localStorage.setItem(legacyKey, JSON.stringify([{ text: 'test' }]));

      // sendMessage resolve { success: false }（非 reject）
      globalThis.chrome.runtime.sendMessage = jest.fn(() => Promise.resolve({ success: false }));

      await HighlightStorageGateway.clearHighlights(testUrl);

      // Fallback 路徑應仍清理 highlights_* key
      const removeCall = chrome.storage.local.remove.mock.calls;
      const allRemovedKeys = removeCall.flatMap(call => {
        const keys = call[0];
        return Array.isArray(keys) ? keys : [keys];
      });
      expect(allRemovedKeys).toContain(legacyKey);
    });

    test('應該記錄清除開始', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/test';

      await HighlightStorageGateway.clearHighlights(testUrl);

      expect(Logger.info).toHaveBeenCalledWith(
        '開始清除標註',
        expect.objectContaining({ action: 'clearHighlights' })
      );
    });
  });

  describe('錯誤處理', () => {
    test('當 Chrome Storage 失敗但 localStorage 成功時應該記錄警告（Fallback 路徑）', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/test';
      const legacyKey = 'highlights_https://example.com/test';

      // MV3 原生 Promise：直接以 rejected Promise 表示失敗
      chrome.storage.local.remove.mockRejectedValue(new Error('Storage error'));

      globalThis.localStorage.setItem(legacyKey, JSON.stringify([{ text: 'test' }]));

      // sendMessage 已在 beforeEach 設為失敗，走 Fallback 路徑
      await HighlightStorageGateway.clearHighlights(testUrl);

      expect(Logger.warn).toHaveBeenCalledWith(
        '部分存儲清除失敗',
        expect.objectContaining({ action: 'clearHighlights' })
      );
    });

    test('當 Chrome Storage 不可用時應該只使用 localStorage', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/test';
      const pageKey = 'highlights_https://example.com/test';

      const originalChrome = globalThis.chrome;
      // sendMessage 不可用，且 storage 也不可用
      globalThis.chrome = {};

      globalThis.localStorage.setItem(pageKey, JSON.stringify([{ text: 'test' }]));

      await HighlightStorageGateway.clearHighlights(testUrl);

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
        if (!HighlightStorageGateway) {
          return;
        }
        const testKey = 'test_key';

        await chrome.storage.local.set({ [testKey]: 'test_value' });
        await HighlightStorageGateway._clearFromChromeStorage(testKey);

        // MV3 原生 Promise：驗證 remove 被呼叫（不再驗證 callback 品签名）
        expect(chrome.storage.local.remove).toHaveBeenCalledWith([testKey]);
      });

      test('當 Chrome Storage 不可用時應該拋出錯誤', async () => {
        if (!HighlightStorageGateway) {
          return;
        }
        const originalChrome = globalThis.chrome;
        globalThis.chrome = {};

        await expect(HighlightStorageGateway._clearFromChromeStorage('test_key')).rejects.toThrow(
          'Chrome storage not available'
        );

        globalThis.chrome = originalChrome;
      });

      test('當操作失敗時應該拋出包含錯誤信息的錯誤', async () => {
        if (!HighlightStorageGateway) {
          return;
        }
        // MV3 原生 Promise：直接以 rejected Promise 表示失敗
        chrome.storage.local.remove.mockRejectedValue(new Error('Test error'));

        await expect(HighlightStorageGateway._clearFromChromeStorage('test_key')).rejects.toThrow(
          'Test error'
        );
      });
    });

    describe('_clearFromLocalStorage', () => {
      test('應該成功清除 localStorage', async () => {
        if (!HighlightStorageGateway) {
          return;
        }
        const testKey = 'test_key';
        globalThis.localStorage.setItem(testKey, 'test_value');

        await HighlightStorageGateway._clearFromLocalStorage(testKey);

        expect(globalThis.localStorage.getItem(testKey)).toBeNull();
      });

      test('正常操作應該成功完成', async () => {
        if (!HighlightStorageGateway) {
          return;
        }
        const testKey = 'test_error_key';
        globalThis.localStorage.setItem(testKey, 'test_value');

        await expect(
          HighlightStorageGateway._clearFromLocalStorage(testKey)
        ).resolves.toBeUndefined();
        expect(globalThis.localStorage.getItem(testKey)).toBeNull();
      });
    });
  });

  describe('向後兼容性', () => {
    test('應該正確處理標準化 URL（Phase 3: Fallback 路徑使用 page_* 和 highlights_* keys）', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/page?utm_source=test#anchor';
      // sendMessage 已在 beforeEach 設為失敗，測試 Fallback 路徑
      // Fallback 會嘗試對 page_https://example.com/page 和 highlights_https://example.com/page 兩種 keys
      await HighlightStorageGateway.clearHighlights(testUrl);

      const allRemovedKeys = chrome.storage.local.remove.mock.calls.flatMap(call => {
        const keys = call[0];
        return Array.isArray(keys) ? keys : [keys];
      });
      expect(allRemovedKeys).toContain('highlights_https://example.com/page');
    });

    test('應該與現有代碼保持相同的介面', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/test';

      const result = HighlightStorageGateway.clearHighlights(testUrl);
      expect(result).toBeInstanceOf(Promise);

      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('性能測試', () => {
    test('應該在合理時間內完成清除操作', async () => {
      if (!HighlightStorageGateway) {
        return;
      }
      const testUrl = 'https://example.com/test';

      // 確保走正常路徑，避免重試所造成的延遲
      globalThis.chrome.runtime.sendMessage = jest.fn(() => Promise.resolve({ success: true }));

      const startTime = Date.now();

      await HighlightStorageGateway.clearHighlights(testUrl);

      const duration = Date.now() - startTime;
      // 確保操作在合理時間內完成（異步環境下通常遠小於 100ms）
      expect(duration).toBeLessThan(100);
    });
  });
});
