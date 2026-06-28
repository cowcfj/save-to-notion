/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSetAccountSession = jest.fn();
const mockSetAccountProfile = jest.fn();
const mockClearAccountSession = jest.fn();

const mockEnvModule = {
  BUILD_ENV: {
    OAUTH_SERVER_URL: 'https://worker.test',
  },
};

const mockAccountSessionModule = {
  setAccountSession: mockSetAccountSession,
  setAccountProfile: mockSetAccountProfile,
  clearAccountSession: mockClearAccountSession,
};

if (typeof jest.unstable_mockModule === 'function') {
  jest.unstable_mockModule('../../../scripts/config/env/index.js', () => mockEnvModule);
  jest.unstable_mockModule(
    '../../../scripts/auth/accountSession.js',
    () => mockAccountSessionModule
  );
}

jest.mock('../../../scripts/config/env/index.js', () => mockEnvModule);

jest.mock('../../../scripts/auth/accountSession.js', () => mockAccountSessionModule);

function buildAuthDom() {
  document.body.innerHTML = `
    <main>
      <output id="status-area" class="status-area">
        <div id="spinner"></div>
        <p id="status-text"></p>
      </output>
      <p id="close-hint" style="display: none"></p>
    </main>
  `;
}

async function loadAuthModule() {
  await import('../../../scripts/auth/auth.js');
}

function buildSessionExchangePayload(overrides = {}) {
  return {
    access_token: 'access_123',
    refresh_token: 'refresh_123',
    expires_at: 1_700_000_000,
    user_id: 'user_123',
    ...overrides,
  };
}

function buildAccountProfilePayload(overrides = {}) {
  return {
    user_id: 'user_123',
    email: 'user@example.com',
    display_name: 'Test User',
    avatar_url: 'https://cdn.example.com/avatar.png',
    ...overrides,
  };
}

function mockJsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

function mockTextErrorResponse(status, body) {
  return {
    ok: false,
    status,
    text: async () => body,
  };
}

function expectStatusError(message, detail) {
  const statusArea = document.querySelector('#status-area');

  expect(statusArea.className).toContain('status-error');
  expect(statusArea.textContent).toContain(message);
  if (detail) {
    expect(statusArea.textContent).toContain(detail);
  }
  expect(globalThis.close).not.toHaveBeenCalled();
}

function expectNoSessionPersistence({ clearSession = false } = {}) {
  expect(mockSetAccountSession).not.toHaveBeenCalled();
  expect(mockSetAccountProfile).not.toHaveBeenCalled();
  if (clearSession) {
    expect(mockClearAccountSession).toHaveBeenCalled();
    return;
  }

  expect(mockClearAccountSession).not.toHaveBeenCalled();
}

describe('auth.js', () => {
  let originalClose;
  let domReadyHandler;
  let originalAddEventListener;

  async function dispatchDomReady() {
    await domReadyHandler?.();
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  }

  async function runTicketExchangeFlow() {
    globalThis.history.replaceState({}, '', '/pages/auth/auth.html?account_ticket=ticket_123');

    await loadAuthModule();
    await dispatchDomReady();
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    mockEnvModule.BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test';
    buildAuthDom();
    globalThis.fetch = jest.fn();
    originalClose = globalThis.close;
    globalThis.close = jest.fn();
    domReadyHandler = null;
    originalAddEventListener = document.addEventListener.bind(document);
    mockSetAccountSession.mockReset();
    mockSetAccountSession.mockResolvedValue(undefined);
    mockSetAccountProfile.mockReset();
    mockSetAccountProfile.mockResolvedValue(undefined);
    mockClearAccountSession.mockReset();
    mockClearAccountSession.mockResolvedValue(undefined);
    jest.spyOn(document, 'addEventListener').mockImplementation((eventName, listener, options) => {
      if (eventName === 'DOMContentLoaded') {
        domReadyHandler = listener;
        return;
      }

      return originalAddEventListener(eventName, listener, options);
    });
    globalThis.chrome = {
      runtime: {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
      },
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete globalThis.chrome;
    globalThis.close = originalClose;
    jest.clearAllMocks();
  });

  it('缺少 account_ticket 時應顯示錯誤且不發送請求', async () => {
    globalThis.history.replaceState({}, '', '/pages/auth/auth.html');

    await loadAuthModule();
    await dispatchDomReady();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('缺少驗證票據');
  });

  it('OAUTH_SERVER_URL 缺失時應顯示錯誤且不發送請求', async () => {
    const { BUILD_ENV } = await import('../../../scripts/config/env/index.js');
    BUILD_ENV.OAUTH_SERVER_URL = '';
    globalThis.history.replaceState({}, '', '/pages/auth/auth.html?account_ticket=ticket_123');

    await loadAuthModule();
    await dispatchDomReady();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('登入設定異常');
  });

  it('成功交換 session 與 profile 後應寫入 storage、廣播並自動關閉', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(mockJsonResponse(buildSessionExchangePayload()))
      .mockResolvedValueOnce(mockJsonResponse(buildAccountProfilePayload()));

    await runTicketExchangeFlow();

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      'https://worker.test/v1/account/session/exchange',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      'https://worker.test/v1/account/me',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer access_123' },
      })
    );

    expect(mockSetAccountSession).toHaveBeenCalledWith({
      accessToken: 'access_123',
      refreshToken: 'refresh_123',
      expiresAt: 1_700_000_000,
      userId: 'user_123',
      email: 'user@example.com',
      displayName: 'Test User',
      avatarUrl: 'https://cdn.example.com/avatar.png',
    });
    expect(mockSetAccountProfile).toHaveBeenCalledWith({
      userId: 'user_123',
      email: 'user@example.com',
      displayName: 'Test User',
      avatarUrl: 'https://cdn.example.com/avatar.png',
    });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account_session_updated',
        userId: 'user_123',
        email: 'user@example.com',
      })
    );
    expect(document.querySelector('#status-area').className).toContain('status-success');

    jest.advanceTimersByTime(1500);
    expect(globalThis.close).toHaveBeenCalled();
  });

  it('OAUTH_SERVER_URL 含 path prefix 時應保留 prefix 呼叫 account API', async () => {
    const { BUILD_ENV } = await import('../../../scripts/config/env/index.js');
    BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test/proxy';
    globalThis.fetch
      .mockResolvedValueOnce(mockJsonResponse(buildSessionExchangePayload()))
      .mockResolvedValueOnce(mockJsonResponse(buildAccountProfilePayload({ avatar_url: null })));
    await runTicketExchangeFlow();

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      'https://worker.test/proxy/v1/account/session/exchange',
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      'https://worker.test/proxy/v1/account/me',
      expect.any(Object)
    );
  });

  it('account/me 失敗時應清除 session 並顯示錯誤', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(
        mockJsonResponse({
          access_token: 'access_123',
          refresh_token: 'refresh_123',
          expires_at: 1_700_000_000,
        })
      )
      .mockResolvedValueOnce(mockTextErrorResponse(500, 'server error'));

    await runTicketExchangeFlow();

    expect(mockClearAccountSession).toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('無法取得帳號資訊');
    expect(globalThis.close).not.toHaveBeenCalled();
  });

  it('account/me 回 200 但缺 user_id 時應清除 session 並顯示錯誤', async () => {
    expect.hasAssertions();

    globalThis.fetch
      .mockResolvedValueOnce(
        mockJsonResponse(
          buildSessionExchangePayload({
            user_id: 'user_from_exchange',
          })
        )
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          email: 'user@example.com',
          display_name: 'Test User',
        })
      );

    await runTicketExchangeFlow();

    expectNoSessionPersistence({ clearSession: true });
    expectStatusError('無法取得帳號資訊', 'user_id');
  });

  it('exchangeTicket 失敗時應顯示錯誤且不寫入 storage', async () => {
    expect.hasAssertions();

    globalThis.fetch.mockResolvedValueOnce(mockTextErrorResponse(400, 'invalid ticket'));

    await runTicketExchangeFlow();

    expectNoSessionPersistence();
    expectStatusError('無法完成 Session 交換');
  });

  it.each([
    ['null', null],
    ['primitive 值', 'invalid response'],
    ['陣列', ['not', 'an', 'object']],
  ])('exchangeTicket 回傳 %s 時應顯示錯誤', async (_label, exchangePayload) => {
    expect.hasAssertions();

    globalThis.fetch.mockResolvedValueOnce(mockJsonResponse(exchangePayload));

    await runTicketExchangeFlow();

    expectNoSessionPersistence();
    expectStatusError('無法完成 Session 交換', 'not a valid object');
  });

  it('寫入 storage 失敗時應清除 session 並顯示錯誤', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(mockJsonResponse(buildSessionExchangePayload()))
      .mockResolvedValueOnce(mockJsonResponse(buildAccountProfilePayload()));

    mockSetAccountSession.mockRejectedValueOnce(new Error('storage quota exceeded'));

    await runTicketExchangeFlow();

    expect(mockClearAccountSession).toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('無法儲存 Session');
    expect(globalThis.close).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['primitive 值', 42],
    ['陣列', [{ email: 'user@example.com' }]],
  ])('account/me 回傳 %s 時應清除 session 並顯示錯誤', async (_label, profilePayload) => {
    expect.hasAssertions();

    globalThis.fetch
      .mockResolvedValueOnce(mockJsonResponse(buildSessionExchangePayload()))
      .mockResolvedValueOnce(mockJsonResponse(profilePayload));

    await runTicketExchangeFlow();

    expectNoSessionPersistence({ clearSession: true });
    expectStatusError('無法取得帳號資訊', 'not a valid object');
  });
});
