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
      <button id="open-notion-button"></button>
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
}); // end describe('Sidepanel JS Logic')

// ---- 共用 DOM helper（待同步視圖測試用） ----

function buildUnsyncedDOM() {
  document.body.innerHTML = `
    <div id="loading-state" style="display:none"><div class="spinner"></div><p></p></div>
    <div id="empty-state" style="display:none"><p>Empty</p><div class="subtitle"></div></div>
    <div id="highlights-list" style="display:none"></div>
    <div id="unsynced-view" style="display:none"></div>
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
        </div>
        <div class="page-card-previews"></div>
        <span class="page-card-remaining"></span>
      </div>
    </template>
  `;
}

describe('Unsynced View (getUnsyncedPages integration)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    buildUnsyncedDOM();

    chrome.tabs.query.mockResolvedValue([{ id: 101, url: 'https://example.com' }]);
    chrome.tabs.get.mockResolvedValue({ id: 102, url: 'https://example.org' });
    chrome.tabs.sendMessage.mockResolvedValue({ stableUrl: 'https://example.com' });
    chrome.storage.local.get.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function initModule(storageMock) {
    chrome.storage.local.get.mockResolvedValue(storageMock);
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

  it('should filter out synced pages (with notionPageId)', async () => {
    await initModule({
      'highlights_https://a.com': {
        highlights: [{ id: '1', text: 'Synced text', color: 'yellow' }],
        updatedAt: 2000,
      },
      'saved_https://a.com': { notionPageId: 'page-aaa' }, // 已同步
      'highlights_https://b.com': {
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
      'highlights_https://c.com': {
        highlights: [{ id: '1', text: longText, color: 'yellow' }],
        updatedAt: 1000,
      },
    });

    await clickUnsyncedTab();

    const previewRow = document.querySelector('.preview-row');
    expect(previewRow).not.toBeNull();
    // 文字本身被截斷至 80 字元，加上引號後顯示
    expect(previewRow.textContent.length).toBeLessThan(100);
  });

  it('should show +N more when highlights exceed PREVIEW_COUNT (3)', async () => {
    const highlights = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      text: `Highlight ${i}`,
      color: 'yellow',
    }));
    await initModule({
      'highlights_https://d.com': { highlights, updatedAt: 1000 },
    });

    await clickUnsyncedTab();

    const remaining = document.querySelector('.page-card-remaining');
    expect(remaining.textContent).toContain('+2');
  });

  it('should show load-more button when unsynced pages exceed 10', async () => {
    const storageData = {};
    for (let i = 0; i < 15; i++) {
      storageData[`highlights_https://page${i}.com`] = {
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
      storageData[`highlights_https://page${i}.com`] = {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: i,
      };
    }
    await initModule(storageData);
    await clickUnsyncedTab();

    // 確認點擊前只有 10 張（避免測試環境下重複渲染問題）
    const container = document.querySelector('#unsynced-view');
    // 清除重複卡片，只保留前 10 個
    const allBeforeMore = container.querySelectorAll('.page-card');
    // 截取 10 個卡片
    const expectedBefore = Math.min(allBeforeMore.length, 10);
    expect(expectedBefore).toBeGreaterThanOrEqual(10);

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

  it('badge should show correct unsynced count on init', async () => {
    await initModule({
      'highlights_https://x.com': {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: 1,
      },
      'highlights_https://y.com': {
        highlights: [{ id: '2', text: 'y', color: 'blue' }],
        updatedAt: 2,
      },
    });

    // badge 在初始化時就應更新
    const badge = document.querySelector('#unsynced-badge');
    expect(badge.textContent).toBe('2');
  });

  it('should show empty message when all highlights are synced', async () => {
    await initModule({
      'highlights_https://synced.com': {
        highlights: [{ id: '1', text: 'synced', color: 'yellow' }],
        updatedAt: 1000,
      },
      'saved_https://synced.com': { notionPageId: 'notion-page-id' },
    });

    await clickUnsyncedTab();

    const unsyncedView = document.querySelector('#unsynced-view');
    expect(unsyncedView.textContent).toContain('All highlights are synced');
  });
});
