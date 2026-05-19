import {
  exchangeNotionOAuthCode,
  saveNotionOAuthToken,
} from '../../../scripts/auth/notionOAuthCompleter.js';

jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    OAUTH_SERVER_URL: 'https://worker.test',
  },
}));

jest.mock('../../../scripts/config/extension/notionAuth.js', () => ({
  NOTION_OAUTH: {
    TOKEN_ENDPOINT: '/v1/oauth/token',
  },
}));

jest.mock('../../../scripts/utils/notionAuth.js', () => ({
  isNonEmptyString: value => typeof value === 'string' && value.trim().length > 0,
  getNextAuthEpoch: jest.fn().mockResolvedValue(42),
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../scripts/utils/securityUtils.js', () => ({
  sanitizeApiError: jest.fn(error => error?.message ?? 'unknown'),
}));

import Logger from '../../../scripts/utils/Logger.js';

describe('exchangeNotionOAuthCode', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete globalThis.fetch;
    jest.clearAllMocks();
  });

  it('成功時應 POST 到 OAUTH_SERVER_URL + TOKEN_ENDPOINT 並回傳 tokenData', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        workspace_name: 'My Workspace',
      }),
    });

    const result = await exchangeNotionOAuthCode({
      code: 'auth-code',
      redirectUri: 'https://ext.test/callback',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://worker.test/v1/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code', redirect_uri: 'https://ext.test/callback' }),
        signal: expect.any(AbortSignal),
      })
    );
    expect(result.access_token).toBe('access-1');
    expect(result.workspace_name).toBe('My Workspace');
  });

  it('後端非 2xx 時應拋出含 message 的錯誤', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'bad request' }),
    });

    await expect(exchangeNotionOAuthCode({ code: 'c', redirectUri: 'r' })).rejects.toThrow(
      'bad request'
    );
  });

  it('後端錯誤含 error_code 時應掛在 error.code', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'server boom', error_code: 'SERVER_MISCONFIGURATION' }),
    });

    await expect(exchangeNotionOAuthCode({ code: 'c', redirectUri: 'r' })).rejects.toMatchObject({
      message: 'server boom',
      code: 'SERVER_MISCONFIGURATION',
    });
  });

  it('後端 2xx 但缺 access_token 時應拋出欄位缺失錯誤', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ refresh_token: 'r' }),
    });

    await expect(exchangeNotionOAuthCode({ code: 'c', redirectUri: 'r' })).rejects.toThrow(
      'OAuth token 回應缺少必要欄位'
    );
  });

  it('後端 2xx 但缺 refresh_token 時應拋出欄位缺失錯誤', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'a' }),
    });

    await expect(exchangeNotionOAuthCode({ code: 'c', redirectUri: 'r' })).rejects.toThrow(
      'OAuth token 回應缺少必要欄位'
    );
  });

  it('後端非 2xx 且 json 解析失敗時應使用 status 構造預設訊息', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(exchangeNotionOAuthCode({ code: 'c', redirectUri: 'r' })).rejects.toThrow(
      'Token 交換失敗 (502)'
    );
  });

  it('fetch 觸發 AbortError 時應拋 OAUTH_TOKEN_EXCHANGE_TIMEOUT 並 warn', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortError);

    await expect(exchangeNotionOAuthCode({ code: 'c', redirectUri: 'r' })).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_EXCHANGE_TIMEOUT',
    });
    expect(Logger.warn).toHaveBeenCalledWith(
      '[Auth] Notion OAuth token 交換請求失敗',
      expect.objectContaining({
        action: 'exchangeNotionOAuthCode',
        result: 'blocked',
      })
    );
  });

  it('fetch 拋一般錯誤時應 warn 並原樣拋出', async () => {
    const networkError = new Error('network down');
    fetchMock.mockRejectedValueOnce(networkError);

    await expect(exchangeNotionOAuthCode({ code: 'c', redirectUri: 'r' })).rejects.toThrow(
      'network down'
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      '[Auth] Notion OAuth token 交換請求失敗',
      expect.objectContaining({
        action: 'exchangeNotionOAuthCode',
        result: 'failed',
      })
    );
  });
});

describe('saveNotionOAuthToken', () => {
  beforeEach(() => {
    globalThis.chrome = {
      storage: {
        local: {
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  afterEach(() => {
    delete globalThis.chrome;
    jest.clearAllMocks();
  });

  it('應將完整欄位寫入 chrome.storage.local 並使用 getNextAuthEpoch', async () => {
    await saveNotionOAuthToken({
      access_token: 'access-X',
      refresh_token: 'refresh-X',
      refresh_proof: 'proof-X',
      workspace_id: 'ws-1',
      workspace_name: 'WS Name',
      bot_id: 'bot-1',
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      notionAuthMode: expect.any(String),
      notionOAuthToken: 'access-X',
      notionRefreshToken: 'refresh-X',
      notionRefreshProof: 'proof-X',
      notionWorkspaceId: 'ws-1',
      notionWorkspaceName: 'WS Name',
      notionBotId: 'bot-1',
      notionAuthEpoch: 42,
    });
  });

  it('缺 refresh_proof 時應寫 null 並嘗試清掉舊值', async () => {
    await saveNotionOAuthToken({
      access_token: 'a',
      refresh_token: 'r',
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ notionRefreshProof: null })
    );
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['notionRefreshProof']);
  });

  it('清掉舊 refresh_proof 失敗時應 warn 但不中斷', async () => {
    chrome.storage.local.remove.mockRejectedValueOnce(new Error('quota_exceeded'));

    await expect(
      saveNotionOAuthToken({ access_token: 'a', refresh_token: 'r' })
    ).resolves.toBeUndefined();

    expect(Logger.warn).toHaveBeenCalledWith(
      '[存儲] 清理舊的 refresh_proof 失敗，將忽略並繼續',
      expect.objectContaining({ action: 'saveNotionOAuthToken' })
    );
  });

  it('有 refresh_proof 時不應呼叫 remove', async () => {
    await saveNotionOAuthToken({
      access_token: 'a',
      refresh_token: 'r',
      refresh_proof: 'p',
    });

    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
});
