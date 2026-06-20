/**
 * Background Notion Page Operations Tests
 * 測試 Notion 頁面檢查和打開相關的函數
 */

// Mock Chrome APIs
import mockChrome from '../../mocks/chrome';
import {
  buildNotionPageResponse,
  buildOpenPageRequest,
  createJsonResponse,
  mockNotionApiToken,
  mockTabCreationResult,
} from '../../helpers/notionPageOperationsTestHarness.js';

const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

function createCheckNotionPageExists() {
  return jest.fn(async (pageId, apiKey) => {
    try {
      const response = await fetch(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': NOTION_VERSION,
        },
      });

      if (response.ok) {
        const pageData = await response.json();
        return {
          exists: true,
          page: pageData,
        };
      }

      if (response.status === 404) {
        return {
          exists: false,
          error: 'Page not found',
        };
      }

      const errorData = await response.json();

      console.error('❌ 檢查 Notion 頁面失敗:', JSON.stringify(errorData));
      return {
        exists: false,
        error: errorData.message || 'Unknown error',
      };
    } catch (error) {
      console.error('❌ 檢查 Notion 頁面異常:', error);
      return {
        exists: false,
        error: error.message,
      };
    }
  });
}

function createHandleCheckNotionPageExistsMessage(checkNotionPageExists) {
  return async (request, sendResponse) => {
    try {
      const { pageId } = request;

      if (!pageId) {
        sendResponse({
          success: false,
          error: 'Missing pageId parameter',
        });
        return;
      }

      await new Promise(resolve => {
        chrome.storage.sync.get(['notionApiToken'], async result => {
          try {
            const apiKey = result.notionApiToken;

            if (!apiKey) {
              sendResponse({
                success: false,
                error: 'Notion API token not configured',
              });
              return;
            }

            const checkResult = await checkNotionPageExists(pageId, apiKey);

            sendResponse({
              success: true,
              exists: checkResult.exists,
              error: checkResult.error,
            });
          } catch (error) {
            console.error('❌ 處理檢查頁面存在消息失敗:', error);
            sendResponse({
              success: false,
              error: error.message,
            });
          } finally {
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('❌ 處理檢查頁面存在消息失敗:', error);
      sendResponse({
        success: false,
        error: error.message,
      });
    }
  };
}

function createHandleOpenNotionPage() {
  return jest.fn((request, sendResponse) => {
    try {
      const url = request.url;

      if (!url) {
        sendResponse({
          success: false,
          error: 'Missing URL parameter',
        });
        return;
      }

      chrome.tabs.create({ url }, tab => {
        if (chrome.runtime.lastError) {
          console.error('❌ 打開標籤頁失敗:', chrome.runtime.lastError);
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message,
          });
          return;
        }

        sendResponse({
          success: true,
          tabId: tab.id,
        });
      });
    } catch (error) {
      console.error('❌ 處理打開 Notion 頁面失敗:', error);
      sendResponse({
        success: false,
        error: error.message,
      });
    }
  });
}

globalThis.chrome = mockChrome;

// Mock console methods
globalThis.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Mock fetch
globalThis.fetch = jest.fn();

describe('Background Notion Page Operations', () => {
  let checkNotionPageExists = null;
  let handleCheckNotionPageExistsMessage = null;
  let handleOpenNotionPage = null;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch.mockClear();
    mockChrome.runtime.lastError = null;

    checkNotionPageExists = createCheckNotionPageExists();
    handleCheckNotionPageExistsMessage =
      createHandleCheckNotionPageExistsMessage(checkNotionPageExists);
    handleOpenNotionPage = createHandleOpenNotionPage();
  });

  describe('checkNotionPageExists', () => {
    test('應該成功檢查存在的頁面', async () => {
      // Arrange
      const pageId = 'test-page-id';
      const apiKey = 'test-api-key';
      const mockPageData = {
        id: pageId,
        object: 'page',
        properties: {},
      };

      globalThis.fetch.mockResolvedValue(buildNotionPageResponse(mockPageData));

      // Act
      const result = await checkNotionPageExists(pageId, apiKey);

      // Assert
      expect(globalThis.fetch).toHaveBeenCalledWith(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': NOTION_VERSION,
        },
      });
      expect(result).toEqual({
        exists: true,
        page: mockPageData,
      });
    });

    test.each([
      {
        name: '應該正確處理不存在的頁面',
        pageId: 'non-existent-page',
        response: createJsonResponse({
          ok: false,
          status: 404,
          body: { message: 'Page not found' },
        }),
        expected: {
          exists: false,
          error: 'Page not found',
        },
      },
      {
        name: '應該處理沒有錯誤消息的 API 錯誤',
        pageId: 'test-page-id',
        response: createJsonResponse({
          ok: false,
          status: 500,
          body: {},
        }),
        expected: {
          exists: false,
          error: 'Unknown error',
        },
      },
    ])('$name', async ({ pageId, response, expected }) => {
      // Arrange
      const apiKey = 'test-api-key';

      globalThis.fetch.mockResolvedValue(response);

      // Act
      const result = await checkNotionPageExists(pageId, apiKey);

      // Assert
      expect(result).toEqual(expected);
    });

    test('應該處理 API 錯誤', async () => {
      // Arrange
      const pageId = 'test-page-id';
      const apiKey = 'invalid-api-key';
      const errorData = {
        message: 'Unauthorized',
        code: 'unauthorized',
      };

      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve(errorData),
      });

      // Act
      const result = await checkNotionPageExists(pageId, apiKey);

      // Assert
      expect(result).toEqual({
        exists: false,
        error: 'Unauthorized',
      });
      expect(console.error).toHaveBeenCalledWith(
        '❌ 檢查 Notion 頁面失敗:',
        JSON.stringify(errorData)
      );
    });

    test('應該處理網路錯誤', async () => {
      // Arrange
      const pageId = 'test-page-id';
      const apiKey = 'test-api-key';
      const networkError = new Error('Network error');

      globalThis.fetch.mockRejectedValue(networkError);

      // Act
      const result = await checkNotionPageExists(pageId, apiKey);

      // Assert
      expect(result).toEqual({
        exists: false,
        error: 'Network error',
      });
      expect(console.error).toHaveBeenCalledWith('❌ 檢查 Notion 頁面異常:', networkError);
    });
  });

  describe('handleCheckNotionPageExistsMessage', () => {
    test('應該成功處理檢查頁面存在的消息', async () => {
      // Arrange
      const request = { pageId: 'test-page-id' };
      const mockSendResponse = jest.fn();

      mockNotionApiToken(mockChrome.storage.sync.get, 'test-api-key');

      checkNotionPageExists.mockResolvedValue({
        exists: true,
        page: { id: 'test-page-id' },
      });

      // Act
      await handleCheckNotionPageExistsMessage(request, mockSendResponse);

      // Assert
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith(
        ['notionApiToken'],
        expect.any(Function)
      );
      expect(checkNotionPageExists).toHaveBeenCalledWith('test-page-id', 'test-api-key');
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        exists: true,
        error: undefined,
      });
    });

    test('應該處理缺少 pageId 的請求', async () => {
      // Arrange
      const request = {};
      const mockSendResponse = jest.fn();

      // Act
      await handleCheckNotionPageExistsMessage(request, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Missing pageId parameter',
      });
    });

    test('應該處理缺少 API Token 的情況', async () => {
      // Arrange
      const request = { pageId: 'test-page-id' };
      const mockSendResponse = jest.fn();

      mockNotionApiToken(mockChrome.storage.sync.get);

      // Act
      await handleCheckNotionPageExistsMessage(request, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Notion API token not configured',
      });
    });

    test('應該處理檢查頁面時的異常', async () => {
      // Arrange
      const request = { pageId: 'test-page-id' };
      const mockSendResponse = jest.fn();

      mockNotionApiToken(mockChrome.storage.sync.get, 'test-api-key');

      checkNotionPageExists.mockRejectedValue(new Error('Check failed'));

      // Act
      try {
        await handleCheckNotionPageExistsMessage(request, mockSendResponse);
      } catch {
        // 預期會有錯誤
      }

      // Assert
      expect(console.error).toHaveBeenCalledWith('❌ 處理檢查頁面存在消息失敗:', expect.any(Error));
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Check failed',
      });
    });
  });

  describe('handleOpenNotionPage', () => {
    test('應該成功打開 Notion 頁面', () => {
      // Arrange
      const request = buildOpenPageRequest();
      const mockSendResponse = jest.fn();
      const mockTab = { id: 123, url: request.url };

      mockTabCreationResult(mockChrome.tabs.create, mockTab);

      // Act
      handleOpenNotionPage(request, mockSendResponse);

      // Assert
      expect(mockChrome.tabs.create).toHaveBeenCalledWith(
        { url: request.url },
        expect.any(Function)
      );
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        tabId: mockTab.id,
      });
    });

    test('應該處理缺少 URL 的請求', () => {
      // Arrange
      const request = {};
      const mockSendResponse = jest.fn();

      // Act
      handleOpenNotionPage(request, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Missing URL parameter',
      });
    });

    test('應該處理創建標籤頁失敗', () => {
      // Arrange
      const request = buildOpenPageRequest();
      const mockSendResponse = jest.fn();

      mockChrome.runtime.lastError = { message: 'Tab creation failed' };
      mockTabCreationResult(mockChrome.tabs.create, null);

      // Act
      handleOpenNotionPage(request, mockSendResponse);

      // Assert
      expect(console.error).toHaveBeenCalledWith(
        '❌ 打開標籤頁失敗:',
        mockChrome.runtime.lastError
      );
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Tab creation failed',
      });
    });

    test('應該處理異常錯誤', () => {
      // Arrange
      const request = { url: 'https://notion.so/test-page' };
      const mockSendResponse = jest.fn();

      mockChrome.tabs.create.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Act
      handleOpenNotionPage(request, mockSendResponse);

      // Assert
      expect(console.error).toHaveBeenCalledWith('❌ 處理打開 Notion 頁面失敗:', expect.any(Error));
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unexpected error',
      });
    });
  });

  describe('集成測試', () => {
    test('完整的頁面檢查流程應該正常工作', async () => {
      // Arrange
      const pageId = 'test-page-id';
      const apiKey = 'test-api-key';
      const request = { pageId };
      const mockSendResponse = jest.fn();
      const mockPageData = { id: pageId, object: 'page' };

      mockNotionApiToken(mockChrome.storage.sync.get, apiKey);

      globalThis.fetch.mockResolvedValue(buildNotionPageResponse(mockPageData));

      // Act
      await handleCheckNotionPageExistsMessage(request, mockSendResponse);

      // 等待異步操作完成
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${NOTION_API_BASE_URL}/pages/${pageId}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
          }),
        })
      );
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        exists: true,
        error: undefined,
      });
    });

    test('完整的頁面打開流程應該正常工作', () => {
      // Arrange
      const url = 'https://notion.so/test-page-123';
      const request = buildOpenPageRequest(url);
      const mockSendResponse = jest.fn();
      const mockTab = { id: 456, url };

      mockChrome.tabs.create.mockImplementation((options, mockCb) => {
        expect(options.url).toBe(url);
        mockCb(mockTab);
      });

      // Act
      handleOpenNotionPage(request, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalled();
    });
  });

  describe('錯誤處理和邊界情況', () => {
    test('checkNotionPageExists 應該處理空參數', async () => {
      // Arrange
      globalThis.fetch.mockRejectedValue(new Error('Invalid parameters'));

      // Act & Assert
      const result1 = await checkNotionPageExists('', 'api-key');
      expect(result1.exists).toBe(false);
      expect(result1.error).toBeDefined();

      const result2 = await checkNotionPageExists('page-id', '');
      expect(result2.exists).toBe(false);
      expect(result2.error).toBeDefined();
    });

    test('handleOpenNotionPage 應該處理無效 URL', () => {
      // Arrange
      const request = { url: 'invalid-url' };
      const mockSendResponse = jest.fn();

      // 重置 lastError
      mockChrome.runtime.lastError = null;

      // 模擬標籤頁創建成功（Chrome 會處理無效 URL）
      mockChrome.tabs.create.mockImplementation((options, mockCb) => {
        const mockTab = { id: 123, url: options.url };
        mockCb(mockTab);
      });

      // Act
      handleOpenNotionPage(request, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        tabId: 123,
      });
    });

    test('應該處理 Chrome API 不可用的情況', () => {
      // Arrange
      const request = { url: 'https://notion.so/test' };
      const mockSendResponse = jest.fn();

      // 模擬 Chrome API 錯誤
      mockChrome.tabs.create.mockImplementation(() => {
        throw new Error('Chrome API not available');
      });

      // Act
      handleOpenNotionPage(request, mockSendResponse);

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Chrome API not available',
      });
    });
  });
});
