import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
  clearHighlights,
  clearHighlightsInPage,
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
      });
      await chrome.storage.local.set({
        notionDataSourceId: 'test-db',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.apiKey).toBe('test-key');
      expect(result.dataSourceId).toBe('test-db');
    });

    it('當缺少 API Key 時應該返回 valid: false', async () => {
      await chrome.storage.local.set({
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

    it('當缺少 API Key 但處於 OAuth 模式時應該返回 valid: true', async () => {
      await chrome.storage.local.set({
        notionDataSourceId: 'test-db',
        notionAuthMode: 'oauth',
        notionOAuthToken: 'test-token',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('test-db');
    });

    it('應該同時支持 notionDataSourceId 和 notionDatabaseId (兼容性檢查)', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
      });
      await chrome.storage.local.set({
        notionDatabaseId: 'old-db-id',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('old-db-id');
    });

    it('當 local 無 dataSourceId 但 sync 有時，應回退讀取 sync 並返回 valid: true', async () => {
      // 模擬 v2.47.0 前的升級用戶：dataSourceId 只在 sync
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'sync-db-id',
      });
      // local 中沒有 notionDataSourceId

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('sync-db-id');
    });

    it('當 sync 回退觸發時，應自動遷移 dataSourceId 至 local', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'sync-db-id',
      });

      await checkSettings();

      // 驗證自動遷移：local 應被寫入
      const localData = await chrome.storage.local.get(['notionDataSourceId', 'notionDatabaseId']);
      expect(localData.notionDataSourceId).toBe('sync-db-id');
      expect(localData.notionDatabaseId).toBe('sync-db-id');
    });

    it('當 local 和 sync 都有 dataSourceId 時，應優先使用 local', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'sync-db-id',
      });
      await chrome.storage.local.set({
        notionDataSourceId: 'local-db-id',
      });

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('local-db-id');
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

  describe('clearHighlightsInPage', () => {
    let originalChrome;
    let removeItemSpy;

    beforeEach(() => {
      // 設置 DOM
      document.body.innerHTML = `
        <div id="container">
          <span class="simple-highlight">text1</span>
          <span class="simple-highlight">text2</span>
        </div>
      `;

      // 備份全域物件
      originalChrome = globalThis.chrome;

      // Mock localStorage 使用 spyOn 來避免直接覆寫唯讀屬性
      removeItemSpy = jest
        .spyOn(Object.getPrototypeOf(globalThis.localStorage), 'removeItem')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      // 恢復全域物件
      globalThis.chrome = originalChrome;
      document.body.innerHTML = '';
      removeItemSpy.mockRestore();
      jest.clearAllMocks();
    });

    it('應該從 DOM 中移除標記並還原文字', async () => {
      const parent = document.querySelector('#container');

      const count = await clearHighlightsInPage('test-key');

      expect(count).toBe(2);
      expect(document.querySelectorAll('.simple-highlight')).toHaveLength(0);
      expect(parent.textContent.replaceAll(/\s+/g, ' ').trim()).toBe('text1 text2');
    });

    it('當 chrome.storage.local 可用時應清除', async () => {
      globalThis.chrome = {
        storage: {
          local: {
            remove: jest.fn(),
          },
        },
      };

      await clearHighlightsInPage('test-key');

      expect(globalThis.chrome.storage.local.remove).toHaveBeenCalledWith(['test-key']);
      expect(globalThis.localStorage.removeItem).not.toHaveBeenCalled();
    });

    it('當 chrome.storage.local 不可用時應降級使用 localStorage', async () => {
      globalThis.chrome = undefined; // 模擬 content script 無法存取 chrome 的情況

      await clearHighlightsInPage('test-key');

      expect(globalThis.localStorage.removeItem).toHaveBeenCalledWith('test-key');
    });

    it('當 chrome.storage.local 拋出錯誤時應降級使用 localStorage', async () => {
      globalThis.chrome = {
        storage: {
          local: {
            remove: jest.fn().mockImplementation(() => {
              throw new Error('Storage error');
            }),
          },
        },
      };

      await clearHighlightsInPage('test-key');

      expect(globalThis.chrome.storage.local.remove).toHaveBeenCalledWith(['test-key']);
      expect(globalThis.localStorage.removeItem).toHaveBeenCalledWith('test-key');
    });

    it('當 localStorage 也拋出錯誤時應靜默處理', async () => {
      globalThis.chrome = undefined;
      globalThis.localStorage.removeItem.mockImplementationOnce(() => {
        throw new Error('LocalStorage error');
      });

      // 不應該拋出錯誤
      await expect(clearHighlightsInPage('test-key')).resolves.not.toThrow();
    });
  });
});
