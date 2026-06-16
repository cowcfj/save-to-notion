// NotionService.auth-retry.test.js
// 1. Mocks MUST be at the very top
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    debug: jest.fn(),
    debugEnabled: true,
  },
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  debugEnabled: true,
}));

jest.mock('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(),
  refreshOAuthToken: jest.fn(),
}));

import { NotionService } from '../../../../scripts/background/services/NotionService.js';
import { getActiveNotionToken, refreshOAuthToken } from '../../../../scripts/utils/notionAuth.js';
import {
  buildUnauthorizedError,
  mockActiveToken,
  mockRefreshToken,
} from '../../../helpers/notionServiceTestHarness.js';

const createMockResponse = (data, ok = true, status = 200) => ({
  ok,
  status,
  headers: new Headers([['content-type', 'application/json']]),
  clone() {
    return this;
  },
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const mockFetchResponse = createMockResponse({});

describe('NotionService - OAuth 401 retry flow', () => {
  let service = null;
  let mockLogger = null;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    getActiveNotionToken.mockResolvedValue({ token: 'test-api-key', mode: 'manual' });
    refreshOAuthToken.mockResolvedValue(null);
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

    service = new NotionService({
      apiKey: 'test-api-key',
      logger: mockLogger,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('401 + OAuth + refresh 成功時應重試一次', async () => {
    const unauthorizedError = buildUnauthorizedError();
    const staleClient = { id: 'stale-client' };

    const executeWithRetrySpy = jest
      .spyOn(service, '_executeWithRetry')
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce({ ok: true });

    mockActiveToken(getActiveNotionToken, { token: 'oauth_old_token', mode: 'oauth' });
    mockRefreshToken(refreshOAuthToken, 'oauth_new_token');

    const result = await service._callNotionApiWithRetry(jest.fn(), {
      apiKey: 'oauth_old_token',
      label: 'TestOperation',
      client: staleClient,
    });

    expect(result).toEqual({ ok: true });
    expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
    expect(executeWithRetrySpy).toHaveBeenCalledTimes(2);
    expect(executeWithRetrySpy).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.objectContaining({
        apiKey: 'oauth_new_token',
      })
    );
    expect(executeWithRetrySpy.mock.calls[1][1].client).toBeUndefined();
  });

  it('401 + OAuth + refresh 失敗時應拋出原錯誤', async () => {
    const unauthorizedError = buildUnauthorizedError();

    jest.spyOn(service, '_executeWithRetry').mockRejectedValueOnce(unauthorizedError);
    mockActiveToken(getActiveNotionToken, { token: 'oauth_old_token', mode: 'oauth' });
    mockRefreshToken(refreshOAuthToken, null);

    await expect(
      service._callNotionApiWithRetry(jest.fn(), {
        apiKey: 'oauth_old_token',
        label: 'TestOperation',
      })
    ).rejects.toBe(unauthorizedError);
    expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
  });

  it('401 + OAuth + refresh reject 時應保留原始 401 錯誤', async () => {
    const unauthorizedError = buildUnauthorizedError();
    const refreshError = new Error('Refresh failed');

    jest.spyOn(service, '_executeWithRetry').mockRejectedValueOnce(unauthorizedError);
    mockActiveToken(getActiveNotionToken, { token: 'oauth_old_token', mode: 'oauth' });
    mockRefreshToken(refreshOAuthToken, refreshError);

    await expect(
      service._callNotionApiWithRetry(jest.fn(), {
        apiKey: 'oauth_old_token',
        label: 'TestOperation',
      })
    ).rejects.toBe(unauthorizedError);
    expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
  });

  it('401 + 非 OAuth 模式時不應刷新 token', async () => {
    const unauthorizedError = buildUnauthorizedError();

    jest.spyOn(service, '_executeWithRetry').mockRejectedValueOnce(unauthorizedError);
    mockActiveToken(getActiveNotionToken, { token: 'manual_key', mode: 'manual' });

    await expect(
      service._callNotionApiWithRetry(jest.fn(), {
        apiKey: 'manual_key',
        label: 'TestOperation',
      })
    ).rejects.toBe(unauthorizedError);
    expect(refreshOAuthToken).not.toHaveBeenCalled();
  });

  it('使用全域 token 的 OAuth 請求在 refresh 成功後會更新全域 apiKey', async () => {
    const unauthorizedError = buildUnauthorizedError();

    jest
      .spyOn(service, '_executeWithRetry')
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce({ ok: true });

    service.apiKey = 'oauth_old_token';
    mockActiveToken(getActiveNotionToken, { token: 'oauth_old_token', mode: 'oauth' });
    mockRefreshToken(refreshOAuthToken, 'oauth_new_token');

    await service._callNotionApiWithRetry(jest.fn(), {
      label: 'TestOperation',
    });

    expect(service.apiKey).toBe('oauth_new_token');
  });

  it('使用 scoped apiKey 的 OAuth 請求在 refresh 成功後不覆寫既有全域 apiKey', async () => {
    const unauthorizedError = buildUnauthorizedError();

    jest
      .spyOn(service, '_executeWithRetry')
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce({ ok: true });

    service.apiKey = 'global_manual_token';
    mockActiveToken(getActiveNotionToken, { token: 'oauth_old_scoped_token', mode: 'oauth' });
    mockRefreshToken(refreshOAuthToken, 'oauth_new_scoped_token');

    await service._callNotionApiWithRetry(jest.fn(), {
      apiKey: 'oauth_old_scoped_token',
      label: 'TestOperation',
    });

    expect(service.apiKey).toBe('global_manual_token');
  });

  it('client-only scoped request 401 時不應用全域 token 自動 refresh', async () => {
    const unauthorizedError = buildUnauthorizedError();

    const executeWithRetrySpy = jest
      .spyOn(service, '_executeWithRetry')
      .mockRejectedValueOnce(unauthorizedError);

    mockActiveToken(getActiveNotionToken, { token: 'test-api-key', mode: 'oauth' });

    await expect(
      service._callNotionApiWithRetry(jest.fn(), {
        client: { request: jest.fn() },
        label: 'ClientOnlyOperation',
      })
    ).rejects.toBe(unauthorizedError);

    expect(refreshOAuthToken).not.toHaveBeenCalled();
    expect(executeWithRetrySpy).toHaveBeenCalledTimes(1);
  });
});
