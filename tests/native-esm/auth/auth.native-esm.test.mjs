/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  ready: jest.fn(),
  start: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};
const sanitizeApiErrorMock = jest.fn(error => error?.message || String(error || 'UNKNOWN_ERROR'));
const getNextAuthEpochMock = jest.fn(async () => 7);

await jest.unstable_mockModule('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    OAUTH_CLIENT_ID: 'notion-client-id',
    OAUTH_SERVER_URL: 'https://worker.example.test/base',
  },
}));

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: sanitizeApiErrorMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/notionAuth.js', () => ({
  getNextAuthEpoch: getNextAuthEpochMock,
  isNonEmptyString: value => typeof value === 'string' && value.trim().length > 0,
}));

const accountLogin = await import('../../../scripts/auth/accountLogin.js');
const accountLoginInitiator = await import('../../../scripts/auth/accountLoginInitiator.js');
const accountSession = await import('../../../scripts/auth/accountSession.js');
const callbackStatusView = await import('../../../scripts/auth/callbackStatusView.js');
const driveClient = await import('../../../scripts/auth/driveClient.js');
const notionOAuthCompleter = await import('../../../scripts/auth/notionOAuthCompleter.js');
const notionOAuthInitiator = await import('../../../scripts/auth/notionOAuthInitiator.js');

const FUTURE_EXPIRES_AT = Math.floor(Date.now() / 1000) + 3600;
const PAST_EXPIRES_AT = Math.floor(Date.now() / 1000) - 60;

let storageData;
let originalCryptoDescriptor;
let originalClose;

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body)),
  };
}

function normalizeKeys(keys) {
  if (keys === null || keys === undefined) {
    return Object.keys(storageData);
  }
  if (Array.isArray(keys)) {
    return keys;
  }
  return [keys];
}

function installChrome() {
  const sessionData = {};
  globalThis.chrome = {
    identity: {
      getRedirectURL: jest.fn(() => 'https://extension.example.test/oauth-callback'),
      launchWebAuthFlow: jest.fn(async ({ url }) => {
        const state = new URL(url).searchParams.get('state');
        return `https://extension.example.test/oauth-callback?code=notion-code&state=${state}`;
      }),
    },
    runtime: {
      id: 'native-esm-ext',
      getURL: jest.fn(path => `chrome-extension://native-esm-ext/${path}`),
      sendMessage: jest.fn(async () => ({ success: true })),
    },
    storage: {
      local: {
        get: jest.fn(async keys => {
          const selectedKeys = normalizeKeys(keys);
          return Object.fromEntries(
            selectedKeys
              .filter(key => Object.hasOwn(storageData, key))
              .map(key => [key, storageData[key]])
          );
        }),
        remove: jest.fn(async keys => {
          for (const key of normalizeKeys(keys)) {
            delete storageData[key];
          }
        }),
        set: jest.fn(async patch => {
          Object.assign(storageData, patch);
        }),
      },
      session: {
        get: jest.fn(async key => ({ [key]: sessionData[key] })),
        set: jest.fn(async patch => {
          Object.assign(sessionData, patch);
        }),
      },
    },
    tabs: {
      create: jest.fn(async ({ url }) => ({ id: 41, url })),
    },
  };
}

function installCrypto() {
  originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: jest.fn(array => {
        array.fill(7);
        return array;
      }),
      randomUUID: jest.fn(() => 'native-esm-uuid'),
    },
  });
}

function restoreCrypto() {
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
  } else {
    delete globalThis.crypto;
  }
}

function renderCallbackDom() {
  document.body.innerHTML = `
    <section id="status-area"></section>
    <p id="close-hint"></p>
  `;
}

async function flushMicrotasks(times = 8) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  storageData = {};
  document.body.innerHTML = '';
  installChrome();
  installCrypto();
  globalThis.fetch = jest.fn();
  originalClose = globalThis.close;
  globalThis.close = jest.fn();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  delete globalThis.chrome;
  delete globalThis.fetch;
  globalThis.close = originalClose;
  restoreCrypto();
});

describe('auth native ESM diagnostics', () => {
  test('account login and session helpers execute account boundary contracts', async () => {
    expect(
      accountLogin.buildAccountApiUrl(
        'https://worker.example.test/base/',
        '/v1/account/google/start'
      )
    ).toBe('https://worker.example.test/base/v1/account/google/start');

    const loginUrl = accountLogin.buildAccountLoginStartUrl();
    expect(loginUrl).toMatchObject({ success: true });
    expect(loginUrl.url).toContain('ext_id=native-esm-ext');
    expect(loginUrl.url).toContain('callback_mode=bridge');

    await expect(accountLoginInitiator.startAccountLogin()).resolves.toEqual({ success: true });
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({ url: loginUrl.url });
    expect(accountLogin.getOptionsAdvancedUrl()).toBe(
      'chrome-extension://native-esm-ext/pages/options/options.html?section=advanced'
    );

    await accountSession.setAccountSession({
      accessToken: 'account-token',
      refreshToken: 'refresh-token',
      expiresAt: FUTURE_EXPIRES_AT,
      userId: 'user-1',
      email: 'user@example.test',
      displayName: 'Native User',
      avatarUrl: 'https://example.test/avatar.png',
    });

    await expect(accountSession.getAccountSession()).resolves.toMatchObject({
      accessToken: 'account-token',
      refreshToken: 'refresh-token',
      email: 'user@example.test',
    });
    await expect(accountSession.getAccountAccessToken()).resolves.toBe('account-token');
    await expect(accountSession.buildAccountAuthHeaders()).resolves.toEqual({
      Authorization: 'Bearer account-token',
    });
    await expect(accountSession.getAccountProfile()).resolves.toMatchObject({
      userId: 'user-1',
      email: 'user@example.test',
    });

    expect(accountSession.isAccountSessionExpired({ expiresAt: PAST_EXPIRES_AT })).toBe(true);
    expect(accountSession.isTerminalRefreshFailure(401, 'SESSION_REVOKED')).toBe(true);

    await accountSession.setAccountSession({
      accessToken: 'expired-account-token',
      refreshToken: 'refresh-token',
      expiresAt: PAST_EXPIRES_AT,
      userId: 'user-1',
      email: 'user@example.test',
      displayName: null,
      avatarUrl: null,
    });
    globalThis.fetch.mockResolvedValueOnce(
      createJsonResponse({
        access_token: 'refreshed-token',
        refresh_token: 'rotated-refresh-token',
        expires_at: FUTURE_EXPIRES_AT,
      })
    );
    await expect(accountSession.getAccountAccessToken()).resolves.toBe('refreshed-token');
    expect(storageData.accountAccessToken).toBe('refreshed-token');

    await accountSession.setAccountProfile({
      userId: 'user-2',
      email: 'profile@example.test',
      displayName: undefined,
      avatarUrl: undefined,
    });
    expect(storageData.accountDisplayName).toBeNull();
    await accountSession.clearAccountSession();
    await expect(accountSession.getAccountSession()).resolves.toBeNull();
  });

  test('Notion OAuth initiator and completer execute callback, token exchange, and storage paths', async () => {
    const authorizeResult = await notionOAuthInitiator.initiateNotionOAuth();
    expect(authorizeResult).toMatchObject({
      code: 'notion-code',
      redirectUri: 'https://extension.example.test/oauth-callback',
      csrfState: 'native-esm-uuid',
    });
    expect(globalThis.chrome.identity.launchWebAuthFlow.mock.calls[0][0].url).toContain(
      'client_id=notion-client-id'
    );

    globalThis.fetch.mockResolvedValueOnce(
      createJsonResponse({
        access_token: 'notion-access',
        refresh_token: 'notion-refresh',
        workspace_id: 'workspace-1',
        workspace_name: 'Native Workspace',
        bot_id: 'bot-1',
      })
    );
    const tokenData = await notionOAuthCompleter.exchangeNotionOAuthCode({
      code: authorizeResult.code,
      redirectUri: authorizeResult.redirectUri,
    });
    expect(tokenData.access_token).toBe('notion-access');
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({
      code: 'notion-code',
      redirect_uri: 'https://extension.example.test/oauth-callback',
    });

    await notionOAuthCompleter.saveNotionOAuthToken(tokenData);
    expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        notionAuthMode: 'oauth',
        notionOAuthToken: 'notion-access',
        notionRefreshToken: 'notion-refresh',
        notionRefreshProof: null,
        notionAuthEpoch: 7,
      })
    );
    expect(globalThis.chrome.storage.local.remove).toHaveBeenCalledWith(['notionRefreshProof']);
  });

  test('callback status view and auth entry execute account ticket bridge flow', async () => {
    jest.useFakeTimers();
    renderCallbackDom();
    callbackStatusView.showLoading('驗證中');
    expect(document.querySelector('#status-text').textContent).toBe('驗證中');

    globalThis.history.replaceState(null, '', '?account_ticket=ticket-1');
    globalThis.fetch
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: 'bridge-access',
          refresh_token: 'bridge-refresh',
          expires_at: FUTURE_EXPIRES_AT,
          user_id: 'bridge-user-from-ticket',
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          user_id: 'bridge-user',
          email: 'bridge@example.test',
          display_name: 'Bridge User',
          avatar_url: 'https://example.test/bridge.png',
        })
      );

    await import('../../../scripts/auth/auth.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushMicrotasks(20);

    expect(storageData.accountAccessToken).toBe('bridge-access');
    expect(storageData.accountEmail).toBe('bridge@example.test');
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account_session_updated',
        userId: 'bridge-user',
        email: 'bridge@example.test',
      })
    );
    expect(document.querySelector('#status-area').className).toContain('status-success');

    await jest.advanceTimersByTimeAsync(1500);
    expect(globalThis.close).toHaveBeenCalled();

    callbackStatusView.showError('登入失敗', 'account/me failed');
    expect(document.querySelector('#status-area').textContent).toContain('account/me failed');
  });

  test('Drive auth client executes metadata and protected API helpers', async () => {
    await accountSession.setAccountSession({
      accessToken: 'drive-account-token',
      refreshToken: 'drive-refresh-token',
      expiresAt: FUTURE_EXPIRES_AT,
      userId: 'drive-user',
      email: 'drive@example.test',
      displayName: 'Drive User',
      avatarUrl: null,
    });

    storageData.driveSyncConnectionEmail = 'drive@example.test';
    storageData.driveSyncNeedsManualReview = true;
    await expect(driveClient.getDriveSyncMetadata()).resolves.toMatchObject({
      connectionEmail: 'drive@example.test',
      needsManualReview: true,
      frequency: 'off',
    });

    delete storageData.driveSyncInstallationId;
    await expect(driveClient.ensureDriveSyncIdentity()).resolves.toBe('native-esm-uuid');
    await driveClient.setDriveConnection(
      { email: 'drive-connected@example.test', connectedAt: '2026-06-26T00:00:00.000Z' },
      { resetConflicts: false }
    );
    expect(storageData.driveSyncConnectionEmail).toBe('drive-connected@example.test');

    await driveClient.updateDriveSyncRunMetadata({
      type: 'upload',
      success: false,
      errorCode: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: 'remote-time',
    });
    expect(storageData.driveSyncNeedsManualReview).toBe(true);
    await driveClient.clearDriveSyncConflict();
    expect(storageData.driveSyncNeedsManualReview).toBe(false);

    globalThis.fetch.mockResolvedValueOnce(
      createJsonResponse({
        authorizationUrl: 'https://accounts.google.example.test/drive-auth',
      })
    );
    await driveClient.startDriveOAuthFlow();
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://accounts.google.example.test/drive-auth',
    });

    globalThis.fetch.mockResolvedValueOnce(
      createJsonResponse({
        provider_account_email: 'drive-connected@example.test',
        connected_at: '2026-06-26T00:00:00.000Z',
      })
    );
    await expect(driveClient.fetchDriveConnectionStatus()).resolves.toMatchObject({
      connected: true,
      email: 'drive-connected@example.test',
    });

    globalThis.fetch.mockResolvedValueOnce(
      createJsonResponse({
        has_snapshot: true,
        remote_updated_at: 'remote-updated',
        source_installation_id: 'install-1',
        source_profile_id: 'profile-1',
      })
    );
    await expect(driveClient.fetchDriveSnapshotStatus()).resolves.toMatchObject({
      exists: true,
      updatedAt: 'remote-updated',
      sourceInstallationId: 'install-1',
      sourceProfileId: 'profile-1',
    });

    globalThis.fetch.mockResolvedValueOnce(
      createJsonResponse({ code: 'REMOTE_SNAPSHOT_NEWER', remote_updated_at: 'newer' }, { status: 409 })
    );
    await expect(driveClient.uploadDriveSnapshot({ pages: [] })).resolves.toMatchObject({
      success: false,
      errorCode: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: 'newer',
    });

    globalThis.fetch.mockResolvedValueOnce(createJsonResponse({ snapshot: { pages: [] } }));
    await expect(driveClient.downloadDriveSnapshot()).resolves.toEqual({ snapshot: { pages: [] } });

    globalThis.fetch.mockResolvedValueOnce(createJsonResponse({ ok: true }));
    await expect(driveClient.disconnectDrive()).resolves.toBeUndefined();

    await driveClient.setDriveFrequency('daily');
    expect(storageData.driveSyncFrequency).toBe('daily');
    await driveClient.markDriveDirty();
    expect(storageData.driveSyncDirtyRevision).toBe(1);
    await driveClient.clearDriveDirty({
      expectedDirtyRevision: 1,
      frequency: 'off',
      snapshotHash: 'hash-1',
    });
    expect(storageData.driveSyncLastUploadedRevision).toBe(1);
    await driveClient.writeDriveAutoSyncTelemetry({
      alarmFiredAt: 'alarm-time',
      decision: 'skip',
      skipReason: 'no_dirty_data',
    });
    expect(storageData.driveSyncLastAutoSyncSkipReason).toBe('no_dirty_data');
  });
});
