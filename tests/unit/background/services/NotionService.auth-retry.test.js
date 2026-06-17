// NotionService.auth-retry.test.js
// 1. Mocks MUST be at the very top
jest.mock('../../../../scripts/utils/Logger.js', () => {
  const loggerMock = require('../../../helpers/loggerMock.js').createLoggerMock({
    debugEnabled: true,
  });
  return {
    __esModule: true,
    default: loggerMock,
    ...loggerMock,
  };
});

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
const TEST_OPERATION_LABEL = 'TestOperation';
const OAUTH_OLD_TOKEN = 'oauth_old_token';
const OAUTH_NEW_TOKEN = 'oauth_new_token';

const callTestOperation = (service, options = {}) =>
  service._callNotionApiWithRetry(jest.fn(), {
    label: TEST_OPERATION_LABEL,
    ...options,
  });

const mockUnauthorizedExecution = service => {
  const unauthorizedError = buildUnauthorizedError();
  const executeWithRetrySpy = jest
    .spyOn(service, '_executeWithRetry')
    .mockRejectedValueOnce(unauthorizedError);

  return { unauthorizedError, executeWithRetrySpy };
};

const mockOAuthActiveToken = (token = OAUTH_OLD_TOKEN) => {
  mockActiveToken(getActiveNotionToken, { token, mode: 'oauth' });
};

const mockManualActiveToken = token => {
  mockActiveToken(getActiveNotionToken, { token, mode: 'manual' });
};

describe('NotionService - OAuth 401 retry flow', () => {
  let service = null;
  let mockLogger = null;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    getActiveNotionToken.mockResolvedValue({ token: 'test-api-key', mode: 'manual' });
    refreshOAuthToken.mockResolvedValue(null);
    mockLogger = require('../../../helpers/loggerMock.js').createLoggerMock({
      debugEnabled: true,
    });
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
    const staleClient = { id: 'stale-client' };
    const { executeWithRetrySpy } = mockUnauthorizedExecution(service);
    executeWithRetrySpy.mockResolvedValueOnce({ ok: true });

    mockOAuthActiveToken();
    mockRefreshToken(refreshOAuthToken, OAUTH_NEW_TOKEN);

    const result = await callTestOperation(service, {
      apiKey: OAUTH_OLD_TOKEN,
      client: staleClient,
    });

    expect(result).toEqual({ ok: true });
    expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
    expect(executeWithRetrySpy).toHaveBeenCalledTimes(2);
    expect(executeWithRetrySpy).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.objectContaining({
        apiKey: OAUTH_NEW_TOKEN,
      })
    );
    expect(executeWithRetrySpy.mock.calls[1][1].client).toBeUndefined();
  });

  it.each([
    ['refresh 失敗時應拋出原錯誤', null],
    ['refresh reject 時應保留原始 401 錯誤', new Error('Refresh failed')],
  ])('401 + OAuth + %s', async (_description, refreshResult) => {
    const { unauthorizedError } = mockUnauthorizedExecution(service);

    mockOAuthActiveToken();
    mockRefreshToken(refreshOAuthToken, refreshResult);

    await expect(callTestOperation(service, { apiKey: OAUTH_OLD_TOKEN })).rejects.toBe(
      unauthorizedError
    );
    expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
  });

  it('401 + 非 OAuth 模式時不應刷新 token', async () => {
    const manualKey = 'manual_key';
    const { unauthorizedError } = mockUnauthorizedExecution(service);

    mockManualActiveToken(manualKey);

    await expect(callTestOperation(service, { apiKey: manualKey })).rejects.toBe(unauthorizedError);
    expect(refreshOAuthToken).not.toHaveBeenCalled();
  });

  it('使用全域 token 的 OAuth 請求在 refresh 成功後會更新全域 apiKey', async () => {
    const { executeWithRetrySpy } = mockUnauthorizedExecution(service);
    executeWithRetrySpy.mockResolvedValueOnce({ ok: true });

    service.apiKey = OAUTH_OLD_TOKEN;
    mockOAuthActiveToken();
    mockRefreshToken(refreshOAuthToken, OAUTH_NEW_TOKEN);

    await callTestOperation(service);

    expect(service.apiKey).toBe(OAUTH_NEW_TOKEN);
  });

  it('使用 scoped apiKey 的 OAuth 請求在 refresh 成功後不覆寫既有全域 apiKey', async () => {
    const scopedOldToken = 'oauth_old_scoped_token';
    const scopedNewToken = 'oauth_new_scoped_token';
    const globalManualToken = 'global_manual_token';
    const { executeWithRetrySpy } = mockUnauthorizedExecution(service);
    executeWithRetrySpy.mockResolvedValueOnce({ ok: true });

    service.apiKey = globalManualToken;
    mockOAuthActiveToken(scopedOldToken);
    mockRefreshToken(refreshOAuthToken, scopedNewToken);

    await callTestOperation(service, { apiKey: scopedOldToken });

    expect(service.apiKey).toBe(globalManualToken);
  });

  it('client-only scoped request 401 時不應用全域 token 自動 refresh', async () => {
    const { unauthorizedError, executeWithRetrySpy } = mockUnauthorizedExecution(service);

    mockOAuthActiveToken('test-api-key');

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
