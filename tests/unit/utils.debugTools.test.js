/**
 * @fileoverview StorageUtil 調試工具測試
 * 測試 debugListAllKeys 方法和相關調試功能
 */

// 導入測試工具
const { StorageUtil } = require('../helpers/utils.testable.js');

describe('StorageUtil 調試工具', () => {
  let mockChrome = null;

  beforeEach(() => {
    // 設置 Chrome API mock
    mockChrome = {
      storage: {
        local: {
          get: jest.fn(),
        },
      },
    };
    global.chrome = mockChrome;

    // 清除 console 方法的調用記錄
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.chrome;
  });

  describe('debugListAllKeys', () => {
    test('應該列出所有標註鍵', async () => {
      // Arrange
      const mockData = {
        'highlights_https://example.com': [
          { text: '測試標註1', color: 'yellow' },
          { text: '測試標註2', color: 'green' },
        ],
        'highlights_https://test.com': {
          highlights: [{ text: '測試標註3', color: 'blue' }],
        },
        other_key: 'some_value', // 非標註鍵，應該被過濾
        'highlights_https://demo.com': [],
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback(mockData);
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toContain('highlights_https://example.com');
      expect(result).toContain('highlights_https://test.com');
      expect(result).toContain('highlights_https://demo.com');
      expect(result).not.toContain('other_key');

      // 驗證 Chrome storage 被正確調用
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(null, expect.any(Function));
    });

    test('應該處理空存儲', async () => {
      // Arrange
      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toEqual([]);
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(null, expect.any(Function));
    });

    test('應該處理 null 數據', async () => {
      // Arrange
      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback(null);
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toEqual([]);
    });

    test('應該處理 Chrome storage 不可用', async () => {
      // Arrange
      delete global.chrome;

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toEqual([]);
    });

    test('應該處理 Chrome storage.local 不存在', async () => {
      // Arrange
      global.chrome = {};

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toEqual([]);
    });

    test('應該正確計算標註數量（數組格式）', async () => {
      // Arrange
      const mockData = {
        'highlights_https://example.com': [
          { text: '標註1', color: 'yellow' },
          { text: '標註2', color: 'green' },
          { text: '標註3', color: 'blue' },
        ],
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback(mockData);
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('highlights_https://example.com');
    });

    test('應該正確計算標註數量（對象格式）', async () => {
      // Arrange
      const mockData = {
        'highlights_https://example.com': {
          highlights: [
            { text: '標註1', color: 'yellow' },
            { text: '標註2', color: 'green' },
          ],
        },
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback(mockData);
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('highlights_https://example.com');
    });

    test('應該處理無效的標註數據格式', async () => {
      // Arrange
      const mockData = {
        'highlights_https://example.com': 'invalid_data',
        'highlights_https://test.com': null,
        'highlights_https://demo.com': undefined,
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback(mockData);
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toContain('highlights_https://example.com');
      expect(result).toContain('highlights_https://test.com');
      expect(result).toContain('highlights_https://demo.com');
    });

    test('應該處理 Chrome storage 操作異常', async () => {
      // Arrange
      mockChrome.storage.local.get.mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toEqual([]);
    });

    test('應該過濾出正確的標註鍵前綴', async () => {
      // Arrange
      const mockData = {
        'highlights_https://example.com': [],
        highlight_single: [], // 錯誤前綴
        highlights_test: [], // 正確前綴
        'saved_https://example.com': [], // 其他前綴
        highlights_: [], // 邊界情況
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback(mockData);
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toContain('highlights_https://example.com');
      expect(result).toContain('highlights_test');
      expect(result).toContain('highlights_');
      expect(result).not.toContain('highlight_single');
      expect(result).not.toContain('saved_https://example.com');
    });
  });

  describe('調試工具集成測試', () => {
    test('應該在真實場景中正確工作', async () => {
      // Arrange - 模擬真實的存儲數據
      const mockData = {
        'highlights_https://notion.so/article1': [
          { text: 'Important insight', color: 'yellow', timestamp: Date.now() },
        ],
        'highlights_https://github.com/repo': {
          highlights: [
            { text: 'Code comment', color: 'green', timestamp: Date.now() },
            { text: 'Bug note', color: 'red', timestamp: Date.now() },
          ],
        },
        'saved_https://notion.so/article1': {
          title: 'Article 1',
          savedAt: Date.now(),
        },
        config_key: 'some_config',
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback(mockData);
      });

      // Act
      const result = await StorageUtil.debugListAllKeys();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('highlights_https://notion.so/article1');
      expect(result).toContain('highlights_https://github.com/repo');

      // 驗證非標註鍵被正確過濾
      expect(result).not.toContain('saved_https://notion.so/article1');
      expect(result).not.toContain('config_key');
    });
  });
});
