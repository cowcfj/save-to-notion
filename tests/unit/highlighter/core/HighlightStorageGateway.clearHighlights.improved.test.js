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
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
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
    Logger.success.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    delete globalThis.chrome;
  });

  describe('輸入驗證', () => {
    test('應該拒絕 null 或 undefined 的 URL', async () => {
      await expect(HighlightStorageGateway.clearHighlights(null)).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      await expect(HighlightStorageGateway.clearHighlights()).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );

      expect(Logger.error).toHaveBeenCalled();
    });

    test('應該拒絕空字串 URL', async () => {
      await expect(HighlightStorageGateway.clearHighlights('')).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('應該拒絕非字串類型的 URL', async () => {
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
      const validUrl = 'https://example.com/page';
      await expect(HighlightStorageGateway.clearHighlights(validUrl)).resolves.toBeUndefined();
    });
  });

  describe('並行清除操作', () => {
    test('應該清除 Chrome Storage 和 localStorage（Fallback 路徑）', async () => {
      jest.useFakeTimers();
      const testUrl = 'https://example.com/test';
      // Phase 3 Fallback 路徑：清除 highlights_* 和 page_* keys
      const legacyKey = 'highlights_https://example.com/test';

      await chrome.storage.local.set({ [legacyKey]: [{ text: 'test' }] });
      globalThis.localStorage.setItem(legacyKey, JSON.stringify([{ text: 'test' }]));

      // sendMessage 已在 beforeEach 設為失敗，測試 Fallback 路徑
      const clearPromise = HighlightStorageGateway.clearHighlights(testUrl);
      await jest.runAllTimersAsync();
      await clearPromise;

      // Fallback 路徑會嘗試清理 page_* 和 highlights_* keys
      const removeCall = chrome.storage.local.remove.mock.calls;
      const allRemovedKeys = removeCall.flatMap(call => {
        const keys = call[0];
        return Array.isArray(keys) ? keys : [keys];
      });
      expect(allRemovedKeys).toContain(legacyKey);

      jest.useRealTimers();
    });

    test('sendMessage 回傳 { success: false } 時應同樣觸發 Fallback 清除邏輯', async () => {
      jest.useFakeTimers();
      const testUrl = 'https://example.com/test';
      const legacyKey = 'highlights_https://example.com/test';

      try {
        await chrome.storage.local.set({ [legacyKey]: [{ text: 'test' }] });
        globalThis.localStorage.setItem(legacyKey, JSON.stringify([{ text: 'test' }]));

        // sendMessage resolve { success: false }（非 reject）
        globalThis.chrome.runtime.sendMessage = jest.fn(() => Promise.resolve({ success: false }));

        const clearPromise = HighlightStorageGateway.clearHighlights(testUrl);

        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(1000);
        await clearPromise;

        // Fallback 路徑應仍清理 highlights_* key
        const removeCall = chrome.storage.local.remove.mock.calls;
        const allRemovedKeys = removeCall.flatMap(call => {
          const keys = call[0];
          return Array.isArray(keys) ? keys : [keys];
        });
        expect(allRemovedKeys).toContain(legacyKey);
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    test('應該記錄清除開始', async () => {
      jest.useFakeTimers();
      const testUrl = 'https://example.com/test';

      const clearPromise = HighlightStorageGateway.clearHighlights(testUrl);
      await jest.runAllTimersAsync();
      await clearPromise;

      expect(Logger.info).toHaveBeenCalledWith(
        '開始清除標註',
        expect.objectContaining({ action: 'clearHighlights' })
      );
      jest.useRealTimers();
    });

    test('Fallback 清除成功時應使用 success 等級記錄完成訊息', async () => {
      jest.useFakeTimers();
      const testUrl = 'https://example.com/test';

      const clearPromise = HighlightStorageGateway.clearHighlights(testUrl);
      await jest.runAllTimersAsync();
      await clearPromise;

      expect(Logger.success).toHaveBeenCalledWith('標註清除完成', {
        action: 'clearHighlights',
      });
      expect(Logger.log).not.toHaveBeenCalledWith('標註清除完成', {
        action: 'clearHighlights',
      });
      jest.useRealTimers();
    });
  });

  describe('錯誤處理', () => {
    test('當 Chrome Storage 失敗但 localStorage 成功時應該記錄警告（Fallback 路徑）', async () => {
      jest.useFakeTimers();
      const testUrl = 'https://example.com/test';
      const legacyKey = 'highlights_https://example.com/test';

      // MV3 原生 Promise：直接以 rejected Promise 表示失敗
      chrome.storage.local.remove.mockRejectedValue(new Error('Storage error'));

      globalThis.localStorage.setItem(legacyKey, JSON.stringify([{ text: 'test' }]));

      // sendMessage 已在 beforeEach 設為失敗，走 Fallback 路徑
      const clearPromise = HighlightStorageGateway.clearHighlights(testUrl);
      await jest.runAllTimersAsync();
      await clearPromise;

      expect(Logger.warn).toHaveBeenCalledWith(
        '部分存儲清除失敗',
        expect.objectContaining({ action: 'clearHighlights' })
      );
      jest.useRealTimers();
    });

    test('當 Chrome Storage 不可用時應該只使用 localStorage', async () => {
      jest.useFakeTimers();
      const testUrl = 'https://example.com/test';
      const pageKey = 'highlights_https://example.com/test';

      const originalChrome = globalThis.chrome;
      // sendMessage 不可用，且 storage 也不可用
      globalThis.chrome = {};

      globalThis.localStorage.setItem(pageKey, JSON.stringify([{ text: 'test' }]));

      const clearPromise = HighlightStorageGateway.clearHighlights(testUrl);
      await jest.runAllTimersAsync();
      await clearPromise;

      expect(globalThis.localStorage.getItem(pageKey)).toBeNull();
      expect(Logger.warn).toHaveBeenCalledWith(
        '部分存儲清除失敗',
        expect.objectContaining({ action: 'clearHighlights' })
      );

      globalThis.chrome = originalChrome;
      jest.useRealTimers();
    });
  });

  describe('輔助方法測試', () => {
    describe('_clearFromChromeStorage', () => {
      test('應該成功清除 Chrome Storage', async () => {
        const testKey = 'test_key';

        await chrome.storage.local.set({ [testKey]: 'test_value' });
        await HighlightStorageGateway._clearFromChromeStorage(testKey);

        // MV3 原生 Promise：驗證 remove 被呼叫（不再驗證 callback 品签名）
        expect(chrome.storage.local.remove).toHaveBeenCalledWith([testKey]);
      });

      test('當 Chrome Storage 不可用時應該拋出錯誤', async () => {
        const originalChrome = globalThis.chrome;
        globalThis.chrome = {};

        await expect(HighlightStorageGateway._clearFromChromeStorage('test_key')).rejects.toThrow(
          'Chrome storage not available'
        );

        globalThis.chrome = originalChrome;
      });

      test('當操作失敗時應該拋出包含錯誤信息的錯誤', async () => {
        // MV3 原生 Promise：直接以 rejected Promise 表示失敗
        chrome.storage.local.remove.mockRejectedValue(new Error('Test error'));

        await expect(HighlightStorageGateway._clearFromChromeStorage('test_key')).rejects.toThrow(
          'Test error'
        );
      });
    });

    describe('_clearFromLocalStorage', () => {
      test('應該成功清除 localStorage', async () => {
        const testKey = 'test_key';
        globalThis.localStorage.setItem(testKey, 'test_value');

        await HighlightStorageGateway._clearFromLocalStorage(testKey);

        expect(globalThis.localStorage.getItem(testKey)).toBeNull();
      });

      test('正常操作應該成功完成', async () => {
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
      jest.useFakeTimers();
      const testUrl = 'https://example.com/page?utm_source=test#anchor';
      // sendMessage 已在 beforeEach 設為失敗，測試 Fallback 路徑
      // Fallback 會嘗試對 page_https://example.com/page 和 highlights_https://example.com/page 兩種 keys
      const clearPromise = HighlightStorageGateway.clearHighlights(testUrl);
      await jest.runAllTimersAsync();
      await clearPromise;

      const allRemovedKeys = chrome.storage.local.remove.mock.calls.flatMap(call => {
        const keys = call[0];
        return Array.isArray(keys) ? keys : [keys];
      });
      expect(allRemovedKeys).toContain('highlights_https://example.com/page');
      jest.useRealTimers();
    });

    test('應該與現有代碼保持相同的介面', async () => {
      jest.useFakeTimers();
      const testUrl = 'https://example.com/test';

      const result = HighlightStorageGateway.clearHighlights(testUrl);
      expect(result).toBeInstanceOf(Promise);

      await jest.runAllTimersAsync();
      await expect(result).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('快速路徑驗證', () => {
    test('當 sendMessage 成功時，應正確呼叫 API 且不觸發 fallback', async () => {
      const testUrl = 'https://example.com/test';
      const fallbackSpy = jest.spyOn(HighlightStorageGateway, '_fallbackDirectClear');

      // 確保走正常路徑，避免重試所造成的延遲
      globalThis.chrome.runtime.sendMessage = jest.fn(() => Promise.resolve({ success: true }));

      await HighlightStorageGateway.clearHighlights(testUrl);

      // 驗證正確呼叫了依賴
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'CLEAR_HIGHLIGHTS',
        url: testUrl,
      });

      // 驗證未進入 fallback
      expect(fallbackSpy).not.toHaveBeenCalled();

      fallbackSpy.mockRestore();
    });
  });
});
