import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
  getDestinationState,
  getPopupAccountState,
  startAccountLogin,
  openAccountManagement,
} from '../../../popup/popupActions.js';
import { ERROR_MESSAGES } from '../../../scripts/config/shared/messages.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';
import Logger from '../../../scripts/utils/Logger.js';

jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
  },
}));

jest.mock('../../../scripts/auth/accountSession.js', () => ({
  getAccountProfile: jest.fn(),
  getAccountAccessToken: jest.fn(),
}));

describe('popupActions.js', () => {
  const {
    getAccountProfile,
    getAccountAccessToken,
  } = require('../../../scripts/auth/accountSession.js');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    // 確保每次測試前 storage 是空的
    chrome._clearStorage();
    BUILD_ENV.ENABLE_ACCOUNT = true;
    BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test';
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

    it('當 OAuth 已連接但缺少保存目標時應返回 missing_data_source', async () => {
      await chrome.storage.local.set({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'test-token',
      });

      const result = await checkSettings();

      expect(result.valid).toBe(false);
      expect(result.missingReason).toBe('missing_data_source');
    });

    it('當完全缺少授權設定時應返回 missing_auth', async () => {
      const result = await checkSettings();

      expect(result.valid).toBe(false);
      expect(result.missingReason).toBe('missing_auth');
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

    it('有 profileId 時應帶入 savePage payload', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });

      const result = await savePage('profile-2');

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'savePage',
        profileId: 'profile-2',
      });
      expect(result.success).toBe(true);
    });

    it.each([null, ''])('當 sendMessage 回傳 %p 時應該提供 fallback 回傳值', async response => {
      chrome.runtime.sendMessage.mockResolvedValueOnce(response);
      const result = await savePage();
      expect(result.success).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE);
    });

    it('當 sendMessage 拋例外時應該被捕捉並提供錯誤訊息', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated'));
      const result = await savePage();
      expect(result.success).toBe(false);
      expect(result.error).toBe('無法儲存頁面，請稍後再試');
    });
  });

  describe('getDestinationState', () => {
    it('應從 destination profile service 讀取 profiles 與 last-used', async () => {
      await chrome.storage.local.set({
        destinationProfiles: [
          {
            id: 'default',
            name: 'Default',
            icon: 'bookmark',
            color: '#2563eb',
            notionDataSourceId: 'db-1',
            notionDataSourceType: 'database',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'profile-2',
            name: 'Research',
            icon: 'book-open',
            color: '#16a34a',
            notionDataSourceId: 'page-1',
            notionDataSourceType: 'page',
            createdAt: 2,
            updatedAt: 2,
          },
        ],
        destinationLastUsedProfileId: 'profile-2',
      });

      const result = await getDestinationState();

      expect(result.profiles).toHaveLength(2);
      expect(result.selectedProfileId).toBe('profile-2');
      expect(result.entitlement.maxProfiles).toBeGreaterThanOrEqual(1);
    });

    it('last-used 讀取失敗時仍應保留 profiles 並回退選第一個 profile', async () => {
      await chrome.storage.local.set({
        destinationProfiles: [
          {
            id: 'default',
            name: 'Default',
            icon: 'bookmark',
            color: '#2563eb',
            notionDataSourceId: 'db-1',
            notionDataSourceType: 'database',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        destinationLastUsedProfileId: 'default',
      });
      const originalGet = chrome.storage.local.get;
      let getCallCount = 0;
      chrome.storage.local.get = jest.fn(keys => {
        getCallCount += 1;
        const keyList = Array.isArray(keys) ? keys : [keys];
        if (getCallCount >= 3 && keyList.includes('destinationLastUsedProfileId')) {
          return Promise.reject(new Error('last-used failed'));
        }
        return originalGet.call(chrome.storage.local, keys);
      });

      const result = await getDestinationState();

      expect(result.profiles).toHaveLength(1);
      expect(result.selectedProfileId).toBe('default');
      expect(result.entitlement).toEqual(expect.objectContaining({ maxProfiles: 1 }));
      expect(Logger.warn).toHaveBeenCalledWith(
        'getDestinationState getLastUsedProfile failed:',
        expect.any(Error)
      );
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

    it.each([undefined, null])('當 sendMessage 回傳 %p 時應提供 fallback', async response => {
      chrome.runtime.sendMessage.mockResolvedValueOnce(response);
      const result = await startHighlight();
      expect(result.success).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE);
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

  describe('account actions', () => {
    beforeEach(() => {
      getAccountProfile.mockReset();
      getAccountAccessToken.mockReset();
      chrome.runtime.id = 'ext_id_123';
    });

    it('未登入時應回傳 logged out 狀態', async () => {
      getAccountProfile.mockResolvedValue(null);

      const result = await getPopupAccountState();

      expect(result).toEqual({
        enabled: true,
        isLoggedIn: false,
        profile: null,
        transientRefreshError: false,
      });
    });

    it('已登入時應回傳 profile 與 logged in 狀態', async () => {
      const profile = {
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      };
      getAccountProfile.mockResolvedValue(profile);
      getAccountAccessToken.mockResolvedValue('token-123');

      const result = await getPopupAccountState();

      expect(result).toEqual({
        enabled: true,
        isLoggedIn: true,
        profile,
        transientRefreshError: false,
      });
    });

    it('token 暫時刷新失敗時應保留 logged in 狀態並標記 transientRefreshError', async () => {
      const profile = {
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      };
      getAccountProfile.mockResolvedValue(profile);
      getAccountAccessToken.mockRejectedValue(new Error('transient refresh failure'));

      const result = await getPopupAccountState();

      expect(result).toEqual({
        enabled: true,
        isLoggedIn: true,
        profile,
        transientRefreshError: true,
      });
    });

    it('feature flag 關閉時應回傳 disabled account state', async () => {
      BUILD_ENV.ENABLE_ACCOUNT = false;

      const result = await getPopupAccountState();

      expect(result).toEqual({
        enabled: false,
        isLoggedIn: false,
        profile: null,
        transientRefreshError: false,
      });
    });

    it('startAccountLogin 應以正確 query 開啟 Google start URL', async () => {
      await startAccountLogin();

      const [{ url }] = chrome.tabs.create.mock.calls[0];
      const startUrl = new URL(url);

      expect(startUrl.origin).toBe('https://worker.test');
      expect(startUrl.pathname).toBe('/v1/account/google/start');
      expect(startUrl.searchParams.get('ext_id')).toBe('ext_id_123');
      expect(startUrl.searchParams.get('callback_mode')).toBe('bridge');
    });

    it('startAccountLogin 應保留 OAUTH_SERVER_URL 的 path prefix', async () => {
      BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test/proxy';

      await startAccountLogin();

      const [{ url }] = chrome.tabs.create.mock.calls[0];
      expect(new URL(url).pathname).toBe('/proxy/v1/account/google/start');
    });

    it('缺少 OAUTH_SERVER_URL 時不應開登入頁並返回錯誤', async () => {
      BUILD_ENV.OAUTH_SERVER_URL = '';

      const result = await startAccountLogin();

      expect(result.success).toBe(false);
      expect(result.error).toContain('登入設定異常');
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it('openAccountManagement 應打開 options advanced deep link', async () => {
      chrome.runtime.getURL = jest.fn(path => `chrome-extension://ext_id_123/${path}`);

      const result = await openAccountManagement();

      expect(result.success).toBe(true);
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('options/options.html?section=advanced');
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://ext_id_123/options/options.html?section=advanced',
      });
    });

    it('startAccountLogin 開啟 tab 失敗時應以 structured error context 記錄', async () => {
      const error = new Error('tabs unavailable');
      chrome.tabs.create.mockRejectedValue(error);

      const result = await startAccountLogin();

      expect(result.success).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith('startAccountLogin failed', {
        action: 'startAccountLogin',
        error,
      });
    });

    it('openAccountManagement 開啟 tab 失敗時應以 structured error context 記錄', async () => {
      const error = new Error('tabs unavailable');
      chrome.tabs.create.mockRejectedValue(error);

      const result = await openAccountManagement();

      expect(result.success).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith('openAccountManagement failed', {
        action: 'openAccountManagement',
        error,
      });
    });
  });
});
