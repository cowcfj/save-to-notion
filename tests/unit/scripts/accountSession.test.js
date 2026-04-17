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

import {
  getAccountSession,
  setAccountSession,
  clearAccountSession,
  getAccountAccessToken,
  isAccountSessionExpired,
  buildAccountAuthHeaders,
  getAccountProfile,
  setAccountProfile,
  ACCOUNT_STORAGE_KEYS,
} from '../../../scripts/auth/accountSession.js';

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

  test('Session 已過期時應回傳 null（Phase 1 保守策略：不 silent refresh）', async () => {
    await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });
    expect(await getAccountAccessToken()).toBeNull();
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

  test('過期 session 時應回傳空物件', async () => {
    await setAccountSession({ ...VALID_SESSION, expiresAt: PAST_EXPIRES_AT });
    const headers = await buildAccountAuthHeaders();
    expect(headers).toEqual({});
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
