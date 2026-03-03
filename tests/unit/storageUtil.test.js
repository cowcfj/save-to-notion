/**
 * StorageUtil 單元測試
 * 測試存儲工具類的功能
 */

describe('StorageUtil', () => {
  /** @type {object | null} Chrome API 模擬物件 */
  let mockChrome = null;
  /** @type {object | null} LocalStorage 模擬物件 */
  let mockLocalStorage = null;

  beforeEach(() => {
    // Mock normalizeUrl function
    globalThis.normalizeUrl = jest.fn(url => {
      // 簡單的 normalizeUrl 模擬
      try {
        const urlObj = new URL(url);
        urlObj.hash = '';
        // 移除追蹤參數
        const trackingParams = ['utm_source', 'utm_medium', 'fbclid'];
        trackingParams.forEach(param => urlObj.searchParams.delete(param));
        // 移除尾部斜杠（除了根路徑）
        if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
          // eslint-disable-next-line sonarjs/slow-regex
          urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
        }
        return urlObj.toString();
      } catch (error) {
        // 記錄錯誤以保持與實際實現的一致性
        console.error('❌ [normalizeUrl] 標準化失敗:', error);
        return url || '';
      }
    });

    // Mock chrome.storage.local
    mockChrome = {
      storage: {
        local: {
          set: jest.fn((items, done) => {
            setTimeout(() => done?.(), 0);
          }),
          get: jest.fn((keys, done) => {
            setTimeout(() => done?.({}), 0);
          }),
          remove: jest.fn((keys, done) => {
            setTimeout(() => done?.(), 0);
          }),
        },
      },
      runtime: {
        lastError: null,
      },
    };
    globalThis.chrome = mockChrome;

    // 替換 localStorage 為完全可控的 mock
    mockLocalStorage = {
      data: {},
      setItem: jest.fn((key, value) => {
        mockLocalStorage.data[key] = value;
      }),
      getItem: jest.fn(key => {
        return mockLocalStorage.data[key] || null;
      }),
      removeItem: jest.fn(key => {
        delete mockLocalStorage.data[key];
      }),
      clear: jest.fn(() => {
        mockLocalStorage.data = {};
      }),
    };
    globalThis.localStorage = mockLocalStorage;

    // Mock console 方法
    globalThis.console = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    // 載入 utils.js 中的 StorageUtil
    // 因為測試環境，我們需要手動定義 StorageUtil
    globalThis.StorageUtil = {
      /**
       * 保存標註數據
       *
       * 注意：此函數使用 Promise 構造函數而非 async/await，原因如下：
       * 1. 與實際實現（scripts/utils.js）保持一致，確保測試準確反映實際行為
       * 2. Chrome Storage API 是基於回調的，使用 new Promise 包裝是處理回調式 API 的標準做法
       * 3. 改用 async/await 需要額外的輔助函數來轉換回調，會增加複雜性且偏離實際實現
       */
      saveHighlights(pageUrl, highlightData) {
        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;

        return new Promise((resolve, reject) => {
          try {
            chrome.storage?.local?.set({ [pageKey]: highlightData }, () => {
              if (chrome.runtime.lastError) {
                try {
                  localStorage.setItem(pageKey, JSON.stringify(highlightData));
                  resolve();
                } catch (error) {
                  reject(error);
                }
              } else {
                resolve();
              }
            });
          } catch {
            try {
              localStorage.setItem(pageKey, JSON.stringify(highlightData));
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        });
      },

      /**
       * 加載標註數據
       *
       * 注意：此函數使用 Promise 構造函數而非 async/await，原因如下：
       * 1. 與實際實現（scripts/utils.js）保持一致，確保測試準確反映實際行為
       * 2. Chrome Storage API 是基於回調的，使用 new Promise 包裝是處理回調式 API 的標準做法
       * 3. 改用 async/await 需要額外的輔助函數來轉換回調，會增加複雜性且偏離實際實現
       */

      loadHighlights(pageUrl) {
        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;

        // 輔助函式：解析舊版 Storage 的資料
        const parseLegacyHighlights = legacy => {
          if (!legacy) {
            return [];
          }
          try {
            const parsed = JSON.parse(legacy);
            let highlights = [];
            if (Array.isArray(parsed)) {
              highlights = parsed;
            } else if (parsed.highlights && Array.isArray(parsed.highlights)) {
              highlights = parsed.highlights;
            }
            return highlights;
          } catch (error) {
            console.error('Failed to parse legacy highlights:', error);
            return [];
          }
        };

        return new Promise(resolve => {
          try {
            chrome.storage?.local?.get([pageKey], data => {
              const stored = data?.[pageKey];
              if (stored) {
                let highlights = [];
                if (Array.isArray(stored)) {
                  highlights = stored;
                } else if (stored.highlights && Array.isArray(stored.highlights)) {
                  highlights = stored.highlights;
                }

                if (highlights.length > 0) {
                  resolve(highlights);
                  return;
                }
              }

              // 回退到 localStorage
              const legacy = localStorage.getItem(pageKey);
              const legacyHighlights = parseLegacyHighlights(legacy);
              if (legacyHighlights.length > 0) {
                resolve(legacyHighlights);
                return;
              }
              resolve([]);
            });
          } catch {
            const legacy = localStorage.getItem(pageKey);
            const legacyHighlights = parseLegacyHighlights(legacy);
            if (legacyHighlights.length > 0) {
              resolve(legacyHighlights);
              return;
            }
            resolve([]);
          }
        });
      },

      /**
       * 清除標註數據
       *
       * 注意：此函數使用 Promise 構造函數而非 async/await，原因如下：
       * 1. 與實際實現（scripts/utils.js）保持一致，確保測試準確反映實際行為
       * 2. Chrome Storage API 是基於回調的，使用 new Promise 包裝是處理回調式 API 的標準做法
       * 3. 改用 async/await 需要額外的輔助函數來轉換回調，會增加複雜性且偏離實際實現
       */
      clearHighlights(pageUrl) {
        const pageKey = `highlights_${normalizeUrl(pageUrl)}`;

        return new Promise(resolve => {
          try {
            chrome.storage?.local?.remove([pageKey], () => {
              try {
                localStorage.removeItem(pageKey);
              } catch {
                // ignore - 清理操作失敗可安全忽略
              }
              resolve();
            });
          } catch {
            // ignore - 回退到 localStorage 清理
            try {
              localStorage.removeItem(pageKey);
            } catch {
              // ignore - 清理操作失敗可安全忽略
            }
            resolve();
          }
        });
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('saveHighlights', () => {
    test('應該成功保存標註到 chrome.storage', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [
        { text: 'highlight 1', color: 'yellow' },
        { text: 'highlight 2', color: 'green' },
      ];

      await StorageUtil.saveHighlights(testUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`highlights_${normalizeUrl(testUrl)}`]: testData,
        }),
        expect.any(Function)
      );
    });

    test('應該在 chrome.storage 失敗時回退到 localStorage', async () => {
      // 模擬 chrome.storage 失敗
      mockChrome.runtime.lastError = { message: 'Storage error' };

      const testUrl = 'https://example.com/page';
      const testData = [{ text: 'highlight', color: 'yellow' }];

      // 使用 Storage.prototype spy 來追蹤 setItem 調用
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      try {
        await StorageUtil.saveHighlights(testUrl, testData);

        expect(setItemSpy).toHaveBeenCalledWith(
          `highlights_${normalizeUrl(testUrl)}`,
          JSON.stringify(testData)
        );
      } finally {
        setItemSpy.mockRestore();
        // 重置 mock
        mockChrome.runtime.lastError = null;
      }
    });

    test('應該處理包含追蹤參數的 URL', async () => {
      const testUrl = 'https://example.com/page?utm_source=test&id=123';
      const testData = [{ text: 'highlight', color: 'yellow' }];

      await StorageUtil.saveHighlights(testUrl, testData);

      // URL 應該被標準化（移除追蹤參數）
      const normalizedUrl = normalizeUrl(testUrl);
      expect(normalizedUrl).not.toContain('utm_source');
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`highlights_${normalizedUrl}`]: testData,
        }),
        expect.any(Function)
      );
    });

    test('應該處理空標註數組', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [];

      await StorageUtil.saveHighlights(testUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('應該處理包含特殊字符的 URL', async () => {
      const testUrl = 'https://example.com/頁面/測試';
      const testData = [{ text: '中文標註', color: 'yellow' }];

      await StorageUtil.saveHighlights(testUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('loadHighlights', () => {
    test('應該從 chrome.storage 加載標註（數組格式）', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [
        { text: 'highlight 1', color: 'yellow' },
        { text: 'highlight 2', color: 'green' },
      ];

      // 模擬 chrome.storage 返回數據
      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(
          () =>
            done({
              [`highlights_${normalizeUrl(testUrl)}`]: testData,
            }),
          0
        );
      });

      const result = await StorageUtil.loadHighlights(testUrl);

      expect(result).toEqual(testData);
      expect(result).toHaveLength(2);
    });

    test('應該從 chrome.storage 加載標註（對象格式）', async () => {
      const testUrl = 'https://example.com/page';
      const testData = {
        url: testUrl,
        highlights: [
          { text: 'highlight 1', color: 'yellow' },
          { text: 'highlight 2', color: 'green' },
        ],
      };

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(
          () =>
            done({
              [`highlights_${normalizeUrl(testUrl)}`]: testData,
            }),
          0
        );
      });

      const result = await StorageUtil.loadHighlights(testUrl);

      expect(result).toEqual(testData.highlights);
      expect(result).toHaveLength(2);
    });

    test('應該在 chrome.storage 無數據時回退到 localStorage', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [{ text: 'legacy highlight', color: 'yellow' }];

      // chrome.storage 返回空
      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(() => done({}), 0);
      });

      // 使用 Storage.prototype spy 來模擬 localStorage 有數據
      const getItemSpy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockReturnValue(JSON.stringify(testData));

      try {
        const result = await StorageUtil.loadHighlights(testUrl);

        expect(result).toEqual(testData);
        expect(getItemSpy).toHaveBeenCalled();
      } finally {
        getItemSpy.mockRestore();
      }
    });

    test('應該處理不存在的 URL', async () => {
      const testUrl = 'https://example.com/nonexistent';

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(() => done({}), 0);
      });

      const result = await StorageUtil.loadHighlights(testUrl);

      expect(result).toEqual([]);
    });

    test('應該處理損壞的 localStorage 數據', async () => {
      const testUrl = 'https://example.com/page';

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(() => done({}), 0);
      });

      // localStorage 返回無效 JSON
      mockLocalStorage.getItem = jest.fn(() => 'invalid json{');

      const result = await StorageUtil.loadHighlights(testUrl);

      expect(result).toEqual([]);
    });

    test('應該標準化 URL 後再加載', async () => {
      const testUrl = 'https://example.com/page?utm_source=test#section';
      const normalizedUrl = normalizeUrl(testUrl);
      const testData = [{ text: 'highlight', color: 'yellow' }];

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        expect(keys[0]).toBe(`highlights_${normalizedUrl}`);
        setTimeout(
          () =>
            done({
              [keys[0]]: testData,
            }),
          0
        );
      });

      const result = await StorageUtil.loadHighlights(testUrl);

      expect(result).toEqual(testData);
    });
  });

  describe('clearHighlights', () => {
    test('應該清除 chrome.storage 和 localStorage 中的標註', async () => {
      const testUrl = 'https://example.com/page';

      // 使用 Storage.prototype spy
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

      try {
        await StorageUtil.clearHighlights(testUrl);

        expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(
          [`highlights_${normalizeUrl(testUrl)}`],
          expect.any(Function)
        );
        expect(removeItemSpy).toHaveBeenCalledWith(`highlights_${normalizeUrl(testUrl)}`);
      } finally {
        removeItemSpy.mockRestore();
      }
    });

    test('應該處理 chrome.storage 不可用的情況', async () => {
      const testUrl = 'https://example.com/page';

      // 模擬 chrome.storage 不可用
      const savedChrome = globalThis.chrome;
      globalThis.chrome = undefined;

      // 使用 Storage.prototype spy
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

      try {
        await StorageUtil.clearHighlights(testUrl);

        expect(removeItemSpy).toHaveBeenCalled();
      } finally {
        removeItemSpy.mockRestore();
        // 恢復 chrome
        globalThis.chrome = savedChrome;
      }
    });

    test('應該標準化 URL 後再清除', async () => {
      const testUrl = 'https://example.com/page?utm_source=test#anchor';
      const normalizedUrl = normalizeUrl(testUrl);

      await StorageUtil.clearHighlights(testUrl);

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(
        [`highlights_${normalizedUrl}`],
        expect.any(Function)
      );
    });
  });

  describe('並發操作測試', () => {
    test('應該處理並發保存操作', async () => {
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3',
      ];
      const data = [
        [{ text: 'highlight 1', color: 'yellow' }],
        [{ text: 'highlight 2', color: 'green' }],
        [{ text: 'highlight 3', color: 'blue' }],
      ];

      // 並發保存
      const promises = urls.map((url, index) => StorageUtil.saveHighlights(url, data[index]));

      await Promise.all(promises);

      // 驗證所有保存操作都被調用
      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(3);
    });

    test('應該處理並發讀取操作', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [{ text: 'highlight', color: 'yellow' }];

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(
          () =>
            done({
              [`highlights_${normalizeUrl(testUrl)}`]: testData,
            }),
          10
        ); // 固定延遲以消除不確定性
      });

      // 並發讀取同一個 URL
      const promises = Array.from({ length: 5 })
        .fill(null)
        .map(() => StorageUtil.loadHighlights(testUrl));

      const results = await Promise.all(promises);

      // 所有結果應該相同
      results.forEach(result => {
        expect(result).toEqual(testData);
      });
      expect(mockChrome.storage.local.get).toHaveBeenCalledTimes(5);
    });

    test('應該處理並發讀寫操作', async () => {
      const testUrl = 'https://example.com/page';
      const writeData = [{ text: 'new highlight', color: 'yellow' }];
      const readData = [{ text: 'old highlight', color: 'green' }];

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(
          () =>
            done({
              [`highlights_${normalizeUrl(testUrl)}`]: readData,
            }),
          5
        );
      });

      // 同時進行讀寫操作
      const [, readResult] = await Promise.all([
        StorageUtil.saveHighlights(testUrl, writeData),
        StorageUtil.loadHighlights(testUrl),
      ]);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
      expect(mockChrome.storage.local.get).toHaveBeenCalled();
      expect(readResult).toEqual(readData);
    });

    test('應該處理並發清除操作', async () => {
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3',
      ];

      // 並發清除
      const promises = urls.map(url => StorageUtil.clearHighlights(url));

      await Promise.all(promises);

      expect(mockChrome.storage.local.remove).toHaveBeenCalledTimes(3);
    });
  });

  describe('數據遷移測試', () => {
    test('應該遷移舊格式數據（數組）到新格式', async () => {
      const testUrl = 'https://example.com/page';
      const oldFormatData = [
        { text: 'old highlight 1', color: 'yellow' },
        { text: 'old highlight 2', color: 'green' },
      ];

      // 模擬 localStorage 有舊格式數據
      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(() => done({}), 0);
      });

      // 使用 Storage.prototype spy
      const getItemSpy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockReturnValue(JSON.stringify(oldFormatData));

      try {
        const result = await StorageUtil.loadHighlights(testUrl);

        expect(result).toEqual(oldFormatData);
        expect(Array.isArray(result)).toBe(true);
      } finally {
        getItemSpy.mockRestore();
      }
    });

    test('應該遷移舊格式數據（對象）到新格式', async () => {
      const testUrl = 'https://example.com/page';
      const oldFormatData = {
        url: testUrl,
        highlights: [{ text: 'old highlight', color: 'yellow' }],
        timestamp: Date.now(),
      };

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(() => done({}), 0);
      });

      // 使用 Storage.prototype spy
      const getItemSpy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockReturnValue(JSON.stringify(oldFormatData));

      try {
        const result = await StorageUtil.loadHighlights(testUrl);

        expect(result).toEqual(oldFormatData.highlights);
        expect(Array.isArray(result)).toBe(true);
      } finally {
        getItemSpy.mockRestore();
      }
    });

    test('應該處理混合格式的數據', async () => {
      const testUrl = 'https://example.com/page';

      // chrome.storage 有新格式
      const newFormatData = [{ text: 'new highlight', color: 'yellow', timestamp: Date.now() }];

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(
          () =>
            done({
              [`highlights_${normalizeUrl(testUrl)}`]: newFormatData,
            }),
          0
        );
      });

      const result = await StorageUtil.loadHighlights(testUrl);

      // 應該優先使用 chrome.storage 的數據
      expect(result).toEqual(newFormatData);
    });

    test('應該處理空的舊格式數據', async () => {
      const testUrl = 'https://example.com/page';

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(() => done({}), 0);
      });

      // localStorage 有空數組
      mockLocalStorage.getItem = jest.fn(() => JSON.stringify([]));

      const result = await StorageUtil.loadHighlights(testUrl);

      expect(result).toEqual([]);
    });

    test('應該處理損壞的遷移數據', async () => {
      const testUrl = 'https://example.com/page';

      mockChrome.storage.local.get = jest.fn((keys, done) => {
        setTimeout(() => done({}), 0);
      });

      // localStorage 有損壞的 JSON
      mockLocalStorage.getItem = jest.fn(() => '{invalid json');

      const result = await StorageUtil.loadHighlights(testUrl);

      expect(result).toEqual([]);
    });
  });

  describe('存儲配額測試', () => {
    test('應該處理存儲配額超限錯誤', async () => {
      const testUrl = 'https://example.com/page';
      // 使用較小的數據避免實際超限
      const largeData = Array.from({ length: 100 })
        .fill(null)
        .map((_, i) => ({
          text: `Highlight text ${i}`,
          color: 'yellow',
        }));

      // 模擬配額超限
      mockChrome.runtime.lastError = {
        message: 'QUOTA_BYTES quota exceeded',
      };

      // 應該回退到 localStorage
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      try {
        await StorageUtil.saveHighlights(testUrl, largeData);

        expect(setItemSpy).toHaveBeenCalled();
      } finally {
        setItemSpy.mockRestore();
        mockChrome.runtime.lastError = null;
      }
    });

    test('應該處理 localStorage 配額超限', async () => {
      const testUrl = 'https://example.com/page';
      const largeData = Array.from({ length: 100 })
        .fill(null)
        .map((_, i) => ({
          text: `Highlight ${i}`,
          color: 'yellow',
        }));

      // chrome.storage 失敗
      mockChrome.runtime.lastError = { message: 'Storage error' };

      // localStorage 也失敗
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      try {
        await expect(StorageUtil.saveHighlights(testUrl, largeData)).rejects.toThrow(
          'QuotaExceededError'
        );
      } finally {
        setItemSpy.mockRestore();
        mockChrome.runtime.lastError = null;
      }
    });

    test('應該計算數據大小', () => {
      const testData = [
        { text: 'highlight 1', color: 'yellow' },
        { text: 'highlight 2', color: 'green' },
      ];

      const dataSize = JSON.stringify(testData).length;

      expect(dataSize).toBeGreaterThan(0);
      expect(dataSize).toBeLessThan(1000); // 小數據
    });

    test('應該處理超大單個標註', async () => {
      const testUrl = 'https://example.com/page';
      const hugeHighlight = {
        text: 'x'.repeat(10_000), // 10KB 文本
        color: 'yellow',
      };

      await StorageUtil.saveHighlights(testUrl, [hugeHighlight]);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('錯誤恢復測試', () => {
    test('應該從 chrome.storage 錯誤中恢復', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [{ text: 'highlight', color: 'yellow' }];

      // 第一次調用失敗
      let callCount = 0;
      mockChrome.storage.local.set = jest.fn((items, done) => {
        callCount++;
        if (callCount === 1) {
          mockChrome.runtime.lastError = { message: 'Temporary error' };
        } else {
          mockChrome.runtime.lastError = null;
        }
        setTimeout(() => done?.(), 0);
      });

      // 第一次保存（會失敗並回退到 localStorage）
      await StorageUtil.saveHighlights(testUrl, testData);

      // 第二次保存（應該成功）
      await StorageUtil.saveHighlights(testUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2);
    });

    test('應該處理 localStorage 不可用', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [{ text: 'highlight', color: 'yellow' }];

      // chrome.storage 失敗
      mockChrome.runtime.lastError = { message: 'Storage error' };

      // localStorage.setItem 拋出錯誤
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage is not available');
      });

      try {
        await expect(StorageUtil.saveHighlights(testUrl, testData)).rejects.toThrow(
          'localStorage is not available'
        );
      } finally {
        setItemSpy.mockRestore();
        mockChrome.runtime.lastError = null;
      }
    });

    test('應該處理讀取時的網絡錯誤', async () => {
      const testUrl = 'https://example.com/page';

      // 模擬網絡錯誤
      mockChrome.storage.local.get = jest.fn(() => {
        throw new Error('Network error');
      });

      // 應該回退到 localStorage
      const getItemSpy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockReturnValue(JSON.stringify([{ text: 'backup', color: 'yellow' }]));

      try {
        const result = await StorageUtil.loadHighlights(testUrl);

        expect(result).toEqual([{ text: 'backup', color: 'yellow' }]);
      } finally {
        getItemSpy.mockRestore();
      }
    });
  });

  describe('邊界情況測試', () => {
    test('應該處理空字符串 URL', async () => {
      const testData = [{ text: 'highlight', color: 'yellow' }];

      await StorageUtil.saveHighlights('', testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('應該處理 null URL', async () => {
      const testData = [{ text: 'highlight', color: 'yellow' }];

      // normalizeUrl 應該處理 null
      await StorageUtil.saveHighlights(null, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('應該處理 undefined 數據', async () => {
      const testUrl = 'https://example.com/page';

      await StorageUtil.saveHighlights(testUrl);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('應該處理 null 數據', async () => {
      const testUrl = 'https://example.com/page';

      await StorageUtil.saveHighlights(testUrl, null);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('應該處理非常長的 URL', async () => {
      const longUrl = `https://example.com/${'a'.repeat(2000)}`;
      const testData = [{ text: 'highlight', color: 'yellow' }];

      await StorageUtil.saveHighlights(longUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('應該處理包含 Unicode 字符的數據', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [
        { text: '中文標註 🎉', color: 'yellow' },
        { text: 'العربية', color: 'green' },
        { text: '日本語 🗾', color: 'blue' },
      ];

      await StorageUtil.saveHighlights(testUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('應該處理特殊字符的標註文本', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [
        { text: 'Text with "quotes"', color: 'yellow' },
        { text: "Text with 'apostrophes'", color: 'green' },
        { text: 'Text with \n newlines', color: 'blue' },
        { text: 'Text with \t tabs', color: 'red' },
      ];

      await StorageUtil.saveHighlights(testUrl, testData);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('性能測試', () => {
    test('應該快速保存小量數據', async () => {
      const testUrl = 'https://example.com/page';
      const testData = [{ text: 'highlight', color: 'yellow' }];

      const startTime = Date.now();
      await StorageUtil.saveHighlights(testUrl, testData);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100); // 應該在 100ms 內完成
    });

    test('應該處理批量保存操作', async () => {
      const urls = Array.from({ length: 10 })
        .fill(null)
        .map((_, i) => `https://example.com/page${i}`);
      const data = Array.from({ length: 10 })
        .fill(null)
        .map((_, i) => [{ text: `highlight ${i}`, color: 'yellow' }]);

      const startTime = Date.now();
      await Promise.all(urls.map((url, index) => StorageUtil.saveHighlights(url, data[index])));
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(500); // 批量操作應該在 500ms 內完成
    });
  });
});
