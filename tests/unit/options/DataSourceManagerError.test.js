/**
 * @jest-environment jsdom
 */
import { DataSourceManager } from '../../../scripts/options/DataSourceManager.js';
import { UIManager } from '../../../scripts/options/UIManager.js';

// Mock chrome API
globalThis.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    lastError: null,
  },
};

describe('DataSourceManager Messaging Error Handling', () => {
  let dataSourceManager;
  let mockUiManager;

  beforeEach(() => {
    mockUiManager = new UIManager();
    mockUiManager.showStatus = jest.fn();
    dataSourceManager = new DataSourceManager(mockUiManager);

    // Reset mocks
    jest.clearAllMocks();
    globalThis.chrome.runtime.lastError = null;
  });

  test('_fetchFromNotion 應該正確處理 chrome.runtime.lastError', async () => {
    const mockError = { message: 'Background script not ready' };

    // 模擬 sendMessage 失敗並設置 lastError
    globalThis.chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      globalThis.chrome.runtime.lastError = mockError;
      callback(undefined);
    });

    const apiKey = 'test-key';
    const params = { query: 'test' };

    const response = await dataSourceManager._fetchFromNotion(apiKey, params);

    expect(response).toEqual({
      success: false,
      error: 'Background script not ready',
    });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalled();
  });

  test('_fetchFromNotion 在沒有錯誤時應該回傳正常回應', async () => {
    const mockResponse = { success: true, data: { results: [] } };

    globalThis.chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      globalThis.chrome.runtime.lastError = null;
      callback(mockResponse);
    });

    const response = await dataSourceManager._fetchFromNotion('key', {});

    expect(response).toEqual(mockResponse);
    expect(globalThis.chrome.runtime.lastError).toBeNull();
  });

  describe('_handleLoadFailure Security', () => {
    test('不應該直接顯示原始的物件錯誤訊息 (防止資訊洩漏)', () => {
      const rawError = {
        code: 'unauthorized',
        message: 'Internal details with API key secret_123',
      };
      const response = { success: false, error: rawError };

      dataSourceManager._handleLoadFailure(response, null, false);

      // 驗證 showStatus 呼叫的內容不包含原始的敏感訊息
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.not.stringContaining('secret_123'),
        'error'
      );

      // 應該顯示經過翻譯或清理後的訊息
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error'
      );
    });
  });
});
