import { initiateNotionOAuth } from '../../../scripts/auth/notionOAuthInitiator.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';

jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    OAUTH_CLIENT_ID: 'test-client-id',
  },
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}));

describe('initiateNotionOAuth', () => {
  let storedSession;
  let randomUUIDSpy;

  beforeEach(() => {
    BUILD_ENV.OAUTH_CLIENT_ID = 'test-client-id';
    storedSession = {};
    globalThis.chrome = {
      identity: {
        getRedirectURL: jest.fn(() => 'https://ext.test/callback'),
        launchWebAuthFlow: jest.fn(),
      },
      storage: {
        session: {
          set: jest.fn(async value => {
            Object.assign(storedSession, value);
          }),
          get: jest.fn(async key => {
            if (typeof key === 'string') {
              return { [key]: storedSession[key] };
            }
            return { ...storedSession };
          }),
        },
      },
    };
    // jsdom 的 crypto 是 non-configurable，無法直接覆寫；改 spy randomUUID
    randomUUIDSpy = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('uuid-fixed');
  });

  afterEach(() => {
    delete globalThis.chrome;
    randomUUIDSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('成功路徑應回傳 code、redirectUri 與 csrfState', async () => {
    chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
      'https://ext.test/callback?code=auth-code-1&state=uuid-fixed'
    );

    const result = await initiateNotionOAuth();

    expect(result).toEqual({
      code: 'auth-code-1',
      redirectUri: 'https://ext.test/callback',
      csrfState: 'uuid-fixed',
    });
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ oauthState: 'uuid-fixed' });
    const launchArgs = chrome.identity.launchWebAuthFlow.mock.calls[0][0];
    expect(launchArgs.interactive).toBe(true);
    expect(launchArgs.url).toContain('client_id=test-client-id');
    expect(launchArgs.url).toContain('state=uuid-fixed');
    expect(launchArgs.url).toContain(
      `redirect_uri=${encodeURIComponent('https://ext.test/callback')}`
    );
  });

  it('OAUTH_CLIENT_ID 為空時應拋 oauth_missing_client_id', async () => {
    BUILD_ENV.OAUTH_CLIENT_ID = '   ';

    await expect(initiateNotionOAuth()).rejects.toMatchObject({
      code: 'oauth_missing_client_id',
    });
    expect(chrome.identity.launchWebAuthFlow).not.toHaveBeenCalled();
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  it('chrome.identity API 不可用時應拋 oauth_identity_unavailable', async () => {
    delete chrome.identity.launchWebAuthFlow;

    await expect(initiateNotionOAuth()).rejects.toMatchObject({
      code: 'oauth_identity_unavailable',
    });
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  it('用戶取消（callback URL 為空）應拋出取消錯誤', async () => {
    chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(undefined);

    await expect(initiateNotionOAuth()).rejects.toThrow('OAuth 流程被取消或未回傳 URL');
  });

  it('CSRF state 不符時應拋出驗證失敗錯誤', async () => {
    chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
      'https://ext.test/callback?code=auth-code-2&state=tampered-state'
    );

    await expect(initiateNotionOAuth()).rejects.toThrow('CSRF state 驗證失敗，請重試');
    // CSRF state 已被寫入 session（在驗證失敗前）
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ oauthState: 'uuid-fixed' });
  });

  it('callback URL 含 error 參數時應拋出 Notion 授權失敗錯誤', async () => {
    chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
      'https://ext.test/callback?error=access_denied&state=uuid-fixed'
    );

    await expect(initiateNotionOAuth()).rejects.toThrow('Notion 授權失敗: access_denied');
  });

  it('callback URL 缺 code 且無 error 參數時應拋出未知錯誤訊息', async () => {
    chrome.identity.launchWebAuthFlow.mockResolvedValueOnce(
      'https://ext.test/callback?state=uuid-fixed'
    );

    await expect(initiateNotionOAuth()).rejects.toThrow('Notion 授權失敗: 未知錯誤');
  });
});
