import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
  clearHighlights,
} from '../../../popup/popupActions.js';

describe('popupActions.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 確保每次測試前 storage 是空的
    chrome._clearStorage();
  });

  describe('checkSettings', () => {
    it('當設置完整時應該返回 valid: true', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'test-db',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.apiKey).toBe('test-key');
      expect(result.dataSourceId).toBe('test-db');
    });

    it('當缺少 API Key 時應該返回 valid: false', async () => {
      await chrome.storage.sync.set({
        notionDataSourceId: 'test-db',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(false);
    });

    it('當缺少 Data Source ID 時應該返回 valid: false', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(false);
    });

    it('應該同時支持 notionDataSourceId 和 notionDatabaseId (兼容性檢查)', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDatabaseId: 'old-db-id',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('old-db-id');
    });
  });

  describe('checkPageStatus', () => {
    it('應該發送正確的訊息', async () => {
      chrome.runtime.sendMessage.mockImplementation(msg => {
        if (msg.action === 'checkPageStatus') {
          return Promise.resolve({ success: true, isSaved: true });
        }
        return Promise.resolve({ success: true });
      });
      const result = await checkPageStatus({ forceRefresh: true });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkPageStatus',
          forceRefresh: true,
        })
      );
      expect(result.isSaved).toBe(true);
    });

    it('當失敗時應該返回 success: false', async () => {
      chrome.runtime.sendMessage.mockImplementation(msg => {
        if (msg.action === 'checkPageStatus') {
          throw new Error('Fail');
        }
        return Promise.resolve({ success: true });
      });
      const result = await checkPageStatus();
      expect(result.success).toBe(false);
    });
  });

  describe('savePage', () => {
    it('應該調用 savePage 動作', async () => {
      chrome.runtime.sendMessage.mockImplementation(msg => {
        if (msg.action === 'savePage') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });
      const result = await savePage();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'savePage' })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('startHighlight', () => {
    it('應該調用 startHighlight 動作', async () => {
      chrome.runtime.sendMessage.mockImplementation(msg => {
        if (msg.action === 'startHighlight') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });
      const result = await startHighlight();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'startHighlight' })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('openNotionPage', () => {
    it('對於有效的 URL 應該創建新標籤頁', async () => {
      const url = 'https://www.notion.so/test-page';
      const result = await openNotionPage(url);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url });
      expect(result.success).toBe(true);
    });

    it('對於無效的 URL 應該拒絕並返回錯誤', async () => {
      const url = 'https://malicious.com';
      const result = await openNotionPage(url);
      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('無效的 Notion URL');
    });
  });

  describe('getActiveTab', () => {
    it('應該返回當前活動標籤', async () => {
      const mockTab = { id: 1, url: 'https://example.com' };
      chrome.tabs.query.mockResolvedValue([mockTab]);
      const result = await getActiveTab();
      expect(result).toEqual(mockTab);
    });

    it('如果沒有活動標籤應該返回 null', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      const result = await getActiveTab();
      expect(result).toBeNull();
    });
  });

  describe('clearHighlights', () => {
    it('應該在頁面中執行清除腳本', async () => {
      const tabId = 123;
      const tabUrl = 'https://example.com/page';
      chrome.scripting.executeScript.mockResolvedValue([{ result: 10 }]);

      const result = await clearHighlights(tabId, tabUrl);

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId },
          func: expect.any(Function),
          args: expect.any(Array),
        })
      );
      expect(result.success).toBe(true);
      expect(result.clearedCount).toBe(10);
    });

    it('處理執行失敗的情況', async () => {
      chrome.scripting.executeScript.mockRejectedValue(new Error('Script error'));
      const result = await clearHighlights(123, 'url');
      expect(result.success).toBe(false);
      expect(result.error).toBe('無法清除標記');
    });
  });
});
