/**
 * @jest-environment jsdom
 */

const mockSetAccountSession = jest.fn();
const mockSetAccountProfile = jest.fn();
const mockClearAccountSession = jest.fn();

jest.mock('../../../scripts/config/env.js', () => ({
  BUILD_ENV: {
    OAUTH_SERVER_URL: 'https://worker.test',
  },
}));

jest.mock('../../../scripts/auth/accountSession.js', () => ({
  setAccountSession: mockSetAccountSession,
  setAccountProfile: mockSetAccountProfile,
  clearAccountSession: mockClearAccountSession,
}));

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

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
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
    globalThis.history.replaceState({}, '', '/auth.html');

    await loadAuthModule();
    await dispatchDomReady();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('缺少驗證票據');
  });

  it('OAUTH_SERVER_URL 缺失時應顯示錯誤且不發送請求', async () => {
    const { BUILD_ENV } = await import('../../../scripts/config/env.js');
    BUILD_ENV.OAUTH_SERVER_URL = '';
    globalThis.history.replaceState({}, '', '/auth.html?account_ticket=ticket_123');

    await loadAuthModule();
    await dispatchDomReady();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('登入設定異常');
  });

  it('成功交換 session 與 profile 後應寫入 storage、廣播並自動關閉', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access_123',
          refresh_token: 'refresh_123',
          expires_at: 1_700_000_000,
          user_id: 'user_123',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user_id: 'user_123',
          email: 'user@example.com',
          display_name: 'Test User',
          avatar_url: 'https://cdn.example.com/avatar.png',
        }),
      });

    globalThis.history.replaceState({}, '', '/auth.html?account_ticket=ticket_123');

    await loadAuthModule();
    await dispatchDomReady();

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

  it('account/me 失敗時應清除 session 並顯示錯誤', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access_123',
          refresh_token: 'refresh_123',
          expires_at: 1_700_000_000,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'server error',
      });

    globalThis.history.replaceState({}, '', '/auth.html?account_ticket=ticket_123');

    await loadAuthModule();
    await dispatchDomReady();

    expect(mockClearAccountSession).toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('無法取得帳號資訊');
    expect(globalThis.close).not.toHaveBeenCalled();
  });
});
