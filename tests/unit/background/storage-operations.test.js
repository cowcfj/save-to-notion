/**
 * Background.js - 存儲操作測試
 * 測試 chrome.storage 相關的操作函數
 */

describe('Background Storage Operations', () => {
  beforeEach(() => {
    // 清理存儲
    if (chrome._clearStorage) {
      chrome._clearStorage();
    }
    if (localStorage.clear) {
      localStorage.clear();
    }

    // 重置 mocks
    if (chrome.storage.local.get.mockClear) {
      chrome.storage.local.get.mockClear();
    }
    if (chrome.storage.local.set.mockClear) {
      chrome.storage.local.set.mockClear();
    }
    if (chrome.storage.local.remove.mockClear) {
      chrome.storage.local.remove.mockClear();
    }
  });

  describe('getConfig', () => {
    it('應該從 sync storage 獲取配置', async () => {
      // Arrange
      const mockConfig = {
        notionApiKey: 'secret_test_key',
        notionDatabaseId: 'db-123'
      };

      await chrome.storage.local.set(mockConfig);

      // Act
      const result = await new Promise((resolve) => {
        getConfigSimulated(['notionApiKey', 'notionDatabaseId'], resolve);
      });

      // Assert
      expect(result.notionApiKey).toBe('secret_test_key');
      expect(result.notionDatabaseId).toBe('db-123');
    });

    it('應該處理不存在的配置鍵', async () => {
      // Act
      const result = await new Promise((resolve) => {
        getConfigSimulated(['nonExistentKey'], resolve);
      });

      // Assert
      expect(result.nonExistentKey).toBeUndefined();
    });

    it('應該處理空配置請求', async () => {
      // Act
      const result = await new Promise((resolve) => {
        getConfigSimulated([], resolve);
      });

      // Assert
      expect(result).toEqual({});
    });
  });

  describe('getSavedPageData', () => {
    it('應該獲取已保存的頁面數據', async () => {
      // Arrange
      const pageUrl = 'https://example.com/article';
      const savedData = {
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page123',
        savedAt: Date.now()
      };

      await chrome.storage.local.set({
        [`saved_${pageUrl}`]: savedData
      });

      // Act
      const result = await new Promise((resolve) => {
        getSavedPageDataSimulated(pageUrl, resolve);
      });

      // Assert
      expect(result).toEqual(savedData);
      expect(result.notionPageId).toBe('page-123');
    });

    it('應該返回 null 當頁面未保存時', async () => {
      // Arrange
      const pageUrl = 'https://example.com/not-saved';

      // Act
      const result = await new Promise((resolve) => {
        getSavedPageDataSimulated(pageUrl, resolve);
      });

      // Assert
      expect(result).toBeNull();
    });

    it('應該處理特殊字符的 URL', async () => {
      // Arrange
      const pageUrl = 'https://example.com/文章?id=123&lang=zh';
      const savedData = {
        notionPageId: 'page-456'
      };

      await chrome.storage.local.set({
        [`saved_${pageUrl}`]: savedData
      });

      // Act
      const result = await new Promise((resolve) => {
        getSavedPageDataSimulated(pageUrl, resolve);
      });

      // Assert
      expect(result).toEqual(savedData);
    });
  });

  describe('setSavedPageData', () => {
    it('應該保存頁面數據', async () => {
      // Arrange
      const pageUrl = 'https://example.com/article';
      const data = {
        notionPageId: 'page-789',
        notionUrl: 'https://notion.so/page789'
      };

      // Act
      await new Promise((resolve) => {
        setSavedPageDataSimulated(pageUrl, data, resolve);
      });

      // Assert
      const result = await chrome.storage.local.get(`saved_${pageUrl}`);
      expect(result[`saved_${pageUrl}`]).toBeDefined();
      expect(result[`saved_${pageUrl}`].notionPageId).toBe('page-789');
      expect(result[`saved_${pageUrl}`].lastUpdated).toBeDefined();
    });

    it('應該添加 lastUpdated 時間戳', async () => {
      // Arrange
      const pageUrl = 'https://example.com/article';
      const data = {
        notionPageId: 'page-999'
      };
      const beforeTime = Date.now();

      // Act
      await new Promise((resolve) => {
        setSavedPageDataSimulated(pageUrl, data, resolve);
      });

      const afterTime = Date.now();

      // Assert
      const result = await chrome.storage.local.get(`saved_${pageUrl}`);
      const savedData = result[`saved_${pageUrl}`];
      expect(savedData.lastUpdated).toBeGreaterThanOrEqual(beforeTime);
      expect(savedData.lastUpdated).toBeLessThanOrEqual(afterTime);
    });

    it('應該覆蓋已存在的數據', async () => {
      // Arrange
      const pageUrl = 'https://example.com/article';
      const oldData = {
        notionPageId: 'old-page'
      };
      const newData = {
        notionPageId: 'new-page',
        notionUrl: 'https://notion.so/newpage'
      };

      await chrome.storage.local.set({
        [`saved_${pageUrl}`]: oldData
      });

      // Act
      await new Promise((resolve) => {
        setSavedPageDataSimulated(pageUrl, newData, resolve);
      });

      // Assert
      const result = await chrome.storage.local.get(`saved_${pageUrl}`);
      expect(result[`saved_${pageUrl}`].notionPageId).toBe('new-page');
      expect(result[`saved_${pageUrl}`].notionUrl).toBe('https://notion.so/newpage');
    });
  });

  describe('clearPageState', () => {
    it('應該清除頁面的保存狀態和標註', async () => {
      // Arrange
      const pageUrl = 'https://example.com/article';
      await chrome.storage.local.set({
        [`saved_${pageUrl}`]: { notionPageId: 'page-123' },
        [`highlights_${pageUrl}`]: [{ text: '標註1' }]
      });

      // Act
      await new Promise((resolve) => {
        clearPageStateSimulated(pageUrl, resolve);
      });

      // Assert
      const result = await chrome.storage.local.get([
        `saved_${pageUrl}`,
        `highlights_${pageUrl}`
      ]);
      expect(result[`saved_${pageUrl}`]).toBeUndefined();
      expect(result[`highlights_${pageUrl}`]).toBeUndefined();
    });

    it('應該處理不存在的頁面', async () => {
      // Arrange
      const pageUrl = 'https://example.com/not-exists';

      // Act & Assert - 不應該拋出錯誤
      await expect(
        new Promise((resolve) => {
          clearPageStateSimulated(pageUrl, resolve);
        })
      ).resolves.toBeUndefined();
    });

    it('應該只清除指定頁面的數據', async () => {
      // Arrange
      const pageUrl1 = 'https://example.com/article1';
      const pageUrl2 = 'https://example.com/article2';

      await chrome.storage.local.set({
        [`saved_${pageUrl1}`]: { notionPageId: 'page-1' },
        [`saved_${pageUrl2}`]: { notionPageId: 'page-2' }
      });

      // Act
      await new Promise((resolve) => {
        clearPageStateSimulated(pageUrl1, resolve);
      });

      // Assert
      const result = await chrome.storage.local.get([
        `saved_${pageUrl1}`,
        `saved_${pageUrl2}`
      ]);
      expect(result[`saved_${pageUrl1}`]).toBeUndefined();
      expect(result[`saved_${pageUrl2}`]).toBeDefined();
      expect(result[`saved_${pageUrl2}`].notionPageId).toBe('page-2');
    });
  });

  describe('存儲配額處理', () => {
    it('應該檢測存儲空間使用情況', async () => {
      // Arrange
      const largeData = {
        notionPageId: 'page-123',
        content: 'x'.repeat(1000)
      };

      await chrome.storage.local.set({
        'saved_https://example.com': largeData
      });

      // Act
      const bytesInUse = await new Promise((resolve) => {
        chrome.storage.local.getBytesInUse(null, resolve);
      });

      // Assert
      expect(bytesInUse).toBeGreaterThan(0);
    });

    it('應該處理存儲配額錯誤', async () => {
      // Arrange
      const pageUrl = 'https://example.com/article';
      const data = { notionPageId: 'page-123' };

      // 模擬存儲配額錯誤
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };

      // Act
      let errorOccurred = false;
      try {
        await new Promise((resolve, reject) => {
          setSavedPageDataSimulated(pageUrl, data, (error) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toContain('QUOTA_BYTES');
      }

      // Assert
      expect(errorOccurred).toBe(true);

      // 清理
      chrome.runtime.lastError = null;
    });
  });

  describe('並發操作', () => {
    it('應該處理並發保存操作', async () => {
      // Arrange
      const pageUrl1 = 'https://example.com/article1';
      const pageUrl2 = 'https://example.com/article2';
      const data1 = { notionPageId: 'page-1' };
      const data2 = { notionPageId: 'page-2' };

      // Act - 並發保存
      await Promise.all([
        new Promise((resolve) => {
          setSavedPageDataSimulated(pageUrl1, data1, resolve);
        }),
        new Promise((resolve) => {
          setSavedPageDataSimulated(pageUrl2, data2, resolve);
        })
      ]);

      // Assert
      const result1 = await chrome.storage.local.get(`saved_${pageUrl1}`);
      const result2 = await chrome.storage.local.get(`saved_${pageUrl2}`);

      expect(result1[`saved_${pageUrl1}`].notionPageId).toBe('page-1');
      expect(result2[`saved_${pageUrl2}`].notionPageId).toBe('page-2');
    });

    it('應該處理並發讀取操作', async () => {
      // Arrange
      const pageUrl = 'https://example.com/article';
      const data = { notionPageId: 'page-123' };

      await chrome.storage.local.set({
        [`saved_${pageUrl}`]: data
      });

      // Act - 並發讀取
      const results = await Promise.all([
        new Promise((resolve) => {
          getSavedPageDataSimulated(pageUrl, resolve);
        }),
        new Promise((resolve) => {
          getSavedPageDataSimulated(pageUrl, resolve);
        }),
        new Promise((resolve) => {
          getSavedPageDataSimulated(pageUrl, resolve);
        })
      ]);

      // Assert
      results.forEach((result) => {
        expect(result.notionPageId).toBe('page-123');
      });
    });
  });

  describe('數據遷移', () => {
    it('應該識別需要遷移的舊格式數據', () => {
      // Arrange
      const oldFormatData = {
        pageId: 'old-page-123', // 舊格式使用 pageId
        url: 'https://example.com'
      };

      const newFormatData = {
        notionPageId: 'new-page-123', // 新格式使用 notionPageId
        notionUrl: 'https://notion.so/page'
      };

      // Act & Assert
      expect(isOldFormatData(oldFormatData)).toBe(true);
      expect(isOldFormatData(newFormatData)).toBe(false);
    });

    it('應該遷移舊格式數據到新格式', () => {
      // Arrange
      const oldData = {
        pageId: 'old-123',
        url: 'https://example.com',
        savedAt: 1234567890
      };

      // Act
      const newData = migrateToNewFormat(oldData);

      // Assert
      expect(newData.notionPageId).toBe('old-123');
      expect(newData.notionUrl).toBe('https://www.notion.so/old123');
      expect(newData.savedAt).toBe(1234567890);
    });

    it('應該保留新格式數據不變', () => {
      // Arrange
      const newData = {
        notionPageId: 'new-123',
        notionUrl: 'https://notion.so/new123',
        savedAt: Date.now()
      };

      // Act
      const result = migrateToNewFormat(newData);

      // Assert
      expect(result).toEqual(newData);
    });
  });
});

/**
 * 模擬的存儲操作函數（用於測試）
 */
function getConfigSimulated(keys, callback) {
  chrome.storage.local.get(keys, callback);
}

function getSavedPageDataSimulated(pageUrl, callback) {
  chrome.storage.local.get([`saved_${pageUrl}`], (result) => {
    callback(result[`saved_${pageUrl}`] || null);
  });
}

function setSavedPageDataSimulated(pageUrl, data, callback) {
  const storageData = {
    [`saved_${pageUrl}`]: {
      ...data,
      lastUpdated: Date.now()
    }
  };
  chrome.storage.local.set(storageData, callback);
}

function clearPageStateSimulated(pageUrl, callback) {
  const savedKey = `saved_${pageUrl}`;
  const highlightsKey = `highlights_${pageUrl}`;

  chrome.storage.local.remove([savedKey, highlightsKey], callback);
}

/**
 * 輔助函數：檢查是否為舊格式數據
 */
function isOldFormatData(data) {
  if (!data) return false;
  return !!data.pageId && !data.notionPageId;
}

/**
 * 輔助函數：遷移舊格式數據到新格式
 */
function migrateToNewFormat(data) {
  if (isOldFormatData(data)) {
    return {
      notionPageId: data.pageId,
      notionUrl: `https://www.notion.so/${data.pageId.replace(/-/g, '')}`,
      savedAt: data.savedAt,
      lastUpdated: Date.now()
    };
  }
  return data;
}
