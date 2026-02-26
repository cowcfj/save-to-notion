/**
 * Highlighter StorageUtil 擴充測試（白盒測試）
 *
 * 針對 scripts/highlighter/utils/StorageUtil.js 的私有方法和邊緣情況測試
 * 補充現有 storageUtil.test.js 的覆蓋率
 *
 * ⚠️ 測試策略說明：
 * 此文件直接測試「私有」方法（以 _ 前綴命名），這違反了傳統的黑盒測試原則。
 * 但考慮到以下因素，這是一個有意的權衡：
 * 1. JavaScript 沒有真正的私有方法，這些方法實際上是公開可訪問的
 * 2. 這些方法包含關鍵的存儲邏輯，需要確保其正確性
 * 3. 通過公共 API 測試所有存儲分支（Chrome Storage、localStorage 回退）會更加複雜
 * 4. 這是專門用於提高覆蓋率的擴充測試文件
 *
 * 如果重構 StorageUtil 的內部實現，這些測試可能需要更新。
 *
 * skipcq: JS-0255 - Chrome API callback 非 Node.js error-first 模式
 */

import { StorageUtil } from '../../../../scripts/highlighter/utils/StorageUtil.js';

describe('Highlighter StorageUtil', () => {
  // Jest beforeEach 模式：變數在 beforeEach 中初始化
  /** @type {object} */
  let mockChrome; // skipcq: JS-0119

  beforeEach(() => {
    // Mock Chrome Storage API
    mockChrome = {
      storage: {
        local: {
          set: jest.fn((data, callback) => {
            setTimeout(() => {
              if (callback) {
                callback(); // skipcq: JS-0255
              }
            }, 0);
          }),
          get: jest.fn((keys, callback) => {
            setTimeout(() => {
              if (callback) {
                callback({}); // skipcq: JS-0255
              }
            }, 0);
          }),
          remove: jest.fn((keys, callback) => {
            setTimeout(() => {
              if (callback) {
                callback(); // skipcq: JS-0255
              }
            }, 0);
          }),
        },
      },
      runtime: {
        lastError: null,
      },
    };
    globalThis.chrome = mockChrome;

    // Mock localStorage
    const localStorageData = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: jest.fn(key => localStorageData[key] || null),
        setItem: jest.fn((key, value) => {
          localStorageData[key] = value;
        }),
        removeItem: jest.fn(key => {
          delete localStorageData[key];
        }),
        clear: jest.fn(() => {
          Object.keys(localStorageData).forEach(key => delete localStorageData[key]);
        }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveHighlights', () => {
    test.each([
      ['空字串', ''],
      ['null', null],
    ])('無效的 pageUrl (%s) 應觸發錯誤', async (description, invalidUrl) => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(StorageUtil.saveHighlights(invalidUrl, { text: 'test' })).rejects.toThrow(
        'Invalid pageUrl'
      );

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('Chrome Storage 失敗時應回退到 localStorage', async () => {
      // 模擬 Chrome Storage 不可用
      mockChrome.storage.local.set = jest.fn((data, callback) => {
        mockChrome.runtime.lastError = { message: 'Storage error' };
        setTimeout(() => {
          if (callback) {
            callback(); // skipcq: JS-0255
          }
        }, 0);
      });

      const testData = [{ text: 'test', color: 'yellow' }];

      await StorageUtil.saveHighlights('https://example.com', testData);

      expect(localStorage.setItem).toHaveBeenCalled();
    });

    test('Chrome Storage local.get 發生 lastError 時應回退到 localStorage', async () => {
      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        mockChrome.runtime.lastError = { message: 'Get error' };
        setTimeout(() => {
          if (callback) {
            callback(); // skipcq: JS-0255
          }
        }, 0);
      });

      const testData = [{ text: 'test', color: 'yellow' }];
      await StorageUtil.saveHighlights('https://example.com', testData);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    test('透過 sendMessage 背景更新失敗時，應記錄警告並回退到直接保存', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const testData = [{ text: 'test', color: 'yellow' }];
      await StorageUtil.saveHighlights('https://example.com', testData);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'UPDATE_HIGHLIGHTS',
        url: 'https://example.com',
        highlights: testData,
      });
      expect(mockChrome.storage.local.set).toHaveBeenCalled(); // 成功回退
      warnSpy.mockRestore();
    });

    test('透過 sendMessage 拋出異常時，應記錄警告並回退到直接保存', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockImplementation(async msg => {
        if (msg?.action === 'UPDATE_HIGHLIGHTS') {
          throw new Error('Background script not running');
        }
        return { success: true };
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const testData = [{ text: 'test', color: 'yellow' }];
      await StorageUtil.saveHighlights('https://example.com', testData);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
      expect(mockChrome.storage.local.set).toHaveBeenCalled(); // 成功回退
      warnSpy.mockRestore();
    });
  });

  describe('loadHighlights', () => {
    test.each([
      ['空字串', ''],
      ['null', null],
    ])('無效的 pageUrl (%s) 應觸發錯誤', async (description, invalidUrl) => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(StorageUtil.loadHighlights(invalidUrl)).rejects.toThrow('Invalid pageUrl');

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('_loadBothFormats 發生 lastError 應該觸發 catch 並嘗試 localStorage 回退', async () => {
      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        mockChrome.runtime.lastError = { message: 'Get error' };
        callback();
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      localStorage.getItem.mockReturnValue(JSON.stringify([{ text: 'legacy highlight' }]));

      const result = await StorageUtil.loadHighlights('https://example.com');
      expect(result).toEqual([{ text: 'legacy highlight' }]);
      warnSpy.mockRestore();
    });

    test('_loadBothFormats 返回兩個 key 都沒有找到 (null)，應該繼續向下而不是直接返回空數組', async () => {
      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        callback({}); // 兩個 key 都沒有
      });
      localStorage.getItem.mockReturnValue(JSON.stringify([{ text: 'legacy highlight' }]));

      const result = await StorageUtil.loadHighlights('https://example.com');
      expect(result).toEqual([{ text: 'legacy highlight' }]); // 確保回推到 localStorage 加載到了資料
    });

    test('localStorage 加載拋出異常應被 catch 並返回空陣列', async () => {
      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        callback({});
      });
      localStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage is disabled');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await StorageUtil.loadHighlights('https://example.com');
      expect(result).toEqual([]);
      errorSpy.mockRestore();
    });
  });

  describe('_saveToChromeStorage', () => {
    test('Chrome Storage 不可用時應拒絕', async () => {
      // 移除 Chrome Storage
      globalThis.chrome = undefined;

      await expect(StorageUtil._saveToChromeStorage('test_key', {})).rejects.toThrow(
        'Chrome storage not available'
      );

      // 恢復
      globalThis.chrome = mockChrome;
    });

    test('lastError 時應拒絕', async () => {
      mockChrome.storage.local.set = jest.fn((data, callback) => {
        mockChrome.runtime.lastError = { message: 'Quota exceeded' };
        setTimeout(() => {
          if (callback) {
            callback(); // skipcq: JS-0255
          }
        }, 0);
      });

      await expect(StorageUtil._saveToChromeStorage('test_key', { data: 'test' })).rejects.toThrow(
        'Quota exceeded'
      );
    });

    test('同步拋出異常應被 catch', async () => {
      mockChrome.storage.local.set = jest.fn(() => {
        throw new Error('Synchronous error');
      });

      await expect(StorageUtil._saveToChromeStorage('test_key', { data: 'test' })).rejects.toThrow(
        'Synchronous error'
      );
    });

    test('成功保存時應解析', async () => {
      await expect(
        StorageUtil._saveToChromeStorage('test_key', { data: 'test' })
      ).resolves.toBeUndefined();
    });
  });

  describe('_loadFromChromeStorage', () => {
    test('Chrome Storage 不可用時應拒絕', async () => {
      globalThis.chrome = undefined;

      await expect(StorageUtil._loadFromChromeStorage('test_key')).rejects.toThrow(
        'Chrome storage not available'
      );

      globalThis.chrome = mockChrome;
    });

    test('成功加載陣列格式應正確解析', async () => {
      const testData = [{ text: 'highlight', color: 'yellow' }];

      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        setTimeout(() => callback({ [keys[0]]: testData }), 0); // skipcq: JS-0255
      });

      const result = await StorageUtil._loadFromChromeStorage('test_key');

      expect(result).toEqual(testData);
    });

    test('成功加載對象格式應正確解析', async () => {
      const testData = {
        url: 'https://example.com',
        highlights: [{ text: 'highlight', color: 'yellow' }],
      };

      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        setTimeout(() => callback({ [keys[0]]: testData }), 0); // skipcq: JS-0255
      });

      const result = await StorageUtil._loadFromChromeStorage('test_key');

      expect(result).toEqual(testData.highlights);
    });

    test('同步拋出異常應被 catch', async () => {
      mockChrome.storage.local.get = jest.fn(() => {
        throw new Error('Sync load error');
      });

      await expect(StorageUtil._loadFromChromeStorage('test_key')).rejects.toThrow(
        'Sync load error'
      );
    });
  });

  describe('_saveToLocalStorage', () => {
    test('成功保存應解析', async () => {
      await expect(
        StorageUtil._saveToLocalStorage('test_key', { data: 'test' })
      ).resolves.toBeUndefined();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'test_key',
        JSON.stringify({ data: 'test' })
      );
    });

    test('localStorage 錯誤應拒絕', async () => {
      localStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });

      await expect(StorageUtil._saveToLocalStorage('test_key', { data: 'test' })).rejects.toThrow(
        'Storage full'
      );
    });
  });

  describe('_loadFromLocalStorage', () => {
    test('空數據應返回空陣列', async () => {
      localStorage.getItem.mockReturnValue(null);

      const result = await StorageUtil._loadFromLocalStorage('test_key');

      expect(result).toEqual([]);
    });

    test('有效 JSON 應正確解析', async () => {
      const testData = [{ text: 'legacy', color: 'green' }];
      localStorage.getItem.mockReturnValue(JSON.stringify(testData));

      const result = await StorageUtil._loadFromLocalStorage('test_key');

      expect(result).toEqual(testData);
    });

    test('無效 JSON 應返回空陣列', async () => {
      localStorage.getItem.mockReturnValue('invalid json {{{');
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await StorageUtil._loadFromLocalStorage('test_key');

      expect(result).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('_parseHighlightFormat', () => {
    test('null 應返回空陣列', () => {
      expect(StorageUtil._parseHighlightFormat(null)).toEqual([]);
    });

    test('undefined 應返回空陣列', () => {
      expect(StorageUtil._parseHighlightFormat()).toEqual([]);
    });

    test('陣列格式應直接返回', () => {
      const input = [{ text: 'test' }];
      expect(StorageUtil._parseHighlightFormat(input)).toEqual(input);
    });

    test('對象格式應提取 highlights 屬性', () => {
      const input = {
        url: 'https://example.com',
        highlights: [{ text: 'test' }],
      };
      expect(StorageUtil._parseHighlightFormat(input)).toEqual(input.highlights);
    });

    test('無效對象應返回空陣列', () => {
      expect(StorageUtil._parseHighlightFormat({ foo: 'bar' })).toEqual([]);
    });
  });

  describe('clearHighlights', () => {
    test('無效的 pageUrl 應拋出錯誤', async () => {
      await expect(StorageUtil.clearHighlights('')).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('null pageUrl 應拋出錯誤', async () => {
      await expect(StorageUtil.clearHighlights(null)).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('成功清除應不拋出錯誤', async () => {
      await expect(StorageUtil.clearHighlights('https://example.com')).resolves.toBeUndefined();
    });

    test('clearPageHighlights 內部 get 發生 lastError 時應被 Promise.allSettled 處理不中斷流程', async () => {
      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        mockChrome.runtime.lastError = { message: 'Clear get error' };
        setTimeout(() => {
          if (callback) {
            callback();
          }
        }, 0);
      });
      await expect(StorageUtil.clearHighlights('https://example.com')).resolves.toBeUndefined();
    });

    test('clearPageHighlights 內部 set 發生 lastError 時應被 Promise.allSettled 處理不中斷流程', async () => {
      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        setTimeout(() => {
          if (callback) {
            callback({ [keys[0]]: { highlights: ['hl'] } });
          }
        }, 0);
      });
      mockChrome.storage.local.set = jest.fn((data, callback) => {
        mockChrome.runtime.lastError = { message: 'Clear set error' };
        setTimeout(() => {
          if (callback) {
            callback();
          }
        }, 0);
      });
      await expect(StorageUtil.clearHighlights('https://example.com')).resolves.toBeUndefined();
    });

    test('透過 sendMessage 背景清除成功時應直接返回', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true });
      await StorageUtil.clearHighlights('https://example.com');

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'CLEAR_HIGHLIGHTS',
        url: 'https://example.com',
      });
      // 確保沒有去跑下面的 fallback 刪除
      expect(mockChrome.storage.local.remove).not.toHaveBeenCalled();
    });

    test('透過 sendMessage 回傳失敗 ({success: false}) 時，應記錄警告並執行回退清除', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await StorageUtil.clearHighlights('https://example.com');

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
      expect(mockChrome.storage.local.remove).toHaveBeenCalled(); // 成功回退
      warnSpy.mockRestore();
    });

    test('透過 sendMessage 拋出異常時，應記錄警告並執行回退清除', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockImplementation(async msg => {
        if (msg?.action === 'CLEAR_HIGHLIGHTS') {
          throw new Error('Extension context invalidated');
        }
        return { success: true };
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await StorageUtil.clearHighlights('https://example.com');

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
      expect(mockChrome.storage.local.remove).toHaveBeenCalled(); // 成功回退
      warnSpy.mockRestore();
    });

    test('如果所選的清除方法全都失敗，應拋出所有存儲清除失敗的錯誤', async () => {
      // 模擬全部失敗：
      // 1. sendMessage 不可用或失敗
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });
      // 2. clearPageHighlights 失敗 (覆蓋 get 造成無法完成) -> 改讓 _clearFromChromeStorage 和 _clearFromLocalStorage 都拋出例外，且確保 _clearFromChromeStorage 拋出的被捕捉。不過因為 get/set 是被 Promise.allSettled 消化不會 reject，真正的 rejection 只會來自下面這兩個方法，但 clearPageHighlights 在 StorageUtil 是被寫為會 await 處理且自身有 try catch，實際上 clearPageHighlights 不太會 reject，只會忽略錯誤。
      // ... 等等，若要 clearPageHighlights 也被視為 rejected，我們只能讓 chrome.storage.local.get 在 new Promise 內拋出 unhandled exception 或是用特定的方法讓其 reject。
      // 但看程式碼，clearPageHighlights 中的 new Promise 在 lastError 時會 reject。
      mockChrome.storage.local.get = jest.fn((keys, callback) => {
        mockChrome.runtime.lastError = { message: 'Clear get error' };
        callback();
      });
      // 3. _clearFromChromeStorage
      mockChrome.storage.local.remove = jest.fn((keys, callback) => {
        mockChrome.runtime.lastError = { message: 'Remove error' };
        callback();
      });
      // 4. _clearFromLocalStorage
      localStorage.removeItem.mockImplementation(() => {
        throw new Error('Local storage remove error');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(StorageUtil.clearHighlights('https://example.com')).rejects.toThrow(
        'Failed to clear highlights from all storage locations'
      );

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('部分存放區清除失敗時，應記錄警告但仍然處理成功', async () => {
      // 只有 local storage 清除失敗
      localStorage.removeItem.mockImplementation(() => {
        throw new Error('Local storage remove error');
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await StorageUtil.clearHighlights('https://example.com');

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('_clearFromChromeStorage', () => {
    test('Chrome Storage 不可用時應拒絕', async () => {
      globalThis.chrome = undefined;

      await expect(StorageUtil._clearFromChromeStorage('test_key')).rejects.toThrow(
        'Chrome storage not available'
      );

      globalThis.chrome = mockChrome;
    });

    test('同步拋出異常應被 catch', async () => {
      mockChrome.storage.local.remove = jest.fn(() => {
        throw new Error('Synchronous load error');
      });

      await expect(StorageUtil._clearFromChromeStorage('test_key')).rejects.toThrow(
        'Synchronous load error'
      );
    });

    test('移除操作發生 lastError 時應被拒絕', async () => {
      mockChrome.storage.local.remove = jest.fn((keys, callback) => {
        mockChrome.runtime.lastError = { message: 'Remove operation failed' };
        callback();
      });

      await expect(StorageUtil._clearFromChromeStorage('test_key')).rejects.toThrow(
        'Chrome storage error: Remove operation failed'
      );
    });

    test('成功清除應解析', async () => {
      await expect(StorageUtil._clearFromChromeStorage('test_key')).resolves.toBeUndefined();

      expect(mockChrome.storage.local.remove).toHaveBeenCalled();
    });
  });

  describe('_clearFromLocalStorage', () => {
    test('成功清除應解析', async () => {
      await expect(StorageUtil._clearFromLocalStorage('test_key')).resolves.toBeUndefined();

      expect(localStorage.removeItem).toHaveBeenCalledWith('test_key');
    });

    test('localStorage 錯誤應拒絕', async () => {
      localStorage.removeItem.mockImplementation(() => {
        throw new Error('Cannot remove');
      });

      await expect(StorageUtil._clearFromLocalStorage('test_key')).rejects.toThrow('Cannot remove');
    });
  });
});
