/**
 * @jest-environment jsdom
 */

const mockSetDriveConnection = jest.fn();

jest.mock('../../../scripts/auth/driveClient.js', () => ({
  setDriveConnection: mockSetDriveConnection,
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

async function loadDriveAuthModule() {
  await import('../../../scripts/auth/drive-auth.js');
}

describe('drive-auth.js', () => {
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
    originalClose = globalThis.close;
    globalThis.close = jest.fn();
    domReadyHandler = null;
    originalAddEventListener = document.addEventListener.bind(document);
    mockSetDriveConnection.mockReset();
    mockSetDriveConnection.mockResolvedValue(undefined);
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

  it('成功寫入 Drive 連線資訊後應廣播並自動關閉', async () => {
    globalThis.history.replaceState(
      {},
      '',
      '/drive-auth.html?drive_email=user@example.com&connected_at=2026-04-21T10:00:00.000Z'
    );

    await loadDriveAuthModule();
    await dispatchDomReady();

    expect(mockSetDriveConnection).toHaveBeenCalledWith({
      email: 'user@example.com',
      connectedAt: '2026-04-21T10:00:00.000Z',
    });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'DRIVE_CONNECTION_UPDATED',
      email: 'user@example.com',
      connectedAt: '2026-04-21T10:00:00.000Z',
    });
    expect(document.querySelector('#status-area').className).toContain('status-success');

    jest.advanceTimersByTime(1500);
    expect(globalThis.close).toHaveBeenCalled();
  });

  it('URL 帶 error 時應顯示錯誤且不寫入 metadata', async () => {
    globalThis.history.replaceState({}, '', '/drive-auth.html?error=access_denied');

    await loadDriveAuthModule();
    await dispatchDomReady();

    expect(mockSetDriveConnection).not.toHaveBeenCalled();
    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector('#status-area').className).toContain('status-error');
    expect(document.querySelector('#status-area').textContent).toContain('Google Drive 授權失敗');
    expect(document.querySelector('#status-area').textContent).toContain('access_denied');
    expect(globalThis.close).not.toHaveBeenCalled();
  });
});
