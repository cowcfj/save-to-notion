import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createDeferred,
  flushMicrotasks,
  loadSidepanelForCurrentView,
  Logger,
  OPEN_BUTTON_DEBOUNCE_MS,
  RUNTIME_ACTIONS,
  sanitizeApiError,
  SYNC_BUTTON_DEBOUNCE_MS,
  UI_MESSAGES,
} from './sidepanel.shared.js';

const STABLE_PAGE_KEY = 'page_https://example.js/stable';
const STABLE_HIGHLIGHTS_KEY = 'highlights_https://example.js/stable';
const DEFAULT_HIGHLIGHT = { id: '1', text: 'hello world', color: 'yellow' };

function mockStorageFromStore(storeSource, { getDirectValue } = {}) {
  chrome.storage.local.get.mockImplementation(async key => {
    const store = typeof storeSource === 'function' ? storeSource() : storeSource;
    if (typeof key === 'string') {
      const directValue = getDirectValue?.(key, store);
      return { [key]: directValue === undefined ? store[key] : directValue };
    }
    if (Array.isArray(key)) {
      const result = {};
      for (const item of key) {
        if (Object.hasOwn(store, item)) {
          result[item] = store[item];
        }
      }
      return result;
    }
    return store;
  });
}

function mockSavedLegacyHighlightsStorage() {
  chrome.storage.local.get.mockImplementation(async key => {
    if (typeof key === 'string' && key.startsWith('saved_')) {
      return { [key]: { notionPageId: 'page-123' } };
    }
    return {
      [STABLE_HIGHLIGHTS_KEY]: {
        highlights: [DEFAULT_HIGHLIGHT],
      },
    };
  });
}

async function loadSavedLegacyHighlightsTab(flushCount = 0) {
  mockSavedLegacyHighlightsStorage();
  const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
  await onActivated({ tabId: 600 });
  if (flushCount > 0) {
    await flushMicrotasks(flushCount);
  }
}

function buildSavedAndUnsavedPageStores() {
  const savedStore = {
    [STABLE_PAGE_KEY]: {
      highlights: [DEFAULT_HIGHLIGHT],
      notion: { pageId: 'page-123' },
    },
  };
  const unsavedStore = {
    [STABLE_PAGE_KEY]: {
      highlights: [DEFAULT_HIGHLIGHT],
      notion: null,
    },
  };
  return { savedStore, unsavedStore };
}

function dispatchStablePageStorageChange(onStorageChanged, savedStore, unsavedStore) {
  onStorageChanged(
    {
      [STABLE_PAGE_KEY]: {
        oldValue: savedStore[STABLE_PAGE_KEY],
        newValue: unsavedStore[STABLE_PAGE_KEY],
      },
    },
    'local'
  );
}

function createRejectedSendMessageMock(message) {
  const sendMessageFailure = Promise.reject(new Error(message));
  sendMessageFailure.catch(() => {});
  chrome.runtime.sendMessage.mockReturnValue(sendMessageFailure);
}

const SANITIZED_RUNTIME_FAILURE_CASES = [
  {
    name: 'should not display raw savePage error returned from runtime message',
    loadFlushCount: 6,
    response: { success: false, error: 'Custom API Error' },
    buttonSelector: '#sync-button',
    flushCount: 3,
    expectedStatusText: UI_MESSAGES.SIDEPANEL.SYNC_FAILED,
    expectedStatusClassName: 'status-message error',
    expectedLogMessage: '[SidePanel] savePage failed',
    expectedLogPayload: () => ({
      action: 'savePage',
      result: 'failure',
      error: expect.any(String),
    }),
  },
  {
    name: 'should handle missing savePage response as a sanitized failure',
    loadFlushCount: 6,
    response: undefined,
    buttonSelector: '#sync-button',
    flushCount: 3,
    expectedStatusText: UI_MESSAGES.SIDEPANEL.SYNC_FAILED,
    expectedStatusClassName: 'status-message error',
    expectedLogMessage: '[SidePanel] savePage failed',
    expectedLogPayload: () => ({
      action: 'savePage',
      result: 'failure',
      error: 'UNKNOWN_ERROR',
      statusKind: undefined,
      success: undefined,
    }),
  },
  {
    name: 'should treat successful savePage responses with unexpected statusKind as failures',
    loadFlushCount: 6,
    response: {
      success: true,
      statusKind: 'queued',
    },
    buttonSelector: '#sync-button',
    flushCount: 3,
    expectedStatusText: UI_MESSAGES.SIDEPANEL.SYNC_FAILED,
    expectedStatusClassName: 'status-message error',
    expectedLogMessage: '[SidePanel] savePage failed',
    expectedLogPayload: () => ({
      action: 'savePage',
      result: 'failure',
      error: 'Unexpected statusKind: queued',
      statusKind: 'queued',
      success: true,
    }),
  },
  {
    name: 'should not display raw openNotionPage error returned from runtime message',
    loadFlushCount: 2,
    response: {
      success: false,
      error: 'Leaked debug detail',
    },
    buttonSelector: '#open-notion-button',
    flushCount: 3,
    expectedStatusText: UI_MESSAGES.SIDEPANEL.OPEN_FAILED,
    expectedStatusClassName: 'status-message error',
    expectedLogMessage: '[SidePanel] openNotionPage failed',
    expectedLogPayload: () => ({
      error: expect.any(String),
    }),
  },
];

async function loadCurrentTabAndClickFirstDelete() {
  const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
  await onActivated({ tabId: 600 });
  await flushMicrotasks(1);

  const deleteButton = document.querySelector('.delete-button');
  expect(deleteButton).not.toBeNull();
  deleteButton.click();
}

function getRemovedStorageKeys() {
  return chrome.storage.local.remove.mock.calls.flatMap(call =>
    Array.isArray(call[0]) ? call[0] : [call[0]]
  );
}

describe('Sidepanel user interactions', () => {
  beforeEach(async () => {
    await loadSidepanelForCurrentView();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('User Interactions', () => {
    it('should delete highlight on click', async () => {
      const currentMockData = {
        'highlights_https://example.js/stable': {
          highlights: [{ id: '1', text: 'hello world', color: 'yellow' }],
        },
      };

      chrome.storage.local.get.mockImplementation(async () => {
        return currentMockData;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });

      chrome.storage.local.remove.mockResolvedValue();

      const delBtn = document.querySelector('.delete-button');
      delBtn.click();
      // Phase 4：handleDelete shouldRemove 路徑 + helper-driven cleanup 增加多個 await，
      // 需要更多 microtask 循環才能 drain remove + tabs.query + sendMessage。
      await flushMicrotasks(10);

      expect(chrome.storage.local.remove).toHaveBeenCalled();
      const removedKeys = chrome.storage.local.remove.mock.calls.flatMap(call =>
        Array.isArray(call[0]) ? call[0] : [call[0]]
      );
      expect(removedKeys).toContain('highlights_https://example.js/stable');
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(101, {
        action: 'REMOVE_HIGHLIGHT_DOM',
        highlightId: '1',
      });
    });

    it('should update storage if highlights remain after delete', async () => {
      const currentMockData = {
        'highlights_https://example.js/stable': {
          highlights: [
            { id: '1', text: 'hello', color: 'yellow' },
            { id: '2', text: 'world', color: 'blue' },
          ],
          metadata: { lastUpdated: 1000, title: 'Example' },
        },
      };

      chrome.storage.local.get.mockImplementation(async () => currentMockData);

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      // Click delete the FIRST one
      const delBtn = document.querySelector('.delete-button');
      delBtn.click();
      await flushMicrotasks(5);

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const args = chrome.storage.local.set.mock.calls[0][0];
      expect(args['highlights_https://example.js/stable'].highlights).toHaveLength(1);
      expect(args['highlights_https://example.js/stable']).not.toBe(
        currentMockData['highlights_https://example.js/stable']
      );
      expect(args['highlights_https://example.js/stable'].metadata).not.toBe(
        currentMockData['highlights_https://example.js/stable'].metadata
      );
      expect(currentMockData['highlights_https://example.js/stable'].highlights).toHaveLength(2);
      expect(currentMockData['highlights_https://example.js/stable'].metadata).toEqual({
        lastUpdated: 1000,
        title: 'Example',
      });
    });

    it('在新的 page_* 格式上刪除最後一筆 highlight 時應移除 page key', async () => {
      const fakeStore = {
        [STABLE_PAGE_KEY]: {
          highlights: [{ id: '1', text: 'h1', color: 'yellow' }],
        },
      };

      mockStorageFromStore(fakeStore);
      await loadCurrentTabAndClickFirstDelete();
      await flushMicrotasks(6);

      expect(getRemovedStorageKeys()).toContain(STABLE_PAGE_KEY);
    });

    it('在新的 page_* 格式上刪除部分 highlights 時應更新 page key', async () => {
      const fakeStore = {
        [STABLE_PAGE_KEY]: {
          highlights: [
            { id: '1', text: 'h1', color: 'yellow' },
            { id: '2', text: 'h2', color: 'blue' },
          ],
        },
      };

      mockStorageFromStore(fakeStore);
      await loadCurrentTabAndClickFirstDelete();
      await flushMicrotasks(2);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STABLE_PAGE_KEY]: expect.objectContaining({
          highlights: [{ id: '2', text: 'h2', color: 'blue' }],
          metadata: expect.objectContaining({ lastUpdated: expect.any(Number) }),
        }),
      });
    });

    it('在舊的 array 格式上刪除最後一筆 highlight 時應移除 highlights key', async () => {
      const fakeStore = {
        [STABLE_HIGHLIGHTS_KEY]: {
          highlights: [{ id: '1', text: 'h1', color: 'red' }],
        },
      };

      mockStorageFromStore(fakeStore, {
        getDirectValue: key =>
          key === STABLE_HIGHLIGHTS_KEY ? [{ id: '1', text: 'h1', color: 'red' }] : undefined,
      });
      await loadCurrentTabAndClickFirstDelete();
      await flushMicrotasks(6);

      expect(getRemovedStorageKeys()).toContain(STABLE_HIGHLIGHTS_KEY);
    });

    it('在舊的 array 格式上刪除部分 highlights 時應更新 highlights key', async () => {
      const fakeStore = {
        [STABLE_HIGHLIGHTS_KEY]: {
          highlights: [
            { id: '1', text: 'h1', color: 'red' },
            { id: '2', text: 'h2', color: 'blue' },
          ],
        },
      };

      mockStorageFromStore(fakeStore, {
        getDirectValue: key => {
          if (key !== STABLE_HIGHLIGHTS_KEY) {
            return undefined;
          }
          return [
            { id: '1', text: 'h1', color: 'red' },
            { id: '2', text: 'h2', color: 'blue' },
          ];
        },
      });
      await loadCurrentTabAndClickFirstDelete();
      await flushMicrotasks(2);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STABLE_HIGHLIGHTS_KEY]: [{ id: '2', text: 'h2', color: 'blue' }],
      });
    });

    it('在 handleDelete 期間若遇到未知資料格式應能優雅地移除', async () => {
      const fakeStore = {
        'highlights_https://example.js/stable': {
          highlights: [{ id: '1', text: 'h1', color: 'yellow' }],
        },
      };
      chrome.storage.local.get.mockImplementation(async k => {
        // give garbage on direct single-key get
        if (typeof k === 'string') {
          return { [k]: 'unknown_string_data' };
        }
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (Object.hasOwn(fakeStore, key)) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await flushMicrotasks(1);
      const delBtn = document.querySelector('.delete-button');
      expect(delBtn).not.toBeNull();
      delBtn.click();
      await flushMicrotasks(6);
      const removedKeysGarbage = chrome.storage.local.remove.mock.calls.flatMap(call =>
        Array.isArray(call[0]) ? call[0] : [call[0]]
      );
      expect(removedKeysGarbage).toContain('highlights_https://example.js/stable');
    });

    it('should trigger sync click successfully', async () => {
      await loadSavedLegacyHighlightsTab();

      chrome.runtime.sendMessage.mockResolvedValue({ success: true, statusKind: 'saved' });

      const syncBtn = document.querySelector('#sync-button');
      syncBtn.click();
      await flushMicrotasks(2);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'savePage' });
      expect(document.querySelector('#status-message').className).toBe('status-message success');

      jest.runAllTimers();
      expect(syncBtn.disabled).toBe(true);
    });

    it('[REGRESSION] sync button 不應在 storage 已改回 unsaved 後被 finally 無條件重新啟用', async () => {
      const { savedStore, unsavedStore } = buildSavedAndUnsavedPageStores();
      let currentStore = savedStore;

      mockStorageFromStore(() => currentStore);

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await flushMicrotasks();

      chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      const syncBtn = document.querySelector('#sync-button');
      expect(syncBtn.disabled).toBe(false);

      syncBtn.click();
      await flushMicrotasks();

      currentStore = unsavedStore;
      dispatchStablePageStorageChange(onStorageChanged, savedStore, unsavedStore);
      await flushMicrotasks();

      jest.runAllTimers();
      await flushMicrotasks();

      expect(syncBtn.disabled).toBe(true);
    });

    it('should use named debounce constants when re-enabling open notion button', async () => {
      await loadSavedLegacyHighlightsTab(2);

      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, statusKind: 'saved' })
        .mockResolvedValueOnce({ success: true });

      const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');

      document.querySelector('#open-notion-button').click();
      await flushMicrotasks(2);

      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), OPEN_BUTTON_DEBOUNCE_MS);

      timeoutSpy.mockRestore();
    });

    it('should trigger sync click gracefully when fails', async () => {
      await loadSavedLegacyHighlightsTab();

      createRejectedSendMessageMock('Extension error message!');

      const syncBtn = document.querySelector('#sync-button');
      syncBtn.click();
      await flushMicrotasks(3);

      expect(document.querySelector('#status-message').className).toBe('status-message error');
    });

    it('should restore unsaved sync button state when save rejects after storage changes', async () => {
      const sendMessage = createDeferred();
      const { savedStore, unsavedStore } = buildSavedAndUnsavedPageStores();
      let currentStore = savedStore;

      mockStorageFromStore(() => currentStore);
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await flushMicrotasks();

      chrome.runtime.sendMessage.mockReturnValue(sendMessage.promise);

      const syncBtn = document.querySelector('#sync-button');
      expect(syncBtn.disabled).toBe(false);
      expect(syncBtn.title).toBe('');

      syncBtn.click();
      await flushMicrotasks();

      currentStore = unsavedStore;
      dispatchStablePageStorageChange(onStorageChanged, savedStore, unsavedStore);
      await flushMicrotasks();

      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.title).toBe(UI_MESSAGES.SIDEPANEL.PAGE_NOT_SAVED);

      sendMessage.reject(new Error('Extension error message!'));
      await flushMicrotasks();

      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.title).toBe(UI_MESSAGES.SIDEPANEL.PAGE_NOT_SAVED);
    });

    it.each(SANITIZED_RUNTIME_FAILURE_CASES)('$name', async scenario => {
      await loadSavedLegacyHighlightsTab(scenario.loadFlushCount);

      chrome.runtime.sendMessage.mockResolvedValue(scenario.response);

      document.querySelector(scenario.buttonSelector).click();
      await flushMicrotasks(scenario.flushCount);

      const statusMessage = document.querySelector('#status-message');
      expect(statusMessage.textContent).toBe(scenario.expectedStatusText);
      if (scenario.expectedStatusClassName !== undefined) {
        expect(statusMessage.className).toBe(scenario.expectedStatusClassName);
      }
      expect(Logger.error).toHaveBeenCalledWith(
        scenario.expectedLogMessage,
        expect.objectContaining(scenario.expectedLogPayload())
      );
    });

    it('應該成功觸發 startHighlight', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      const startBtn = document.querySelector('#start-highlight-button');
      startBtn.click();
      await flushMicrotasks(2);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.START_HIGHLIGHT,
      });
      expect(document.querySelector('#status-message').className).toContain('success');
    });

    it('不應直接顯示 runtime message 回傳的原始 startHighlight 錯誤', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Highlighter initialization failed',
      });

      const startBtn = document.querySelector('#start-highlight-button');
      startBtn.click();
      await flushMicrotasks(2);

      expect(document.querySelector('#status-message').textContent).not.toBe(
        'Highlighter initialization failed'
      );
      expect(Logger.error).toHaveBeenCalledWith(
        '[SidePanel] startHighlight failed',
        expect.objectContaining({
          action: 'startHighlight',
          operation: 'highlight-init',
          result: 'failure',
          error: sanitizeApiError('Highlighter initialization failed', 'sidepanel_start_highlight'),
        })
      );
    });

    it('應該在 runtime sendMessage reject 時顯示格式化後的 startHighlight 錯誤', async () => {
      const runtimeError = new Error('Network error');
      chrome.runtime.sendMessage.mockRejectedValue(runtimeError);

      const startBtn = document.querySelector('#start-highlight-button');
      startBtn.click();
      await flushMicrotasks(2);

      expect(document.querySelector('#status-message').textContent).toBe(
        `${UI_MESSAGES.POPUP.HIGHLIGHT_FAILED_PREFIX}網路連線異常，請檢查網路後重試`
      );
      expect(Logger.error).toHaveBeenCalledWith(
        '[SidePanel] startHighlight failed',
        expect.objectContaining({
          action: 'startHighlight',
          operation: 'runtime-sendMessage',
          result: 'failure',
          error: runtimeError,
          reason: sanitizeApiError(runtimeError, 'sidepanel_start_highlight'),
        })
      );
    });

    it('should re-enable start highlight button using named debounce constant', async () => {
      createRejectedSendMessageMock('Extension error message!');

      const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');
      const startBtn = document.querySelector('#start-highlight-button');

      startBtn.click();
      await flushMicrotasks(2);

      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), SYNC_BUTTON_DEBOUNCE_MS);
      expect(document.querySelector('#status-message').className).toContain('error');

      timeoutSpy.mockRestore();
    });
  });
});
