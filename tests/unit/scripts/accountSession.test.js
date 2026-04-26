/**
 * accountSession.js 單元測試
 *
 * 涵蓋：
 * - getAccountSession / setAccountSession / clearAccountSession
 * - isAccountSessionExpired
 * - getAccountAccessToken (含過期判斷)
 * - buildAccountAuthHeaders
 * - getAccountProfile / setAccountProfile
 * - ACCOUNT_STORAGE_KEYS 常量導出
 *
 * @see scripts/auth/accountSession.js
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

import {
  getAccountSession,
  setAccountSession,
  clearAccountSession,
  getAccountAccessToken,
  isAccountSessionExpired,
  buildAccountAuthHeaders,
  getAccountProfile,
  setAccountProfile,
  refreshAccountSession,
  ACCOUNT_STORAGE_KEYS,
} from '../../../scripts/auth/accountSession.js';
import Logger from '../../../scripts/utils/Logger.js';

// =============================================================================
// chrome.storage.local mock
// =============================================================================

let storageFake = {};

const chromeMock = {
  storage: {
    local: {
      get: jest.fn(async keys => {
        const result = {};
        for (const key of keys) {
          if (Object.hasOwn(storageFake, key)) {
            result[key] = storageFake[key];
          }
        }
        return result;
      }),
      set: jest.fn(async items => {
        Object.assign(storageFake, items);
      }),
      remove: jest.fn(async keys => {
        for (const key of keys) {
          delete storageFake[key];
        }
      }),
    },
  },
};

// =============================================================================
// 測試輔助資料
// =============================================================================

const FUTURE_EXPIRES_AT = Math.floor(Date.now() / 1000) + 3600; // 1 小時後（秒）
const PAST_EXPIRES_AT = Math.floor(Date.now() / 1000) - 60; // 1 分鐘前（秒）

/** 一個完整有效的 session 物件 */
const VALID_SESSION = {
  accessToken: 'access_token_abc',
  refreshToken: 'refresh_token_xyz',
  expiresAt: FUTURE_EXPIRES_AT,
  userId: 'user_001',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/avatar.png',
};

// =============================================================================
// setup / teardown
// =============================================================================

beforeEach(() => {
  storageFake = {};
  Object.assign(globalThis, { chrome: chromeMock });
  jest.clearAllMocks();
});

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.BUILD_ENV;
  delete globalThis.fetch;
});

// =============================================================================
// ACCOUNT_STORAGE_KEYS
// =============================================================================

describe('ACCOUNT_STORAGE_KEYS', () => {
  test('應匯出所有 7 個 account key 常量，且皆為 account 前綴', () => {
    const expectedKeys = [
      'accountAccessToken',
      'accountRefreshToken',
      'accountAccessTokenExpiresAt',
      'accountUserId',
      'accountEmail',
      'accountDisplayName',
      'accountAvatarUrl',
    ];
    const exportedValues = Object.values(ACCOUNT_STORAGE_KEYS);

    for (const key of expectedKeys) {
      expect(exportedValues).toContain(key);
    }
    expect(exportedValues).toHaveLength(expectedKeys.length);
  });

  test('所有 key 皆以 account 前綴命名，確保與 Notion OAuth 隔離', () => {
    for (const key of Object.values(ACCOUNT_STORAGE_KEYS)) {
      expect(key).toMatch(/^account/);
    }
  });
});

// =============================================================================
// getAccountSession
// =============================================================================

describe('getAccountSession', () => {
  test('storage 為空時應回傳 null', async () => {
    const result = await getAccountSession();
    expect(result).toBeNull();
  });

  test('寫入後應能正確讀取完整 session', async () => {
    await setAccountSession(VALID_SESSION);
    const result = await getAccountSession();

    expect(result).toMatchObject({
      accessToken: VALID_SESSION.accessToken,
      refreshToken: VALID_SESSION.refreshToken,
      expiresAt: VALID_SESSION.expiresAt,
      userId: VALID_SESSION.userId,
      email: VALID_SESSION.email,
      displayName: VALID_SESSION.displayName,
      avatarUrl: VALID_SESSION.avatarUrl,
    });
  });

  test('只有 accessToken 時應能讀取（其他欄位有 fallback）', async () => {
    storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN] = 'token_only';
    const result = await getAccountSession();

    expect(result).not.toBeNull();
    expect(result.accessToken).toBe('token_only');
    expect(result.refreshToken).toBe('');
    expect(result.expiresAt).toBe(0);
    expect(result.userId).toBe('');
    expect(result.email).toBe('');
    expect(result.displayName).toBeNull();
    expect(result.avatarUrl).toBeNull();
  });
});

// =============================================================================
// setAccountSession
// =============================================================================

describe('setAccountSession', () => {
  test('應以平面 key 各別寫入 storage', async () => {
    await setAccountSession(VALID_SESSION);

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        accountAccessToken: VALID_SESSION.accessToken,
        accountRefreshToken: VALID_SESSION.refreshToken,
        accountAccessTokenExpiresAt: VALID_SESSION.expiresAt,
        accountUserId: VALID_SESSION.userId,
        accountEmail: VALID_SESSION.email,
        accountDisplayName: VALID_SESSION.displayName,
        accountAvatarUrl: VALID_SESSION.avatarUrl,
      })
    );
  });

  test('displayName / avatarUrl 為 undefined 時應以 null 儲存', async () => {
    await setAccountSession({
      ...VALID_SESSION,
      displayName: undefined,
      avatarUrl: undefined,
    });

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        accountDisplayName: null,
        accountAvatarUrl: null,
      })
    );
  });

  test('MUST NOT 寫入任何 Notion OAuth storage key', async () => {
    await setAccountSession(VALID_SESSION);

    const setCallArgs = chromeMock.storage.local.set.mock.calls[0][0];
    const notionKeys = ['notionAccessToken', 'notionOAuthToken', 'oauthAccessToken'];
    for (const key of notionKeys) {
      expect(setCallArgs).not.toHaveProperty(key);
    }
  });
});

// =============================================================================
// clearAccountSession
// =============================================================================

describe('clearAccountSession', () => {
  test('應清除所有 account keys', async () => {
    await setAccountSession(VALID_SESSION);
    await clearAccountSession();

    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith(
      expect.arrayContaining(Object.values(ACCOUNT_STORAGE_KEYS))
    );

    const result = await getAccountSession();
    expect(result).toBeNull();
  });

  test('清除後 getAccountSession 應回傳 null', async () => {
    await setAccountSession(VALID_SESSION);
    await clearAccountSession();
    expect(await getAccountSession()).toBeNull();
  });
});

// =============================================================================
// isAccountSessionExpired
// =============================================================================

describe('isAccountSessionExpired', () => {
  test('expiresAt 在未來時應回傳 false（未過期）', () => {
    expect(isAccountSessionExpired({ expiresAt: FUTURE_EXPIRES_AT })).toBe(false);
  });

  test('expiresAt 在過去時應回傳 true（已過期）', () => {
    expect(isAccountSessionExpired({ expiresAt: PAST_EXPIRES_AT })).toBe(true);
  });

  test('expiresAt 為 0 時應回傳 true（視為無效）', () => {
    expect(isAccountSessionExpired({ expiresAt: 0 })).toBe(true);
  });

  test('expiresAt 為負數時應回傳 true', () => {
    expect(isAccountSessionExpired({ expiresAt: -1 })).toBe(true);
  });

  test('expiresAt 為 null / undefined 時應回傳 true', () => {
    expect(isAccountSessionExpired({ expiresAt: null })).toBe(true);
    expect(isAccountSessionExpired({ expiresAt: undefined })).toBe(true);
    expect(isAccountSessionExpired({})).toBe(true);
  });

  test('expiresAt 為 NaN 時應回傳 true（視為已過期）', () => {
    expect(isAccountSessionExpired({ expiresAt: Number.NaN })).toBe(true);
  });

  test('expiresAt 為 Infinity 時應回傳 true（非有限值視為無效）', () => {
    expect(isAccountSessionExpired({ expiresAt: Infinity })).toBe(true);
  });
});

// =============================================================================
// getAccountAccessToken
// =============================================================================

describe('getAccountAccessToken', () => {
  test('無 session 時應回傳 null', async () => {
    expect(await getAccountAccessToken()).toBeNull();
  });

  test('有效 session 且未過期時應回傳 access token', async () => {
    await setAccountSession(VALID_SESSION);
    expect(await getAccountAccessToken()).toBe(VALID_SESSION.accessToken);
  });

  test('Session 已過期且無 refresh token 時應回傳 null（无法刷新）', async () => {
    // 確保 refreshToken 為空，避免觸發 refresh 流程
    await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT, refreshToken: '' });
    expect(await getAccountAccessToken()).toBeNull();
  });

  test('Session 已過期且 refresh 發生 transient failure 時應 re-throw 讓 caller 區分', async () => {
    await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    });

    await expect(getAccountAccessToken()).rejects.toThrow();
    expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBe(VALID_SESSION.accessToken);
  });
});

// =============================================================================
// buildAccountAuthHeaders
// =============================================================================

describe('buildAccountAuthHeaders', () => {
  test('有效 session 時應回傳 Bearer Authorization header', async () => {
    await setAccountSession(VALID_SESSION);
    const headers = await buildAccountAuthHeaders();
    expect(headers).toEqual({ Authorization: `Bearer ${VALID_SESSION.accessToken}` });
  });

  test('無 session 時應回傳空物件', async () => {
    const headers = await buildAccountAuthHeaders();
    expect(headers).toEqual({});
  });

  test('過期 session（無 refresh token）時應回傳空物件', async () => {
    // refreshToken 為空，不會觸發 refresh—應直接回空
    await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT, refreshToken: '' });
    const headers = await buildAccountAuthHeaders();
    expect(headers).toEqual({});
  });

  test('過期 session 且 refresh 發生 transient failure 時應回傳空物件', async () => {
    await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    });

    await expect(buildAccountAuthHeaders()).resolves.toEqual({});
  });
});

// =============================================================================
// getAccountProfile / setAccountProfile
// =============================================================================

describe('getAccountProfile', () => {
  test('無 email 時應回傳 null', async () => {
    expect(await getAccountProfile()).toBeNull();
  });

  test('有 email 時應回傳 profile snapshot（不包含 token）', async () => {
    await setAccountSession(VALID_SESSION);
    const profile = await getAccountProfile();

    expect(profile).toMatchObject({
      userId: VALID_SESSION.userId,
      email: VALID_SESSION.email,
      displayName: VALID_SESSION.displayName,
      avatarUrl: VALID_SESSION.avatarUrl,
    });

    // MUST NOT 包含 token 敏感資訊
    expect(profile).not.toHaveProperty('accessToken');
    expect(profile).not.toHaveProperty('refreshToken');
  });
});

describe('setAccountProfile', () => {
  test('應正確寫入 profile 相關的 storage keys', async () => {
    await setAccountProfile({
      userId: 'user_002',
      email: 'profile@example.com',
      displayName: 'Profile User',
      avatarUrl: 'https://example.com/p.png',
    });

    const data = storageFake;
    expect(data.accountUserId).toBe('user_002');
    expect(data.accountEmail).toBe('profile@example.com');
    expect(data.accountDisplayName).toBe('Profile User');
    expect(data.accountAvatarUrl).toBe('https://example.com/p.png');
  });

  test('displayName / avatarUrl 省略時應以 null 儲存', async () => {
    await setAccountProfile({ userId: 'u1', email: 'a@b.com' });

    expect(storageFake.accountDisplayName).toBeNull();
    expect(storageFake.accountAvatarUrl).toBeNull();
  });
});

// =============================================================================
// Phase 2：refresh 驗證矩陣
// =============================================================================

describe('refreshAccountSession（Phase 2 驗證）', () => {
  const newAccessToken = 'refreshed_access_token';
  const newRefreshToken = 'rotated_refresh_token';
  const newExpiresAt = Math.floor(Date.now() / 1000) + 86_400;

  beforeEach(() => {
    delete globalThis.fetch;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  // ──── Phase 2 Step 2.1 ────
  describe('[Phase2-2.1] refresh 成功時應更新三個 storage key', () => {
    test('refresh 成功後應覆寫 accountAccessToken', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          rotated: true,
        }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBe(newAccessToken);
      expect(Logger.success).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'refreshAccountSession',
          result: 'success',
        })
      );
    });

    test('refresh 成功後應覆寫 accountRefreshToken', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          rotated: true,
        }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.REFRESH_TOKEN]).toBe(newRefreshToken);
    });

    test('refresh 成功後應覆寫 accountAccessTokenExpiresAt', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          rotated: true,
        }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.EXPIRES_AT]).toBe(newExpiresAt);
    });

    test('refresh 成功後 MUST NOT 清空 profile snapshot（email 應保留）', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          rotated: false,
        }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.EMAIL]).toBe(VALID_SESSION.email);
    });

    test('refresh success payload 缺少必要欄位時不應污染 storage，且應視為 transient failure', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: '',
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
        }),
      });

      await expect(refreshAccountSession()).rejects.toThrow();
      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBe(VALID_SESSION.accessToken);
      expect(storageFake[ACCOUNT_STORAGE_KEYS.REFRESH_TOKEN]).toBe(VALID_SESSION.refreshToken);
      expect(storageFake[ACCOUNT_STORAGE_KEYS.EXPIRES_AT]).toBe(PAST_EXPIRES_AT);
      expect(Logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'refreshAccountSession',
          result: 'failed',
        })
      );
    });
  });

  // ──── Phase 2 Step 2.2 ────
  describe('[Phase2-2.2] refresh failure taxonomy', () => {
    test('refresh 回 401 INVALID_REFRESH_TOKEN 時應清 session（terminal failure）', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'INVALID_REFRESH_TOKEN' }),
      });

      await refreshAccountSession();

      // session 應已清除
      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBeUndefined();
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'refreshAccountSession',
          result: 'cleared',
          reason: 'INVALID_REFRESH_TOKEN',
          httpStatus: 401,
        })
      );
    });

    test('refresh 回 401 SESSION_REVOKED 時應清 session（terminal failure）', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'SESSION_REVOKED' }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBeUndefined();
    });

    test('refresh 回 401 REFRESH_REUSE_DETECTED 時應清 session（terminal failure）', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'REFRESH_REUSE_DETECTED' }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBeUndefined();
    });

    test('refresh 回 500 時不應清 session（transient failure）', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal Server Error' }),
      });

      await expect(refreshAccountSession()).rejects.toThrow();

      // session 應保留（不清除）
      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBe(VALID_SESSION.accessToken);
      expect(Logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'refreshAccountSession',
          result: 'failed',
          httpStatus: 500,
        })
      );
    });

    test('refresh 發生 network error 時不應清 session（transient failure）', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('Network Error'));

      await expect(refreshAccountSession()).rejects.toThrow('Network Error');

      // session 應保留
      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBe(VALID_SESSION.accessToken);
      expect(Logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'refreshAccountSession',
          result: 'failed',
          error: 'Network Error',
        })
      );
    });

    test('refresh timeout 被 abort 時應 reject，且 getAccountAccessToken 應 re-throw', async () => {
      jest.useFakeTimers();
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn((_url, options = {}) => {
        return new Promise((resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              const abortError = new Error('The operation was aborted.');
              abortError.name = 'AbortError';
              reject(abortError);
            },
            { once: true }
          );
        });
      });

      const refreshPromise = refreshAccountSession();
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(refreshPromise).rejects.toThrow('The operation was aborted.');

      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });
      const tokenPromise = getAccountAccessToken();
      // 先 attach 空 catch 避免 timer advance 期間 unhandled rejection
      tokenPromise.catch(() => {});
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(tokenPromise).rejects.toThrow('The operation was aborted.');

      expect(Logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'refreshAccountSession',
          result: 'failed',
          reason: 'ABORTED',
          error: 'The operation was aborted.',
        })
      );

      jest.useRealTimers();
    });
  });

  // ──── Phase 2 Step 2.3 ────
  describe('[Phase2-2.3] single-flight：並發多次 refresh 只應送出一次 request', () => {
    test('並發兩次 getAccountAccessToken() 過期時，只應送出一次 fetch 請求', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          rotated: true,
        }),
      });

      // 並發兩次呼叫
      const [token1, token2] = await Promise.all([
        getAccountAccessToken(),
        getAccountAccessToken(),
      ]);

      // 期望：fetch 只被呼叫一次（single-flight）
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      // 兩次結果應一致
      expect(token1).toBe(newAccessToken);
      expect(token2).toBe(newAccessToken);
    });

    test('前一次 refresh 完成後再次呼叫 getAccountAccessToken()，應重新送出 fetch', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            accessToken: 'first_refresh_token',
            refreshToken: 'first_refresh_token_rotated',
            expiresAt: PAST_EXPIRES_AT,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            accessToken: 'second_refresh_token',
            refreshToken: 'second_refresh_token_rotated',
            expiresAt: newExpiresAt,
          }),
        });

      const token1 = await getAccountAccessToken();
      const token2 = await getAccountAccessToken();

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(token1).toBe('first_refresh_token');
      expect(token2).toBe('second_refresh_token');
    });
  });

  // ──── Contract Alignment Tests ────
  describe('Contract Alignment：refresh request/response/error 使用 snake_case', () => {
    const snakeAccessToken = 'snake_access_token';
    const snakeRefreshToken = 'snake_refresh_token';
    const snakeExpiresAt = Math.floor(Date.now() / 1000) + 86_400;

    beforeEach(() => {
      delete globalThis.fetch;
    });

    afterEach(() => {
      delete globalThis.fetch;
    });

    test('refresh request body 應使用 snake_case key: refresh_token', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: snakeAccessToken,
          refresh_token: snakeRefreshToken,
          expires_at: snakeExpiresAt,
        }),
      });

      await refreshAccountSession();

      const fetchCall = globalThis.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody).toHaveProperty('refresh_token', VALID_SESSION.refreshToken);
      expect(requestBody).not.toHaveProperty('refreshToken');
    });

    test('refresh success 應從 snake_case 欄位解析: access_token / refresh_token / expires_at', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: snakeAccessToken,
          refresh_token: snakeRefreshToken,
          expires_at: snakeExpiresAt,
        }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBe(snakeAccessToken);
      expect(storageFake[ACCOUNT_STORAGE_KEYS.REFRESH_TOKEN]).toBe(snakeRefreshToken);
      expect(storageFake[ACCOUNT_STORAGE_KEYS.EXPIRES_AT]).toBe(snakeExpiresAt);
    });

    test('refresh terminal error 應從 error_code 解析（非 code）', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error_code: 'INVALID_REFRESH_TOKEN' }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBeUndefined();
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'refreshAccountSession',
          result: 'cleared',
          reason: 'INVALID_REFRESH_TOKEN',
          httpStatus: 401,
        })
      );
    });

    test('refresh terminal error 的 code 欄位應作為 fallback 相容', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'SESSION_REVOKED' }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBeUndefined();
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reason: 'SESSION_REVOKED',
          httpStatus: 401,
        })
      );
    });

    test('refresh success 的 camelCase 欄位應作為 fallback 相容', async () => {
      await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'camel_access',
          refreshToken: 'camel_refresh',
          expiresAt: snakeExpiresAt,
        }),
      });

      await refreshAccountSession();

      expect(storageFake[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]).toBe('camel_access');
      expect(storageFake[ACCOUNT_STORAGE_KEYS.REFRESH_TOKEN]).toBe('camel_refresh');
      expect(storageFake[ACCOUNT_STORAGE_KEYS.EXPIRES_AT]).toBe(snakeExpiresAt);
    });
  });
});
