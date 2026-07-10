/*
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 *
 * TabService tab runtime and listener tests
 */

import { jest } from '@jest/globals';
import { createTabService, mockLogger, resetTabServiceTestState } from './tabServiceTestHarness.js';

describe('TabService tab runtime', () => {
  let service = null;

  beforeEach(() => {
    resetTabServiceTestState();
    service = createTabService();
  });

  describe('setupListeners', () => {
    it('should register tab update listener', () => {
      service.setupListeners();

      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    });

    it('should register tab activation listener', () => {
      service.setupListeners();

      expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    });
  });

  describe('waitForTabCompilation', () => {
    // Helper to flush potential microtasks.
    // We need to wait for the async _waitForTabCompilation method to proceed past its
    // initial `await chrome.tabs.get()` and register the event listeners.
    // A single await might not be enough depending on the internal promise chain.
    const flushMicrotasks = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const waitForCompilationListener = async addListener => {
      let listener = null;
      addListener.mockImplementation(cb => {
        listener = cb;
      });

      const promise = service._waitForTabCompilation(1);

      // 等待非同步操作推進到監聽器註冊階段
      await flushMicrotasks();

      return { listener, promise };
    };

    it('應該在標籤頁已完成載入時直接返回', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'complete' });
      const res = await service._waitForTabCompilation(1);
      expect(res.status).toBe('complete');
    });

    it('應該在已有待處理監聽器時返回 null', async () => {
      service.pendingListeners.set(1, {});
      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'loading' });
      const res = await service._waitForTabCompilation(1);
      expect(res).toBeNull();
    });

    it.each([
      {
        name: '更新事件',
        getAddListener: () => chrome.tabs.onUpdated.addListener,
        trigger: listener => listener(1, { status: 'complete' }),
        assertResult: res => expect(res.status).toBe('complete'),
      },
      {
        name: '移除事件',
        getAddListener: () => chrome.tabs.onRemoved.addListener,
        trigger: listener => listener(1),
        assertResult: res => expect(res).toBeNull(),
      },
    ])('應該處理標籤頁$name', async ({ getAddListener, trigger, assertResult }) => {
      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'loading' });

      const { listener, promise } = await waitForCompilationListener(getAddListener());

      if (typeof listener === 'function') {
        trigger(listener);
      }

      const res = await promise;
      assertResult(res);
    });

    it('應該在超時後返回 null', async () => {
      jest.useFakeTimers();
      try {
        chrome.tabs.get.mockResolvedValue({ id: 1, status: 'loading' });

        const promise = service._waitForTabCompilation(1);

        // 等待非同步操作推進到內部 Promise 建立
        await flushMicrotasks();

        jest.advanceTimersByTime(11_000); // 大於 10s

        const res = await promise;
        expect(res).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
      } finally {
        jest.useRealTimers();
      }
    });

    it('_createTabCompletionWaiter cleans listeners and pending state after update completion', async () => {
      jest.useFakeTimers();
      try {
        let updateListener = null;
        let removedListener = null;
        chrome.tabs.onUpdated.addListener.mockImplementation(listener => {
          updateListener = listener;
        });
        chrome.tabs.onRemoved.addListener.mockImplementation(listener => {
          removedListener = listener;
        });

        const promise = service._createTabCompletionWaiter(7);

        expect(service.pendingListeners.has(7)).toBe(true);

        updateListener(7, { status: 'complete' });
        await expect(promise).resolves.toEqual({ status: 'complete' });

        expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledWith(updateListener);
        expect(chrome.tabs.onRemoved.removeListener).toHaveBeenCalledWith(removedListener);
        expect(service.pendingListeners.has(7)).toBe(false);

        jest.advanceTimersByTime(1100);
        expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('timeout'));
      } finally {
        jest.useRealTimers();
      }
    });

    it('_createTabCompletionWaiter resolves null and cleans listeners after tab removal', async () => {
      let removedListener = null;
      chrome.tabs.onRemoved.addListener.mockImplementation(listener => {
        removedListener = listener;
      });

      const promise = service._createTabCompletionWaiter(8);

      removedListener(8);

      await expect(promise).resolves.toBeNull();
      expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalled();
      expect(chrome.tabs.onRemoved.removeListener).toHaveBeenCalledWith(removedListener);
      expect(service.pendingListeners.has(8)).toBe(false);
    });
  });

  describe('Wrappers (waitForTabComplete, queryTabs, createTab, removeTab)', () => {
    it('queryTabs should wrap chrome.tabs.query', async () => {
      chrome.tabs.query = jest.fn().mockResolvedValue([]);
      await service.queryTabs({ active: true });
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true });
    });

    it('createTab should wrap chrome.tabs.create', async () => {
      chrome.tabs.create = jest.fn().mockResolvedValue({});
      await service.createTab({ url: 'https://test.com' });
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://test.com' });
    });

    it('removeTab should wrap chrome.tabs.remove', async () => {
      chrome.tabs.remove = jest.fn().mockResolvedValue();
      await service.removeTab(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(1);
    });

    it('waitForTabComplete should call _waitForTabCompilation', async () => {
      const waitForSpy = jest.spyOn(service, '_waitForTabCompilation').mockResolvedValue(true);
      await service.waitForTabComplete(1);
      expect(waitForSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('LIFECYCLE & LISTENERS', () => {
    it('應該處理 chrome.tabs.onActivated 事件', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 10, url: 'https://example.com/activated' });

      service.setupListeners();
      const activatedCallback = chrome.tabs.onActivated.addListener.mock.calls[0][0];

      await activatedCallback({ tabId: 10, windowId: 1 });

      // 驗證 updateTabStatus 被呼叫
      expect(chrome.tabs.get).toHaveBeenCalledWith(10);
    });

    it('應該在 chrome.tabs.onActivated 失敗時靜默處理', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      service.setupListeners();
      const activatedCallback = chrome.tabs.onActivated.addListener.mock.calls[0][0];

      await expect(activatedCallback({ tabId: 999, windowId: 1 })).resolves.toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('應該處理 chrome.tabs.onUpdated 事件', () => {
      jest.useFakeTimers();

      // Spy on the public method we expect to be called
      const updateStatusSpy = jest.spyOn(service, 'updateTabStatus').mockImplementation(() => {});

      try {
        service.setupListeners();
        const updatedCallback = chrome.tabs.onUpdated.addListener.mock.calls[0][0];

        updatedCallback(1, { status: 'complete' }, { id: 1, url: 'https://example.com/updated' });

        // 推進時間：等待 STATUS_UPDATE_DELAY_MS (100ms) 觸發延遲更新
        jest.advanceTimersByTime(200);

        // 驗證延遲後的行為：應該呼叫 updateTabStatus
        expect(updateStatusSpy).toHaveBeenCalledWith(1, 'https://example.com/updated');
      } finally {
        jest.useRealTimers();
        updateStatusSpy.mockRestore();
      }
    });
  });
});
