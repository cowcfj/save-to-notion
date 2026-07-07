import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_MESSAGES } from '../../../../scripts/config/shared/messages.js';

const mockEnvModule = {
  BUILD_ENV: {
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
  },
};

const mockAccountSessionModule = {
  getAccountProfile: jest.fn(),
  getAccountAccessToken: jest.fn(),
  getAccountSession: jest.fn(),
  isAccountSessionExpired: jest.fn(),
};

await jest.unstable_mockModule('../../../../scripts/config/env/index.js', () => mockEnvModule);
await jest.unstable_mockModule(
  '../../../../scripts/auth/accountSession.js',
  () => mockAccountSessionModule
);

let checkSettings;
let checkPageStatus;
let savePage;
let startHighlight;
let openNotionPage;
let getActiveTab;
let getDestinationState;
let getPopupAccountState;
let startAccountLogin;
let openAccountManagement;
let setPopupTempProfile;
let BUILD_ENV;
let Logger;
let ProfileManager;
let getAccountProfile;
let getAccountAccessToken;
let getAccountSession;
let isAccountSessionExpired;

beforeAll(async () => {
  ({
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
    setPopupTempProfile,
  } = await import('../../../../pages/popup/popupActions.js'));
  ({ BUILD_ENV } = await import('../../../../scripts/config/env/index.js'));
  ({ default: Logger } = await import('../../../../scripts/utils/Logger.js'));
  ({ ProfileManager } = await import('../../../../scripts/destinations/ProfileManager.js'));
  ({ getAccountProfile, getAccountAccessToken, getAccountSession, isAccountSessionExpired } =
    await import('../../../../scripts/auth/accountSession.js'));
});

function selectDefinedStorageKeys(storageData, keys) {
  return Object.fromEntries(
    keys.filter(key => storageData[key] !== undefined).map(key => [key, storageData[key]])
  );
}

function selectStorageDefaults(storageData, defaults) {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      storageData[key] === undefined ? defaultValue : storageData[key],
    ])
  );
}

function selectStorageKeys(storageData, keys) {
  if (typeof keys === 'string') {
    return selectDefinedStorageKeys(storageData, [keys]);
  }
  if (Array.isArray(keys)) {
    return selectDefinedStorageKeys(storageData, keys);
  }
  if (keys === null || keys === undefined) {
    return { ...storageData };
  }
  return selectStorageDefaults(storageData, keys);
}

function createStorageArea(storageData) {
  return {
    get: jest.fn((keys, callback) => {
      const result = selectStorageKeys(storageData, keys);
      callback?.(result);
      return Promise.resolve(result);
    }),
    set: jest.fn((items, callback) => {
      Object.assign(storageData, items);
      callback?.();
      return Promise.resolve();
    }),
    remove: jest.fn((keys, callback) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(key => {
        delete storageData[key];
      });
      callback?.();
      return Promise.resolve();
    }),
    clear: jest.fn(callback => {
      Object.keys(storageData).forEach(key => {
        delete storageData[key];
      });
      callback?.();
      return Promise.resolve();
    }),
  };
}

function installNativeChromeMockIfNeeded() {
  if (globalThis.chrome?._clearStorage) {
    return;
  }

  const localStorageData = {};
  const syncStorageData = {};
  const sessionStorageData = {};

  globalThis.chrome = {
    storage: {
      local: createStorageArea(localStorageData),
      sync: createStorageArea(syncStorageData),
      session: createStorageArea(sessionStorageData),
    },
    runtime: {
      id: 'mock-extension-id',
      getURL: jest.fn(path => `chrome-extension://mock-extension-id/${path}`),
      sendMessage: jest.fn(() => Promise.resolve({ success: true })),
    },
    tabs: {
      query: jest.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
      create: jest.fn(createProperties => Promise.resolve({ id: 1000, ...createProperties })),
      sendMessage: jest.fn(() => Promise.resolve({ success: true })),
    },
    sidePanel: {
      open: jest.fn(() => Promise.resolve()),
    },
    _clearStorage: () => {
      Object.keys(localStorageData).forEach(key => {
        delete localStorageData[key];
      });
      Object.keys(syncStorageData).forEach(key => {
        delete syncStorageData[key];
      });
      Object.keys(sessionStorageData).forEach(key => {
        delete sessionStorageData[key];
      });
    },
  };
}

describe('popupActions.js', () => {
  const TEST_API_KEY = 'test-key';

  const setManualApiKey = (overrides = {}) =>
    chrome.storage.sync.set({
      notionApiKey: TEST_API_KEY,
      ...overrides,
    });

  const mockDelayedLocalStorageSet = () => {
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

    return () => {
      chrome.storage.local.set = originalSet;
    };
  };

  const expectMigratedDataSourceKeys = async expectedDataSourceId => {
    const localData = await chrome.storage.local.get(['notionDataSourceId', 'notionDatabaseId']);

    expect(localData.notionDataSourceId).toBe(expectedDataSourceId);
    expect(localData.notionDatabaseId).toBe(expectedDataSourceId);
  };

  const mockRuntimeActionResponse = (action, response) => {
    chrome.runtime.sendMessage.mockImplementation(msg => {
      if (msg.action === action) {
        return Promise.resolve(response);
      }
      return Promise.resolve({ success: true });
    });
  };

  const mockRuntimeActionThrow = (action, error) => {
    chrome.runtime.sendMessage.mockImplementation(msg => {
      if (msg.action === action) {
        throw error;
      }
      return Promise.resolve({ success: true });
    });
  };

  const makeDestinationProfile = overrides => ({
    id: 'default',
    name: 'Default',
    icon: 'bookmark',
    color: '#2563eb',
    notionDataSourceId: 'db-1',
    notionDataSourceType: 'database',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  const makeResearchProfile = overrides =>
    makeDestinationProfile({
      id: 'profile-2',
      name: 'Research',
      icon: 'book-open',
      color: '#16a34a',
      notionDataSourceId: 'page-1',
      notionDataSourceType: 'page',
      createdAt: 2,
      updatedAt: 2,
      ...overrides,
    });

  const makeAccountProfile = () => ({
    userId: 'u1',
    email: 'user@example.com',
    displayName: 'Test User',
    avatarUrl: null,
  });

  const makePopupAccountState = overrides => ({
    enabled: true,
    isLoggedIn: false,
    profile: null,
    transientRefreshError: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    installNativeChromeMockIfNeeded();
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    getAccountSession.mockResolvedValue(null);
    isAccountSessionExpired.mockReturnValue(true);
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
      await setManualApiKey();
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
      await setManualApiKey();

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

    it.each([
      {
        name: '應該同時支持 notionDataSourceId 和 notionDatabaseId (兼容性檢查)',
        syncData: {},
        localData: { notionDatabaseId: 'old-db-id' },
        expectedDataSourceId: 'old-db-id',
      },
      {
        name: '當 local 無 dataSourceId 但 sync 有時，應回退讀取 sync 並返回 valid: true',
        syncData: { notionDataSourceId: 'sync-db-id' },
        localData: {},
        expectedDataSourceId: 'sync-db-id',
      },
      {
        name: '當 local 和 sync 都有 dataSourceId 時，應優先使用 local',
        syncData: { notionDataSourceId: 'sync-db-id' },
        localData: { notionDataSourceId: 'local-db-id' },
        expectedDataSourceId: 'local-db-id',
      },
    ])('$name', async ({ syncData, localData, expectedDataSourceId }) => {
      await setManualApiKey(syncData);
      await chrome.storage.local.set(localData);

      const result = await checkSettings();

      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe(expectedDataSourceId);
    });

    it.each([
      {
        name: '當 sync 回退觸發時，應自動遷移 dataSourceId 至 local',
        syncData: { notionDataSourceId: 'sync-db-id' },
        expectedDataSourceId: 'sync-db-id',
      },
      {
        name: '當 sync 僅有 notionDatabaseId (legacy key) 時，應回退並正確遷移',
        syncData: { notionDatabaseId: 'legacy-sync-id' },
        expectedDataSourceId: 'legacy-sync-id',
      },
    ])('$name', async ({ syncData, expectedDataSourceId }) => {
      await setManualApiKey(syncData);

      const restoreLocalSet = mockDelayedLocalStorageSet();
      try {
        const result = await checkSettings();

        expect(result.valid).toBe(true);
        expect(result.dataSourceId).toBe(expectedDataSourceId);
        await expectMigratedDataSourceKeys(expectedDataSourceId);
      } finally {
        restoreLocalSet();
      }
    });

    it('當 chrome.storage.local.set 拋錯時，checkSettings 仍應正常回傳', async () => {
      await setManualApiKey({ notionDataSourceId: 'sync-db-id' });

      const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = jest.fn().mockRejectedValueOnce(new Error('Quota exceeded'));

      try {
        const result = await checkSettings();

        expect(result.valid).toBe(true);
        expect(result.dataSourceId).toBe('sync-db-id');
      } finally {
        chrome.storage.local.set = originalSet;
      }
    });

    it('reports valid when a non-default active profile has a target but legacy top-level keys are absent', async () => {
      await chrome.storage.local.set({
        destinationProfiles: [
          makeDestinationProfile({ notionDataSourceId: 'AAA' }),
          makeResearchProfile({ id: 'p2', notionDataSourceId: 'BBB' }),
        ],
        destinationActiveProfileId: 'p2',
        notionAuthMode: 'oauth',
        notionOAuthToken: 'tok',
      });
      await chrome.storage.sync.set({ notionApiKey: '' });

      const result = await checkSettings();
      expect(result.valid).toBe(true);
      expect(result.dataSourceId).toBe('BBB');
    });
  });

  describe('checkPageStatus', () => {
    it('應該發送正確的訊息', async () => {
      mockRuntimeActionResponse('checkPageStatus', { success: true, isSaved: true });

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
      mockRuntimeActionThrow('checkPageStatus', new Error('Fail'));

      const result = await checkPageStatus();

      expect(result.success).toBe(false);
    });
  });

  describe('savePage', () => {
    it('應該調用 savePage 動作', async () => {
      mockRuntimeActionResponse('savePage', { success: true });

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
    it('應從 destination profile service 讀取 profiles 並以 entitlement 內的 profile 作為選取值', async () => {
      await chrome.storage.local.set({
        destinationProfiles: [makeDestinationProfile(), makeResearchProfile()],
        destinationLastUsedProfileId: 'profile-2',
      });

      const result = await getDestinationState();

      expect(result.profiles).toHaveLength(2);
      expect(result.selectedProfileId).toBe('default');
      expect(result.entitlement.maxProfiles).toBeGreaterThanOrEqual(1);
    });

    it('active 讀取失敗時仍應保留 profiles 並回退選第一個 profile', async () => {
      await chrome.storage.local.set({
        destinationProfiles: [makeDestinationProfile()],
        destinationActiveProfileId: 'default',
      });
      const activeSpy = jest
        .spyOn(ProfileManager.prototype, 'getActiveProfile')
        .mockRejectedValueOnce(new Error('active failed'));

      try {
        const result = await getDestinationState();

        expect(result.profiles).toHaveLength(1);
        expect(result.selectedProfileId).toBe('default');
        expect(result.entitlement).toEqual(expect.objectContaining({ maxProfiles: 1 }));
        expect(Logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'getDestinationState',
            operation: 'getActiveProfile',
            error: expect.any(String),
          })
        );
      } finally {
        activeSpy.mockRestore();
      }
    });

    it('last-used 指向 profiles snapshot 外的 id 時應回退選第一個 profile', async () => {
      await chrome.storage.local.set({
        destinationProfiles: [makeDestinationProfile()],
        destinationLastUsedProfileId: 'stale-profile',
      });

      const result = await getDestinationState();

      expect(result.profiles.map(profile => profile.id)).toEqual(['default']);
      expect(result.selectedProfileId).toBe('default');
    });

    describe('getDestinationState selection precedence', () => {
      beforeEach(() => {
        getAccountSession.mockResolvedValue({
          accessToken: 'valid-token',
          expiresAt: Date.now() + 100_000,
        });
        isAccountSessionExpired.mockReturnValue(false);
      });

      it.each([
        {
          name: 'prefers session temp selection over activeProfileId',
          activeProfileId: 'default',
          sessionTempProfileId: 'p2',
          expectedProfileId: 'p2',
        },
        {
          name: 'falls back to activeProfileId when no session temp selection',
          activeProfileId: 'p2',
          sessionTempProfileId: null,
          expectedProfileId: 'p2',
        },
      ])('$name', async ({ activeProfileId, sessionTempProfileId, expectedProfileId }) => {
        await chrome.storage.local.set({
          destinationProfiles: [
            makeDestinationProfile({ notionDataSourceId: 'A' }),
            makeResearchProfile({ id: 'p2', notionDataSourceId: 'B' }),
          ],
          destinationActiveProfileId: activeProfileId,
        });
        if (sessionTempProfileId) {
          await chrome.storage.session.set({ popupTempDestinationProfileId: sessionTempProfileId });
        }

        const state = await getDestinationState();
        expect(state.selectedProfileId).toBe(expectedProfileId);
      });

      it('falls back to activeProfileId without warning when session storage is unavailable', async () => {
        await chrome.storage.local.set({
          destinationProfiles: [
            makeDestinationProfile({ notionDataSourceId: 'A' }),
            makeResearchProfile({ id: 'p2', notionDataSourceId: 'B' }),
          ],
          destinationActiveProfileId: 'p2',
        });
        const originalSessionStorage = chrome.storage.session;
        try {
          delete chrome.storage.session;

          const state = await getDestinationState();

          expect(state.selectedProfileId).toBe('p2');
          expect(Logger.warn).not.toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'getDestinationState',
              operation: 'getSessionTempProfile',
            })
          );
        } finally {
          chrome.storage.session = originalSessionStorage;
        }
      });
    });
  });

  describe('setPopupTempProfile', () => {
    it('writes the temp profile id to session storage', async () => {
      await setPopupTempProfile('p2');
      const result = await chrome.storage.session.get('popupTempDestinationProfileId');
      expect(result.popupTempDestinationProfileId).toBe('p2');
    });

    it('silently skips persistence when session storage is unavailable', async () => {
      const originalSessionStorage = chrome.storage.session;
      try {
        delete chrome.storage.session;

        await setPopupTempProfile('p2');

        expect(Logger.warn).not.toHaveBeenCalledWith(
          'Failed to persist popup temp profile selection:',
          expect.anything()
        );
      } finally {
        chrome.storage.session = originalSessionStorage;
      }
    });
  });

  describe('startHighlight', () => {
    it('應該調用 startHighlight 動作', async () => {
      mockRuntimeActionResponse('startHighlight', { success: true });

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

      expect(result).toEqual(makePopupAccountState());
    });

    it.each([
      {
        name: '已登入時應回傳 profile 與 logged in 狀態',
        accessTokenError: null,
        transientRefreshError: false,
      },
      {
        name: 'token 暫時刷新失敗時應保留 logged in 狀態並標記 transientRefreshError',
        accessTokenError: new Error('transient refresh failure'),
        transientRefreshError: true,
      },
    ])('$name', async ({ accessTokenError, transientRefreshError }) => {
      const profile = makeAccountProfile();
      getAccountProfile.mockResolvedValue(profile);
      if (accessTokenError) {
        getAccountAccessToken.mockRejectedValue(accessTokenError);
      } else {
        getAccountAccessToken.mockResolvedValue('token-123');
      }

      const result = await getPopupAccountState();

      expect(result).toEqual(
        makePopupAccountState({
          isLoggedIn: true,
          profile,
          transientRefreshError,
        })
      );
    });

    it('feature flag 關閉時應回傳 disabled account state', async () => {
      BUILD_ENV.ENABLE_ACCOUNT = false;

      const result = await getPopupAccountState();

      expect(result).toEqual(makePopupAccountState({ enabled: false }));
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
      expect(chrome.runtime.getURL).toHaveBeenCalledWith(
        'pages/options/options.html?section=advanced'
      );
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://ext_id_123/pages/options/options.html?section=advanced',
      });
    });

    it.each([
      {
        name: 'startAccountLogin 開啟 tab 失敗時應以 structured error context 記錄',
        actionFn: () => startAccountLogin(),
        logMessage: 'startAccountLogin failed',
        logContext: {
          action: 'startAccountLogin',
          result: 'failed',
        },
      },
      {
        name: 'openAccountManagement 開啟 tab 失敗時應以 structured error context 記錄',
        actionFn: () => openAccountManagement(),
        logMessage: 'openAccountManagement failed',
        logContext: {
          action: 'openAccountManagement',
        },
      },
    ])('$name', async ({ actionFn, logMessage, logContext }) => {
      const error = new Error('tabs unavailable');
      chrome.tabs.create.mockRejectedValue(error);

      const result = await actionFn();

      expect(result.success).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(logMessage, {
        ...logContext,
        error,
      });
    });
  });
});
