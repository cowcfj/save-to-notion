import { jest } from '@jest/globals';
import { normalizeUrl, computeStableUrl } from '../../../scripts/utils/urlUtils.js';
import { UI_MESSAGES } from '../../../scripts/config/messages.js';
import { sanitizeApiError, sanitizeUrlForLogging } from '../../../scripts/utils/securityUtils.js';
import Logger from '../../../scripts/utils/Logger.js';
import {
  SYNC_BUTTON_DEBOUNCE_MS,
  OPEN_BUTTON_DEBOUNCE_MS,
} from '../../../sidepanel/sidepanelUI.js';

// ---- Mocks ----
jest.mock('../../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(url => url),
  computeStableUrl: jest.fn(),
  isRootUrl: jest.fn(url => {
    try {
      const u = new URL(url);
      return (u.pathname === '/' || u.pathname === '') && u.search.length === 0;
    } catch {
      return false;
    }
  }),
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}

// Chrome API polyfills
globalThis.chrome = {
  tabs: {
    onActivated: { addListener: jest.fn() },
    onUpdated: { addListener: jest.fn() },
    query: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    sendMessage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    onChanged: { addListener: jest.fn() },
  },
  runtime: {
    sendMessage: jest.fn(),
  },
};

describe('Sidepanel JS Logic', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    document.body.innerHTML = `
      <div id="loading-state" style="display:none">Loading...</div>
      <div id="empty-state" style="display:none">
        <p>Empty</p>
        <div class="subtitle">Subtitle</div>
      </div>
      <div id="highlights-list" style="display:none"></div>
      <button id="start-highlight-button"></button>
      <button id="sync-button"></button>
      <button id="open-notion-button"></button>
      <div id="status-message"></div>
      <div id="unsynced-view" style="display:none"></div>
      <div id="unsynced-toolbar" style="display:none">
        <span id="unsynced-count-label"></span>
        <button id="clear-all-btn"></button>
      </div>
      <button id="load-more-btn" style="display:none"></button>
      <span id="unsynced-badge"></span>
      <template id="highlight-card-template">
        <div class="highlight-card">
          <div class="highlight-color-indicator"></div>
          <p class="highlight-text"></p>
          <button class="delete-button"></button>
        </div>
      </template>
      <template id="page-card-template">
        <div class="page-card">
          <div class="page-title"></div>
          <div class="page-meta"></div>
          <div class="page-card-previews"></div>
          <div class="page-card-remaining"></div>
          <button class="page-open-button"></button>
          <button class="page-delete-button"></button>
        </div>
      </template>
    `;

    chrome.tabs.query.mockResolvedValue([{ id: 101, url: 'https://example.com' }]);
    chrome.tabs.get.mockResolvedValue({ id: 102, url: 'https://example.org' });
    chrome.tabs.create.mockResolvedValue({ id: 103, url: 'https://opened.example' });
    chrome.tabs.sendMessage.mockResolvedValue({ stableUrl: 'https://example.js/stable' });
    chrome.storage.local.get.mockResolvedValue({});

    jest.isolateModules(() => {
      require('../../../sidepanel/sidepanel.js');
    });

    document.dispatchEvent(new Event('DOMContentLoaded'));

    await Promise.resolve();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should bind chrome listeners and attempt to load current tab', async () => {
      expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    });
  });

  describe('Tab Changes', () => {
    it('should handle tabs.onActivated', async () => {
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 200 });
      expect(chrome.tabs.get).toHaveBeenCalledWith(200);
    });

    it('should handle tabs.onUpdated for complete status', async () => {
      const onUpdated = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
      await onUpdated(201, { status: 'complete' }, { active: true });
      expect(chrome.tabs.get).toHaveBeenCalledWith(201);
    });

    it('should ignore tabs.onUpdated when status is not complete', async () => {
      chrome.tabs.get.mockClear();
      const onUpdated = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
      await onUpdated(201, { status: 'loading' }, {});
      expect(chrome.tabs.get).not.toHaveBeenCalled();
    });
  });

  describe('Tab Loading scenarios', () => {
    it('should show empty state if tab url is chrome://', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 300, url: 'chrome://extensions' });
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 300 });

      const emptyP = document.querySelector('#empty-state p');
      expect(emptyP.textContent).toBe('不支援此頁面');
    });

    it('should resolve tab url via computeStableUrl fallback if content script rejects', async () => {
      chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated'));
      computeStableUrl.mockReturnValueOnce('https://example.com/computed');

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 400 });

      expect(computeStableUrl).toHaveBeenCalledWith('https://example.org');
    });

    it('should fallback to normalizeUrl if all else fails', async () => {
      chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated'));
      computeStableUrl.mockReturnValueOnce(null);

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 400 });

      expect(normalizeUrl).toHaveBeenCalledWith('https://example.org');
    });
  });

  describe('Storage Checks & Rendering', () => {
    it('should show empty state when storage holds no highlights', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 500 });

      expect(document.querySelector('#empty-state').style.display).toBe('flex');
    });

    it('should render highlight list when highlights are available', async () => {
      chrome.storage.local.get.mockImplementation(async key => {
        if (typeof key === 'string' && key.startsWith('saved_')) {
          return { [key]: true };
        }
        return {
          'highlights_https://example.js/stable': {
            highlights: [
              { id: '1', text: 'hello world', color: 'yellow' },
              { id: '2', text: 'green code', color: 'green' },
            ],
          },
        };
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 500 });

      expect(document.querySelector('#highlights-list').children).toHaveLength(2);
      expect(document.querySelector('#sync-button').disabled).toBe(false);
    });

    it('sync button 不論頁面是否已保存皆應可用（savePage 可自動建立）', async () => {
      chrome.storage.local.get.mockImplementation(async key => {
        if (typeof key === 'string' && key.startsWith('saved_')) {
          return {};
        }
        return {
          'highlights_https://example.js/stable': {
            highlights: [{ id: '1', text: 'hello world', color: 'yellow' }],
          },
        };
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 500 });

      // Sync 按鈕始終可用（savePage 可自動建立新頁面）
      expect(document.querySelector('#sync-button').disabled).toBe(false);
    });

    it('若 direct keys 找不到，應透過 alias 解析 page_* 前綴', async () => {
      const fakeStore = {
        'page_https://example.com/alias': {
          highlights: [{ id: '1', text: 'alias text', color: 'blue' }],
          notion: { pageId: 'resolved' },
        },
        'url_alias:https://example.js/stable': 'https://example.com/alias',
      };
      chrome.storage.local.get.mockImplementation(async k => {
        if (typeof k === 'string') {
          return { [k]: fakeStore[k] };
        }
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (fakeStore[key]) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 500 });
      // renderHighlightsForUrl has multiple await cycles for alias resolution
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#highlights-list').children).toHaveLength(1);
      expect(document.querySelector('#sync-button').disabled).toBe(false); // as notion pageId exists
    });

    it('若 page_* 找不到，應透過 alias 解析 highlights_* 前綴', async () => {
      const fakeStore = {
        'highlights_https://example.com/alias': {
          highlights: [{ id: '1', text: 'alias old text', color: 'red' }],
        },
        'url_alias:https://example.js/stable': 'https://example.com/alias',
      };
      chrome.storage.local.get.mockImplementation(async k => {
        if (typeof k === 'string') {
          return { [k]: fakeStore[k] };
        }
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (fakeStore[key]) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 500 });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#highlights-list').children).toHaveLength(1);
      // Sync 按鈕始終可用（不論是否有 notion pageId）
      expect(document.querySelector('#sync-button').disabled).toBe(false);
    });

    it('若 alias 解析未命中任何資料，應顯示 empty state', async () => {
      const fakeStore = {
        'url_alias:https://example.js/stable': 'https://example.com/empty-alias',
      };
      chrome.storage.local.get.mockImplementation(async k => {
        if (typeof k === 'string') {
          return { [k]: fakeStore[k] };
        }
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (fakeStore[key]) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 500 });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#empty-state').style.display).toBe('flex');
    });
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
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        'highlights_https://example.js/stable'
      );
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
        },
      };

      chrome.storage.local.get.mockImplementation(async () => currentMockData);

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      // Click delete the FIRST one
      const delBtn = document.querySelector('.delete-button');
      delBtn.click();
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const args = chrome.storage.local.set.mock.calls[0][0];
      expect(args['highlights_https://example.js/stable'].highlights).toHaveLength(1);
    });

    it('在新的 page_* 格式上應能正確處理 handleDelete（部分刪除與完全移除）', async () => {
      // test remove full
      let fakeStore = {
        'page_https://example.js/stable': {
          highlights: [{ id: '1', text: 'h1', color: 'yellow' }],
        },
      };
      chrome.storage.local.get.mockImplementation(async k => {
        if (typeof k === 'string') {
          return { [k]: fakeStore[k] };
        }
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (fakeStore[key]) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await Promise.resolve();

      let delBtn = document.querySelector('.delete-button');
      if (delBtn) {
        delBtn.click();
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('page_https://example.js/stable');

      // test partial
      chrome.storage.local.remove.mockClear();
      chrome.storage.local.set.mockClear();
      fakeStore = {
        'page_https://example.js/stable': {
          highlights: [
            { id: '1', text: 'h1', color: 'yellow' },
            { id: '2', text: 'h2', color: 'blue' },
          ],
        },
      };

      await onActivated({ tabId: 600 });
      await Promise.resolve();
      delBtn = document.querySelector('.delete-button');
      if (delBtn) {
        delBtn.click();
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('在舊的 array 格式上應能正確處理 handleDelete', async () => {
      // test remove full
      let fakeStore = {
        'highlights_https://example.js/stable': {
          highlights: [{ id: '1', text: 'h1', color: 'red' }],
        },
      };
      // For this legacy array format, when handleDelete reads, we want it to read array, but when render Highlights reads, we want it to have { highlights: [] } so it renders.
      // Wait, renderHighlights also accepts array if properly formatted! Let's check:
      chrome.storage.local.get.mockImplementation(async k => {
        // If it's a direct pull by handleDelete, pretend it's an array to trigger legacy code path
        if (typeof k === 'string') {
          return { [k]: [{ id: '1', text: 'h1', color: 'red' }] };
        }
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (fakeStore[key]) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await Promise.resolve();

      let delBtn = document.querySelector('.delete-button');
      if (delBtn) {
        delBtn.click();
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        'highlights_https://example.js/stable'
      );

      // test partial
      chrome.storage.local.remove.mockClear();
      chrome.storage.local.set.mockClear();

      fakeStore = {
        'highlights_https://example.js/stable': {
          highlights: [
            { id: '1', text: 'h1', color: 'red' },
            { id: '2', text: 'h2', color: 'blue' },
          ],
        },
      };
      chrome.storage.local.get.mockImplementation(async k => {
        if (typeof k === 'string') {
          return {
            [k]: [
              { id: '1', text: 'h1', color: 'red' },
              { id: '2', text: 'h2', color: 'blue' },
            ],
          };
        }
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (fakeStore[key]) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      await onActivated({ tabId: 600 });
      await Promise.resolve();
      delBtn = document.querySelector('.delete-button');
      if (delBtn) {
        delBtn.click();
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(chrome.storage.local.set).toHaveBeenCalled();
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
            if (fakeStore[key]) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await Promise.resolve();
      const delBtn = document.querySelector('.delete-button');
      if (delBtn) {
        delBtn.click();
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        'highlights_https://example.js/stable'
      );
    });

    it('should trigger sync click successfully', async () => {
      chrome.storage.local.get.mockImplementation(async key => {
        if (typeof key === 'string' && key.startsWith('saved_')) {
          return { [key]: true };
        }
        return {
          'highlights_https://example.js/stable': {
            highlights: [{ id: '1', text: 'hello world', color: 'yellow' }],
          },
        };
      });
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });

      chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      const syncBtn = document.querySelector('#sync-button');
      syncBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'savePage' });
      expect(document.querySelector('#status-message').className).toBe('status-message success');

      jest.runAllTimers();
      expect(syncBtn.disabled).toBe(false);
    });

    it('should use named debounce constants when re-enabling action buttons', async () => {
      chrome.storage.local.get.mockImplementation(async key => {
        if (typeof key === 'string' && key.startsWith('saved_')) {
          return { [key]: true };
        }
        return {
          'highlights_https://example.js/stable': {
            highlights: [{ id: '1', text: 'hello world', color: 'yellow' }],
          },
        };
      });
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await Promise.resolve();
      await Promise.resolve();

      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true });

      const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');

      document.querySelector('#sync-button').click();
      await Promise.resolve();
      await Promise.resolve();

      document.querySelector('#open-notion-button').click();
      await Promise.resolve();
      await Promise.resolve();

      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), SYNC_BUTTON_DEBOUNCE_MS);
      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), OPEN_BUTTON_DEBOUNCE_MS);

      timeoutSpy.mockRestore();
    });

    it('should trigger sync click gracefully when fails', async () => {
      chrome.storage.local.get.mockImplementation(async key => {
        if (typeof key === 'string' && key.startsWith('saved_')) {
          return { [key]: true };
        }
        return {
          'highlights_https://example.js/stable': {
            highlights: [{ id: '1', text: 'hello world', color: 'yellow' }],
          },
        };
      });
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });

      chrome.runtime.sendMessage.mockRejectedValue(new Error('Extension error message!'));

      const syncBtn = document.querySelector('#sync-button');
      syncBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#status-message').className).toBe('status-message error');
    });

    it('should not display raw savePage error returned from runtime message', async () => {
      chrome.storage.local.get.mockImplementation(async key => {
        if (typeof key === 'string' && key.startsWith('saved_')) {
          return { [key]: true };
        }
        return {
          'highlights_https://example.js/stable': {
            highlights: [{ id: '1', text: 'hello world', color: 'yellow' }],
          },
        };
      });
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });

      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Custom API Error' });

      const syncBtn = document.querySelector('#sync-button');
      syncBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#status-message').textContent).toBe(
        UI_MESSAGES.SIDEPANEL.SYNC_FAILED
      );
      expect(document.querySelector('#status-message').className).toBe('status-message error');
      expect(Logger.error).toHaveBeenCalledWith('[SidePanel] savePage failed', {
        error: sanitizeApiError('Custom API Error'),
      });
    });

    it('should not display raw openNotionPage error returned from runtime message', async () => {
      chrome.storage.local.get.mockImplementation(async key => {
        if (typeof key === 'string' && key.startsWith('saved_')) {
          return { [key]: true };
        }
        return {
          'highlights_https://example.js/stable': {
            highlights: [{ id: '1', text: 'hello world', color: 'yellow' }],
          },
        };
      });
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 600 });
      await Promise.resolve();
      await Promise.resolve();

      chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Leaked debug detail',
      });

      const openBtn = document.querySelector('#open-notion-button');
      openBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#status-message').textContent).toBe(
        UI_MESSAGES.SIDEPANEL.OPEN_FAILED
      );
      expect(document.querySelector('#status-message').className).toBe('status-message error');
      expect(Logger.error).toHaveBeenCalledWith('[SidePanel] openNotionPage failed', {
        error: sanitizeApiError('Leaked debug detail'),
      });
    });

    it('should trigger start highlight successfully', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      const startBtn = document.querySelector('#start-highlight-button');
      startBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'startHighlight' });
      expect(document.querySelector('#status-message').className).toContain('success');
    });

    it('should not display raw startHighlight error returned from runtime message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Highlighter initialization failed',
      });

      const startBtn = document.querySelector('#start-highlight-button');
      startBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#status-message').textContent).not.toBe(
        'Highlighter initialization failed'
      );
      expect(Logger.error).toHaveBeenCalledWith(
        '[SidePanel] startHighlight failed',
        expect.any(Object)
      );
    });

    it('should show formatted startHighlight error when runtime sendMessage rejects', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));

      const startBtn = document.querySelector('#start-highlight-button');
      startBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#status-message').textContent).toBe(
        `${UI_MESSAGES.POPUP.HIGHLIGHT_FAILED_PREFIX}網路連線異常，請檢查網路後重試`
      );
      expect(Logger.error).toHaveBeenCalledWith('[SidePanel] startHighlight failed', {
        error: sanitizeApiError(new Error('Network error'), 'sidepanel_start_highlight'),
      });
    });

    it('should re-enable start highlight button using named debounce constant', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Extension error message!'));

      const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');
      const startBtn = document.querySelector('#start-highlight-button');

      startBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), SYNC_BUTTON_DEBOUNCE_MS);
      expect(document.querySelector('#status-message').className).toContain('error');

      timeoutSpy.mockRestore();
    });
  });

  describe('Storage Changes Sync', () => {
    it('should reload tab data if SC_HL key changes', async () => {
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      chrome.tabs.query.mockResolvedValue([{ id: 999, url: 'https://sync.me' }]);

      await onStorageChanged({ 'highlights_https://sync.me': { newValue: {} } }, 'local');

      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    });

    it('should not reload if namespace is sync', async () => {
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      chrome.tabs.query.mockClear();

      onStorageChanged({ 'highlights_https://sync.me': { newValue: {} } }, 'sync');

      expect(chrome.tabs.query).not.toHaveBeenCalled();
    });

    it('should not reload if unrelated keys change in local', async () => {
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      chrome.tabs.query.mockClear();

      onStorageChanged({ sc_some_other_key: { newValue: {} } }, 'local');

      expect(chrome.tabs.query).not.toHaveBeenCalled();
    });

    it('should log refreshUnsyncedBadge failures triggered by storage change timer', async () => {
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      const error = new Error('badge refresh failed');

      Logger.error.mockClear();
      chrome.storage.local.get.mockRejectedValue(error);

      onStorageChanged({ 'highlights_https://sync.me': { newValue: {} } }, 'local');
      await jest.runOnlyPendingTimersAsync();

      const refreshBadgeCall = Logger.error.mock.calls.find(
        ([message]) => message === '[SidePanel] refreshUnsyncedBadge failed after storage change'
      );

      expect(refreshBadgeCall).toEqual([
        '[SidePanel] refreshUnsyncedBadge failed after storage change',
        { error },
      ]);
    });

    it('should not overwrite cached tab urls with stale loadCurrentTab results', async () => {
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      const staleStableUrl = 'https://stale.example.com/article';
      const freshStableUrl = 'https://fresh.example.com/article';
      const deferredStableUrl = createDeferred();

      chrome.tabs.get.mockImplementation(async tabId => {
        if (tabId === 701) {
          return { id: 701, url: 'https://stale.example.com/raw' };
        }
        if (tabId === 702) {
          return { id: 702, url: 'https://fresh.example.com/raw' };
        }
        return { id: tabId, url: 'https://fallback.example.com' };
      });

      chrome.tabs.sendMessage.mockImplementation(async tabId => {
        if (tabId === 701) {
          return deferredStableUrl.promise;
        }
        if (tabId === 702) {
          return { stableUrl: freshStableUrl };
        }
        return { stableUrl: 'https://default.example.com' };
      });

      chrome.storage.local.get.mockImplementation(async key => {
        if (Array.isArray(key)) {
          const requestedKeys = new Set(key);
          if (requestedKeys.has(`page_${freshStableUrl}`)) {
            return {
              [`page_${freshStableUrl}`]: {
                highlights: [{ id: 'fresh', text: 'fresh text', color: 'yellow' }],
              },
            };
          }
          if (requestedKeys.has(`page_${staleStableUrl}`)) {
            return {
              [`page_${staleStableUrl}`]: {
                highlights: [{ id: 'stale', text: 'stale text', color: 'yellow' }],
              },
            };
          }
          return {};
        }
        if (typeof key === 'string') {
          return {};
        }
        return {};
      });

      chrome.storage.local.get.mockClear();

      const staleLoad = onActivated({ tabId: 701 });
      await Promise.resolve();
      const freshLoad = onActivated({ tabId: 702 });
      await freshLoad;

      deferredStableUrl.resolve({ stableUrl: staleStableUrl });
      await staleLoad;

      chrome.storage.local.get.mockClear();
      onStorageChanged({ 'highlights_https://fresh.example.com/raw': { newValue: {} } }, 'local');
      await Promise.resolve();
      await Promise.resolve();

      const keyedGetCalls = chrome.storage.local.get.mock.calls.filter(([arg]) =>
        Array.isArray(arg)
      );
      const lastKeys = keyedGetCalls.at(-1)?.[0] || [];

      expect(lastKeys).toContain(`page_${freshStableUrl}`);
      expect(lastKeys).not.toContain(`page_${staleStableUrl}`);
    });
  });
}); // end describe('Sidepanel JS Logic')

// ---- 共用 DOM helper（待同步視圖測試用） ----

function buildUnsyncedDOM() {
  document.body.innerHTML = `
    <div id="loading-state" style="display:none"><div class="spinner"></div><p></p></div>
    <div id="empty-state" style="display:none"><p>Empty</p><div class="subtitle"></div></div>
    <div id="highlights-list" style="display:none"></div>
    <button id="start-highlight-button"></button>
    <div id="unsynced-view" style="display:none"></div>
    <div id="unsynced-toolbar" style="display:none">
      <span id="unsynced-count-label"></span>
      <button id="clear-all-btn"></button>
    </div>
    <button id="load-more-btn" style="display:none">Load more</button>
    <button id="sync-button"></button>
    <button id="open-notion-button" style="display:none"></button>
    <div id="status-message"></div>
    <div class="view-tabs">
      <button class="view-tab active" data-view="current">Current Page</button>
      <button class="view-tab" data-view="unsynced">Pending<span id="unsynced-badge"></span></button>
    </div>
    <template id="highlight-card-template">
      <div class="highlight-card">
        <div class="highlight-color-indicator"></div>
        <p class="highlight-text"></p>
        <button class="delete-button"></button>
      </div>
    </template>
    <template id="page-card-template">
      <div class="page-card">
        <div class="page-card-header">
          <div class="page-title-row">
            <span class="status-dot"></span>
            <p class="page-title"></p>
          </div>
          <div class="page-info"><span class="page-meta"></span></div>
          <button class="page-open-button"></button>
          <button class="page-delete-button"></button>
        </div>
        <div class="page-card-previews"></div>
        <span class="page-card-remaining"></span>
      </div>
    </template>
  `;
}

async function initModule(storageMock) {
  if (typeof storageMock === 'function') {
    chrome.storage.local.get.mockImplementation(storageMock);
  } else {
    chrome.storage.local.get.mockResolvedValue(storageMock);
  }
  jest.isolateModules(() => {
    require('../../../sidepanel/sidepanel.js');
  });
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // 讓所有 async 完成（init 會平行跑 loadCurrentTab + updateUnsyncedBadge）
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

async function clickUnsyncedTab() {
  const tab = document.querySelector('[data-view="unsynced"]');
  tab.click();
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('Unsynced View (getUnsyncedPages integration)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    buildUnsyncedDOM();

    chrome.tabs.query.mockResolvedValue([{ id: 101, url: 'https://example.com' }]);
    chrome.tabs.get.mockResolvedValue({ id: 102, url: 'https://example.org' });
    chrome.tabs.create.mockResolvedValue({ id: 103, url: 'https://opened.example' });
    chrome.tabs.sendMessage.mockResolvedValue({ stableUrl: 'https://example.com' });
    chrome.storage.local.get.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should filter out synced pages (with notionPageId)', async () => {
    await initModule({
      'highlights_https://a.com/p': {
        highlights: [{ id: '1', text: 'Synced text', color: 'yellow' }],
        updatedAt: 2000,
      },
      'saved_https://a.com/p': { notionPageId: 'page-aaa' }, // 已同步
      'highlights_https://b.com/p': {
        highlights: [{ id: '2', text: 'Unsynced text', color: 'blue' }],
        updatedAt: 1000,
      },
      // b.com 沒有 saved_，是未同步
    });

    // 切換到待同步 tab
    await clickUnsyncedTab();

    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector('.page-title').textContent).toContain('b.com');
  });

  it('should show preview text truncated to 80 chars', async () => {
    const longText = 'A'.repeat(100);
    await initModule({
      'highlights_https://c.com/p': {
        highlights: [{ id: '1', text: longText, color: 'yellow' }],
        updatedAt: 1000,
      },
    });

    await clickUnsyncedTab();

    const previewRow = document.querySelector('.preview-row');
    expect(previewRow).not.toBeNull();
    // 文字本身被截斷至 80 字元，加上省略號和引號後顯示
    expect(previewRow.textContent).toContain('...');
    expect(previewRow.textContent).toBe(`"${longText.slice(0, 80)}..."`);
  });

  it('should show +N more when highlights exceed PREVIEW_COUNT (3)', async () => {
    const highlights = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      text: `Highlight ${i}`,
      color: 'yellow',
    }));
    await initModule({
      'highlights_https://d.com/p': { highlights, updatedAt: 1000 },
    });

    await clickUnsyncedTab();

    const remaining = document.querySelector('.page-card-remaining');
    expect(remaining.textContent).toContain('還有 2 筆');
  });

  it('should show load-more button when unsynced pages exceed 10', async () => {
    const storageData = {};
    for (let i = 0; i < 15; i++) {
      storageData[`highlights_https://example.com/page${i}`] = {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: i,
      };
    }
    await initModule(storageData);
    await clickUnsyncedTab();

    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(10); // 第一批只顯示 10 張
    expect(document.querySelector('#load-more-btn').style.display).not.toBe('none');
  });

  it('should load more cards on load-more click', async () => {
    const storageData = {};
    for (let i = 0; i < 15; i++) {
      storageData[`highlights_https://example.com/page${i}`] = {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: i,
      };
    }
    await initModule(storageData);
    await clickUnsyncedTab();

    // 確認點擊前只有 10 張
    const container = document.querySelector('#unsynced-view');
    expect(container.querySelectorAll('.page-card')).toHaveLength(10);

    // 點擊「載入更多」
    document.querySelector('#load-more-btn').click();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }

    const cardsAfter = document.querySelectorAll('#unsynced-view .page-card');
    // 點擊後應比原來多（至少 > 10）
    expect(cardsAfter.length).toBeGreaterThan(10);
    expect(document.querySelector('#load-more-btn').style.display).toBe('none');
  });

  it('should show safe fallback UI when renderUnsyncedView fails after tab switch', async () => {
    await initModule({});

    const error = new Error('unsynced load failed');
    chrome.storage.local.get.mockImplementation(async key => {
      if (key === null) {
        throw error;
      }
      return {};
    });

    await clickUnsyncedTab();

    expect(Logger.error).toHaveBeenCalledWith(
      '[SidePanel] renderUnsyncedView failed after tab switch',
      { error }
    );
    expect(document.querySelector('#unsynced-view').textContent).toContain('載入標註失敗');
    expect(document.querySelector('#unsynced-toolbar').style.display).toBe('none');
    expect(document.querySelector('#load-more-btn').style.display).toBe('none');
    expect(document.querySelector('#unsynced-badge').textContent).toBe('');
  });

  it('should ignore stale unsynced render results after switching back to current quickly', async () => {
    await initModule({});

    const deferredUnsyncedLoad = createDeferred();
    chrome.storage.local.get.mockImplementation(async key => {
      if (key === null) {
        return deferredUnsyncedLoad.promise;
      }
      return {};
    });

    const unsyncedTab = document.querySelector('[data-view="unsynced"]');
    const currentTab = document.querySelector('[data-view="current"]');

    unsyncedTab.click();
    await Promise.resolve();
    currentTab.click();
    await Promise.resolve();

    const storageData = {};
    for (let i = 0; i < 15; i++) {
      storageData[`highlights_https://example.com/page${i}`] = {
        highlights: [{ id: '1', text: `x${i}`, color: 'yellow' }],
        updatedAt: i,
      };
    }
    deferredUnsyncedLoad.resolve(storageData);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    expect(currentTab.classList.contains('active')).toBe(true);
    expect(unsyncedTab.classList.contains('active')).toBe(false);
    expect(document.querySelector('#unsynced-toolbar').style.display).toBe('none');
    expect(document.querySelector('#load-more-btn').style.display).toBe('none');
  });

  it('should log warning when opening unsynced page fails', async () => {
    await initModule({
      'highlights_https://example.com/p': {
        highlights: [{ id: '1', text: 'open fail', color: 'yellow' }],
        updatedAt: 1000,
      },
    });
    await clickUnsyncedTab();

    const error = new Error('open failed');
    chrome.tabs.create.mockRejectedValueOnce(error);

    document.querySelector('.page-open-button').click();
    await Promise.resolve();

    expect(Logger.warn).toHaveBeenCalledWith('[SidePanel] Failed to open unsynced page tab', {
      error,
      url: sanitizeUrlForLogging('https://example.com/p'),
    });
  });

  it('badge should show correct unsynced count on init', async () => {
    await initModule({
      'highlights_https://x.com/p': {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: 1,
      },
      'highlights_https://y.com/p': {
        highlights: [{ id: '2', text: 'y', color: 'blue' }],
        updatedAt: 2,
      },
    });

    // badge 在初始化時就應更新
    const badge = document.querySelector('#unsynced-badge');
    expect(badge.textContent).toBe('2');
  });

  it('should log and clear badge when refreshUnsyncedBadge fails during init', async () => {
    const error = new Error('init badge failed');

    await initModule(async key => {
      if (key === null) {
        throw error;
      }
      return {};
    });

    expect(Logger.error).toHaveBeenCalledWith(
      '[SidePanel] refreshUnsyncedBadge failed during init',
      {
        error,
      }
    );
    expect(document.querySelector('#unsynced-badge').textContent).toBe('');
  });

  it('should show empty message when all highlights are synced', async () => {
    await initModule({
      'highlights_https://synced.com/p': {
        highlights: [{ id: '1', text: 'synced', color: 'yellow' }],
        updatedAt: 1000,
      },
      'saved_https://synced.com/p': { notionPageId: 'notion-page-id' },
    });

    await clickUnsyncedTab();

    const unsyncedView = document.querySelector('#unsynced-view');
    expect(unsyncedView.textContent).toContain('已全部同步');
  });

  it('should skip root urls inside getUnsyncedPages (page_* format)', async () => {
    await initModule({
      'page_https://example.com/': { highlights: [{ id: '1', text: 'root' }] },
      'page_https://example.org/': { highlights: [{ id: '2', text: 'another root' }] },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0); // root urls are skipped
  });

  it('should skip empty highlights inside getUnsyncedPages (page_* format)', async () => {
    await initModule({
      'page_https://example.com/p': { highlights: [] },
      'page_https://example.com/q': { highlights: null },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0);
  });

  it('should include valid page_* items without notion data inside getUnsyncedPages', async () => {
    await initModule({
      'page_https://example.com/p': {
        highlights: [{ id: '1', text: 'valid' }],
        metadata: { title: 'example.com/p' },
      },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector('.page-title').textContent).toContain('example.com/p');
  });

  it('should skip root urls inside getUnsyncedPages (highlights_* format)', async () => {
    await initModule({
      'highlights_https://example.com/': { highlights: [{ id: '1', text: 'root legacy' }] },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0);
  });

  it('should skip empty highlights inside getUnsyncedPages (highlights_* format)', async () => {
    await initModule({
      'highlights_https://example.com/p': { highlights: [] },
      'highlights_https://example.com/q': [],
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0);
  });
  describe('deleteUnsyncedPage', () => {
    it('should remove the page from storage, cache, and DOM', async () => {
      const mockKey = 'highlights_https://example.com/delete-test';
      const mockHl = { text: 'delete me', color: 'yellow', id: '1' };

      // 使用 initModule 正確初始化 sidepanel 的 DOM 與內部資源
      await initModule({
        [mockKey]: [mockHl],
      });

      await clickUnsyncedTab();

      const card = document.querySelector('.page-card');
      expect(card).toBeTruthy();

      const deleteBtn = card.querySelector('.page-delete-button');

      // 模擬 Storage 剛好被清空的狀態（因為只有一台），使後續 getUnsyncedPages 回傳空陣列
      chrome.storage.local.get.mockResolvedValue({});

      // Action: 點擊刪除
      deleteBtn.click();
      await jest.runAllTimersAsync();

      // Assert storage
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(mockKey);

      // Get the current unsynced count label
      const countLabel = document.querySelector('#unsynced-count-label');
      expect(countLabel.textContent).toBe('0 個頁面');

      // Trigger CSS animation end to remove card
      const animationEndEvent = new Event('animationend');
      card.dispatchEvent(animationEndEvent);

      expect(document.querySelector('.page-card')).toBeNull();
      expect(document.querySelector('.unsynced-empty')).toBeTruthy();
    });
  });

  describe('deleteAllUnsyncedPages', () => {
    it('should remove all unsynced pages when toolbar Clear All is clicked', async () => {
      // Setup 2 pages
      const key1 = 'highlights_https://example.com/p1';
      const key2 = 'highlights_https://example.com/p2';

      await initModule({
        [key1]: [{ text: 'hl 1', color: 'yellow', id: '1' }],
        [key2]: [{ text: 'hl 2', color: 'blue', id: '2' }],
      });

      await clickUnsyncedTab();

      expect(document.querySelectorAll('.page-card')).toHaveLength(2);

      // 模擬 Storage 已被清空，這樣 await getUnsyncedPages() 才會拿到 0
      chrome.storage.local.get.mockResolvedValue({});

      // Action: 點擊全部清除
      const clearBtn = document.querySelector('#clear-all-btn');
      clearBtn.click();

      await jest.runAllTimersAsync();

      // Assert storage
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([key1, key2]);

      // Assert DOM
      expect(document.querySelector('#unsynced-toolbar').style.display).toBe('none');
      expect(document.querySelector('.unsynced-empty')).toBeTruthy();
      expect(document.querySelector('#unsynced-badge').textContent).toBe('');
    });

    it('should do nothing if cachedUnsyncedPages is empty', async () => {
      await initModule({});
      await clickUnsyncedTab();

      const clearBtn = document.querySelector('#clear-all-btn');
      chrome.storage.local.remove.mockClear();

      if (clearBtn && clearBtn.style.display !== 'none') {
        clearBtn.click();
      }
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });
  });
});

describe('Required DOM contract', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    document.body.innerHTML = `
      <div id="loading-state" style="display:none">Loading...</div>
      <div id="empty-state" style="display:none">
        <p>Empty</p>
        <div class="subtitle">Subtitle</div>
      </div>
      <div id="highlights-list" style="display:none"></div>
      <button id="sync-button"></button>
      <button id="open-notion-button"></button>
      <div id="status-message"></div>
      <div id="unsynced-view" style="display:none"></div>
      <div id="unsynced-toolbar" style="display:none">
        <span id="unsynced-count-label"></span>
        <button id="clear-all-btn"></button>
      </div>
      <button id="load-more-btn" style="display:none"></button>
      <span id="unsynced-badge"></span>
      <button class="view-tab active" data-view="current">Current</button>
      <button class="view-tab" data-view="unsynced">Pending</button>
      <template id="highlight-card-template">
        <div class="highlight-card">
          <div class="highlight-color-indicator"></div>
          <p class="highlight-text"></p>
          <button class="delete-button"></button>
        </div>
      </template>
      <template id="page-card-template">
        <div class="page-card">
          <div class="page-title"></div>
          <div class="page-meta"></div>
          <div class="page-card-previews"></div>
          <div class="page-card-remaining"></div>
          <button class="page-open-button"></button>
          <button class="page-delete-button"></button>
        </div>
      </template>
    `;

    chrome.tabs.query.mockResolvedValue([{ id: 101, url: 'https://example.com' }]);
    chrome.tabs.get.mockResolvedValue({ id: 102, url: 'https://example.org' });
    chrome.tabs.create.mockResolvedValue({ id: 103, url: 'https://opened.example' });
    chrome.tabs.sendMessage.mockResolvedValue({ stableUrl: 'https://example.js/stable' });
    chrome.storage.local.get.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('缺少開始標註按鈕時應立即失敗，避免以不完整 DOM 啟動 sidepanel', async () => {
    const originalAddEventListener = document.addEventListener.bind(document);
    let domContentLoadedHandler;

    const addEventListenerSpy = jest
      .spyOn(document, 'addEventListener')
      .mockImplementation((eventName, listener, options) => {
        if (eventName === 'DOMContentLoaded') {
          domContentLoadedHandler = listener;
          return;
        }
        return originalAddEventListener(eventName, listener, options);
      });

    try {
      jest.isolateModules(() => {
        require('../../../sidepanel/sidepanel.js');
      });

      expect(typeof domContentLoadedHandler).toBe('function');
      await expect(domContentLoadedHandler()).rejects.toThrow(
        '[SidePanel] Missing required DOM element: startHighlightButton'
      );

      expect(chrome.tabs.onActivated.addListener).not.toHaveBeenCalled();
    } finally {
      addEventListenerSpy.mockRestore();
    }
  });
});
