/**
 * optionsAccountUI.test.js
 *
 * Tests for Account UI (initAccountUI / renderAccountUI).
 */

import { initOptions } from '../../../pages/options/options.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';
import Logger from '../../../scripts/utils/Logger.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import { ACCOUNT_API } from '../../../scripts/config/extension/accountApi.js';
import {
  buildAccountCardDOM,
  buildChromeMock,
  flushAsyncClick,
  mockSignedInAccountProfile,
} from '../../helpers/optionsTestHarness.js';

// Mocks for dependencies
jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_OAUTH: true,
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
    OAUTH_CLIENT_ID: '',
    EXTENSION_API_KEY: '',
  },
}));
jest.mock('../../../pages/options/UIManager.js');
jest.mock('../../../pages/options/AuthManager.js');
jest.mock('../../../pages/options/DataSourceManager.js');
jest.mock('../../../pages/options/StorageManager.js');
jest.mock('../../../pages/options/MigrationTool.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: require('../../helpers/loggerMock.js').createLoggerMock(),
}));
jest.mock('../../../scripts/auth/accountSession.js', () => ({
  getAccountProfile: jest.fn(),
  getAccountAccessToken: jest.fn(),
  clearAccountSession: jest.fn().mockResolvedValue(),
}));

jest.mock('../../../scripts/destinations/ProfileManager.js', () => ({
  ProfileManager: jest.fn().mockImplementation(() => ({
    listProfiles: jest.fn().mockResolvedValue([{ id: 'default' }]),
    getDestinationEntitlement: jest
      .fn()
      .mockResolvedValue({ maxProfiles: 2, accountSignedIn: true, source: 'test' }),
    ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
  })),
}));

describe('Account UI (initAccountUI / renderAccountUI)', () => {
  const {
    getAccountProfile,
    getAccountAccessToken,
    clearAccountSession,
  } = require('../../../scripts/auth/accountSession.js');

  beforeEach(() => {
    jest.useFakeTimers();
    buildAccountCardDOM();
    globalThis.chrome = buildChromeMock();
    BUILD_ENV.ENABLE_ACCOUNT = true;
    BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test';
    getAccountProfile.mockReset();
    getAccountAccessToken.mockReset();
    clearAccountSession.mockReset();
    getAccountAccessToken.mockResolvedValue(null);
    clearAccountSession.mockResolvedValue();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete globalThis.chrome;
    BUILD_ENV.ENABLE_ACCOUNT = true;
    BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test';
    jest.clearAllMocks();
  });

  const createAccountProfile = (overrides = {}) => ({
    userId: 'u1',
    email: 'user@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    ...overrides,
  });

  const mockAccountSession = ({ token = 'token-123', profile = {} } = {}) => {
    getAccountAccessToken.mockResolvedValue(token);
    getAccountProfile.mockResolvedValue(createAccountProfile(profile));
  };

  const mockSignedOutAccountSession = ({ profile = null } = {}) => {
    getAccountAccessToken.mockResolvedValue(null);
    getAccountProfile.mockResolvedValue(profile);
  };

  const expectAccountLoggedIn = () => {
    expect(document.querySelector('#account-logged-in').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#account-logged-out').classList.contains('hidden')).toBe(true);
  };

  const expectAccountLoggedOut = () => {
    expect(document.querySelector('#account-logged-out').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#account-logged-in').classList.contains('hidden')).toBe(true);
  };

  const expectAvatarFallback = expectedText => {
    const fallback = document.querySelector('#profile-avatar-fallback');
    expect(fallback.classList.contains('hidden')).toBe(false);
    expect(fallback.textContent).toBe(expectedText);
  };

  describe('ENABLE_ACCOUNT feature flag', () => {
    it('ENABLE_ACCOUNT=false 時應隱藏 account card 與 advanced tab', () => {
      BUILD_ENV.ENABLE_ACCOUNT = false;
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      expect(document.querySelector('#account-card').classList.contains('hidden')).toBe(true);
      expect(document.querySelector('#tab-advanced').classList.contains('hidden')).toBe(true);
      expect(document.querySelector('#section-advanced').classList.contains('hidden')).toBe(true);
    });

    it('ENABLE_ACCOUNT=true 時應顯示 account card', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await flushAsyncClick();
      expect(document.querySelector('#account-card').classList.contains('hidden')).toBe(false);
    });
  });

  describe('未登入狀態', () => {
    it('getAccountProfile 回傳 null 時應顯示 logged-out 區塊，並保留 Google Drive Sync 卡片', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await flushAsyncClick();

      expectAccountLoggedOut();
      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#drive-state-logged-out').classList.contains('hidden')).toBe(
        false
      );
      expect(
        document.querySelector('#ai-assistant-card').classList.contains('locked-feature')
      ).toBe(true);
    });

    it('初始化讀取 account session 期間應先顯示 Cloud Sync loading，避免空白', () => {
      getAccountProfile.mockImplementation(() => new Promise(() => {}));
      getAccountAccessToken.mockImplementation(() => new Promise(() => {}));

      initOptions();

      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        false
      );
    });
  });

  describe('已登入狀態', () => {
    it('getAccountProfile 回傳 profile 時應顯示 logged-in 區塊與帳號資訊，並解除鎖定', async () => {
      mockSignedInAccountProfile(getAccountAccessToken, getAccountProfile, {
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      });
      initOptions();
      await flushAsyncClick();

      expectAccountLoggedIn();
      expect(document.querySelector('#profile-display-name').textContent).toBe('Test User');

      const avatarImg = document.querySelector('#profile-avatar-img');
      expect(avatarImg.classList.contains('hidden')).toBe(false);
      expect(avatarImg.src).toContain('avatar.png');

      expect(
        document.querySelector('#ai-assistant-card').classList.contains('locked-feature')
      ).toBe(false);
    });

    it('displayName 為 null 時應顯示 email，avatar 為 null 時應回退', async () => {
      mockAccountSession({
        profile: {
          email: 'user@example.com',
          displayName: null,
          avatarUrl: null,
        },
      });
      initOptions();
      await flushAsyncClick();

      expect(document.querySelector('#profile-display-name').textContent).toContain(
        'user@example.com'
      );
      expectAvatarFallback('U');
    });

    it('displayName 為空白字串時應回退到 email，避免顯示空白名稱', async () => {
      mockAccountSession({
        profile: {
          email: 'user@example.com',
          displayName: '   ',
          avatarUrl: null,
        },
      });
      initOptions();
      await flushAsyncClick();

      expect(document.querySelector('#profile-display-name').textContent).toBe('user@example.com');

      expectAvatarFallback('U');
    });

    it('displayName 與 email 都缺失時應使用安全 fallback，避免呼叫 charAt 拋錯', async () => {
      mockAccountSession({
        profile: {
          email: '',
          displayName: '   ',
          avatarUrl: null,
        },
      });

      expect(() => initOptions()).not.toThrow();
      await flushAsyncClick();

      expect(document.querySelector('#profile-display-name').textContent).toBe('');
      expect(document.querySelector('#profile-email').textContent).toBe('');
      expectAvatarFallback('?');
    });

    it('僅有殘留 profile 但 access token 已失效時，應視為未登入', async () => {
      mockSignedOutAccountSession({
        profile: createAccountProfile({
          email: 'stale@example.com',
          displayName: 'Stale User',
        }),
      });
      initOptions();
      await flushAsyncClick();

      expectAccountLoggedOut();
      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#drive-state-logged-out').classList.contains('hidden')).toBe(
        false
      );
    });
  });

  describe('登入按鈕', () => {
    it('點擊後應開新 tab 到 Google start URL（帶 ext_id 與 callback_mode=bridge）', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await flushAsyncClick();

      document.querySelector('#account-login-button').click();

      const [{ url }] = globalThis.chrome.tabs.create.mock.calls[0];
      const startUrl = new URL(url);

      expect(startUrl.pathname).toBe('/v1/account/google/start');
      expect(startUrl.searchParams.get('ext_id')).toBe('ext_id_123');
      expect(startUrl.searchParams.get('callback_mode')).toBe('bridge');
    });

    it('登入 URL 應使用 BUILD_ENV.OAUTH_SERVER_URL 作為 base', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await flushAsyncClick();

      document.querySelector('#account-login-button').click();

      expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('https://worker.test'),
      });
    });

    it('OAUTH_SERVER_URL 缺失時不應開啟登入頁，且應顯示錯誤訊息', async () => {
      BUILD_ENV.OAUTH_SERVER_URL = '';
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await flushAsyncClick();

      expect(() => {
        document.querySelector('#account-login-button').click();
      }).not.toThrow();

      expect(globalThis.chrome.tabs.create).not.toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalledWith(
        'Account login failed',
        expect.objectContaining({
          action: 'initAccountUI',
          result: 'failed',
          reason: 'missing_base_url',
        })
      );

      const statusEl = document.querySelector('#account-status');
      expect(statusEl.textContent).toContain('登入設定');
      expect(statusEl.className).toContain('error');
    });
  });

  describe('登出按鈕', () => {
    beforeEach(() => {
      getAccountAccessToken.mockResolvedValue('token-123');
      getAccountProfile
        .mockResolvedValueOnce({
          userId: 'u1',
          email: 'user@example.com',
          displayName: null,
          avatarUrl: null,
        })
        .mockResolvedValue(null); // 登出後回傳 null
    });

    it('成功登出後應清除 account session 並廣播 cleared 訊息', async () => {
      clearAccountSession.mockResolvedValue();
      initOptions();
      await flushAsyncClick();

      document.querySelector('#account-logout-button').click();
      await flushAsyncClick();

      expect(clearAccountSession).toHaveBeenCalled();
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: expect.stringMatching(/account.*clear/i) })
      );
    });

    it('成功登出後應顯示成功訊息，並在 3 秒後清除', async () => {
      clearAccountSession.mockResolvedValue();
      initOptions();
      await flushAsyncClick();

      document.querySelector('#account-logout-button').click();
      await flushAsyncClick();
      await flushAsyncClick();
      await Promise.resolve();

      const statusEl = document.querySelector('#account-status');
      expect(statusEl.textContent).toContain(UI_MESSAGES.ACCOUNT.LOGOUT_SUCCESS);
      expect(statusEl.className).toContain('success');

      jest.advanceTimersByTime(3000);
      expect(statusEl.textContent).toBe('');
    });

    it('clearAccountSession 拋錯時應顯示錯誤訊息', async () => {
      const clearError = new Error('clear failed');
      clearAccountSession.mockRejectedValue(clearError);
      initOptions();
      await flushAsyncClick();

      document.querySelector('#account-logout-button').click();
      await flushAsyncClick();

      const statusEl = document.querySelector('#account-status');
      expect(statusEl.textContent).toContain(UI_MESSAGES.ACCOUNT.LOGOUT_FAILED);
      expect(statusEl.className).toContain('error');
      expect(Logger.error).toHaveBeenCalledWith(
        'Account logout failed',
        expect.objectContaining({
          action: 'logout',
          result: 'failure',
          error: clearError,
        })
      );
    });
  });

  describe('account_session_updated / account_session_cleared runtime 訊息', () => {
    it('收到 account_session_updated 訊息時應切換到已登入 UI 並顯示最新 profile', async () => {
      mockSignedOutAccountSession();
      initOptions();
      await flushAsyncClick();

      const listener = globalThis.chrome.runtime.onMessage.addListener.mock.calls[0][0];

      mockAccountSession({
        token: 'token-456',
        profile: {
          userId: 'u2',
          email: 'new@example.com',
          displayName: 'New',
        },
      });

      listener({ action: 'account_session_updated' });
      await flushAsyncClick();

      expectAccountLoggedIn();
      expect(document.querySelector('#profile-display-name').textContent).toBe('New');
      expect(document.querySelector('#profile-email').textContent).toBe('new@example.com');
    });

    it('收到 account_session_cleared 訊息時應切換到已登出 UI 並隱藏 account 卡資訊', async () => {
      mockAccountSession({
        profile: {
          displayName: null,
          avatarUrl: null,
        },
      });
      initOptions();
      await flushAsyncClick();

      const listener = globalThis.chrome.runtime.onMessage.addListener.mock.calls[0][0];

      mockSignedOutAccountSession();
      listener({ action: 'account_session_cleared' });
      await flushAsyncClick();

      expectAccountLoggedOut();
      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#drive-state-logged-out').classList.contains('hidden')).toBe(
        false
      );
    });
  });

  describe('隔離性：登出只清 account，不影響 Notion OAuth', () => {
    it('clearAccountSession 不應操作 chrome.storage.sync', async () => {
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'user@example.com',
        displayName: null,
        avatarUrl: null,
      });
      clearAccountSession.mockResolvedValue();
      initOptions();
      await flushAsyncClick();

      const syncSetSpy = globalThis.chrome.storage.sync.set;
      document.querySelector('#account-logout-button').click();
      await flushAsyncClick();

      expect(syncSetSpy).not.toHaveBeenCalled();
    });
  });

  describe('Phase 2 refresh 語意驗證', () => {
    it('token 過期但 refresh 成功時，UI 應保持已登入（不切回未登入）', async () => {
      expect.assertions(3);

      mockAccountSession({ token: 'refreshed_token_xyz' });

      initOptions();
      await flushAsyncClick();

      expect(document.querySelector('#account-logged-in')).not.toBeNull();
      expectAccountLoggedIn();
    });

    it('token 過期且 getAccountAccessToken 回 null（terminal failure 或無 refresh token），UI 應切回未登入', async () => {
      expect.assertions(3);

      mockSignedOutAccountSession({ profile: createAccountProfile() });

      initOptions();
      await flushAsyncClick();

      expect(document.querySelector('#account-logged-out')).not.toBeNull();
      expectAccountLoggedOut();
    });

    it('token 取得發生 transient rejection 時，有 profile 應保留 logged-in UI、顯示可重試提示，且 Cloud Sync 不應卡在 loading', async () => {
      getAccountAccessToken.mockRejectedValue(new Error('refresh transient failure'));
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      });

      initOptions();
      await flushAsyncClick();

      expect(document.querySelector('#account-logged-in').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#account-logged-out').classList.contains('hidden')).toBe(true);
      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#account-status').textContent).toContain('無法更新登入狀態');
    });

    it('transient refresh error 後收到 session 更新且 token 成功時應清除提示', async () => {
      getAccountAccessToken.mockRejectedValueOnce(new Error('refresh transient failure'));
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      });

      initOptions();
      await flushAsyncClick();
      expect(document.querySelector('#account-status').textContent).toContain('無法更新登入狀態');

      getAccountAccessToken.mockResolvedValueOnce('token-after-retry');
      const listener = globalThis.chrome.runtime.onMessage.addListener.mock.calls[0][0];
      listener({ action: 'account_session_updated' });
      await flushAsyncClick();

      const statusEl = document.querySelector('#account-status');
      expect(statusEl.textContent).toBe('');
      expect(statusEl.className).toBe('status-message');
    });

    it('profile 存在且 token refresh 成功時，profile 資訊應正確顯示（不因 refresh 而消失）', async () => {
      getAccountAccessToken.mockResolvedValue('new_token_after_refresh');
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'profile-preserved@example.com',
        displayName: 'Profile Preserved User',
        avatarUrl: null,
      });

      initOptions();
      await flushAsyncClick();

      expect(document.querySelector('#profile-display-name').textContent).toContain(
        'Profile Preserved User'
      );
      expect(document.querySelector('#profile-email').textContent).toContain(
        'profile-preserved@example.com'
      );
    });
  });
});

describe('Google Drive API constants', () => {
  it('should use /v1/account/drive namespace for drive endpoints', () => {
    expect(ACCOUNT_API.DRIVE_START).toBe('/v1/account/drive/start');
    expect(ACCOUNT_API.DRIVE_START_URL).toBe('/v1/account/drive/start-url');
    expect(ACCOUNT_API.DRIVE_CONNECTION).toBe('/v1/account/drive/connection');
    expect(ACCOUNT_API.DRIVE_SNAPSHOT_STATUS).toBe('/v1/account/drive/snapshot/status');
    expect(ACCOUNT_API.DRIVE_SNAPSHOT).toBe('/v1/account/drive/snapshot');
  });
});
