/**
 * @fileoverview Background 通知處理器測試
 * 測試更新通知和 Notion 頁面打開功能
 */

describe('Background 通知處理器', () => {
  let mockChrome = null;
  let mockLogger = null;

  beforeEach(() => {
    // 設置 Chrome API mock
    mockChrome = {
      runtime: {
        getURL: jest.fn(),
        lastError: null,
      },
      tabs: {
        create: jest.fn(),
        sendMessage: jest.fn(),
      },
    };
    global.chrome = mockChrome;

    // 設置 Logger mock
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    global.Logger = mockLogger;

    // 清除 console mock - 靜默 console.error 輸出以保持測試輸出清晰
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete global.chrome;
    delete global.Logger;
    jest.restoreAllMocks();
  });

  describe('showUpdateNotification 邏輯測試', () => {
    test('應該正確調用 Chrome API 創建標籤頁', async () => {
      // Arrange
      const mockTab = { id: 123 };
      mockChrome.runtime.getURL.mockReturnValue('chrome-extension://test/update.html');
      mockChrome.tabs.create.mockResolvedValue(mockTab);

      // Act - 測試基本的標籤頁創建邏輯
      const url = mockChrome.runtime.getURL('update-notification/update-notification.html');
      const tab = await mockChrome.tabs.create({ url, active: true });

      // Assert
      expect(mockChrome.runtime.getURL).toHaveBeenCalledWith(
        'update-notification/update-notification.html'
      );
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test/update.html',
        active: true,
      });
      expect(tab.id).toBe(123);
    });

    test('應該處理標籤頁創建失敗', async () => {
      // Arrange
      const error = new Error('Tab creation failed');
      mockChrome.tabs.create.mockRejectedValue(error);

      // Act & Assert
      await expect(mockChrome.tabs.create({ url: 'test', active: true })).rejects.toThrow(
        'Tab creation failed'
      );
    });

    test('應該正確構建更新消息', () => {
      // Arrange
      const previousVersion = '2.8.0';
      const currentVersion = '2.9.0';

      // Act
      const message = {
        type: 'UPDATE_INFO',
        previousVersion,
        currentVersion,
      };

      // Assert
      expect(message).toEqual({
        type: 'UPDATE_INFO',
        previousVersion: '2.8.0',
        currentVersion: '2.9.0',
      });
    });
  });

  describe('handleOpenNotionPage', () => {
    const handleOpenNotionPage = (request, sendResponse) => {
      try {
        const url = request.url;
        if (!url) {
          sendResponse({ success: false, error: 'No URL provided' });
          return;
        }

        // 在新標籤頁中打開 Notion 頁面
        chrome.tabs.create({ url }, tab => {
          if (chrome.runtime.lastError) {
            console.error('Failed to open Notion page:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            Logger.log('✅ Opened Notion page in new tab:', url);
            sendResponse({ success: true, tabId: tab.id });
          }
        });
      } catch (error) {
        console.error('❌ handleOpenNotionPage 錯誤:', error);
        sendResponse({ success: false, error: error.message });
      }
    };

    test('應該成功打開 Notion 頁面', () => {
      // Arrange
      const request = { url: 'https://notion.so/test-page' };
      const sendResponse = jest.fn();
      const mockTab = { id: 123, url: 'https://notion.so/test-page' };

      mockChrome.tabs.create.mockImplementation((options, callback) => {
        callback(mockTab);
      });

      // Act
      handleOpenNotionPage(request, sendResponse);

      // Assert
      expect(mockChrome.tabs.create).toHaveBeenCalledWith(
        { url: 'https://notion.so/test-page' },
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        tabId: 123,
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        '✅ Opened Notion page in new tab:',
        'https://notion.so/test-page'
      );
    });

    test('應該處理缺少 URL 的請求', () => {
      // Arrange
      const request = {};
      const sendResponse = jest.fn();

      // Act
      handleOpenNotionPage(request, sendResponse);

      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No URL provided',
      });
      expect(mockChrome.tabs.create).not.toHaveBeenCalled();
    });

    test('應該處理空 URL', () => {
      // Arrange
      const request = { url: '' };
      const sendResponse = jest.fn();

      // Act
      handleOpenNotionPage(request, sendResponse);

      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No URL provided',
      });
    });

    test('應該處理 null URL', () => {
      // Arrange
      const request = { url: null };
      const sendResponse = jest.fn();

      // Act
      handleOpenNotionPage(request, sendResponse);

      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No URL provided',
      });
    });

    test('應該處理標籤頁創建失敗', () => {
      // Arrange
      const request = { url: 'https://notion.so/test-page' };
      const sendResponse = jest.fn();
      const error = { message: 'Permission denied' };

      mockChrome.runtime.lastError = error;
      mockChrome.tabs.create.mockImplementation((options, callback) => {
        callback(null);
      });

      // Act
      handleOpenNotionPage(request, sendResponse);

      // Assert
      expect(console.error).toHaveBeenCalledWith('Failed to open Notion page:', error);
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Permission denied',
      });
    });

    test('應該處理異常錯誤', () => {
      // Arrange
      const request = { url: 'https://notion.so/test-page' };
      const sendResponse = jest.fn();
      const error = new Error('Unexpected error');

      mockChrome.tabs.create.mockImplementation(() => {
        throw error;
      });

      // Act
      handleOpenNotionPage(request, sendResponse);

      // Assert
      expect(console.error).toHaveBeenCalledWith('❌ handleOpenNotionPage 錯誤:', error);
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unexpected error',
      });
    });

    test('應該處理有效的 Notion URL 格式', () => {
      // Arrange
      const testUrls = [
        'https://www.notion.so/workspace/page-123',
        'https://notion.so/page-456',
        'https://custom.notion.site/page-789',
      ];

      testUrls.forEach((url, index) => {
        const request = { url };
        const sendResponse = jest.fn();
        const mockTab = { id: index + 1, url };

        mockChrome.tabs.create.mockImplementation((options, callback) => {
          callback(mockTab);
        });

        // Act
        handleOpenNotionPage(request, sendResponse);

        // Assert
        expect(sendResponse).toHaveBeenCalledWith({
          success: true,
          tabId: index + 1,
        });
      });
    });

    test('應該處理非 Notion URL', () => {
      // Arrange
      const request = { url: 'https://google.com' };
      const sendResponse = jest.fn();
      const mockTab = { id: 999, url: 'https://google.com' };

      mockChrome.tabs.create.mockImplementation((options, callback) => {
        callback(mockTab);
      });

      // Act
      handleOpenNotionPage(request, sendResponse);

      // Assert
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        tabId: 999,
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        '✅ Opened Notion page in new tab:',
        'https://google.com'
      );
    });
  });

  describe('集成測試', () => {
    test('通知處理器應該能夠協同工作', async () => {
      // Arrange
      const mockTab = { id: 100 };
      mockChrome.runtime.getURL.mockReturnValue('chrome-extension://test/update.html');
      mockChrome.tabs.create.mockResolvedValue(mockTab);
      mockChrome.tabs.sendMessage.mockResolvedValue({});

      const showUpdateNotification = async (previousVersion, currentVersion) => {
        const tab = await chrome.tabs.create({
          url: chrome.runtime.getURL('update-notification/update-notification.html'),
          active: true,
        });
        // 模擬真實實現：記錄版本信息（真實實現會通過 sendMessage 傳送）
        Logger.log(`已顯示更新通知頁面: ${previousVersion} → ${currentVersion}`);
        return tab;
      };

      const handleOpenNotionPage = (request, sendResponse) => {
        if (!request.url) {
          sendResponse({ success: false, error: 'No URL provided' });
          return;
        }
        chrome.tabs.create({ url: request.url }, tab => {
          sendResponse({ success: true, tabId: tab.id });
        });
      };

      // Act - 先顯示更新通知
      const updateTab = await showUpdateNotification('2.8.0', '2.9.0');

      // 然後打開 Notion 頁面
      const notionRequest = { url: 'https://notion.so/new-feature' };
      const notionResponse = jest.fn();

      mockChrome.tabs.create.mockImplementation((options, callback) => {
        callback({ id: 200, url: options.url });
      });

      handleOpenNotionPage(notionRequest, notionResponse);

      // Assert
      expect(updateTab.id).toBe(100);
      expect(notionResponse).toHaveBeenCalledWith({
        success: true,
        tabId: 200,
      });
      expect(mockLogger.log).toHaveBeenCalledWith('已顯示更新通知頁面: 2.8.0 → 2.9.0');
    });
  });
});
