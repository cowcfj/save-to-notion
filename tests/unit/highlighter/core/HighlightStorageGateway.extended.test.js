/**
 * Highlighter StorageUtil 擴充測試（白盒測試）
 *
 * 針對 scripts/highlighter/core/HighlightStorageGateway.js 的私有方法和邊緣情況測試
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

import { HighlightStorageGateway } from '../../../../scripts/highlighter/core/HighlightStorageGateway.js';
import {
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../../../scripts/config/storageKeys.js';
import Logger from '../../../../scripts/utils/Logger.js';
import { sanitizeUrlForLogging } from '../../../../scripts/utils/securityUtils.js';
import { normalizeUrl } from '../../../../scripts/utils/urlUtils.js';

describe('Highlighter HighlightStorageGateway', () => {
  // Jest beforeEach 模式：變數在 beforeEach 中初始化
  /** @type {object} */
  let mockChrome; // skipcq: JS-0119

  beforeEach(() => {
    // Mock Chrome Storage API
    mockChrome = {
      storage: {
        local: {
          set: jest.fn().mockResolvedValue(undefined),
          get: jest.fn().mockResolvedValue({}),
          remove: jest.fn().mockResolvedValue(undefined),
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
    delete globalThis.chrome;
  });

  describe('saveHighlights', () => {
    const collectUpdateHighlightCalls = sendMessageMock => {
      return sendMessageMock.mock.calls.filter(([payload]) => {
        return payload?.action === 'UPDATE_HIGHLIGHTS';
      });
    };

    test.each([
      ['空字串', ''],
      ['null', null],
    ])('無效的 pageUrl (%s) 應觸發錯誤', async (description, invalidUrl) => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        HighlightStorageGateway.saveHighlights(invalidUrl, { text: 'test' })
      ).rejects.toThrow('Invalid pageUrl');

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('Chrome Storage 失敗時應回退到 localStorage', async () => {
      // 模擬 Chrome Storage set 以 rejected Promise 方式失敗
      mockChrome.storage.local.set = jest.fn().mockRejectedValue(new Error('Storage error'));

      const testData = [{ text: 'test', color: 'yellow' }];

      await HighlightStorageGateway.saveHighlights('https://example.com', testData);

      expect(localStorage.setItem).toHaveBeenCalled();
    });

    test('Chrome Storage local.get 發生錯誤時應回退到 localStorage', async () => {
      // 模擬 Chrome Storage get 以 rejected Promise 方式失敗
      mockChrome.storage.local.get = jest.fn().mockRejectedValue(new Error('Get error'));

      const testData = [{ text: 'test', color: 'yellow' }];
      await HighlightStorageGateway.saveHighlights('https://example.com', testData);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    test('透過 sendMessage 背景更新失敗時，應記錄警告並回退到直接保存', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const testData = [{ text: 'test', color: 'yellow' }];
      await HighlightStorageGateway.saveHighlights('https://example.com', testData);

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
      await HighlightStorageGateway.saveHighlights('https://example.com', testData);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
      expect(mockChrome.storage.local.set).toHaveBeenCalled(); // 成功回退
      warnSpy.mockRestore();
    });

    test('sendMessage 連續失敗時，應最多嘗試 3 次後回退儲存', async () => {
      jest.useFakeTimers();
      try {
        mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });
        mockChrome.storage.local.get = jest.fn().mockResolvedValue({});
        mockChrome.storage.local.set = jest.fn().mockResolvedValue(undefined);

        const testData = [{ text: 'retry-fail', color: 'yellow' }];
        const savePromise = HighlightStorageGateway.saveHighlights('https://example.com', testData);

        await Promise.resolve();
        expect(collectUpdateHighlightCalls(mockChrome.runtime.sendMessage)).toHaveLength(1);

        await jest.advanceTimersByTimeAsync(500);
        await Promise.resolve();
        expect(collectUpdateHighlightCalls(mockChrome.runtime.sendMessage)).toHaveLength(2);

        await jest.advanceTimersByTimeAsync(500);
        await savePromise;

        expect(collectUpdateHighlightCalls(mockChrome.runtime.sendMessage)).toHaveLength(3);
        expect(mockChrome.storage.local.set).toHaveBeenCalled();
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    test('第 2 次 sendMessage 成功時，應停止重試且不觸發 fallback', async () => {
      jest.useFakeTimers();
      try {
        let updateAttempt = 0;
        mockChrome.runtime.sendMessage = jest.fn().mockImplementation(async payload => {
          if (payload?.action === 'UPDATE_HIGHLIGHTS') {
            updateAttempt += 1;
            return { success: updateAttempt >= 2 };
          }
          return { success: true };
        });
        mockChrome.storage.local.get = jest.fn().mockResolvedValue({});
        mockChrome.storage.local.set = jest.fn().mockResolvedValue(undefined);

        const testData = [{ text: 'retry-success', color: 'green' }];
        const savePromise = HighlightStorageGateway.saveHighlights('https://example.com', testData);

        await Promise.resolve();
        expect(collectUpdateHighlightCalls(mockChrome.runtime.sendMessage)).toHaveLength(1);

        await jest.advanceTimersByTimeAsync(500);
        await savePromise;

        expect(collectUpdateHighlightCalls(mockChrome.runtime.sendMessage)).toHaveLength(2);
        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    test('第 1 次 sendMessage 成功時，應立即返回且不等待重試', async () => {
      jest.useFakeTimers();
      try {
        mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true });
        mockChrome.storage.local.set = jest.fn().mockResolvedValue(undefined);

        const testData = [{ text: 'first-success', color: 'blue' }];
        await HighlightStorageGateway.saveHighlights('https://example.com', testData);

        const updateCalls = collectUpdateHighlightCalls(mockChrome.runtime.sendMessage);
        expect(updateCalls).toHaveLength(1);
        expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    test('sendMessage 不可用時，若 storage 與 localStorage 均失敗應拋出異常', async () => {
      jest.useFakeTimers();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      try {
        delete mockChrome.runtime.sendMessage;
        mockChrome.storage.local.get = jest.fn().mockResolvedValue({});
        mockChrome.storage.local.set = jest.fn().mockRejectedValue(new Error('Storage set failed'));
        globalThis.localStorage.setItem = jest.fn(() => {
          throw new Error('Local error');
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();

        const testData = [{ text: 'fail-all', color: 'yellow' }];
        await expect(
          HighlightStorageGateway.saveHighlights('https://example.com', testData)
        ).rejects.toThrow('Local error');

        expect(errorSpy).toHaveBeenCalledWith(
          '[ERROR] ❌',
          '保存標註失敗（Chrome 與本地執行失敗）',
          expect.objectContaining({ action: 'saveHighlights' })
        );
        errorSpy.mockRestore();
      } finally {
        warnSpy.mockRestore();
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    test('sendMessage 不可用時，不應等待重試延遲且應直接走 fallback 儲存', async () => {
      jest.useFakeTimers();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      try {
        delete mockChrome.runtime.sendMessage;
        mockChrome.storage.local.get = jest.fn().mockResolvedValue({});
        mockChrome.storage.local.set = jest.fn().mockResolvedValue(undefined);

        const baselineTimerCount = jest.getTimerCount();
        const testData = [{ text: 'no-sendMessage', color: 'yellow' }];
        await HighlightStorageGateway.saveHighlights('https://example.com', testData);

        expect(mockChrome.storage.local.set).toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(baselineTimerCount);

        const retryWarnCalls = warnSpy.mock.calls.filter(([message]) => {
          return typeof message === 'string' && message.includes('嘗試重試');
        });
        expect(retryWarnCalls).toHaveLength(0);
      } finally {
        warnSpy.mockRestore();
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    test('fallback 直接保存時應優先使用 alias 對應的 stable page key', async () => {
      delete mockChrome.runtime.sendMessage;

      const pageUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';
      const normalizedUrl = pageUrl;
      const aliasKey = `${URL_ALIAS_PREFIX}${normalizedUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const testData = [{ text: 'alias-target', color: 'yellow' }];

      mockChrome.storage.local.get = jest.fn().mockImplementation(keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];

        if (keyList.length === 1 && keyList[0] === aliasKey) {
          return Promise.resolve({ [aliasKey]: stableUrl });
        }

        if (keyList.length === 1 && keyList[0] === stablePageKey) {
          return Promise.resolve({
            [stablePageKey]: {
              notion: { pageId: 'page-123' },
              highlights: [{ text: 'old' }],
              metadata: { createdAt: 123 },
            },
          });
        }

        return Promise.resolve({});
      });

      await HighlightStorageGateway.saveHighlights(pageUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [stablePageKey]: {
          notion: { pageId: 'page-123' },
          highlights: testData,
          metadata: expect.objectContaining({
            createdAt: 123,
            lastUpdated: expect.any(Number),
          }),
        },
      });
    });
  });

  describe('loadHighlights', () => {
    test('_loadBothFormats 返回 legacy key data', async () => {
      mockChrome.storage.local.get = jest.fn().mockResolvedValue({
        'highlights_https://example.com': [{ text: 'legacy match' }],
      });
      const data = await HighlightStorageGateway._loadBothFormats(
        'https://example.com',
        'https://example.com',
        'highlights_https://example.com'
      );
      expect(data).toEqual([{ text: 'legacy match' }]);
    });

    test('_loadBothFormats Chrome Storage 不可用應拋出錯誤', async () => {
      const originalChrome = globalThis.chrome;
      globalThis.chrome = undefined;
      await expect(
        HighlightStorageGateway._loadBothFormats(
          'https://example.com',
          'https://example.com',
          'legacyKey'
        )
      ).rejects.toThrow('Chrome storage not available');
      globalThis.chrome = originalChrome;
    });

    test('_resolveStableUrl Chrome Storage 不可用應返回 normalizedUrl', async () => {
      const originalChrome = globalThis.chrome;
      globalThis.chrome = undefined;
      const url = await HighlightStorageGateway._resolveStableUrl('https://example.com');
      expect(url).toBe(normalizeUrl('https://example.com'));
      globalThis.chrome = originalChrome;
    });

    test.each([
      ['空字串', ''],
      ['null', null],
    ])('無效的 pageUrl (%s) 應觸發錯誤', async (description, invalidUrl) => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(HighlightStorageGateway.loadHighlights(invalidUrl)).rejects.toThrow(
        'Invalid pageUrl'
      );

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('_loadBothFormats 發生 lastError 應該觸發 catch 並嘗試 localStorage 回退', async () => {
      mockChrome.storage.local.get = jest.fn().mockRejectedValue(new Error('Get error'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      localStorage.getItem.mockReturnValue(JSON.stringify([{ text: 'legacy highlight' }]));

      const result = await HighlightStorageGateway.loadHighlights('https://example.com');
      expect(result).toEqual([{ text: 'legacy highlight' }]);
      warnSpy.mockRestore();
    });

    test('_loadBothFormats 返回兩個 key 都沒有找到 (null)，應該繼續向下而不是直接返回空數組', async () => {
      mockChrome.storage.local.get = jest.fn().mockResolvedValue({});
      localStorage.getItem.mockReturnValue(JSON.stringify([{ text: 'legacy highlight' }]));

      const result = await HighlightStorageGateway.loadHighlights('https://example.com');
      expect(result).toEqual([{ text: 'legacy highlight' }]); // 確保回推到 localStorage 加載到了資料
    });

    test('localStorage 加載拋出異常應被 catch 並返回空陣列', async () => {
      mockChrome.storage.local.get = jest.fn().mockResolvedValue({});
      localStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage is disabled');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await HighlightStorageGateway.loadHighlights('https://example.com');
      expect(result).toEqual([]);
      errorSpy.mockRestore();
    });

    test('存在 alias 時應從 stable page key 讀取 highlights', async () => {
      const pageUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';
      const aliasKey = `${URL_ALIAS_PREFIX}${pageUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;

      mockChrome.storage.local.get = jest.fn().mockImplementation(keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];

        if (keyList.length === 1 && keyList[0] === aliasKey) {
          return Promise.resolve({ [aliasKey]: stableUrl });
        }

        if (keyList.includes(stablePageKey)) {
          return Promise.resolve({
            [stablePageKey]: {
              notion: { pageId: 'page-123' },
              highlights: [{ text: 'stable highlight' }],
              metadata: { lastUpdated: 123 },
            },
          });
        }

        return Promise.resolve({});
      });

      const result = await HighlightStorageGateway.loadHighlights(pageUrl);

      expect(result).toEqual([{ text: 'stable highlight' }]);
    });

    test('存在舊格式 originalUrl alias key 時仍應能解析 stable page key', async () => {
      const pageUrl = 'https://example.com/original/?utm_source=fb#frag';
      const normalizedUrl = normalizeUrl(pageUrl);
      const stableUrl = 'https://example.com/stable';
      const legacyAliasKey = `${URL_ALIAS_PREFIX}${pageUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;

      mockChrome.storage.local.get = jest.fn().mockImplementation(keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];

        if (
          keyList.includes(`${URL_ALIAS_PREFIX}${normalizedUrl}`) &&
          keyList.includes(legacyAliasKey)
        ) {
          return Promise.resolve({ [legacyAliasKey]: stableUrl });
        }

        if (keyList.includes(stablePageKey)) {
          return Promise.resolve({
            [stablePageKey]: {
              highlights: [{ text: 'legacy alias highlight' }],
            },
          });
        }

        return Promise.resolve({});
      });

      const result = await HighlightStorageGateway.loadHighlights(pageUrl);

      expect(result).toEqual([{ text: 'legacy alias highlight' }]);
    });
  });

  describe('_saveToChromeStorage', () => {
    test('Chrome Storage 不可用時應拒絕', async () => {
      // 移除 Chrome Storage
      globalThis.chrome = undefined;

      await expect(HighlightStorageGateway._saveToChromeStorage('test_key', {})).rejects.toThrow(
        'Chrome storage not available'
      );

      // 恢復
      globalThis.chrome = mockChrome;
    });

    test('Chrome storage set 失敗時應拒絕', async () => {
      // MV3 原生 Promise：直接以 rejected Promise 表示失敗
      mockChrome.storage.local.set = jest.fn().mockRejectedValue(new Error('Quota exceeded'));

      await expect(
        HighlightStorageGateway._saveToChromeStorage('test_key', { data: 'test' })
      ).rejects.toThrow('Quota exceeded');
    });

    test('同步拋出異常應被 catch', async () => {
      mockChrome.storage.local.set = jest.fn(() => {
        throw new Error('Synchronous error');
      });

      await expect(
        HighlightStorageGateway._saveToChromeStorage('test_key', { data: 'test' })
      ).rejects.toThrow('Synchronous error');
    });

    test('成功保存時應解析', async () => {
      await expect(
        HighlightStorageGateway._saveToChromeStorage('test_key', { data: 'test' })
      ).resolves.toBeUndefined();
    });
  });

  describe('_saveToLocalStorage', () => {
    test('成功保存應解析', async () => {
      await expect(
        HighlightStorageGateway._saveToLocalStorage('test_key', { data: 'test' })
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

      await expect(
        HighlightStorageGateway._saveToLocalStorage('test_key', { data: 'test' })
      ).rejects.toThrow('Storage full');
    });
  });

  describe('_loadFromLocalStorage', () => {
    test('空數據應返回空陣列', async () => {
      localStorage.getItem.mockReturnValue(null);

      const result = await HighlightStorageGateway._loadFromLocalStorage('test_key');

      expect(result).toEqual([]);
    });

    test('有效 JSON 應正確解析', async () => {
      const testData = [{ text: 'legacy', color: 'green' }];
      localStorage.getItem.mockReturnValue(JSON.stringify(testData));

      const result = await HighlightStorageGateway._loadFromLocalStorage('test_key');

      expect(result).toEqual(testData);
    });

    test('無效 JSON 應返回空陣列', async () => {
      localStorage.getItem.mockReturnValue('invalid json {{{');
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await HighlightStorageGateway._loadFromLocalStorage('test_key');

      expect(result).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('_parseHighlightFormat', () => {
    test('null 應返回空陣列', () => {
      expect(HighlightStorageGateway._parseHighlightFormat(null)).toEqual([]);
    });

    test('undefined 應返回空陣列', () => {
      expect(HighlightStorageGateway._parseHighlightFormat()).toEqual([]);
    });

    test('陣列格式應直接返回', () => {
      const input = [{ text: 'test' }];
      expect(HighlightStorageGateway._parseHighlightFormat(input)).toEqual(input);
    });

    test('對象格式應提取 highlights 屬性', () => {
      const input = {
        url: 'https://example.com',
        highlights: [{ text: 'test' }],
      };
      expect(HighlightStorageGateway._parseHighlightFormat(input)).toEqual(input.highlights);
    });

    test('無效對象應返回空陣列', () => {
      expect(HighlightStorageGateway._parseHighlightFormat({ foo: 'bar' })).toEqual([]);
    });
  });

  describe('clearHighlights', () => {
    test('無效的 pageUrl 應拋出錯誤', async () => {
      await expect(HighlightStorageGateway.clearHighlights('')).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('null pageUrl 應拋出錯誤', async () => {
      await expect(HighlightStorageGateway.clearHighlights(null)).rejects.toThrow(
        'Invalid pageUrl: must be a non-empty string'
      );
    });

    test('成功清除應不拋出錯誤', async () => {
      await expect(
        HighlightStorageGateway.clearHighlights('https://example.com')
      ).resolves.toBeUndefined();
    });

    test('clearPageHighlights 內部 get 發生 lastError 時應被 Promise.allSettled 處理不中斷流程', async () => {
      mockChrome.storage.local.get = jest.fn().mockRejectedValue(new Error('Clear get error'));
      await expect(
        HighlightStorageGateway.clearHighlights('https://example.com')
      ).resolves.toBeUndefined();
    });

    test('clearPageHighlights 內部 set 發生 lastError 時應被 Promise.allSettled 處理不中斷流程', async () => {
      mockChrome.storage.local.get = jest
        .fn()
        .mockResolvedValue({ [`${PAGE_PREFIX}https://example.com`]: { highlights: ['hl'] } });
      mockChrome.storage.local.set = jest.fn().mockRejectedValue(new Error('Clear set error'));
      await expect(
        HighlightStorageGateway.clearHighlights('https://example.com')
      ).resolves.toBeUndefined();
    });

    test('透過 sendMessage 背景清除成功時應直接返回', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true });
      await HighlightStorageGateway.clearHighlights('https://example.com');

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

      await HighlightStorageGateway.clearHighlights('https://example.com');

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

      await HighlightStorageGateway.clearHighlights('https://example.com');

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
      mockChrome.storage.local.get = jest.fn().mockRejectedValue(new Error('Clear get error'));
      // 3. _clearFromChromeStorage
      mockChrome.storage.local.remove = jest.fn().mockRejectedValue(new Error('Remove error'));
      // 4. _clearFromLocalStorage
      localStorage.removeItem.mockImplementation(() => {
        throw new Error('Local storage remove error');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(HighlightStorageGateway.clearHighlights('https://example.com')).rejects.toThrow(
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

      await HighlightStorageGateway.clearHighlights('https://example.com');

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('fallback 清除時應優先更新 alias 對應的 stable page key', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });

      const pageUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';
      const aliasKey = `${URL_ALIAS_PREFIX}${pageUrl}`;
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const legacyKey = `${HIGHLIGHTS_PREFIX}${pageUrl}`;

      mockChrome.storage.local.get = jest.fn().mockImplementation(keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];

        if (keyList.length === 1 && keyList[0] === aliasKey) {
          return Promise.resolve({ [aliasKey]: stableUrl });
        }

        if (keyList.length === 1 && keyList[0] === stablePageKey) {
          return Promise.resolve({
            [stablePageKey]: {
              notion: { pageId: 'page-123' },
              highlights: [{ text: 'keep structure' }],
              metadata: { lastUpdated: 1 },
            },
          });
        }

        return Promise.resolve({});
      });

      await HighlightStorageGateway.clearHighlights(pageUrl);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [stablePageKey]: {
          notion: { pageId: 'page-123' },
          highlights: [],
          metadata: { lastUpdated: 1 },
        },
      });
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([legacyKey]);
    });

    test('fallback 清除時應使用 sanitize 後的 pageKey 記錄 info 日誌', async () => {
      mockChrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });
      const pageUrl = 'https://example.com/path/?utm_source=fb#section';
      const normalizedUrl = normalizeUrl(pageUrl);
      const infoSpy = jest.spyOn(Logger, 'info').mockImplementation();
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();

      await HighlightStorageGateway.clearHighlights(pageUrl);

      expect(infoSpy).toHaveBeenCalledWith('開始清除標註', {
        action: 'clearHighlights',
        pageKey: `${PAGE_PREFIX}${sanitizeUrlForLogging(normalizedUrl)}`,
      });
      expect(logSpy).not.toHaveBeenCalledWith(
        '開始清除標註',
        expect.objectContaining({ action: 'clearHighlights' })
      );

      infoSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('_clearFromChromeStorage', () => {
    test('Chrome Storage 不可用時應拒絕', async () => {
      globalThis.chrome = undefined;

      await expect(HighlightStorageGateway._clearFromChromeStorage('test_key')).rejects.toThrow(
        'Chrome storage not available'
      );

      globalThis.chrome = mockChrome;
    });

    test('同步拋出異常應被 catch', async () => {
      mockChrome.storage.local.remove = jest.fn(() => {
        throw new Error('Synchronous load error');
      });

      await expect(HighlightStorageGateway._clearFromChromeStorage('test_key')).rejects.toThrow(
        'Synchronous load error'
      );
    });

    test('移除操作失敗時應被拒絕', async () => {
      // MV3 原生 Promise：直接以 rejected Promise 表示失敗
      mockChrome.storage.local.remove = jest
        .fn()
        .mockRejectedValue(new Error('Remove operation failed'));

      await expect(HighlightStorageGateway._clearFromChromeStorage('test_key')).rejects.toThrow(
        'Remove operation failed'
      );
    });

    test('成功清除應解析', async () => {
      await expect(
        HighlightStorageGateway._clearFromChromeStorage('test_key')
      ).resolves.toBeUndefined();

      expect(mockChrome.storage.local.remove).toHaveBeenCalled();
    });
  });

  describe('_clearFromLocalStorage', () => {
    test('成功清除應解析', async () => {
      await expect(
        HighlightStorageGateway._clearFromLocalStorage('test_key')
      ).resolves.toBeUndefined();

      expect(localStorage.removeItem).toHaveBeenCalledWith('test_key');
    });

    test('localStorage 錯誤應拒絕', async () => {
      localStorage.removeItem.mockImplementation(() => {
        throw new Error('Cannot remove');
      });

      await expect(HighlightStorageGateway._clearFromLocalStorage('test_key')).rejects.toThrow(
        'Cannot remove'
      );
    });
  });
});
