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
  });

  describe('_clearFromChromeStorage', () => {
    test('Chrome Storage 不可用時應拒絕', async () => {
      globalThis.chrome = undefined;

      await expect(StorageUtil._clearFromChromeStorage('test_key')).rejects.toThrow(
        'Chrome storage not available'
      );

      globalThis.chrome = mockChrome;
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
