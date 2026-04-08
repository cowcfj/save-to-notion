/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../../scripts/config/env.js', () => ({
  ...jest.requireActual('../../../scripts/config/env.js'),
  BUILD_ENV: {
    ENABLE_OAUTH: true,
    OAUTH_SERVER_URL: 'https://test-server.example.com',
    OAUTH_CLIENT_ID: 'test-client-id',
    EXTENSION_API_KEY: 'test-api-key',
  },
}));

import Logger from '../../../scripts/utils/Logger.js';
import { BUILD_ENV } from '../../../scripts/config/env.js';
import {
  getActiveNotionToken,
  refreshOAuthToken,
  isNonEmptyString,
  migrateDataSourceKeys,
} from '../../../scripts/utils/notionAuth.js';

describe('notionAuth utils', () => {
  beforeEach(() => {
    BUILD_ENV.ENABLE_OAUTH = true;
    BUILD_ENV.OAUTH_SERVER_URL = 'https://test-server.example.com';
    BUILD_ENV.OAUTH_CLIENT_ID = 'test-client-id';
    BUILD_ENV.EXTENSION_API_KEY = 'test-api-key';
    globalThis.chrome = {
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
        },
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
      },
      runtime: {
        sendMessage: undefined,
      },
    };
    globalThis.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.fetch;
    jest.clearAllMocks();
  });

  test('isNonEmptyString 應正確判斷非空字串', () => {
    expect(isNonEmptyString(' proof ')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
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
      phase: 'preflight',
    });
  });

  test('refreshOAuthToken 缺少必要建置環境設定時不應發送請求', async () => {
    BUILD_ENV.EXTENSION_API_KEY = '';
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_missing_build_env',
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith('無法刷新 Token：缺少 OAuth 建置環境設定', {
      action: 'refreshOAuthToken',
      phase: 'preflight',
      missingBuildEnvKeys: ['EXTENSION_API_KEY'],
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
      phase: 'request',
      status: 500,
    });
  });

  test('refreshOAuthToken 遇到 INVALID_REFRESH_PROOF 時應清理本地 proof', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_invalid_proof',
      notionRefreshProof: 'stale_proof',
      notionAuthEpoch: 2,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_invalid_proof',
      notionAuthEpoch: 2,
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({
        error_code: 'INVALID_REFRESH_PROOF',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['notionRefreshProof']);
  });

  test('refreshOAuthToken 並發呼叫時應共用同一次 refresh', async () => {
    let resolveRefresh;
    const refreshPromise = new Promise(resolve => {
      resolveRefresh = resolve;
    });

    chrome.storage.local.get.mockResolvedValue({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'shared_refresh_token',
      notionRefreshProof: 'shared_refresh_proof',
      notionAuthEpoch: 5,
    });
    globalThis.fetch.mockReturnValue(refreshPromise);

    const firstCall = refreshOAuthToken();
    const secondCall = refreshOAuthToken();

    await Promise.resolve();
    await Promise.resolve();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);

    resolveRefresh({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'shared_access_token',
        refresh_token: 'shared_refresh_token_new',
        refresh_proof: 'shared_refresh_proof_new',
      }),
    });

    await expect(firstCall).resolves.toBe('shared_access_token');
    await expect(secondCall).resolves.toBe('shared_access_token');
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  test('refreshOAuthToken 成功時應更新 storage、攜帶 proof 並回傳 access token', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_2',
      notionRefreshProof: 'refresh_proof_2',
      notionAuthEpoch: 7,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_2',
      notionAuthEpoch: 7,
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_2',
        refresh_token: 'refresh_token_2_new',
        refresh_proof: 'refresh_proof_2_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Extension-Key': BUILD_ENV.EXTENSION_API_KEY,
        }),
        body: expect.stringContaining('"refresh_proof":"refresh_proof_2"'),
      })
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      notionOAuthToken: 'access_token_2',
      notionRefreshToken: 'refresh_token_2_new',
      notionRefreshProof: 'refresh_proof_2_new',
      notionAuthEpoch: 8,
    });
    expect(Logger.success).toHaveBeenCalledWith('OAuth Token 已刷新', {
      action: 'refreshOAuthToken',
      phase: 'commit',
      nextAuthEpoch: 8,
    });
    expect(result).toBe('access_token_2');
  });

  test('refreshOAuthToken 回應未帶 refresh_proof 時應清除舊 proof', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_3',
      notionRefreshProof: 'refresh_proof_3',
      notionAuthEpoch: 10,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_3',
      notionAuthEpoch: 10,
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_3',
        refresh_token: 'refresh_token_3_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBe('access_token_3');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      notionOAuthToken: 'access_token_3',
      notionRefreshToken: 'refresh_token_3_new',
      notionRefreshProof: null,
      notionAuthEpoch: 11,
    });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['notionRefreshProof']);
  });

  test('refreshOAuthToken 本地 proof 為空白字串時不應送出 refresh_proof', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_blank',
      notionRefreshProof: '   ',
      notionAuthEpoch: 12,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_blank',
      notionAuthEpoch: 12,
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_blank',
        refresh_token: 'refresh_token_blank_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBe('access_token_blank');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: 'refresh_token_blank' }),
      })
    );
  });

  test('refreshOAuthToken 清理舊 proof 失敗時仍應回傳新 token', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_4',
      notionRefreshProof: 'refresh_proof_4',
      notionAuthEpoch: 14,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_4',
      notionAuthEpoch: 14,
    });
    chrome.storage.local.remove.mockRejectedValueOnce(new Error('remove failed'));
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_4',
        refresh_token: 'refresh_token_4_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBe('access_token_4');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      notionOAuthToken: 'access_token_4',
      notionRefreshToken: 'refresh_token_4_new',
      notionRefreshProof: null,
      notionAuthEpoch: 15,
    });
    expect(Logger.warn).toHaveBeenCalledWith('[存儲] 清理舊的 refresh_proof 失敗，將忽略並繼續', {
      action: 'refreshOAuthToken',
      phase: 'cleanup',
      error: expect.any(String),
    });
    expect(Logger.success).toHaveBeenCalledWith('OAuth Token 已刷新', {
      action: 'refreshOAuthToken',
      phase: 'commit',
      nextAuthEpoch: 15,
    });
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
      phase: 'validate',
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
      phase: 'validate',
      error: expect.any(String),
    });
  });

  test('refreshOAuthToken 若刷新期間已切離 OAuth 模式則不應覆寫 storage', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_switched_mode',
      notionRefreshProof: 'refresh_proof_switched_mode',
      notionAuthEpoch: 20,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'manual',
      notionRefreshToken: 'refresh_token_switched_mode',
      notionAuthEpoch: 21,
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_switched_mode',
        refresh_token: 'refresh_token_switched_mode_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  test('refreshOAuthToken 若刷新期間 refresh token 已變更則不應清除 proof', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_old',
      notionRefreshProof: 'refresh_proof_old',
      notionAuthEpoch: 30,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_newer',
      notionAuthEpoch: 31,
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({
        error_code: 'INVALID_REFRESH_PROOF',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  test('refreshOAuthToken 若刷新期間 auth epoch 改變則不應覆寫 storage', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_epoch',
      notionRefreshProof: 'refresh_proof_epoch',
      notionAuthEpoch: 40,
    });
    chrome.storage.local.get.mockResolvedValueOnce({
      notionAuthMode: 'oauth',
      notionRefreshToken: 'refresh_token_epoch',
      notionAuthEpoch: 41,
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'access_token_epoch',
        refresh_token: 'refresh_token_epoch_new',
      }),
    });

    const result = await refreshOAuthToken();

    expect(result).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('refreshOAuthToken 在非 background context 應委派給 background action', async () => {
    chrome.runtime.sendMessage = jest.fn().mockResolvedValue({
      success: true,
      token: 'delegated_access_token',
    });

    const result = await refreshOAuthToken();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'refreshOAuthToken' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toBe('delegated_access_token');
  });
});

describe('migrateDataSourceKeys', () => {
  test('local 已有 notionDataSourceId 時不應遷移', async () => {
    const storageArea = { set: jest.fn() };

    const result = await migrateDataSourceKeys({
      localData: { notionDataSourceId: 'existing-id' },
      syncData: { notionDataSourceId: 'sync-id' },
      storageArea,
    });

    expect(result).toBe(false);
    expect(storageArea.set).not.toHaveBeenCalled();
  });

  test('local 已有 notionDatabaseId (legacy) 時不應遷移', async () => {
    const storageArea = { set: jest.fn() };

    const result = await migrateDataSourceKeys({
      localData: { notionDatabaseId: 'legacy-local-id' },
      syncData: { notionDataSourceId: 'sync-id' },
      storageArea,
    });

    expect(result).toBe(false);
    expect(storageArea.set).not.toHaveBeenCalled();
  });

  test('sync 無 dataSourceId 時不應遷移', async () => {
    const storageArea = { set: jest.fn() };

    const result = await migrateDataSourceKeys({
      localData: {},
      syncData: {},
      storageArea,
    });

    expect(result).toBe(false);
    expect(storageArea.set).not.toHaveBeenCalled();
  });

  test('storageArea.set 不存在時不應遷移', async () => {
    const result = await migrateDataSourceKeys({
      localData: {},
      syncData: { notionDataSourceId: 'sync-id' },
      storageArea: {},
    });

    expect(result).toBe(false);
  });

  test('local 空 + sync 有 notionDataSourceId 時應遷移並回傳 true', async () => {
    const storageArea = { set: jest.fn().mockResolvedValue() };
    const logger = { success: jest.fn(), warn: jest.fn() };

    const result = await migrateDataSourceKeys({
      localData: {},
      syncData: { notionDataSourceId: 'sync-id' },
      storageArea,
      logger,
      action: 'testAction',
      retryContext: 'test',
    });

    expect(result).toBe(true);
    expect(storageArea.set).toHaveBeenCalledWith({
      notionDataSourceId: 'sync-id',
      notionDatabaseId: 'sync-id',
    });
    expect(logger.success).toHaveBeenCalledWith(
      '[Settings] 已自動遷移 dataSourceId 從 sync 至 local',
      { action: 'testAction', operation: 'migrateDataSourceKey' }
    );
  });

  test('local 空 + sync 有 notionDatabaseId (legacy) 時應遷移', async () => {
    const storageArea = { set: jest.fn().mockResolvedValue() };
    const logger = { success: jest.fn(), warn: jest.fn() };

    const result = await migrateDataSourceKeys({
      localData: {},
      syncData: { notionDatabaseId: 'legacy-sync-id' },
      storageArea,
      logger,
      action: 'testAction',
      retryContext: 'test',
    });

    expect(result).toBe(true);
    expect(storageArea.set).toHaveBeenCalledWith({
      notionDataSourceId: 'legacy-sync-id',
      notionDatabaseId: 'legacy-sync-id',
    });
  });

  test('storageArea.set 拋錯時應回傳 false 並記錄警告', async () => {
    const storageArea = { set: jest.fn().mockRejectedValue(new Error('Quota exceeded')) };
    const logger = { success: jest.fn(), warn: jest.fn() };

    const result = await migrateDataSourceKeys({
      localData: {},
      syncData: { notionDataSourceId: 'sync-id' },
      storageArea,
      logger,
      action: 'testAction',
      retryContext: 'popup',
    });

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      '[Settings] dataSourceId 遷移失敗，下次開啟 popup 會重試',
      expect.objectContaining({ action: 'testAction', operation: 'migrateDataSourceKey' })
    );
  });
});
