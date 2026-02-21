import { jest } from '@jest/globals';
import { normalizeUrl, computeStableUrl } from '../../../scripts/utils/urlUtils.js';

// ---- Mocks ----
jest.mock('../../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(url => url),
  computeStableUrl: jest.fn(),
}));

// Chrome API polyfills
globalThis.chrome = {
  tabs: {
    onActivated: { addListener: jest.fn() },
    onUpdated: { addListener: jest.fn() },
    query: jest.fn(),
    get: jest.fn(),
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
      <button id="sync-button"></button>
      <div id="status-message"></div>
      <template id="highlight-card-template">
        <div class="highlight-card">
          <div class="highlight-color-indicator"></div>
          <p class="highlight-text"></p>
          <button class="delete-button"></button>
        </div>
      </template>
    `;

    chrome.tabs.query.mockResolvedValue([{ id: 101, url: 'https://example.com' }]);
    chrome.tabs.get.mockResolvedValue({ id: 102, url: 'https://example.org' });
    chrome.tabs.sendMessage.mockResolvedValue({ stableUrl: 'https://example.js/stable' });
    chrome.storage.local.get.mockResolvedValue({});

    jest.isolateModules(() => {
      require('../../../scripts/sidepanel/sidepanel.js');
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
      expect(emptyP.textContent).toBe('Not supported on this page.');
    });

    it('should resolve tab url via computeStableUrl fallback if content script rejects', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Extension context invalidated'));
      computeStableUrl.mockReturnValue('https://example.com/computed');

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 400 });

      expect(computeStableUrl).toHaveBeenCalledWith('https://example.org');
    });

    it('should fallback to normalizeUrl if all else fails', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Extension context invalidated'));
      computeStableUrl.mockReturnValue(null);

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

    it('should disable sync button if page is not saved', async () => {
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

      expect(document.querySelector('#sync-button').disabled).toBe(true);
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

    it('should display error message returned from runtime message', async () => {
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

      expect(document.querySelector('#status-message').textContent).toBe('Custom API Error');
      expect(document.querySelector('#status-message').className).toBe('status-message error');
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
  });
});
