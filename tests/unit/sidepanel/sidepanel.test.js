import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeStableUrl,
  createDeferred,
  flushMicrotasks,
  loadSidepanelForCurrentView,
  Logger,
  normalizeUrl,
  UI_MESSAGES,
} from './sidepanel.shared.js';

function setupStaleCurrentTabRace() {
  const staleStableUrl = 'https://stale.example.com/article';
  const freshStableUrl = 'https://fresh.example.com/article';
  const deferredStableUrl = createDeferred();

  chrome.tabs.get.mockImplementation(async tabId => {
    const tabUrls = {
      701: 'https://stale.example.com/raw',
      702: 'https://fresh.example.com/raw',
    };
    return { id: tabId, url: tabUrls[tabId] || 'https://fallback.example.com' };
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

  chrome.storage.local.get.mockImplementation(async key =>
    resolveRaceStorageLookup(key, { freshStableUrl, staleStableUrl })
  );

  return { deferredStableUrl, freshStableUrl, staleStableUrl };
}

function resolveRaceStorageLookup(key, { freshStableUrl, staleStableUrl }) {
  if (!Array.isArray(key)) {
    return {};
  }
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

async function runStaleThenFreshTabLoads(onActivated, deferredStableUrl, staleStableUrl) {
  const staleLoad = onActivated({ tabId: 701 });
  await Promise.resolve();
  const freshLoad = onActivated({ tabId: 702 });
  await freshLoad;

  deferredStableUrl.resolve({ stableUrl: staleStableUrl });
  await staleLoad;
}

function getLastArrayStorageLookupKeys() {
  const keyedGetCalls = chrome.storage.local.get.mock.calls.filter(([arg]) => Array.isArray(arg));
  return keyedGetCalls.at(-1)?.[0] || [];
}

async function activateTabAndFlush(tabId) {
  const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
  await onActivated({ tabId });
  await flushMicrotasks();
}

function mockStorageGetFromStore(store) {
  chrome.storage.local.get.mockImplementation(async key => {
    if (typeof key === 'string') {
      return { [key]: store[key] };
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

describe('Sidepanel current view', () => {
  beforeEach(async () => {
    await loadSidepanelForCurrentView();
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

    it('應該為開始標註按鈕顯式設定 type="button"', () => {
      const sidepanelHtmlPath = path.resolve(process.cwd(), 'pages/sidepanel/sidepanel.html');
      const sidepanelHtml = fs.readFileSync(sidepanelHtmlPath, 'utf8');
      const doc = new DOMParser().parseFromString(sidepanelHtml, 'text/html');
      const startHighlightButton = doc.querySelector('#start-highlight-button');

      expect(startHighlightButton).not.toBeNull();
      expect(startHighlightButton?.getAttribute('type')).toBe('button');
    });

    it('狀態訊息應使用 output live region 而非 status role', () => {
      const sidepanelHtmlPath = path.resolve(process.cwd(), 'pages/sidepanel/sidepanel.html');
      const sidepanelHtml = fs.readFileSync(sidepanelHtmlPath, 'utf8');
      const doc = new DOMParser().parseFromString(sidepanelHtml, 'text/html');
      const statusMessage = doc.querySelector('#status-message');

      expect(statusMessage).not.toBeNull();
      expect(statusMessage?.tagName).toBe('OUTPUT');
      expect(statusMessage?.getAttribute('role')).toBeNull();
      expect(statusMessage?.getAttribute('aria-live')).toBe('polite');
      expect(statusMessage?.getAttribute('aria-atomic')).toBe('true');
    });
  });

  describe('Unsaved Page Notice Banner', () => {
    it('在頁面未保存時（預設初始狀態），提示 banner 應為可見，且文字正確', async () => {
      const notice = document.querySelector('#unsaved-page-notice');
      expect(notice.hidden).toBe(false);
      expect(notice.textContent).toBe('此頁尚未保存至 Notion');
    });

    it('在頁面已保存時，提示 banner 應為隱藏', async () => {
      // 模擬已保存頁面的載入與 storage 回傳
      const stableUrl = 'https://example.com/stable';
      const originalTabUrl = 'https://example.com/original';

      normalizeUrl.mockImplementation(url => url);
      chrome.tabs.get.mockResolvedValueOnce({ id: 201, url: originalTabUrl });
      chrome.tabs.sendMessage.mockResolvedValueOnce({ stableUrl });

      const fakeStore = {
        [`page_${originalTabUrl}`]: {
          notion: { pageId: 'page-123' },
        },
      };

      chrome.storage.local.get.mockImplementation(k => {
        if (Array.isArray(k)) {
          const result = {};
          for (const key of k) {
            if (key in fakeStore) {
              result[key] = fakeStore[key];
            }
          }
          return result;
        }
        return fakeStore;
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 201 });
      await flushMicrotasks();

      const notice = document.querySelector('#unsaved-page-notice');
      expect(notice.hidden).toBe(true);
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

    it.each([
      {
        name: '[REGRESSION] 切換到不支援的分頁時應隱藏未保存 banner 並停用 sync 按鈕',
        setupTabLoad() {
          chrome.tabs.get.mockResolvedValue({ id: 301, url: 'chrome://extensions' });
        },
        tabId: 301,
        expectedNoticeText: '',
      },
      {
        name: '[REGRESSION] loadCurrentTab 失敗時應隱藏 banner 而非殘留先前狀態',
        setupTabLoad() {
          chrome.tabs.get.mockRejectedValueOnce(new Error('boom'));
        },
        tabId: 302,
      },
    ])('$name', async ({ setupTabLoad, tabId, expectedNoticeText }) => {
      // 預設初始狀態 banner 為可見（未保存）
      expect(document.querySelector('#unsaved-page-notice').hidden).toBe(false);

      setupTabLoad();
      await activateTabAndFlush(tabId);

      const notice = document.querySelector('#unsaved-page-notice');
      const syncButton = document.querySelector('#sync-button');
      expect(notice.hidden).toBe(true);
      if (expectedNoticeText !== undefined) {
        expect(notice.textContent).toBe(expectedNoticeText);
      }
      expect(syncButton.disabled).toBe(true);
    });

    it('[REGRESSION] 切換到不支援的分頁時應停用並清空 Open in Notion 按鈕', async () => {
      const stableUrl = 'https://example.js/stable';
      const originalTabUrl = 'https://example.js/saved-page';

      chrome.tabs.get.mockResolvedValueOnce({ id: 299, url: originalTabUrl });
      chrome.tabs.sendMessage.mockResolvedValueOnce({ stableUrl });
      chrome.storage.local.get.mockImplementation(async key => {
        if (Array.isArray(key)) {
          return {
            [`page_${stableUrl}`]: {
              notion: { pageId: 'saved-page-123' },
              highlights: [],
            },
          };
        }
        return {};
      });

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 299 });
      await flushMicrotasks();

      const openNotionButton = document.querySelector('#open-notion-button');
      expect(openNotionButton.style.display).toBe('inline-flex');
      expect(openNotionButton.disabled).toBe(false);
      expect(openNotionButton.dataset.targetUrl).toBe(originalTabUrl);

      chrome.tabs.get.mockResolvedValueOnce({ id: 300, url: 'chrome://extensions' });
      await onActivated({ tabId: 300 });
      await flushMicrotasks();

      expect(openNotionButton.style.display).toBe('none');
      expect(openNotionButton.disabled).toBe(true);
      expect(openNotionButton.dataset.targetUrl).toBeUndefined();
      expect(openNotionButton.title).toBe('');
      expect(openNotionButton.getAttribute('aria-label')).toBeNull();
    });

    it('[REGRESSION] malformed tab URLs should be treated as unsupported pages', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 303, url: 'https://[malformed' });
      chrome.tabs.sendMessage.mockClear();
      Logger.error.mockClear();

      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      await onActivated({ tabId: 303 });
      await flushMicrotasks();

      const emptyP = document.querySelector('#empty-state p');
      expect(emptyP.textContent).toBe('不支援此頁面');
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalledWith(
        '[SidePanel] Failed to load tab',
        expect.any(Object)
      );
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
      expect(document.querySelector('#sync-button').disabled).toBe(true);
    });

    it('sync button 在頁面未保存時應禁用並顯示提示', async () => {
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

      // Phase 1: 未保存頁面 sync 按鈕禁用
      expect(document.querySelector('#sync-button').disabled).toBe(true);
      expect(document.querySelector('#sync-button').title).toBe(
        UI_MESSAGES.SIDEPANEL.PAGE_NOT_SAVED
      );
    });

    it.each([
      {
        name: '若 direct keys 找不到，應透過 alias 解析 page_* 前綴',
        store: {
          'page_https://example.com/alias': {
            highlights: [{ id: '1', text: 'alias text', color: 'blue' }],
            notion: { pageId: 'resolved' },
          },
          'url_alias:https://example.js/stable': 'https://example.com/alias',
        },
        isSyncDisabled: false,
      },
      {
        name: '若 page_* 找不到，應透過 alias 解析 highlights_* 前綴',
        store: {
          'highlights_https://example.com/alias': {
            highlights: [{ id: '1', text: 'alias old text', color: 'red' }],
          },
          'url_alias:https://example.js/stable': 'https://example.com/alias',
        },
        isSyncDisabled: true,
      },
    ])('$name', async ({ store, isSyncDisabled }) => {
      mockStorageGetFromStore(store);

      await activateTabAndFlush(500);

      expect(document.querySelector('#highlights-list').children).toHaveLength(1);
      expect(document.querySelector('#sync-button').disabled).toBe(isSyncDisabled);
    });

    it('若 alias 解析未命中任何資料，應顯示 empty state', async () => {
      const fakeStore = {
        'url_alias:https://example.js/stable': 'https://example.com/empty-alias',
      };
      mockStorageGetFromStore(fakeStore);

      await activateTabAndFlush(500);

      expect(document.querySelector('#empty-state').style.display).toBe('flex');
    });

    // ─── Step 0.4 Alignment Tests ─────────────────────────────────────────────
    // 驗證：sidepanel 的查找路徑與 HighlightStorageGateway.loadHighlights() 一致。
    // 使用同一個 shortlink/permalink regression fixture。
    it('[ALIGNMENT] 當 page_<stableUrl> 缺資料時，sidepanel 應回退讀取 page_<originalUrl>', async () => {
      const stableUrl = 'https://example.js/stable';
      const originalTabUrl = 'https://example.js/original-permalink?utm_source=test#frag';
      const normalizedOriginalUrl = 'https://example.js/original-permalink';

      normalizeUrl.mockImplementation(url =>
        url === originalTabUrl ? normalizedOriginalUrl : url
      );
      chrome.tabs.get.mockResolvedValueOnce({ id: 500, url: originalTabUrl });
      chrome.tabs.sendMessage.mockResolvedValueOnce({ stableUrl });

      const fakeStore = {
        [`page_${normalizedOriginalUrl}`]: {
          highlights: [{ id: '1', text: 'alignment test', color: 'blue' }],
          notion: { pageId: 'page-align' },
        },
      };

      chrome.storage.local.get.mockClear();
      mockStorageGetFromStore(fakeStore);

      await activateTabAndFlush(500);

      const highlightsList = document.querySelector('#highlights-list');
      const emptyState = document.querySelector('#empty-state');
      const syncButton = document.querySelector('#sync-button');

      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        expect.arrayContaining([
          `page_${stableUrl}`,
          `page_${normalizedOriginalUrl}`,
          `highlights_${stableUrl}`,
          `highlights_${normalizedOriginalUrl}`,
        ])
      );
      expect(highlightsList.children).toHaveLength(1);
      expect(emptyState.style.display).toBe('none');
      expect(syncButton.dataset.targetUrl).toBe(normalizedOriginalUrl);
    });

    it('[REGRESSION] dual-write/migration 情境中應先命中 page_<originalUrl>，不可被 highlights_<stableUrl> 搶先', async () => {
      const stableUrl = 'https://example.js/stable';
      const originalTabUrl = 'https://example.js/original-permalink';
      const normalizedOriginalUrl = 'https://example.js/original-permalink';

      normalizeUrl.mockImplementation(url => url);
      chrome.tabs.get.mockResolvedValueOnce({ id: 500, url: originalTabUrl });
      chrome.tabs.sendMessage.mockResolvedValueOnce({ stableUrl });

      const fakeStore = {
        [`url_alias:${normalizedOriginalUrl}`]: stableUrl,
        [`page_${normalizedOriginalUrl}`]: {
          highlights: [{ id: 'page-first', text: 'page wins', color: 'blue' }],
          notion: { pageId: 'page-align' },
        },
        [`highlights_${stableUrl}`]: [{ id: 'legacy-second', text: 'legacy loses', color: 'red' }],
      };

      chrome.storage.local.get.mockClear();
      mockStorageGetFromStore(fakeStore);

      await activateTabAndFlush(500);

      const renderedTexts = Array.from(document.querySelectorAll('.highlight-text')).map(el =>
        el.textContent?.trim()
      );
      const syncButton = document.querySelector('#sync-button');

      expect(renderedTexts).toEqual(['page wins']);
      expect(renderedTexts).not.toContain('legacy loses');
      expect(syncButton.dataset.targetUrl).toBe(normalizedOriginalUrl);
    });

    it('[REGRESSION] page-only / zero-highlights 已保存頁面仍應顯示 Open in Notion', async () => {
      const stableUrl = 'https://example.js/stable';
      const originalTabUrl = 'https://example.js/page-without-highlights';

      chrome.tabs.get.mockResolvedValueOnce({ id: 500, url: originalTabUrl });
      chrome.tabs.sendMessage.mockResolvedValueOnce({ stableUrl });

      const fakeStore = {
        [`page_${stableUrl}`]: {
          highlights: [],
          notion: { pageId: 'page-only-123' },
        },
      };

      chrome.storage.local.get.mockClear();
      mockStorageGetFromStore(fakeStore);

      await activateTabAndFlush(500);

      const emptyState = document.querySelector('#empty-state');
      const openNotionButton = document.querySelector('#open-notion-button');
      const syncButton = document.querySelector('#sync-button');

      expect(emptyState.style.display).toBe('flex');
      expect(syncButton.disabled).toBe(false);
      expect(openNotionButton.style.display).toBe('inline-flex');
      expect(openNotionButton.dataset.targetUrl).toBe(originalTabUrl);
    });

    it('[REGRESSION] resolvedKey 未命中 highlights 時仍應依 lookupOrder 找到 page-only Notion 狀態', async () => {
      const stableUrl = 'https://example.js/stable';
      const originalTabUrl = 'https://example.js/original-page';
      const aliasUrl = 'https://example.js/canonical-page';

      normalizeUrl.mockImplementation(url => url);
      chrome.tabs.get.mockResolvedValueOnce({ id: 501, url: originalTabUrl });
      chrome.tabs.sendMessage.mockResolvedValueOnce({ stableUrl });

      const fakeStore = {
        [`url_alias:${stableUrl}`]: aliasUrl,
        [`page_${aliasUrl}`]: {
          notion: { pageId: 'page-only-alias-123' },
        },
      };

      chrome.storage.local.get.mockClear();
      mockStorageGetFromStore(fakeStore);

      await activateTabAndFlush(501);

      const openNotionButton = document.querySelector('#open-notion-button');

      expect(openNotionButton.style.display).toBe('inline-flex');
      expect(openNotionButton.dataset.targetUrl).toBe(originalTabUrl);
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
        expect.objectContaining({
          action: 'refreshUnsyncedBadge',
          result: 'failure',
          error,
        }),
      ]);
    });

    it('should not overwrite cached tab urls with stale loadCurrentTab results', async () => {
      const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0][0];
      const onStorageChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      const { deferredStableUrl, freshStableUrl, staleStableUrl } = setupStaleCurrentTabRace();

      chrome.storage.local.get.mockClear();
      await runStaleThenFreshTabLoads(onActivated, deferredStableUrl, staleStableUrl);

      chrome.storage.local.get.mockClear();
      onStorageChanged({ 'highlights_https://fresh.example.com/raw': { newValue: {} } }, 'local');
      await Promise.resolve();
      await Promise.resolve();

      const lastKeys = getLastArrayStorageLookupKeys();

      expect(lastKeys).toContain(`page_${freshStableUrl}`);
      expect(lastKeys).not.toContain(`page_${staleStableUrl}`);
    });
  });
});
