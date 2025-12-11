const optionsHandler = require('../helpers/options.testable.js');

describe('Options - 授權管理', () => {
  let mockRemove = jest.fn();
  let mockGet = jest.fn();
  let checkAuthStatusSpy = null;

  beforeEach(() => {
    // Mock Chrome APIs
    mockRemove = jest.fn();
    mockGet = jest.fn();
    global.chrome = {
      runtime: { lastError: null },
      storage: { sync: { remove: mockRemove, get: mockGet } },
    };

    // Spy on checkAuthStatus and mock its implementation
    checkAuthStatusSpy = jest.spyOn(optionsHandler, 'checkAuthStatus').mockResolvedValue({
      hasAuth: false,
      settings: {},
    });

    // Default mock behaviors
    mockRemove.mockImplementation((keys, done) => {
      global.chrome.runtime.lastError = null;
      done();
    });
    mockGet.mockImplementation((keys, done) => done({}));
  });

  afterEach(() => {
    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe('disconnectFromNotion', () => {
    test('應該正確斷開 Notion 連接並清除授權數據', async () => {
      // Act
      await optionsHandler.disconnectFromNotion();

      // Assert
      expect(mockRemove).toHaveBeenCalledWith(
        ['notionApiToken', 'notionDataSourceId', 'notionDatabaseId'],
        expect.any(Function)
      );
      expect(checkAuthStatusSpy).toHaveBeenCalled();
    });

    test('應該正確處理斷開連接時的錯誤', async () => {
      // Arrange
      const testError = new Error('存儲清除失敗');
      mockRemove.mockImplementation((keys, done) => {
        global.chrome.runtime.lastError = testError;
        done();
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act & Assert
      await expect(optionsHandler.disconnectFromNotion()).rejects.toThrow(testError);
      expect(checkAuthStatusSpy).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('❌ [斷開連接] 清除授權數據失敗:', testError.message);

      // Cleanup
      consoleSpy.mockRestore();
    });

    test('應該在成功斷開連接後更新授權狀態', async () => {
      // Act
      await optionsHandler.disconnectFromNotion();

      // Assert
      expect(checkAuthStatusSpy).toHaveBeenCalledTimes(1);
    });
  });
});
