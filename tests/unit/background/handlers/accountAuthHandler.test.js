/**
 * @jest-environment jsdom
 */

import { createAccountAuthHandler } from '../../../../scripts/background/handlers/accountAuthHandler.js';

describe('accountAuthHandler', () => {
  let runtime;
  let tabs;
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

    handler = createAccountAuthHandler({
      oauthServerUrl: 'https://worker.test',
      runtime,
      tabs,
    });
  });

  test('setupListeners 應註冊 tabs.onUpdated 與 tabs.onRemoved listener', () => {
    handler.setupListeners();

    expect(tabs.onUpdated.addListener).toHaveBeenCalledWith(expect.any(Function));
    expect(tabs.onRemoved.addListener).toHaveBeenCalledWith(expect.any(Function));
  });

  test('符合 callback bridge 條件時應導向 auth.html 並帶 account_ticket', async () => {
    handler.setupListeners();

    await onUpdatedListener(12, {
      url: 'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123&mode=bridge',
    });

    expect(runtime.getURL).toHaveBeenCalledWith('auth.html?account_ticket=ticket_123');
    expect(tabs.update).toHaveBeenCalledWith(12, {
      url: 'chrome-extension://ext_id_123/auth.html?account_ticket=ticket_123',
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

  test('tab 關閉後應清除去重狀態，允許下一個 tab 重新處理', async () => {
    handler.setupListeners();

    const bridgeUrl =
      'https://worker.test/v1/account/callback-bridge?account_ticket=ticket_123&ext_id=ext_id_123';

    await onUpdatedListener(12, { url: bridgeUrl });
    onRemovedListener(12);
    await onUpdatedListener(12, { url: bridgeUrl });

    expect(tabs.update).toHaveBeenCalledTimes(2);
  });
});
