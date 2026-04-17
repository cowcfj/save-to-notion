/**
 * Account Session Helper
 *
 * 封裝 Cloudflare-native account session 的 chrome.storage.local 存取。
 *
 * ⚠️  設計原則（不可違反）：
 * 1. 本模組 MUST NOT 依賴或修改任何 Notion OAuth helper（notionAuth.js 等）。
 * 2. 所有 storage key 皆以 account 前綴命名，與 Notion OAuth keys 完整隔離。
 * 3. token 過期判斷使用 accountAccessTokenExpiresAt（秒），比較前須 × 1000。
 * 4. Phase 1：token 過期時視為需重新登入，MUST NOT 做 silent refresh。
 *
 * Storage keys（與 .agents/.shared/knowledge/storage_schema.json 一致）：
 *   accountAccessToken          — Bearer token
 *   accountRefreshToken         — Phase 2 reserved
 *   accountAccessTokenExpiresAt — Unix timestamp 秒
 *   accountUserId               — 帳號 user ID
 *   accountEmail                — 帳號 email
 *   accountDisplayName          — 顯示名稱（可能為 null）
 *   accountAvatarUrl            — 頭像 URL（可能為 null）
 *
 * @see docs/plans/2026-04-17-cloudflare-frontend-account-integration-plan.md §3.3
 * @see .agents/.shared/knowledge/storage_schema.json §storageAreas.local.accountSession
 */

/* global chrome */

// =============================================================================
// Storage key 常量（Single Source of Truth）
// =============================================================================

const ACCOUNT_STORAGE_KEYS = /** @type {const} */ ({
  ACCESS_TOKEN: 'accountAccessToken',
  REFRESH_TOKEN: 'accountRefreshToken',
  EXPIRES_AT: 'accountAccessTokenExpiresAt',
  USER_ID: 'accountUserId',
  EMAIL: 'accountEmail',
  DISPLAY_NAME: 'accountDisplayName',
  AVATAR_URL: 'accountAvatarUrl',
});

/** 所有 account key 的陣列，用於批次讀取 / 清除 */
const ALL_ACCOUNT_KEYS = Object.values(ACCOUNT_STORAGE_KEYS);

// =============================================================================
// 型別定義
// =============================================================================

/**
 * @typedef {object} AccountSession
 * @property {string} accessToken - Bearer token
 * @property {string} refreshToken - Phase 2 reserved
 * @property {number} expiresAt - Unix timestamp（秒）
 * @property {string} userId
 * @property {string} email
 * @property {string | null} displayName
 * @property {string | null} avatarUrl
 */

/**
 * @typedef {object} AccountProfile
 * @property {string} userId
 * @property {string} email
 * @property {string | null} displayName
 * @property {string | null} avatarUrl
 */

// =============================================================================
// 主要 API
// =============================================================================

/**
 * 讀取目前的 account session。
 * 若無 session 或 token 過期，回傳 null。
 *
 * @returns {Promise<AccountSession | null>}
 */
export async function getAccountSession() {
  const data = await chrome.storage.local.get(ALL_ACCOUNT_KEYS);

  const accessToken = data[ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN];
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken: data[ACCOUNT_STORAGE_KEYS.REFRESH_TOKEN] ?? '',
    expiresAt: data[ACCOUNT_STORAGE_KEYS.EXPIRES_AT] ?? 0,
    userId: data[ACCOUNT_STORAGE_KEYS.USER_ID] ?? '',
    email: data[ACCOUNT_STORAGE_KEYS.EMAIL] ?? '',
    displayName: data[ACCOUNT_STORAGE_KEYS.DISPLAY_NAME] ?? null,
    avatarUrl: data[ACCOUNT_STORAGE_KEYS.AVATAR_URL] ?? null,
  };
}

/**
 * 寫入 account session 到 chrome.storage.local。
 * 會以平面 key 分別寫入，不做任何 Notion OAuth key 的修改。
 *
 * @param {AccountSession} session
 * @returns {Promise<void>}
 */
export async function setAccountSession(session) {
  await chrome.storage.local.set({
    [ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]: session.accessToken,
    [ACCOUNT_STORAGE_KEYS.REFRESH_TOKEN]: session.refreshToken,
    [ACCOUNT_STORAGE_KEYS.EXPIRES_AT]: session.expiresAt,
    [ACCOUNT_STORAGE_KEYS.USER_ID]: session.userId,
    [ACCOUNT_STORAGE_KEYS.EMAIL]: session.email,
    [ACCOUNT_STORAGE_KEYS.DISPLAY_NAME]: session.displayName ?? null,
    [ACCOUNT_STORAGE_KEYS.AVATAR_URL]: session.avatarUrl ?? null,
  });
}

/**
 * 清除所有 account session keys。
 * 登出時呼叫此函數；Notion OAuth keys 不受影響。
 *
 * @returns {Promise<void>}
 */
export async function clearAccountSession() {
  await chrome.storage.local.remove(ALL_ACCOUNT_KEYS);
}

/**
 * 取得目前有效的 account access token。
 * 若無 session 或 token 已過期，回傳 null。
 *
 * @returns {Promise<string | null>}
 */
export async function getAccountAccessToken() {
  const session = await getAccountSession();
  if (!session) {
    return null;
  }
  if (isAccountSessionExpired(session)) {
    return null;
  }
  return session.accessToken;
}

/**
 * 判斷 account session 是否已過期。
 *
 * expiresAt 為 Unix timestamp（秒），比較時須 × 1000 轉為毫秒。
 * Phase 1：過期即視為需重新登入，MUST NOT silent refresh。
 *
 * @param {AccountSession | { expiresAt: number }} session
 * @returns {boolean} true 表示已過期或 expiresAt 無效
 */
export function isAccountSessionExpired(session) {
  const raw = Number(session.expiresAt ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    return true;
  }
  const expiresAtMs = raw * 1000;
  return Date.now() >= expiresAtMs;
}

/**
 * 建構 account API 的 Bearer Authorization header。
 *
 * 若無有效 token，回傳空物件（呼叫方應自行決定是否繼續請求）。
 *
 * @returns {Promise<{'Authorization': string} | Record<string, never>>}
 */
export async function buildAccountAuthHeaders() {
  const token = await getAccountAccessToken();
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

/**
 * 取得 account profile 快照（不包含 token 資訊）。
 * Options UI 顯示已登入帳號資訊時使用。
 *
 * @returns {Promise<AccountProfile | null>}
 */
export async function getAccountProfile() {
  const data = await chrome.storage.local.get([
    ACCOUNT_STORAGE_KEYS.USER_ID,
    ACCOUNT_STORAGE_KEYS.EMAIL,
    ACCOUNT_STORAGE_KEYS.DISPLAY_NAME,
    ACCOUNT_STORAGE_KEYS.AVATAR_URL,
  ]);

  const email = data[ACCOUNT_STORAGE_KEYS.EMAIL];
  if (!email) {
    return null;
  }

  return {
    userId: data[ACCOUNT_STORAGE_KEYS.USER_ID] ?? '',
    email,
    displayName: data[ACCOUNT_STORAGE_KEYS.DISPLAY_NAME] ?? null,
    avatarUrl: data[ACCOUNT_STORAGE_KEYS.AVATAR_URL] ?? null,
  };
}

/**
 * 將 GET /v1/account/me 回傳的 profile 資料合併寫入 storage。
 * 通常在 auth.html 成功呼叫 account/me 後呼叫。
 *
 * @param {{ userId: string; email: string; displayName?: string | null; avatarUrl?: string | null }} profile
 * @returns {Promise<void>}
 */
export async function setAccountProfile(profile) {
  await chrome.storage.local.set({
    [ACCOUNT_STORAGE_KEYS.USER_ID]: profile.userId,
    [ACCOUNT_STORAGE_KEYS.EMAIL]: profile.email,
    [ACCOUNT_STORAGE_KEYS.DISPLAY_NAME]: profile.displayName ?? null,
    [ACCOUNT_STORAGE_KEYS.AVATAR_URL]: profile.avatarUrl ?? null,
  });
}

// =============================================================================
// 內部常量匯出（供測試使用）
// =============================================================================

export { ACCOUNT_STORAGE_KEYS };
