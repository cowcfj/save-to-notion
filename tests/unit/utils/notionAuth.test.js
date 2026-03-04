/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
  },
}));

import Logger from '../../../scripts/utils/Logger.js';
import { getActiveNotionToken, refreshOAuthToken } from '../../../scripts/utils/notionAuth.js';

describe('notionAuth utils', () => {
  beforeEach(() => {
    globalThis.chrome = {
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
        },
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
        },
      },
    };
    globalThis.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.fetch;
  });

  test('getActiveNotionToken 應優先回傳 OAuth token', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionOAuthToken: 'oauth_token_1',
    });

    const result = await getActiveNotionToken();

    expect(result).toEqual({ token: 'oauth_token_1', mode: 'oauth' });
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
  });

  test('getActiveNotionToken 應在 OAuth 不可用時回退手動 key', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({});
    chrome.storage.sync.get.mockResolvedValueOnce({ notionApiKey: 'secret_manual_key_1' });

    const result = await getActiveNotionToken();

    expect(result).toEqual({ token: 'secret_manual_key_1', mode: 'manual' });
  });

  test('getActiveNotionToken 無 token 時應回傳 null', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({});
    chrome.storage.sync.get.mockResolvedValueOnce({});

    const result = await getActiveNotionToken();

    expect(result).toEqual({ token: null, mode: null });
  });

  test('refreshOAuthToken 缺 refresh token 時應回傳 null', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({});

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(Logger.error).toHaveBeenCalledWith('無法刷新 Token：缺少 refresh_token', {
      action: 'refreshOAuthToken',
    });
  });

  test('refreshOAuthToken API 失敗時應回傳 null', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({ notionRefreshToken: 'refresh_token_1' });
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(Logger.error).toHaveBeenCalledWith('Token 刷新請求失敗', {
      action: 'refreshOAuthToken',
      status: 500,
    });
  });

  test('refreshOAuthToken 成功時應更新 storage 並回傳 access token', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({ notionRefreshToken: 'refresh_token_2' });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_2',
        refresh_token: 'refresh_token_2_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      notionOAuthToken: 'access_token_2',
      notionRefreshToken: 'refresh_token_2_new',
    });
    expect(Logger.success).toHaveBeenCalledWith('OAuth Token 已刷新', {
      action: 'refreshOAuthToken',
    });
    expect(result).toBe('access_token_2');
  });

  test('refreshOAuthToken 回應缺少 access_token 時不應覆寫 storage', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({ notionRefreshToken: 'refresh_token_2' });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        refresh_token: 'refresh_token_2_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(Logger.success).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith('OAuth Token 刷新回應缺少必要欄位', {
      action: 'refreshOAuthToken',
      error: expect.any(String),
    });
  });

  test('refreshOAuthToken 回應缺少 refresh_token 時不應覆寫 storage', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({ notionRefreshToken: 'refresh_token_2' });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_2',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(Logger.success).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith('OAuth Token 刷新回應缺少必要欄位', {
      action: 'refreshOAuthToken',
      error: expect.any(String),
    });
  });
});
