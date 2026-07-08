/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { createAccountAuthHandler } from '../../../../scripts/background/handlers/accountAuthHandler.js';

globalThis.Logger = {
  warn: jest.fn(),
};

describe('accountAuthHandler', () => {
  let runtime;
  let tabs;
  let logger;
  let onUpdatedListener;
  let onRemovedListener;
  let handler;

  beforeEach(() => {
    onUpdatedListener = null;
    onRemovedListener = null;

    runtime = {
      id: 'ext_id_123',
      getURL: jest.fn(path => `chrome-extension://ext_id_123/${path}`),
    };

    tabs = {
      update: jest.fn().mockResolvedValue(undefined),
      onUpdated: {
        addListener: jest.fn(listener => {
          onUpdatedListener = listener;
        }),
      },
      onRemoved: {
        addListener: jest.fn(listener => {
          onRemovedListener = listener;
        }),
      },
    };

    logger = {
      warn: jest.fn(),
    };

    handler = createAccountAuthHandler({
      oauthServerUrl: 'https://worker.test',
      runtime,
      tabs,
      logger,
    });
  });

  test('setupListeners 應註冊 tabs.onUpdated 與 tabs.onRemoved listener', () => {
    handler.setupListeners();

    expect(tabs.onUpdated.addListener).toHaveBeenCalledWith(expect.any(Function));
    expect(tabs.onRemoved.addListener).toHaveBeenCalledWith(expect.any(Function));
  });

  test('oauthServerUrl 缺失時不應在初始化階段拋出例外', () => {
    expect(() =>
      createAccountAuthHandler({
        oauthServerUrl: '',
        runtime,
        tabs,
      })
    ).not.toThrow();
  });

  test.each([
    {
      name: '符合 callback bridge 條件時應導向 canonical auth page 並帶 account_ticket',
      bridgeUrl:
        'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123&mode=bridge',
      expectedAuthPath: 'pages/auth/auth.html?account_ticket=ticket_123',
      expectedAuthUrl:
        'chrome-extension://ext_id_123/pages/auth/auth.html?account_ticket=ticket_123',
    },
    {
      name: 'account_ticket 含特殊字元時應重新編碼後再導向 canonical auth page',
      bridgeUrl:
        'https://worker.test/v1/account/callback-bridge?account_ticket=ticket%26with%23parts%3Fx%3D1&ext_id=ext_id_123',
      expectedAuthPath: 'pages/auth/auth.html?account_ticket=ticket%26with%23parts%3Fx%3D1',
      expectedAuthUrl:
        'chrome-extension://ext_id_123/pages/auth/auth.html?account_ticket=ticket%26with%23parts%3Fx%3D1',
    },
  ])('$name', async ({ bridgeUrl, expectedAuthPath, expectedAuthUrl }) => {
    handler.setupListeners();

    await onUpdatedListener(12, { url: bridgeUrl });

    expect(runtime.getURL).toHaveBeenCalledWith(expectedAuthPath);
    expect(tabs.update).toHaveBeenCalledWith(12, {
      url: expectedAuthUrl,
    });
  });

  test('ext_id 與目前 extension 不一致時不應攔截', async () => {
    handler.setupListeners();

    await onUpdatedListener(12, {
      url: 'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=other_ext_id',
    });

    expect(runtime.getURL).not.toHaveBeenCalled();
    expect(tabs.update).not.toHaveBeenCalled();
  });

  test('origin 不一致時不應攔截', async () => {
    handler.setupListeners();

    await onUpdatedListener(12, {
      url: 'https://evil.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123',
    });

    expect(runtime.getURL).not.toHaveBeenCalled();
    expect(tabs.update).not.toHaveBeenCalled();
  });

  test('pathname 不一致時不應攔截', async () => {
    handler.setupListeners();

    await onUpdatedListener(12, {
      url: 'https://worker.test/v1/account/google/callback?account_ticket=ticket_123&ext_id=ext_id_123',
    });

    expect(runtime.getURL).not.toHaveBeenCalled();
    expect(tabs.update).not.toHaveBeenCalled();
  });

  test('tab update 缺少 url 時不應攔截', async () => {
    handler.setupListeners();

    await onUpdatedListener(12, {});

    expect(runtime.getURL).not.toHaveBeenCalled();
    expect(tabs.update).not.toHaveBeenCalled();
  });

  test('缺少 account_ticket 時不應攔截', async () => {
    handler.setupListeners();

    await onUpdatedListener(12, {
      url: 'https://worker.test/v1/account/callback-bridge?ext_id=ext_id_123',
    });

    expect(runtime.getURL).not.toHaveBeenCalled();
    expect(tabs.update).not.toHaveBeenCalled();
  });

  test('同一 tab 的同一 bridge URL 重複觸發時只應處理一次', async () => {
    handler.setupListeners();

    const bridgeUrl =
      'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123';

    await onUpdatedListener(12, { url: bridgeUrl });
    await onUpdatedListener(12, { url: bridgeUrl });

    expect(tabs.update).toHaveBeenCalledTimes(1);
  });

  test('同一 tab 收到不同 bridge URL 時應清除舊去重狀態並重新處理', async () => {
    handler.setupListeners();

    const firstBridgeUrl =
      'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123';
    const secondBridgeUrl =
      'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_456&ext_id=ext_id_123';

    await onUpdatedListener(12, { url: firstBridgeUrl });
    await onUpdatedListener(12, { url: secondBridgeUrl });

    expect(tabs.update).toHaveBeenCalledTimes(2);
    expect(tabs.update).toHaveBeenNthCalledWith(2, 12, {
      url: 'chrome-extension://ext_id_123/pages/auth/auth.html?account_ticket=ticket_456',
    });
  });

  test('tab 關閉後應清除去重狀態，允許下一個 tab 重新處理', async () => {
    handler.setupListeners();

    const bridgeUrl =
      'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123';

    await onUpdatedListener(12, { url: bridgeUrl });
    onRemovedListener(12);
    await onUpdatedListener(12, { url: bridgeUrl });

    expect(tabs.update).toHaveBeenCalledTimes(2);
  });

  test('導向失敗時應記錄脫敏後的錯誤而非原始 Error 物件', async () => {
    handler.setupListeners();

    tabs.update.mockRejectedValueOnce(
      new Error(
        'tabs.update failed for https://worker.test/v1/account/callback-bridge?account_ticket=secret_ticket&ext_id=ext_id_123&token=abc123'
      )
    );

    await onUpdatedListener(12, {
      url: 'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123',
    });

    expect(logger.warn).toHaveBeenCalledWith('Account callback bridge 導向失敗', {
      action: 'handleAccountCallbackBridge',
      tabId: 12,
      error: 'UNKNOWN_ERROR',
    });
  });
});
