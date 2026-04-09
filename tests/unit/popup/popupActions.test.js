import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
} from '../../../popup/popupActions.js';
import Logger from '../../../scripts/utils/Logger.js';

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

      const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = jest.fn(
        items =>
          new Promise(resolve => {
            setTimeout(async () => {
              await originalSet(items);
              resolve();
            }, 0);
          })
      );

      await checkSettings();

      // 驗證自動遷移：local 應被寫入
      const localData = await chrome.storage.local.get(['notionDataSourceId', 'notionDatabaseId']);
      expect(localData.notionDataSourceId).toBe('sync-db-id');
      expect(localData.notionDatabaseId).toBe('sync-db-id');
    });

    it('當 sync 僅有 notionDatabaseId (legacy key) 時，應回退並正確遷移', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDatabaseId: 'legacy-sync-id',
      });

      const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = jest.fn(
        items =>
          new Promise(resolve => {
            setTimeout(async () => {
              await originalSet(items);
              resolve();
            }, 0);
          })
      );

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('legacy-sync-id');

      const localData = await chrome.storage.local.get(['notionDataSourceId', 'notionDatabaseId']);
      expect(localData.notionDataSourceId).toBe('legacy-sync-id');
      expect(localData.notionDatabaseId).toBe('legacy-sync-id');
    });

    it('當 chrome.storage.local.set 拋錯時，checkSettings 仍應正常回傳', async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'sync-db-id',
      });

      const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = jest.fn().mockRejectedValueOnce(new Error('Quota exceeded'));

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('sync-db-id');

      // 還原
      chrome.storage.local.set = originalSet;
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

    it('當 sendMessage 回傳 null / empty 時應該提供 fallback 回傳值', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce(null);
      const result = await savePage();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No response');
    });

    it('當 sendMessage 拋例外時應該被捕捉並提供錯誤訊息', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated'));
      const result = await savePage();
      expect(result.success).toBe(false);
      expect(result.error).toBe('無法儲存頁面，請稍後再試');
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

    it('當 sendMessage 回傳 undefined 時應提供 fallback', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce(undefined);
      const result = await startHighlight();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No response');
    });

    it('當 sendMessage 拋例外時應該被捕捉', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Network disconnected'));
      const result = await startHighlight();
      expect(result.success).toBe(false);
      expect(result.error).toBe('無法啟動標記模式，請稍後再試');
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

    it('對於無效 URL 應記錄脫敏後的網址', async () => {
      const url = 'https://malicious.com/callback?token=secret123&state=abc';
      const warnSpy = jest.spyOn(Logger, 'warn');

      await openNotionPage(url);

      expect(warnSpy).toHaveBeenCalledWith(
        'Blocked invalid URL:',
        'https://malicious.com/callback?token=[REDACTED_TOKEN]&state=abc'
      );
      warnSpy.mockRestore();
    });

    it('當 chrome.tabs.create 失敗時應捕捉例外並反映錯誤', async () => {
      const url = 'https://www.notion.so/test';
      chrome.tabs.create.mockRejectedValueOnce(new Error('Tab creation failed'));

      const result = await openNotionPage(url);
      expect(result.success).toBe(false);
      expect(result.error).toBe('無法開啟 Notion 頁面');
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

    it('當 chrome.tabs.query 拋例外時應捕捉並回傳 null', async () => {
      chrome.tabs.query.mockRejectedValueOnce(new Error('Permissions error'));
      const result = await getActiveTab();
      expect(result).toBeNull();
    });
  });
});
