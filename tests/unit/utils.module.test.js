/**
 * utils.js 模組測試（使用可導出版本）
 * 測試真實的 utils.js 代碼並追蹤覆蓋率
 */

const { normalizeUrl, StorageUtil, Logger } = require('../helpers/utils.testable');

describe('utils.js - 模組測試', () => {
  let originalGet, originalSet, originalRemove, originalStorage;
  let mockLocalStorage;

  beforeEach(() => {
    // 保存原始 chrome.storage（以防被刪除）
    originalStorage = global.chrome.storage;
    
    // 確保 chrome.storage 存在
    if (!global.chrome.storage) {
      global.chrome.storage = { 
        local: { 
          get: jest.fn(), 
          set: jest.fn(), 
          remove: jest.fn() 
        } 
      };
    }
    
    // 保存原始方法
    originalGet = chrome.storage.local.get;
    originalSet = chrome.storage.local.set;
    originalRemove = chrome.storage.local.remove;

    // 重置 mocks
    jest.clearAllMocks();
    
    // 清理存儲
    if (global.chrome && global.chrome._clearStorage) {
      global.chrome._clearStorage();
    }
    if (global.localStorage && global.localStorage._reset) {
      global.localStorage._reset();
    }

    // 替換 localStorage 為完全可控的 mock
    mockLocalStorage = {
      data: {},
      setItem: jest.fn((key, value) => {
        mockLocalStorage.data[key] = value;
      }),
      getItem: jest.fn((key) => {
        return mockLocalStorage.data[key] || null;
      }),
      removeItem: jest.fn((key) => {
        delete mockLocalStorage.data[key];
      }),
      clear: jest.fn(() => {
        mockLocalStorage.data = {};
      })
    };
    global.localStorage = mockLocalStorage;
  });

  afterEach(() => {
    // 恢復 chrome.storage（以防被刪除）
    if (originalStorage) {
      global.chrome.storage = originalStorage;
    }
    
    // 恢復原始方法
    if (chrome.storage && chrome.storage.local) {
      if (originalGet) chrome.storage.local.get = originalGet;
      if (originalSet) chrome.storage.local.set = originalSet;
      if (originalRemove) chrome.storage.local.remove = originalRemove;
    }
    
    // 清除錯誤狀態
    chrome.runtime.lastError = null;
    
    // 不使用 jest.restoreAllMocks()，因為我們手動管理 localStorage mock
  });

  describe('normalizeUrl', () => {
    test('應該移除 hash 片段', () => {
      const result = normalizeUrl('https://example.com/page#section');
      expect(result).toBe('https://example.com/page');
    });

    test('應該移除 UTM 追蹤參數', () => {
      const result = normalizeUrl('https://example.com/page?utm_source=google&id=123');
      expect(result).toBe('https://example.com/page?id=123');
    });

    test('應該移除多個追蹤參數', () => {
      const result = normalizeUrl('https://example.com/page?utm_source=fb&utm_medium=cpc&fbclid=xyz&id=123');
      expect(result).toBe('https://example.com/page?id=123');
    });

    test('應該移除尾部斜杠', () => {
      const result = normalizeUrl('https://example.com/page/');
      expect(result).toBe('https://example.com/page');
    });

    test('應該保留根路徑的斜杠', () => {
      const result = normalizeUrl('https://example.com/');
      expect(result).toBe('https://example.com/');
    });

    test('應該處理無效 URL', () => {
      const result = normalizeUrl('not-a-url');
      expect(result).toBe('not-a-url');
    });

    test('應該處理複雜的真實世界 URL', () => {
      const result = normalizeUrl('https://example.com/article?utm_source=twitter&utm_campaign=2024#comments');
      expect(result).toBe('https://example.com/article');
    });
  });

  describe('StorageUtil.saveHighlights', () => {
    test('應該保存標註數據', async () => {
      const url = 'https://example.com/page';
      const highlights = [{ text: 'test 1' }, { text: 'test 2' }];

      await StorageUtil.saveHighlights(url, highlights);

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const storage = chrome._getStorage();
      expect(storage['highlights_https://example.com/page']).toEqual(highlights);
    });

    test('應該標準化 URL 作為鍵', async () => {
      const url = 'https://example.com/page?utm_source=test#section';
      const highlights = [{ text: 'test' }];

      await StorageUtil.saveHighlights(url, highlights);

      const storage = chrome._getStorage();
      expect(storage['highlights_https://example.com/page']).toBeDefined();
    });

    test('應該處理對象格式的數據', async () => {
      const url = 'https://example.com/page';
      const data = {
        url: url,
        highlights: [{ text: 'test' }]
      };

      await StorageUtil.saveHighlights(url, data);

      const storage = chrome._getStorage();
      expect(storage['highlights_https://example.com/page']).toEqual(data);
    });

    test('應該在 chrome.storage 失敗時回退到 localStorage', async () => {
      const url = 'https://example.com/page';
      const highlights = [{ text: 'test' }];

      // 模擬 chrome.storage 錯誤
      chrome.storage.local.set = jest.fn((items, callback) => {
        chrome.runtime.lastError = { message: 'Quota exceeded' };
        setTimeout(() => callback(), 0);  // 確保 lastError 設置後才調用 callback
      });

      await StorageUtil.saveHighlights(url, highlights);

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    test('應該處理 localStorage 保存失敗', async () => {
      const url = 'https://example.com/page';
      const highlights = [{ text: 'test' }];

      // 模擬兩種儲存都失敗
      chrome.storage.local.set = jest.fn((items, callback) => {
        chrome.runtime.lastError = { message: 'Storage error' };
        callback();
      });

      localStorage.setItem = jest.fn(() => {
        throw new Error('localStorage full');
      });

      await expect(StorageUtil.saveHighlights(url, highlights)).rejects.toThrow();
    });

    test('應該處理空數組', async () => {
      const url = 'https://example.com/page';
      const highlights = [];

      await StorageUtil.saveHighlights(url, highlights);

      const storage = chrome._getStorage();
      expect(storage['highlights_https://example.com/page']).toEqual([]);
    });

    test('應該計算對象格式的標註數量', async () => {
      const url = 'https://example.com/page';
      const data = {
        url: url,
        highlights: [{ text: '1' }, { text: '2' }, { text: '3' }]
      };

      await StorageUtil.saveHighlights(url, data);

      // 驗證日誌調用（應該顯示正確的數量）
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('保存 3 個標註到鍵:'),
        expect.any(String)
      );
    });
  });

  describe('StorageUtil.loadHighlights', () => {
    test('應該加載數組格式的標註', async () => {
      const url = 'https://example.com/page';
      const highlights = [{ text: 'test 1' }, { text: 'test 2' }];

      await chrome.storage.local.set({
        'highlights_https://example.com/page': highlights
      });

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual(highlights);
    });

    test('應該加載對象格式的標註', async () => {
      const url = 'https://example.com/page';
      const data = {
        url: url,
        highlights: [{ text: 'test 1' }]
      };

      await chrome.storage.local.set({
        'highlights_https://example.com/page': data
      });

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual(data.highlights);
    });

    test('應該處理不存在的數據', async () => {
      const result = await StorageUtil.loadHighlights('https://nonexistent.com');
      expect(result).toEqual([]);
    });

    test('應該從 localStorage 回退', async () => {
      const url = 'https://example.com/page';
      const highlights = [{ text: 'legacy' }];

      const key = 'highlights_https://example.com/page';
      global.localStorage.setItem(key, JSON.stringify(highlights));

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual(highlights);
    });

    test('應該處理 localStorage 中的對象格式', async () => {
      const url = 'https://example.com/page';
      const data = {
        url: url,
        highlights: [{ text: 'legacy' }]
      };

      const key = 'highlights_https://example.com/page';
      global.localStorage.setItem(key, JSON.stringify(data));

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual(data.highlights);
    });

    test('應該處理損壞的 JSON 數據', async () => {
      const url = 'https://example.com/page';

      localStorage.setItem(
        'highlights_https://example.com/page',
        'invalid json {'
      );

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual([]);
    });

    test('應該處理空對象', async () => {
      const url = 'https://example.com/page';

      await chrome.storage.local.set({
        'highlights_https://example.com/page': {}
      });

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual([]);
    });

    test('應該處理空數組', async () => {
      const url = 'https://example.com/page';

      await chrome.storage.local.set({
        'highlights_https://example.com/page': []
      });

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual([]);
    });

    test('應該在 chrome.storage 不可用時回退到 localStorage', async () => {
      const url = 'https://example.com/page';
      const highlights = [{ text: 'fallback' }];

      // 模擬 chrome.storage 拋出異常
      chrome.storage.local.get = jest.fn(() => {
        throw new Error('Chrome storage unavailable');
      });

      const key = 'highlights_https://example.com/page';
      global.localStorage.setItem(key, JSON.stringify(highlights));

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual(highlights);
    });
  });

  describe('StorageUtil.clearHighlights', () => {
    test('應該清除標註數據', async () => {
      const url = 'https://example.com/page';
      
      await chrome.storage.local.set({
        'highlights_https://example.com/page': [{ text: 'test' }]
      });

      await StorageUtil.clearHighlights(url);

      expect(chrome.storage.local.remove).toHaveBeenCalled();
    });

    test('應該同時清除 localStorage', async () => {
      const url = 'https://example.com/page';
      
      const key = 'highlights_https://example.com/page';
      global.localStorage.setItem(key, JSON.stringify([{ text: 'test' }]));

      await StorageUtil.clearHighlights(url);

      expect(removeItemSpy).toHaveBeenCalled();
    });

    test('應該處理 chrome.storage 錯誤', async () => {
      const url = 'https://example.com/page';

      chrome.storage.local.remove = jest.fn((keys, callback) => {
        chrome.runtime.lastError = { message: 'Remove error' };
        callback();
      });

      await StorageUtil.clearHighlights(url);

      // 應該仍然完成，不拋出錯誤
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });

    test('應該處理 chrome.storage 不可用的情況', async () => {
      const url = 'https://example.com/page';

      chrome.storage.local.remove = jest.fn(() => {
        throw new Error('Chrome storage unavailable');
      });

      const key = 'highlights_https://example.com/page';
      global.localStorage.setItem(key, JSON.stringify([{ text: 'test' }]));

      await StorageUtil.clearHighlights(url);

      expect(removeItemSpy).toHaveBeenCalled();
    });
  });

  describe('StorageUtil.debugListAllKeys', () => {
    test('應該列出所有標註鍵', async () => {
      await chrome.storage.local.set({
        'highlights_https://example.com/page1': [{ text: 'a' }],
        'highlights_https://example.com/page2': [{ text: 'b' }, { text: 'c' }],
        'other_key': 'value'
      });

      const keys = await StorageUtil.debugListAllKeys();

      expect(keys).toHaveLength(2);
      expect(keys).toContain('highlights_https://example.com/page1');
      expect(keys).toContain('highlights_https://example.com/page2');
      expect(keys).not.toContain('other_key');
    });

    test('應該處理空存儲', async () => {
      const keys = await StorageUtil.debugListAllKeys();

      expect(keys).toEqual([]);
    });

    test('應該顯示對象格式的標註數量', async () => {
      await chrome.storage.local.set({
        'highlights_https://example.com/page': {
          url: 'https://example.com/page',
          highlights: [{ text: 'a' }, { text: 'b' }]
        }
      });

      const keys = await StorageUtil.debugListAllKeys();

      expect(keys).toHaveLength(1);
      // 第二次調用應該顯示數量和 URL
      const calls = console.log.mock.calls;
      const logLine = calls.find(call => 
        call[0] && call[0].includes('2 個標註')
      );
      expect(logLine).toBeDefined();
    });
  });

  describe('Logger', () => {
    test('應該有 debug 方法', () => {
      Logger.debug('Test message', 'arg1');
      expect(console.log).toHaveBeenCalledWith('[DEBUG] Test message', 'arg1');
    });

    test('應該有 info 方法', () => {
      Logger.info('Info message');
      expect(console.log).toHaveBeenCalledWith('[INFO] Info message');
    });

    test('應該有 warn 方法', () => {
      Logger.warn('Warning message');
      expect(console.warn).toHaveBeenCalledWith('[WARN] Warning message');
    });

    test('應該有 error 方法', () => {
      Logger.error('Error message');
      expect(console.error).toHaveBeenCalledWith('[ERROR] Error message');
    });

    test('debug 應該支持多個參數', () => {
      Logger.debug('Message', 'arg1', 'arg2', 123);
      expect(console.log).toHaveBeenCalledWith('[DEBUG] Message', 'arg1', 'arg2', 123);
    });

    test('info 應該支持對象參數', () => {
      const obj = { key: 'value' };
      Logger.info('Object:', obj);
      expect(console.log).toHaveBeenCalledWith('[INFO] Object:', obj);
    });

    test('warn 應該支持錯誤對象', () => {
      const error = new Error('test');
      Logger.warn('Warning:', error);
      expect(console.warn).toHaveBeenCalledWith('[WARN] Warning:', error);
    });

    test('error 應該支持堆棧追蹤', () => {
      const error = new Error('Fatal');
      Logger.error('Critical:', error);
      expect(console.error).toHaveBeenCalledWith('[ERROR] Critical:', error);
    });
  });

  describe('StorageUtil - 錯誤處理補充', () => {
    test('saveHighlights 應該處理 localStorage.setItem 拋出異常', async () => {
      // 模擬 chrome.storage 失敗
      chrome.runtime.lastError = { message: 'Storage error' };
      
      // 模擬 localStorage 拋出 QuotaExceededError
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      localStorage.setItem = jest.fn(() => {
        throw quotaError;
      });

      const url = 'https://example.com/page';
      const highlights = [{ text: 'test' }];

      await expect(StorageUtil.saveHighlights(url, highlights)).rejects.toThrow('QuotaExceededError');
    });

    test('loadHighlights 應該處理 localStorage 損壞的 JSON', async () => {
      const url = 'https://example.com/page';
      
      // 模擬 chrome.storage 返回空
      chrome.storage.local.get = jest.fn((key, callback) => {
        callback({});
      });
      
      // 模擬 localStorage 有損壞數據
      localStorage.getItem = jest.fn((key) => {
        if (key === 'highlights_https://example.com/page') {
          return '{"invalid": json}';
        }
        return null;
      });

      const result = await StorageUtil.loadHighlights(url);
      expect(result).toEqual([]);
    });

    test('clearHighlights 應該處理 localStorage.removeItem 異常', async () => {
      const url = 'https://example.com/page';
      
      // chrome.storage 成功
      chrome.storage.local.remove = jest.fn((key, callback) => {
        callback();
      });
      
      // localStorage.removeItem 失敗
      const removeError = new Error('Permission denied');
      localStorage.removeItem = jest.fn(() => {
        throw removeError;
      });

      // 應該靜默處理錯誤
      await expect(StorageUtil.clearHighlights(url)).resolves.toBeUndefined();
    });

    test('clearHighlights 應該在 chrome.storage 不可用時處理 localStorage 錯誤', async () => {
      const url = 'https://example.com/page';
      
      // 保存原始 chrome.storage
      const originalStorage = global.chrome.storage;
      
      try {
        // 模擬 chrome.storage 不可用
        delete global.chrome.storage;
        
        // localStorage 失敗
        const originalRemoveItem = localStorage.removeItem;
        localStorage.removeItem = jest.fn(() => {
          throw new Error('Storage error');
        });

        // 應該靜默處理錯誤（不拋出）
        await StorageUtil.clearHighlights(url);
        
        // 測試通過：沒有拋出錯誤
        expect(true).toBe(true);
        
        // 恢復 localStorage
        localStorage.removeItem = originalRemoveItem;
      } finally {
        // 確保恢復 chrome.storage
        global.chrome.storage = originalStorage;
      }
    });

    test('debugListAllKeys 應該處理空存儲', async () => {
      chrome.storage.local.get = jest.fn((keys, callback) => {
        callback({});
      });

      const result = await StorageUtil.debugListAllKeys();
      expect(result).toEqual([]);
    });

    test('debugListAllKeys 應該正確處理對象格式的標註', async () => {
      chrome.storage.local.get = jest.fn((keys, callback) => {
        callback({
          'highlights_https://example.com': {
            highlights: [{ text: 'a' }, { text: 'b' }]
          }
        });
      });

      const result = await StorageUtil.debugListAllKeys();
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('highlights_https://example.com');
    });
  });

  describe('normalizeUrl - 邊界情況補充', () => {
    test('應該處理只有 hash 的 URL', () => {
      const result = normalizeUrl('https://example.com#only-hash');
      expect(result).toBe('https://example.com/');
    });

    test('應該處理只有追蹤參數的 URL', () => {
      const result = normalizeUrl('https://example.com/?utm_source=test&fbclid=123');
      expect(result).toBe('https://example.com/');
    });

    test('應該處理帶 port 的 URL', () => {
      const result = normalizeUrl('https://example.com:8080/page?utm_source=test');
      expect(result).toBe('https://example.com:8080/page');
    });

    test('應該處理帶用戶信息的 URL', () => {
      const result = normalizeUrl('https://user:pass@example.com/page?utm_source=test');
      expect(result).toBe('https://user:pass@example.com/page');
    });

    test('應該處理沒有路徑只有參數的 URL', () => {
      const result = normalizeUrl('https://example.com?utm_source=test&id=123');
      expect(result).toBe('https://example.com/?id=123');
    });

    test('應該處理空字符串', () => {
      const result = normalizeUrl('');
      expect(result).toBe('');
    });

    test('應該處理相對 URL', () => {
      const result = normalizeUrl('/page?utm_source=test');
      expect(result).toBe('/page?utm_source=test');
    });
  });
});
