const {
  disconnectFromNotion,
  checkAuthStatus
} = require('../helpers/options.testable.js');

describe('Options - 授權管理', () => {
  let mockCheckAuthStatus;

  beforeEach(() => {
    // Reset mocks
    mockRemove = jest.fn();
    mockGet = jest.fn();

    // Mock Chrome APIs with correct callback behavior
    global.chrome = {
      runtime: {
        lastError: null
      },
      storage: {
        sync: {
          remove: mockRemove,
          get: mockGet
        }
      }
    };

    // Setup default mock behaviors - simulate Chrome API callback pattern
    mockRemove.mockImplementation((keys, callback) => {
      // Simulate synchronous callback execution for testing
      if (global.chrome.runtime.lastError) {
        // In error case, callback is still called but lastError is set
        callback();
      } else {
        callback();
      }
    });

    mockGet.mockImplementation((keys, callback) => {
      // Simulate synchronous callback execution for testing
      callback({});
    });

    // Mock checkAuthStatus function
    mockCheckAuthStatus = jest.fn().mockResolvedValue({
      hasAuth: false,
      settings: {}
    });

    // Mock the global checkAuthStatus function
    global.checkAuthStatus = mockCheckAuthStatus;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('disconnectFromNotion', () => {
    test('應該正確斷開 Notion 連接並清除授權數據', async () => {
      // Arrange - 設置測試環境
      mockRemove.mockImplementation((keys, callback) => callback());

      // Act - 調用斷開連接功能
      await disconnectFromNotion();

      // Assert - 驗證行為
      expect(mockRemove).toHaveBeenCalledWith([
        'notionApiToken',
        'notionDataSourceId',
        'notionDatabaseId'
      ]);
      expect(mockCheckAuthStatus).toHaveBeenCalled();
    });

    test('應該正確處理斷開連接時的錯誤', async () => {
      // Arrange - 模擬存儲清除失敗
      const testError = new Error('存儲清除失敗');
      mockRemove.mockRejectedValue(testError);

      // Spy on console.error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act - 調用斷開連接功能
      await disconnectFromNotion();

      // Assert - 驗證錯誤處理
      expect(mockRemove).toHaveBeenCalledWith([
        'notionApiToken',
        'notionDataSourceId',
        'notionDatabaseId'
      ]);
      expect(consoleSpy).toHaveBeenCalledWith('❌ [斷開連接] 清除授權數據失敗:', testError.message);
      expect(mockCheckAuthStatus).toHaveBeenCalled();

      // 清理 spy
      consoleSpy.mockRestore();
    });

    test('應該在成功斷開連接後更新授權狀態', async () => {
      // Arrange
      mockRemove.mockResolvedValue();

      // Act
      await disconnectFromNotion();

      // Assert - 確保 UI 狀態更新
      expect(mockCheckAuthStatus).toHaveBeenCalledTimes(1);
    });
  });
});