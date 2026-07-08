/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  error: jest.fn(),
  warn: jest.fn(),
};
const normalizeUrlMock = jest.fn(url => String(url || '').replace(/#.*$/, ''));

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => ({
  computeStableUrl: jest.fn(url => String(url || '').replace(/#.*$/, '')),
  isRootUrl: jest.fn(url => {
    try {
      const parsed = new URL(url);
      return parsed.pathname === '/' || parsed.pathname === '';
    } catch {
      return false;
    }
  }),
  normalizeUrl: normalizeUrlMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: jest.fn(error => error?.message || String(error || 'UNKNOWN_ERROR')),
}));

await jest.unstable_mockModule('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    formatUserMessage: jest.fn(error => String(error || 'UNKNOWN_ERROR')),
  },
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

await jest.unstable_mockModule('../../../../scripts/utils/keyOrdering.js', () => ({
  compareKeysAlphabetically: (left, right) => String(left).localeCompare(String(right)),
}));

await jest.unstable_mockModule('../../../../scripts/highlighter/core/HighlightLookupResolver.js', () => ({
  getAliasLookupKeys: (url, original) => [`url_alias:${url}`, `url_alias:${original}`],
  pickAliasCandidate: (data, url) => data[`url_alias:${url}`] || null,
  pickHighlightsFromStorage: jest.fn(() => []),
  resolveKeys: (url, alias) => {
    const canonicalUrl = alias || url;
    return {
      canonicalUrl,
      legacyCleanupKeys: [`highlights_${url}`],
      legacyKeys: [`highlights_${canonicalUrl}`, `highlights_${url}`],
      lookupOrder: [`page_${canonicalUrl}`, `page_${url}`, `highlights_${canonicalUrl}`, `highlights_${url}`],
      mutationTargetKey: `page_${canonicalUrl}`,
      pageKeys: [`page_${canonicalUrl}`, `page_${url}`],
    };
  },
}));

const sidepanelUI = await import('../../../../pages/sidepanel/sidepanelUI.js');
const transforms = await import('../../../../pages/sidepanel/sidepanel-data-transforms.js');
const storage = await import('../../../../pages/sidepanel/sidepanel-storage.js');
const currentView = await import('../../../../pages/sidepanel/sidepanel-current-view.js');
const unsyncedView = await import('../../../../pages/sidepanel/sidepanel-unsynced-view.js');

function installChrome(storageSnapshot = {}) {
  globalThis.chrome = {
    runtime: {
      sendMessage: jest.fn(async () => ({ success: true })),
    },
    storage: {
      local: {
        get: jest.fn(async keys => {
          if (keys === null) {
            return storageSnapshot;
          }
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(key => [key, storageSnapshot[key]]));
          }
          return { [keys]: storageSnapshot[keys] };
        }),
        remove: jest.fn(async () => {}),
        set: jest.fn(async patch => Object.assign(storageSnapshot, patch)),
      },
      onChanged: { addListener: jest.fn() },
    },
    tabs: {
      create: jest.fn(async ({ url }) => ({ id: 10, url })),
      get: jest.fn(async id => ({ id, url: 'https://example.com/article#section' })),
      onActivated: { addListener: jest.fn() },
      onUpdated: { addListener: jest.fn() },
      query: jest.fn(async () => [{ id: 7, url: 'https://example.com/article#section' }]),
      sendMessage: jest.fn(async () => ({ stableUrl: 'https://example.com/article' })),
    },
  };
}

function renderSidepanelDom() {
  document.body.innerHTML = `
    <div id="loading-state"><p></p></div>
    <div id="empty-state"><p></p><span class="subtitle"></span></div>
    <div id="highlights-list"></div>
    <button id="sync-button"></button>
    <button id="open-notion-button"></button>
    <button id="start-highlight-button"></button>
    <div id="status-message"></div>
    <div id="unsaved-page-notice" hidden></div>
    <div id="unsynced-view"></div>
    <button class="view-tab active" data-view="current"></button>
    <button class="view-tab" data-view="unsynced"></button>
    <button id="load-more-btn"></button>
    <span id="unsynced-badge"></span>
    <div id="unsynced-toolbar"></div>
    <span id="unsynced-count-label"></span>
    <button id="clear-all-btn"></button>
    <template id="highlight-card-template">
      <article class="highlight-card">
        <span class="highlight-color-indicator"></span>
        <p class="highlight-text"></p>
        <button class="delete-button"></button>
      </article>
    </template>
    <template id="page-card-template">
      <article class="page-card">
        <h2 class="page-title"></h2>
        <span class="page-meta"></span>
        <div class="page-card-previews"></div>
        <span class="page-card-remaining"></span>
        <button class="page-open-button"></button>
        <button class="page-delete-button"></button>
      </article>
    </template>
  `;
}

beforeEach(() => {
  document.body.innerHTML = '';
  installChrome({
    'page_https://example.com/article': {
      highlights: [
        { id: 'h1', text: 'Native sidepanel highlight', color: 'blue' },
        { id: 'h2', text: 'Second highlight', color: 'red' },
      ],
      metadata: { title: 'Article', lastUpdated: 2 },
      notion: null,
    },
    'url_alias:https://example.com/original': 'https://example.com/article',
  });
});

afterEach(() => {
  jest.clearAllMocks();
  delete globalThis.chrome;
});

describe('sidepanel native ESM diagnostics', () => {
  test('sidepanelUI renders current and unsynced views with native DOM helpers', () => {
    renderSidepanelDom();
    const elements = sidepanelUI.getElements();

    sidepanelUI.applyUnsavedPageNotice(elements, false);
    expect(elements.unsavedPageNotice.hidden).toBe(false);
    expect(sidepanelUI.extractDomain('https://example.com/article')).toBe('example.com');

    sidepanelUI.renderList(
      elements,
      [{ id: 'h1', text: 'Native sidepanel highlight', color: 'blue' }],
      'page_https://example.com/article',
      jest.fn()
    );
    expect(elements.highlightsList.querySelectorAll('.highlight-card')).toHaveLength(1);

    sidepanelUI.switchView(elements, 'unsynced');
    expect(elements.unsyncedView.style.display).toBe('block');

    const rendered = sidepanelUI.appendCards({
      elements,
      pages: [
        {
          highlightCount: 4,
          previewHighlights: sidepanelUI.buildPreviewHighlights([
            { text: 'A'.repeat(100), color: 'green' },
          ]),
          remainingCount: 1,
          storageKey: 'page_https://example.com/article',
          title: 'Article',
          url: 'https://example.com/article',
        },
      ],
      startIndex: 0,
      count: 1,
      callbacks: { onDelete: jest.fn(), onOpen: jest.fn() },
    });
    expect(rendered).toBe(1);
    expect(elements.unsyncedView.querySelector('.page-title').textContent).toBe('Article');
  });

  test('sidepanel transforms and storage helpers resolve unsynced ownership and cleanup keys', async () => {
    const pageKey = 'page_https://example.com/article';
    const snapshot = {
      [pageKey]: {
        highlights: [{ id: 'h1', text: 'Native', color: 'yellow' }],
        metadata: { title: 'Article', lastUpdated: 3 },
        notion: null,
      },
      'highlights_https://example.com/legacy': [{ id: 'h2', text: 'Legacy' }],
      'url_alias:https://example.com/original': 'https://example.com/article',
    };

    expect(transforms.normalizeStorageSnapshot(null)).toEqual({});
    expect(transforms.buildPageEntry(pageKey, 'https://example.com/article', snapshot[pageKey])).toMatchObject({
      highlightCount: 1,
      storageKey: pageKey,
      title: 'Article',
    });

    const owners = transforms.resolveUnsyncedOwnership(snapshot);
    expect(owners.get('https://example.com/article')).toMatchObject({
      ownerKey: pageKey,
      format: 'page',
    });

    expect(storage._extractUrlFromStorageKey(pageKey)).toBe('https://example.com/article');
    await expect(storage.checkSavedData(null, pageKey)).resolves.toBe(false);
    expect(
      storage._computeDeleteResult(
        { highlights: [{ id: 'keep' }, { id: 'remove' }], notion: { pageId: 'notion-page' } },
        'remove',
        pageKey
      )
    ).toMatchObject({
      shouldRemove: false,
      newData: { highlights: [{ id: 'keep' }] },
    });
    await storage._removeStorageKeyWithCanonicalCleanup(pageKey);
    expect(globalThis.chrome.storage.local.remove).toHaveBeenCalled();
  });

  test('sidepanel current and unsynced view controllers execute request guards and fallback UI', async () => {
    renderSidepanelDom();
    const context = {
      applySyncButtonSavedState: jest.fn(),
      cachedUnsyncedPages: [],
      currentActiveView: 'unsynced',
      displayedCardCount: 0,
      els: sidepanelUI.getElements(),
      targetKey: null,
      targetUrl: null,
      unsyncedViewRequestId: 0,
      viewRequestId: 0,
    };

    const currentRequest = currentView.beginCurrentViewRequest(context);
    expect(currentView.isCurrentViewRequestActive(context, currentRequest)).toBe(false);

    currentView.applyCurrentPageTargets(context, 'https://example.com/article', 'https://example.com/original', true);
    expect(context.els.syncButton.dataset.targetUrl).toBe('https://example.com/article');
    expect(context.els.openNotionButton.dataset.targetUrl).toBe('https://example.com/original');
    currentView.renderCurrentEmptyState(context, false);
    expect(context.els.emptyState.style.display).toBe('flex');
    currentView.renderCurrentHighlightList(
      context,
      [{ id: 'h1', text: 'Native', color: 'yellow' }],
      'page_https://example.com/article',
      true
    );
    expect(context.els.highlightsList.querySelectorAll('.highlight-card')).toHaveLength(1);

    const unsyncedRequest = unsyncedView.beginUnsyncedViewRequest(context);
    expect(unsyncedView.isUnsyncedViewRequestActive(context, unsyncedRequest)).toBe(true);
    await unsyncedView.refreshUnsyncedBadge(context);
    expect(context.els.unsyncedBadge.textContent).toBe('1');
    await unsyncedView.renderUnsyncedView(context, '[Native ESM] render unsynced', unsyncedRequest);
    expect(context.cachedUnsyncedPages).toHaveLength(1);
    unsyncedView.renderUnsyncedFallbackState(context, '載入失敗');
    expect(context.els.unsyncedView.textContent).toContain('載入失敗');
  });

  test('sidepanel entry module can be imported after native ESM mocks are installed', async () => {
    renderSidepanelDom();

    await import('../../../../pages/sidepanel/sidepanel.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(globalThis.chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(globalThis.chrome.storage.onChanged.addListener).toHaveBeenCalled();
  });
});
