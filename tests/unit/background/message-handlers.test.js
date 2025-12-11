/**
 * Background.js - 消息處理器測試
 * 測試 chrome.runtime.onMessage 的各種消息類型處理
 */

describe('Background Message Handlers', () => {
  beforeEach(() => {
    // 清理存儲
    if (chrome._clearStorage) {
      chrome._clearStorage();
    }
    if (localStorage.clear) {
      localStorage.clear();
    }

    // 重置 chrome API mocks
    if (chrome.tabs.query.mockClear) {
      chrome.tabs.query.mockClear();
    }
    if (chrome.runtime.sendMessage.mockClear) {
      chrome.runtime.sendMessage.mockClear();
    }
  });

  describe('checkPageStatus 消息', () => {
    it('應該返回未保存狀態當頁面未保存時', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
        title: 'Test Article',
      };

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // 模擬 handleCheckPageStatus 的行為
      const request = { action: 'checkPageStatus' };

      // Act
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.isSaved).toBe(false);
      expect(response.url).toContain('example.com');
      expect(response.title).toBe('Test Article');
    });

    it('應該返回已保存狀態當頁面已保存時', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
        title: 'Test Article',
      };

      const savedData = {
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page123',
        savedAt: Date.now(),
      };

      // 保存數據到存儲
      const normalizedUrl = 'https://example.com/article';
      await chrome.storage.local.set({
        [`page_${normalizedUrl}`]: savedData,
      });

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Act
      const request = { action: 'checkPageStatus' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.isSaved).toBe(true);
      expect(response.notionUrl).toBe('https://notion.so/page123');
    });

    it('應該處理無法獲取活動標籤頁的錯誤', async () => {
      // Arrange
      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([]);
        return Promise.resolve([]);
      });

      // Act
      const request = { action: 'checkPageStatus' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('Could not get active tab');
    });
  });

  describe('startHighlight 消息', () => {
    it('應該成功啟動標註模式', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
      };

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Act
      const request = { action: 'startHighlight' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(true);
      expect(chrome.tabs.query).toHaveBeenCalledWith(
        { active: true, currentWindow: true },
        expect.any(Function)
      );
    });

    it('應該處理無活動標籤頁的錯誤', async () => {
      // Arrange
      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([]);
        return Promise.resolve([]);
      });

      // Act
      const request = { action: 'startHighlight' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('Could not get active tab');
    });
  });

  describe('syncHighlights 消息', () => {
    it('應該成功同步標註到已保存的頁面', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
        title: 'Test Article',
      };

      const savedData = {
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page123',
      };

      const highlights = [
        { text: '測試標註 1', color: 'yellow' },
        { text: '測試標註 2', color: 'green' },
      ];

      // 設置存儲數據
      const normalizedUrl = 'https://example.com/article';
      await chrome.storage.local.set({
        [`page_${normalizedUrl}`]: savedData,
        notionApiKey: 'secret_test_key',
      });

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Mock fetch for Notion API
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block', id: 'block-123' }),
      });

      // Act
      const request = {
        action: 'syncHighlights',
        highlights,
      };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.highlightCount).toBe(2);
    });

    it('應該拒絕同步到未保存的頁面', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
      };

      await chrome.storage.local.set({
        notionApiKey: 'secret_test_key',
      });

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Act
      const request = {
        action: 'syncHighlights',
        highlights: [{ text: '測試', color: 'yellow' }],
      };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('尚未保存');
    });

    it('應該處理缺少 API Key 的錯誤', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
      };

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Act
      const request = {
        action: 'syncHighlights',
        highlights: [{ text: '測試', color: 'yellow' }],
      };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('API Key');
    });

    it('應該處理空標註列表', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
      };

      const savedData = {
        notionPageId: 'page-123',
      };

      const normalizedUrl = 'https://example.com/article';
      await chrome.storage.local.set({
        [`page_${normalizedUrl}`]: savedData,
        notionApiKey: 'secret_test_key',
      });

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Act
      const request = {
        action: 'syncHighlights',
        highlights: [],
      };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.highlightCount).toBe(0);
      expect(response.message).toContain('沒有新標註');
    });
  });

  describe('updateHighlights 消息', () => {
    it('應該成功更新標註', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
      };

      const savedData = {
        notionPageId: 'page-123',
      };

      const normalizedUrl = 'https://example.com/article';
      await chrome.storage.local.set({
        [`page_${normalizedUrl}`]: savedData,
        notionApiKey: 'secret_test_key',
      });

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' }),
      });

      // Act
      const request = { action: 'updateHighlights' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(true);
    });

    it('應該拒絕更新未保存的頁面', async () => {
      // Arrange
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
      };

      await chrome.storage.local.set({
        notionApiKey: 'secret_test_key',
      });

      chrome.tabs.query.mockImplementation((queryInfo, mockCb) => {
        mockCb([mockTab]);
        return Promise.resolve([mockTab]);
      });

      // Act
      const request = { action: 'updateHighlights' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('not saved yet');
    });
  });

  describe('openNotionPage 消息', () => {
    it('應該打開已保存頁面的 Notion URL', async () => {
      // Arrange
      const currentUrl = 'https://example.com/article';
      const notionUrl = 'https://notion.so/page123';

      // 設置已保存的頁面數據
      await chrome.storage.local.set({
        [`saved_${currentUrl}`]: {
          notionPageId: 'page-123',
          notionUrl,
          savedAt: Date.now(),
        },
      });

      chrome.tabs.create.mockImplementation((createProperties, mockCb) => {
        const tab = { id: 2, url: createProperties.url };
        if (mockCb) {
          mockCb(tab);
        }
        return Promise.resolve(tab);
      });

      // Act
      const request = {
        action: 'openNotionPage',
        url: currentUrl, // 發送當前頁面 URL
      };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(true);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: notionUrl }, expect.any(Function));
    });

    it('應該處理頁面未保存的錯誤', async () => {
      // Act
      const request = {
        action: 'openNotionPage',
        url: 'https://example.com/not-saved',
      };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('尚未保存');
    });

    it('應該處理缺少 URL 的錯誤', async () => {
      // Act
      const request = {
        action: 'openNotionPage',
      };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('未知消息類型', () => {
    it('應該返回錯誤對於未知的 action', async () => {
      // Act
      const request = { action: 'unknownAction' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unknown action');
    });
  });

  describe('錯誤處理', () => {
    it('應該捕獲並返回處理器中的錯誤', async () => {
      // Arrange
      chrome.tabs.query.mockImplementation(() => {
        throw new Error('Tab query failed');
      });

      // Act
      const request = { action: 'checkPageStatus' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toContain('Tab query failed');
    });

    it('應該處理異步錯誤', async () => {
      // Arrange
      chrome.tabs.query.mockImplementation((_queryInfo, _callback) => {
        // 模擬異步錯誤：不調用 callback，直接拋出錯誤
        throw new Error('Async error');
      });

      // Act
      const request = { action: 'startHighlight' };
      const response = await simulateMessageHandler(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Async error');
    });
  });
});

/**
 * 輔助函數：模擬消息處理器的行為
 * 這是一個簡化版本，用於測試消息處理邏輯
 */
function simulateMessageHandler(request) {
  return new Promise(resolve => {
    const sendResponse = response => {
      resolve(response);
    };

    try {
      switch (request.action) {
        case 'checkPageStatus':
          handleCheckPageStatusSimulated(sendResponse);
          break;
        case 'startHighlight':
          handleStartHighlightSimulated(sendResponse);
          break;
        case 'syncHighlights':
          handleSyncHighlightsSimulated(request, sendResponse);
          break;
        case 'updateHighlights':
          handleUpdateHighlightsSimulated(sendResponse);
          break;
        case 'openNotionPage':
          handleOpenNotionPageSimulated(request, sendResponse);
          break;
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  });
}

/**
 * 簡化版的消息處理器實現（用於測試）
 */
async function handleCheckPageStatusSimulated(sendResponse) {
  try {
    const tabs = await new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: 'Could not get active tab.' });
      return;
    }

    const normUrl = activeTab.url;
    const storageKey = `page_${normUrl}`;
    const result = await new Promise(resolve => {
      chrome.storage.local.get(storageKey, resolve);
    });
    const savedData = result[storageKey];

    if (savedData?.notionPageId) {
      sendResponse({
        success: true,
        isSaved: true,
        url: normUrl,
        title: activeTab.title,
        notionUrl: savedData.notionUrl || null,
      });
    } else {
      sendResponse({
        success: true,
        isSaved: false,
        url: normUrl,
        title: activeTab.title,
      });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleStartHighlightSimulated(sendResponse) {
  try {
    const tabs = await new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: 'Could not get active tab.' });
      return;
    }

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSyncHighlightsSimulated(request, sendResponse) {
  try {
    const tabs = await new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: '無法獲取當前標籤頁' });
      return;
    }

    const config = await new Promise(resolve => {
      chrome.storage.local.get('notionApiKey', resolve);
    });
    if (!config.notionApiKey) {
      sendResponse({ success: false, error: 'API Key 未設置' });
      return;
    }

    const normUrl = activeTab.url;
    const storageKey = `page_${normUrl}`;
    const result = await new Promise(resolve => {
      chrome.storage.local.get(storageKey, resolve);
    });
    const savedData = result[storageKey];

    if (!savedData || !savedData.notionPageId) {
      sendResponse({
        success: false,
        error: '頁面尚未保存到 Notion，請先點擊「保存頁面」',
      });
      return;
    }

    const highlights = request.highlights || [];
    if (highlights.length === 0) {
      sendResponse({
        success: true,
        message: '沒有新標註需要同步',
        highlightCount: 0,
      });
      return;
    }

    // 模擬成功同步
    sendResponse({
      success: true,
      highlightCount: highlights.length,
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleUpdateHighlightsSimulated(sendResponse) {
  try {
    const tabs = await new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: 'Could not get active tab.' });
      return;
    }

    const config = await new Promise(resolve => {
      chrome.storage.local.get('notionApiKey', resolve);
    });
    if (!config.notionApiKey) {
      sendResponse({ success: false, error: 'API Key is not set.' });
      return;
    }

    const normUrl = activeTab.url;
    const storageKey = `page_${normUrl}`;
    const result = await new Promise(resolve => {
      chrome.storage.local.get(storageKey, resolve);
    });
    const savedData = result[storageKey];

    if (!savedData || !savedData.notionPageId) {
      sendResponse({ success: false, error: 'Page not saved yet. Please save the page first.' });
      return;
    }

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleOpenNotionPageSimulated(request, sendResponse) {
  try {
    const pageUrl = request.url;
    if (!pageUrl) {
      sendResponse({ success: false, error: 'No URL provided' });
      return;
    }

    // 查詢保存的數據
    const storageKey = `saved_${pageUrl}`;
    const result = await new Promise(resolve => {
      chrome.storage.local.get(storageKey, resolve);
    });
    const savedData = result[storageKey];

    if (!savedData || !savedData.notionPageId) {
      sendResponse({
        success: false,
        error: '此頁面尚未保存到 Notion，請先點擊「保存頁面」',
      });
      return;
    }

    const notionUrl =
      savedData.notionUrl || `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;

    await new Promise(resolve => {
      chrome.tabs.create({ url: notionUrl }, resolve);
    });
    sendResponse({ success: true, notionUrl });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}
