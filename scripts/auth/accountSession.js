/**
 * Account Session Helper
 *
 * 封裝 Cloudflare-native account session 的 chrome.storage.local 存取。
 *
 * ⚠️  設計原則（不可違反）：
 * 1. 本模組 MUST NOT 依賴或修改任何 Notion OAuth helper（notionAuth.js 等）。
 * 2. 所有 storage key 皆以 account 前綴命名，與 Notion OAuth keys 完整隔離。
 * 3. token 過期判斷使用 accountAccessTokenExpiresAt（秒），比較前須 × 1000。
 * 4. Phase 2：token 過期且有 refresh token 時，自動呼叫 POST /v1/account/session/refresh。
 *    只有 terminal failure（401 + INVALID_REFRESH_TOKEN / SESSION_REVOKED / REFRESH_REUSE_DETECTED）
 *    才清除本地 session；transient failure（network error / 5xx）會 re-throw，由 caller 決定 UI。
 *
 * Storage keys（與 .agents/.shared/knowledge/storage_schema.json 一致）：
 *   accountAccessToken          — Bearer token
 *   accountRefreshToken         — 用於 silent refresh
 *   accountAccessTokenExpiresAt — Unix timestamp 秒
 *   accountUserId               — 帳號 user ID
 *   accountEmail                — 帳號 email
 *   accountDisplayName          — 顯示名稱（可能為 null）
 *   accountAvatarUrl            — 頭像 URL（可能為 null）
 *
 * @see docs/plans/2026-04-25-account-session-refresh-hardening-plan.md
 * @see .agents/.shared/knowledge/storage_schema.json §storageAreas.local.accountSession
 */

/* global chrome */
import { BUILD_ENV } from '../config/env/index.js';
import Logger from '../utils/Logger.js';

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
// Refresh 相關常量
// =============================================================================

/**
 * Terminal refresh failure 的錯誤碼集合。
 * 出現以下任一碼時，代表 session 已不可恢復， MUST 清除本地 session。
 *
 * @see docs/plans/2026-04-25-account-session-refresh-hardening-plan.md §9.2
 */
const TERMINAL_REFRESH_ERROR_CODES = new Set([
  'INVALID_REFRESH_TOKEN',
  'SESSION_REVOKED',
  'REFRESH_REUSE_DETECTED',
]);

const REFRESH_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Single-flight in-flight promise。
 * 管理正在進行中的 refresh 請求，避免多個呼叫送出重複 refresh。
 *
 * @type {Promise<string | null> | null}
 */
let refreshInFlightPromise = null;

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
 * 若 access token 已過期且存在 refresh token，會先嘗試 silent refresh。
 * transient failure（network error / 5xx）時會 re-throw，由 caller 決定處理方式。
 *
 * @returns {Promise<string | null>}
 * @throws {Error} transient refresh failure 時拋出錯誤
 */
export async function getAccountAccessToken() {
  const session = await getAccountSession();
  if (!session) {
    return null;
  }
  if (!isAccountSessionExpired(session)) {
    return session.accessToken;
  }

  // 過期且有 refresh token → 嘗試 silent refresh
  if (!session.refreshToken) {
    return null;
  }

  // single-flight：若已有 refresh 在飛，共用同一個 Promise
  if (!refreshInFlightPromise) {
    refreshInFlightPromise = refreshAccountSession().finally(() => {
      refreshInFlightPromise = null;
    });
  }

  return refreshInFlightPromise;
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
 * 經由 getAccountAccessToken() 路徑，必要時會自動觸發 refresh。
 *
 * @returns {Promise<{'Authorization': string} | Record<string, never>>}
 */
export async function buildAccountAuthHeaders() {
  let token;
  try {
    token = await getAccountAccessToken();
  } catch (error) {
    Logger.debug('Failed to get account access token; returning empty auth headers', {
      reason: 'get_account_access_token_failure',
      err: error,
    });
    return {};
  }
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
 * 將 GET /v1/account/me 回傳的 profile 資料合並寫入 storage。
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
// Refresh Lifecycle
// =============================================================================

/**
 * 取得 account API 的 base URL。
 * `BUILD_ENV` 由 `../config/env/index.js` 載入；在生產建置時，
 * webpack 會以實際建置值替換 `BUILD_ENV.OAUTH_SERVER_URL`。
 * 此函式直接回傳 `BUILD_ENV.OAUTH_SERVER_URL`，若未設定則回傳空字串，
 * 由呼叫方判斷並處理。
 *
 * @returns {string}
 */
function resolveAccountApiBaseUrl() {
  return BUILD_ENV.OAUTH_SERVER_URL ?? '';
}

/**
 * 從 refresh 流程的錯誤物件提取可安全寫入日誌的字串。
 *
 * @param {unknown} error
 * @returns {string}
 */
function getRefreshLogError(error) {
  if (error instanceof Error) {
    return error.message || error.stack || error.name;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'number' || typeof error === 'boolean') {
    return String(error);
  }

  try {
    return JSON.stringify(error) ?? 'unknown error';
  } catch {
    return '[Unserializable Value]';
  }
}

/**
 * 驗證 refresh response payload 是否完整。
 *
 * @param {unknown} body
 * @returns {{ accessToken: string; refreshToken: string; expiresAt: number }}
 * @throws {Error}
 */
function validateRefreshSuccessPayload(body) {
  if (typeof body !== 'object' || body === null) {
    throw new Error('[accountSession] refresh response body must be an object');
  }

  let accessTokenRaw = '';
  if (typeof body.access_token === 'string') {
    accessTokenRaw = body.access_token;
  } else if (typeof body.accessToken === 'string') {
    accessTokenRaw = body.accessToken;
  }
  const accessToken = accessTokenRaw.trim();

  let refreshToken = null;
  if (typeof body.refresh_token === 'string') {
    refreshToken = body.refresh_token;
  } else if (typeof body.refreshToken === 'string') {
    refreshToken = body.refreshToken;
  }

  let expiresAt;
  if (typeof body.expires_at === 'number') {
    expiresAt = body.expires_at;
  } else if (typeof body.expiresAt === 'number') {
    expiresAt = body.expiresAt;
  }

  if (!accessToken) {
    throw new Error('[accountSession] refresh response missing accessToken');
  }
  if (typeof refreshToken !== 'string') {
    throw new TypeError('[accountSession] refresh response missing refreshToken');
  }
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new Error('[accountSession] refresh response missing expiresAt');
  }

  return { accessToken, refreshToken, expiresAt };
}

/**
 * 記錄 refresh transient failure。
 *
 * @param {{
 *   reason: string;
 *   httpStatus?: number;
 *   error: unknown;
 * }} params
 * @returns {void}
 */
function logRefreshFailure({ reason, httpStatus, error }) {
  Logger.error('[accountSession] refresh failed', {
    action: 'refreshAccountSession',
    result: 'failed',
    reason,
    httpStatus,
    error: getRefreshLogError(error),
  });
}

/**
 * 從 refresh 失敗的 response body 提取 error code。
 * 優先讀取 snake_case（error_code），fallback 到 camelCase（code）。
 *
 * @param {object | undefined} body
 * @returns {string | undefined}
 */
function extractRefreshErrorCode(body) {
  if (typeof body?.error_code === 'string') {
    return body.error_code;
  }
  if (typeof body?.code === 'string') {
    return body.code;
  }
  return undefined;
}

/**
 * 分類 fetch 過程中的錯誤原因。
 * classifyFetchError 只應在 fetch 已完成嘗試後呼叫，且 response 僅在 fetch 成功回傳時才會被賦值。
 * 若未來把 fetch 與 response.json() 拆成不同 try block，MUST 同步更新 classifyFetchError 判斷邏輯。
 *
 * @param {unknown} error
 * @param {Response | undefined} response
 * @returns {string}
 */
function classifyFetchError(error, response) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'ABORTED';
  }
  if (response) {
    return 'INVALID_RESPONSE_BODY';
  }
  return 'NETWORK_ERROR';
}

/**
 * 判斷 refresh 失敗碼是否屬於 terminal failure。
 *
 * Terminal failure 代表 session 已不可恢復，前端 MUST 清 session。
 * Transient failure（network error / 5xx）則不應清 session。
 *
 * @param {number} httpStatus - HTTP 狀態碼
 * @param {string | undefined} errorCode - 後端回傳的 code 字段
 * @returns {boolean}
 */
export function isTerminalRefreshFailure(httpStatus, errorCode) {
  if (httpStatus !== 401) {
    return false;
  }
  return TERMINAL_REFRESH_ERROR_CODES.has(errorCode ?? '');
}

/**
 * 呼叫後端 POST /v1/account/session/refresh，嘗試刷新 access token。
 *
 * 成功時：
 *   - 覆寫 accountAccessToken、accountRefreshToken、accountAccessTokenExpiresAt
 *   - MUST NOT 清 profile snapshot
 *   - 回傳新的 access token
 *
 * Terminal failure（401 + 特定錯誤碼）：
 *   - 清除 account session
 *   - 回傳 null
 *
 * Transient failure（network error / 5xx / 非預期錯誤）：
 *   - 保留現有 session
 *   - re-throw error—由呼叫方決定 UI 處理
 *   - 包含 timeout、JSON parse failure、success payload validation failure
 *
 * @returns {Promise<string | null>} 成功時回傳新的 access token，terminal failure 時回 null
 * @throws {Error} transient failure 時抋出錯誤
 */
export async function refreshAccountSession() {
  const session = await getAccountSession();
  if (!session?.refreshToken) {
    return null;
  }

  const baseUrl = resolveAccountApiBaseUrl();
  if (!baseUrl) {
    throw new Error('[accountSession] OAUTH_SERVER_URL 未設定，無法執行 refresh');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REFRESH_REQUEST_TIMEOUT_MS);

  let response;
  let body;

  try {
    response = await fetch(`${baseUrl}/v1/account/session/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
      signal: controller.signal,
    });

    body = await response.json();
  } catch (error) {
    const reason = classifyFetchError(error, response);

    logRefreshFailure({
      reason,
      httpStatus: response?.status,
      error,
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorCode = extractRefreshErrorCode(body);

    if (isTerminalRefreshFailure(response.status, errorCode)) {
      // Terminal failure：清 session，回 null
      Logger.warn('[accountSession] refresh terminal failure, clearing session', {
        action: 'refreshAccountSession',
        result: 'cleared',
        reason: errorCode,
        httpStatus: response.status,
      });
      await clearAccountSession();
      return null;
    }

    // Transient failure：5xx 等
    const error = new Error(`[accountSession] refresh transient failure, HTTP ${response.status}`);
    logRefreshFailure({
      reason: errorCode ?? 'HTTP_ERROR',
      httpStatus: response.status,
      error,
    });
    throw error;
  }

  let payload;
  try {
    payload = validateRefreshSuccessPayload(body);
  } catch (error) {
    logRefreshFailure({
      reason: 'INVALID_RESPONSE_PAYLOAD',
      httpStatus: response.status,
      error,
    });
    throw error;
  }

  // 成功：只覆寫 token 相關 key，MUST NOT 清 profile snapshot
  await chrome.storage.local.set({
    [ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN]: payload.accessToken,
    [ACCOUNT_STORAGE_KEYS.REFRESH_TOKEN]: payload.refreshToken,
    [ACCOUNT_STORAGE_KEYS.EXPIRES_AT]: payload.expiresAt,
  });

  Logger.success('[accountSession] refresh succeeded', {
    action: 'refreshAccountSession',
    result: 'success',
  });

  return payload.accessToken;
}

// =============================================================================
// 內部常量匯出（供測試使用）
// =============================================================================

export { ACCOUNT_STORAGE_KEYS };
